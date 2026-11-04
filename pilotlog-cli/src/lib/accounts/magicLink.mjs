/**
 * magicLink.mjs — email magic-link sign-in/sign-up for accounts v2 (scoping doc PR-3).
 *
 * start:  normalize email → rate-limit (per email, per IP; DB-backed so multi-instance safe) →
 *         issue an 'email-magic-link' challenge (15 min, single-use, only sha256(nonce) stored) →
 *         send the link. The caller ALWAYS answers the same 202, and we never look up whether the
 *         email has an account at this step, so neither the response nor its timing enumerates accounts.
 * verify: consume the challenge atomically → find-or-create student + verified email identity
 *         (transaction + advisory lock per email) → caller creates the session.
 */
import { issueChallenge, consumeChallenge } from "./challenges.mjs";
import { writeAudit, hashIp } from "./audit.mjs";
import { newStudentId } from "./ids.mjs";

const MIN = 60 * 1000;

export function magicLinkConfig(env = process.env) {
  const n = (v, d) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : d);
  return {
    ttlMs: n(env.PILOTLOG_MAGIC_LINK_TTL_MS, 15 * MIN),
    windowMs: 15 * MIN,
    maxPerEmail: n(env.PILOTLOG_MAGIC_LINK_MAX_PER_EMAIL, 3),
    maxPerIp: n(env.PILOTLOG_MAGIC_LINK_MAX_PER_IP, 10),
  };
}

/**
 * Normalize an email for use as an identity subject: trim, Unicode NFC, lowercase.
 * Deliberately no provider-specific rewriting (gmail dots / +tags are distinct identities).
 * Returns null if it doesn't look like a deliverable address.
 */
export function normalizeEmail(raw) {
  if (typeof raw !== "string") return null;
  const e = raw.normalize("NFC").trim().toLowerCase();
  if (e.length < 3 || e.length > 254) return null;
  if (!/^[^\s@<>()[\]\\,;:"]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/.test(e)) return null;
  const local = e.slice(0, e.indexOf("@"));
  if (local.length > 64) return null;
  return e;
}

async function recentCount(db, { subject, ipHash, windowMs }) {
  const { rows } = await db.query(
    `SELECT
       count(*) FILTER (WHERE subject = $1)::int                   AS by_email,
       count(*) FILTER (WHERE $2::text IS NOT NULL AND payload->>'ip_hash' = $2)::int AS by_ip
     FROM auth_challenges
     WHERE purpose = 'email-magic-link' AND created_at > now() - ($3::bigint * interval '1 millisecond')`,
    [subject, ipHash, windowMs]
  );
  return rows[0];
}

export function renderMagicLinkEmail({ link, ttlMinutes }) {
  const subject = "Your PilotLog sign-in link";
  const text = `Sign in to PilotLog:\n\n${link}\n\nThis link works once and expires in ${ttlMinutes} minutes.\n` +
    `If you didn't ask for it, you can ignore this email.`;
  const safe = link.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
  const html = `<p>Sign in to PilotLog:</p><p><a href="${safe}">Sign in</a></p>` +
    `<p>This link works once and expires in ${ttlMinutes} minutes. If you didn't ask for it, you can ignore this email.</p>`;
  return { subject, text, html };
}

/**
 * Start a magic-link sign-in. Never throws for per-user conditions; returns an internal status
 * ('issued' | 'rate_limited') plus a `delivery` promise, for logs/tests only — callers must not expose it.
 */
export async function startMagicLink(db, { email, ip = null, ua = null, publicUrl, provider, env = process.env }) {
  const cfg = magicLinkConfig(env);
  const ipHash = hashIp(ip);
  const counts = await recentCount(db, { subject: email, ipHash, windowMs: cfg.windowMs });
  if (counts.by_email >= cfg.maxPerEmail || counts.by_ip >= cfg.maxPerIp) {
    await writeAudit(db, { event: "magic_link_rate_limited", identityType: "email", subject: email,
      detail: { by: counts.by_email >= cfg.maxPerEmail ? "email" : "ip" }, ip, ua });
    return { status: "rate_limited", delivery: Promise.resolve("skipped") };
  }
  const { nonce } = await issueChallenge(db, { purpose: "email-magic-link", subject: email,
    payload: { intent: "signin", ip_hash: ipHash }, ttlMs: cfg.ttlMs, ip, ua });
  await writeAudit(db, { event: "magic_link_request", identityType: "email", subject: email, ip, ua });
  const link = `${publicUrl.replace(/\/+$/, "")}/api/v2/auth/email/verify?token=${encodeURIComponent(nonce)}`;
  // Delivery runs after the caller has answered, so provider latency/errors (e.g. Postmark rejecting an
  // inactive recipient) can't be observed by timing. `delivery` resolves to 'sent' | 'send_failed'.
  const delivery = (async () => {
    try {
      await provider.send({ to: email, ...renderMagicLinkEmail({ link, ttlMinutes: Math.round(cfg.ttlMs / MIN) }) });
      return "sent";
    } catch (err) {
      console.error(`[accounts] magic link send failed (${provider.name}): ${err.message}`);
      await writeAudit(db, { event: "magic_link_send_fail", identityType: "email", subject: email,
        detail: { provider: provider.name }, ip, ua });
      return "send_failed";
    }
  })();
  return { status: "issued", delivery };
}

/**
 * Consume a magic-link token and resolve the student. Returns
 * { ok: true, studentId, created, email } or { ok: false, reason }.
 * If currentStudentId is given (already signed in) and the email belongs to someone else or to no one,
 * returns { ok:false, reason:'signed_in_as_other' } — linking/merging is PR-12, never implicit.
 */
export async function verifyMagicLink(pool, { token, currentStudentId = null, ip = null, ua = null }) {
  const c = await consumeChallenge(pool, { nonce: token, purpose: "email-magic-link", ip, ua });
  if (!c.ok) return { ok: false, reason: c.reason };
  const email = c.subject;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", ["pilotlog-email:" + email]);
    const found = await client.query(
      `SELECT i.id, i.student_id, i.verified_at, s.status FROM identities i JOIN students s ON s.id = i.student_id
        WHERE i.type = 'email' AND i.subject = $1`, [email]);
    let studentId, created = false;
    if (found.rows.length) {
      const row = found.rows[0];
      if (row.status !== "active") { await client.query("ROLLBACK"); return { ok: false, reason: "student_inactive" }; }
      studentId = row.student_id;
    }
    if (currentStudentId && studentId !== currentStudentId) {
      await client.query("ROLLBACK");
      await writeAudit(pool, { event: "signin_blocked", studentId: currentStudentId, identityType: "email", subject: email,
        detail: { reason: studentId ? "email_on_other_student" : "link_not_supported_yet" }, ip, ua });
      return { ok: false, reason: "signed_in_as_other" };
    }
    if (!studentId) {
      studentId = newStudentId();
      await client.query("INSERT INTO students (id, status) VALUES ($1, 'active')", [studentId]);
      await client.query(
        `INSERT INTO identities (student_id, type, subject, verified_at, last_used_at, metadata)
         VALUES ($1, 'email', $2, now(), now(), '{"source":"magic-link"}')`, [studentId, email]);
      created = true;
    } else {
      await client.query(
        `UPDATE identities SET verified_at = COALESCE(verified_at, now()), last_used_at = now()
          WHERE type = 'email' AND subject = $1`, [email]);
    }
    await client.query("UPDATE students SET last_seen_at = now() WHERE id = $1", [studentId]);
    await client.query("COMMIT");
    await writeAudit(pool, { event: created ? "signup" : "signin", studentId, identityType: "email", subject: email, ip, ua });
    return { ok: true, studentId, created, email };
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}
