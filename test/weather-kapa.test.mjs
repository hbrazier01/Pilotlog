import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseVisibilitySm,
  ceilingFt,
  crosswindKt,
  bestCrosswind,
  evaluateVfrGoNoGo,
  normalizeMetar,
  demoWeather,
} from '../pilotlog-cli/src/lib/weather/kapa.mjs';

test('parseVisibilitySm handles numbers, plus, fractions', () => {
  assert.equal(parseVisibilitySm(10), 10);
  assert.equal(parseVisibilitySm('10+'), 10);
  assert.equal(parseVisibilitySm('6+'), 6);
  assert.equal(parseVisibilitySm('3'), 3);
  assert.equal(parseVisibilitySm('1/2'), 0.5);
  assert.equal(parseVisibilitySm('1 1/2'), 1.5);
  assert.equal(parseVisibilitySm(null), null);
});

test('ceilingFt uses lowest BKN/OVC; ignores FEW/SCT', () => {
  assert.equal(ceilingFt([{ cover: 'FEW', base: 600 }, { cover: 'SCT', base: 800 }]), null);
  assert.equal(ceilingFt([{ cover: 'SCT', base: 900 }, { cover: 'BKN', base: 1500 }, { cover: 'OVC', base: 700 }]), 700);
  assert.equal(ceilingFt([{ cover: 'BKN', base: 1200 }]), 1200);
  assert.equal(ceilingFt([]), null);
});

test('crosswindKt: runway-aligned wind is ~0; 90° is full speed', () => {
  assert.equal(crosswindKt(350, 20, 350), 0);
  assert.ok(Math.abs(crosswindKt(80, 20, 350) - 20) < 0.5);
  assert.equal(crosswindKt('VRB', 10, 170), null);
});

test('bestCrosswind picks the most favorable KAPA runway end', () => {
  // Wind from 350 — almost aligned with 35
  const a = bestCrosswind(350, 15);
  assert.ok(a.kt != null && a.kt < 3);
  assert.match(String(a.runway), /35/);
  // Wind from 080 — favor 10/28
  const b = bestCrosswind(80, 16);
  assert.ok(b.kt != null);
  assert.ok(b.kt < 8, `expected low xwind on 10/28, got ${b.kt} on ${b.runway}`);
});

test('evaluateVfrGoNoGo: GO when VFR mins met and calm wind', () => {
  const r = evaluateVfrGoNoGo({
    visib: '10+',
    clouds: [{ cover: 'FEW', base: 6000 }],
    wdir: 20,
    wspd: 8,
  });
  assert.equal(r.decision, 'GO');
  assert.equal(r.ceilingFt, null);
  assert.ok(r.visSm >= 10);
  assert.match(r.advisory, /Advisory only/);
});

test('evaluateVfrGoNoGo: NO-GO on low ceiling or low vis', () => {
  const lowCeil = evaluateVfrGoNoGo({
    visib: 10,
    clouds: [{ cover: 'OVC', base: 700 }],
    wdir: 350,
    wspd: 7,
  });
  assert.equal(lowCeil.decision, 'NO-GO');
  assert.ok(lowCeil.reasons.some(x => /Ceiling/.test(x)));

  const lowVis = evaluateVfrGoNoGo({
    visib: 2,
    clouds: [{ cover: 'SCT', base: 3000 }],
    wdir: 170,
    wspd: 5,
  });
  assert.equal(lowVis.decision, 'NO-GO');
  assert.ok(lowVis.reasons.some(x => /Visibility/.test(x)));
});

test('evaluateVfrGoNoGo: CAUTION on strong gusts with VFR mins met', () => {
  const r = evaluateVfrGoNoGo({
    visib: '10+',
    clouds: [{ cover: 'SCT', base: 2500 }, { cover: 'BKN', base: 4000 }],
    wdir: 360,
    wspd: 19,
    wgst: 28,
  });
  assert.equal(r.decision, 'CAUTION');
  assert.ok(r.ceilingFt >= 1000);
  assert.ok(r.reasons.some(x => /Gusts/.test(x)));
});

test('evaluateVfrGoNoGo: UNKNOWN with empty obs', () => {
  assert.equal(evaluateVfrGoNoGo({}).decision, 'UNKNOWN');
});

test('normalizeMetar + demoWeather produce GO sample', () => {
  const row = {
    icaoId: 'KAPA',
    rawOb: 'METAR KAPA …',
    temp: 18,
    dewp: 7,
    wdir: 20,
    wspd: 8,
    visib: '10+',
    clouds: [{ cover: 'FEW', base: 6000 }],
    fltCat: 'VFR',
  };
  const n = normalizeMetar(row);
  assert.equal(n.icao, 'KAPA');
  assert.equal(n.wspd, 8);
  const d = demoWeather();
  assert.equal(d.demo, true);
  assert.equal(d.goNoGo.decision, 'GO');
  assert.match(d.metar.raw, /DEMO SAMPLE/);
});
