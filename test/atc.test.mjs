import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  sayRunway, sayCallsign, sayDigits, abbreviatedCallsign, activeRunway, buildContext, normalizeUtterance,
  scenarioScript, gradeReadback, gradeCall, createSession, respond, towerOpening, sessionScore, SCENARIOS, DISCLAIMER, heardCallsign,
} from '../public/js/atc-engine.js';

const settings = { homeAirport: 'KXYZ', towerName: 'Springfield', tailNumber: 'N738SP', aircraftType: 'c172' };
const weather = { metar: { wdir: 200, wspd: 9, altim: 1013.2 }, station: { runways: [{ id: '2/20' }, { id: '13/31' }] } };
const ctx = (scenario) => buildContext({ settings, weather, scenario });

test('number pronunciation follows 7110.65 2-4 (digits, niner, left/right)', () => {
  assert.equal(sayRunway('17L'), 'one seven left');
  assert.equal(sayRunway('9'), 'zero niner');
  assert.equal(sayRunway('31'), 'three one');
  assert.equal(sayCallsign('N738SP'), 'November seven three eight Sierra Papa');
  assert.equal(sayDigits('29.92'), 'two niner point niner two');
  assert.equal(abbreviatedCallsign('N738SP', 'Skyhawk'), 'Skyhawk 8SP');
});

test('active runway is the end most into the wind; nothing hard-coded', () => {
  assert.equal(activeRunway(['17L/35R', '10/28'], { dir: 160, kt: 10 }), '17L');
  assert.equal(activeRunway(['17L/35R', '10/28'], { dir: 340, kt: 10 }), '35R');
  assert.equal(activeRunway(['10/28'], { dir: 270, kt: 12 }), '28');
  const c = ctx('takeoff');
  assert.equal(c.runway, '20');
  assert.equal(c.facilityName, 'Springfield');
  assert.equal(c.callsign, 'N738SP');
  assert.equal(c.altimeter, 29.92);
  assert.deepEqual(c.simulated, []);
});

test('missing settings fall back to clearly-flagged generic values (no personal defaults)', () => {
  const c = buildContext({ settings: {}, weather: null, scenario: 'takeoff' });
  assert.ok(c.needsSetup);
  assert.ok(c.simulated.includes('callsign') && c.simulated.includes('runway') && c.simulated.includes('altimeter'));
  assert.ok(!/KAPA|17L|N4521D/.test(JSON.stringify(c)));
});

test('normalizer turns spoken digits/phonetics into runway, callsign and altimeter tokens', () => {
  assert.deepEqual(normalizeUtterance('runway one seven left'), ['runway', '17L']);
  assert.ok(normalizeUtterance('November seven three eight Sierra Papa').includes('N738SP'));
  assert.ok(normalizeUtterance('altimeter two niner niner two').includes('2992'));
  assert.ok(normalizeUtterance('altimeter 29.92').includes('2992'));
  assert.ok(heardCallsign(normalizeUtterance('Skyhawk eight sierra papa'), 'N738SP'));
  assert.ok(!heardCallsign(normalizeUtterance('Skyhawk four five six'), 'N738SP'));
});

test('tower phraseology: takeoff clearance includes wind, runway, clearance, pattern', () => {
  const [st] = scenarioScript(ctx('takeoff'));
  assert.equal(st.reply.text, 'Skyhawk 8SP, wind 200 at 9, runway 20, cleared for takeoff, make left closed traffic.');
  assert.match(st.reply.speak, /wind two zero zero at niner, runway two zero, cleared for takeoff/);
});

test('ground taxi phraseology includes hold-short; grader requires it', () => {
  const [st] = scenarioScript(ctx('ground_taxi'));
  assert.match(st.reply.text, /taxi via Alpha, hold short of runway 20\.$/);
  const good = gradeReadback('Runway two zero, taxi via Alpha, hold short runway two zero, Skyhawk eight sierra papa', st);
  assert.ok(good.passed, JSON.stringify(good.missing));
  const bad = gradeReadback('taxi via alpha, eight sierra papa', st);
  assert.ok(!bad.passed);
  assert.deepEqual(bad.missing.map((m) => m.id).sort(), ['hold_short', 'runway']);
  assert.match(bad.verdict, /incomplete/);
});

test('pattern entry readback is graded for altimeter', () => {
  const [st] = scenarioScript(ctx('pattern_entry'));
  assert.match(st.reply.text, /enter left downwind runway 20, report midfield, altimeter 29\.92/);
  const g = gradeReadback('left downwind runway 20, report midfield, 8SP', st);
  assert.deepEqual(g.missing.map((m) => m.id), ['altimeter']);
  assert.ok(gradeReadback('left downwind two zero, report midfield, two niner niner two, Skyhawk 8SP', st).passed);
});

test('initial call grading: facility, callsign, position, ATIS, request', () => {
  const c = ctx('ground_taxi');
  const [st] = scenarioScript(c);
  const phon = { W: 'whiskey' }[c.atis] || c.atis;
  const g = gradeCall(`Springfield Ground, Skyhawk November seven three eight sierra papa, at the ramp with information ${phon}, ready to taxi`, st);
  assert.ok(g.passed, JSON.stringify(g.missing));
  assert.ok(!gradeCall('ready to taxi', st).passed);
});

test('session flow: missing callsign → say again; missing hold short → controller restates; full stop has 2 exchanges', () => {
  const s = createSession(ctx('ground_taxi'));
  let r = respond(s, 'Springfield Ground, ready to taxi');
  assert.match(r.tower.text, /say again your callsign/);
  assert.equal(s.phase, 'call');
  r = respond(s, 'Springfield Ground, Skyhawk 738SP at the ramp, ready to taxi');
  assert.equal(s.phase, 'readback');
  r = respond(s, 'runway 20 via alpha, 8SP');
  assert.match(r.tower.text, /read back hold short of runway 20/);
  r = respond(s, 'runway 20 via alpha, hold short runway 20, 8SP');
  assert.ok(s.done);
  assert.ok(sessionScore(s) > 0 && sessionScore(s) < 100);

  const f = createSession(ctx('full_stop'));
  respond(f, 'Springfield Tower, Skyhawk 8SP, left base runway 20, full stop');
  r = respond(f, 'runway two zero cleared to land eight sierra papa');
  assert.match(r.tower.text, /turn left at Charlie, contact Ground/);
  respond(f, 'left at charlie, over to ground, 8SP');
  assert.ok(f.done);
  assert.equal(towerOpening(createSession(ctx('takeoff'))), null);
});

test('every scenario has a script and the disclaimer is explicit', () => {
  assert.equal(SCENARIOS.length, 5);
  for (const sc of SCENARIOS) assert.ok(scenarioScript(ctx(sc.id)).length >= 1);
  assert.match(DISCLAIMER, /not real air traffic control/i);
});

test('voice transcripts without punctuation still grade correctly', () => {
  const [st] = scenarioScript(ctx('ground_taxi'));
  const g = gradeReadback('runway two zero taxi via alpha hold short runway two zero skyhawk eight sierra papa', st);
  assert.ok(g.passed, JSON.stringify(g.missing));
  const g2 = gradeReadback('runway two zero taxi via alpha eight sierra papa', st);
  assert.deepEqual(g2.missing.map((m) => m.id), ['hold_short']);
});

test('Radio Practice page: disclaimer, scenarios, user settings only, no personal hard-code', async () => {
  const { renderRadioPage } = await import('../pilotlog-cli/src/lib/cockpit/radioPage.mjs');
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const html = renderRadioPage(esc, { settings: { homeAirport: 'KXYZ', towerName: 'Springfield', tailNumber: 'N738SP' } });
  assert.match(html, /TRAINING ONLY/);
  assert.match(html, /not real air traffic control/);
  for (const s of SCENARIOS) assert.ok(html.includes(`data-id="${s.id}"`));
  assert.match(html, /N738SP/);
  assert.ok(!/Holland|Giselle|N4521D/.test(html));
  assert.ok(!/<\/script><script>alert/.test(renderRadioPage(esc, { settings: { towerName: '</script><script>alert(1)' } })));
});
