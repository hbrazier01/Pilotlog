import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseGpx, parseKml, parseCsv, parseTrack } from '../pilotlog-cli/src/lib/replay/parse.mjs';
import { detectEvents, formatEventClock } from '../pilotlog-cli/src/lib/replay/events.mjs';
import { buildSampleKapaTrack } from '../pilotlog-cli/src/lib/replay/sampleTrack.mjs';
import { buildMissionMap } from '../pilotlog-cli/src/lib/replay/missionMap.mjs';
import { todaysCall, DEFAULT_LIMITS } from '../pilotlog-cli/src/lib/replay/todaysCall.mjs';
import { acsSkillStrip } from '../pilotlog-cli/src/lib/replay/acsStrip.mjs';
import { renderReplayPage } from '../pilotlog-cli/src/replayView.mjs';
import { computeCheckride } from '../pilotlog-cli/src/lib/checkride/index.mjs';
import { demoData } from '../pilotlog-cli/src/lib/checkride/insights.mjs';

const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const GPX = `<?xml version="1.0"?>
<gpx><trk><trkseg>
<trkpt lat="39.57" lon="-104.85"><ele>1800</ele><time>2024-05-18T14:15:00Z</time></trkpt>
<trkpt lat="39.565" lon="-104.849"><ele>1900</ele><time>2024-05-18T14:15:10Z</time></trkpt>
<trkpt lat="39.56" lon="-104.848"><ele>2000</ele><time>2024-05-18T14:15:20Z</time></trkpt>
</trkseg></trk></gpx>`;

const KML = `<?xml version="1.0"?><kml><Document>
<Placemark><LineString><coordinates>
-104.85,39.57,1800 -104.849,39.565,1900 -104.848,39.56,2000
</coordinates></LineString></Placemark></Document></kml>`;

const CSV = `Timestamp,Latitude,Longitude,Altitude,Groundspeed,Course
2024-05-18T14:15:00Z,39.57,-104.85,5900,80,170
2024-05-18T14:15:10Z,39.565,-104.849,6100,90,170
2024-05-18T14:15:20Z,39.56,-104.848,6300,95,175
`;

test('parseGpx extracts points with alt ft and time', () => {
  const t = parseGpx(GPX);
  assert.equal(t.format, 'gpx');
  assert.equal(t.points.length, 3);
  assert.ok(t.points[0].altFt > 5000);
  assert.ok(t.points[0].t < t.points[2].t);
  assert.ok(t.points[1].gsKt > 0);
});

test('parseKml and parseCsv and parseTrack dispatch', () => {
  assert.equal(parseKml(KML).points.length, 3);
  const c = parseCsv(CSV);
  assert.equal(c.points.length, 3);
  assert.equal(c.points[0].gsKt, 80);
  assert.equal(parseTrack(GPX, 'x.gpx').format, 'gpx');
  assert.equal(parseTrack(CSV, 'ff.csv').format, 'csv');
});

test('detectEvents finds steep turn, slow flight, bounce on SAMPLE track', () => {
  const sample = buildSampleKapaTrack();
  assert.ok(sample.sample);
  assert.match(sample.label, /SAMPLE/);
  const types = new Set(sample.events.map((e) => e.type));
  assert.ok(types.has('steep_turn'), types);
  assert.ok(types.has('slow_flight'), types);
  assert.ok(types.has('bounced_landing'), types);
  assert.ok(types.has('touch_and_go'), types);
  assert.ok(types.has('full_stop'), types);
  const order = sample.events.map((e) => e.type);
  assert.deepEqual(order, ['steep_turn', 'steep_turn', 'slow_flight', 'touch_and_go', 'bounced_landing', 'full_stop']);
  for (const e of sample.events.filter((x) => x.type === 'steep_turn')) assert.ok(e.meta.bankDeg >= 40 && e.meta.bankDeg <= 50, e.meta);
  assert.match(formatEventClock(sample.points[0].t, sample.events[0].t), /^\d{2}:\d{2}$/);
});

test('buildMissionMap statuses from logbook entries', () => {
  const d = demoData(new Date('2026-10-14'));
  const map = buildMissionMap(d.entries, {});
  assert.ok(map.items.length >= 8);
  const solo = map.items.find((i) => i.key === 'firstSolo');
  assert.equal(solo.status, 'complete');
  const check = map.items.find((i) => i.key === 'checkride');
  assert.equal(check.status, 'locked');
  assert.ok(map.readinessPct >= 0 && map.readinessPct <= 100);
  assert.ok(map.nextMilestone);
});

test("todaysCall GO/CAUTION/NO-GO with limits + crosswind focus", () => {
  const cr = computeCheckride(demoData().entries, demoData().store);
  const goWx = {
    goNoGo: { decision: 'GO', reasons: ['VFR ok'] },
    metar: { windDir: 70, windSpeed: 12, visibilitySm: 10, ceilingFt: 7500 },
    bestCrosswind: { runway: '17L', crosswindKt: 10 },
  };
  const call = todaysCall(goWx, cr, DEFAULT_LIMITS);
  assert.equal(call.decision, 'GO');
  assert.match(call.suggested, /crosswind landings on 17L/i);
  assert.ok(call.chips.wind.includes('12'));
  assert.match(call.advisory, /Advisory/);

  const nogo = todaysCall(
    {
      goNoGo: { decision: 'NO-GO', reasons: ['low vis'] },
      metar: { windDir: 170, windSpeed: 5, visibilitySm: 1, ceilingFt: 500 },
    },
    cr
  );
  assert.equal(nogo.decision, 'NO-GO');

  const caut = todaysCall(
    {
      goNoGo: { decision: 'GO', reasons: [] },
      metar: { windDir: 80, windSpeed: 18, windGust: 28, visibilitySm: 10, ceilingFt: 8000 },
      bestCrosswind: { runway: '17L', crosswindKt: 15 },
    },
    cr,
    { maxCrosswindKt: 12, maxGustKt: 22 }
  );
  assert.equal(caut.decision, 'CAUTION');
});

test('acsSkillStrip percentages and renderReplayPage SAMPLE', () => {
  const d = demoData(new Date('2026-10-14'));
  const cr = computeCheckride(d.entries, d.store, { asOf: '2026-10-14' });
  const strip = acsSkillStrip(cr.acs);
  assert.equal(strip.length, 6);
  assert.ok(strip.every((s) => s.pct >= 0 && s.pct <= 100));
  const track = buildSampleKapaTrack();
  const mission = buildMissionMap(d.entries, { cr });
  const call = todaysCall(
    { goNoGo: { decision: 'GO', reasons: [] }, metar: { windDir: 70, windSpeed: 12, visibilitySm: 10, ceilingFt: 7500 }, bestCrosswind: { runway: '17L', crosswindKt: 10 } },
    cr
  );
  const html = renderReplayPage(esc, {
    demo: true,
    user: { name: 'JORDAN P.', initials: 'JP', role: 'PRIVATE PILOT STUDENT', sample: true },
    track,
    mission,
    call,
    acsStrip: strip,
    cr,
  });
  assert.match(html, /Set up scheduling/);
  call.booking = { kind: 'book', label: 'Book on FlightCircle', href: 'https://www.flightcircle.com/', provider: 'flightcircle' };
  const html2 = renderReplayPage(esc, { demo: true, track, mission, call, acsStrip: strip, cr, station: { icao: 'KAPA' } });
  assert.match(html2, /Book on FlightCircle/);
  assert.match(html2, /Today's Call · KAPA/);
  assert.match(html, /Mission Map/);
  assert.match(html, /REPLAY MODE/);
  assert.match(html, /SAMPLE/);
  assert.match(html, /Today's Call/);
  assert.match(html, /Lesson Debrief/);
  assert.match(html, /shareBtn/);
  assert.match(html, /cockpit-replay3d\.js/);
  assert.match(html, /Steep turn|Slow flight|Bounced/i);
  // never-blank viewport: 2D track fallback is server-rendered under the 3D canvas,
  // and the 3D mount is raced against a timeout that surfaces an error message
  const i2d = html.indexOf('id="replay2d"');
  assert.ok(i2d > 0 && i2d < html.indexOf('id="replay3d"'));
  assert.match(html.slice(i2d, html.indexOf('id="replay3d"')), /<svg[\s\S]*<path d="M/);
  assert.match(html, /R3D_TIMEOUT_MS/);
  assert.match(html, /Promise\.race\(\[handle\.ready/);
  assert.match(html, /3D view unavailable/);
});

test('empty entries mission map locks first solo', () => {
  const map = buildMissionMap([], {});
  assert.equal(map.items.find((i) => i.key === 'firstSolo').status, 'locked');
});

test('SAMPLE track is smooth, 1 Hz, coherent and starts/ends at the field', () => {
  const t = buildSampleKapaTrack();
  const p = t.points;
  for (let i = 1; i < p.length; i++) {
    assert.equal(p[i].t - p[i - 1].t, 1000);
    let dh = Math.abs(p[i].hdgDeg - p[i - 1].hdgDeg); if (dh > 180) dh = 360 - dh;
    assert.ok(dh <= 13, `heading jump ${dh} at ${i}`);
    assert.ok(Math.abs(p[i].altFt - p[i - 1].altFt) <= 40, `alt jump at ${i}`);
  }
  assert.ok(Math.abs(p[0].altFt - t.fieldElevFt) < 5 && Math.abs(p.at(-1).altFt - t.fieldElevFt) < 5);
  assert.ok(p.at(-1).gsKt < 5);
  assert.equal(t.endIso, new Date(p.at(-1).t).toISOString());
  assert.match(t.dateLabel, /^May 18, 2024/);
  assert.ok(t.hours > 0.4 && t.hours < 1.0);
});

test('detectEvents: lone touchdown that decelerates is a full stop, not a bounce', () => {
  const pts = [];
  for (let i = 0; i < 40; i++) pts.push({ t: i * 1000, lat: 0, lon: 0, altFt: 5885 + Math.max(0, 200 - i * 10), gsKt: Math.max(0, 65 - Math.max(0, i - 20) * 3), hdgDeg: 170 });
  const ev = detectEvents(pts, { fieldElevFt: 5885 });
  assert.deepEqual(ev.map((e) => e.type), ['full_stop']);
});
