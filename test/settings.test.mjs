import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  validateHttpsUrl, sanitizeSettings, readSettings, writeSettings, settingsFor, bookingAction,
  SCHEDULING_PROVIDERS, DEFAULT_SETTINGS, DEMO_SETTINGS,
} from '../pilotlog-cli/src/lib/cockpit/settings.mjs';
import { renderSettingsPage } from '../pilotlog-cli/src/lib/cockpit/settingsPage.mjs';
import { stationFromAirport, evaluateVfrGoNoGo } from '../pilotlog-cli/src/lib/weather/kapa.mjs';
import { getStationWeather, normalizeIcao } from '../pilotlog-cli/src/lib/weather/fetch.mjs';
import { todaysCall } from '../pilotlog-cli/src/lib/replay/todaysCall.mjs';
import { stationLabels } from '../pilotlog-cli/src/cockpitView.mjs';
import { clockScript, renderNav } from '../pilotlog-cli/src/lib/cockpit/chrome.mjs';
import { DEFAULT_RATES } from '../pilotlog-cli/src/lib/checkride/costs.mjs';
import { computeCheckride } from '../pilotlog-cli/src/lib/checkride/index.mjs';
import { demoData } from '../pilotlog-cli/src/lib/checkride/insights.mjs';
const d0 = demoData(new Date('2026-10-14'));
const CR = computeCheckride(d0.entries, d0.store, { asOf: '2026-10-14' });

const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'pl-settings-'));

test('validateHttpsUrl: https only, rejects javascript:/http:/credentials/garbage', () => {
  assert.equal(validateHttpsUrl(' https://app.flightschedulepro.com/x '), 'https://app.flightschedulepro.com/x');
  for (const bad of ['http://flightcircle.com', 'javascript:alert(1)', 'data:text/html,hi', 'ftp://a.b', 'not a url', '', 'https://localhost/', 'https://u:p@evil.com/']) {
    assert.throws(() => validateHttpsUrl(bad), /booking URL/, bad);
  }
});

test('sanitizeSettings: provider list, none clears URL, other keeps label, ICAO + limits validated', () => {
  assert.deepEqual(SCHEDULING_PROVIDERS.map((p) => p.label), ['None', 'FlightCircle', 'Flight Schedule Pro', 'Schedule Master', 'myFBO', 'Other']);
  const none = sanitizeSettings({ scheduling: { provider: 'none', url: 'https://x.com' } });
  assert.deepEqual(none.scheduling, { provider: 'none', url: '', label: '' });
  const other = sanitizeSettings({ scheduling: { provider: 'other', url: 'https://club.example.org/book', label: 'Club' } });
  assert.equal(other.scheduling.label, 'Club');
  const fc = sanitizeSettings({ scheduling: { provider: 'flightcircle', url: 'https://www.flightcircle.com/', label: 'ignored' } });
  assert.equal(fc.scheduling.label, '');
  assert.throws(() => sanitizeSettings({ scheduling: { provider: 'myfbo', url: 'http://x.myfbo.com' } }), /https/);
  assert.throws(() => sanitizeSettings({ scheduling: { provider: 'acme', url: 'https://a.com' } }), /provider/);
  assert.equal(sanitizeSettings({ homeAirport: 'kpao' }).homeAirport, 'KPAO');
  assert.throws(() => sanitizeSettings({ homeAirport: 'K-1' }), /airport/);
  assert.throws(() => sanitizeSettings({ timeZone: 'Mars/Olympus' }), /time zone/);
  assert.throws(() => sanitizeSettings({ limits: { minVisibilitySm: 1 } }), /visibility/);
  assert.equal(sanitizeSettings({ limits: { maxCrosswindKt: 8 } }).limits.maxCrosswindKt, 8);
});

test('defaults are generic (no KAPA, no instructor, no Denver) and demo uses sample config', () => {
  assert.equal(DEFAULT_SETTINGS.homeAirport, '');
  assert.equal(DEFAULT_SETTINGS.instructorName, '');
  assert.equal(DEFAULT_SETTINGS.timeZone, '');
  assert.equal(DEFAULT_SETTINGS.scheduling.provider, 'none');
  assert.equal(DEFAULT_RATES.aircraftLabel, '');
  const demo = settingsFor({ demo: true });
  assert.equal(demo.sample, true);
  assert.equal(demo.scheduling.provider, DEMO_SETTINGS.scheduling.provider);
  assert.doesNotMatch(JSON.stringify(demo), /Giselle/);
});

test('read/write settings.json round-trip; hand-edited bad URL is dropped on read', () => {
  const dir = tmp();
  assert.equal(readSettings(dir).scheduling.provider, 'none');
  writeSettings(dir, { scheduling: { provider: 'schedulemaster', url: 'https://www.schedulemaster.com/club' }, homeAirport: 'KBJC' });
  writeSettings(dir, { instructorName: 'Sam' });
  const s = readSettings(dir);
  assert.equal(s.scheduling.provider, 'schedulemaster');
  assert.equal(s.homeAirport, 'KBJC');
  assert.equal(s.instructorName, 'Sam');
  fs.writeFileSync(path.join(dir, 'settings.json'), JSON.stringify({ scheduling: { provider: 'other', url: 'javascript:alert(1)' } }));
  assert.equal(readSettings(dir).scheduling.provider, 'none');
  assert.throws(() => writeSettings(dir, { scheduling: { provider: 'other', url: 'http://x.com' } }));
});

test('bookingAction: provider-labelled link, setup fallback when none/invalid', () => {
  assert.deepEqual(bookingAction({ scheduling: { provider: 'none' } }), { kind: 'setup', label: 'Set up scheduling', href: '/cockpit/settings#scheduling' });
  const fsp = bookingAction({ scheduling: { provider: 'flightschedulepro', url: 'https://app.flightschedulepro.com/a' } });
  assert.equal(fsp.kind, 'book');
  assert.equal(fsp.label, 'Book on Flight Schedule Pro');
  assert.equal(bookingAction({ scheduling: { provider: 'other', url: 'https://club.org/', label: 'Club Portal' } }).label, 'Book on Club Portal');
  assert.equal(bookingAction({ scheduling: { provider: 'myfbo', url: 'javascript:x' } }).kind, 'setup');
  assert.equal(bookingAction(null).kind, 'setup');
});

test('renderSettingsPage: all sections, provider options, demo is read-only', () => {
  const html = renderSettingsPage(esc, { settings: settingsFor({}), rates: { aircraftRate: 180, instructorRate: 65 } });
  for (const id of ['scheduling', 'airport', 'training', 'limits']) assert.match(html, new RegExp(`id="${id}"`));
  for (const p of ['FlightCircle', 'Flight Schedule Pro', 'Schedule Master', 'myFBO', 'Other']) assert.match(html, new RegExp(p));
  assert.match(html, /\/api\/cockpit\/settings/);
  assert.doesNotMatch(html, /Giselle|KAPA|Centennial/);
  const demo = renderSettingsPage(esc, { demo: true, settings: settingsFor({ demo: true }), rates: {} });
  assert.match(demo, /SAMPLE configuration/);
  assert.match(demo, /disabled/);
});

test('stationFromAirport maps aviationweather runways; crosswind uses that airport', () => {
  const st = stationFromAirport({ icaoId: 'KPAO', name: 'PALO ALTO ', lat: 37.46, lon: -122.11, elev: 2, runways: [{ id: '13/31', alignment: 130 }, { id: 'H1', alignment: null }] });
  assert.equal(st.icao, 'KPAO');
  assert.equal(st.elevFt, 7);
  assert.deepEqual(st.runways, [{ id: '13/31', headings: [130, 310] }]);
  const go = evaluateVfrGoNoGo({ visib: '10+', clouds: [], wdir: 130, wspd: 10 }, { runways: st.runways });
  assert.equal(go.crosswind.runway, '13');
  assert.equal(go.crosswind.kt, 0);
});

test('getStationWeather without a home airport asks for setup (no network)', async () => {
  const wx = await getStationWeather({ icao: '' });
  assert.equal(wx.needsSetup, true);
  assert.equal(wx.goNoGo.decision, 'UNKNOWN');
  assert.match(wx.goNoGo.reasons[0], /home airport/);
  assert.equal(normalizeIcao('kapa'), 'KAPA');
  assert.equal(normalizeIcao('bad!'), '');
});

test('todaysCall: uses engine crosswind runway, personal limits incl. max wind, no hard-coded 17L', async () => {
  const wx = { goNoGo: { decision: 'GO', reasons: [], crosswind: { kt: 7, runway: '31' } }, metar: { wdir: 270, wspd: 14, visib: 10 } };
  const c = todaysCall(wx, CR, { maxCrosswindKt: 12, maxWindKt: 25 });
  assert.equal(c.decision, 'GO');
  assert.match(c.suggested, /crosswind landings on 31/);
  assert.equal(c.flightCircleUrl, undefined);
  const windy = todaysCall({ ...wx, metar: { ...wx.metar, wspd: 30 } }, CR, { maxWindKt: 20 });
  assert.equal(windy.decision, 'CAUTION');
  assert.match(windy.reasons.join(' '), /Wind 30 kt above your 20 kt limit/);
  const noRwy = todaysCall({ goNoGo: { decision: 'GO', crosswind: { kt: 6, runway: null } }, metar: { wdir: 90, wspd: 8 } }, CR);
  assert.doesNotMatch(noRwy.suggested, /17L/);
  const unset = todaysCall(await getStationWeather({ icao: '' }), CR);
  assert.equal(unset.decision, 'UNKNOWN');
  assert.match(unset.suggested, /home airport/);
});

test('stationLabels + clock: no Denver/KAPA defaults', () => {
  assert.equal(stationLabels(null).icao, 'HOME');
  const l = stationLabels({ icao: 'KPAO', name: 'PALO ALTO', elevFt: 7, runways: [{ id: '13/31' }], lat: 37.46, lon: -122.11 });
  assert.match(l.sub, /RWY 13\/31/);
  assert.equal(l.origin.lat, 37.46);
  assert.doesNotMatch(clockScript(), /America\/Denver| MT'/);
  assert.match(renderNav(esc, { timeZone: 'America/New_York' }), /data-tz="America\/New_York"/);
});
