import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildTaxiRoute, runwayEnd, cleanRef, parseFrequencies, parseDatis, getRadioAirportData } from '../pilotlog-cli/src/lib/airport/airportData.mjs';
import { buildContext, scenarioScript, gradeReadback, gradeCall, pickTraffic, rng, canonicalize, heardTaxiway } from '../public/js/atc-engine.js';

// Synthetic airport: N-S runway 18/36 at lon 0; parallel taxiway A at lon 0.002; connectors A1 (south), A2 (mid), A3 (north);
// apron east of A at mid-field joined by an unnamed lead-in.
const g = (lat, lon) => ({ lat, lon });
const OSM = { elements: [
  { type: 'way', id: 1, tags: { aeroway: 'runway', ref: '18/36' }, nodes: [10, 11, 12], geometry: [g(0.01, 0), g(0, 0), g(-0.01, 0)] },
  { type: 'way', id: 2, tags: { aeroway: 'taxiway', ref: 'A' }, nodes: [20, 21, 22], geometry: [g(0.01, 0.002), g(0, 0.002), g(-0.01, 0.002)] },
  { type: 'way', id: 3, tags: { aeroway: 'taxiway', ref: 'A3' }, nodes: [10, 20], geometry: [g(0.01, 0), g(0.01, 0.002)] },
  { type: 'way', id: 4, tags: { aeroway: 'taxiway', ref: 'A2' }, nodes: [11, 21], geometry: [g(0, 0), g(0, 0.002)] },
  { type: 'way', id: 5, tags: { aeroway: 'taxiway', ref: 'A1' }, nodes: [12, 22], geometry: [g(-0.01, 0), g(-0.01, 0.002)] },
  { type: 'way', id: 6, tags: { aeroway: 'taxiway' }, nodes: [21, 30], geometry: [g(0, 0.002), g(0, 0.004)] },
  { type: 'way', id: 7, tags: { aeroway: 'apron', name: 'GA Ramp' }, nodes: [], geometry: [g(0.001, 0.004), g(-0.001, 0.004), g(-0.001, 0.006), g(0.001, 0.006)] },
] };

test('cleanRef keeps real designators only', () => {
  assert.equal(cleanRef('A 3'), 'A3'); assert.equal(cleanRef('twy b'), 'B'); assert.equal(cleanRef('Taxilane to hangars'), null);
});
test('runwayEnd: takeoff on 18 starts at the north end', () => {
  assert.equal(runwayEnd(OSM, '18').start.lat, 0.01); assert.equal(runwayEnd(OSM, '36').start.lat, -0.01);
});
test('taxi route from ramp to departure end uses real taxiway names', () => {
  const r18 = buildTaxiRoute(OSM, '18');
  assert.deepEqual(r18.route, ['A', 'A3']);
  assert.equal(r18.exit, 'A2'); // ~55% down an 18 roll
  const r36 = buildTaxiRoute(OSM, '36');
  assert.deepEqual(r36.route, ['A', 'A1']);
  assert.equal(buildTaxiRoute({ elements: [] }, '18'), null);
});
test('getRadioAirportData with mocked fetches (no network)', async () => {
  const fetchImpl = async (url) => ({ ok: true, json: async () => (String(url).includes('datis') ? [{ type: 'combined', code: 'K' }] : OSM), text: async () => '1,2,"KTST","TWR","TWR",118.9\n1,2,"KTST","GND","GND",121.8\n' });
  const d = await getRadioAirportData({ icao: 'KTST', lat: 0, lon: 0 }, null, { fetchImpl });
  assert.deepEqual(d.taxi['18'].route, ['A', 'A3']);
  assert.equal(d.freqs.tower, '118.90'); assert.equal(d.freqs.ground, '121.80'); assert.equal(d.atis.letter, 'K');
});
test('frequency CSV + D-ATIS parsing', () => {
  const f = parseFrequencies('id,ref,"ident"\n62145,19291,"KAPA","TWR","TWR",118.9\n62143,19291,"KAPA","GND","GND",121.8\n62141,19291,"KAPA","ATIS","ATIS",120.3\n9,9,"KAPAX","TWR","TWR",1', 'KAPA');
  assert.equal(f.tower, '118.90'); assert.equal(f.atis, '120.30'); assert.equal(f.all.length, 3);
  assert.equal(parseFrequencies('', 'KAPA'), null);
  assert.equal(parseDatis([{ type: 'arr', code: 'L' }, { type: 'dep', code: 'M' }]).letter, 'M');
  assert.equal(parseDatis({ error: 'No results found' }), null);
});
test('context uses OSM route, real ATIS, freqs; SIM labels when missing', () => {
  const settings = { homeAirport: 'KTST', runways: '18/36', tailNumber: 'N123PL', aircraftType: 'da40' };
  const ad = { taxi: { 18: buildTaxiRoute(OSM, '18') }, atis: { letter: 'K' }, freqs: { tower: '118.90', ground: '121.80', source: 'OurAirports' } };
  const c = buildContext({ settings, airportData: ad, scenario: 'ground_taxi', weather: { metar: { wdir: 180, wspd: 10, altim: 30.01 } } });
  assert.equal(c.runway, '18'); assert.deepEqual(c.taxiRoute, ['A', 'A3']); assert.equal(c.atis, 'K');
  assert.ok(!c.simulated.includes('taxi') && !c.simulated.includes('atis') && !c.simulated.includes('freq'));
  const st = scenarioScript(c)[0];
  assert.match(st.reply.text, /taxi via A, A3, hold short of runway 18/);
  assert.match(st.reply.speak, /Alpha, Alpha three/);
  assert.ok(gradeReadback('runway one eight taxi via alpha alpha three hold short one eight three papa lima', st).passed);
  const bare = buildContext({ settings, scenario: 'ground_taxi' });
  for (const k of ['taxi', 'atis', 'freq']) assert.ok(bare.simulated.includes(k), k);
});
test('traffic is randomised but seedable', () => {
  const a = pickTraffic(rng(1)), b = pickTraffic(rng(1));
  assert.deepEqual(a, b);
  const seen = new Set(Array.from({ length: 40 }, (_, i) => pickTraffic(rng(i + 1)).type));
  assert.ok(seen.size >= 5);
  const c = buildContext({ settings: { runways: '18', tailNumber: 'N1PL' }, scenario: 'touch_and_go', seed: 7 });
  const st = scenarioScript(c)[0];
  assert.ok(st.reply.text.includes(`follow the ${c.traffic.type}`));
});
test('grader accepts common wording variants', () => {
  assert.equal(canonicalize('Clear for take-off'), 'cleared for takeoff');
  assert.equal(canonicalize('runway seventeen left'), 'runway 17 left');
  assert.equal(canonicalize('thirty-five right'), '35 right');
  const settings = { runways: '17L/35R', tailNumber: 'N123PL', aircraftType: 'da40' };
  const w = { metar: { wdir: 170, wspd: 10, altim: 30.12 } };
  const tk = scenarioScript(buildContext({ settings, weather: w, scenario: 'takeoff' }))[0];
  assert.ok(gradeReadback('clear for take off runway seventeen left, left closed, three papa lima', tk).passed);
  assert.ok(gradeReadback('Seventeen left, cleared for takeoff, closed traffic, Diamond Star 3PL', tk).passed);
  const tg = scenarioScript(buildContext({ settings, weather: w, scenario: 'touch_and_go', seed: 3 }))[0];
  assert.ok(gradeReadback('traffic in sight, cleared touch n go one seven left, 3PL', tg).passed);
  const fs = scenarioScript(buildContext({ settings, weather: w, scenario: 'full_stop' }))[0];
  assert.ok(gradeReadback('cleared to land 17 left 3PL', fs).passed);
  assert.ok(gradeReadback('clear to land runway one seven left november one two three papa lima', fs).passed);
  const gt = scenarioScript(buildContext({ settings, weather: w, scenario: 'ground_taxi' }))[0];
  assert.ok(gradeReadback('holding short runway 17L, taxi via alpha, 3PL', gt).passed);
  assert.ok(!gradeReadback('runway 17L via alpha 3PL', gt).passed); // hold short still required
  const pe = scenarioScript(buildContext({ settings, weather: w, scenario: 'pattern_entry' }))[0];
  assert.ok(gradeCall('Centennial tower, Diamond Star one two three papa lima, ten miles south, 7500, we have information ' + 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'[0], pe).results.find((r) => r.id === 'position').ok);
  assert.ok(gradeReadback('runway 17L taxi via a, hold short 17L, three papa lima', gt).passed);
  assert.ok(heardTaxiway(['A3PL'], 'A3') && !heardTaxiway(['A31'], 'A3'));
});
