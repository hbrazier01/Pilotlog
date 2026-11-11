// Radio Practice taxi-routing safety regression (Nov 10 2026 production report, KAPA Ground · Taxi, RWY 28).
// Ground issued "runway 28, taxi via A8, C, C5": A8 is at Hot Spot 2 on the west (RWY 10) end of 10/28,
// and taxilane C is not a taxiway and not ATC controlled (FAA From the Flight Deck APA, HS 3). On the FAA
// airport diagram AL-5715 (cycle 26134, https://aeronav.faa.gov/d-tpp/2611/05715AD.PDF) the RWY 28
// departure end is reached only from taxilane C via C5, so there is no movement-area route to issue.
// Fixture: OSM snapshot the app itself fetches for KAPA (© OpenStreetMap contributors, ODbL).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildTaxiRoute, buildExit, isNonMovement, TAXI_RULES, getRadioAirportData } from '../pilotlog-cli/src/lib/airport/airportData.mjs';
import { buildContext, scenarioScript, createSession, respond, sessionScore, gradeReadback, isChallenge } from '../public/js/atc-engine.js';

const OSM = JSON.parse(fs.readFileSync(new URL('./fixtures/osm-kapa-2026-10-15.json', import.meta.url), 'utf8'));
const KAPA = { icao: 'KAPA' };
const settings = { homeAirport: 'KAPA', towerName: 'Centennial', tailNumber: 'N272DS', aircraftType: 'da40' };
const wx28 = { metar: { wdir: 250, wspd: 4, altim: 30.22 }, station: { runways: [{ id: '10/28' }] } };
const usesTaxilaneOrA8 = (route) => (route || []).some((r) => r === 'C' || r === 'A8' || r === 'C5');

async function kapaAirportData() {
  const fetchImpl = async () => ({ ok: true, json: async () => OSM, text: async () => '' });
  return getRadioAirportData({ icao: 'KAPA', lat: 39.5701, lon: -104.8493 }, null, { fetchImpl, dataDir: null });
}

test('FAA-backed KAPA rule: taxilane C is non-movement; RWY 28 has no movement-area route', () => {
  assert.ok(isNonMovement({ aeroway: 'taxiway', ref: 'C' }, TAXI_RULES.KAPA));
  assert.ok(!isNonMovement({ aeroway: 'taxiway', ref: 'C1' }, TAXI_RULES.KAPA));
  assert.ok(!isNonMovement({ aeroway: 'taxiway', ref: 'A8' }, TAXI_RULES.KAPA));
  assert.ok(isNonMovement({ aeroway: 'taxiway', taxiway: 'taxilane', ref: 'T' }, null)); // generic OSM taxilane tag
  assert.ok(TAXI_RULES.KAPA.noRoute['28']);
});

test('the bug: raw OSM Dijkstra produced A8, C, C5 for RWY 28 (why the fix is needed)', () => {
  // without the KAPA rule the graph still yields the reported bad route — the OSM data alone cannot tell
  assert.deepEqual(buildTaxiRoute(OSM, '28').route, ['A8', 'C', 'C5']);
});

test('KAPA RWY 28: no route is built, and none uses A8 / taxilane C / C5', () => {
  assert.equal(buildTaxiRoute(OSM, '28', KAPA), null);
  // data-driven, not just the end rule: filtering taxilane C alone leaves no movement-area path to the 28 end
  assert.equal(buildTaxiRoute(OSM, '28', { rules: { nonMovement: ['C'] } }), null);
});

test('KAPA RWY 10 does not use taxilane C either (old route was A8, C, C1); fails closed when no movement-area path', () => {
  const r10 = buildTaxiRoute(OSM, '10', KAPA);
  assert.ok(r10 === null || !r10.route.includes('C'), JSON.stringify(r10));
  assert.equal(r10, null);
});

test('KAPA 17L / 35R still get real movement-area routes on parallel A (fix is not "fail everything")', () => {
  assert.deepEqual(buildTaxiRoute(OSM, '17L', KAPA).route, ['A8', 'A', 'A1']);
  assert.deepEqual(buildTaxiRoute(OSM, '35R', KAPA).route, ['A8', 'A', 'A18']);
  // 17R would need to cross RWY 17L on A8/B8: crossings need their own instruction, so no route
  assert.equal(buildTaxiRoute(OSM, '17R', KAPA), null);
  for (const rw of ['10', '28', '17L', '35R', '17R', '35L']) { const r = buildTaxiRoute(OSM, rw, KAPA); assert.ok(!r || !r.route.includes('C'), rw); }
});

test('KAPA landing exit never names taxilane C', () => {
  for (const rw of ['10', '28']) { const ex = buildExit(OSM, rw, KAPA); assert.ok(!ex || ex.exit !== 'C', rw); }
});

test('KAPA Ground · Taxi RWY 28 (ATIS Charlie, N272DS): clearance names no via-route; fails closed', async () => {
  const ad = await kapaAirportData();
  assert.deepEqual(ad.taxi['28'].route, []);
  ad.atis = { letter: 'C' };
  const c = buildContext({ settings, weather: wx28, scenario: 'ground_taxi', airportData: ad });
  assert.equal(c.runway, '28'); assert.equal(c.atis, 'C');
  assert.ok(c.taxiUnavailable); assert.deepEqual(c.taxiRoute, []); assert.match(c.taxiNote, /No verified taxi route to runway 28 at KAPA/);
  const [st] = scenarioScript(c);
  assert.equal(st.reply.text, 'Diamond Star N272DS, Centennial Ground, runway 28, hold short of runway 28.');
  for (const s of [st.reply.text, st.reply.speak, st.ideal]) {
    assert.ok(!/taxi via|\bA8\b|\bC5\b|Alpha eight|Charlie five|, C,/.test(s), s);
  }
  assert.deepEqual(st.readback.map((e) => e.id), ['runway', 'hold_short', 'callsign']);
  assert.ok(gradeReadback('runway 28, hold short runway 28, Diamond Star 2DS', st).passed);
  assert.ok(!usesTaxilaneOrA8(c.taxiRoute));
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
