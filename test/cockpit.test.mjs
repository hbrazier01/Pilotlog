import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeCheckride } from '../pilotlog-cli/src/lib/checkride/index.mjs';
import { demoData } from '../pilotlog-cli/src/lib/checkride/insights.mjs';
import { cockpitGates, acsTiles, logbookTimeline, progressBars } from '../pilotlog-cli/src/lib/checkride/cockpit.mjs';
import { renderCockpitPage } from '../pilotlog-cli/src/cockpitView.mjs';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

test('cockpitGates: demo has Solo lit, Checkride not', () => {
  const d = demoData(new Date('2026-10-14'));
  const cr = computeCheckride(d.entries, d.store, { asOf: '2026-10-14' });
  const g = cockpitGates(cr, d.entries);
  assert.equal(g.gates.length, 4);
  assert.equal(g.gates[0].key, 'solo');
  assert.equal(g.gates[0].done, true, 'demo includes solo flights');
  assert.equal(g.gates[3].key, 'checkride');
  assert.equal(g.gates[3].done, false);
  assert.ok(g.current >= 1);
});

test('acsTiles: status mastered / in_progress / pending', () => {
  const d = demoData(new Date('2026-10-14'));
  const cr = computeCheckride(d.entries, d.store, { asOf: '2026-10-14' });
  const tiles = acsTiles(cr.acs);
  assert.ok(tiles.length >= 5);
  assert.ok(tiles.every(t => ['mastered', 'in_progress', 'pending'].includes(t.status)));
  assert.ok(tiles.every(t => t.total > 0), 'empty areas skipped');
  // Area II has several proficient in demo → in_progress or mastered
  const ii = tiles.find(t => t.area === 'II');
  assert.ok(ii);
  assert.ok(ii.proficient >= 3);
  assert.ok(ii.status === 'in_progress' || ii.status === 'mastered');
  // Empty logbook → all pending
  const empty = acsTiles(computeCheckride([], {}).acs);
  assert.ok(empty.every(t => t.status === 'pending'));
});

test('logbookTimeline + progressBars from demo', () => {
  const d = demoData(new Date('2026-10-14'));
  const cr = computeCheckride(d.entries, d.store, { asOf: '2026-10-14' });
  const tl = logbookTimeline(cr, d.entries, '2026-12-01');
  assert.equal(tl.nodes.length, 4);
  assert.ok(tl.nodes[0].done);
  assert.ok(tl.totals.total > 10);
  const bars = progressBars(cr);
  assert.equal(bars.length, 4);
  assert.equal(bars[0].key, 'flight');
  assert.ok(bars[0].pct > 0 && bars[0].pct <= 100);
});

test('renderCockpitPage includes synth, weather badge, ACS tiles, DEMO banner', () => {
  const d = demoData(new Date('2026-10-14'));
  const cr = computeCheckride(d.entries, d.store, { asOf: '2026-10-14' });
  const wx = {
    demo: true,
    goNoGo: { decision: 'GO', reasons: ['Sample'], advisory: 'Advisory only — test.' },
    metar: { raw: 'METAR KAPA DEMO SAMPLE DATA' },
    taf: { raw: 'TAF KAPA DEMO' },
  };
  const html = renderCockpitPage(cr, esc, { entries: d.entries, demo: true, weather: wx });
  assert.match(html, /DEMO DATA/);
  assert.match(html, /CHECKRIDE READY/);
  assert.match(html, /class="synth"/);
  assert.match(html, /badge go[\s\S]*?GO/);
  assert.match(html, /METAR KAPA DEMO SAMPLE/);
  assert.match(html, /ACS Tasks/);
  assert.match(html, /Logbook Timeline/);
  assert.match(html, /Advisory only/);
  assert.match(html, /SOLO/);
  assert.match(html, /VIEW READINESS REPORT/);
});
