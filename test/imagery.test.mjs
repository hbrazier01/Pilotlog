import { test } from 'node:test';
import assert from 'node:assert/strict';
import { quadKey, fetchImageryTile, imageryEnabled } from '../pilotlog-cli/src/lib/weather/imagery.mjs';

test('Bing quadkey', () => { assert.equal(quadKey(3, 3, 5), '213'); assert.equal(quadKey(1, 0, 0), '0'); });
test('no token → imagery disabled, no upstream call', async () => {
  const saved = process.env.CESIUM_ION_TOKEN; delete process.env.CESIUM_ION_TOKEN;
  try {
    assert.equal(imageryEnabled(), false);
    let called = false;
    assert.equal(await fetchImageryTile({ z: 1, x: 0, y: 0 }, async () => { called = true; }), null);
    assert.equal(called, false);
  } finally { if (saved !== undefined) process.env.CESIUM_ION_TOKEN = saved; }
});
