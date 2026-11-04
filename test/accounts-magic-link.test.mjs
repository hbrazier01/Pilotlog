/**
 * Accounts v2 PR-3: email adapter + magic-link sign-in. No network: Postmark is tested with a mocked
 * fetch, the flow uses the in-memory test provider. Postgres tests need PILOTLOG_TEST_DATABASE_URL.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import pg from 'pg';
import { selectEmailProvider, EmailConfigError, DEFAULT_FROM } from '../pilotlog-cli/src/lib/accounts/email/index.mjs';
import { createPostmarkProvider, POSTMARK_URL } from '../pilotlog-cli/src/lib/accounts/email/postmark.mjs';
import { createTestProvider } from '../pilotlog-cli/src/lib/accounts/email/test.mjs';
import { normalizeEmail } from '../pilotlog-cli/src/lib/accounts/magicLink.mjs';
import { publicBaseUrl } from '../pilotlog-cli/src/lib/accounts/emailRoutes.mjs';
import { migrate } from '../pilotlog-cli/src/db.mjs';
import { migrateAccountsV2 } from '../pilotlog-cli/src/lib/accounts/schemaV2.mjs';
import { registerAccountsV2 } from '../pilotlog-cli/src/lib/accounts/http.mjs';
import { loadSession } from '../pilotlog-cli/src/lib/accounts/sessions.mjs';

const TEST_DB = process.env.PILOTLOG_TEST_DATABASE_URL;
const pgTest = TEST_DB ? test : test.skip;
const FAKE_TOKEN = 'fake-postmark-token-for-tests';
const quiet = { log: () => {}, warn: () => {} };

// ── Adapter selection (always) ───────────────────────────────────────────────
test('selectEmailProvider: dev defaults to console; test; postmark w/o token falls back to console', () => {
  assert.equal(selectEmailProvider({}, quiet).name, 'console');
  assert.equal(selectEmailProvider({ NODE_ENV: 'development', POSTMARK_SERVER_TOKEN: FAKE_TOKEN }, quiet).name, 'console');
  assert.equal(selectEmailProvider({ PILOTLOG_EMAIL_PROVIDER: 'test' }, quiet).name, 'test');
  let warned = '';
  assert.equal(selectEmailProvider({ PILOTLOG_EMAIL_PROVIDER: 'postmark' }, { log() {}, warn: (m) => { warned = m; } }).name, 'console');
  assert.match(warned, /not set; using console/);
  assert.equal(selectEmailProvider({ PILOTLOG_EMAIL_PROVIDER: 'postmark', POSTMARK_SERVER_TOKEN: FAKE_TOKEN }, quiet).name, 'postmark');
  assert.throws(() => selectEmailProvider({ PILOTLOG_EMAIL_PROVIDER: 'sendgrid' }), EmailConfigError);
});

test('selectEmailProvider: production is Postmark-only and fails closed without a token', () => {
  assert.equal(selectEmailProvider({ NODE_ENV: 'production', POSTMARK_SERVER_TOKEN: FAKE_TOKEN }).name, 'postmark');
  assert.throws(() => selectEmailProvider({ NODE_ENV: 'production' }), /POSTMARK_SERVER_TOKEN is not set/);
  assert.throws(() => selectEmailProvider({ NODE_ENV: 'production', PILOTLOG_EMAIL_PROVIDER: 'console', POSTMARK_SERVER_TOKEN: FAKE_TOKEN }), /not allowed in production/);
  assert.throws(() => selectEmailProvider({ NODE_ENV: 'production', PILOTLOG_EMAIL_PROVIDER: 'test', POSTMARK_SERVER_TOKEN: FAKE_TOKEN }), /not allowed in production/);
  try { selectEmailProvider({ NODE_ENV: 'production' }); } catch (e) { assert.ok(!String(e.message).includes(FAKE_TOKEN)); }
});

test('Postmark request shape (mocked fetch), default From, MessageStream outbound', async () => {
  const calls = [];
  const fetchImpl = async (url, init) => { calls.push({ url, init }); return new Response(JSON.stringify({ ErrorCode: 0, MessageID: 'm-1' }), { status: 200 }); };
  const p = selectEmailProvider({ NODE_ENV: 'production', POSTMARK_SERVER_TOKEN: FAKE_TOKEN }, { fetchImpl });
  const r = await p.send({ to: 'a@example.com', subject: 'S', text: 'T', html: '<p>H</p>' });
  assert.deepEqual(r, { id: 'm-1' });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, POSTMARK_URL);
  assert.equal(calls[0].url, 'https://api.postmarkapp.com/email');
  assert.equal(calls[0].init.method, 'POST');
  assert.equal(calls[0].init.headers['X-Postmark-Server-Token'], FAKE_TOKEN);
  assert.equal(calls[0].init.headers['Content-Type'], 'application/json');
  assert.deepEqual(JSON.parse(calls[0].init.body), { From: DEFAULT_FROM, To: 'a@example.com', Subject: 'S', TextBody: 'T', HtmlBody: '<p>H</p>', MessageStream: 'outbound' });
  assert.equal(DEFAULT_FROM, 'support@digitalaviationpool.com');
  const p2 = selectEmailProvider({ NODE_ENV: 'production', POSTMARK_SERVER_TOKEN: FAKE_TOKEN, PILOTLOG_EMAIL_FROM: 'PilotLog <hi@example.org>' }, { fetchImpl });
  await p2.send({ to: 'b@example.com', subject: 'S', text: 'T', html: 'H' });
  assert.equal(JSON.parse(calls[1].init.body).From, 'PilotLog <hi@example.org>');
});

test('Postmark errors carry status + ErrorCode only (no token, no body)', async () => {
  const fetchImpl = async () => new Response(JSON.stringify({ ErrorCode: 406, Message: 'Inactive recipient a@example.com' }), { status: 422 });
  const p = createPostmarkProvider({ token: FAKE_TOKEN, from: DEFAULT_FROM, fetchImpl });
  await assert.rejects(p.send({ to: 'a@example.com', subject: 's', text: 'https://x/verify?token=SECRET', html: '' }), (e) => {
    assert.equal(e.message, 'postmark send failed: HTTP 422 ErrorCode 406');
    assert.ok(!e.message.includes(FAKE_TOKEN) && !e.message.includes('SECRET') && !e.message.includes('a@example.com'));
    return true;
  });
  assert.throws(() => createPostmarkProvider({ token: '', from: DEFAULT_FROM }), /POSTMARK_SERVER_TOKEN/);
});

test('normalizeEmail + publicBaseUrl', () => {
  assert.equal(normalizeEmail('  Pilot.One+cfi@Example.COM '), 'pilot.one+cfi@example.com');
  for (const bad of ['', 'nope', 'a@b', 'a b@example.com', 'a@exa_mple.com', '<a@example.com>', null, 42, 'x'.repeat(65) + '@example.com'])
    assert.equal(normalizeEmail(bad), null, String(bad));
  const req = { protocol: 'http', headers: { host: 'localhost:8788' } };
  assert.equal(publicBaseUrl(req, {}), 'http://localhost:8788');
  assert.equal(publicBaseUrl(req, { PILOTLOG_PUBLIC_URL: 'https://pilotlog.example.com/x' }), 'https://pilotlog.example.com');
  assert.throws(() => publicBaseUrl(req, { NODE_ENV: 'production' }), /required in production/);
  assert.throws(() => publicBaseUrl(req, { NODE_ENV: 'production', PILOTLOG_PUBLIC_URL: 'http://pilotlog.example.com' }), /https/);
});

test('flag off: no email routes', async () => {
  const app = express(); app.use(express.json());
  registerAccountsV2(app, { pool: {}, env: {} });
  const s = await serve(app);
  try { assert.equal((await fetch(`${s.base}/api/v2/auth/email/start`, { method: 'POST' })).status, 404); } finally { await s.close(); }
});

// ── Flow (Postgres) ──────────────────────────────────────────────────────────
async function serve(app) {
  const srv = await new Promise((r) => { const x = app.listen(0, '127.0.0.1', () => r(x)); });
  return { base: `http://127.0.0.1:${srv.address().port}`, close: () => new Promise((r) => srv.close(r)) };
}

async function withApp(envExtra, fn) {
  const schema = `m_${process.pid}_${Math.random().toString(36).slice(2, 10)}`;
  const admin = new pg.Pool({ connectionString: TEST_DB, max: 1 });
  await admin.query(`CREATE SCHEMA ${schema}`);
  const u = new URL(TEST_DB); u.searchParams.set('options', `-c search_path=${schema}`);
  const pool = new pg.Pool({ connectionString: u.toString(), max: 8 });
  const provider = createTestProvider();
  const deliveries = [];
  const env = { PILOTLOG_ACCOUNTS_V2: 'true', PILOTLOG_COOKIE_SECURE: 'false', ...envExtra };
  try {
    await migrate(pool); await migrateAccountsV2(pool);
    const app = express(); app.use(express.json());
    registerAccountsV2(app, { pool, env, cleanupEveryMs: 0, emailProvider: envExtra.__noProvider ? undefined : provider,
      onMagicLinkStart: (r) => deliveries.push(r) });
    const s = await serve(app);
    const h = {
      base: s.base, pool, provider,
      settle: () => Promise.all(deliveries.map((d) => d.delivery)),
      start: (email, headers = {}) => fetch(`${s.base}/api/v2/auth/email/start`, { method: 'POST',
        headers: { 'content-type': 'application/json', origin: s.base, ...headers }, body: JSON.stringify({ email }) }),
      verifyJson: (token, headers = {}) => fetch(`${s.base}/api/v2/auth/email/verify`, { method: 'POST',
        headers: { 'content-type': 'application/json', origin: s.base, ...headers }, body: JSON.stringify({ token }) }),
      lastToken: () => new URL(provider.outbox.at(-1).text.match(/https?:\/\/\S+/)[0]).searchParams.get('token'),
    };
    try { return await fn(h); } finally { await s.close(); }
  } finally {
    await pool.end(); await admin.query(`DROP SCHEMA ${schema} CASCADE`); await admin.end();
  }
}
const cookieOf = (res) => (res.headers.get('set-cookie') || '').split(';')[0];

pgTest('happy path: start → email → GET confirm page (no consume) → POST verify → session; second sign-in reuses student', () => withApp({}, async (h) => {
  const r = await h.start('  Student@Example.com ');
  assert.equal(r.status, 202);
  await h.settle();
  assert.equal(h.provider.outbox.length, 1);
  assert.equal(h.provider.outbox[0].to, 'student@example.com');
  const token = h.lastToken();
  assert.match(token, /^[A-Za-z0-9_-]{43}$/);
  // only the hash is stored; raw token appears nowhere in the DB
  const dump = JSON.stringify((await h.pool.query('SELECT * FROM auth_challenges')).rows) + JSON.stringify((await h.pool.query('SELECT * FROM auth_audit')).rows);
  assert.ok(!dump.includes(token));
  assert.ok(!JSON.stringify((await h.pool.query('SELECT * FROM auth_audit')).rows).includes('student@example.com'));
  // GET renders a confirm page and does not consume (scanner-safe)
  for (let i = 0; i < 3; i++) {
    const g = await fetch(`${h.base}/api/v2/auth/email/verify?token=${token}`);
    assert.equal(g.status, 200);
    const html = await g.text();
    assert.match(html, /<form method="post" action="\/api\/v2\/auth\/email\/verify">/);
    assert.equal(g.headers.get('referrer-policy'), 'no-referrer');
    assert.match(g.headers.get('content-security-policy'), /form-action 'self'/);
  }
  const { rows: [c] } = await h.pool.query('SELECT consumed_at FROM auth_challenges');
  assert.equal(c.consumed_at, null);
  // form POST (as the confirm page does) → 303 + cookie
  const v = await fetch(`${h.base}/api/v2/auth/email/verify`, { method: 'POST', redirect: 'manual',
    headers: { 'content-type': 'application/x-www-form-urlencoded', origin: h.base }, body: `token=${token}` });
  assert.equal(v.status, 303);
  assert.equal(v.headers.get('location'), '/cockpit');
  const sc = v.headers.get('set-cookie');
  assert.match(sc, /^pl_sid=[A-Za-z0-9_-]{43}; Path=\/; HttpOnly; SameSite=Lax; Max-Age=\d+$/);
  const me = await (await fetch(`${h.base}/api/v2/session`, { headers: { cookie: cookieOf(v) } })).json();
  assert.equal(me.authenticated, true);
  const ids = (await h.pool.query(`SELECT student_id, type, subject, verified_at FROM identities`)).rows;
  assert.equal(ids.length, 1);
  assert.equal(ids[0].type, 'email'); assert.equal(ids[0].subject, 'student@example.com'); assert.ok(ids[0].verified_at);
  assert.equal(me.studentId, ids[0].student_id);
  // second sign-in → same student, created=false; previous session revoked (rotation)
  await h.start('student@example.com'); await h.settle();
  const v2 = await h.verifyJson(h.lastToken(), { cookie: cookieOf(v) });
  assert.deepEqual(await v2.json(), { ok: true, studentId: me.studentId, created: false });
  assert.equal(await loadSession(h.pool, cookieOf(v).split('=')[1]), null);
  const ev = (await h.pool.query(`SELECT event FROM auth_audit ORDER BY id`)).rows.map((r) => r.event);
  for (const e of ['challenge_issue', 'magic_link_request', 'challenge_consume', 'signup', 'session_create', 'signin', 'session_revoke']) assert.ok(ev.includes(e), e);
}));

pgTest('replay, wrong token, and expiry are rejected with one generic message', () => withApp({ PILOTLOG_MAGIC_LINK_TTL_MS: '200' }, async (h) => {
  await h.start('r@example.com'); await h.settle();
  const t = h.lastToken();
  assert.equal((await h.verifyJson(t)).status, 200);
  const replay = await h.verifyJson(t);
  assert.equal(replay.status, 400);
  const msg = (await replay.json()).error;
  const wrong = await h.verifyJson('A'.repeat(43));
  assert.equal(wrong.status, 400); assert.equal((await wrong.json()).error, msg);
  assert.equal((await h.verifyJson('short')).status, 400);
  assert.equal((await fetch(`${h.base}/api/v2/auth/email/verify?token=%3Cscript%3E`)).status, 400);
  await h.start('r@example.com'); await h.settle();
  const t2 = h.lastToken();
  await new Promise((r) => setTimeout(r, 300));
  const exp = await h.verifyJson(t2);
  assert.equal(exp.status, 400); assert.equal((await exp.json()).error, msg);
  assert.equal(exp.headers.get('set-cookie'), null);
  const fails = (await h.pool.query(`SELECT count(*)::int n FROM auth_audit WHERE event = 'challenge_fail'`)).rows[0].n;
  assert.ok(fails >= 4);
}));

pgTest('no enumeration: identical 202 for new, existing, and rate-limited emails; malformed → 400', () => withApp({}, async (h) => {
  await h.start('known@example.com'); await h.settle();
  await h.verifyJson(h.lastToken()); // known@ now has an account
  const bodies = [];
  for (const e of ['known@example.com', 'brand-new@example.com']) {
    const r = await h.start(e);
    bodies.push({ status: r.status, body: await r.text(), cookie: r.headers.get('set-cookie') });
  }
  assert.deepEqual(bodies[0], bodies[1]);
  assert.equal(bodies[0].status, 202); assert.equal(bodies[0].cookie, null);
  assert.equal((await h.start('not-an-email')).status, 400);
}));

pgTest('rate limits: per email (3/15 min) and per IP (10/15 min), still 202, nothing sent when limited', () => withApp({}, async (h) => {
  const statuses = [];
  for (let i = 0; i < 5; i++) statuses.push((await h.start('flood@example.com', { 'x-forwarded-for': `198.51.100.${i}` })).status);
  await h.settle();
  assert.deepEqual(statuses, [202, 202, 202, 202, 202]);
  assert.equal(h.provider.outbox.filter((m) => m.to === 'flood@example.com').length, 3);
  for (let i = 0; i < 12; i++) assert.equal((await h.start(`u${i}@example.com`, { 'x-forwarded-for': '203.0.113.7' })).status, 202);
  await h.settle();
  assert.equal(h.provider.outbox.filter((m) => m.to.startsWith('u')).length, 10);
  const limited = (await h.pool.query(`SELECT count(*)::int n FROM auth_audit WHERE event = 'magic_link_rate_limited'`)).rows[0].n;
  assert.equal(limited, 4);
}));

pgTest('CSRF: cross-origin start/verify rejected; signed in as A + B\'s link → 409, no session swap', () => withApp({}, async (h) => {
  assert.equal((await h.start('x@example.com', { origin: 'https://evil.example' })).status, 403);
  await h.start('a@example.com'); await h.settle();
  assert.equal((await h.verifyJson(h.lastToken(), { origin: 'https://evil.example' })).status, 403);
  const va = await h.verifyJson(h.lastToken()); // same token still usable: 403 happened before consume
  assert.equal(va.status, 200);
  await h.start('b@example.com'); await h.settle();
  const vb = await h.verifyJson(h.lastToken(), { cookie: cookieOf(va) });
  assert.equal(vb.status, 409);
  assert.equal(vb.headers.get('set-cookie'), null);
  assert.ok(await loadSession(h.pool, cookieOf(va).split('=')[1]));
  assert.equal((await h.pool.query(`SELECT count(*)::int n FROM identities WHERE subject = 'b@example.com'`)).rows[0].n, 0);
}));

pgTest('send failure is invisible to the client (still 202) and audited without the link', () => withApp({}, async (h) => {
  h.provider.failNext = true;
  const r = await h.start('fail@example.com');
  assert.equal(r.status, 202);
  assert.deepEqual(await Promise.all([h.settle()]).then(() => 'done'), 'done');
  const a = (await h.pool.query(`SELECT detail FROM auth_audit WHERE event = 'magic_link_send_fail'`)).rows;
  assert.equal(a.length, 1); assert.deepEqual(a[0].detail, { provider: 'test' });
}));

pgTest('production without POSTMARK_SERVER_TOKEN fails closed: 503, nothing issued', () => withApp({ NODE_ENV: 'production', PILOTLOG_PUBLIC_URL: 'https://pilotlog.example.com', __noProvider: true }, async (h) => {
  const r = await h.start('p@example.com');
  assert.equal(r.status, 503);
  assert.equal((await h.pool.query(`SELECT count(*)::int n FROM auth_challenges`)).rows[0].n, 0);
}));

pgTest('concurrent verify of one link: exactly one session', () => withApp({}, async (h) => {
  await h.start('c@example.com'); await h.settle();
  const t = h.lastToken();
  const rs = await Promise.all(Array.from({ length: 10 }, () => h.verifyJson(t)));
  assert.equal(rs.filter((r) => r.status === 200).length, 1);
  assert.equal((await h.pool.query(`SELECT count(*)::int n FROM sessions`)).rows[0].n, 1);
  assert.equal((await h.pool.query(`SELECT count(*)::int n FROM students`)).rows[0].n, 1);
}));
