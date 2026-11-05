/**
 * walletIdentity.mjs — wallets as accounts-v2 identities (PR-5, rework of PR #11).
 *
 * - A wallet is an `identities` row: type 'midnight-1am' | 'midnight-lace' (PR-1 types; the scoping doc's
 *   "provider wallet + subtype"), subject = canonical mn_addr_…. The partial unique index
 *   identities_wallet_subject_uq makes one address = one identity across 1AM, Lace, and legacy.
 * - Student ids are random st_ (never derived from the address).
 * - Challenges: PR-2 auth_challenges, purpose 'sign-in' (wallet login) or 'link-wallet' (bound to the
 *   signed-in student). The exact message to sign is stored in the challenge payload.
 * - Unknown wallet on login → creates a student (scoping doc rev 2, PR-5 row: "wallet-only sign-up still works").
 * - A 'midnight-legacy' identity (backfilled from client-trusted /wallet/connect) is claimed on first
 *   verified signature: upgraded to the signing wallet's type with verified_at = now() (§2.4 M3).
 */
import { issueChallenge, consumeChallenge } from "./challenges.mjs";
import { writeAudit, hashIp } from "./audit.mjs";
import { sha256Hex } from "./crypto.mjs";
import { newStudentId, WALLET_IDENTITY_TYPES } from "./ids.mjs";
import { WALLET_PROVIDERS, challengeMessage, decodeUnshieldedAddress, verifyWalletSignature, midnightNetwork } from "./walletVerify.mjs";

export const INTENTS = Object.freeze({ login: "sign-in", link: "link-wallet" });

export function walletProvider(id) {
  const p = id ?? "midnight-1am";
  if (!Object.hasOwn(WALLET_PROVIDERS, p)) throw new Error("unknown wallet provider");
  return p;
}

/** Issue a wallet challenge. Throws on a bad address/intent (caller → 400). */
export async function issueWalletChallenge(db, { address, intent, provider, studentId = null, domain, env = process.env, ip = null, ua = null }) {
  if (!Object.hasOwn(INTENTS, intent)) throw new Error("intent must be login or link");
  if (intent === "link" && !studentId) throw new Error("link requires a signed-in student");
  const prov = walletProvider(provider);
  const network = midnightNetwork(env);
  await decodeUnshieldedAddress(address, network);
  const issuedAt = new Date().toISOString();
  // Issue first to get the nonce, then store the message with it: a second tiny UPDATE keeps PR-2's API unchanged.
  const { nonce, expiresAt } = await issueChallenge(db, { purpose: INTENTS[intent], subject: address,
    studentId: intent === "link" ? studentId : null, payload: { provider: prov, intent, ip_hash: hashIp(ip) }, ip, ua });
  const message = challengeMessage({ intent, address, nonce, issuedAt, domain, studentId: intent === "link" ? studentId : null });
  await db.query(`UPDATE auth_challenges SET payload = payload || $2::jsonb WHERE id_hash = $1`,
    [sha256Hex(nonce), JSON.stringify({ message })]);
  return { nonce, message, expiresAt, network, encoding: "text", keyType: "unshielded" };
}

async function consumeAndVerify(db, { intent, address, nonce, signature, studentId, env, ip, ua }) {
  const c = await consumeChallenge(db, { nonce, purpose: INTENTS[intent], subject: address,
    ...(intent === "link" ? { studentId } : {}), ip, ua });
  if (!c.ok) return { ok: false, reason: `challenge:${c.reason}` };
  if (!c.payload?.message) return { ok: false, reason: "challenge:no_message" };
  try { await verifyWalletSignature({ address, message: c.payload.message, signature, network: midnightNetwork(env) }); }
  catch (err) { return { ok: false, reason: /belong/.test(err.message) ? "key_address_mismatch" : "bad_signature" }; }
  return { ok: true, provider: c.payload.provider };
}

async function findWallet(client, address) {
  const { rows } = await client.query(
    `SELECT i.id, i.student_id, i.type, i.verified_at, s.status FROM identities i JOIN students s ON s.id = i.student_id
      WHERE i.subject = $1 AND i.type = ANY($2)`, [address, WALLET_IDENTITY_TYPES]);
  return rows[0] ?? null;
}

async function claimOrTouch(client, row, provider) {
  if (row.type === "midnight-legacy") {
    await client.query(`UPDATE identities SET type = $2, verified_at = now(), last_used_at = now(),
      metadata = metadata || '{"claimed_from":"midnight-legacy"}'::jsonb WHERE id = $1`, [row.id, provider]);
    return true;
  }
  await client.query(`UPDATE identities SET verified_at = COALESCE(verified_at, now()), last_used_at = now() WHERE id = $1`, [row.id]);
  return false;
}

/** Wallet sign-in. Returns { ok, studentId, created, claimed } or { ok:false, reason }. */
export async function walletLogin(pool, { address, nonce, signature, env = process.env, ip = null, ua = null }) {
  const v = await consumeAndVerify(pool, { intent: "login", address, nonce, signature, env, ip, ua });
  if (!v.ok) {
    await writeAudit(pool, { event: "wallet_signin_fail", identityType: "wallet", subject: address, detail: { reason: v.reason }, ip, ua });
    return v;
  }
  const client = await pool.connect();
  let out;
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", ["pilotlog-wallet:" + address]);
    const row = await findWallet(client, address);
    if (row && row.status !== "active") { await client.query("ROLLBACK"); return { ok: false, reason: "student_inactive" }; }
    if (row) {
      out = { studentId: row.student_id, created: false, claimed: await claimOrTouch(client, row, v.provider) };
    } else {
      const studentId = newStudentId();
      await client.query("INSERT INTO students (id, status) VALUES ($1, 'active')", [studentId]);
      await client.query(`INSERT INTO identities (student_id, type, subject, network, verified_at, last_used_at, metadata)
        VALUES ($1, $2, $3, $4, now(), now(), '{"source":"wallet-signin"}')`, [studentId, v.provider, address, midnightNetwork(env)]);
      out = { studentId, created: true, claimed: false };
    }
    await client.query("UPDATE students SET last_seen_at = now() WHERE id = $1", [out.studentId]);
    await client.query("COMMIT");
  } catch (err) { await client.query("ROLLBACK").catch(() => {}); throw err; } finally { client.release(); }
  if (out.claimed) await writeAudit(pool, { event: "wallet_claim_legacy", studentId: out.studentId, identityType: v.provider, subject: address, ip, ua });
  await writeAudit(pool, { event: out.created ? "signup" : "signin", studentId: out.studentId, identityType: v.provider, subject: address, ip, ua });
  return { ok: true, ...out };
}

/** Link a wallet to the signed-in student. reason 'conflict' → 409 (merge is PR-12). */
export async function walletLink(pool, { studentId, address, nonce, signature, env = process.env, ip = null, ua = null }) {
  const v = await consumeAndVerify(pool, { intent: "link", address, nonce, signature, studentId, env, ip, ua });
  if (!v.ok) {
    await writeAudit(pool, { event: "wallet_link_fail", studentId, identityType: "wallet", subject: address, detail: { reason: v.reason }, ip, ua });
    return v;
  }
  const client = await pool.connect();
  let result;
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", ["pilotlog-wallet:" + address]);
    const row = await findWallet(client, address);
    if (row && row.student_id !== studentId) {
      await client.query("ROLLBACK");
      await writeAudit(pool, { event: "wallet_link_conflict", studentId, identityType: v.provider, subject: address, ip, ua });
      return { ok: false, reason: "conflict" };
    }
    if (row) result = { ok: true, alreadyLinked: true, claimed: await claimOrTouch(client, row, v.provider) };
    else {
      await client.query(`INSERT INTO identities (student_id, type, subject, network, verified_at, last_used_at, metadata)
        VALUES ($1, $2, $3, $4, now(), now(), '{"source":"wallet-link"}')`, [studentId, v.provider, address, midnightNetwork(env)]);
      result = { ok: true, alreadyLinked: false, claimed: false };
    }
    await client.query("COMMIT");
  } catch (err) { await client.query("ROLLBACK").catch(() => {}); throw err; } finally { client.release(); }
  await writeAudit(pool, { event: "wallet_link", studentId, identityType: v.provider, subject: address,
    detail: { alreadyLinked: result.alreadyLinked, claimed: result.claimed }, ip, ua });
  return result;
}

/**
 * PR #11 compatibility (scoping doc §2.4 item 7): PR #11's `students` rows carry wallet_address and an id
 * derived as st_<sha256(addr)[:24]>. Keep those ids as-is (they're opaque now) and give each address a
 * 'midnight-legacy' identity (unverified until a signature claims it). Dry run by default; counts only.
 */
export async function mapPr11Students(pool, { apply = false } = {}) {
  const client = await pool.connect();
  try {
    const col = await client.query(`SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema()
      AND table_name = 'students' AND column_name = 'wallet_address'`);
    if (!col.rows.length) return { mode: apply ? "apply" : "dry-run", pr11Schema: false, studentsWithWallet: 0, identitiesToCreate: 0, alreadyMapped: 0, conflicts: 0, nonCanonical: 0 };
    await client.query(apply ? "BEGIN" : "BEGIN TRANSACTION READ ONLY");
    const { rows } = await client.query(
      `SELECT s.id, s.wallet_address, i.student_id AS mapped_to
         FROM students s LEFT JOIN identities i ON i.subject = s.wallet_address AND i.type = ANY($1)
        WHERE s.wallet_address IS NOT NULL`, [WALLET_IDENTITY_TYPES]);
    const plan = { mode: apply ? "apply" : "dry-run", pr11Schema: true, studentsWithWallet: rows.length,
      identitiesToCreate: 0, alreadyMapped: 0, conflicts: 0, nonCanonical: 0, created: 0 };
    const ADDR = /^mn_addr_[a-z0-9]+1[02-9ac-hj-np-z]{20,200}$/;
    for (const r of rows) {
      if (!ADDR.test(r.wallet_address)) { plan.nonCanonical++; continue; }
      if (r.mapped_to === r.id) { plan.alreadyMapped++; continue; }
      if (r.mapped_to) { plan.conflicts++; continue; }
      plan.identitiesToCreate++;
      if (apply) {
        const net = r.wallet_address.slice(8, r.wallet_address.lastIndexOf("1"));
        await client.query(`INSERT INTO identities (student_id, type, subject, network, verified_at, metadata)
          VALUES ($1, 'midnight-legacy', $2, $3, NULL, '{"source":"pr11-students"}') ON CONFLICT DO NOTHING`, [r.id, r.wallet_address, net]);
        plan.created++;
      }
    }
    await client.query("COMMIT");
    return plan;
  } catch (err) { await client.query("ROLLBACK").catch(() => {}); throw err; } finally { client.release(); }
}
