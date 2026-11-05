/**
 * Hardening: client IP from X-Forwarded-For with a trusted-hop count, and Postgres-backed rate limits on
 * passkey + wallet challenge routes. No network. Postgres tests need PILOTLOG_TEST_DATABASE_URL.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import pg from 'pg';
import * as L from '@midnight-ntwrk/ledger-v8';
import { UnshieldedAddress } from '@midnight-ntwrk/wallet-sdk-address-format';
import { clientIp, trustedHops } from '../pilotlog-cli/src/lib/accounts/clientIp.mjs';
import { challengeLimitConfig } from '../pilotlog-cli/src/lib/accounts/challengeLimits.mjs';
import { migrate } from '../pilotlog-cli/src/db.mjs';
import { migrateAccountsV2 } from '../pilotlog-cli/src/lib/accounts/schemaV2.mjs';
import { registerAccountsV2 } from '../pilotlog-cli/src/lib/accounts/http.mjs';
import { createSession } from '../pilotlog-cli/src/lib/accounts/sessions.mjs';
import { newStudentId } from '../pilotlog-cli/src/lib/accounts/ids.mjs';

const TEST_DB = process.env.PILOTLOG_TEST_DATABASE_URL;
const pgTest = TEST_DB ? test : test.skip;
const req = (xff, remote = '10.0.0.9', extra = {}) => ({ headers: { ...(xff === undefined ? {} : { 'x-forwarded-for': xff }), ...extra }, socket: { remoteAddress: remote } });

// ── clientIp (always) ────────────────────────────────────────────────────────
test('clientIp: default 1 hop takes the rightmost XFF entry; client-supplied leftmost entries are ignored', () => {
  assert.equal(clientIp(req('203.0.113.7'), {}), '203.0.113.7');
  assert.equal(clientIp(req('6.6.6.6, 203.0.113.7'), {}), '203.0.113.7', 'spoofed leftmost ignored');
  assert.equal(clientIp(req('1.1.1.1,2.2.2.2 , 203.0.113.7'), {}), '203.0.113.7');
  assert.equal(clientIp(req(['6.6.6.6', '203.0.113.7']), {}), '203.0.113.7', 'repeated header');
});

test('clientIp: hop count, fallbacks, malformed values', () => {
  const e = (h) => ({ PILOTLOG_TRUSTED_PROXY_HOPS: String(h) });
  assert.equal(clientIp(req('6.6.6.6, 203.0.113.7, 10.1.1.1'), e(2)), '203.0.113.7');
  assert.equal(clientIp(req('203.0.113.7'), e(2)), '10.0.0.9', 'fewer entries than hops → socket');
  assert.equal(clientIp(req('203.0.113.7'), e(0)), '10.0.0.9', 'hops=0 ignores XFF');
  for (const bad of ['', ' , ', 'garbage', 'unknown', '999.1.1.1', '<script>'])
    assert.equal(clientIp(req(bad), {}), '10.0.0.9', JSON.stringify(bad));
  assert.equal(clientIp(req(undefined), {}), '10.0.0.9');
  assert.equal(clientIp(req(undefined, '::ffff:192.0.2.5'), {}), '192.0.2.5');
  assert.equal(clientIp(req('203.0.113.7:5555'), {}), '203.0.113.7');
  assert.equal(clientIp(req('[2001:DB8::1]:443'), {}), '2001:db8::1');
  assert.equal(clientIp({ headers: {}, socket: {} }, {}), null);
  for (const v of ['-1', 'x', '11', '']) assert.equal(trustedHops({ PILOTLOG_TRUSTED_PROXY_HOPS: v }), 1, v);
  assert.equal(trustedHops({}), 1);
  // opt-in X-Real-IP (Railway edge sets it)
  assert.equal(clientIp(req('6.6.6.6', '10.0.0.9', { 'x-real-ip': '198.51.100.4' }), { PILOTLOG_CLIENT_IP_HEADER: 'x-real-ip' }), '198.51.100.4');
  assert.equal(clientIp(req('6.6.6.6', '10.0.0.9', { 'x-real-ip': 'nope' }), { PILOTLOG_CLIENT_IP_HEADER: 'x-real-ip' }), '10.0.0.9');
});

test('challenge limit config defaults and overrides', () => {
  assert.deepEqual(challengeLimitConfig({}), { windowMs: 900000, maxPerIp: 20, maxPerSubject: 10 });
  assert.deepEqual(challengeLimitConfig({ PILOTLOG_CHALLENGE_WINDOW_MS: '60000', PILOTLOG_CHALLENGE_MAX_PER_IP: '5', PILOTLOG_CHALLENGE_MAX_PER_SUBJECT: 'x' }),
    { windowMs: 60000, maxPerIp: 5, maxPerSubject: 10 });
});

test('flag off: challenge routes still 404', async () => {
  const app = express(); app.use(express.json());
  registerAccountsV2(app, { pool: {}, env: {} });
  const srv = await new Promise((r) => { const x = app.listen(0, '127.0.0.1', () => r(x)); });
  const base = `http://127.0.0.1:${srv.address().port}`;
  try {
    for (const p of ['/api/v2/auth/passkey/register/options', '/api/v2/auth/passkey/login/options', '/api/v2/auth/wallet/challenge'])
      assert.equal((await fetch(base + p, { method: 'POST', headers: { origin: base } })).status, 404, p);
  } finally { await new Promise((r) => srv.close(r)); }
});

// ── Rate limits (Postgres) ──────────────────────────────────────────────────
function walletAddress() {
  const vk = L.signatureVerifyingKey(L.sampleSigningKey());
  return UnshieldedAddress.codec.encode('preprod', new UnshieldedAddress(Buffer.from(L.addressFromKey(vk), 'hex'))).asString();
}
async function withApp(envExtra, fn) {
  const schema = `h_${process.pid}_${Math.random().toString(36).slice(2, 10)}`;
  const admin = new pg.Pool({ connectionString: TEST_DB, max: 1 });
  await admin.query(`CREATE SCHEMA ${schema}`);
  const u = new URL(TEST_DB); u.searchParams.set('options', `-c search_path=${schema}`);
  const pool = new pg.Pool({ connectionString: u.toString(), max: 8 });
  const env = { PILOTLOG_ACCOUNTS_V2: 'true', PILOTLOG_COOKIE_SECURE: 'false', PILOTLOG_EMAIL_PROVIDER: 'test', ...envExtra };
  try {
    await migrate(pool); await migrateAccountsV2(pool);
    const app = express(); app.use(express.json());
    registerAccountsV2(app, { pool, env, cleanupEveryMs: 0 });
    const srv = await new Promise((r) => { const x = app.listen(0, '127.0.0.1', () => r(x)); });
    const port = srv.address().port, base = `http://127.0.0.1:${port}`;
    env.PILOTLOG_PUBLIC_URL = `http://localhost:${port}`; env.PILOTLOG_RP_ID = 'localhost';
    const post = (p, { body = {}, xff, cookie } = {}) => fetch(base + p, { method: 'POST', body: JSON.stringify(body),
      headers: { 'content-type': 'application/json', origin: base, ...(xff ? { 'x-forwarded-for': xff } : {}), ...(cookie ? { cookie } : {}) } });
    const student = async () => {
      const id = newStudentId(); await pool.query(`INSERT INTO students (id) VALUES ($1)`, [id]);
      return { id, cookie: `pl_sid=${(await createSession(pool, { studentId: id })).token}` };
    };
    try { return await fn({ pool, post, student }); } finally { await new Promise((r) => srv.close(r)); }
  } finally { await pool.end(); await admin.query(`DROP SCHEMA ${schema} CASCADE`); await admin.end(); }
}

async function expect429(res) {
  assert.equal(res.status, 429);
  const ra = Number(res.headers.get('retry-after'));
  assert.ok(Number.isInteger(ra) && ra >= 1 && ra <= 900, `Retry-After ${ra}`);
  assert.deepEqual(await res.json(), { error: 'Too many requests. Wait a few minutes and try again.' });
}

pgTest('per-IP limit on every challenge route → 429 + Retry-After; spoofed leftmost XFF cannot dodge it', () =>
  withApp({ PILOTLOG_CHALLENGE_MAX_PER_IP: '2', PILOTLOG_CHALLENGE_MAX_PER_SUBJECT: '100' }, async (h) => {
    const st = await h.student();
    const routes = [
      ['passkey register', (xff) => h.post('/api/v2/auth/passkey/register/options', { xff, cookie: st.cookie })],
      ['passkey login', (xff) => h.post('/api/v2/auth/passkey/login/options', { xff })],
      ['wallet challenge', (xff) => h.post('/api/v2/auth/wallet/challenge', { xff, body: { address: walletAddress(), intent: 'login' } })],
    ];
    for (const [name, call] of routes) {
      assert.equal((await call(`${name.length}.1.1.1, 203.0.113.7`)).status, 200, name);
      assert.equal((await call(`9.9.9.9, 203.0.113.7`)).status, 200, name);
      await expect429(await call(`77.7.7.7, 203.0.113.7`)); // new spoofed leftmost value, same real client
      assert.equal((await call('198.51.100.1')).status, 200, `${name}: a different real client is unaffected`);
    }
    const ev = (await h.pool.query(`SELECT detail FROM auth_audit WHERE event = 'challenge_rate_limited'`)).rows.map((r) => r.detail.route).sort();
    assert.deepEqual(ev, ['passkey_login_options', 'passkey_register_options', 'wallet_challenge']);
    // raw IPs are never stored
    const dump = JSON.stringify((await h.pool.query('SELECT * FROM auth_challenges')).rows) + JSON.stringify((await h.pool.query('SELECT * FROM auth_audit')).rows);
    assert.ok(!dump.includes('203.0.113.7') && !dump.includes('198.51.100.1'));
  }));

pgTest('per-subject limits: one student (passkey register) and one wallet address across IPs', () =>
  withApp({ PILOTLOG_CHALLENGE_MAX_PER_IP: '100', PILOTLOG_CHALLENGE_MAX_PER_SUBJECT: '2' }, async (h) => {
    const st = await h.student();
    for (const ip of ['198.51.100.1', '198.51.100.2']) assert.equal((await h.post('/api/v2/auth/passkey/register/options', { xff: ip, cookie: st.cookie })).status, 200);
    await expect429(await h.post('/api/v2/auth/passkey/register/options', { xff: '198.51.100.3', cookie: st.cookie }));
    const other = await h.student();
    assert.equal((await h.post('/api/v2/auth/passkey/register/options', { xff: '198.51.100.3', cookie: other.cookie })).status, 200);
    const addr = walletAddress();
    for (const ip of ['198.51.100.4', '198.51.100.5']) assert.equal((await h.post('/api/v2/auth/wallet/challenge', { xff: ip, body: { address: addr } })).status, 200);
    await expect429(await h.post('/api/v2/auth/wallet/challenge', { xff: '198.51.100.6', body: { address: addr, intent: 'login' } }));
    assert.equal((await h.post('/api/v2/auth/wallet/challenge', { xff: '198.51.100.6', body: { address: walletAddress() } })).status, 200);
    // passkey login has no per-subject limit (shared subject; email hint must not change the response)
    for (let i = 0; i < 4; i++) assert.equal((await h.post('/api/v2/auth/passkey/login/options', { xff: `198.51.100.${10 + i}`, body: { email: 'a@example.com' } })).status, 200);
  }));

pgTest('limits reset after the window', () =>
  withApp({ PILOTLOG_CHALLENGE_MAX_PER_IP: '1', PILOTLOG_CHALLENGE_WINDOW_MS: '1500' }, async (h) => {
    const call = () => h.post('/api/v2/auth/passkey/login/options', { xff: '203.0.113.9' });
    assert.equal((await call()).status, 200);
    const r = await call();
    assert.equal(r.status, 429);
    assert.ok(Number(r.headers.get('retry-after')) <= 2);
    await new Promise((res) => setTimeout(res, 1700));
    assert.equal((await call()).status, 200);
  }));

pgTest('magic link still uses the rightmost XFF entry for its per-IP limit', () =>
  withApp({ PILOTLOG_MAGIC_LINK_MAX_PER_IP: '1' }, async (h) => {
    await h.post('/api/v2/auth/email/start', { xff: '6.6.6.6, 203.0.113.20', body: { email: 'one@example.com' } });
    await h.post('/api/v2/auth/email/start', { xff: '7.7.7.7, 203.0.113.20', body: { email: 'two@example.com' } });
    const ev = (await h.pool.query(`SELECT event, detail FROM auth_audit WHERE event LIKE 'magic_link%' ORDER BY id`)).rows;
    assert.deepEqual(ev.map((e) => e.event), ['magic_link_request', 'magic_link_rate_limited']);
    assert.equal(ev[1].detail.by, 'ip');
  }));
