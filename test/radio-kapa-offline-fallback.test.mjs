// Radio Practice offline map fallback (Nov 10 2026). Production has no volume, so the 30-day OSM disk cache
// dies on every redeploy; with Overpass failing (406 / timeout) and the 6 h backoff, the custom domain booted
// atcBoot with airportData.taxi = null and KAPA Ground · Taxi fell back to NO ROUTE after PR #26.
// The app now ships a KAPA OSM snapshot (© OpenStreetMap contributors, ODbL) and uses it when live data is
// missing, so RWY 28 from the midfield run-up is still "taxi to C5 via C" — never A8, never NO ROUTE.
// Airports without a bundled snapshot still get no map data and no invented via-route.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { getRadioAirportData, getAirportOsm, bundledOsm, BUNDLED_OSM, _resetAirportCache } from '../pilotlog-cli/src/lib/airport/airportData.mjs';
import { renderRadioPage } from '../pilotlog-cli/src/lib/cockpit/radioPage.mjs';
import { buildContext, scenarioScript } from '../public/js/atc-engine.js';

const FIXTURE = JSON.parse(fs.readFileSync(new URL('./fixtures/osm-kapa-2026-10-15.json', import.meta.url), 'utf8'));
const KAPA_STATION = { icao: 'KAPA', lat: 39.5701, lon: -104.8493 };
const settings = { homeAirport: 'KAPA', towerName: 'Centennial', tailNumber: 'N272DS', aircraftType: 'da40' };
const wx28 = { metar: { wdir: 250, wspd: 4, altim: 30.22 }, station: { runways: [{ id: '10/28' }] } };
const EXPECTED_28 = 'Diamond Star N272DS, Centennial Ground, runway 28, taxi to C5 via C, hold short of runway 28.';
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

let calls;
const overpassDown = (mode) => async (url) => {
  calls.push(String(url));
  if (/overpass/.test(url)) {
    if (mode === 'hang') return new Promise(() => {}); // never answers (timeout case)
    if (mode === 'throw') throw new Error('network down');
    return { ok: false, status: 406, json: async () => ({}), text: async () => '' };
  }
  if (/datis/.test(url)) return { ok: true, json: async () => [{ type: 'combined', code: 'C' }] };
  return { ok: true, text: async () => '1,2,"KAPA","TWR","TWR",118.9\n1,2,"KAPA","GND","GND",121.8\n' };
};
beforeEach(() => { _resetAirportCache(); calls = []; });

function clearanceFor(ad) {
  const c = buildContext({ settings, weather: wx28, scenario: 'ground_taxi', airportData: { ...ad, atis: { letter: 'C' } } });
  return { c, st: scenarioScript(c)[0] };
}
function assertKapa28(taxi28) {
  assert.deepEqual(taxi28.route, ['C', 'C5']);
  assert.equal(taxi28.from, 'midfield run-up'); assert.equal(taxi28.phrase, 'to'); assert.equal(taxi28.runway, '28');
  assert.ok(!taxi28.route.includes('A8'));
  assert.match(taxi28.source, /offline snapshot 2026-10-15/);
}

test('bundled KAPA snapshot ships as a runtime file with ODbL credit, same data as the PR #25/#26 fixture; KAPA only', () => {
  assert.deepEqual(Object.keys(BUNDLED_OSM), ['KAPA']);
  const s = bundledOsm('KAPA');
  assert.ok(s.snapshot); assert.match(s.attribution, /OpenStreetMap contributors, ODbL/);
  assert.deepEqual(s.elements, FIXTURE.elements);
  assert.equal(bundledOsm('kapa'), s); // case-insensitive, read once
  for (const icao of ['KBJC', 'KDEN', 'KTST', '', null]) assert.equal(bundledOsm(icao), null, String(icao));
  // shipped in the Docker image: Dockerfile copies the repo; .dockerignore must not drop the snapshot
  const ignore = fs.readFileSync(new URL('../.dockerignore', import.meta.url), 'utf8').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  assert.ok(!ignore.some((l) => /snapshots|airport|\.json$|pilotlog-cli/.test(l)), ignore.join(','));
  assert.match(fs.readFileSync(new URL('../Dockerfile', import.meta.url), 'utf8'), /^COPY \. \.$/m);
});

for (const mode of ['406', 'throw', 'hang']) {
  test(`cold start, empty cache, Overpass ${mode}: KAPA RWY 28 from the midfield run-up is still "taxi to C5 via C" (no NO ROUTE, never A8)`, async () => {
    const t0 = Date.now();
    const ad = await getRadioAirportData(KAPA_STATION, null, { dataDir: null, fetchImpl: overpassDown(mode) });
    const ms = Date.now() - t0;
    assert.ok(ms < 2500, `fallback took ${ms} ms — must beat the radio page's 4 s race`);
    assert.ok(calls.some((u) => /overpass/.test(u)), 'live Overpass is still tried first');
    assertKapa28(ad.taxi['28']);
    assert.equal(ad.freqs.ground, '121.80'); // frequencies unaffected
    const { c, st } = clearanceFor(ad);
    assert.ok(!c.taxiUnavailable); assert.deepEqual(c.taxiRoute, ['C', 'C5']); assert.equal(c.taxiClear, 'to C5 via C');
    assert.equal(st.reply.text, EXPECTED_28);
    for (const s of [st.reply.text, st.reply.speak, st.ideal, c.taxiRoute.join('→')]) {
      assert.ok(!/\bA8\b|alpha eight/i.test(s), s); assert.ok(!/no route/i.test(s), s);
    }
    // other KAPA ends behave exactly as with live data (#26 rules unchanged): 10 fails closed, 35R on parallel A
    assert.deepEqual(ad.taxi['10']?.route || [], []);
    assert.deepEqual(ad.taxi['35R'].route, ['A8', 'A', 'A18']);
  });
}

test('6 h Overpass backoff: second load does not refetch and still gets the snapshot route', async () => {
  const fetchImpl = overpassDown('406');
  await getRadioAirportData(KAPA_STATION, null, { dataDir: null, fetchImpl });
  calls = [];
  const ad = await getRadioAirportData(KAPA_STATION, null, { dataDir: null, fetchImpl });
  assert.ok(!calls.some((u) => /overpass/.test(u)), 'backoff respected');
  assertKapa28(ad.taxi['28']);
  // getAirportOsm itself falls back too (backoff) unless bundled is disabled
  assert.ok((await getAirportOsm(KAPA_STATION, { fetchImpl })).snapshot);
  assert.equal(await getAirportOsm(KAPA_STATION, { fetchImpl, bundled: false }), null);
});

test('radio page atcBoot embeds the fallback route (what /cockpit/radio?demo=1 serves on a cold start)', async () => {
  const ad = await getRadioAirportData(KAPA_STATION, null, { dataDir: null, fetchImpl: overpassDown('406') });
  const html = renderRadioPage(esc, { demo: true, settings, weather: wx28, airportData: ad });
  const boot = JSON.parse(html.match(/<script type="application\/json" id="atcBoot">([\s\S]*?)<\/script>/)[1]);
  assert.notEqual(boot.airportData.taxi, null);
  assertKapa28(boot.airportData.taxi['28']);
});

test('live Overpass stays preferred when it answers, and is cached to disk for later loads', async () => {
  const dir = fs.mkdtempSync('/tmp/pl-osm-');
  const live = { elements: FIXTURE.elements };
  const fetchImpl = async (url) => (/overpass/.test(url) ? { ok: true, json: async () => live } : { ok: false });
  const ad = await getRadioAirportData(KAPA_STATION, null, { dataDir: dir, fetchImpl });
  assert.deepEqual(ad.taxi['28'].route, ['C', 'C5']);
  assert.doesNotMatch(ad.taxi['28'].source, /snapshot/); // live data used, not the snapshot
  assert.ok(fs.existsSync(`${dir}/airport-cache/osm-KAPA.json`));
  fs.rmSync(dir, { recursive: true, force: true });
});

test('live OSM edit that breaks the FAA-verified RWY 28 path: that end is filled from the snapshot, other ends stay live', async () => {
  // drop taxilane C from the live data: the verified path can no longer be reproduced live
  const live = { elements: FIXTURE.elements.filter((e) => !(e.tags?.aeroway === 'taxiway' && String(e.tags.ref || '').toUpperCase() === 'C')) };
  const fetchImpl = async (url) => (/overpass/.test(url) ? { ok: true, json: async () => live } : { ok: false });
  const ad = await getRadioAirportData(KAPA_STATION, null, { dataDir: null, fetchImpl });
  assertKapa28(ad.taxi['28']);
  assert.doesNotMatch(ad.taxi['35R'].source, /snapshot/);
});

test('unsourced / other airport with no map data: no snapshot, taxi null, no invented via-route', async () => {
  for (const station of [{ icao: 'KBJC', lat: 39.9088, lon: -105.1172 }, { icao: 'KTST', lat: 0, lon: 0 }]) {
    _resetAirportCache(); calls = [];
    const ad = await getRadioAirportData(station, null, { dataDir: null, fetchImpl: overpassDown('406') });
    assert.equal(ad.taxi, null, station.icao);
    const c = buildContext({ settings: { ...settings, homeAirport: station.icao }, weather: wx28, scenario: 'ground_taxi', airportData: ad });
    assert.ok(c.taxiUnavailable, station.icao);
    const text = scenarioScript(c)[0].reply.text;
    assert.ok(!/taxi via|taxi to/.test(text), text);
  }
  // no station at all (signed-out boot with no home airport) stays null too
  _resetAirportCache();
  assert.equal((await getRadioAirportData(null, null, { dataDir: null, fetchImpl: overpassDown('406') })).taxi, null);
});
