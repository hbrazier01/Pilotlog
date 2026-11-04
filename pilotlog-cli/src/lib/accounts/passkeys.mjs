/**
 * passkeys.mjs — WebAuthn passkey registration + sign-in (accounts v2, PR-4).
 * Uses @simplewebauthn/server (pinned, see package.json). Challenges are PR-2 auth_challenges
 * (purposes webauthn-register / webauthn-auth, single-use, 5-minute TTL).
 *
 * Challenge binding: the PR-2 nonce IS the WebAuthn challenge (simplewebauthn encodes the string as
 * UTF-8 → base64url). On verify we decode clientDataJSON.challenge back to the nonce and consume it
 * atomically BEFORE touching credentials, so a replayed or unknown challenge always fails first.
 *
 * Storage: one `identities` row per credential (type 'passkey', subject = base64url credential id)
 * plus a `webauthn_credentials` row (public key, sign_count, transports, aaguid, backed_up).
 */
import {
  generateRegistrationOptions, verifyRegistrationResponse,
  generateAuthenticationOptions, verifyAuthenticationResponse,
} from "@simplewebauthn/server";
import { issueChallenge, consumeChallenge } from "./challenges.mjs";
import { writeAudit } from "./audit.mjs";
import { normalizeEmail } from "./magicLink.mjs";

export class PasskeyConfigError extends Error {}
const isProd = (env) => String(env.NODE_ENV || "").trim().toLowerCase() === "production";
const CRED_ID_RE = /^[A-Za-z0-9_-]{16,1366}$/;
const LOGIN_SUBJECT = "passkey-login";

/**
 * Resolve { rpID, origin }. Production: PILOTLOG_RP_ID and an https PILOTLOG_PUBLIC_URL are required,
 * and the origin host must equal the RP ID or be a subdomain of it — otherwise throw (routes answer 503).
 * Dev: defaults to rpID 'localhost' and the request origin, with the same mismatch check.
 */
export function rpConfig(req, env = process.env) {
  const prod = isProd(env);
  const rawUrl = String(env.PILOTLOG_PUBLIC_URL || "").trim();
  const rawRp = String(env.PILOTLOG_RP_ID || "").trim().toLowerCase();
  if (prod && !rawUrl) throw new PasskeyConfigError("PILOTLOG_PUBLIC_URL is required for passkeys in production");
  if (prod && !rawRp) throw new PasskeyConfigError("PILOTLOG_RP_ID is required for passkeys in production");
  let u;
  try { u = new URL(rawUrl || `${req.protocol}://${req.headers.host}`); } catch { throw new PasskeyConfigError("PILOTLOG_PUBLIC_URL is not a valid URL"); }
  if (prod && u.protocol !== "https:") throw new PasskeyConfigError("PILOTLOG_PUBLIC_URL must be https in production");
  const rpID = rawRp || "localhost";
  const host = u.hostname.toLowerCase();
  if (!(host === rpID || host.endsWith("." + rpID))) throw new PasskeyConfigError("PILOTLOG_RP_ID does not match the PILOTLOG_PUBLIC_URL host");
  if (prod && (rpID === "localhost" || /^[0-9.]+$/.test(rpID))) throw new PasskeyConfigError("PILOTLOG_RP_ID must be a real domain in production");
  return { rpID, origin: u.origin, rpName: String(env.PILOTLOG_RP_NAME || "PilotLog") };
}

/** clientDataJSON (base64url) → { challenge nonce, type } without trusting anything else in it. */
export function readClientData(b64) {
  try {
    const cd = JSON.parse(Buffer.from(String(b64), "base64url").toString("utf8"));
    return { nonce: Buffer.from(String(cd.challenge), "base64url").toString("utf8"), challenge: String(cd.challenge), type: cd.type };
  } catch { return null; }
}

async function studentPasskeys(db, studentId) {
  const { rows } = await db.query(
    `SELECT i.id AS identity_id, i.subject AS cred_id, i.metadata, i.created_at, i.last_used_at,
            w.transports, w.aaguid, w.backed_up, w.nickname, w.sign_count
       FROM identities i JOIN webauthn_credentials w ON w.identity_id = i.id
      WHERE i.student_id = $1 AND i.type = 'passkey' ORDER BY i.created_at`, [studentId]);
  return rows;
}

export async function registrationOptions(db, { studentId, rp, ip = null, ua = null }) {
  const existing = await studentPasskeys(db, studentId);
  const { nonce } = await issueChallenge(db, { purpose: "webauthn-register", subject: studentId, studentId, ip, ua });
  return generateRegistrationOptions({
    rpName: rp.rpName, rpID: rp.rpID,
    userID: new TextEncoder().encode(studentId), userName: "PilotLog student", userDisplayName: "PilotLog student",
    challenge: nonce, attestationType: "none", timeout: 5 * 60 * 1000,
    excludeCredentials: existing.map((c) => ({ id: c.cred_id, transports: c.transports || undefined })),
    authenticatorSelection: { residentKey: "required", requireResidentKey: true, userVerification: "preferred" },
    supportedAlgorithmIDs: [-7, -257],
  });
}

/** Returns { ok:true, credentialId } or { ok:false, reason }. */
export async function verifyRegistration(db, { studentId, response, rp, nickname = null, ip = null, ua = null }) {
  const fail = async (reason) => {
    await writeAudit(db, { event: "passkey_register_fail", studentId, identityType: "passkey", detail: { reason }, ip, ua });
    return { ok: false, reason };
  };
  const cd = readClientData(response?.response?.clientDataJSON);
  if (!cd) return fail("malformed");
  const c = await consumeChallenge(db, { nonce: cd.nonce, purpose: "webauthn-register", subject: studentId, studentId, ip, ua });
  if (!c.ok) return fail(`challenge:${c.reason}`);
  let v;
  try {
    v = await verifyRegistrationResponse({ response, expectedChallenge: cd.challenge, expectedOrigin: rp.origin,
      expectedRPID: rp.rpID, requireUserVerification: false, supportedAlgorithmIDs: [-7, -257] });
  } catch (err) { return fail(`verify:${classify(err)}`); }
  if (!v.verified || !v.registrationInfo) return fail("not_verified");
  const { credential, credentialDeviceType, credentialBackedUp, aaguid, userVerified } = v.registrationInfo;
  const transports = Array.isArray(response.response?.transports)
    ? response.response.transports.filter((t) => typeof t === "string" && t.length <= 32).slice(0, 8) : null;
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const ins = await client.query(
      `INSERT INTO identities (student_id, type, subject, verified_at, metadata)
       VALUES ($1, 'passkey', $2, now(), $3) ON CONFLICT (type, subject) DO NOTHING RETURNING id`,
      [studentId, credential.id, JSON.stringify({ source: "webauthn", deviceType: credentialDeviceType,
        backupEligible: credentialDeviceType === "multiDevice", userVerified: !!userVerified })]);
    if (!ins.rows.length) { await client.query("ROLLBACK"); return fail("duplicate_credential"); }
    await client.query(
      `INSERT INTO webauthn_credentials (identity_id, public_key, sign_count, transports, aaguid, backed_up, nickname)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [ins.rows[0].id, Buffer.from(credential.publicKey), credential.counter, transports, aaguid || null,
        !!credentialBackedUp, nickname ? String(nickname).slice(0, 64) : null]);
    await client.query("COMMIT");
  } catch (err) { await client.query("ROLLBACK").catch(() => {}); throw err; } finally { client.release(); }
  await writeAudit(db, { event: "passkey_register", studentId, identityType: "passkey", subject: credential.id,
    detail: { deviceType: credentialDeviceType, backedUp: !!credentialBackedUp }, ip, ua });
  return { ok: true, credentialId: credential.id };
}

/**
 * Usernameless options. The optional email hint never changes the response (no account enumeration):
 * allowCredentials is always empty (all PilotLog passkeys are discoverable); the hint is only bound into
 * the challenge payload and enforced at verify time.
 */
export async function authenticationOptions(db, { rp, email = null, ip = null, ua = null }) {
  const hint = email ? normalizeEmail(email) : null;
  const { nonce } = await issueChallenge(db, { purpose: "webauthn-auth", subject: LOGIN_SUBJECT,
    payload: hint ? { hint } : {}, ip, ua });
  return generateAuthenticationOptions({ rpID: rp.rpID, challenge: nonce, userVerification: "preferred",
    allowCredentials: [], timeout: 5 * 60 * 1000 });
}

function classify(err) {
  const m = String(err?.message || "");
  if (/origin/i.test(m)) return "origin";
  if (/RP ID/i.test(m)) return "rp_id";
  if (/counter/i.test(m)) return "counter";
  if (/challenge/i.test(m)) return "challenge";
  if (/signature/i.test(m)) return "signature";
  return "invalid";
}

/** Returns { ok:true, studentId, credentialId } or { ok:false, reason } (callers show one generic error). */
export async function verifyAuthentication(db, { response, rp, ip = null, ua = null }) {
  const fail = async (reason, studentId = null, event = "passkey_signin_fail") => {
    await writeAudit(db, { event, studentId, identityType: "passkey",
      subject: typeof response?.id === "string" ? response.id : null, detail: { reason }, ip, ua });
    return { ok: false, reason };
  };
  const cd = readClientData(response?.response?.clientDataJSON);
  if (!cd || typeof response?.id !== "string" || !CRED_ID_RE.test(response.id)) return fail("malformed");
  const c = await consumeChallenge(db, { nonce: cd.nonce, purpose: "webauthn-auth", subject: LOGIN_SUBJECT, ip, ua });
  if (!c.ok) return fail(`challenge:${c.reason}`);
  const { rows } = await db.query(
    `SELECT i.id AS identity_id, i.student_id, s.status, w.public_key, w.sign_count, w.transports
       FROM identities i JOIN webauthn_credentials w ON w.identity_id = i.id JOIN students s ON s.id = i.student_id
      WHERE i.type = 'passkey' AND i.subject = $1`, [response.id]);
  if (!rows.length) return fail("unknown_credential");
  const row = rows[0];
  if (row.status !== "active") return fail("student_inactive", row.student_id);
  if (c.payload?.hint) {
    const em = await db.query(`SELECT 1 FROM identities WHERE student_id = $1 AND type = 'email' AND subject = $2`,
      [row.student_id, c.payload.hint]);
    if (!em.rows.length) return fail("hint_mismatch", row.student_id);
  }
  const stored = Number(row.sign_count);
  let v;
  try {
    v = await verifyAuthenticationResponse({ response, expectedChallenge: cd.challenge, expectedOrigin: rp.origin,
      expectedRPID: rp.rpID, requireUserVerification: false,
      credential: { id: response.id, publicKey: new Uint8Array(row.public_key), counter: stored, transports: row.transports || undefined } });
  } catch (err) {
    const r = classify(err);
    return fail(r, row.student_id, r === "counter" ? "passkey_counter_regression" : "passkey_signin_fail");
  }
  if (!v.verified) return fail("not_verified", row.student_id);
  const next = v.authenticationInfo.newCounter;
  // Our own regression check too (defence in depth) + compare-and-swap so two parallel uses can't both win.
  if ((next > 0 || stored > 0) && next <= stored) return fail("counter", row.student_id, "passkey_counter_regression");
  const upd = await db.query(
    `UPDATE webauthn_credentials SET sign_count = $2, backed_up = $3 WHERE identity_id = $1 AND sign_count = $4`,
    [row.identity_id, next, !!v.authenticationInfo.credentialBackedUp, stored]);
  if (upd.rowCount !== 1) return fail("counter_race", row.student_id, "passkey_counter_regression");
  await db.query(`UPDATE identities SET last_used_at = now() WHERE id = $1`, [row.identity_id]);
  await db.query(`UPDATE students SET last_seen_at = now() WHERE id = $1`, [row.student_id]);
  await writeAudit(db, { event: "signin", studentId: row.student_id, identityType: "passkey", subject: response.id,
    detail: { userVerified: !!v.authenticationInfo.userVerified }, ip, ua });
  return { ok: true, studentId: row.student_id, credentialId: response.id };
}

export async function listPasskeys(db, studentId) {
  return (await studentPasskeys(db, studentId)).map((r) => ({
    id: r.cred_id, nickname: r.nickname, createdAt: r.created_at, lastUsedAt: r.last_used_at,
    transports: r.transports || [], aaguid: r.aaguid, backedUp: r.backed_up,
    deviceType: r.metadata?.deviceType ?? null,
  }));
}

/**
 * Delete one of the student's own passkeys. Blocked (reason 'last_method') when it is the student's
 * only sign-in method and they have no verified email. Returns { ok } | { ok:false, reason }.
 */
export async function deletePasskey(db, { studentId, credentialId, ip = null, ua = null }) {
  if (typeof credentialId !== "string" || !CRED_ID_RE.test(credentialId)) return { ok: false, reason: "not_found" };
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", ["pilotlog-methods:" + studentId]);
    const own = await client.query(`SELECT id FROM identities WHERE student_id = $1 AND type = 'passkey' AND subject = $2`,
      [studentId, credentialId]);
    if (!own.rows.length) { await client.query("ROLLBACK"); return { ok: false, reason: "not_found" }; }
    const others = await client.query(
      `SELECT count(*) FILTER (WHERE type = 'email' AND verified_at IS NOT NULL)::int AS verified_email,
              count(*) FILTER (WHERE type <> 'email' AND verified_at IS NOT NULL AND id <> $2)::int AS other_methods
         FROM identities WHERE student_id = $1`, [studentId, own.rows[0].id]);
    const { verified_email, other_methods } = others.rows[0];
    if (verified_email === 0 && other_methods === 0) {
      await client.query("ROLLBACK");
      await writeAudit(db, { event: "passkey_delete_blocked", studentId, identityType: "passkey", subject: credentialId,
        detail: { reason: "last_method" }, ip, ua });
      return { ok: false, reason: "last_method" };
    }
    await client.query(`DELETE FROM identities WHERE id = $1`, [own.rows[0].id]); // cascades webauthn_credentials
    await client.query("COMMIT");
  } catch (err) { await client.query("ROLLBACK").catch(() => {}); throw err; } finally { client.release(); }
  await writeAudit(db, { event: "passkey_delete", studentId, identityType: "passkey", subject: credentialId, ip, ua });
  return { ok: true };
}
