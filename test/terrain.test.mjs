import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  lonLatToTile, parseTileParams, terrariumUrl, decodeTerrariumRgb, kapaTileWindow,
} from '../pilotlog-cli/src/lib/weather/terrain.mjs';

test('lonLatToTile for KAPA at z10', () => {
  const t = lonLatToTile(-104.85, 39.57, 10);
  assert.equal(t.x, 213);
  assert.equal(t.y, 389);
});

test('parseTileParams rejects junk', () => {
  assert.equal(parseTileParams('10', '213', '389').z, 10);
  assert.equal(parseTileParams('../', '1', '1'), null);
  assert.equal(parseTileParams('99', '1', '1'), null);
  assert.equal(parseTileParams('2', '100', '0'), null);
});

test('terrariumUrl + decode', () => {
  assert.match(terrariumUrl({ z: 10, x: 213, y: 389 }), /terrarium\/10\/213\/389\.png$/);
  // sea level-ish encoding check: R=128,G=0,B=0 → 0m? 128*256 - 32768 = 0
  assert.equal(decodeTerrariumRgb(128, 0, 0), 0);
  assert.ok(decodeTerrariumRgb(135, 0, 0) > 1500); // ~1792m
});

test('kapaTileWindow is west-biased', () => {
  const w = kapaTileWindow(10);
  assert.ok(w.x0 < w.kapa.x);
  assert.ok(w.x1 >= w.kapa.x);
});
