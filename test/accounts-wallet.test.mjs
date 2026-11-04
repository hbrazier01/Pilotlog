/**
 * Accounts v2 PR-5: Midnight wallets as identities (rework of PR #11). Real keys/signatures from
 * @midnight-ntwrk/ledger-v8 8.0.3 (sampleSigningKey + signData), no network.
 * Postgres tests need PILOTLOG_TEST_DATABASE_URL.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import express from 'express';
import pg from 'pg';
import * as L from '@midnight-ntwrk/ledger-v8';
import { UnshieldedAddress } from '@midnight-ntwrk/wallet-sdk-address-format';
import { migrate } from '../pilotlog-cli/src/db.mjs';
import { migrateAccountsV2 } from '../pilotlog-cli/src/lib/accounts/schemaV2.mjs';
import { registerAccountsV2 } from '../pilotlog-cli/src/lib/accounts/http.mjs';
import { createSession, loadSession } from '../pilotlog-cli/src/lib/accounts/sessions.mjs';
import { newStudentId } from '../pilotlog-cli/src/lib/accounts/ids.mjs';
import { signedMessageBytes, verifyWalletSignature, challengeMessage } from '../pilotlog-cli/src/lib/accounts/walletVerify.mjs';
import { mapPr11Students } from '../pilotlog-cli/src/lib/accounts/walletIdentity.mjs';

const TEST_DB = process.env.PILOTLOG_TEST_DATABASE_URL;
const pgTest = TEST_DB ? test : test.skip;

function wallet() {
  const sk = L.sampleSigningKey();
  const vk = L.signatureVerifyingKey(sk);
  const address = UnshieldedAddress.codec.encode('preprod', new UnshieldedAddress(Buffer.from(L.addressFromKey(vk), 'hex'))).asString();
  return { address, sign: (m) => ({ signature: L.signData(sk, signedMessageBytes(m)), verifyingKey: vk }) };
}
async function serve(app) {
  const srv = await new Promise((r) => { const x = app.listen(0, '127.0.0.1', () => r(x)); });
  return { base: `http://127.0.0.1:${srv.address().port}`, close: () => new Promise((r) => srv.close(r)) };
}

test('verifyWalletSignature (ported from PR #11): valid, wrong key, tampered message, bad scheme', async () => {
  const a = wallet(), b = wallet();
  const m = challengeMessage({ intent: 'login', address: a.address, nonce: 'n', issuedAt: 't', domain: 'd' });
  assert.match(m, /Intent: login/);
  assert.equal(await verifyWalletSignature({ address: a.address, message: m, signature: a.sign(m), network: 'preprod' }), true);
  await assert.rejects(verifyWalletSignature({ address: a.address, message: m, signature: b.sign(m), network: 'preprod' }), /does not belong/);
  await assert.rejects(verifyWalletSignature({ address: a.address, message: m + 'x', signature: a.sign(m), network: 'preprod' }), /does not verify/);
  await assert.rejects(verifyWalletSignature({ address: a.address, message: m, signature: { ...a.sign(m), scheme: 'ecdsa' }, network: 'preprod' }), /scheme/);
  await assert.rejects(verifyWalletSignature({ address: a.address, message: m, signature: a.sign(m), network: 'mainnet' }), /mainnet/);
});

test('flag off: wallet routes return 404', async () => {
  const app = express(); app.use(express.json());
  registerAccountsV2(app, { pool: {}, env: {} });
  const s = await serve(app);
  try {
    for (const p of ['challenge', 'verify-login', 'link'])
      assert.equal((await fetch(`${s.base}/api/v2/auth/wallet/${p}`, { method: 'POST', headers: { origin: s.base } })).status, 404, p);
  } finally { await s.close(); }
});

async function withDb(fn, { before } = {}) {
  const schema = `w_${process.pid}_${Math.random().toString(36).slice(2, 10)}`;
  const admin = new pg.Pool({ connectionString: TEST_DB, max: 1 });
  await admin.query(`CREATE SCHEMA ${schema}`);
  const u = new URL(TEST_DB); u.searchParams.set('options', `-c search_path=${schema}`);
  const pool = new pg.Pool({ connectionString: u.toString(), max: 8 });
  try {
    if (before) await before(pool);
    await migrate(pool); await migrateAccountsV2(pool);
    return await fn(pool);
  } finally { await pool.end(); await admin.query(`DROP SCHEMA ${schema} CASCADE`); await admin.end(); }
}
function withApp(fn) {
  return withDb(async (pool) => {
    const env = { PILOTLOG_ACCOUNTS_V2: 'true', PILOTLOG_COOKIE_SECURE: 'false', PILOTLOG_EMAIL_PROVIDER: 'test' };
    const app = express(); app.use(express.json());
    registerAccountsV2(app, { pool, env, cleanupEveryMs: 0 });
    const s = await serve(app);
    const post = (p, body, { cookie, origin = s.base } = {}) => fetch(`${s.base}/api/v2/auth/wallet/${p}`, { method: 'POST',
      headers: { 'content-type': 'application/json', origin, ...(cookie ? { cookie } : {}) }, body: JSON.stringify(body) });
    const challenge = async (w, intent = 'login', opts = {}) => (await post('challenge', { address: w.address, intent, provider: opts.provider }, opts)).json();
    const login = async (w, opts = {}) => {
      const c = await challenge(w, 'login', opts);
      return post('verify-login', { address: w.address, nonce: c.nonce, signature: w.sign(c.message) }, opts);
    };
    const student = async () => {
      const id = newStudentId();
      await pool.query(`INSERT INTO students (id) VALUES ($1)`, [id]);
      return { id, cookie: `pl_sid=${(await createSession(pool, { studentId: id })).token}` };
    };
    try { return await fn({ pool, post, challenge, login, student }); } finally { await s.close(); }
  });
}
const events = async (pool) => (await pool.query('SELECT event, identity_type, detail FROM auth_audit ORDER BY id')).rows;

pgTest('valid signature: unknown wallet signs up (random st_ id), second sign-in reuses it; 1AM and Lace = same identity', () => withApp(async (h) => {
  const w = wallet();
  const r1 = await h.login(w);
  assert.equal(r1.status, 200, await r1.clone().text());
  const b1 = await r1.json();
  assert.equal(b1.created, true);
  const derived = 'st_' + createHash('sha256').update(w.address).digest('hex').slice(0, 24);
  assert.notEqual(b1.studentId, derived, 'student id is NOT derived from the wallet');
  assert.match(b1.studentId, /^st_[0-9a-f]{24}$/);
  const tok = (r1.headers.get('set-cookie') || '').split(';')[0].split('=')[1];
  assert.equal((await loadSession(h.pool, tok)).studentId, b1.studentId);
  const r2 = await (await h.login(w, { provider: 'midnight-lace' })).json();
  assert.equal(r2.studentId, b1.studentId);
  assert.equal(r2.created, false);
  const ids = (await h.pool.query(`SELECT type, verified_at FROM identities WHERE subject = $1`, [w.address])).rows;
  assert.equal(ids.length, 1);
  assert.equal(ids[0].type, 'midnight-1am');
  assert.ok(ids[0].verified_at);
  const ev = (await events(h.pool)).map((e) => e.event);
  assert.ok(ev.includes('signup') && ev.includes('signin'));
  assert.ok(!JSON.stringify((await h.pool.query('SELECT * FROM auth_audit')).rows).includes(w.address));
  // the challenge message is bound to the intent
  assert.match((await h.challenge(w)).message, /Intent: login/);
}));

pgTest('bad signature, wrong address, replayed nonce, cross-intent replay are rejected', () => withApp(async (h) => {
  const a = wallet(), b = wallet();
  // bad signature (signed by another key)
  let c = await h.challenge(a);
  assert.equal((await h.post('verify-login', { address: a.address, nonce: c.nonce, signature: b.sign(c.message) })).status, 401);
  // tampered message
  c = await h.challenge(a);
  assert.equal((await h.post('verify-login', { address: a.address, nonce: c.nonce, signature: a.sign(c.message + ' ') })).status, 401);
  // wrong address: challenge for A, submitted as B (signed by B)
  c = await h.challenge(a);
  assert.equal((await h.post('verify-login', { address: b.address, nonce: c.nonce, signature: b.sign(c.message) })).status, 401);
  // replayed nonce
  c = await h.challenge(a);
  const body = { address: a.address, nonce: c.nonce, signature: a.sign(c.message) };
  assert.equal((await h.post('verify-login', body)).status, 200);
  const replay = await h.post('verify-login', body);
  assert.equal(replay.status, 401);
  assert.equal(replay.headers.get('set-cookie'), null);
  // cross-intent: a login challenge can't be used to link
  const st = await h.student();
  c = await h.challenge(a);
  assert.equal((await h.post('link', { address: a.address, nonce: c.nonce, signature: a.sign(c.message) }, { cookie: st.cookie })).status, 401);
  // invalid addresses are refused at challenge time
  assert.equal((await h.post('challenge', { address: 'mn_addr_preprod1nope', intent: 'login' })).status, 400);
  assert.equal((await h.post('challenge', { address: a.address, intent: 'login', provider: 'midnight-passport' })).status, 400);
  assert.equal((await h.post('challenge', { address: a.address, intent: 'login' }, { origin: 'https://evil.example' })).status, 403);
  const reasons = (await events(h.pool)).filter((e) => e.event === 'wallet_signin_fail').map((e) => e.detail.reason);
  for (const r of ['key_address_mismatch', 'bad_signature', 'challenge:subject_mismatch', 'challenge:not_found_or_used_or_expired']) assert.ok(reasons.includes(r), r);
  assert.equal((await h.pool.query(`SELECT count(*)::int n FROM identities`)).rows[0].n, 1);
}));

pgTest('link: signed-in student adds a wallet; same wallet on another student → 409; legacy identity is claimed', () => withApp(async (h) => {
  const s1 = await h.student(), s2 = await h.student();
  const w = wallet();
  assert.equal((await h.post('challenge', { address: w.address, intent: 'link' })).status, 401);
  let c = await h.challenge(w, 'link', { cookie: s1.cookie, provider: 'midnight-lace' });
  assert.match(c.message, new RegExp(`Account: ${s1.id}`));
  // student 2 can't use student 1's link challenge
  assert.equal((await h.post('link', { address: w.address, nonce: c.nonce, signature: w.sign(c.message) }, { cookie: s2.cookie })).status, 401);
  c = await h.challenge(w, 'link', { cookie: s1.cookie, provider: 'midnight-lace' });
  const r = await h.post('link', { address: w.address, nonce: c.nonce, signature: w.sign(c.message) }, { cookie: s1.cookie });
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { ok: true, alreadyLinked: false, claimed: false });
  assert.equal((await h.pool.query(`SELECT student_id, type FROM identities WHERE subject=$1`, [w.address])).rows[0].type, 'midnight-lace');
  // conflict
  c = await h.challenge(w, 'link', { cookie: s2.cookie });
  const conflict = await h.post('link', { address: w.address, nonce: c.nonce, signature: w.sign(c.message) }, { cookie: s2.cookie });
  assert.equal(conflict.status, 409);
  assert.equal((await h.pool.query(`SELECT student_id FROM identities WHERE subject=$1`, [w.address])).rows[0].student_id, s1.id);
  assert.ok((await events(h.pool)).some((e) => e.event === 'wallet_link_conflict'));
  // signing in with the linked wallet lands on student 1
  assert.equal((await (await h.login(w)).json()).studentId, s1.id);

  // legacy (backfilled, unverified) identity is claimed on first verified sign-in
  const lw = wallet();
  const legacy = await h.student();
  await h.pool.query(`INSERT INTO identities (student_id, type, subject, verified_at) VALUES ($1,'midnight-legacy',$2,NULL)`, [legacy.id, lw.address]);
  const lr = await (await h.login(lw)).json();
  assert.deepEqual([lr.studentId, lr.created, lr.claimed], [legacy.id, false, true]);
  const row = (await h.pool.query(`SELECT type, verified_at FROM identities WHERE subject=$1`, [lw.address])).rows[0];
  assert.equal(row.type, 'midnight-1am'); assert.ok(row.verified_at);
}));

pgTest('backfill dry run: PR #11-style wallet-derived student ids map to midnight-legacy identities (ids kept)', () => {
  const a = wallet().address, b = wallet().address;
  const sid = (addr) => 'st_' + createHash('sha256').update(addr).digest('hex').slice(0, 24);
  return withDb(async (pool) => {
    await pool.query(`INSERT INTO identities (student_id, type, subject, verified_at) VALUES ($1,'midnight-1am',$2,now())`, [sid(b), b]);
    const dry = await mapPr11Students(pool);
    assert.deepEqual({ ...dry }, { mode: 'dry-run', pr11Schema: true, studentsWithWallet: 3, identitiesToCreate: 1,
      alreadyMapped: 1, conflicts: 0, nonCanonical: 1, created: 0 });
    assert.equal((await pool.query(`SELECT count(*)::int n FROM identities`)).rows[0].n, 1, 'dry run writes nothing');
    const applied = await mapPr11Students(pool, { apply: true });
    assert.equal(applied.created, 1);
    const row = (await pool.query(`SELECT student_id, type, verified_at, network FROM identities WHERE subject=$1`, [a])).rows[0];
    assert.deepEqual([row.student_id, row.type, row.verified_at, row.network], [sid(a), 'midnight-legacy', null, 'preprod']);
    assert.equal((await mapPr11Students(pool)).identitiesToCreate, 0, 'idempotent');
  }, { before: async (pool) => {
    // PR #11's table shape: wallet_address UNIQUE NOT NULL, id derived from the address
    await pool.query(`CREATE TABLE students (id TEXT PRIMARY KEY, wallet_address TEXT UNIQUE NOT NULL, provider TEXT)`);
    await pool.query(`INSERT INTO students (id, wallet_address, provider) VALUES ($1,$2,'midnight-1am'),($3,$4,'midnight-lace'),('st_00000000000000000000beef','mn_shield-cpk_junk','midnight-1am')`, [sid(a), a, sid(b), b]);
  } });
});
