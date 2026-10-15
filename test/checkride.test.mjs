import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluate61109a, prepWindowStart, computeCheckride, buildEndorsementChecklist, sanitizeEndorsement,
  buildAcsChecklist, isValidAcsTask, computeCosts, flightCost, PPL_ASEL_ACS,
} from '../pilotlog-cli/src/lib/checkride/index.mjs';
import { sanitizeFlightDetails } from '../pilotlog-cli/src/checkrideRoutes.mjs';

const dual = (date, h, extra = {}) => ({ id: date + h, date, totalTime: h, dual: h, ...extra });
const solo = (date, h, extra = {}) => ({ id: 's' + date + h, date, totalTime: h, solo: h, ...extra });

test('empty logbook: nothing met, 13 requirements', () => {
  const r = evaluate61109a([], { asOf: '2026-10-13' });
  assert.equal(r.totalCount, 13);
  assert.equal(r.metCount, 0);
  assert.equal(r.requirements.totalTime.deficit, 40);
});

test('long solo XC needs 150 NM, 3 full-stop points AND a leg > 50 NM', () => {
  const base = { xc: 3, xcDistanceNm: 150, fullStopPoints: 3 };
  const okLeg = evaluate61109a([solo('2026-09-01', 3, { ...base, longestLegNm: 51 })], { asOf: '2026-10-13' });
  assert.equal(okLeg.requirements.longSoloXC.met, true);
  const exactly50 = evaluate61109a([solo('2026-09-01', 3, { ...base, longestLegNm: 50 })], { asOf: '2026-10-13' });
  assert.equal(exactly50.requirements.longSoloXC.met, false, 'segment must be MORE than 50 NM');
  const twoPoints = evaluate61109a([solo('2026-09-01', 3, { ...base, fullStopPoints: 2, longestLegNm: 60 })], { asOf: '2026-10-13' });
  assert.equal(twoPoints.requirements.longSoloXC.met, false);
  const dualOnly = evaluate61109a([dual('2026-09-01', 3, { ...base, longestLegNm: 60 })], { asOf: '2026-10-13' });
  assert.equal(dualOnly.requirements.longSoloXC.met, false, 'must be solo');
});

test('night XC must be OVER 100 NM and night ops count only on dual night flights', () => {
  const at100 = evaluate61109a([dual('2026-09-01', 2, { night: 2, xc: 2, xcDistanceNm: 100, nightLandings: 4 })], { asOf: '2026-10-13' });
  assert.equal(at100.requirements.nightXC.met, false);
  const over = evaluate61109a([dual('2026-09-01', 2, { night: 2, xc: 2, xcDistanceNm: 101, nightLandings: 10 })], { asOf: '2026-10-13' });
  assert.equal(over.requirements.nightXC.met, true);
  assert.equal(over.requirements.nightFullStops.met, true);
  assert.equal(over.requirements.nightTakeoffs.actual, 10);
});

test('solo towered-airport ops: 3 required, solo only', () => {
  const r = evaluate61109a([solo('2026-09-01', 1, { towerFullStops: 2 }), dual('2026-09-02', 1, { towerFullStops: 5 })], { asOf: '2026-10-13' });
  assert.equal(r.requirements.soloTowerOps.actual, 2);
  assert.equal(r.requirements.soloTowerOps.met, false);
});

test('§61.109(a)(4) window: preceding 2 calendar months from the month of the test', () => {
  assert.equal(prepWindowStart('2027-03-15').toISOString().slice(0, 10), '2027-01-01');
  const entries = [
    dual('2026-12-31', 1.5, { checkridePrep: true }),
    dual('2027-01-02', 1.5, { checkridePrep: true }),
    dual('2027-02-20', 1.5, { checkridePrep: true }),
    dual('2027-02-21', 2.0),
  ];
  const r = evaluate61109a(entries, { asOf: '2027-03-15', testDate: '2027-03-15' });
  assert.equal(r.requirements.checkridePrep.actual, 3);
  assert.equal(r.requirements.checkridePrep.met, true);
});

test('meets all minimums with a complete synthetic logbook', () => {
  const e = [
    dual('2026-10-01', 17, { simulatedInstrument: 3 }),
    dual('2026-10-05', 3, { xc: 3 }),
    dual('2026-10-08', 3, { night: 3, xc: 1.5, xcDistanceNm: 110, nightLandings: 10 }),
    dual('2026-12-20', 3, { checkridePrep: true }),
    solo('2026-11-01', 5, { towerFullStops: 3 }),
    solo('2026-11-15', 5, { xc: 5, xcDistanceNm: 160, fullStopPoints: 3, longestLegNm: 70 }),
    dual('2026-12-21', 4),
  ];
  const r = evaluate61109a(e, { asOf: '2027-01-10', testDate: '2027-01-10' });
  const unmet = Object.values(r.requirements).filter(x => !x.met).map(x => x.key);
  assert.deepEqual(unmet, []);
  assert.equal(r.allMet, true);
});

test('endorsements: stored date marks obtained; bad date rejected', () => {
  const list = buildEndorsementChecklist({ preSoloKnowledge: { date: '2026-10-10', cfiName: 'Sam Instructor' } });
  const k = list.find(x => x.key === 'preSoloKnowledge');
  assert.equal(k.obtained, true);
  assert.equal(k.cfiName, 'Sam Instructor');
  assert.equal(list.find(x => x.key === 'practicalTest').obtained, false);
  assert.throws(() => sanitizeEndorsement({ date: '10/10/2026' }));
});

test('ACS: 12 areas, area X empty for ASEL, status counts', () => {
  assert.equal(PPL_ASEL_ACS.length, 12);
  assert.equal(PPL_ASEL_ACS.find(a => a.area === 'X').tasks.length, 0);
  assert.ok(isValidAcsTask('PA.IV.N'));
  assert.ok(!isValidAcsTask('PA.X.A'));
  const c = buildAcsChecklist({ 'PA.V.A': { status: 'proficient' }, 'PA.VII.B': { status: 'introduced' }, 'PA.I.A': { status: 'bogus' } });
  assert.equal(c.counts.proficient, 1);
  assert.equal(c.counts.introduced, 1);
  assert.equal(c.counts.not_started, c.total - 2);
});

test('costs: defaults $180 aircraft / $65 instructor, block billing override', () => {
  assert.deepEqual(flightCost({ totalTime: 1.2, dual: 1.2 }), { hours: 1.2, aircraftRate: 180, instructorRate: 65, instructorHours: 1.2, aircraft: 216, instructor: 78, total: 294 });
  const blk = flightCost({ totalTime: 1.2, dual: 1.2, instructorHours: 2 });
  assert.equal(blk.instructor, 130);
  const custom = flightCost({ totalTime: 1 }, { aircraftRate: 200, instructorRate: 70 });
  assert.equal(custom.total, 200);
});

test('costs: to-date by phase and projection from deficits', () => {
  const entries = [dual('2026-10-01', 1.0, { instructorHours: 1.5 }), dual('2026-10-02', 1.0, { instructorHours: 1.5 })];
  const r = evaluate61109a(entries, { asOf: '2026-10-13' });
  const c = computeCosts(entries, r.requirements);
  assert.equal(c.toDate, 2 * (180 + 97.5));
  assert.equal(c.byPhase.find(p => p.phase === 'pre_solo').flights, 2);
  const p = c.projection;
  // dual: max(18, 3+3+3+3=12) = 18; solo: max(10,5)=10; total deficit 38 = 28 → +10 filler dual
  assert.equal(p.remainingDualHours, 28);
  assert.equal(p.remainingSoloHours, 10);
  assert.equal(p.instructorBlockFactor, 1.5);
  assert.equal(p.estimatedLessons, 38);
  assert.equal(p.aircraftCost, 38 * 180);
  assert.equal(p.instructorCost, 28 * 1.5 * 65);
});

test('computeCheckride merges per-flight details without mutating entries', () => {
  const entries = [solo('2026-09-01', 1)];
  const id = entries[0].id;
  const out = computeCheckride(entries, { flights: { [id]: { towerFullStops: 3 } } }, { asOf: '2026-10-13' });
  assert.equal(out.readiness.requirements.soloTowerOps.met, true);
  assert.equal(entries[0].towerFullStops, undefined);
});

test('sanitizeFlightDetails rejects junk', () => {
  assert.deepEqual(sanitizeFlightDetails({ xcDistanceNm: '152', checkridePrep: true, foo: 'x', towerFullStops: '' }), { xcDistanceNm: 152, checkridePrep: true });
  assert.throws(() => sanitizeFlightDetails({ xcDistanceNm: '-1' }));
  assert.throws(() => sanitizeFlightDetails({ phase: 'party' }));
});

import { whatsLeft, joinList } from '../pilotlog-cli/src/lib/checkride/summary.mjs';
import { createCheckrideStore } from '../pilotlog-cli/src/checkrideRoutes.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

test("whatsLeft: plain-language line from deficits + endorsements", () => {
  const reqs = {
    soloXC: { met: false, deficit: 3.2 },
    nightFullStops: { met: false, deficit: 3 },
    totalTime: { met: true, deficit: 0 },
  };
  const ends = [{ obtained: false }, { obtained: true }, { obtained: false }];
  assert.equal(whatsLeft(reqs, ends), 'You need 3.2 more hrs solo XC, 3 night landings, and 2 endorsements.');
  assert.equal(whatsLeft({ soloTowerOps: { met: false, deficit: 1 } }, []), 'You need 1 solo towered landing.');
  assert.match(whatsLeft({}, []), /schedule your checkride/);
  assert.equal(joinList(['a', 'b']), 'a and b');
});

test('computeCheckride exposes whatsLeft', () => {
  const out = computeCheckride([], {}, { asOf: '2026-10-13' });
  assert.match(out.whatsLeft, /^You need 40 more hrs total time/);
  assert.match(out.whatsLeft, /9 endorsements\.$/);
});

test('store: uses pg adapter when enabled, file otherwise', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cr-'));
  const fileStore = createCheckrideStore(dir);
  const s = fileStore.read(); s.testDate = '2027-02-26'; fileStore.write(s);
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir, 'checkride.json'), 'utf8')).testDate, '2027-02-26');

  let saved = null;
  const pgStore = createCheckrideStore(dir, { enabled: () => true, read: () => saved, write: (v) => { saved = v; } });
  assert.equal(pgStore.read().testDate, null, 'pg mode ignores the JSON file');
  const p = pgStore.read(); p.rates.aircraftRate = 240; pgStore.write(p);
  assert.equal(saved.rates.aircraftRate, 240);
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir, 'checkride.json'), 'utf8')).rates.aircraftRate, 180, 'file untouched in pg mode');
});
