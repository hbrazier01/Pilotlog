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
 * Persistence: when DATABASE_URL is set, store is wallet-scoped in
 * pilot_profiles.checkride_json (same pattern as identity_json). Otherwise
 * falls back to <DATA_DIR>/checkride.json.
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

export function registerCheckrideRoutes(app, { dataDir, readEntries, escapeHtml, safeJsonForScript, pg = null }) {
  const store = createCheckrideStore(dataDir, pg);
  const state = (asOf) => computeCheckride(readEntries(), store.read(), { asOf });
  const update = (res, fn) => {
    try { const s = store.read(); fn(s); store.write(s); res.json({ ok: true }); }
    catch (err) { res.status(400).json({ ok: false, error: err.message }); }
  };

  app.get('/api/checkride', (req, res) => res.json(state(req.query.asOf ? String(req.query.asOf) : undefined)));

  app.put('/api/checkride/rates', (req, res) => update(res, s => {
    const a = Number(req.body?.aircraftRate), i = Number(req.body?.instructorRate);
    if (!(a >= 0 && a < 10000) || !(i >= 0 && i < 10000)) throw new Error('rates must be numbers between 0 and 10000');
    s.rates = { aircraftRate: a, instructorRate: i, aircraftLabel: String(req.body?.aircraftLabel ?? s.rates?.aircraftLabel ?? '').slice(0, 40) };
  }));

  app.put('/api/checkride/test-date', (req, res) => update(res, s => {
    const d = req.body?.testDate;
    if (d && !/^\d{4}-\d{2}-\d{2}$/.test(String(d))) throw new Error('testDate must be YYYY-MM-DD');
    s.testDate = d || null;
  }));

  app.put('/api/checkride/endorsements/:key', (req, res) => update(res, s => {
    if (!ENDORSEMENT_CATALOG.some(c => c.key === req.params.key)) throw new Error('unknown endorsement');
    s.endorsements[req.params.key] = sanitizeEndorsement(req.body);
  }));

  app.put('/api/checkride/acs/:taskId', (req, res) => update(res, s => {
    if (!isValidAcsTask(req.params.taskId)) throw new Error('unknown ACS task');
    if (!ACS_STATUSES.includes(req.body?.status)) throw new Error('invalid status');
    s.acs[req.params.taskId] = { status: req.body.status, updatedAt: new Date().toISOString() };
  }));

  app.put('/api/checkride/flights/:entryId', (req, res) => update(res, s => {
    if (!readEntries().some(e => e.id === req.params.entryId)) throw new Error('unknown flight');
    s.flights[req.params.entryId] = sanitizeFlightDetails(req.body);
  }));

  // ?demo=1 renders seeded sample state in memory only; never touches the store.
  app.get('/checkride', (req, res) => {
    const demo = req.query.demo === '1';
    if (demo) {
      const d = demoData();
      return res.type('html').send(renderCheckridePage(computeCheckride(d.entries, d.store), escapeHtml, { entries: d.entries, demo: true }));
    }
    res.type('html').send(renderCheckridePage(state(), escapeHtml, { entries: readEntries() }));
  });
}
