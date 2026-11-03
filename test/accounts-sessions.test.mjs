/**
 * Accounts v2 PR-2: DB sessions, single-use challenges, audit, middleware/flag wiring.
 * Postgres tests run when PILOTLOG_TEST_DATABASE_URL is set; each uses a throwaway schema.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import express from 'express';
import pg from 'pg';
import { migrate } from '../pilotlog-cli/src/db.mjs';
import { migrateAccountsV2 } from '../pilotlog-cli/src/lib/accounts/schemaV2.mjs';
import { newStudentId } from '../pilotlog-cli/src/lib/accounts/ids.mjs';
import { sha256Hex } from '../pilotlog-cli/src/lib/accounts/crypto.mjs';
import { createSession, loadSession, revokeSession, revokeAllSessions, rotateSession, cleanupSessions } from '../pilotlog-cli/src/lib/accounts/sessions.mjs';
import { issueChallenge, consumeChallenge, cleanupChallenges } from '../pilotlog-cli/src/lib/accounts/challenges.mjs';
import { registerAccountsV2, sessionCookie, cookieConfig, parseCookies } from '../pilotlog-cli/src/lib/accounts/http.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TEST_DB = process.env.PILOTLOG_TEST_DATABASE_URL;
const pgTest = TEST_DB ? test : test.skip;
const ADDR = 'mn_addr_preprod1' + 'q'.repeat(40) + 'acd';

async function withSchema(fn) {
  const schema = `s_${process.pid}_${Math.random().toString(36).slice(2, 10)}`;
  const admin = new pg.Pool({ connectionString: TEST_DB, max: 1 });
  await admin.query(`CREATE SCHEMA ${schema}`);
  const u = new URL(TEST_DB); u.searchParams.set('options', `-c search_path=${schema}`);
  const pool = new pg.Pool({ connectionString: u.toString(), max: 12 });
  try {
    await migrate(pool); await migrateAccountsV2(pool);
    return await fn(pool, u.toString());
  } finally {
    await pool.end(); await admin.query(`DROP SCHEMA ${schema} CASCADE`); await admin.end();
  }
}
async function student(pool) { const id = newStudentId(); await pool.query('INSERT INTO students (id) VALUES ($1)', [id]); return id; }
async function dumpAll(pool) {
  const out = [];
  for (const t of ['sessions', 'auth_challenges', 'auth_audit']) out.push(JSON.stringify((await pool.query(`SELECT * FROM ${t}`)).rows));
  return out.join('\n');
}
async function serve(app) {
  const srv = await new Promise((r) => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
  return { base: `http://127.0.0.1:${srv.address().port}`, close: () => new Promise((r) => srv.close(r)) };
}

// ── Unit (always) ────────────────────────────────────────────────────────────
test('cookie: HttpOnly, SameSite=Lax, Secure + __Host- by default; insecure only when configured', () => {
  const c = sessionCookie('tok', { expiresAt: new Date(Date.now() + 60_000), env: {} });
  assert.match(c, /^__Host-pl_sid=tok; Path=\/; HttpOnly; SameSite=Lax; Secure; Max-Age=(59|60)$/);
  const d = sessionCookie('tok', { expiresAt: new Date(Date.now() + 60_000), env: { PILOTLOG_COOKIE_SECURE: 'false' } });
  assert.ok(d.startsWith('pl_sid=tok;') && !d.includes('Secure'));
  assert.equal(cookieConfig({}).name, '__Host-pl_sid');
  assert.deepEqual(parseCookies('a=1; __Host-pl_sid=xyz; b=2'), { a: '1', '__Host-pl_sid': 'xyz', b: '2' });
});

test('flag off: registerAccountsV2 adds no middleware or routes', async () => {
  const app = express(); app.use(express.json());
  const before = app.router?.stack?.length ?? app._router?.stack?.length ?? 0;
  assert.deepEqual(registerAccountsV2(app, { pool: {}, env: {} }), { enabled: false, reason: 'flag-off' });
  assert.equal(app.router?.stack?.length ?? app._router?.stack?.length ?? 0, before);
  const s = await serve(app);
  try { assert.equal((await fetch(`${s.base}/api/v2/session`)).status, 404); } finally { await s.close(); }
});

test('flag on + JSON-file mode (no pool): disabled, no routes', async () => {
  const app = express();
  assert.deepEqual(registerAccountsV2(app, { pool: null, env: { PILOTLOG_ACCOUNTS_V2: 'true' } }), { enabled: false, reason: 'file-mode' });
  const s = await serve(app);
  try { assert.equal((await fetch(`${s.base}/api/v2/session`)).status, 404); } finally { await s.close(); }
});

// ── Postgres ─────────────────────────────────────────────────────────────────
pgTest('session token is never stored in plaintext (sessions, audit)', () => withSchema(async (pool) => {
  const sid = await student(pool);
  const { token, idHash } = await createSession(pool, { studentId: sid, ip: '203.0.113.9', ua: 'ua' });
  assert.equal(idHash, sha256Hex(token));
  const all = await dumpAll(pool);
  assert.ok(!all.includes(token), 'raw token found in DB');
  assert.ok(!all.includes('203.0.113.9'), 'raw IP found in DB');
  assert.ok(all.includes(idHash));
  const s = await loadSession(pool, token);
  assert.equal(s.studentId, sid);
  assert.equal(await loadSession(pool, idHash.slice(0, 43)), null); // hash is not a usable token
}));

pgTest('absolute expiry and idle timeout are enforced', () => withSchema(async (pool) => {
  const sid = await student(pool);
  const a = await createSession(pool, { studentId: sid, absoluteMs: 1 });
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(await loadSession(pool, a.token), null);
  const b = await createSession(pool, { studentId: sid });
  await pool.query(`UPDATE sessions SET last_seen_at = now() - interval '8 days' WHERE id_hash = $1`, [b.idHash]);
  assert.equal(await loadSession(pool, b.token), null);
  const c = await createSession(pool, { studentId: sid });
  await pool.query(`UPDATE sessions SET last_seen_at = now() - interval '10 minutes' WHERE id_hash = $1`, [c.idHash]);
  assert.ok(await loadSession(pool, c.token));
  const { rows } = await pool.query(`SELECT last_seen_at > now() - interval '1 minute' AS fresh FROM sessions WHERE id_hash = $1`, [c.idHash]);
  assert.equal(rows[0].fresh, true); // touched (sliding idle window)
  await pool.query(`UPDATE students SET status = 'merged' WHERE id = $1`, [sid]);
  assert.equal(await loadSession(pool, c.token), null); // merged/deleted students can't use sessions
}));

pgTest('revoke one, revoke all (except current), rotate on privilege change', () => withSchema(async (pool) => {
  const sid = await student(pool);
  const s1 = await createSession(pool, { studentId: sid });
  const s2 = await createSession(pool, { studentId: sid });
  const s3 = await createSession(pool, { studentId: sid });
  assert.equal(await revokeSession(pool, { token: s1.token }), true);
  assert.equal(await revokeSession(pool, { token: s1.token }), false);
  assert.equal(await loadSession(pool, s1.token), null);
  assert.equal(await revokeAllSessions(pool, sid, { exceptIdHash: s3.idHash }), 1);
  assert.equal(await loadSession(pool, s2.token), null);
  assert.ok(await loadSession(pool, s3.token));
  const r = await rotateSession(pool, s3.token, { reason: 'link' });
  assert.ok(r && r.token !== s3.token);
  assert.equal(await loadSession(pool, s3.token), null);
  assert.equal((await loadSession(pool, r.token)).studentId, sid);
  assert.equal(await rotateSession(pool, s3.token), null);
  // concurrent rotate of the same session: exactly one winner
  const results = await Promise.all(Array.from({ length: 8 }, () => rotateSession(pool, r.token)));
  assert.equal(results.filter(Boolean).length, 1);
  const ev = (await pool.query(`SELECT event, count(*)::int n FROM auth_audit GROUP BY event`)).rows;
  const m = Object.fromEntries(ev.map((e) => [e.event, e.n]));
  assert.ok(m.session_create >= 5 && m.session_revoke >= 1 && m.session_revoke_all === 1 && m.session_rotate === 2);
}));

pgTest('challenge is single-use under concurrency (20 parallel consumers, 1 winner)', () => withSchema(async (pool) => {
  const { nonce } = await issueChallenge(pool, { purpose: 'sign-in', subject: ADDR });
  const results = await Promise.all(Array.from({ length: 20 }, () => consumeChallenge(pool, { nonce, purpose: 'sign-in', subject: ADDR })));
  assert.equal(results.filter((r) => r.ok).length, 1);
  assert.ok(results.filter((r) => !r.ok).every((r) => r.reason === 'not_found_or_used_or_expired'));
  const all = await dumpAll(pool);
  assert.ok(!all.includes(nonce), 'raw nonce found in DB');
  const audit = JSON.stringify((await pool.query('SELECT * FROM auth_audit')).rows);
  assert.ok(!audit.includes(ADDR), 'raw subject found in audit');
}));

pgTest('intent/subject/student mismatch rejected and burns the nonce; expiry; cleanup', () => withSchema(async (pool) => {
  const sid = await student(pool), other = await student(pool);
  const a = await issueChallenge(pool, { purpose: 'link-wallet', subject: ADDR, studentId: sid });
  assert.deepEqual(await consumeChallenge(pool, { nonce: a.nonce, purpose: 'sign-in', subject: ADDR }), { ok: false, reason: 'purpose_mismatch' });
  assert.equal((await consumeChallenge(pool, { nonce: a.nonce, purpose: 'link-wallet', subject: ADDR, studentId: sid })).ok, false); // burned
  const b = await issueChallenge(pool, { purpose: 'link-wallet', subject: ADDR, studentId: sid });
  assert.equal((await consumeChallenge(pool, { nonce: b.nonce, purpose: 'link-wallet', subject: ADDR, studentId: other })).reason, 'student_mismatch');
  const c = await issueChallenge(pool, { purpose: 'merge', subject: 'x@example.com' });
  assert.equal((await consumeChallenge(pool, { nonce: c.nonce, purpose: 'merge', subject: 'y@example.com' })).reason, 'subject_mismatch');
  const d = await issueChallenge(pool, { purpose: 'webauthn-auth', subject: sid, ttlMs: 1 });
  await new Promise((r) => setTimeout(r, 20));
  assert.equal((await consumeChallenge(pool, { nonce: d.nonce, purpose: 'webauthn-auth', subject: sid })).reason, 'not_found_or_used_or_expired');
  const e = await issueChallenge(pool, { purpose: 'email-magic-link', subject: 'z@example.com', studentId: sid, payload: { intent: 'signin' } });
  const ok = await consumeChallenge(pool, { nonce: e.nonce, purpose: 'email-magic-link', subject: 'z@example.com', studentId: sid });
  assert.deepEqual(ok, { ok: true, purpose: 'email-magic-link', subject: 'z@example.com', studentId: sid, payload: { intent: 'signin' } });
  await assert.rejects(issueChallenge(pool, { purpose: 'bogus', subject: 's' }), /unknown purpose/);
  assert.equal((await consumeChallenge(pool, { nonce: 'short', purpose: 'sign-in' })).reason, 'invalid');
  // cleanup removes expired/consumed rows past grace, keeps live ones
  const live = await issueChallenge(pool, { purpose: 'sign-in', subject: ADDR });
  assert.ok((await cleanupChallenges(pool, { graceMs: 1 })) >= 5);
  const { rows } = await pool.query(`SELECT count(*)::int n FROM auth_challenges`);
  assert.equal(rows[0].n, 1);
  assert.equal((await consumeChallenge(pool, { nonce: live.nonce, purpose: 'sign-in', subject: ADDR })).ok, true);
  const s = await createSession(pool, { studentId: sid, absoluteMs: 1 });
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(await cleanupSessions(pool, { graceMs: 1 }), 1);
  // audit: issue/consume/fail recorded with hashed subjects only
  const audit = (await pool.query(`SELECT event, identity_subject_hash, detail FROM auth_audit WHERE event LIKE 'challenge_%'`)).rows;
  assert.ok(audit.some((r) => r.event === 'challenge_fail') && audit.some((r) => r.event === 'challenge_consume') && audit.some((r) => r.event === 'challenge_issue'));
  const blob = JSON.stringify(audit);
  for (const secret of [a.nonce, b.nonce, e.nonce, ADDR, 'z@example.com', s.token]) assert.ok(!blob.includes(secret));
}));

pgTest('HTTP (flag on): GET /api/v2/session, revoke, same-origin guard, cookie cleared', () => withSchema(async (pool) => {
  const env = { PILOTLOG_ACCOUNTS_V2: 'true', PILOTLOG_COOKIE_SECURE: 'false' };
  const app = express(); app.use(express.json());
  assert.equal(registerAccountsV2(app, { pool, env, cleanupEveryMs: 0 }).enabled, true);
  app.get('/whoami', (req, res) => res.json({ student: req.student ?? null }));
  const s = await serve(app);
  try {
    const sid = await student(pool);
    const sess = await createSession(pool, { studentId: sid });
    const cookie = `pl_sid=${sess.token}`;
    assert.deepEqual(await (await fetch(`${s.base}/api/v2/session`)).json(), { authenticated: false });
    const me = await (await fetch(`${s.base}/api/v2/session`, { headers: { cookie } })).json();
    assert.equal(me.authenticated, true); assert.equal(me.studentId, sid);
    assert.deepEqual((await (await fetch(`${s.base}/whoami`, { headers: { cookie } })).json()).student, { id: sid, via: 'accounts-v2' });
    // CSRF: cross-origin or missing Origin rejected
    const post = (headers) => fetch(`${s.base}/api/v2/session/revoke`, { method: 'POST', headers: { 'content-type': 'application/json', cookie, ...headers }, body: '{}' });
    assert.equal((await post({ origin: 'https://evil.example' })).status, 403);
    assert.equal((await post({})).status, 403);
    assert.ok(await loadSession(pool, sess.token));
    const ok = await post({ origin: s.base });
    assert.equal(ok.status, 200);
    assert.match(ok.headers.get('set-cookie'), /pl_sid=; .*Max-Age=0/);
    assert.equal(await loadSession(pool, sess.token), null);
    const after = await fetch(`${s.base}/api/v2/session`, { headers: { cookie } });
    assert.deepEqual(await after.json(), { authenticated: false });
    assert.match(after.headers.get('set-cookie') || '', /Max-Age=0/); // stale cookie cleared
    // revoke all
    const x = await createSession(pool, { studentId: sid }); await createSession(pool, { studentId: sid });
    const all = await fetch(`${s.base}/api/v2/session/revoke`, { method: 'POST', headers: { 'content-type': 'application/json', cookie: `pl_sid=${x.token}`, origin: s.base }, body: JSON.stringify({ all: true }) });
    assert.deepEqual(await all.json(), { ok: true, revoked: 2 });
    assert.equal((await fetch(`${s.base}/api/v2/session/revoke`, { method: 'POST', headers: { origin: s.base } })).status, 401);
  } finally { await s.close(); }
}));

pgTest('readApi boot with flag off: no /api/v2 routes; flag on + DB: /api/v2/session live', () => withSchema(async (_pool, url) => {
  const boot = (env, port) => new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(ROOT, 'pilotlog-cli/src/readApi.mjs')], {
      env: { ...process.env, PORT: String(port), PILOTLOG_HOME: `/tmp/pl-test-${port}`, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    const timer = setTimeout(() => { child.kill(); reject(new Error('boot timeout: ' + out)); }, 15000);
    child.stdout.on('data', (d) => { out += d; if (out.includes('listening on')) { clearTimeout(timer); resolve(child); } });
    child.stderr.on('data', (d) => { out += d; });
  });
  const port1 = 19000 + Math.floor(Math.random() * 500), port2 = port1 + 600;
  const off = await boot({ DATABASE_URL: url, PILOTLOG_ACCOUNTS_V2: '' }, port1);
  try {
    assert.equal((await fetch(`http://127.0.0.1:${port1}/api/v2/session`)).status, 404);
    assert.equal(await (await fetch(`http://127.0.0.1:${port1}/health`)).text(), 'OK');
  } finally { off.kill(); }
  const on = await boot({ DATABASE_URL: url, PILOTLOG_ACCOUNTS_V2: 'true' }, port2);
  try {
    const r = await fetch(`http://127.0.0.1:${port2}/api/v2/session`);
    assert.equal(r.status, 200); assert.deepEqual(await r.json(), { authenticated: false });
  } finally { on.kill(); }
}));
