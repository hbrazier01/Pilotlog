/**
 * IE-4 lean v1: paper logbook import drafts. Synthetic fixtures only (test/fixtures/paper-import-synthetic.mjs);
 * no real photos, no model or provider calls. Postgres tests need PILOTLOG_TEST_DATABASE_URL.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import pg from 'pg';
import { migrate } from '../pilotlog-cli/src/db.mjs';
import { migrateAccountsV2 } from '../pilotlog-cli/src/lib/accounts/schemaV2.mjs';
import { registerAccountsV2 } from '../pilotlog-cli/src/lib/accounts/http.mjs';
import { createSession } from '../pilotlog-cli/src/lib/accounts/sessions.mjs';
import { newStudentId } from '../pilotlog-cli/src/lib/accounts/ids.mjs';
import { migratePaperImport } from '../pilotlog-cli/src/lib/import/schema.mjs';
import { validatePage, checkCarryAcrossPages } from '../pilotlog-cli/src/lib/import/validate.mjs';
import { redactIds } from '../pilotlog-cli/src/lib/import/redact.mjs';
import { createFixtureExtractor, selectExtractor } from '../pilotlog-cli/src/lib/import/extractors.mjs';
import { createLocalImageStore, createMemoryImageStore } from '../pilotlog-cli/src/lib/import/imageStore.mjs';
import { GOOD_PAGE, BAD_PAGE } from './fixtures/paper-import-synthetic.mjs';

const TEST_DB = process.env.PILOTLOG_TEST_DATABASE_URL;
const pgTest = TEST_DB ? test : test.skip;
const png = (tag) => Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from(`synthetic-${tag}-`.padEnd(64, 'x'))]);
const sha = (b) => createHash('sha256').update(b).digest('hex');

// ── Pure (always) ────────────────────────────────────────────────────────────
test('validatePage: clean synthetic page has no blocking issues; sums + carry-forward match', () => {
  const v = validatePage(GOOD_PAGE.rows, GOOD_PAGE.footer);
  assert.equal(v.blocking, false, JSON.stringify(v.issues));
  assert.deepEqual([v.sums.total, v.sums.dual, v.sums.sim, v.sums.xc], [2.7, 2.7, 1.0, 1.5]);
  assert.ok(!v.issues.some((i) => ['page_sums', 'carry_forward'].includes(i.rule)));
});

test('validatePage: spike failure modes are caught (year, xc>total, order, annotation, signoff, low confidence, sums, carry)', () => {
  const v = validatePage(BAD_PAGE.rows, BAD_PAGE.footer);
  const has = (rule, sev, row) => v.issues.some((i) => i.rule === rule && i.severity === sev && (row === undefined || i.row === row));
  assert.ok(v.blocking);
  assert.ok(has('date', 'error', 0));
  assert.ok(has('xc_le_total', 'error', 1));
  assert.ok(has('low_confidence', 'error', 1));
  assert.ok(has('dates_in_order', 'warn', 2));
  assert.ok(has('numeric_cell', 'error', 2));
  assert.ok(has('cfi_signoff', 'warn', 2));
  assert.ok(has('page_sums', 'warn'));
  assert.ok(has('carry_forward', 'warn'));
  // sim-only row with SEL filled (spike row-5 pattern) → warn; reviewed low cells stop blocking
  const simSel = validatePage([{ row_index: 0, cells: { date: { v: '2025-01-01', c: 'high' }, sim: { v: 3, c: 'high' }, sel: { v: 3, c: 'high' } } }]);
  assert.ok(simSel.issues.some((i) => i.rule === 'sim_only_no_sel'));
  const reviewed = validatePage([{ row_index: 0, cells: { date: { v: '2025-01-01', c: 'high' }, total: { v: 1, c: 'high' }, aircraft_ident: { v: 'N1', c: 'low', reviewed: true } } }]);
  assert.equal(reviewed.blocking, false);
  assert.equal(validatePage([], {}).issues[0].rule, 'page_sums'); // blank totals → info only
  assert.deepEqual(checkCarryAcrossPages({ to_date: { total: 12.7 } }, { forwarded: { total: 12.0 } }).map((i) => i.rule), ['carry_forward_pages']);
});

test('redactIds: passport, ID and certificate numbers keep only the last 2 characters', () => {
  assert.equal(redactIds('passport # X12345678 checked').text, 'passport # [redacted …78] checked');
  assert.equal(redactIds('US passport 123456789').text, 'US passport [redacted …89]');
  assert.match(redactIds('CFI 3456789012CFI exp 1/27').text, /\[redacted …FI\] exp 1\/27/);
  assert.match(redactIds('ssn 123-45-6789').text, /redacted …89/);
  assert.equal(redactIds('pattern work, 3 T/O, 61.87(d)').redactions, 0);
  assert.equal(redactIds('N12345 to KAPA').redactions, 0);
});

test('extractors: only manual/fixture exist; no provider extractor; fixture blocked in production', () => {
  assert.equal(selectExtractor({}).name, 'manual');
  assert.equal(selectExtractor({ PILOTLOG_IMPORT_EXTRACTOR: 'fixture' }).name, 'fixture');
  assert.throws(() => selectExtractor({ PILOTLOG_IMPORT_EXTRACTOR: 'openai' }), /not available in v1/);
  assert.throws(() => selectExtractor({ PILOTLOG_IMPORT_EXTRACTOR: 'fixture', NODE_ENV: 'production' }), /not allowed in production/);
});

test('local image store: random keys, 0600 files, no path traversal', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pl-img-'));
  const s = createLocalImageStore({ dir: path.join(dir, 'imgs') });
  const k = await s.put(png('a'));
  assert.match(k, /^img_[0-9a-f]{32}$/);
  assert.equal(fs.statSync(path.join(dir, 'imgs', k)).mode & 0o777, 0o600);
  assert.deepEqual(await s.get(k), png('a'));
  await assert.rejects(s.get('../etc/passwd'), /invalid image key/);
  await s.delete(k); assert.equal(await s.get(k), null);
});

test('flag off: import routes 404 (v2 on, import flag off)', async () => {
  const app = express(); app.use(express.json());
  registerAccountsV2(app, { pool: {}, env: { } });
  const srv = await new Promise((r) => { const x = app.listen(0, '127.0.0.1', () => r(x)); });
  const base = `http://127.0.0.1:${srv.address().port}`;
  try {
    assert.equal((await fetch(`${base}/api/v2/import/batches`, { method: 'POST', headers: { origin: base } })).status, 404);
    assert.equal((await fetch(`${base}/import`)).status, 404);
  } finally { await new Promise((r) => srv.close(r)); }
});

// ── Flow (Postgres) ──────────────────────────────────────────────────────────
async function withApp(fn) {
  const schema = `pi_${process.pid}_${Math.random().toString(36).slice(2, 10)}`;
  const admin = new pg.Pool({ connectionString: TEST_DB, max: 1 });
  await admin.query(`CREATE SCHEMA ${schema}`);
  const u = new URL(TEST_DB); u.searchParams.set('options', `-c search_path=${schema}`);
  const pool = new pg.Pool({ connectionString: u.toString(), max: 8 });
  const store = createMemoryImageStore();
  const good = png('good'), bad = png('bad');
  const extractor = createFixtureExtractor({ [sha(good)]: GOOD_PAGE, [sha(bad)]: BAD_PAGE });
  try {
    await migrate(pool); await migrateAccountsV2(pool); await migratePaperImport(pool); await migratePaperImport(pool); // idempotent
    const app = express(); app.use(express.json());
    registerAccountsV2(app, { pool, env: { PILOTLOG_ACCOUNTS_V2: 'true', PILOTLOG_PAPER_IMPORT: 'true', PILOTLOG_COOKIE_SECURE: 'false', PILOTLOG_EMAIL_PROVIDER: 'test' },
      cleanupEveryMs: 0, importStore: store, importExtractor: extractor });
    const srv = await new Promise((r) => { const x = app.listen(0, '127.0.0.1', () => r(x)); });
    const base = `http://127.0.0.1:${srv.address().port}`;
    const student = async () => {
      const id = newStudentId(); await pool.query(`INSERT INTO students (id) VALUES ($1)`, [id]);
      return { id, cookie: `pl_sid=${(await createSession(pool, { studentId: id })).token}` };
    };
    const call = (method, p, st, body, ct = 'application/json') => fetch(base + p, { method,
      headers: { origin: base, 'content-type': ct, ...(st ? { cookie: st.cookie } : {}) },
      body: body === undefined ? undefined : (Buffer.isBuffer(body) ? body : JSON.stringify(body)) });
    try { return await fn({ pool, store, call, student, good, bad }); } finally { await new Promise((r) => srv.close(r)); }
  } finally { await pool.end(); await admin.query(`DROP SCHEMA ${schema} CASCADE`); await admin.end(); }
}

pgTest('upload → extract → review → confirm: flights tagged paper_import, linked to page, redacted, not CFI-signed', () => withApp(async (h) => {
  const st = await h.student();
  assert.equal((await h.call('POST', '/api/v2/import/batches')).status, 401);
  const b = await (await h.call('POST', '/api/v2/import/batches', st)).json();
  assert.match(b.id, /^ib_/); assert.equal(b.extractor, 'fixture');
  assert.equal((await h.call('POST', `/api/v2/import/batches/${b.id}/pages?page_type=flight_left`, st, Buffer.from('GIF89a-not-a-png-at-all'), 'image/png')).status, 415);
  const pr = await h.call('POST', `/api/v2/import/batches/${b.id}/pages?page_type=flight_left&spread=1&rotation=90`, st, h.good, 'image/png');
  assert.equal(pr.status, 201);
  const page = await pr.json();
  const ex = await (await h.call('POST', `/api/v2/import/pages/${page.id}/extract`, st)).json();
  assert.deepEqual(ex, { rows: 3, redactions: 1 });
  const view = await (await h.call('GET', `/api/v2/import/pages/${page.id}`, st)).json();
  assert.equal(view.rotation, 90);
  assert.equal(view.rows[1].cells.remarks.v, 'XC; passport # [redacted …78] checked for TSA');
  assert.equal(view.rows[2].cells.total.v, null, 'empty stays empty, never 0');
  // the raw passport number is nowhere in the DB
  assert.ok(!JSON.stringify((await h.pool.query('SELECT * FROM import_rows')).rows).includes('12345678'));
  const img = await h.call('GET', `/api/v2/import/pages/${page.id}/image`, st);
  assert.equal(img.headers.get('content-type'), 'image/png');
  assert.deepEqual(Buffer.from(await img.arrayBuffer()), h.good);

  const conf = await (await h.call('POST', `/api/v2/import/pages/${page.id}/confirm`, st)).json();
  assert.equal(conf.ok, true, JSON.stringify(conf.validation?.issues));
  assert.equal(conf.flights.length, 3);
  const fl = (await h.pool.query(`SELECT * FROM flights WHERE student_id = $1 ORDER BY date`, [st.id])).rows;
  assert.equal(fl.length, 3);
  for (const f of fl) {
    assert.equal(f.source, 'paper_import'); assert.equal(f.imported_by_student_verified, true);
    assert.equal(f.verification_status, 'student_imported'); assert.equal(f.import_page_id, page.id);
    assert.equal(f.wallet_address, null);
  }
  assert.equal(Number(fl[1].xc_time), 1.5);
  assert.equal(fl[2].total_time, null, 'sim-only row has no total');
  assert.match(fl[1].remarks, /redacted …78/);
  assert.equal((await h.call('POST', `/api/v2/import/pages/${page.id}/confirm`, st)).status, 409);
  assert.equal((await h.call('PATCH', `/api/v2/import/pages/${page.id}/rows/0`, st, { cells: { total: { v: 9 } } })).status, 409);
}));

pgTest('blocking issues → 422; student fixes cells → confirm succeeds; other students see 404', () => withApp(async (h) => {
  const st = await h.student(), other = await h.student();
  const b = await (await h.call('POST', '/api/v2/import/batches', st)).json();
  const page = await (await h.call('POST', `/api/v2/import/batches/${b.id}/pages?page_type=flight_full`, st, h.bad, 'image/png')).json();
  await h.call('POST', `/api/v2/import/pages/${page.id}/extract`, st);
  const r1 = await h.call('POST', `/api/v2/import/pages/${page.id}/confirm`, st);
  assert.equal(r1.status, 422);
  assert.ok((await r1.json()).validation.issues.some((i) => i.rule === 'date'));
  assert.equal((await h.pool.query(`SELECT count(*)::int n FROM flights`)).rows[0].n, 0);
  // other student
  for (const [m, p] of [['GET', `/api/v2/import/pages/${page.id}`], ['GET', `/api/v2/import/pages/${page.id}/image`], ['POST', `/api/v2/import/pages/${page.id}/confirm`]])
    assert.equal((await h.call(m, p, other)).status, 404, p);
  assert.equal((await h.call('POST', `/api/v2/import/batches/${b.id}/pages?page_type=flight_full`, other, h.good, 'image/png')).status, 404);
  // fixes
  await h.call('PATCH', `/api/v2/import/pages/${page.id}/rows/0`, st, { cells: { date: { v: '2025-03-05' } } });
  await h.call('PATCH', `/api/v2/import/pages/${page.id}/rows/1`, st, { cells: { xc: { v: 1.0 }, aircraft_ident: { reviewed: true } } });
  await h.call('PATCH', `/api/v2/import/pages/${page.id}/rows/2`, st, { cells: { sim: { v: null }, date: { v: '2025-03-09' }, remarks: { v: 'PP-T briefing; DL 1234567 shown' } } });
  await h.call('PUT', `/api/v2/import/pages/${page.id}/footer`, st, { this_page: { total: 3.0 }, forwarded: { total: 10.0 }, to_date: { total: 13.0 } });
  const view = await (await h.call('GET', `/api/v2/import/pages/${page.id}`, st)).json();
  assert.equal(view.validation.blocking, false, JSON.stringify(view.validation.issues));
  assert.match(view.rows[2].cells.remarks.v, /DL \[redacted …67\]/);
  assert.ok(view.validation.issues.some((i) => i.rule === 'cfi_signoff')); // still shown as a warning
  const ok = await (await h.call('POST', `/api/v2/import/pages/${page.id}/confirm`, st)).json();
  assert.equal(ok.ok, true);
  assert.equal(ok.flights.length, 3);
  assert.equal((await h.pool.query(`SELECT count(*)::int n FROM flights WHERE verification_status <> 'student_imported'`)).rows[0].n, 0);
}));
