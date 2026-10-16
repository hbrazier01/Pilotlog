import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { computeCheckride } from '../pilotlog-cli/src/lib/checkride/index.mjs';
import { demoData } from '../pilotlog-cli/src/lib/checkride/insights.mjs';
import { renderCockpitPage } from '../pilotlog-cli/src/cockpitView.mjs';
import {
  renderFlightPlanPage,
  renderLogbookPage,
  renderTrainingPage,
  renderAcsPage,
  renderResourcesPage,
} from '../pilotlog-cli/src/lib/cockpit/pages.mjs';
import { instructorBriefing, minutesAgoLabel, weakestAcsFocus } from '../pilotlog-cli/src/lib/cockpit/briefing.mjs';
import {
  readCockpitEntries,
  createEntry,
  deleteEntry,
  entryTotals,
  writeCockpitEntries,
} from '../pilotlog-cli/src/lib/cockpit/entries.mjs';
import { COCKPIT_NAV } from '../pilotlog-cli/src/lib/cockpit/chrome.mjs';
import {
  formatPilotChip,
  userFromProfile,
  cockpitUser,
  DEMO_USER,
  FALLBACK_USER,
} from '../pilotlog-cli/src/lib/cockpit/profile.mjs';
import { renderNav } from '../pilotlog-cli/src/lib/cockpit/chrome.mjs';

const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

test('concept nav has Dashboard through Settings', () => {
  assert.deepEqual(
    COCKPIT_NAV.map((n) => n.label),
    ['Dashboard', 'Replay', 'Radio', 'Examiner', 'Flight Plan', 'Logbook', 'Training', 'ACS', 'Resources', 'Settings']
  );
});

test('renderCockpitPage: GO dial, SAMPLE chip, AI briefing, concept nav', () => {
  const d = demoData(new Date('2026-10-14'));
  const cr = computeCheckride(d.entries, d.store, { asOf: '2026-10-14' });
  const briefing = instructorBriefing(cr, { updatedAt: new Date(Date.now() - 120000).toISOString() });
  const wx = {
    demo: true,
    goNoGo: { decision: 'GO', reasons: ['Sample'], advisory: 'Advisory only — test.' },
    metar: { raw: 'METAR KAPA DEMO SAMPLE DATA' },
    taf: { raw: 'TAF KAPA DEMO' },
  };
  const html = renderCockpitPage(cr, esc, {
    entries: d.entries,
    demo: true,
    weather: wx,
    briefing,
    user: { name: 'JORDAN P.', role: 'PRIVATE PILOT STUDENT', initials: 'JP', sample: true },
  });
  assert.match(html, /SAMPLE/);
  assert.match(html, /go-dial/);
  assert.match(html, /GO \/ NO-GO/);
  assert.match(html, /utcClock/);
  assert.match(html, /AI INSTRUCTOR BRIEFING/);
  assert.match(html, /ai-badge/);
  assert.match(html, /BRIEFING UPDATED/);
  assert.match(html, /Flight Plan/);
  assert.match(html, /href="\/cockpit\/logbook/);
  assert.match(html, /href="\/cockpit\/training/);
  assert.match(html, /href="\/cockpit\/acs/);
  assert.match(html, /href="\/cockpit\/resources/);
  assert.match(html, /JORDAN P\./);
  assert.match(html, /id="synth3d"/);
  assert.match(html, /id="voiceBtn"/);
  assert.match(html, /speechSynthesis/);
  assert.match(html, /badge go[\s\S]*?GO|go-dial go/);
});

test('secondary pages render glass content (no placeholders)', () => {
  const d = demoData(new Date('2026-10-14'));
  const cr = computeCheckride(d.entries, d.store, { asOf: '2026-10-14' });
  const briefing = instructorBriefing(cr);
  const wx = { goNoGo: { decision: 'GO', reasons: ['ok'] }, metar: { raw: 'METAR' }, taf: { raw: 'TAF' } };
  const fp = renderFlightPlanPage(esc, { demo: true, weather: wx });
  assert.match(fp, /Local training plan/);
  assert.match(fp, /Practice area/);
  assert.match(fp, /Set your home airport/);
  assert.doesNotMatch(fp, /KAPA|Centennial|KBJC|DEN App/);
  const fp2 = renderFlightPlanPage(esc, { weather: { ...wx, station: { icao: 'KPAO', name: 'PALO ALTO', runways: [{ id: '13/31' }] } }, settings: { aircraftLabel: 'C172S' } });
  assert.match(fp2, /KPAO/);
  assert.match(fp2, /Palo Alto training plan/);
  assert.match(fp2, /C172S/);
  assert.doesNotMatch(fp, /TODO|placeholder|Coming soon/i);

  const lb = renderLogbookPage(esc, { demo: true, entries: d.entries });
  assert.match(lb, /Flight entries/);
  assert.match(lb, /TOTAL/);
  assert.doesNotMatch(lb, /Coming soon/i);

  const tr = renderTrainingPage(esc, { demo: true, cr, briefing });
  assert.match(tr, /Lesson plan/);
  assert.match(tr, /Steep turns/);

  const acs = renderAcsPage(esc, { demo: true, cr });
  assert.match(acs, /Airman Certification Standards/);
  assert.match(acs, /select data-task=/);
  assert.match(acs, /disabled/);

  const res = renderResourcesPage(esc, { demo: true });
  assert.match(res, /PHAK/);
  assert.match(res, /Airplane Flying Handbook/);
  assert.match(res, /faa\.gov/);
});

test('instructorBriefing from weakest ACS', () => {
  const d = demoData(new Date('2026-10-14'));
  const cr = computeCheckride(d.entries, d.store, { asOf: '2026-10-14' });
  const focus = weakestAcsFocus(cr, 3);
  assert.ok(focus.length >= 1);
  const b = instructorBriefing(cr);
  assert.ok(b.spoken.length > 20);
  assert.equal(b.badge, 'AI');
  assert.match(minutesAgoLabel(new Date(Date.now() - 2 * 60000).toISOString()), /2 min ago/);
});

test('cockpit entries CRUD feeds totals', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pl-entries-'));
  writeCockpitEntries(dir, []);
  assert.equal(readCockpitEntries(dir).length, 0);
  const e = createEntry(dir, {
    date: '2026-10-10',
    totalTime: 1.5,
    dual: 1.5,
    from: 'KAPA',
    to: 'KAPA',
    aircraftId: 'N272DS',
    remarks: 'Pattern',
  });
  assert.ok(e.id);
  const tot = entryTotals(readCockpitEntries(dir));
  assert.equal(tot.total, 1.5);
  assert.equal(tot.dual, 1.5);
  assert.equal(tot.count, 1);
  deleteEntry(dir, e.id);
  assert.equal(readCockpitEntries(dir).length, 0);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('real entries path: computeCheckride uses file entries for readiness', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pl-ready-'));
  writeCockpitEntries(dir, [
    {
      id: 'a1',
      date: '2026-09-01',
      totalTime: 2,
      dual: 2,
      solo: 0,
      from: 'KAPA',
      to: 'KAPA',
      aircraftId: 'N272DS',
    },
    {
      id: 'a2',
      date: '2026-09-15',
      totalTime: 1.2,
      dual: 0,
      solo: 1.2,
      from: 'KAPA',
      to: 'KAPA',
      aircraftId: 'N272DS',
    },
  ]);
  const entries = readCockpitEntries(dir);
  const cr = computeCheckride(entries, {});
  assert.ok(cr.readiness);
  assert.ok(cr.acs);
  const html = renderCockpitPage(cr, esc, { entries, demo: false, weather: { goNoGo: { decision: 'GO', reasons: [] }, metar: { raw: 'x' }, taf: { raw: 'y' } } });
  assert.match(html, /LIVE/);
  assert.doesNotMatch(html, /class="demo">SAMPLE/);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('formatPilotChip: Holland Brazier → HOLLAND B. / HB', () => {
  const c = formatPilotChip('Holland Brazier');
  assert.equal(c.name, 'HOLLAND B.');
  assert.equal(c.initials, 'HB');
  assert.equal(c.fullName, 'Holland Brazier');
});

test('userFromProfile uses real name; empty falls back to Pilot', () => {
  const u = userFromProfile({ pilot: { fullName: 'Holland Brazier' } });
  assert.equal(u.name, 'HOLLAND B.');
  assert.equal(u.initials, 'HB');
  assert.equal(u.role, 'PRIVATE PILOT STUDENT');
  assert.equal(u.sample, false);
  const empty = userFromProfile(null);
  assert.equal(empty.name, FALLBACK_USER.name);
  assert.equal(empty.initials, 'P');
  assert.equal(empty.sample, false);
});

test('cockpitUser: demo keeps Jordan P.; live uses profile', () => {
  assert.equal(cockpitUser({ demo: true }).name, DEMO_USER.name);
  assert.equal(cockpitUser({ demo: true }).initials, 'JP');
  const live = cockpitUser({ demo: false, profile: { pilot: { fullName: 'Holland Brazier' } } });
  assert.equal(live.name, 'HOLLAND B.');
  assert.equal(live.initials, 'HB');
  const htmlDemo = renderNav(esc, { active: 'dashboard', demo: true, user: DEMO_USER });
  assert.match(htmlDemo, /JORDAN P\./);
  assert.match(htmlDemo, /JP/);
  assert.match(htmlDemo, /SAMPLE/);
  const htmlLive = renderNav(esc, { active: 'dashboard', demo: false, user: live });
  assert.match(htmlLive, /HOLLAND B\./);
  assert.match(htmlLive, />HB</);
  assert.match(htmlLive, /LIVE/);
  assert.doesNotMatch(htmlLive, /JORDAN/);
  assert.doesNotMatch(htmlLive, /class="demo">SAMPLE/);
});

