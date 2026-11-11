/**
 * Dashboard hero: the illustrated mountain-and-sunset training journey is the default view (Nov 10 2026).
 *  - journey stays visible; the 3D terrain never auto-replaces it (opt-in "3D view" control only)
 *  - no "Loading terrain" message and no duplicate HUD overlays on the illustrated view
 *  - milestones readable (larger SVG labels + an HTML milestone list); container sized to the art
 *  - progress numbers are the unchanged outputs of the existing calculations
 *  - signed-in: no ?demo=1 on nav, ?demo=1 ignored; signed-out sample path still labeled SAMPLE
 * Postgres cases run when PILOTLOG_TEST_DATABASE_URL is set; each uses a throwaway schema.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import pg from 'pg';
import { computeCheckride } from '../pilotlog-cli/src/lib/checkride/index.mjs';
import { demoData, readinessScore } from '../pilotlog-cli/src/lib/checkride/insights.mjs';
import { cockpitGates, logbookTimeline, progressBars } from '../pilotlog-cli/src/lib/checkride/cockpit.mjs';
import { projectCheckride } from '../pilotlog-cli/src/lib/checkride/insights.mjs';
import { renderCockpitPage } from '../pilotlog-cli/src/cockpitView.mjs';
import { migrate } from '../pilotlog-cli/src/db.mjs';
import { migrateAccountsV2 } from '../pilotlog-cli/src/lib/accounts/schemaV2.mjs';
import { newStudentId } from '../pilotlog-cli/src/lib/accounts/ids.mjs';
import { createSession } from '../pilotlog-cli/src/lib/accounts/sessions.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TEST_DB = process.env.PILOTLOG_TEST_DATABASE_URL;
const pgTest = TEST_DB ? test : test.skip;
const REMARK = 'REAL-ENTRY-JOURNEY-NOV10';
const ENTRY = { date: '2026-11-08', totalTime: 1.1, dual: 1.1, from: 'KAPA', to: 'KAPA', aircraftId: 'N0SYN', remarks: REMARK };
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const SIGNED_IN = { name: 'TEST PILOT', initials: 'TP', role: 'PRIVATE PILOT STUDENT', account: { signedIn: true } };
const WX = { goNoGo: { decision: 'GO', reasons: [] }, metar: { raw: 'METAR' }, taf: { raw: 'TAF' } };

const tag = (html, id) => (html.match(new RegExp(`<[a-z]+[^>]*\\bid="${id}"[^>]*>`)) || [null])[0];
const script = (html) => html.slice(html.lastIndexOf('<script type="module">'), html.lastIndexOf('</script>'));
/** Markup with the hidden 3D-only HUD removed = what the illustrated view actually shows. */
const journeyVisible = (html) => html.replace(/<div class="hero-hud" id="hud3d" hidden[\s\S]*?<\/div>\s*<\/div>/, '');

/** Shared assertions for the illustrated-journey default. */
function assertJourneyDefault(html) {
  assert.ok(!/loading terrain/i.test(html), 'no "Loading terrain" anywhere on the dashboard');
  assert.match(tag(html, 'hero'), /data-view="journey"/);
  assert.match(html, /<div class="journey" id="journeyView"><svg class="synth"/);
  assert.match(tag(html, 'synth3d'), /\shidden[\s>]/, '3D canvas starts hidden');
  assert.doesNotMatch(tag(html, 'synth3d'), /class="[^"]*\bon\b/);
  assert.match(tag(html, 'hud3d'), /\shidden[\s>]/, '3D-only HUD starts hidden');
  assert.match(tag(html, 'heroLoad'), /\shidden[\s>]/);
  assert.match(html, /<div class="hero-loading" id="heroLoad" hidden role="status"><\/div>/, 'no loading copy rendered');
  assert.doesNotMatch(tag(html, 'hero'), /webgl-on/);
  // Optional control: Journey pressed, 3D view not pressed.
  assert.match(html, /<button type="button" id="viewJourney" aria-pressed="true">Journey<\/button>/);
  assert.match(html, /<button type="button" id="view3d" aria-pressed="false">3D view<\/button>/);
  // 3D is mounted only from the click handler: no auto-swap on load / ready / timer.
  const js = script(html);
  assert.equal((js.match(/mountSynth3d\(/g) || []).length, 1);
  assert.equal((js.match(/show3d\(/g) || []).length, 2, 'show3d defined once, called once (click)');
  assert.match(js, /b3\.addEventListener\('click',\(\)=>\{ show3d\(\); \}\)/);
  assert.ok(js.indexOf("import('/js/cockpit-synth3d.js')") > js.indexOf('async function show3d'), 'import is inside show3d');
  assert.doesNotMatch(js, /setTimeout\([^)]*show3d|requestAnimationFrame\([^)]*show3d/);
  // No duplicate overlays on the illustrated view: each HUD chip text appears exactly once.
  const vis = journeyVisible(html);
  assert.equal((vis.match(/HDG 032° · GS 96/g) || []).length, 1);
  assert.equal((vis.match(/TRK 031° · ALT 7,500/g) || []).length, 1);
  assert.equal((html.match(/HDG 032° · GS 96/g) || []).length, 2, 'second copy only inside the hidden 3D HUD');
  assert.equal((html.match(/class="hero glass"/g) || []).length, 1);
  assert.equal((html.match(/id="journeyView"/g) || []).length, 1);
  assert.doesNotMatch(html, /synth-fallback/);
  // Container tightened to the art (no letterbox).
  assert.match(html, /\.hero\{[^}]*aspect-ratio:720\/420/);
  assert.doesNotMatch(html, /min-height:520px/);
  // Readable milestones: larger halo'd SVG labels.
  assert.match(html, /\.gate \.gate-lab\{font:700 15px[^}]*paint-order:stroke/);
}

function assertMilestones(html, cr, entries) {
  const g = cockpitGates(cr, entries);
  const items = [...html.matchAll(/<li class="ms (done|next|ahead)" data-milestone="([a-z]+)"><span class="ms-lab">([^<]+)<\/span><span class="ms-st">([^<]+)<\/span><\/li>/g)];
  assert.equal(items.length, g.gates.length);
  g.gates.forEach((gate, i) => {
    const want = gate.done ? 'done' : i === g.current ? 'next' : 'ahead';
    assert.equal(items[i][1], want);
    assert.equal(items[i][2], gate.key);
    assert.equal(items[i][3], gate.label);
    assert.equal(items[i][4], { done: 'Done', next: 'Up next', ahead: 'Ahead' }[want]);
  });
  assert.match(html, new RegExp(`Training Journey · ${g.litCount} of ${g.gates.length} milestones`));
  assert.match(html, new RegExp(`aria-label="Training journey: ${g.gates.map((x, i) => `${x.label} ${x.done ? 'done' : i === g.current ? 'next' : 'ahead'}`).join(', ')}"`));
  for (const gate of g.gates) assert.match(html, new RegExp(`class="gate-lab">${gate.label.toUpperCase()}<`));
  assert.doesNotMatch(html, /\.ms[^{]*\{[^}]*display:none/);
}

function assertProgressUnchanged(html, cr, entries) {
  assert.match(html, new RegExp(`data-count="${readinessScore(cr).pct}"`));
  for (const b of progressBars(cr)) {
    if (b.key === 'written') continue;
    const val = b.unit === 'HRS' ? `${b.actual} / ${b.required} ${b.unit}` : `${b.actual} / ${b.required}`;
    assert.ok(html.includes(esc(val)), `bar ${b.key} shows ${val}`);
  }
  const tl = logbookTimeline(cr, entries, projectCheckride(cr, entries).date);
  assert.match(html, new RegExp(`TOTAL TIME <b>${tl.totals.total} HRS</b>`));
  assert.match(html, new RegExp(`PIC <b>${tl.totals.pic} HRS</b>`));
  assert.match(html, new RegExp(`DUAL <b>${tl.totals.dual} HRS</b>`));
}

test('signed-in render: journey is the default, 3D opt-in, no loading/duplicates, readable milestones, same numbers', () => {
  const entries = [ENTRY];
  const cr = computeCheckride(entries, demoData(new Date('2026-11-10')).store, { asOf: '2026-11-10' });
  const html = renderCockpitPage(cr, esc, { entries, demo: false, weather: WX, user: SIGNED_IN });
  assertJourneyDefault(html);
  assertMilestones(html, cr, entries);
  assertProgressUnchanged(html, cr, entries);
  assert.doesNotMatch(html, /\?demo=1/);
  assert.doesNotMatch(html, />SAMPLE</);
  // Even if a caller mislabels the page as demo, a signed-in user never gets ?demo=1 nav (PR #23).
  const html2 = renderCockpitPage(cr, esc, { entries, demo: true, weather: WX, user: SIGNED_IN });
  assert.doesNotMatch(html2, /\?demo=1/);
  assertJourneyDefault(html2);
});

test('signed-out sample render: journey default, SAMPLE label kept, 3D opt-in', () => {
  const d = demoData(new Date('2026-10-14'));
  const cr = computeCheckride(d.entries, d.store, { asOf: '2026-10-14' });
  const html = renderCockpitPage(cr, esc, { entries: d.entries, demo: true, weather: { ...WX, demo: true }, user: { name: 'JORDAN P.', initials: 'JP', role: 'R', sample: true } });
  assertJourneyDefault(html);
  assertMilestones(html, cr, d.entries);
  assertProgressUnchanged(html, cr, d.entries);
  assert.match(html, />SAMPLE</);
  assert.match(html, /href="\/cockpit\/logbook\?demo=1"/);
  // At least one gate is done in the sample, so the journey shows progress.
  assert.match(html, /<li class="ms done"/);
});

function boot(env, port) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(ROOT, 'pilotlog-cli/src/readApi.mjs')], {
      cwd: ROOT,
      env: { ...process.env, PORT: String(port), PILOTLOG_HOME: fs.mkdtempSync(path.join(os.tmpdir(), 'pl-journey-')), DATABASE_URL: '', PILOTLOG_ACCOUNTS_V2: '', ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '';
    const timer = setTimeout(() => { child.kill(); reject(new Error('boot timeout: ' + out)); }, 15000);
    child.stdout.on('data', (d) => { out += d; if (out.includes('listening on')) { clearTimeout(timer); resolve(child); } });
    child.stderr.on('data', (d) => { out += d; });
  });
}
const stop = (c) => new Promise((r) => { c.once('exit', r); c.kill(); });

test('flag off over HTTP: /cockpit and /cockpit?demo=1 default to the illustrated journey', async () => {
  const port = 26100 + Math.floor(Math.random() * 300);
  const c = await boot({}, port);
  try {
    const plain = await (await fetch(`http://127.0.0.1:${port}/cockpit`)).text();
    assertJourneyDefault(plain);
    const demo = await (await fetch(`http://127.0.0.1:${port}/cockpit?demo=1`)).text();
    assertJourneyDefault(demo);
    assert.match(demo, />SAMPLE</);
    const js = await fetch(`http://127.0.0.1:${port}/js/cockpit-synth3d.js`);
    assert.equal(js.status, 200, '3D module still served for the opt-in control');
    await js.arrayBuffer();
  } finally { await stop(c); }
});

async function withSchema(fn) {
  const schema = `s_${process.pid}_${Math.random().toString(36).slice(2, 10)}`;
  const admin = new pg.Pool({ connectionString: TEST_DB, max: 1 });
  await admin.query(`CREATE SCHEMA ${schema}`);
  const u = new URL(TEST_DB); u.searchParams.set('options', `-c search_path=${schema}`);
  const pool = new pg.Pool({ connectionString: u.toString(), max: 6 });
  try { await migrate(pool); await migrateAccountsV2(pool); return await fn(pool, u.toString()); }
  finally { await pool.end(); await admin.query(`DROP SCHEMA ${schema} CASCADE`); await admin.end(); }
}

pgTest('accounts on, signed in: dashboard shows own data with the journey default; ?demo=1 ignored; Logbook → Replay → Logbook intact; signed-out stays SAMPLE', () => withSchema(async (pool, url) => {
  const port = 26500 + Math.floor(Math.random() * 300);
  const c = await boot({ DATABASE_URL: url, PILOTLOG_ACCOUNTS_V2: 'true', PILOTLOG_COOKIE_SECURE: 'false', NODE_ENV: 'test' }, port);
  try {
    const base = `http://127.0.0.1:${port}`;
    const id = newStudentId();
    await pool.query('INSERT INTO students (id) VALUES ($1)', [id]);
    const session = await createSession(pool, { studentId: id });
    const headers = { cookie: `pl_sid=${session.token}`, origin: base, 'content-type': 'application/json' };
    const created = await fetch(`${base}/api/cockpit/entries`, { method: 'POST', headers, body: JSON.stringify(ENTRY) });
    const entry = await created.json();
    assert.equal(created.status, 201, JSON.stringify(entry));

    for (const q of ['', '?demo=1']) {
      const dash = await (await fetch(`${base}/cockpit${q}`, { headers })).text();
      assertJourneyDefault(dash);
      assert.doesNotMatch(dash, /\?demo=1/);
      assert.doesNotMatch(dash, />SAMPLE</);
      assert.match(dash, /class="live"/);
      assert.match(dash, /TOTAL TIME <b>1\.1 HRS<\/b>/, 'own single entry drives the numbers');
      assert.match(dash, /<li class="ms next" data-milestone="solo">/);
    }

    const log1 = await (await fetch(`${base}/cockpit/logbook`, { headers })).text();
    assert.match(log1, new RegExp(REMARK));
    const replay = await (await fetch(`${base}/cockpit/replay?entry=${entry.id}`, { headers })).text();
    assert.match(replay, /No replay available/);
    assert.doesNotMatch(replay, /\?demo=1/);
    const logHref = replay.match(/href="(\/cockpit\/logbook[^"]*)"/)[1];
    assert.equal(logHref, '/cockpit/logbook');
    const log2 = await (await fetch(`${base}${logHref}`, { headers })).text();
    assert.match(log2, new RegExp(REMARK));
    assert.doesNotMatch(log2, /id="demo0"|\?demo=1/);
    const dashAfter = await (await fetch(`${base}/cockpit`, { headers })).text();
    assertJourneyDefault(dashAfter);
    assert.match(dashAfter, /TOTAL TIME <b>1\.1 HRS<\/b>/);

    const out = await (await fetch(`${base}/cockpit`)).text();
    assertJourneyDefault(out);
    assert.match(out, />SAMPLE</);
    assert.doesNotMatch(out, /TOTAL TIME <b>1\.1 HRS<\/b>/);
  } finally { await stop(c); }
}));
