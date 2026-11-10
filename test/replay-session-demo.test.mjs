/**
 * Replay must not switch a signed-in logbook to sample data (Nov 10 2026 production bug).
 *  - signed-in Logbook → Replay → Logbook keeps the real entry; nav never carries ?demo=1
 *  - ?demo=1 is ignored while a session is present
 *  - a flight with no GPS track shows "No replay available", never a silent sample track
 *  - sample replay stays on the signed-out / Explore path and is labeled SAMPLE
 * Postgres cases run when PILOTLOG_TEST_DATABASE_URL is set; each uses a throwaway schema.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import pg from 'pg';
import { migrate } from '../pilotlog-cli/src/db.mjs';
import { migrateAccountsV2 } from '../pilotlog-cli/src/lib/accounts/schemaV2.mjs';
import { newStudentId } from '../pilotlog-cli/src/lib/accounts/ids.mjs';
import { createSession } from '../pilotlog-cli/src/lib/accounts/sessions.mjs';
import { renderNav, demoQ } from '../pilotlog-cli/src/lib/cockpit/chrome.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TEST_DB = process.env.PILOTLOG_TEST_DATABASE_URL;
const pgTest = TEST_DB ? test : test.skip;
const REMARK = 'REAL-ENTRY-NOV10-pattern';
const ENTRY = { date: '2026-11-08', totalTime: 1.1, from: 'KAPA', to: 'KAPA', aircraftId: 'N0SYN', remarks: REMARK };
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function boot(env, port) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(ROOT, 'pilotlog-cli/src/readApi.mjs')], {
      cwd: ROOT,
      env: { ...process.env, PORT: String(port), PILOTLOG_HOME: fs.mkdtempSync(path.join(os.tmpdir(), 'pl-replay-')), DATABASE_URL: '', PILOTLOG_ACCOUNTS_V2: '', ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '';
    const timer = setTimeout(() => { child.kill(); reject(new Error('boot timeout: ' + out)); }, 15000);
    child.stdout.on('data', (d) => { out += d; if (out.includes('listening on')) { clearTimeout(timer); resolve(child); } });
    child.stderr.on('data', (d) => { out += d; });
  });
}
const stop = (c) => new Promise((r) => { c.once('exit', r); c.kill(); });

async function withSchema(fn) {
  const schema = `s_${process.pid}_${Math.random().toString(36).slice(2, 10)}`;
  const admin = new pg.Pool({ connectionString: TEST_DB, max: 1 });
  await admin.query(`CREATE SCHEMA ${schema}`);
  const u = new URL(TEST_DB); u.searchParams.set('options', `-c search_path=${schema}`);
  const pool = new pg.Pool({ connectionString: u.toString(), max: 6 });
  try { await migrate(pool); await migrateAccountsV2(pool); return await fn(pool, u.toString()); }
  finally { await pool.end(); await admin.query(`DROP SCHEMA ${schema} CASCADE`); await admin.end(); }
}

function assertOwnLogbook(html, { signedIn = true } = {}) {
  assert.match(html, new RegExp(REMARK));
  assert.doesNotMatch(html, /\?demo=1/);
  assert.doesNotMatch(html, /id="demo0"|Alex \(sample CFI\)|SAMPLE · KAPA/);
  assert.doesNotMatch(html, />SAMPLE</);
  assert.match(html, /class="live"/);
  if (signedIn) assert.match(html, /href="\/account"/);
}

test('demoQ and renderNav never put ?demo=1 on a signed-in session, even if demo is set', () => {
  const signedIn = { name: 'J', initials: 'J', role: 'R', account: { signedIn: true } };
  assert.equal(demoQ(true, signedIn), '');
  assert.equal(demoQ(true, { account: { signedIn: false } }), '?demo=1');
  assert.equal(demoQ(true), '?demo=1');
  assert.equal(demoQ(false), '');
  const html = renderNav(esc, { active: 'replay', demo: true, user: signedIn });
  assert.doesNotMatch(html, /\?demo=1/);
  assert.match(html, /href="\/cockpit\/logbook"/);
  assert.match(html, /class="live"/);
  assert.doesNotMatch(html, /class="demo"/);
});

test('flag off: Replay with no track is an empty state and does not put ?demo=1 on Logbook', async () => {
  const port = 25100 + Math.floor(Math.random() * 300);
  const c = await boot({}, port);
  try {
    const html = await (await fetch(`http://127.0.0.1:${port}/cockpit/replay`)).text();
    assert.match(html, /No replay available/);
    assert.doesNotMatch(html, /\?demo=1/);
    assert.doesNotMatch(html, /SAMPLE · KAPA|cockpit-replay3d\.js/);
    const logbook = await (await fetch(`http://127.0.0.1:${port}/cockpit/logbook`)).text();
    assert.doesNotMatch(logbook, /\?demo=1/);
    assert.doesNotMatch(logbook, /id="demo0"/);
  } finally { await stop(c); }
});

pgTest('signed-in Logbook → Replay → Logbook keeps the real entry; no-track is empty; ?demo=1 is ignored', () => withSchema(async (pool, url) => {
  const port = 25500 + Math.floor(Math.random() * 300);
  const c = await boot({ DATABASE_URL: url, PILOTLOG_ACCOUNTS_V2: 'true', PILOTLOG_COOKIE_SECURE: 'false', NODE_ENV: 'test' }, port);
  try {
    const base = `http://127.0.0.1:${port}`;
    const id = newStudentId();
    await pool.query('INSERT INTO students (id) VALUES ($1)', [id]);
    const session = await createSession(pool, { studentId: id });
    const headers = { cookie: `pl_sid=${session.token}`, origin: base, 'content-type': 'application/json' };
    const created = await fetch(`${base}/api/cockpit/entries`, { method: 'POST', headers, body: JSON.stringify(ENTRY) });
    const entry = await created.json();
    assert.equal(created.status, 201, JSON.stringify(entry));
    assert.match(entry.id, /^[0-9a-f]{16}$/);

    const log1 = await (await fetch(`${base}/cockpit/logbook`, { headers })).text();
    assertOwnLogbook(log1);
    assert.match(log1, />1</); // one flight in the totals

    const replayBare = await (await fetch(`${base}/cockpit/replay`, { headers })).text();
    const replayEntry = await (await fetch(`${base}/cockpit/replay?entry=${entry.id}`, { headers })).text();
    for (const html of [replayBare, replayEntry]) {
      assert.match(html, /No replay available/);
      assert.doesNotMatch(html, /\?demo=1/);
      assert.doesNotMatch(html, /SAMPLE · KAPA|class="sample-banner"|cockpit-replay3d\.js|SAMPLE TRACK/);
      assert.match(html, /href="\/cockpit\/logbook"/);
      assert.match(html, /class="live"/);
    }

    const logHref = replayEntry.match(/href="(\/cockpit\/logbook[^"]*)"/)[1];
    assert.equal(logHref, '/cockpit/logbook');
    const log2 = await (await fetch(`${base}${logHref}`, { headers })).text();
    assertOwnLogbook(log2);

    const logDemoQs = await (await fetch(`${base}/cockpit/logbook?demo=1`, { headers })).text();
    assertOwnLogbook(logDemoQs);
    const api = await (await fetch(`${base}/api/cockpit/entries?demo=1`, { headers })).json();
    assert.equal(api.demo, false);
    assert.equal(api.entries.length, 1);
    assert.equal(api.entries[0].remarks, REMARK);

    const signedOutReplay = await (await fetch(`${base}/cockpit/replay`)).text();
    assert.match(signedOutReplay, /SAMPLE · KAPA|sample-banner/);
    assert.match(signedOutReplay, /SAMPLE/);
    assert.match(signedOutReplay, /href="\/cockpit\/logbook\?demo=1"/);
    assert.doesNotMatch(signedOutReplay, /No replay available/);
    const signedOutLog = await (await fetch(`${base}/cockpit/logbook`)).text();
    assert.doesNotMatch(signedOutLog, new RegExp(REMARK));
    assert.ok(signedOutLog.includes('demo0') || (signedOutLog.match(/<tr>/g) || []).length > 3);
  } finally { await stop(c); }
}));
