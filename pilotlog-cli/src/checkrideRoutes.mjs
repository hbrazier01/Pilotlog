/**
 * Checkride Tracker routes (v0.2).
 *   GET  /checkride                       HTML view (simple three-card design)
 *   GET  /api/checkride                   full computed state
 *   PUT  /api/checkride/rates             { aircraftRate, instructorRate, aircraftLabel }
 *   PUT  /api/checkride/test-date         { testDate: 'YYYY-MM-DD' | null }
 *   PUT  /api/checkride/endorsements/:key { date, cfiName, cfiCert, notes }
 *   PUT  /api/checkride/acs/:taskId       { status }
 *   PUT  /api/checkride/flights/:entryId  per-flight details
 *
 * Persistence: per student (lib/accounts/studentData.mjs). Postgres student_docs when DATABASE_URL
 * is set (falls back to legacy pilot_profiles.checkride_json for the wallet), otherwise
 * <DATA_DIR>/students/<id>/checkride.json. createCheckrideStore() is kept for the legacy file.
 */
import fs from 'node:fs';
import { renderCheckridePage } from './checkrideView.mjs';
import { demoData } from './lib/checkride/insights.mjs';
import path from 'node:path';
import {
  computeCheckride, EMPTY_STORE, ENDORSEMENT_CATALOG, sanitizeEndorsement,
  ACS_STATUSES, isValidAcsTask, PHASES, PHASE_LABELS,
} from './lib/checkride/index.mjs';

const FLIGHT_NUM_FIELDS = ['xcDistanceNm', 'fullStopPoints', 'longestLegNm', 'towerFullStops', 'nightTakeoffs', 'nightFullStops', 'aircraftRate', 'instructorRate', 'instructorHours'];

export function createCheckrideStore(dataDir, pg = null) {
  const file = path.join(dataDir, 'checkride.json');
  const fileRead = () => {
    try { return { ...EMPTY_STORE(), ...JSON.parse(fs.readFileSync(file, 'utf8')) }; } catch { return EMPTY_STORE(); }
  };
  const fileWrite = (store) => {
    const tmp = file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(store, null, 2));
    fs.renameSync(tmp, file);
  };
  return {
    file,
    read() {
      if (pg?.enabled?.()) {
        const cached = pg.read();
        return cached ? { ...EMPTY_STORE(), ...cached } : EMPTY_STORE();
      }
      return fileRead();
    },
    write(store) {
      if (pg?.enabled?.()) { pg.write(store); return; }
      fileWrite(store);
    },
  };
}

export function sanitizeFlightDetails(input = {}) {
  const out = {};
  for (const k of FLIGHT_NUM_FIELDS) {
    if (input[k] === undefined || input[k] === null || input[k] === '') continue;
    const v = Number(input[k]);
    if (!Number.isFinite(v) || v < 0 || v > 100000) throw new Error(`${k} must be a non-negative number`);
    out[k] = v;
  }
  if (input.checkridePrep !== undefined) out.checkridePrep = input.checkridePrep === true || input.checkridePrep === 'true';
  if (input.phase) { if (!PHASES.includes(input.phase)) throw new Error('invalid phase'); out.phase = input.phase; }
  return out;
}

function usd(v) {
  return '$' + Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

/**
 * Per-student routes. `data` is createStudentData(); every read/write is scoped to req.student
 * (set by attachStudent). Signed-out visitors get the read-only SAMPLE state; writes return 401.
 */
export function registerCheckrideRoutes(app, { escapeHtml, data, requireStudent }) {
  const state = async (st, asOf) => computeCheckride(await data.entries(st), await data.checkride(st), { asOf });
  const update = (fn) => [requireStudent, async (req, res) => {
    try {
      const st = req.student;
      const s = await data.checkride(st);
      await fn(req, s, st);
      await data.saveCheckride(st, s);
      res.json({ ok: true });
    } catch (err) { res.status(400).json({ ok: false, error: err.message }); }
  }];
  const demoState = () => { const d = demoData(); return computeCheckride(d.entries, d.store); };

  app.get('/api/checkride', async (req, res) => {
    if (!req.student || req.query.demo === '1') return res.json({ ...demoState(), demo: true, signedIn: !!req.student });
    try { res.json(await state(req.student, req.query.asOf ? String(req.query.asOf) : undefined)); }
    catch (err) { res.status(500).json({ ok: false, error: err.message }); }
  });

  app.put('/api/checkride/rates', ...update((req, s) => {
    const a = Number(req.body?.aircraftRate), i = Number(req.body?.instructorRate);
    if (!(a >= 0 && a < 10000) || !(i >= 0 && i < 10000)) throw new Error('rates must be numbers between 0 and 10000');
    s.rates = { aircraftRate: a, instructorRate: i, aircraftLabel: String(req.body?.aircraftLabel ?? s.rates?.aircraftLabel ?? '').slice(0, 40) };
  }));

  app.put('/api/checkride/test-date', ...update((req, s) => {
    const d = req.body?.testDate;
    if (d && !/^\d{4}-\d{2}-\d{2}$/.test(String(d))) throw new Error('testDate must be YYYY-MM-DD');
    s.testDate = d || null;
  }));

  app.put('/api/checkride/endorsements/:key', ...update((req, s) => {
    if (!ENDORSEMENT_CATALOG.some(c => c.key === req.params.key)) throw new Error('unknown endorsement');
    s.endorsements[req.params.key] = sanitizeEndorsement(req.body);
  }));

  app.put('/api/checkride/acs/:taskId', ...update((req, s) => {
    if (!isValidAcsTask(req.params.taskId)) throw new Error('unknown ACS task');
    if (!ACS_STATUSES.includes(req.body?.status)) throw new Error('invalid status');
    s.acs[req.params.taskId] = { status: req.body.status, updatedAt: new Date().toISOString() };
  }));

  app.put('/api/checkride/flights/:entryId', ...update(async (req, s, st) => {
    if (!(await data.entries(st)).some(e => e.id === req.params.entryId)) throw new Error('unknown flight');
    s.flights[req.params.entryId] = sanitizeFlightDetails(req.body);
  }));

  // ?demo=1 (or signed out) renders seeded sample state in memory only; never touches any store.
  app.get('/checkride', async (req, res) => {
    if (req.query.demo === '1' || !req.student) {
      const d = demoData();
      return res.type('html').send(renderCheckridePage(computeCheckride(d.entries, d.store), escapeHtml, { entries: d.entries, demo: true }));
    }
    try { res.type('html').send(renderCheckridePage(await state(req.student), escapeHtml, { entries: await data.entries(req.student) })); }
    catch (err) { res.status(500).type('text').send(String(err.message || err)); }
  });
}
