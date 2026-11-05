/**
 * Accounts v2 (PR-1): random student IDs, flag, additive schema, backfill.
 * Postgres tests run when PILOTLOG_TEST_DATABASE_URL is set (CI sets it via a service container)
 * and are skipped otherwise, so `npm test` still works with no database. Each test uses its own
 * throwaway schema; nothing outside that schema is touched.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import pg from 'pg';
import { newStudentId, isValidStudentId, isCanonicalWalletAddress, walletNetwork } from '../pilotlog-cli/src/lib/accounts/ids.mjs';
import { accountsV2Enabled } from '../pilotlog-cli/src/lib/accounts/flag.mjs';
import { migrateAccountsV2, accountsV2SchemaPresent } from '../pilotlog-cli/src/lib/accounts/schemaV2.mjs';
import { runBackfill } from '../pilotlog-cli/src/lib/accounts/backfill.mjs';
import { migrate } from '../pilotlog-cli/src/db.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCRIPT = path.join(ROOT, 'pilotlog-cli/scripts/backfill-students.mjs');
const TEST_DB = process.env.PILOTLOG_TEST_DATABASE_URL;
const pgTest = TEST_DB ? test : test.skip;

const W1 = 'mn_addr_preprod1' + 'q'.repeat(40) + 'acd';
const W2 = 'mn_addr_preprod1' + 'z'.repeat(40) + 'xyz';
const LEGACY = 'mn_shield-cpk_preprod1' + 'p'.repeat(40);

// ── Pure unit tests (always run) ─────────────────────────────────────────────
test('newStudentId: st_ + 24 lowercase hex, matches PR #11 shape', () => {
  for (let i = 0; i < 50; i++) assert.match(newStudentId(), /^st_[0-9a-f]{24}$/);
  assert.equal(isValidStudentId(newStudentId()), true);
  assert.equal(isValidStudentId('st_XYZ'), false);
  assert.equal(isValidStudentId(null), false);
});

test('newStudentId: random, not derived from any input (10k unique, bits vary)', () => {
  const ids = new Set();
  for (let i = 0; i < 10000; i++) ids.add(newStudentId());
  assert.equal(ids.size, 10000);
  // every hex position takes several distinct values → not a constant/derived prefix
  const sample = [...ids].slice(0, 500);
  for (let pos = 3; pos < 27; pos++) assert.ok(new Set(sample.map((s) => s[pos])).size >= 8, `pos ${pos}`);
});

test('wallet address helpers', () => {
  assert.equal(isCanonicalWalletAddress(W1), true);
  assert.equal(walletNetwork(W1), 'preprod');
  assert.equal(isCanonicalWalletAddress(LEGACY), false);
  assert.equal(isCanonicalWalletAddress('0x1234'), false);
});

test('flag PILOTLOG_ACCOUNTS_V2 defaults off; only "true"/"1" enable', () => {
  assert.equal(accountsV2Enabled({}), false);
  for (const v of ['', '0', 'false', 'yes', 'on']) assert.equal(accountsV2Enabled({ PILOTLOG_ACCOUNTS_V2: v }), false, v);
  for (const v of ['true', 'TRUE', '1', ' true ']) assert.equal(accountsV2Enabled({ PILOTLOG_ACCOUNTS_V2: v }), true, v);
});

test('file mode: migrate(null) is a no-op and backfill script exits 0 without DATABASE_URL', async () => {
  await migrate(null);
  const env = { ...process.env }; delete env.DATABASE_URL;
  const r = spawnSync(process.execPath, [SCRIPT], { env, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /JSON-file mode/);
});

// ── Postgres helpers ─────────────────────────────────────────────────────────
function schemaUrl(schema) {
  const u = new URL(TEST_DB);
  u.searchParams.set('options', `-c search_path=${schema}`);
  return u.toString();
}

async function withSchema(fn) {
  const schema = `t_${process.pid}_${Math.random().toString(36).slice(2, 10)}`;
  const admin = new pg.Pool({ connectionString: TEST_DB, max: 1 });
  await admin.query(`CREATE SCHEMA ${schema}`);
  const url = schemaUrl(schema);
  const pool = new pg.Pool({ connectionString: url, max: 3 });
  try {
    return await fn(pool, url);
  } finally {
    await pool.end();
    await admin.query(`DROP SCHEMA ${schema} CASCADE`);
    await admin.end();
  }
}

async function tableExists(pool, name) {
  const { rows } = await pool.query('SELECT to_regclass($1) IS NOT NULL AS e', [name]);
  return rows[0].e;
}

async function seedWalletRows(pool) {
  const flight = (id, w) => pool.query(
    `INSERT INTO flights (id, wallet_address, date, entry_json) VALUES ($1, $2, '2026-10-01', $3)`,
    [id, w, JSON.stringify({ id })]);
  await pool.query(`INSERT INTO pilot_profiles (wallet_address, full_name) VALUES ($1, 'A'), ($2, 'B')`, [W1, W2]);
  await flight('f1', W1); await flight('f2', W1); await flight('f3', W2); await flight('f4', LEGACY);
  await pool.query(`INSERT INTO aircraft (wallet_address, ident) VALUES ($1, 'N123'), ($2, 'N456')`, [W1, LEGACY]);
  await pool.query(`INSERT INTO milestones (wallet_address, milestone_key) VALUES ($1, 'solo')`, [W2]);
}

async function snapshot(pool) {
  const out = {};
  for (const t of ['pilot_profiles', 'flights', 'aircraft', 'milestones', 'students', 'identities', 'accounts_migration_log']) {
    if (!(await tableExists(pool, t))) { out[t] = null; continue; }
    const { rows } = await pool.query(`SELECT * FROM ${t} ORDER BY 1`);
    out[t] = JSON.stringify(rows);
  }
  return out;
}

function withEnv(vars, fn) {
  const saved = {};
  for (const k of Object.keys(vars)) { saved[k] = process.env[k]; if (vars[k] === undefined) delete process.env[k]; else process.env[k] = vars[k]; }
  return Promise.resolve(fn()).finally(() => {
    for (const k of Object.keys(saved)) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }
  });
}

// ── Postgres tests ───────────────────────────────────────────────────────────
pgTest('flag off: migrate() creates only the original tables (behaviour unchanged)', () => withSchema(async (pool) => {
  await withEnv({ PILOTLOG_ACCOUNTS_V2: undefined }, () => migrate(pool));
  for (const t of ['pilot_profiles', 'flights', 'aircraft', 'milestones']) assert.equal(await tableExists(pool, t), true, t);
  for (const t of ['students', 'identities', 'webauthn_credentials', 'auth_audit', 'accounts_migration_log', 'student_docs', 'student_usage']) assert.equal(await tableExists(pool, t), false, t);
  const { rows } = await pool.query(`SELECT count(*)::int AS n FROM information_schema.columns WHERE table_schema = current_schema() AND column_name = 'student_id'`);
  assert.equal(rows[0].n, 0);
}));

pgTest('flag on: migrate() up on a fresh database, then idempotent on re-run', () => withSchema(async (pool) => {
  await withEnv({ PILOTLOG_ACCOUNTS_V2: 'true' }, async () => { await migrate(pool); await migrate(pool); });
  assert.equal(await accountsV2SchemaPresent(pool), true);
  for (const t of ['students', 'identities', 'webauthn_credentials', 'auth_audit', 'accounts_migration_log']) assert.equal(await tableExists(pool, t), true, t);
  for (const t of ['pilot_profiles', 'flights', 'aircraft', 'milestones']) {
    const { rows } = await pool.query(`SELECT is_nullable FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = $1 AND column_name = 'student_id'`, [t]);
    assert.equal(rows[0]?.is_nullable, 'YES', t);
  }
  const { rows } = await pool.query(`SELECT count(*)::int AS n FROM accounts_migration_log WHERE kind = 'ddl'`);
  assert.equal(rows[0].n, 3); // 001 schema + 002 sessions + 003 student docs
  assert.deepEqual(await migrateAccountsV2(pool), { applied: false });
}));

pgTest('constraints: id format, identity type CHECK, UNIQUE(type,subject), one wallet → one student across wallet apps', () => withSchema(async (pool) => {
  await migrate(pool); await migrateAccountsV2(pool);
  const a = newStudentId(), b = newStudentId();
  await pool.query(`INSERT INTO students (id) VALUES ($1), ($2)`, [a, b]);
  await assert.rejects(pool.query(`INSERT INTO students (id) VALUES ('st_123')`), /check/i);
  await assert.rejects(pool.query(`INSERT INTO identities (student_id, type, subject) VALUES ($1, 'twitter', 'x')`, [a]), /check/i);
  await pool.query(`INSERT INTO identities (student_id, type, subject) VALUES ($1, 'email', 'a@example.com')`, [a]);
  await assert.rejects(pool.query(`INSERT INTO identities (student_id, type, subject) VALUES ($1, 'email', 'a@example.com')`, [b]), /unique|duplicate/i);
  await pool.query(`INSERT INTO identities (student_id, type, subject) VALUES ($1, 'midnight-1am', $2)`, [a, W1]);
  await assert.rejects(pool.query(`INSERT INTO identities (student_id, type, subject) VALUES ($1, 'midnight-lace', $2)`, [b, W1]), /unique|duplicate/i);
  await assert.rejects(pool.query(`INSERT INTO identities (student_id, type, subject) VALUES ('st_000000000000000000000000', 'passkey', 'cred')`), /foreign key/i);
  // passport slot accepted by schema (no code path writes it yet)
  await pool.query(`INSERT INTO identities (student_id, type, subject) VALUES ($1, 'midnight-passport', 'future')`, [b]);
}));

pgTest('PR #11 compatibility: pre-existing students(wallet_address NOT NULL) is relaxed, not dropped', () => withSchema(async (pool) => {
  await migrate(pool);
  await pool.query(`CREATE TABLE students (id TEXT PRIMARY KEY, wallet_address TEXT UNIQUE NOT NULL, provider TEXT, created_at TIMESTAMPTZ DEFAULT now())`);
  await pool.query(`INSERT INTO students (id, wallet_address, provider) VALUES ($1, $2, 'midnight-1am')`, ['st_' + 'a'.repeat(24), W1]);
  await migrateAccountsV2(pool);
  const { rows } = await pool.query(`SELECT is_nullable FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'students' AND column_name = 'wallet_address'`);
  assert.equal(rows[0].is_nullable, 'YES');
  const s = await pool.query(`SELECT id, wallet_address, status FROM students`);
  assert.equal(s.rows.length, 1); assert.equal(s.rows[0].status, 'active'); assert.equal(s.rows[0].wallet_address, W1);
  await pool.query(`INSERT INTO students (id) VALUES ($1)`, [newStudentId()]);
}));

pgTest('backfill dry run writes nothing (before and after schema exists) and reports counts', () => withSchema(async (pool) => {
  await migrate(pool); await seedWalletRows(pool);
  const plan0 = await runBackfill(pool);
  assert.equal(plan0.schemaPresent, false);
  assert.equal(plan0.canonicalWallets, 2); assert.equal(plan0.nonCanonicalWalletsSkipped, 1);
  await migrateAccountsV2(pool);
  const before = await snapshot(pool);
  const plan = await runBackfill(pool, { apply: false });
  assert.deepEqual(await snapshot(pool), before);
  assert.equal(plan.mode, 'dry-run');
  assert.equal(plan.studentsToCreate, 2);
  assert.equal(plan.nonCanonicalRowsSkipped, 2);
  assert.equal(plan.before.flights.total, 4);
  assert.equal(plan.after, undefined);
  const r = spawnSync(process.execPath, [SCRIPT, '--json'], { env: { ...process.env, DATABASE_URL: pool.options.connectionString }, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(JSON.parse(r.stdout.trim().split('\n').pop()).mode, 'dry-run');
  assert.deepEqual(await snapshot(pool), before);
  assert.ok(!r.stdout.includes(W1), 'dry-run output must not print wallet addresses');
}));

pgTest('backfill --apply refuses without v2 schema', () => withSchema(async (pool) => {
  await migrate(pool); await seedWalletRows(pool);
  await assert.rejects(runBackfill(pool, { apply: true }), /schema not present/);
}));

pgTest('backfill apply: assigns canonical wallets, skips non-canonical, keeps counts, idempotent', () => withSchema(async (pool) => {
  await migrate(pool); await migrateAccountsV2(pool); await seedWalletRows(pool);
  const res = await runBackfill(pool, { apply: true });
  assert.equal(res.studentsCreated, 2); assert.equal(res.identitiesCreated, 2); assert.equal(res.countsEqual, true);
  assert.deepEqual(res.rowsAssigned, { pilot_profiles: 2, flights: 3, aircraft: 1, milestones: 1 });
  const ids = await pool.query(`SELECT i.type, i.subject, i.verified_at, i.network, s.id FROM identities i JOIN students s ON s.id = i.student_id ORDER BY i.subject`);
  assert.equal(ids.rows.length, 2);
  for (const r of ids.rows) { assert.equal(r.type, 'midnight-legacy'); assert.equal(r.verified_at, null); assert.equal(r.network, 'preprod'); assert.ok(isValidStudentId(r.id)); }
  const f = await pool.query(`SELECT id, wallet_address, student_id FROM flights ORDER BY id`);
  assert.equal(f.rows.find((r) => r.id === 'f1').student_id, f.rows.find((r) => r.id === 'f2').student_id);
  assert.notEqual(f.rows.find((r) => r.id === 'f1').student_id, f.rows.find((r) => r.id === 'f3').student_id);
  assert.equal(f.rows.find((r) => r.id === 'f4').student_id, null);       // AIR-314 legacy row not guessed
  assert.equal(f.rows.find((r) => r.id === 'f4').wallet_address, LEGACY); // wallet_address untouched
  // idempotent
  const snap = await snapshot(pool);
  const again = await runBackfill(pool, { apply: true });
  assert.equal(again.studentsCreated, 0); assert.equal(again.identitiesCreated, 0);
  assert.deepEqual(again.rowsAssigned, { pilot_profiles: 0, flights: 0, aircraft: 0, milestones: 0 });
  const snap2 = await snapshot(pool);
  for (const t of ['pilot_profiles', 'flights', 'aircraft', 'milestones', 'students', 'identities']) assert.equal(snap2[t], snap[t], t);
  // new row for an already-backfilled wallet reuses its student
  await pool.query(`INSERT INTO flights (id, wallet_address, entry_json) VALUES ('f5', $1, '{}')`, [W1]);
  const third = await runBackfill(pool, { apply: true });
  assert.equal(third.studentsCreated, 0); assert.equal(third.rowsAssigned.flights, 1);
  const { rows } = await pool.query(`SELECT count(DISTINCT student_id)::int AS n FROM flights WHERE wallet_address = $1`, [W1]);
  assert.equal(rows[0].n, 1);
  const log = await pool.query(`SELECT count(*)::int AS n FROM accounts_migration_log WHERE kind = 'backfill'`);
  assert.equal(log.rows[0].n, 3);
}));

pgTest('backfill reuses a student that already has a verified wallet identity', () => withSchema(async (pool) => {
  await migrate(pool); await migrateAccountsV2(pool); await seedWalletRows(pool);
  const sid = newStudentId();
  await pool.query(`INSERT INTO students (id) VALUES ($1)`, [sid]);
  await pool.query(`INSERT INTO identities (student_id, type, subject, verified_at) VALUES ($1, 'midnight-lace', $2, now())`, [sid, W1]);
  const res = await runBackfill(pool, { apply: true });
  assert.equal(res.studentsCreated, 1); // only W2
  const { rows } = await pool.query(`SELECT DISTINCT student_id FROM flights WHERE wallet_address = $1`, [W1]);
  assert.deepEqual(rows.map((r) => r.student_id), [sid]);
}));

pgTest('existing wallet-keyed read/write helpers behave the same with v2 schema present', () => withSchema(async (pool, url) => {
  await migrate(pool); await migrateAccountsV2(pool);
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', `
    const db = await import(${JSON.stringify(path.join(ROOT, 'pilotlog-cli/src/db.mjs'))});
    await db.pgSaveEntry({ id: 'e1', date: '2026-10-02', totalTime: 1.2 }, ${JSON.stringify(W1)});
    await db.pgSaveProfile(${JSON.stringify(W1)}, { pilot: { fullName: 'T' } });
    await db.pgSaveAircraft({ ident: 'N1', type: 'C172' }, ${JSON.stringify(W1)});
    const e = await db.pgReadEntries(${JSON.stringify(W1)});
    const a = await db.pgReadAircraft(${JSON.stringify(W1)});
    console.log(JSON.stringify({ e: e.length, a: a.length, p: !!(await db.pgReadProfile(${JSON.stringify(W1)})) }));
    await db.getPool().end();`],
    { env: { ...process.env, DATABASE_URL: url, PILOTLOG_ACCOUNTS_V2: '' }, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(JSON.parse(r.stdout.trim().split('\n').pop()), { e: 1, a: 1, p: true });
  const { rows } = await pool.query(`SELECT count(*)::int AS n FROM flights WHERE student_id IS NULL`);
  assert.equal(rows[0].n, 1); // runtime does not write student_id yet
}));
