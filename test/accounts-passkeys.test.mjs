/**
 * Accounts v2 PR-4: passkeys (WebAuthn) via @simplewebauthn/server. Real ES256 assertions from a software
 * authenticator (test/helpers/soft-authenticator.mjs). No network. Postgres tests need PILOTLOG_TEST_DATABASE_URL.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import pg from 'pg';
import { migrate } from '../pilotlog-cli/src/db.mjs';
import { migrateAccountsV2 } from '../pilotlog-cli/src/lib/accounts/schemaV2.mjs';
import { registerAccountsV2 } from '../pilotlog-cli/src/lib/accounts/http.mjs';
import { createSession, loadSession } from '../pilotlog-cli/src/lib/accounts/sessions.mjs';
import { newStudentId } from '../pilotlog-cli/src/lib/accounts/ids.mjs';
import { rpConfig, readClientData } from '../pilotlog-cli/src/lib/accounts/passkeys.mjs';
import { createSoftAuthenticator } from './helpers/soft-authenticator.mjs';

const TEST_DB = process.env.PILOTLOG_TEST_DATABASE_URL;
const pgTest = TEST_DB ? test : test.skip;

async function serve(app) {
  const srv = await new Promise((r) => { const x = app.listen(0, '127.0.0.1', () => r(x)); });
  return { port: srv.address().port, base: `http://127.0.0.1:${srv.address().port}`, close: () => new Promise((r) => srv.close(r)) };
}

// ── Config (always) ─────────────────────────────────────────────────────────
test('rpConfig: dev defaults to localhost; production fails closed on missing/mismatched/insecure values', () => {
  const req = { protocol: 'http', headers: { host: 'localhost:8788' } };
  assert.deepEqual(rpConfig(req, {}), { rpID: 'localhost', origin: 'http://localhost:8788', rpName: 'PilotLog' });
  assert.throws(() => rpConfig({ protocol: 'http', headers: { host: 'evil.example:80' } }, {}), /does not match/);
  const ok = { NODE_ENV: 'production', PILOTLOG_RP_ID: 'pilotlog.example.com', PILOTLOG_PUBLIC_URL: 'https://pilotlog.example.com' };
  assert.equal(rpConfig(req, ok).origin, 'https://pilotlog.example.com');
  assert.equal(rpConfig(req, { ...ok, PILOTLOG_RP_ID: 'example.com' }).rpID, 'example.com'); // registrable suffix ok
  assert.throws(() => rpConfig(req, { ...ok, PILOTLOG_RP_ID: '' }), /PILOTLOG_RP_ID is required/);
  assert.throws(() => rpConfig(req, { ...ok, PILOTLOG_PUBLIC_URL: '' }), /PILOTLOG_PUBLIC_URL is required/);
  assert.throws(() => rpConfig(req, { ...ok, PILOTLOG_PUBLIC_URL: 'http://pilotlog.example.com' }), /https/);
  assert.throws(() => rpConfig(req, { ...ok, PILOTLOG_RP_ID: 'other.example.com' }), /does not match/);
  assert.throws(() => rpConfig(req, { ...ok, PILOTLOG_RP_ID: 'ample.com', PILOTLOG_PUBLIC_URL: 'https://example.com' }), /does not match/);
  assert.throws(() => rpConfig(req, { NODE_ENV: 'production', PILOTLOG_RP_ID: 'localhost', PILOTLOG_PUBLIC_URL: 'https://localhost' }), /real domain/);
});

test('readClientData decodes the nonce and rejects garbage', () => {
  const nonce = 'A'.repeat(43);
  const ch = Buffer.from(nonce, 'utf8').toString('base64url');
  const b64 = Buffer.from(JSON.stringify({ type: 'webauthn.get', challenge: ch, origin: 'x' })).toString('base64url');
  assert.equal(readClientData(b64).nonce, nonce);
  assert.equal(readClientData('%%%'), null);
});

test('flag off: passkey routes return 404', async () => {
  const app = express(); app.use(express.json());
  registerAccountsV2(app, { pool: {}, env: {} });
  const s = await serve(app);
  try {
    for (const [m, p] of [['POST', '/api/v2/auth/passkey/register/options'], ['POST', '/api/v2/auth/passkey/register/verify'],
      ['POST', '/api/v2/auth/passkey/login/options'], ['POST', '/api/v2/auth/passkey/login/verify'],
      ['GET', '/api/v2/auth/passkeys'], ['DELETE', '/api/v2/auth/passkeys/abc']])
      assert.equal((await fetch(s.base + p, { method: m, headers: { origin: s.base } })).status, 404, `${m} ${p}`);
  } finally { await s.close(); }
});

// ── Flow (Postgres) ─────────────────────────────────────────────────────────
async function withApp(fn, envExtra = {}) {
  const schema = `pk_${process.pid}_${Math.random().toString(36).slice(2, 10)}`;
  const admin = new pg.Pool({ connectionString: TEST_DB, max: 1 });
  await admin.query(`CREATE SCHEMA ${schema}`);
  const u = new URL(TEST_DB); u.searchParams.set('options', `-c search_path=${schema}`);
  const pool = new pg.Pool({ connectionString: u.toString(), max: 8 });
  const env = { PILOTLOG_ACCOUNTS_V2: 'true', PILOTLOG_COOKIE_SECURE: 'false', PILOTLOG_EMAIL_PROVIDER: 'test', ...envExtra };
  try {
    await migrate(pool); await migrateAccountsV2(pool);
    const app = express(); app.use(express.json());
    registerAccountsV2(app, { pool, env, cleanupEveryMs: 0 });
    const s = await serve(app);
    // RP origin is the public URL (localhost); requests go to 127.0.0.1 with a same-host Origin for the CSRF guard.
    env.PILOTLOG_PUBLIC_URL = `http://localhost:${s.port}`;
    env.PILOTLOG_RP_ID = 'localhost';
    const origin = env.PILOTLOG_PUBLIC_URL;
    const call = (method, path, { body, cookie, hdrs = {} } = {}) => fetch(s.base + path, { method,
      headers: { 'content-type': 'application/json', origin: s.base, ...(cookie ? { cookie } : {}), ...hdrs },
      body: body === undefined ? undefined : JSON.stringify(body) });
    const newStudent = async ({ email = null, verified = true } = {}) => {
      const id = newStudentId();
      await pool.query(`INSERT INTO students (id) VALUES ($1)`, [id]);
      if (email) await pool.query(`INSERT INTO identities (student_id, type, subject, verified_at) VALUES ($1,'email',$2,${verified ? 'now()' : 'NULL'})`, [id, email]);
      const sess = await createSession(pool, { studentId: id });
      return { id, cookie: `pl_sid=${sess.token}` };
    };
    const register = async (st, auth, opts = {}) => {
      const o = await (await call('POST', '/api/v2/auth/passkey/register/options', { cookie: st.cookie })).json();
      return call('POST', '/api/v2/auth/passkey/register/verify', { cookie: st.cookie, body: { response: auth.create(o, { origin, ...opts }) } });
    };
    const loginOptions = async (body = {}) => (await call('POST', '/api/v2/auth/passkey/login/options', { body })).json();
    const login = (resp) => call('POST', '/api/v2/auth/passkey/login/verify', { body: { response: resp } });
    try { return await fn({ pool, env, origin, call, newStudent, register, loginOptions, login }); } finally { await s.close(); }
  } finally {
    await pool.end(); await admin.query(`DROP SCHEMA ${schema} CASCADE`); await admin.end();
  }
}
const cookieOf = (res) => (res.headers.get('set-cookie') || '').split(';')[0];
const events = async (pool) => (await pool.query('SELECT event, detail FROM auth_audit ORDER BY id')).rows;

pgTest('register then usernameless login → session cookie; credential row stored; audit written', () => withApp(async (h) => {
  const st = await h.newStudent({ email: 'pk@example.com' });
  const auth = createSoftAuthenticator({ aaguid: Buffer.from('00112233445566778899aabbccddeeff', 'hex'), backupEligible: true });
  const r = await h.register(st, auth);
  assert.equal(r.status, 200, await r.clone().text());
  assert.deepEqual(await r.json(), { ok: true, id: auth.id });
  const { rows } = await h.pool.query(`SELECT i.student_id, i.verified_at, w.* FROM identities i JOIN webauthn_credentials w ON w.identity_id = i.id WHERE i.type='passkey'`);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].student_id, st.id);
  assert.ok(rows[0].verified_at);
  assert.equal(Number(rows[0].sign_count), 0);
  assert.deepEqual(rows[0].transports, ['internal', 'hybrid']);
  assert.equal(rows[0].aaguid, '00112233-4455-6677-8899-aabbccddeeff');
  assert.equal(rows[0].backed_up, true);
  assert.ok(Buffer.isBuffer(rows[0].public_key) && rows[0].public_key.length > 60);

  const o = await h.loginOptions();
  assert.equal(o.rpId, 'localhost');
  assert.equal(o.userVerification, 'preferred');
  assert.deepEqual(o.allowCredentials ?? [], []);
  const res = await h.login(auth.get(o, { origin: h.origin }));
  assert.equal(res.status, 200, await res.clone().text());
  assert.deepEqual(await res.json(), { ok: true, studentId: st.id });
  const ck = cookieOf(res);
  assert.match(res.headers.get('set-cookie'), /HttpOnly; SameSite=Lax/);
  assert.equal((await loadSession(h.pool, ck.split('=')[1])).studentId, st.id);
  assert.equal(Number((await h.pool.query('SELECT sign_count FROM webauthn_credentials')).rows[0].sign_count), 1);
  const ev = (await events(h.pool)).map((e) => e.event);
  for (const e of ['passkey_register', 'signin', 'session_create']) assert.ok(ev.includes(e), e);

  // list own passkeys
  const list = await (await h.call('GET', '/api/v2/auth/passkeys', { cookie: st.cookie })).json();
  assert.equal(list.passkeys.length, 1);
  assert.equal(list.passkeys[0].id, auth.id);
  assert.equal(list.passkeys[0].deviceType, 'multiDevice');
  assert.ok(!JSON.stringify(list).includes('public'));
}));

pgTest('register requires a session and a same-origin write', () => withApp(async (h) => {
  assert.equal((await h.call('POST', '/api/v2/auth/passkey/register/options')).status, 401);
  const st = await h.newStudent();
  assert.equal((await h.call('POST', '/api/v2/auth/passkey/register/options', { cookie: st.cookie, hdrs: { origin: 'https://evil.example' } })).status, 403);
  assert.equal((await h.call('POST', '/api/v2/auth/passkey/login/verify', { body: {}, hdrs: { origin: 'https://evil.example' } })).status, 403);
}));

pgTest('replayed challenge is rejected (registration and login)', () => withApp(async (h) => {
  const st = await h.newStudent({ email: 'r@example.com' });
  const auth = createSoftAuthenticator();
  const o = await (await h.call('POST', '/api/v2/auth/passkey/register/options', { cookie: st.cookie })).json();
  const resp = auth.create(o, { origin: h.origin });
  assert.equal((await h.call('POST', '/api/v2/auth/passkey/register/verify', { cookie: st.cookie, body: { response: resp } })).status, 200);
  assert.equal((await h.call('POST', '/api/v2/auth/passkey/register/verify', { cookie: st.cookie, body: { response: resp } })).status, 400);

  const lo = await h.loginOptions();
  assert.equal((await h.login(auth.get(lo, { origin: h.origin }))).status, 200);
  const replay = auth.get(lo, { origin: h.origin }); // same challenge, fresh higher counter
  const r = await h.login(replay);
  assert.equal(r.status, 400);
  assert.equal(r.headers.get('set-cookie'), null);
  // forged challenge never issued
  const forged = auth.get({ rpId: 'localhost', challenge: Buffer.from('B'.repeat(43)).toString('base64url') }, { origin: h.origin });
  assert.equal((await h.login(forged)).status, 400);
  const fails = (await events(h.pool)).filter((e) => e.event === 'passkey_signin_fail').map((e) => e.detail.reason);
  assert.ok(fails.includes('challenge:not_found_or_used_or_expired'));
}));

pgTest('wrong origin and wrong RP ID are rejected (and burn the challenge)', () => withApp(async (h) => {
  const st = await h.newStudent({ email: 'o@example.com' });
  const auth = createSoftAuthenticator();
  assert.equal((await h.register(st, auth, { origin: 'https://evil.example' })).status, 400);
  assert.equal((await h.register(st, auth, { rpId: 'evil.example' })).status, 400);
  assert.equal((await h.pool.query(`SELECT count(*)::int n FROM identities WHERE type='passkey'`)).rows[0].n, 0);
  assert.equal((await h.register(st, auth)).status, 200);

  const o1 = await h.loginOptions();
  assert.equal((await h.login(auth.get(o1, { origin: 'https://evil.example' }))).status, 400);
  assert.equal((await h.login(auth.get(o1, { origin: h.origin }))).status, 400, 'challenge burned by the failed attempt');
  const o2 = await h.loginOptions();
  assert.equal((await h.login(auth.get(o2, { origin: h.origin, rpId: 'evil.example' }))).status, 400);
  const reasons = (await events(h.pool)).filter((e) => /passkey_.*fail/.test(e.event)).map((e) => e.detail.reason);
  for (const r of ['verify:origin', 'verify:rp_id', 'origin', 'rp_id']) assert.ok(reasons.includes(r), r);
}));

pgTest('counter regression is rejected and audited; stored counter unchanged', () => withApp(async (h) => {
  const st = await h.newStudent({ email: 'c@example.com' });
  const auth = createSoftAuthenticator();
  assert.equal((await h.register(st, auth)).status, 200);
  assert.equal((await h.login(auth.get(await h.loginOptions(), { origin: h.origin, counter: 5 }))).status, 200);
  assert.equal((await h.login(auth.get(await h.loginOptions(), { origin: h.origin, counter: 5 }))).status, 400);
  assert.equal((await h.login(auth.get(await h.loginOptions(), { origin: h.origin, counter: 3 }))).status, 400);
  assert.equal(Number((await h.pool.query('SELECT sign_count FROM webauthn_credentials')).rows[0].sign_count), 5);
  assert.equal((await events(h.pool)).filter((e) => e.event === 'passkey_counter_regression').length, 2);
  assert.equal((await h.login(auth.get(await h.loginOptions(), { origin: h.origin, counter: 6 }))).status, 200);
}));

pgTest('unknown credential → generic failure; email hint gives identical options and is enforced', () => withApp(async (h) => {
  const st = await h.newStudent({ email: 'known@example.com' });
  const auth = createSoftAuthenticator();
  assert.equal((await h.register(st, auth)).status, 200);
  const stranger = createSoftAuthenticator();
  const r = await h.login(stranger.get(await h.loginOptions(), { origin: h.origin }));
  assert.equal(r.status, 400);
  const body = await r.json();

  const shape = (o) => ({ ...o, challenge: '*' });
  const a = await h.loginOptions({ email: 'known@example.com' });
  const b = await h.loginOptions({ email: 'nobody@example.com' });
  const c = await h.loginOptions();
  assert.deepEqual(shape(a), shape(b));
  assert.deepEqual(shape(a), shape(c));
  // hint for someone else → same generic error as unknown credential
  const r2 = await h.login(auth.get(b, { origin: h.origin }));
  assert.equal(r2.status, 400);
  assert.deepEqual(await r2.json(), body);
  assert.equal((await h.login(auth.get(a, { origin: h.origin }))).status, 200);
  const reasons = (await events(h.pool)).filter((e) => e.event === 'passkey_signin_fail').map((e) => e.detail.reason);
  assert.ok(reasons.includes('unknown_credential') && reasons.includes('hint_mismatch'));
  // audit never stores the raw email or credential id
  const dump = JSON.stringify((await h.pool.query('SELECT * FROM auth_audit')).rows);
  assert.ok(!dump.includes('known@example.com') && !dump.includes(auth.id));
}));

pgTest('delete: own passkeys only; last-method guard without a verified email', () => withApp(async (h) => {
  const solo = await h.newStudent({ email: 'unverified@example.com', verified: false });
  const k1 = createSoftAuthenticator(), k2 = createSoftAuthenticator();
  assert.equal((await h.register(solo, k1)).status, 200);
  assert.equal((await h.register(solo, k2)).status, 200);
  assert.equal((await h.call('DELETE', `/api/v2/auth/passkeys/${k1.id}`, { cookie: solo.cookie })).status, 200);
  const blocked = await h.call('DELETE', `/api/v2/auth/passkeys/${k2.id}`, { cookie: solo.cookie });
  assert.equal(blocked.status, 409);
  assert.equal((await h.pool.query(`SELECT count(*)::int n FROM webauthn_credentials`)).rows[0].n, 1);
  assert.ok((await events(h.pool)).some((e) => e.event === 'passkey_delete_blocked'));

  const other = await h.newStudent({ email: 'other@example.com' });
  assert.equal((await h.call('DELETE', `/api/v2/auth/passkeys/${k2.id}`, { cookie: other.cookie })).status, 404);
  assert.equal((await h.call('DELETE', `/api/v2/auth/passkeys/${k2.id}`)).status, 401);
  assert.equal((await h.call('DELETE', `/api/v2/auth/passkeys/${k2.id}`, { cookie: solo.cookie, hdrs: { origin: 'https://evil.example' } })).status, 403);

  // with a verified email, the last passkey can go
  const k3 = createSoftAuthenticator();
  assert.equal((await h.register(other, k3)).status, 200);
  assert.equal((await h.call('DELETE', `/api/v2/auth/passkeys/${k3.id}`, { cookie: other.cookie })).status, 200);
  assert.equal((await (await h.call('GET', '/api/v2/auth/passkeys', { cookie: other.cookie })).json()).passkeys.length, 0);
}));

pgTest('production with missing RP config fails closed (503) and issues no challenge', () => withApp(async (h) => {
  h.env.NODE_ENV = 'production'; delete h.env.PILOTLOG_RP_ID;
  assert.equal((await h.call('POST', '/api/v2/auth/passkey/login/options', { body: {} })).status, 503);
  assert.equal((await h.pool.query(`SELECT count(*)::int n FROM auth_challenges`)).rows[0].n, 0);
}));
