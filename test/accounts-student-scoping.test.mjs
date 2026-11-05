/**
 * Accounts v2 sign-in UI slice: per-student scoping + data isolation, SAMPLE/401 when signed out,
 * flag-off legacy behaviour unchanged, legacy-owner migration (dry run / apply / idempotent).
 * Postgres tests run when PILOTLOG_TEST_DATABASE_URL is set; each uses a throwaway schema.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import pg from 'pg';
import { migrate } from '../pilotlog-cli/src/db.mjs';
import { migrateAccountsV2 } from '../pilotlog-cli/src/lib/accounts/schemaV2.mjs';
import { newStudentId } from '../pilotlog-cli/src/lib/accounts/ids.mjs';
import { createSession } from '../pilotlog-cli/src/lib/accounts/sessions.mjs';
import { registerAccountsV2 } from '../pilotlog-cli/src/lib/accounts/http.mjs';
import { registerStudentRoutes } from '../pilotlog-cli/src/lib/accounts/studentRoutes.mjs';
import { registerSignInPages, renderSignInPage } from '../pilotlog-cli/src/lib/accounts/signInPages.mjs';
import { createStudentStore } from '../pilotlog-cli/src/lib/accounts/studentStore.mjs';
import { sanitizeRadioAttempt } from '../pilotlog-cli/src/lib/accounts/studentData.mjs';
import { resolveOwnerStudent, migrateLegacyData } from '../pilotlog-cli/src/lib/accounts/legacyMigration.mjs';
import { registerCockpitRoutes } from '../pilotlog-cli/src/cockpitRoutes.mjs';
import { registerCheckrideRoutes } from '../pilotlog-cli/src/checkrideRoutes.mjs';
import { renderNav } from '../pilotlog-cli/src/lib/cockpit/chrome.mjs';
import { renderRadioPage } from '../pilotlog-cli/src/lib/cockpit/radioPage.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TEST_DB = process.env.PILOTLOG_TEST_DATABASE_URL;
const pgTest = TEST_DB ? test : test.skip;
const ENV = { PILOTLOG_ACCOUNTS_V2: 'true', PILOTLOG_COOKIE_SECURE: 'false', NODE_ENV: 'test' };
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const WALLET = 'mn_addr_preprod1' + 'q'.repeat(40) + 'acd';

async function withSchema(fn) {
  const schema = `s_${process.pid}_${Math.random().toString(36).slice(2, 10)}`;
  const admin = new pg.Pool({ connectionString: TEST_DB, max: 1 });
  await admin.query(`CREATE SCHEMA ${schema}`);
  const u = new URL(TEST_DB); u.searchParams.set('options', `-c search_path=${schema}`);
  const pool = new pg.Pool({ connectionString: u.toString(), max: 12 });
  try { await migrate(pool); await migrateAccountsV2(pool); return await fn(pool, u.toString()); }
  finally { await pool.end(); await admin.query(`DROP SCHEMA ${schema} CASCADE`); await admin.end(); }
}
async function student(pool) {
  const id = newStudentId(); await pool.query('INSERT INTO students (id) VALUES ($1)', [id]);
  const s = await createSession(pool, { studentId: id });
  return { id, cookie: `pl_sid=${s.token}` };
}
/** App wired exactly like readApi in v2 mode (student routes before the legacy cockpit/checkride routes). */
async function serve(pool, dataDir) {
  const app = express(); app.use(express.json());
  assert.equal(registerAccountsV2(app, { pool, env: ENV, cleanupEveryMs: 0 }).enabled, true);
  const scope = registerStudentRoutes(app, { pool, escapeHtml: esc, env: ENV });
  registerSignInPages(app, { escapeHtml: esc, env: ENV });
  registerCheckrideRoutes(app, { dataDir, readEntries: () => [], escapeHtml: esc, safeJsonForScript: JSON.stringify });
  registerCockpitRoutes(app, { dataDir, readEntries: () => [], escapeHtml: esc, accounts: scope });
  const srv = await new Promise((r) => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
  const base = `http://127.0.0.1:${srv.address().port}`;
  const call = (method, p, { who = null, body, origin = base } = {}) => fetch(base + p, { method, redirect: 'manual',
    headers: { ...(who ? { cookie: who.cookie } : {}), ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...(origin ? { origin } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body) });
  return { base, call, close: () => new Promise((r) => srv.close(r)) };
}
const tmpDir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'pl-scope-'));
const ENTRY = { date: '2026-10-01', totalTime: 1.4, from: 'KAPA', to: 'KAPA', remarks: 'A-ONLY pattern work' };
const GPX = '<?xml version="1.0"?><gpx><trk><trkseg>' + Array.from({ length: 12 }, (_, i) =>
  `<trkpt lat="${39.57 + i * 0.001}" lon="${-104.85 + i * 0.001}"><ele>${1800 + i * 20}</ele><time>2026-10-01T15:${String(10 + i).padStart(2, '0')}:00Z</time></trkpt>`).join('') + '</trkseg></trk></gpx>';

// ── always (no DB) ───────────────────────────────────────────────────────────
test('flag off: nav has no sign-in chip/banner and radio boot has no signedIn (legacy output unchanged)', () => {
  const html = renderNav(esc, { active: 'logbook', demo: false, user: null });
  assert.ok(!html.includes('id="acct"') && !html.includes('class="signin-banner"') && !html.includes('/js/accounts.js'));
  const demo = renderNav(esc, { active: 'logbook', demo: true });
  assert.ok(!demo.includes('class="signin-banner"'));
  const radio = renderRadioPage(esc, { demo: false, user: { name: 'PILOT', initials: 'P', role: 'X' } });
  assert.ok(!/"signedIn"/.test(radio));
});

test('v2 chrome: signed-out chip links to /signin with SAMPLE banner; signed-in chip has Account + Sign out', () => {
  const out = renderNav(esc, { demo: true, user: { name: 'J', initials: 'J', role: 'R', account: { signedIn: false } } });
  assert.match(out, /href="\/signin">Sign in</); assert.match(out, /signin-banner/);
  const inn = renderNav(esc, { user: { name: 'J', initials: 'J', role: 'R', account: { signedIn: true } } });
  assert.match(inn, /href="\/account"/); assert.match(inn, /data-acct="signout"/); assert.ok(!inn.includes('class="signin-banner"'));
  const radio = renderRadioPage(esc, { demo: false, user: { name: 'J', initials: 'J', role: 'R', account: { signedIn: true } } });
  assert.match(radio, /"signedIn":true/);
});

test('sign-in page: email, passkey, optional wallet, sample mode; no inline script', () => {
  const h = renderSignInPage(esc, { network: 'preprod' });
  for (const id of ['emailForm', 'emailSent', 'passkeyBtn', 'walletDetails', 'demoBtn']) assert.ok(h.includes(`id="${id}"`), id);
  assert.match(h, /href="\/cockpit\?demo=1"/);
  assert.ok(!/<script>(?!<\/script>)/.test(h) && !/<script(?![^>]*src=)[^>]*>/.test(h), 'no inline scripts');
  assert.match(h, /data-network="preprod"/);
});

test('radio attempt sanitiser', () => {
  const a = sanitizeRadioAttempt({ scenario: 'takeoff', score: 87.4, steps: 4, airport: 'kapa' }, ['takeoff']);
  assert.deepEqual({ ...a, at: 'x' }, { scenario: 'takeoff', score: 87, steps: 4, airport: 'KAPA', at: 'x' });
  assert.throws(() => sanitizeRadioAttempt({ scenario: 'nope', score: 1 }, ['takeoff']));
  assert.throws(() => sanitizeRadioAttempt({ scenario: 'takeoff', score: 101 }, ['takeoff']));
});

function boot(env, port) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(ROOT, 'pilotlog-cli/src/readApi.mjs')], {
      env: { ...process.env, PORT: String(port), PILOTLOG_HOME: tmpDir(), DATABASE_URL: '', PILOTLOG_ACCOUNTS_V2: '', ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    const timer = setTimeout(() => { child.kill(); reject(new Error('boot timeout: ' + out)); }, 15000);
    child.stdout.on('data', (d) => { out += d; if (out.includes('listening on')) { clearTimeout(timer); resolve(child); } });
    child.stderr.on('data', (d) => { out += d; });
  });
}

test('readApi without DB (flag off, and flag on in file mode): no /signin, legacy /wallet/connect, no chip', async () => {
  const p1 = 21000 + Math.floor(Math.random() * 400);
  for (const [env, port] of [[{}, p1], [{ PILOTLOG_ACCOUNTS_V2: 'true' }, p1 + 500]]) {
    const c = await boot(env, port);
    try {
      const b = `http://127.0.0.1:${port}`;
      assert.equal((await fetch(`${b}/signin`)).status, 404);
      assert.equal((await fetch(`${b}/account`, { redirect: 'manual' })).status, 404);
      assert.notEqual((await fetch(`${b}/wallet/connect`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })).status, 410);
      const page = await (await fetch(`${b}/cockpit/logbook?demo=1`)).text();
      assert.ok(!page.includes('id="acct"') && !page.includes('class="signin-banner"'));
      const r = await fetch(`${b}/api/cockpit/entries`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(ENTRY) });
      assert.equal(r.status, 201, 'legacy single-user write still works without sign-in');
    } finally { c.kill(); }
  }
});

// ── Postgres ─────────────────────────────────────────────────────────────────
pgTest('isolation: student A cannot read or write student B\'s entries, settings, checkride, tracks, radio, usage', () => withSchema(async (pool) => {
  const s = await serve(pool, tmpDir());
  try {
    const A = await student(pool), B = await student(pool);
    const e = await (await s.call('POST', '/api/cockpit/entries', { who: A, body: ENTRY })).json();
    assert.match(e.id, /^[0-9a-f]{16}$/);
    // entries
    const aList = await (await s.call('GET', '/api/cockpit/entries', { who: A })).json();
    assert.equal(aList.demo, false); assert.deepEqual(aList.entries.map((x) => x.id), [e.id]);
    const bList = await (await s.call('GET', '/api/cockpit/entries', { who: B })).json();
    assert.equal(bList.demo, false); assert.deepEqual(bList.entries, []);
    assert.equal((await s.call('PUT', `/api/cockpit/entries/${e.id}`, { who: B, body: { remarks: 'B was here' } })).status, 404);
    assert.equal((await s.call('DELETE', `/api/cockpit/entries/${e.id}`, { who: B })).status, 404);
    assert.equal((await (await s.call('GET', '/api/cockpit/entries', { who: A })).json()).entries[0].remarks, 'A-ONLY pattern work');
    // settings
    assert.equal((await s.call('PUT', '/api/cockpit/settings', { who: A, body: { homeAirport: 'KBJC', instructorName: 'CFI Alpha', rates: { aircraftRate: 199, instructorRate: 77 } } })).status, 200);
    const aSet = await (await s.call('GET', '/api/cockpit/settings', { who: A })).json();
    const bSet = await (await s.call('GET', '/api/cockpit/settings', { who: B })).json();
    assert.equal(aSet.settings.homeAirport, 'KBJC'); assert.notEqual(bSet.settings.homeAirport, 'KBJC');
    assert.equal(aSet.rates.aircraftRate, 199); assert.notEqual(bSet.rates.aircraftRate, 199);
    // checkride
    assert.equal((await s.call('PUT', '/api/checkride/test-date', { who: A, body: { testDate: '2027-01-15' } })).status, 200);
    assert.equal((await s.call('PUT', `/api/checkride/flights/${e.id}`, { who: B, body: { xcDistanceNm: 60 } })).status, 400, 'B cannot attach details to A\'s flight');
    assert.equal((await s.call('PUT', `/api/checkride/flights/${e.id}`, { who: A, body: { xcDistanceNm: 60 } })).status, 200);
    const aCr = await (await s.call('GET', '/api/checkride', { who: A })).json();
    const bCr = await (await s.call('GET', '/api/checkride', { who: B })).json();
    assert.equal(aCr.testDate, '2027-01-15'); assert.notEqual(bCr.testDate, '2027-01-15');
    // tracks
    assert.equal((await s.call('POST', `/api/cockpit/tracks/${e.id}`, { who: A, body: { text: GPX, filename: 'a.gpx' } })).status, 201);
    assert.equal((await s.call('GET', `/api/cockpit/tracks/${e.id}`, { who: A })).status, 200);
    assert.equal((await s.call('GET', `/api/cockpit/tracks/${e.id}`, { who: B })).status, 404);
    assert.equal((await s.call('POST', `/api/cockpit/tracks/${e.id}`, { who: B, body: { text: GPX } })).status, 404, 'B cannot attach a track to A\'s entry');
    assert.equal((await s.call('GET', '/api/cockpit/tracks/sample')).status, 200, 'sample track still public');
    // radio
    assert.equal((await s.call('POST', '/api/cockpit/radio/attempts', { who: A, body: { scenario: 'takeoff', score: 90 } })).status, 201);
    assert.equal((await (await s.call('GET', '/api/cockpit/radio/attempts', { who: A })).json()).attempts.length, 1);
    assert.equal((await (await s.call('GET', '/api/cockpit/radio/attempts', { who: B })).json()).attempts.length, 0);
    // AI-coach usage ledger (server-side writes only)
    await createStudentStore({ pool }).recordUsage(A.id, { inputTokens: 1000, outputTokens: 200, usd: 0.25 });
    const aU = await (await s.call('GET', '/api/cockpit/usage', { who: A })).json();
    const bU = await (await s.call('GET', '/api/cockpit/usage', { who: B })).json();
    assert.equal(aU.requests, 1); assert.equal(aU.usd, 0.25); assert.equal(bU.requests, 0);
    // HTML pages are per student
    const aPage = await (await s.call('GET', '/cockpit/logbook', { who: A })).text();
    const bPage = await (await s.call('GET', '/cockpit/logbook', { who: B })).text();
    assert.ok(aPage.includes('A-ONLY pattern work')); assert.ok(!bPage.includes('A-ONLY pattern work'));
    assert.ok(aPage.includes('href="/account"') && !aPage.includes('class="signin-banner"'));
    const aCk = await (await s.call('GET', '/checkride', { who: A })).text();
    assert.ok(aCk.includes('2027-01-15') || aCk.includes('Jan'));
    // the rows really are separate
    const { rows } = await pool.query('SELECT student_id, kind FROM student_docs ORDER BY 1, 2');
    assert.ok(rows.every((r) => r.student_id === A.id || r.student_id === B.id));
    assert.ok(!rows.some((r) => r.student_id === B.id && r.kind === 'entries'));
  } finally { await s.close(); }
}));

pgTest('signed out: GETs return SAMPLE data, writes 401, private reads 401; cross-origin writes 403; legacy files untouched', () => withSchema(async (pool) => {
  const dir = tmpDir();
  const s = await serve(pool, dir);
  try {
    const list = await (await s.call('GET', '/api/cockpit/entries')).json();
    assert.equal(list.demo, true); assert.ok(list.entries.length > 0);
    assert.equal((await (await s.call('GET', '/api/cockpit/settings')).json()).demo, true);
    assert.equal((await (await s.call('GET', '/api/checkride')).json()).demo, true);
    for (const [m, p, body] of [['POST', '/api/cockpit/entries', ENTRY], ['PUT', '/api/cockpit/settings', { homeAirport: 'KDEN' }],
      ['PUT', '/api/checkride/test-date', { testDate: '2027-01-01' }], ['POST', '/api/cockpit/radio/attempts', { scenario: 'takeoff', score: 1 }],
      ['POST', '/api/cockpit/tracks/0123456789abcdef', { text: GPX }], ['DELETE', '/api/cockpit/entries/0123456789abcdef', undefined]]) {
      const r = await s.call(m, p, { body });
      assert.equal(r.status, 401, `${m} ${p}`); assert.equal((await r.json()).signIn, '/signin');
    }
    for (const p of ['/api/cockpit/radio/attempts', '/api/cockpit/usage', '/api/cockpit/tracks/0123456789abcdef']) assert.equal((await s.call('GET', p)).status, 401, p);
    const A = await student(pool);
    assert.equal((await s.call('POST', '/api/cockpit/entries', { who: A, body: ENTRY, origin: 'https://evil.example' })).status, 403);
    assert.equal((await s.call('POST', '/api/cockpit/entries', { who: A, body: ENTRY, origin: null })).status, 403);
    // pages
    const page = await (await s.call('GET', '/cockpit/logbook')).text();
    assert.ok(page.includes('class="signin-banner"') && page.includes('href="/signin"'));
    assert.equal((await s.call('GET', '/account')).status, 303);
    assert.equal((await s.call('GET', '/account', { who: A })).status, 200);
    const signin = await s.call('GET', '/signin');
    assert.equal(signin.status, 200); assert.match(signin.headers.get('content-security-policy'), /script-src 'self'/);
    assert.equal((await s.call('POST', '/wallet/connect', { body: {} })).status, 410, 'global wallet switch closed in v2 mode');
    assert.deepEqual(fs.readdirSync(dir).filter((f) => /^(entries|settings|checkride|tracks)\.json$/.test(f)), [], 'no legacy file written');
  } finally { await s.close(); }
}));

pgTest('legacy-owner migration: explicit owner, dry run writes nothing, apply copies once, never overwrites', () => withSchema(async (pool) => {
  const dir = tmpDir();
  fs.writeFileSync(path.join(dir, 'entries.json'), JSON.stringify([{ id: '0123456789abcdef', date: '2026-01-02', totalTime: 1.2, remarks: 'legacy' }]));
  fs.writeFileSync(path.join(dir, 'settings.json'), JSON.stringify({ homeAirport: 'KAPA', instructorName: 'Legacy CFI' }));
  const owner = await student(pool), other = await student(pool);
  await pool.query(`INSERT INTO identities (student_id, type, subject, network, verified_at) VALUES ($1, 'midnight-1am', $2, 'preprod', now())`, [owner.id, WALLET]);
  const store = createStudentStore({ pool });
  await assert.rejects(resolveOwnerStudent(pool, {}), /exactly one owner/);
  await assert.rejects(resolveOwnerStudent(pool, { wallet: 'mn_addr_preprod1nobody' }), /no student/);
  const id = await resolveOwnerStudent(pool, { wallet: WALLET });
  assert.equal(id, owner.id);
  await store.put(id, 'settings', { homeAirport: 'KBJC' }); // owner already has settings → must not be overwritten
  const dry = await migrateLegacyData({ pool, store, dataDir: dir, studentId: id, ownerWallet: WALLET });
  assert.equal(dry.mode, 'dry-run'); assert.deepEqual(dry.copied.map((c) => c.kind), ['entries']);
  assert.equal(await store.get(id, 'entries'), null); assert.equal(await store.get(id, 'meta'), null);
  const run = await migrateLegacyData({ pool, store, dataDir: dir, studentId: id, ownerWallet: WALLET, apply: true });
  assert.deepEqual(run.copied.map((c) => c.kind), ['entries']);
  assert.ok(run.skipped.includes('settings: student already has data'));
  assert.equal((await store.get(id, 'entries'))[0].remarks, 'legacy');
  assert.equal((await store.get(id, 'settings')).homeAirport, 'KBJC');
  assert.equal((await migrateLegacyData({ pool, store, dataDir: dir, studentId: id, apply: true })).reason, 'already migrated');
  assert.equal(await store.get(other.id, 'entries'), null, 'other students untouched');
  assert.ok(fs.existsSync(path.join(dir, 'entries.json')), 'legacy file kept');
}));

pgTest('migration script: dry run by default, --apply copies', () => withSchema(async (pool, url) => {
  const dir = tmpDir();
  fs.writeFileSync(path.join(dir, 'entries.json'), JSON.stringify([{ id: '0123456789abcdef', date: '2026-01-02', totalTime: 1 }]));
  const owner = await student(pool);
  const run = (args) => new Promise((resolve) => {
    const c = spawn(process.execPath, [path.join(ROOT, 'scripts/migrate-legacy-to-student.mjs'), '--student', owner.id, '--data-dir', dir, ...args],
      { env: { ...process.env, DATABASE_URL: url, LEGACY_OWNER_WALLET: '' } });
    let out = ''; c.stdout.on('data', (d) => { out += d; }); c.stderr.on('data', (d) => { out += d; });
    c.on('close', (code) => resolve({ code, out }));
  });
  const dry = await run([]);
  assert.equal(dry.code, 0, dry.out); assert.match(dry.out, /"mode": "dry-run"/); assert.match(dry.out, /Dry run only/);
  assert.equal((await pool.query('SELECT count(*)::int n FROM student_docs')).rows[0].n, 0);
  const ap = await run(['--apply']);
  assert.equal(ap.code, 0, ap.out); assert.match(ap.out, /"mode": "apply"/);
  assert.equal((await pool.query(`SELECT count(*)::int n FROM student_docs WHERE student_id = $1 AND kind = 'entries'`, [owner.id])).rows[0].n, 1);
}));

pgTest('readApi boot: flag on + DB serves /signin and the per-student routes; flag off keeps legacy routes', () => withSchema(async (_pool, url) => {
  const p = 22000 + Math.floor(Math.random() * 400);
  const on = await boot({ DATABASE_URL: url, PILOTLOG_ACCOUNTS_V2: 'true', PILOTLOG_COOKIE_SECURE: 'false' }, p);
  try {
    const b = `http://127.0.0.1:${p}`;
    assert.equal((await fetch(`${b}/signin`)).status, 200);
    assert.equal((await fetch(`${b}/api/cockpit/entries`, { method: 'POST', headers: { 'content-type': 'application/json', origin: b }, body: JSON.stringify(ENTRY) })).status, 401);
    assert.equal((await (await fetch(`${b}/api/cockpit/entries`)).json()).demo, true);
  } finally { on.kill(); }
  const off = await boot({ DATABASE_URL: url, PILOTLOG_ACCOUNTS_V2: '' }, p + 500);
  try {
    const b = `http://127.0.0.1:${p + 500}`;
    assert.equal((await fetch(`${b}/signin`)).status, 404);
    assert.equal((await (await fetch(`${b}/api/cockpit/entries`)).json()).demo, false);
  } finally { off.kill(); }
}));
