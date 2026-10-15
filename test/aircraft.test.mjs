import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { AIRCRAFT_TYPES, AIRCRAFT_TYPE_IDS, MODEL_FAMILIES, aircraftModelFor, normalizeAircraftType } from '../public/js/aircraft-types.js';
import { sanitizeSettings, writeSettings, readSettings, settingsFor, DEFAULT_SETTINGS } from '../pilotlog-cli/src/lib/cockpit/settings.mjs';
import { renderSettingsPage } from '../pilotlog-cli/src/lib/cockpit/settingsPage.mjs';

test('type → model family mapping', () => {
  const fam = (t) => aircraftModelFor(t).family;
  assert.equal(fam('c172'), 'cessna-high');
  assert.equal(fam('c152'), 'cessna-high');
  assert.equal(fam('pa28'), 'piper-low');
  assert.equal(fam('da40'), 'diamond-t');
  assert.equal(fam('da20'), 'diamond-t');
  assert.equal(fam('sr20'), 'cirrus-low');
  assert.equal(fam('other'), 'generic-low');
  assert.equal(fam(''), 'generic-low');
  assert.equal(fam(undefined), 'generic-low');
  assert.equal(fam('Bonanza'), 'generic-low');
  assert.ok(aircraftModelFor('c152').scale < aircraftModelFor('c172').scale);
  assert.ok(aircraftModelFor('da20').scale < aircraftModelFor('da40').scale);
});

test('loose aircraft names normalize', () => {
  assert.equal(normalizeAircraftType('C-172S'), 'c172');
  assert.equal(normalizeAircraftType('Skyhawk'), 'c172');
  assert.equal(normalizeAircraftType('PA-28-181 Archer'), 'pa28');
  assert.equal(normalizeAircraftType('DA-40'), 'da40');
  assert.equal(normalizeAircraftType('SR22'), 'sr20');
  assert.equal(normalizeAircraftType('  '), '');
  assert.equal(normalizeAircraftType('Decathlon'), 'other');
});

test('every type maps to a family that has a 3D builder', () => {
  const src = fs.readFileSync(new URL('../public/js/aircraft-models.js', import.meta.url), 'utf8');
  for (const t of AIRCRAFT_TYPES) {
    assert.ok(MODEL_FAMILIES.includes(t.family), t.id);
    assert.match(src, new RegExp(`'${t.family}':\\s*\\w+`), `builder for ${t.family}`);
  }
  assert.deepEqual(AIRCRAFT_TYPE_IDS, ['c172', 'c152', 'pa28', 'da40', 'da20', 'sr20', 'other']);
});

test('settings validate aircraftType', () => {
  assert.equal(DEFAULT_SETTINGS.aircraftType, '');
  assert.equal(sanitizeSettings({ aircraftType: 'SR20' }).aircraftType, 'sr20');
  assert.equal(sanitizeSettings({ aircraftType: '' }).aircraftType, '');
  assert.throws(() => sanitizeSettings({ aircraftType: 'f16' }), /unknown aircraft type/);
  assert.throws(() => sanitizeSettings({ aircraftType: '<script>' }), /unknown aircraft type/);
  // label stays independent of type
  const s = sanitizeSettings({ aircraftType: 'c172', aircraftLabel: 'N123AB' });
  assert.equal(s.aircraftType, 'c172'); assert.equal(s.aircraftLabel, 'N123AB');
});

test('aircraftType persists to settings.json; hand-edited bad value is dropped', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pl-ac-'));
  writeSettings(dir, { aircraftType: 'pa28' });
  assert.equal(readSettings(dir).aircraftType, 'pa28');
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir, 'settings.json'), 'utf8')).aircraftType, 'pa28');
  fs.writeFileSync(path.join(dir, 'settings.json'), JSON.stringify({ aircraftType: 'x-wing' }));
  assert.equal(readSettings(dir).aircraftType, '');
});

test('demo uses a sample type; settings page renders picker', () => {
  assert.ok(AIRCRAFT_TYPE_IDS.includes(settingsFor({ demo: true }).aircraftType));
  const html = renderSettingsPage((x) => String(x), { settings: sanitizeSettings({ aircraftType: 'c152' }), rates: {}, demo: false });
  assert.match(html, /name="aircraftType"/);
  assert.match(html, /value="c152" selected/);
  for (const t of AIRCRAFT_TYPES) assert.ok(html.includes(t.label), t.label);
});
