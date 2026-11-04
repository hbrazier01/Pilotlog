/**
 * audit.mjs — append-only security events in auth_audit (accounts v2).
 * Never pass raw tokens, nonces, emails, or addresses: subjects and IPs are stored as
 * salted sha256 hashes, and `detail` is filtered against a deny-list of secret-ish keys.
 */
import { sha256Hex } from "./crypto.mjs";

export const AUDIT_EVENTS = Object.freeze([
  "session_create", "session_rotate", "session_revoke", "session_revoke_all",
  "challenge_issue", "challenge_consume", "challenge_fail",
  // PR-3 email magic link
  "magic_link_request", "magic_link_rate_limited", "magic_link_send_fail", "signup", "signin", "signin_blocked",
  // PR-4 passkeys (WebAuthn)
  "passkey_register", "passkey_register_fail", "passkey_signin_fail", "passkey_counter_regression",
  "passkey_delete", "passkey_delete_blocked",
  // PR-5 wallet identities
  "wallet_signin_fail", "wallet_link", "wallet_link_fail", "wallet_link_conflict", "wallet_claim_legacy",
]);

const SALT = () => process.env.PILOTLOG_AUDIT_SALT || "pilotlog-audit-v1";
const SECRET_KEY_RE = /token|nonce|secret|password|cookie|signature|^sig$/i;

export function hashSubject(subject) {
  return subject == null ? null : sha256Hex(`${SALT()}:subject:${subject}`);
}
export function hashIp(ip) {
  return ip ? sha256Hex(`${SALT()}:ip:${ip}`).slice(0, 32) : null;
}

function scrub(detail) {
  const out = {};
  for (const [k, v] of Object.entries(detail || {})) {
    if (SECRET_KEY_RE.test(k)) continue;
    out[k] = typeof v === "string" && v.length > 200 ? v.slice(0, 200) : v;
  }
  return out;
}

/** Write one audit row. Failures are logged, never thrown (audit must not break auth flows). */
export async function writeAudit(db, { event, studentId = null, actorStudentId = null, identityType = null,
  subject = null, detail = {}, ip = null, ua = null }) {
  if (!AUDIT_EVENTS.includes(event)) throw new Error(`unknown audit event ${event}`);
  try {
    await db.query(
      `INSERT INTO auth_audit (event, student_id, actor_student_id, identity_type, identity_subject_hash, detail, ip_hash, ua)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [event, studentId, actorStudentId, identityType, hashSubject(subject), JSON.stringify(scrub(detail)),
        hashIp(ip), ua ? String(ua).slice(0, 256) : null]
    );
  } catch (err) {
    console.error(`[accounts] audit write failed (${event}): ${err.message}`);
  }
}
