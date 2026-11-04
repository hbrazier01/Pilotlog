/**
 * sessions.mjs — server-side, revocable sessions (accounts v2, scoping doc §2.3 / PR-2).
 *
 * - Token: 32 random bytes (base64url), returned once to set the cookie. Only sha256(token) is stored.
 * - Absolute expiry (default 30 d) + idle timeout (default 7 d), both enforced in SQL.
 * - rotateSession(): issue a new token and revoke the old one (call on sign-in, link, merge, email change).
 * - revokeSession() / revokeAllSessions() for sign-out and "sign out everywhere".
 */
import { randomToken, sha256Hex, looksLikeToken } from "./crypto.mjs";
import { writeAudit, hashIp } from "./audit.mjs";
import { isValidStudentId } from "./ids.mjs";

const DAY = 24 * 60 * 60 * 1000;
export const SESSION_DEFAULTS = Object.freeze({ absoluteMs: 30 * DAY, idleMs: 7 * DAY, touchEveryMs: 5 * 60 * 1000 });

function config(env = process.env) {
  const n = (v, d) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : d);
  return {
    absoluteMs: n(env.PILOTLOG_SESSION_ABSOLUTE_MS, SESSION_DEFAULTS.absoluteMs),
    idleMs: n(env.PILOTLOG_SESSION_IDLE_MS, SESSION_DEFAULTS.idleMs),
    touchEveryMs: SESSION_DEFAULTS.touchEveryMs,
  };
}

/** Create a session. Returns { token, idHash, expiresAt }. The token is never persisted. */
export async function createSession(db, { studentId, ua = null, ip = null, reason = "signin", absoluteMs } = {}) {
  if (!isValidStudentId(studentId)) throw new Error("createSession: invalid studentId");
  const cfg = config();
  const token = randomToken();
  const idHash = sha256Hex(token);
  const ms = absoluteMs ?? cfg.absoluteMs;
  const { rows } = await db.query(
    `INSERT INTO sessions (id_hash, student_id, expires_at, ua, ip_hash)
     VALUES ($1, $2, now() + ($3::bigint * interval '1 millisecond'), $4, $5) RETURNING expires_at`,
    [idHash, studentId, ms, ua ? String(ua).slice(0, 256) : null, hashIp(ip)]
  );
  await writeAudit(db, { event: "session_create", studentId, detail: { reason }, ip, ua });
  return { token, idHash, expiresAt: rows[0].expires_at };
}

/**
 * Look up a live session by raw token. Returns { idHash, studentId, createdAt, lastSeenAt, expiresAt } or null.
 * Rejects revoked, absolutely-expired, idle-expired, merged/deleted-student sessions. Touches last_seen_at
 * at most every 5 minutes.
 */
export async function loadSession(db, token) {
  if (!looksLikeToken(token)) return null;
  const cfg = config();
  const idHash = sha256Hex(token);
  const { rows } = await db.query(
    `SELECT s.id_hash, s.student_id, s.created_at, s.last_seen_at, s.expires_at
       FROM sessions s JOIN students st ON st.id = s.student_id
      WHERE s.id_hash = $1 AND s.revoked_at IS NULL AND s.expires_at > now()
        AND s.last_seen_at > now() - ($2::bigint * interval '1 millisecond')
        AND st.status = 'active'`,
    [idHash, cfg.idleMs]
  );
  if (!rows.length) return null;
  const r = rows[0];
  if (Date.now() - new Date(r.last_seen_at).getTime() > cfg.touchEveryMs) {
    await db.query("UPDATE sessions SET last_seen_at = now() WHERE id_hash = $1 AND revoked_at IS NULL", [idHash]);
  }
  return { idHash, studentId: r.student_id, createdAt: r.created_at, lastSeenAt: r.last_seen_at, expiresAt: r.expires_at };
}

/** Revoke one session by raw token or idHash. Returns true if a live session was revoked. */
export async function revokeSession(db, { token, idHash, reason = "signout", ip = null, ua = null } = {}) {
  const h = idHash ?? (looksLikeToken(token) ? sha256Hex(token) : null);
  if (!h) return false;
  const { rows } = await db.query(
    `UPDATE sessions SET revoked_at = now(), revoke_reason = $2
      WHERE id_hash = $1 AND revoked_at IS NULL RETURNING student_id`,
    [h, reason]
  );
  if (!rows.length) return false;
  await writeAudit(db, { event: "session_revoke", studentId: rows[0].student_id, detail: { reason }, ip, ua });
  return true;
}

/** Revoke every live session for a student (optionally keeping one). Returns the count revoked. */
export async function revokeAllSessions(db, studentId, { exceptIdHash = null, reason = "signout_all", ip = null, ua = null } = {}) {
  const r = await db.query(
    `UPDATE sessions SET revoked_at = now(), revoke_reason = $3
      WHERE student_id = $1 AND revoked_at IS NULL AND ($2::text IS NULL OR id_hash <> $2)`,
    [studentId, exceptIdHash, reason]
  );
  await writeAudit(db, { event: "session_revoke_all", studentId, detail: { reason, count: r.rowCount }, ip, ua });
  return r.rowCount;
}

/**
 * Rotate: create a fresh session for the same student and revoke the old one atomically.
 * Call on any privilege change (sign-in, identity link/unlink, merge, email change).
 * Returns the new { token, idHash, expiresAt } or null if the old session is not live.
 */
export async function rotateSession(db, oldToken, { reason = "privilege_change", ip = null, ua = null } = {}) {
  const isPool = typeof db.totalCount === "number";
  const client = isPool ? await db.connect() : db;
  try {
    await client.query("BEGIN");
    const old = await loadSession(client, oldToken);
    if (!old) { await client.query("ROLLBACK"); return null; }
    const { rowCount } = await client.query(
      `UPDATE sessions SET revoked_at = now(), revoke_reason = 'rotated' WHERE id_hash = $1 AND revoked_at IS NULL`,
      [old.idHash]
    );
    if (rowCount !== 1) { await client.query("ROLLBACK"); return null; } // lost a race with another rotate/revoke
    const fresh = await createSession(client, { studentId: old.studentId, ip, ua, reason: `rotate:${reason}` });
    await client.query("UPDATE sessions SET rotated_to = $2 WHERE id_hash = $1", [old.idHash, fresh.idHash]);
    await writeAudit(client, { event: "session_rotate", studentId: old.studentId, detail: { reason }, ip, ua });
    await client.query("COMMIT");
    return fresh;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    if (isPool) client.release();
  }
}

/** Delete sessions that expired or were revoked more than `graceMs` ago. Returns rows deleted. */
export async function cleanupSessions(db, { graceMs = 7 * DAY } = {}) {
  const r = await db.query(
    `DELETE FROM sessions
      WHERE expires_at < now() - ($1::bigint * interval '1 millisecond')
         OR revoked_at < now() - ($1::bigint * interval '1 millisecond')`,
    [graceMs]
  );
  return r.rowCount;
}
