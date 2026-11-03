/**
 * challenges.mjs — DB-backed, single-use auth challenges (replaces PR #11's in-memory nonce Map).
 *
 * - Nonce: 32 random bytes (base64url), returned once to the caller. Only sha256(nonce) is stored.
 * - Bound to a purpose/intent and a subject (and optionally a student for link/merge intents).
 * - consumeChallenge() is one atomic UPDATE … WHERE consumed_at IS NULL AND expires_at > now() RETURNING,
 *   so exactly one concurrent caller can win. The nonce is burned even if purpose/subject then mismatch,
 *   so a wrong-intent replay can't be retried.
 */
import { randomToken, sha256Hex, looksLikeToken } from "./crypto.mjs";
import { writeAudit } from "./audit.mjs";
import { CHALLENGE_PURPOSES } from "./schemaV2.mjs";

export { CHALLENGE_PURPOSES };
const MIN = 60 * 1000;
export const DEFAULT_TTL_MS = Object.freeze({
  "sign-in": 5 * MIN, "link-wallet": 5 * MIN, merge: 10 * MIN,
  "email-magic-link": 15 * MIN, "webauthn-register": 5 * MIN, "webauthn-auth": 5 * MIN,
});

/** Issue a challenge. Returns { nonce, expiresAt }. */
export async function issueChallenge(db, { purpose, subject, studentId = null, payload = {}, ttlMs, ip = null, ua = null }) {
  if (!CHALLENGE_PURPOSES.includes(purpose)) throw new Error(`issueChallenge: unknown purpose ${purpose}`);
  if (typeof subject !== "string" || !subject || subject.length > 512) throw new Error("issueChallenge: subject required");
  const nonce = randomToken();
  const ms = ttlMs ?? DEFAULT_TTL_MS[purpose];
  const { rows } = await db.query(
    `INSERT INTO auth_challenges (id_hash, purpose, subject, student_id, payload, expires_at)
     VALUES ($1, $2, $3, $4, $5, now() + ($6::bigint * interval '1 millisecond')) RETURNING expires_at`,
    [sha256Hex(nonce), purpose, subject, studentId, JSON.stringify(payload), ms]
  );
  await writeAudit(db, { event: "challenge_issue", studentId, subject, detail: { purpose }, ip, ua });
  return { nonce, expiresAt: rows[0].expires_at };
}

/**
 * Consume a challenge exactly once. Returns { ok: true, purpose, subject, studentId, payload }
 * or { ok: false, reason } where reason ∈ invalid | not_found_or_used_or_expired | purpose_mismatch |
 * subject_mismatch | student_mismatch.
 */
export async function consumeChallenge(db, { nonce, purpose, subject, studentId, ip = null, ua = null }) {
  const fail = async (reason, extra = {}) => {
    await writeAudit(db, { event: "challenge_fail", studentId: extra.studentId ?? studentId ?? null, subject,
      detail: { purpose, reason }, ip, ua });
    return { ok: false, reason };
  };
  if (!looksLikeToken(nonce)) return fail("invalid");
  const { rows } = await db.query(
    `UPDATE auth_challenges SET consumed_at = now()
      WHERE id_hash = $1 AND consumed_at IS NULL AND expires_at > now()
      RETURNING purpose, subject, student_id, payload`,
    [sha256Hex(nonce)]
  );
  if (!rows.length) return fail("not_found_or_used_or_expired");
  const c = rows[0];
  if (c.purpose !== purpose) return fail("purpose_mismatch", { studentId: c.student_id });
  if (subject !== undefined && c.subject !== subject) return fail("subject_mismatch", { studentId: c.student_id });
  if (studentId !== undefined && (c.student_id ?? null) !== (studentId ?? null)) return fail("student_mismatch", { studentId: c.student_id });
  await writeAudit(db, { event: "challenge_consume", studentId: c.student_id, subject: c.subject, detail: { purpose }, ip, ua });
  return { ok: true, purpose: c.purpose, subject: c.subject, studentId: c.student_id, payload: c.payload };
}

/** Delete challenges that expired or were consumed more than `graceMs` ago. Returns rows deleted. */
export async function cleanupChallenges(db, { graceMs = 60 * MIN } = {}) {
  const r = await db.query(
    `DELETE FROM auth_challenges
      WHERE expires_at < now() - ($1::bigint * interval '1 millisecond')
         OR consumed_at < now() - ($1::bigint * interval '1 millisecond')`,
    [graceMs]
  );
  return r.rowCount;
}
