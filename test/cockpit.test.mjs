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
  const ii = tiles.find(t => t.area === 'II');
  assert.ok(ii);
  assert.ok(ii.proficient >= 3);
  assert.ok(ii.status === 'in_progress' || ii.status === 'mastered');
  const empty = acsTiles(computeCheckride([], {}).acs);
  assert.ok(empty.every(t => t.status === 'pending'));
});

test('demo timeline dates ordered and hours consistent with totals', () => {
  const d = demoData(new Date('2026-10-14'));
  const cr = computeCheckride(d.entries, d.store, { asOf: '2026-10-14' });
  const bars = progressBars(cr);
  const tl = logbookTimeline(cr, d.entries, '2026-12-01');
  assert.equal(tl.nodes.length, 4);
  assert.ok(tl.nodes[0].done, 'solo done');
  assert.ok(tl.nodes[1].done, 'xc after solo done');
  assert.equal(tl.nodes[2].done, false, 'no night yet');
  // dates monotonic for achieved milestones
  assert.ok(tl.nodes[0].date <= tl.nodes[1].date, `${tl.nodes[0].date} <= ${tl.nodes[1].date}`);
  // hours at milestones <= total time
  assert.ok(tl.nodes[0].hours <= tl.totals.total);
  assert.ok(tl.nodes[1].hours <= tl.totals.total);
  assert.ok(tl.nodes[0].hours <= tl.nodes[1].hours, 'cum hours grow');
  // solo progress bar matches actual solo hours; milestone hours are total-time-at-solo
  const soloBar = bars.find(b => b.key === 'solo');
  assert.ok(soloBar.actual >= 2 && soloBar.actual <= 5);
  assert.ok(tl.nodes[0].hours >= soloBar.actual);
  assert.equal(bars[0].key, 'flight');
  assert.ok(bars[0].pct > 0 && bars[0].pct <= 100);
});

test('renderCockpitPage includes 3D canvas, voice btn, SVG fallback, DEMO', () => {
  const d = demoData(new Date('2026-10-14'));
  const cr = computeCheckride(d.entries, d.store, { asOf: '2026-10-14' });
  const wx = {
    demo: true,
    goNoGo: { decision: 'GO', reasons: ['Sample'], advisory: 'Advisory only — test.' },
    metar: { raw: 'METAR KAPA DEMO SAMPLE DATA' },
    taf: { raw: 'TAF KAPA DEMO' },
  };
  const html = renderCockpitPage(cr, esc, { entries: d.entries, demo: true, weather: wx });
  assert.match(html, /SAMPLE/);
  assert.match(html, /CHECKRIDE READY/);
  assert.match(html, /class="synth"/);
  assert.match(html, /id="synth3d"/);
  assert.match(html, /cockpit-synth3d\.js/);
  assert.match(html, /id="voiceBtn"/);
  assert.match(html, /speechSynthesis/);
  assert.match(html, /go-dial go/);
  assert.match(html, /GO \/ NO-GO/);
  assert.match(html, /METAR KAPA DEMO SAMPLE/);
  assert.match(html, /ACS Tasks/);
  assert.match(html, /Logbook Timeline/);
  assert.match(html, /Advisory only/);
  assert.match(html, /VIEW READINESS REPORT/);
});
