/**
 * Legacy route write protection (readiness fixes, Nov 2026).
 *  - accounts v2 ON: every legacy state-changing route is closed (410) for signed-out AND signed-in callers,
 *    no flights row is written, global deployment.json is untouched.
 *  - accounts v2 OFF: the same legacy writes AND the flag-off /api/cockpit|checkride writes are 410 regardless
 *    of Origin (an Origin header or an asserted wallet is not authentication). Stateless parse stays open.
 *  - GET /profile without a wallet is 200 {} (was 500).
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
import { legacyWriteWallet } from '../pilotlog-cli/src/lib/accounts/legacyGuard.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TEST_DB = process.env.PILOTLOG_TEST_DATABASE_URL;
const pgTest = TEST_DB ? test : test.skip;
const DEPLOYMENT = path.join(ROOT, 'deployment.json');
const VICTIM = 'mn_addr_preprod1' + 'v'.repeat(40) + 'xyz';
const tmpDir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'pl-guard-'));

const LEGACY_WRITES = [
  ['POST', '/entries', { aircraftId: 'N0SYN', totalTime: 1, txHash: 'submitted-1', walletAddress: VICTIM }],
  ['PATCH', '/entries/0123456789abcdef/txhash', { txHash: 'a'.repeat(64) }],
  ['POST', '/entries/0123456789abcdef/anchor', {}],
  ['POST', '/attestations', { flightId: 'x' }],
  ['PATCH', '/attestations/x', {}],
  ['POST', '/verify/anchor', {}],
  ['POST', '/anchor/logbook', {}],
  ['POST', '/anchor/grant', {}],
  ['POST', '/anchor/revoke', {}],
  ['PATCH', '/profile/phase', { phase: 'solo' }],
  ['POST', '/profile/identity', { name: 'x' }],
  ['POST', '/wallet/connect', { address: VICTIM }],
  ['POST', '/wallet/disconnect', {}],
  ['POST', '/identity/verify-midname', {}],
  ['POST', '/identity/auto-resolve-midname', {}],
  ['POST', '/identity/clear-midname', {}],
  ['POST', '/deployment', { contractAddress: 'synthetic-guard-test' }],
  ['DELETE', '/deployment', undefined],
];

async function withSchema(fn) {
  const schema = `s_${process.pid}_${Math.random().toString(36).slice(2, 10)}`;
  const admin = new pg.Pool({ connectionString: TEST_DB, max: 1 });
  await admin.query(`CREATE SCHEMA ${schema}`);
  const u = new URL(TEST_DB); u.searchParams.set('options', `-c search_path=${schema}`);
  const pool = new pg.Pool({ connectionString: u.toString(), max: 6 });
  try { await migrate(pool); await migrateAccountsV2(pool); return await fn(pool, u.toString()); }
  finally { await pool.end(); await admin.query(`DROP SCHEMA ${schema} CASCADE`); await admin.end(); }
}
function boot(env, port) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(ROOT, 'pilotlog-cli/src/readApi.mjs')], {
      cwd: ROOT, env: { ...process.env, PORT: String(port), PILOTLOG_HOME: tmpDir(), DATABASE_URL: '', PILOTLOG_ACCOUNTS_V2: '', ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    const timer = setTimeout(() => { child.kill(); reject(new Error('boot timeout: ' + out)); }, 15000);
    child.stdout.on('data', (d) => { out += d; if (out.includes('listening on')) { clearTimeout(timer); resolve(child); } });
    child.stderr.on('data', (d) => { out += d; });
  });
}
const stop = (c) => new Promise((r) => { c.once('exit', r); c.kill(); });
async function call(base, method, p, body, headers = {}) {
  const r = await fetch(base + p, { method, headers: { 'content-type': 'application/json', ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
  return r.status;
}
/** Run fn while protecting the tracked deployment.json from any accidental write. */
async function guardDeploymentFile(fn) {
  const before = fs.existsSync(DEPLOYMENT) ? fs.readFileSync(DEPLOYMENT) : null;
  try { return await fn(before); } finally { if (before) fs.writeFileSync(DEPLOYMENT, before); }
}

test('legacyWriteWallet: only the session wallet, never a caller-chosen one', () => {
  assert.equal(legacyWriteWallet(null, VICTIM).ok, false, 'body wallet alone is not identity');
  assert.equal(legacyWriteWallet(null, VICTIM).status, 400);
  assert.equal(legacyWriteWallet('mn_addr_session', VICTIM).status, 403);
  assert.deepEqual(legacyWriteWallet('mn_addr_session', undefined), { ok: true, wallet: 'mn_addr_session' });
  assert.deepEqual(legacyWriteWallet('mn_addr_session', 'mn_addr_session'), { ok: true, wallet: 'mn_addr_session' });
});

pgTest('accounts ON: every legacy write is 410 (signed out and signed in), no flights row, deployment.json untouched', () => withSchema((pool, url) => guardDeploymentFile(async (before) => {
  const port = 23000 + Math.floor(Math.random() * 400);
  const c = await boot({ DATABASE_URL: url, PILOTLOG_ACCOUNTS_V2: 'true', PILOTLOG_COOKIE_SECURE: 'false', NODE_ENV: 'test' }, port);
  try {
    const base = `http://127.0.0.1:${port}`;
    const id = newStudentId(); await pool.query('INSERT INTO students (id) VALUES ($1)', [id]);
    const s = await createSession(pool, { studentId: id });
    for (const cookie of [null, `pl_sid=${s.token}`]) {
      for (const [m, p, body] of LEGACY_WRITES) {
        const st = await call(base, m, p, body, { origin: base, ...(cookie ? { cookie } : {}) });
        assert.equal(st, 410, `${m} ${p} (${cookie ? 'signed in' : 'signed out'}) -> ${st}`);
      }
    }
    assert.equal((await pool.query('SELECT count(*)::int n FROM flights')).rows[0].n, 0);
    if (before) assert.ok(fs.readFileSync(DEPLOYMENT).equals(before), 'deployment.json unchanged');
    // v2 routes and reads still work
    assert.equal((await fetch(`${base}/health`)).status, 200);
    assert.equal((await fetch(`${base}/api/v2/session`)).status, 200);
    assert.equal((await fetch(`${base}/profile`)).status, 200);
  } finally { await stop(c); }
})));

const FLAG_OFF_ROUTE_WRITES = [
  ['POST', '/api/cockpit/entries', { date: '2026-11-01', aircraftId: 'N1', totalTime: 1 }],
  ['PUT', '/api/cockpit/entries/0123456789abcdef', { totalTime: 2 }],
  ['DELETE', '/api/cockpit/entries/0123456789abcdef', undefined],
  ['PUT', '/api/cockpit/settings', { homeAirport: 'KAPA' }],
  ['POST', '/api/cockpit/tracks/0123456789abcdef', {}],
  ['PUT', '/api/checkride/rates', {}],
  ['PUT', '/api/checkride/test-date', { testDate: '2027-01-01' }],
  ['PUT', '/api/checkride/endorsements/solo', {}],
  ['PUT', '/api/checkride/acs/PA.I.A', {}],
  ['PUT', '/api/checkride/flights/0123456789abcdef', {}],
];

async function assertFlagOffClosed(base) {
  assert.equal((await fetch(`${base}/api/v2/session`)).status, 404, 'accounts stay off');
  for (const [m, p, body] of [...LEGACY_WRITES, ...FLAG_OFF_ROUTE_WRITES]) {
    for (const headers of [{}, { origin: base }, { origin: 'https://evil.example' }]) {
      const st = await call(base, m, p, body, headers);
      assert.equal(st, 410, `${m} ${p} origin=${headers.origin ?? 'none'} -> ${st}`);
    }
  }
  // same-origin + an asserted wallet is still not authentication
  assert.equal(await call(base, 'POST', '/wallet/connect', { address: VICTIM }, { origin: base }), 410);
  assert.equal((await fetch(`${base}/wallet/status`)).status, 200);
  assert.equal((await (await fetch(`${base}/wallet/status`)).json()).connected, false, 'no wallet session was created');
  // reads and stateless helpers still work
  for (const p of ['/health', '/entries', '/dashboard', '/profile', '/deployment.json', '/api/cockpit/entries']) {
    assert.ok([200, 404].includes((await fetch(base + p)).status), p);
  }
  const prof = await fetch(`${base}/profile`); assert.equal(prof.status, 200); assert.deepEqual(await prof.json(), {});
  assert.notEqual(await call(base, 'POST', '/api/cockpit/tracks/parse', { gpx: '' }, { origin: base }), 410, 'stateless parse stays open');
}

pgTest('accounts OFF (Postgres legacy mode): every legacy write is 410 with any Origin; no rows; deployment.json untouched', () => withSchema((pool, url) => guardDeploymentFile(async (before) => {
  const port = 23500 + Math.floor(Math.random() * 400);
  const c = await boot({ DATABASE_URL: url }, port);
  try {
    await assertFlagOffClosed(`http://127.0.0.1:${port}`);
    assert.equal((await pool.query('SELECT count(*)::int n FROM flights')).rows[0].n, 0);
    assert.equal((await pool.query('SELECT count(*)::int n FROM pilot_profiles')).rows[0].n, 0);
    if (before) assert.ok(fs.readFileSync(DEPLOYMENT).equals(before), 'deployment.json unchanged');
  } finally { await stop(c); }
})));

test('accounts OFF (file mode, no DB): every legacy write is 410; data files untouched', () => guardDeploymentFile(async (before) => {
  const port = 23900 + Math.floor(Math.random() * 90);
  const home = tmpDir();
  const c = await boot({ PILOTLOG_HOME: home }, port);
  try {
    const snap = () => fs.readdirSync(home).sort().map((f) => [f, fs.statSync(path.join(home, f)).mtimeMs]);
    const pre = JSON.stringify(snap());
    await assertFlagOffClosed(`http://127.0.0.1:${port}`);
    assert.equal(JSON.stringify(snap()), pre, 'no legacy data file created or modified');
    if (before) assert.ok(fs.readFileSync(DEPLOYMENT).equals(before), 'deployment.json unchanged');
  } finally { await stop(c); }
}));
