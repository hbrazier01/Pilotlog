/**
 * challengeLimits.mjs — Postgres-backed rate limits for passkey and wallet challenge issuance.
 * Same mechanism as the magic-link limiter (magicLink.mjs recentCount): count recent auth_challenges rows
 * by purpose, by payload.ip_hash and by subject. No new tables or columns; issued challenges carry
 * ip_hash in their payload (hashed with the audit salt, never the raw IP).
 */
import { hashIp, writeAudit } from "./audit.mjs";

const MIN = 60 * 1000;
export function challengeLimitConfig(env = process.env) {
  const n = (v, d) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Math.floor(Number(v)) : d);
  return {
    windowMs: n(env.PILOTLOG_CHALLENGE_WINDOW_MS, 15 * MIN),
    maxPerIp: n(env.PILOTLOG_CHALLENGE_MAX_PER_IP, 20),
    maxPerSubject: n(env.PILOTLOG_CHALLENGE_MAX_PER_SUBJECT, 10),
  };
}

/**
 * Check limits before issuing. `purposes` are counted together; `subject` (student id / wallet address)
 * is optional. Returns { ok:true, ipHash } or { ok:false, retryAfterSec, by }.
 */
export async function checkChallengeLimit(db, { purposes, subject = null, ip = null, ua = null, env = process.env, route }) {
  const cfg = challengeLimitConfig(env);
  const ipHash = hashIp(ip);
  const { rows } = await db.query(
    `SELECT
       count(*) FILTER (WHERE $2::text IS NOT NULL AND payload->>'ip_hash' = $2)::int AS by_ip,
       min(created_at) FILTER (WHERE $2::text IS NOT NULL AND payload->>'ip_hash' = $2) AS ip_oldest,
       count(*) FILTER (WHERE $3::text IS NOT NULL AND subject = $3)::int AS by_subject,
       min(created_at) FILTER (WHERE $3::text IS NOT NULL AND subject = $3) AS subject_oldest,
       now() AS now
     FROM auth_challenges
     WHERE purpose = ANY($1) AND created_at > now() - ($4::bigint * interval '1 millisecond')`,
    [purposes, ipHash, subject, cfg.windowMs]);
  const r = rows[0];
  const over = r.by_ip >= cfg.maxPerIp ? "ip" : (subject && r.by_subject >= cfg.maxPerSubject ? "subject" : null);
  if (!over) return { ok: true, ipHash };
  const oldest = new Date(over === "ip" ? r.ip_oldest : r.subject_oldest).getTime();
  const retryAfterSec = Math.max(1, Math.ceil((oldest + cfg.windowMs - new Date(r.now).getTime()) / 1000));
  await writeAudit(db, { event: "challenge_rate_limited", subject, detail: { route, by: over }, ip, ua });
  return { ok: false, retryAfterSec, by: over };
}

export const RATE_LIMITED = Object.freeze({ error: "Too many requests. Wait a few minutes and try again." });
/** Uniform 429 for every challenge route (doesn't say which limit was hit). */
export function sendRateLimited(res, retryAfterSec) {
  res.set("Retry-After", String(retryAfterSec)).status(429).json(RATE_LIMITED);
}
