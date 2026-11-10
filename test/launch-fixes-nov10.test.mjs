/**
 * Launch fixes (Nov 10 2026):
 *  - GET /profile/summary never 500s: 410 (retired) with accounts v2 ON, 404 with no profile when OFF.
 *  - Magic-link sender display name is "PilotLog", address support@digitalaviationpool.com.
 *  - Account/sign-in copy doesn't promise wallet unlink or email change (neither exists).
 * Postgres case runs when PILOTLOG_TEST_DATABASE_URL is set; it uses a throwaway schema.
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
import { selectEmailProvider, formatFrom, DEFAULT_FROM } from '../pilotlog-cli/src/lib/accounts/email/index.mjs';
import { renderAccountPage, renderSignInPage } from '../pilotlog-cli/src/lib/accounts/signInPages.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TEST_DB = process.env.PILOTLOG_TEST_DATABASE_URL;
const pgTest = TEST_DB ? test : test.skip;
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

function boot(env, port) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(ROOT, 'pilotlog-cli/src/readApi.mjs')], {
      cwd: ROOT, env: { ...process.env, PORT: String(port), PILOTLOG_HOME: fs.mkdtempSync(path.join(os.tmpdir(), 'pl-nov10-')), DATABASE_URL: '', PILOTLOG_ACCOUNTS_V2: '', ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    const timer = setTimeout(() => { child.kill(); reject(new Error('boot timeout: ' + out)); }, 15000);
    child.stdout.on('data', (d) => { out += d; if (out.includes('listening on')) { clearTimeout(timer); resolve(child); } });
    child.stderr.on('data', (d) => { out += d; });
  });
}
const stop = (c) => new Promise((r) => { c.once('exit', r); c.kill(); });

test('/profile/summary with accounts OFF and no wallet is 404, not 500', async () => {
  const port = 24100 + Math.floor(Math.random() * 300);
  const c = await boot({}, port);
  try {
    const r = await fetch(`http://127.0.0.1:${port}/profile/summary`);
    assert.equal(r.status, 404);
    assert.equal((await r.json()).error, 'no profile');
  } finally { await stop(c); }
});

pgTest('/profile/summary with accounts ON is 410 (signed out and signed in), never 500', async () => {
  const schema = `s_${process.pid}_${Math.random().toString(36).slice(2, 10)}`;
  const admin = new pg.Pool({ connectionString: TEST_DB, max: 1 });
  await admin.query(`CREATE SCHEMA ${schema}`);
  const u = new URL(TEST_DB); u.searchParams.set('options', `-c search_path=${schema}`);
  const pool = new pg.Pool({ connectionString: u.toString(), max: 4 });
  let c;
  try {
    await migrate(pool); await migrateAccountsV2(pool);
    const port = 24500 + Math.floor(Math.random() * 300);
    c = await boot({ DATABASE_URL: u.toString(), PILOTLOG_ACCOUNTS_V2: 'true', PILOTLOG_COOKIE_SECURE: 'false', NODE_ENV: 'test' }, port);
    const base = `http://127.0.0.1:${port}`;
    const id = newStudentId(); await pool.query('INSERT INTO students (id) VALUES ($1)', [id]);
    const s = await createSession(pool, { studentId: id });
    for (const cookie of [null, `pl_sid=${s.token}`]) {
      const r = await fetch(`${base}/profile/summary`, { headers: cookie ? { cookie } : {} });
      assert.equal(r.status, 410, cookie ? 'signed in' : 'signed out');
      assert.equal((await r.json()).error, 'gone');
    }
    assert.equal((await fetch(`${base}/profile`)).status, 200);
  } finally { if (c) await stop(c); await pool.end(); await admin.query(`DROP SCHEMA ${schema} CASCADE`); await admin.end(); }
});

test('magic-link sender is "PilotLog <support@digitalaviationpool.com>"', async () => {
  assert.equal(DEFAULT_FROM, 'PilotLog <support@digitalaviationpool.com>');
  assert.equal(formatFrom(''), DEFAULT_FROM);
  assert.equal(formatFrom(undefined), DEFAULT_FROM);
  assert.equal(formatFrom('support@digitalaviationpool.com'), DEFAULT_FROM, 'bare address gets the PilotLog name');
  assert.equal(formatFrom('  support@digitalaviationpool.com  '), DEFAULT_FROM);
  assert.equal(formatFrom('Ops <ops@example.com>'), 'Ops <ops@example.com>', 'explicit display name is kept');
  for (const envFrom of [undefined, '', 'support@digitalaviationpool.com']) {
    const calls = [];
    const fetchImpl = async (url, init) => { calls.push(init); return { ok: true, status: 200, json: async () => ({ MessageID: 'm' }) }; };
    const p = selectEmailProvider({ NODE_ENV: 'production', POSTMARK_SERVER_TOKEN: 'synthetic-token', PILOTLOG_EMAIL_FROM: envFrom }, { fetchImpl });
    await p.send({ to: 'a@example.com', subject: 'S', text: 'T', html: '<p>H</p>' });
    assert.equal(JSON.parse(calls[0].body).From, 'PilotLog <support@digitalaviationpool.com>', `env=${envFrom}`);
  }
});

test('account and sign-in copy promise no wallet unlink or email change', () => {
  for (const html of [renderAccountPage(esc), renderSignInPage(esc)]) {
    const text = html.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<[^>]+>/g, ' ');
    assert.doesNotMatch(text, /\bunlink\b|remove (your |a |the )?wallet|disconnect (your |a |the )?wallet/i);
    assert.doesNotMatch(text, /change (your |the )?e-?mail|update (your |the )?e-?mail|e-?mail change/i);
  }
  assert.match(renderAccountPage(esc), /can't be removed from this page yet/);
  const js = fs.readFileSync(path.join(ROOT, 'public/js/account.js'), 'utf8');
  assert.doesNotMatch(js, /unlink|change (your )?e-?mail/i);
});
