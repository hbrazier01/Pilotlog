// Radio Practice taxi-routing safety regression (Nov 10 2026 production report, KAPA Ground · Taxi, RWY 28).
// Ground issued "runway 28, taxi via A8, C, C5": A8 is at Hot Spot 2 on the west (RWY 10) end of 10/28,
// and taxilane C is not a taxiway and not ATC controlled (FAA From the Flight Deck APA, HS 3). On the FAA
// airport diagram AL-5715 (cycle 26134, https://aeronav.faa.gov/d-tpp/2611/05715AD.PDF) the RWY 28
// departure end is reached from the midfield ramp on taxilane C, then C5.
// Correction (Nov 10 2026, Holland Brazier): PR #25 failed closed to a bare hold-short ("NO ROUTE"). The
// intended clearance from the midfield run-up is "runway 28, taxi to C5 via C" — never via A8.
// Fixture: OSM snapshot the app itself fetches for KAPA (© OpenStreetMap contributors, ODbL).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildTaxiRoute, buildExit, isNonMovement, TAXI_RULES, getRadioAirportData } from '../pilotlog-cli/src/lib/airport/airportData.mjs';
import { buildContext, scenarioScript, createSession, respond, sessionScore, gradeReadback, gradeCall, isChallenge } from '../public/js/atc-engine.js';
const respondCall = (t, st) => gradeCall(t, st);

const OSM = JSON.parse(fs.readFileSync(new URL('./fixtures/osm-kapa-2026-10-15.json', import.meta.url), 'utf8'));
const KAPA = { icao: 'KAPA' };
const settings = { homeAirport: 'KAPA', towerName: 'Centennial', tailNumber: 'N272DS', aircraftType: 'da40' };
const wx28 = { metar: { wdir: 250, wspd: 4, altim: 30.22 }, station: { runways: [{ id: '10/28' }] } };
const EXPECTED_28 = 'Diamond Star N272DS, Centennial Ground, runway 28, taxi to C5 via C, hold short of runway 28.';
const noA8 = (s) => !/\bA8\b|alpha eight/i.test(String(s));

async function kapaAirportData() {
  const fetchImpl = async () => ({ ok: true, json: async () => OSM, text: async () => '' });
  return getRadioAirportData({ icao: 'KAPA', lat: 39.5701, lon: -104.8493 }, null, { fetchImpl, dataDir: null });
}

test('FAA-backed KAPA rule: taxilane C is non-movement except on the verified midfield run-up → RWY 28 path', () => {
  assert.ok(isNonMovement({ aeroway: 'taxiway', ref: 'C' }, TAXI_RULES.KAPA));
  assert.ok(!isNonMovement({ aeroway: 'taxiway', ref: 'C1' }, TAXI_RULES.KAPA));
  assert.ok(!isNonMovement({ aeroway: 'taxiway', ref: 'A8' }, TAXI_RULES.KAPA));
  assert.ok(isNonMovement({ aeroway: 'taxiway', taxiway: 'taxilane', ref: 'T' }, null)); // generic OSM taxilane tag
  assert.equal(TAXI_RULES.KAPA.noRoute, undefined); // PR #25's hardcoded RWY 28 "no route" is gone
  const p28 = TAXI_RULES.KAPA.paths['28'];
  assert.equal(p28.start.name, 'midfield run-up');
  assert.deepEqual([...p28.taxilanes], ['C']); assert.deepEqual([...p28.expect], ['C', 'C5']);
  assert.deepEqual(Object.keys(TAXI_RULES.KAPA.paths), ['28']); // no other runway end gets taxilane C
});

test('the bug: raw OSM Dijkstra produced A8, C, C5 for RWY 28 (why the fix is needed)', () => {
  // without the KAPA rule the graph still yields the reported bad route — the OSM data alone cannot tell
  assert.deepEqual(buildTaxiRoute(OSM, '28').route, ['A8', 'C', 'C5']);
});

test('KAPA RWY 28 from the midfield run-up: route is exactly C → C5, never A8', () => {
  const r = buildTaxiRoute(OSM, '28', KAPA);
  assert.deepEqual(r.route, ['C', 'C5']);
  assert.equal(r.from, 'midfield run-up'); assert.equal(r.phrase, 'to'); assert.equal(r.runway, '28');
  assert.ok(!r.route.includes('A8'));
});

test('the old buggy path (generic GA apron start that walked to A8, then C, C5) cannot come back', () => {
  // generic start + taxilane C filtered (PR #25 rules without the verified path): still no route, never A8, C, C5
  assert.equal(buildTaxiRoute(OSM, '28', { rules: { nonMovement: ['C'] } }), null);
  // verified path but a start that would walk the graph over A8 first: the expect check fails closed
  const p = TAXI_RULES.KAPA.paths['28'];
  const generic = { lat: 39.5714, lon: -104.849 }; // centroid area of the OSM "GA Ramp" the old heuristic picked
  assert.equal(buildTaxiRoute(OSM, '28', { rules: { ...TAXI_RULES.KAPA, paths: { 28: { ...p, start: generic } } } }), null);
  // without the ramp-stub rule, OSM's A8 tag on the ramp throat would be named: that must fail closed, not issue A8
  assert.equal(buildTaxiRoute(OSM, '28', { rules: { ...TAXI_RULES.KAPA, paths: { 28: { ...p, rampRefs: [] } } } }), null);
  // and with no expect guard the same start would produce the bad list — proving the guard is what stops it
  assert.deepEqual(buildTaxiRoute(OSM, '28', { rules: { ...TAXI_RULES.KAPA, paths: { 28: { ...p, rampRefs: [], expect: null } } } }).route, ['A8', 'C', 'C5']);
});

test('KAPA RWY 10 still does not use taxilane C (old route was A8, C, C1); fails closed when no movement-area path', () => {
  const r10 = buildTaxiRoute(OSM, '10', KAPA);
  assert.ok(r10 === null || !r10.route.includes('C'), JSON.stringify(r10));
  assert.equal(r10, null);
});

test('KAPA 17L / 35R still get real movement-area routes on parallel A (fix is not "fail everything")', () => {
  assert.deepEqual(buildTaxiRoute(OSM, '17L', KAPA).route, ['A8', 'A', 'A1']);
  assert.deepEqual(buildTaxiRoute(OSM, '35R', KAPA).route, ['A8', 'A', 'A18']);
  // 17R would need to cross RWY 17L on A8/B8: crossings need their own instruction, so no route
  assert.equal(buildTaxiRoute(OSM, '17R', KAPA), null);
  // taxilane C appears only on the verified RWY 28 path
  for (const rw of ['10', '17L', '35R', '17R', '35L']) { const r = buildTaxiRoute(OSM, rw, KAPA); assert.ok(!r || !r.route.includes('C'), rw); }
  assert.equal(buildTaxiRoute(OSM, '35L', KAPA), null);
});

test('KAPA landing exit never names taxilane C', () => {
  for (const rw of ['10', '28']) { const ex = buildExit(OSM, rw, KAPA); assert.ok(!ex || ex.exit !== 'C', rw); }
});

test('KAPA Ground · Taxi RWY 28 (ATIS Charlie, N272DS) from the midfield run-up: "taxi to C5 via C", never A8, no NO ROUTE', async () => {
  const ad = await kapaAirportData();
  assert.deepEqual(ad.taxi['28'].route, ['C', 'C5']);
  ad.atis = { letter: 'C' };
  const c = buildContext({ settings, weather: wx28, scenario: 'ground_taxi', airportData: ad });
  assert.equal(c.runway, '28'); assert.equal(c.atis, 'C');
  assert.ok(!c.taxiUnavailable); assert.equal(c.taxiNote, null); assert.ok(!c.simulated.includes('taxi'));
  assert.deepEqual(c.taxiRoute, ['C', 'C5']); assert.equal(c.taxiClear, 'to C5 via C'); assert.equal(c.taxiFrom, 'midfield run-up');
  const chip = c.taxiRoute.length ? c.taxiRoute.join('→') : 'NO ROUTE'; // same expression the TAXI chip uses (atc-practice.js)
  assert.equal(chip, 'C→C5');
  const [st] = scenarioScript(c);
  console.log('KAPA RWY 28 clearance:', st.reply.text);
  assert.equal(st.reply.text, EXPECTED_28);
  assert.equal(st.reply.speak, 'Diamond Star November two seven two Delta Sierra, Centennial Ground, runway two eight, taxi to Charlie five via Charlie, hold short of runway two eight.');
  assert.equal(st.ideal, 'Runway 28, taxi to C5 via C, hold short runway 28, Diamond Star 2DS.');
  for (const s of [st.reply.text, st.reply.speak, st.ideal, chip, c.taxiway, c.taxiClear, st.cue, st.example]) {
    assert.ok(noA8(s), s);
    assert.ok(!/no route|noRoute/i.test(s), s);
  }
  assert.match(st.cue, /midfield run-up/); assert.match(st.example, /at the midfield run-up/);
  assert.deepEqual(st.readback.map((e) => e.id), ['runway', 'route', 'hold_short', 'callsign']);
  // Holland's call from the production session is a clean initial call (position "midfield run up")
  const call = respondCall('Centennial ground, Diamond 272DS requesting northeast departure, midfield run up complete, with charlie', st);
  assert.ok(!call.missing.some((m) => m.id === 'position'), JSON.stringify(call.missing));
  // a correct readback passes; dropping the route or the hold-short still fails
  assert.ok(gradeReadback('runway 28, taxi to Charlie five via Charlie, hold short runway 28, Diamond Star 2DS', st).passed);
  assert.ok(gradeReadback('runway 28 taxi to C5 via C hold short 28 2DS', st).passed);
  const noRoute = gradeReadback('runway 28, hold short runway 28, Diamond Star 2DS', st);
  assert.ok(!noRoute.passed && noRoute.missing.some((m) => m.id === 'route'));
  const noHold = gradeReadback('runway 28, taxi to C5 via C, Diamond Star 2DS', st);
  assert.ok(!noHold.passed && noHold.missing.some((m) => m.id === 'hold_short'));
});

test('KAPA RWY 35R still issues and grades a real route', async () => {
  const ad = await kapaAirportData();
  const c = buildContext({ settings, weather: { metar: { wdir: 350, wspd: 10, altim: 30.0 }, station: { runways: [{ id: '17L/35R' }] } }, scenario: 'ground_taxi', airportData: ad });
  assert.equal(c.runway, '35R');
  const [st] = scenarioScript(c);
  assert.match(st.reply.text, /runway 35R, taxi via A8, A, A18, hold short of runway 35R\.$/);
  assert.ok(gradeReadback('runway 35R taxi via A8 A A18 hold short 35R 2DS', st).passed);
});

test('cold cache / no map data at a real field: no guessed "via A"', () => {
  const c = buildContext({ settings, weather: wx28, scenario: 'ground_taxi', airportData: null });
  assert.ok(c.taxiUnavailable);
  assert.ok(!/taxi via/.test(scenarioScript(c)[0].reply.text));
  // generic practice with no home airport keeps the labelled SIM route
  const g = buildContext({ settings: { tailNumber: 'N1PL' }, scenario: 'ground_taxi' });
  assert.deepEqual(g.taxiRoute, ['A']); assert.ok(g.simulated.includes('taxi'));
});

test('challenge of a clearance is not graded as a missed readback; a botched readback still fails', () => {
  const holland = 'this is incorrect for centennial, you arent able to taxi to runway 28 via a8';
  assert.ok(isChallenge(holland));
  for (const t of ['Unable, that route does not reach runway 28, 2DS', 'verify taxi route, Diamond Star 2DS', "That's wrong, C is a taxilane", 'say again the route']) assert.ok(isChallenge(t), t);
  for (const t of ['runway 28 via A8 C 2DS', 'runway 35R taxi via A8 A A18 hold short 35R 2DS']) assert.ok(!isChallenge(t), t);

  // Reproduce the production session with the OLD bad route injected, to prove scoring alone is fixed.
  const bad = { taxi: { 28: { route: ['A8', 'C', 'C5'], exit: 'C3', exitSide: 'right' } } };
  const s = createSession(buildContext({ settings: { ...settings, homeAirport: 'KTST' }, weather: wx28, scenario: 'ground_taxi', airportData: bad }));
  respond(s, 'Centennial ground, Diamond 272DS requesting northeast departure, midfield run up complete, with charlie');
  assert.equal(s.phase, 'readback');
  const r = respond(s, holland);
  assert.equal(r.grade.kind, 'challenge');
  assert.equal(r.grade.score, null); assert.deepEqual(r.grade.missing, []); assert.equal(r.grade.ideal, null);
  assert.match(r.grade.verdict, /not scored as a readback/);
  assert.match(r.tower.text, /roger, hold position/);
  assert.ok(!/read back hold short/.test(r.tower.text));
  assert.equal(s.phase, 'readback'); assert.ok(!s.done);
  assert.equal(s.grades.filter((g) => g.kind === 'readback').length, 0);
  assert.equal(sessionScore(s), s.grades[0].score); // only the initial call counts

  // A genuine botched readback (no challenge words) still fails and is restated
  const s2 = createSession(buildContext({ settings, weather: wx28, scenario: 'ground_taxi', airportData: bad }));
  respond(s2, 'Centennial ground, Diamond Star 272DS at the ramp with charlie, ready to taxi');
  const r2 = respond(s2, 'runway 28 via A8, 2DS');
  assert.equal(r2.grade.kind, 'readback'); assert.ok(!r2.grade.passed);
  assert.ok(r2.grade.missing.some((m) => m.id === 'hold_short'));
  assert.match(r2.tower.text, /read back hold short of runway 28/);
});
