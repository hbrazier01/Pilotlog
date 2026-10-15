import test from 'node:test';
import assert from 'node:assert/strict';
import { computeCheckride } from '../pilotlog-cli/src/lib/checkride/index.mjs';
import { demoData, readinessScore, projectCheckride, flightPath, nextLesson, briefText } from '../pilotlog-cli/src/lib/checkride/insights.mjs';

test('demo seed yields live-looking state', () => {
  const d = demoData(new Date('2026-10-14'));
  const cr = computeCheckride(d.entries, d.store, { asOf: '2026-10-14' });
  const s = readinessScore(cr);
  assert.ok(s.pct > 0 && s.pct < 100);
  assert.ok(cr.costs.toDate > 3000 && cr.costs.toDate < 5000);
  const p = projectCheckride(cr, d.entries, new Date('2026-10-14'));
  assert.ok(p.perWeek > 0 && /^\d{4}-\d{2}-\d{2}$/.test(p.date));
  assert.equal(flightPath(cr, d.entries).points[flightPath(cr, d.entries).current].key, 'soloxc');
  const items = nextLesson(cr);
  assert.ok(items.length >= 2 && items.length <= 3);
  assert.match(briefText(items), /^Hi Giselle/);
});

test('empty logbook: no projected date, first waypoint is next', () => {
  const cr = computeCheckride([], {});
  assert.equal(projectCheckride(cr, []).date, null);
  assert.equal(flightPath(cr, []).current, 0);
});
