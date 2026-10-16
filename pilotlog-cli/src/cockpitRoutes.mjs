/**
 * Cockpit Dashboard routes.
 *   GET  /cockpit (+ pages)   glass-cockpit UI (?demo=1 for SAMPLE)
 *   GET  /api/weather         Live METAR+TAF + go/no-go for the user's home airport
 *   GET  /api/weather/kapa    (compat) KAPA weather
 *   GET  /cockpit/radio       Radio Practice (simulated tower; training only)
 *   GET  /cockpit/settings    Settings UI;  GET/PUT /api/cockpit/settings
 *   CRUD /api/cockpit/entries Per-student logbook (session student; signed out = SAMPLE, read-only)
 *   GET  /cockpit/examiner    AI Examiner (oral exam, see lib/examiner/routes.mjs)
 *   GET/POST /api/cockpit/radio/attempts  Radio Practice history;  GET /api/cockpit/usage  AI coach ledger
 *
 * All student data goes through `data` (lib/accounts/studentData.mjs), scoped to req.student.
 */
import { renderCockpitPage } from './cockpitView.mjs';
import {
  renderFlightPlanPage,
  renderLogbookPage,
  renderTrainingPage,
  renderAcsPage,
  renderResourcesPage,
} from './lib/cockpit/pages.mjs';
import { instructorBriefing } from './lib/cockpit/briefing.mjs';
import { sanitizeEntry } from './lib/cockpit/entries.mjs';
import crypto from 'node:crypto';
import { computeCheckride } from './lib/checkride/index.mjs';
import { demoData } from './lib/checkride/insights.mjs';
import { getKapaWeather, getStationWeather } from './lib/weather/fetch.mjs';
import { settingsFor, bookingAction, sanitizeSettings } from './lib/cockpit/settings.mjs';
import { renderSettingsPage } from './lib/cockpit/settingsPage.mjs';
import { renderRadioPage } from './lib/cockpit/radioPage.mjs';
import { getRadioAirportData } from './lib/airport/airportData.mjs';
import { parseTileParams, terrariumUrl } from './lib/weather/terrain.mjs';
import { imageryEnabled, fetchImageryTile, imageryAttribution } from './lib/weather/imagery.mjs';
import { DEMO_USER } from './lib/cockpit/profile.mjs';
import { renderReplayPage } from './replayView.mjs';
import { buildSampleKapaTrack } from './lib/replay/sampleTrack.mjs';
import { buildMissionMap } from './lib/replay/missionMap.mjs';
import { todaysCall } from './lib/replay/todaysCall.mjs';
import { acsSkillStrip } from './lib/replay/acsStrip.mjs';
import { buildTrack } from './lib/replay/tracks.mjs';
import { shortAddress } from './lib/accounts/authRoutes.mjs';
import { sanitizeRadioAttempt } from './lib/accounts/studentData.mjs';
import { SCENARIOS } from '../../public/js/atc-engine.js';
import { registerExaminerRoutes } from './lib/examiner/routes.mjs';
import { renderExaminerPage } from './lib/examiner/page.mjs';
import { parseTrack } from './lib/replay/parse.mjs';
import { detectEvents } from './lib/replay/events.mjs';

const ENTRY_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const SCENARIO_IDS = SCENARIOS.map((x) => x.id);

export function registerCockpitRoutes(app, { dataDir, escapeHtml, data, requireStudent, legacyProfileUser = null, examiner = {} }) {
  const accountOf = (st) => ({ signedIn: !!st, shortAddress: st ? shortAddress(st.walletAddress) : '', walletAddress: st?.walletAddress || '', verified: !!st?.verified });

  function studentUser(st) {
    const base = legacyProfileUser?.(st) || null;
    const tail = st.walletAddress.slice(-2).toUpperCase();
    return { ...(base || { name: 'STUDENT', role: 'PRIVATE PILOT STUDENT', initials: tail, sample: false }), account: accountOf(st) };
  }

  async function loadContext(req) {
    const st = req.student;
    const demo = req.query.demo === '1' || !st;
    if (demo) {
      const d = demoData();
      const cr = computeCheckride(d.entries, d.store);
      const weather = await getStationWeather({ demo: true });
      const settings = settingsFor({ demo: true });
      const briefing = instructorBriefing(cr, { instructorName: settings.instructorName });
      return { demo: true, signedOut: !st, entries: d.entries, cr, crStore: d.store, weather, briefing, user: { ...DEMO_USER, account: accountOf(st) }, settings };
    }
    const [entries, crStore, settings] = await Promise.all([data.entries(st), data.checkride(st), data.settings(st)]);
    const cr = computeCheckride(entries, crStore);
    const weather = await getStationWeather({ icao: settings.homeAirport, force: req.query.refresh === '1' });
    const briefing = instructorBriefing(cr, { instructorName: settings.instructorName });
    return { demo: false, signedOut: false, entries, cr, crStore, weather, briefing, user: studentUser(st), settings };
  }

  const fail = (res, err, code = 400) => res.status(code).json({ ok: false, error: String(err.message || err) });

  app.get('/api/weather', async (req, res) => {
    const demo = req.query.demo === '1' || !req.student;
    const icao = demo ? '' : (await data.settings(req.student)).homeAirport;
    res.json(await getStationWeather({ icao, demo, force: req.query.refresh === '1' }));
  });

  app.get('/api/cockpit/settings', async (req, res) => {
    const st = req.student;
    if (req.query.demo === '1' || !st) return res.json({ demo: true, signedIn: !!st, settings: settingsFor({ demo: true }), rates: demoData().store.rates });
    res.json({ demo: false, signedIn: true, settings: await data.settings(st), rates: (await data.checkride(st)).rates });
  });

  app.put('/api/cockpit/settings', requireStudent, async (req, res) => {
    try {
      const st = req.student;
      const body = req.body || {};
      // Validate everything first so a bad field never half-saves.
      const next = sanitizeSettings(body, await data.settings(st));
      let rates = null;
      if (body.rates && (body.rates.aircraftRate !== undefined || body.rates.instructorRate !== undefined)) {
        const cur = await data.checkride(st);
        const a = body.rates.aircraftRate ?? cur.rates?.aircraftRate;
        const i = body.rates.instructorRate ?? cur.rates?.instructorRate;
        if (!(Number(a) >= 0 && Number(a) < 10000) || !(Number(i) >= 0 && Number(i) < 10000)) throw new Error('rates must be numbers between 0 and 10000');
        rates = { aircraftRate: Number(a), instructorRate: Number(i), aircraftLabel: next.aircraftLabel || cur.rates?.aircraftLabel || '' };
        cur.rates = rates;
        await data.saveCheckride(st, cur);
      }
      const saved = await data.saveSettings(st, next);
      res.json({ ok: true, settings: saved, rates });
    } catch (err) { fail(res, err); }
  });

  app.get('/api/weather/kapa', async (req, res) => {
    const demo = req.query.demo === '1';
    const force = req.query.refresh === '1';
    try {
      const wx = await getKapaWeather({ demo, force });
      res.json(wx);
    } catch (err) {
      res.status(502).json({
        ok: false,
        error: String(err.message || err),
        goNoGo: {
          decision: 'UNKNOWN',
          reasons: ['Weather fetch failed'],
          advisory: 'Get an official briefing before flight.',
        },
      });
    }
  });

  // Proxy AWS Terrarium elevation tiles (no CORS on S3). Short memory cache.
  const tileCache = new Map();
  const TILE_CACHE_MAX = 64;
  app.get('/api/terrain/:z/:x/:y.png', async (req, res) => {
    const t = parseTileParams(req.params.z, req.params.x, req.params.y);
    if (!t) return res.status(400).send('bad tile');
    const key = `${t.z}/${t.x}/${t.y}`;
    try {
      if (tileCache.has(key)) {
        const buf = tileCache.get(key);
        res.set('Cache-Control', 'public, max-age=86400');
        res.type('png').send(buf);
        return;
      }
      const url = terrariumUrl(t);
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 10000);
      const r = await fetch(url, { signal: ctrl.signal, headers: { 'User-Agent': 'PilotLog/1.0' } });
      clearTimeout(timer);
      if (!r.ok) return res.status(502).send('tile upstream ' + r.status);
      const buf = Buffer.from(await r.arrayBuffer());
      if (tileCache.size >= TILE_CACHE_MAX) tileCache.delete(tileCache.keys().next().value);
      tileCache.set(key, buf);
      res.set('Cache-Control', 'public, max-age=86400');
      res.type('png').send(buf);
    } catch {
      res.status(502).send('tile error');
    }
  });

  // Photoreal imagery through Cesium ion (token stays server-side; see imagery.mjs)
  app.get('/api/imagery/status', (req, res) => {
    res.json({ enabled: imageryEnabled(), attribution: imageryAttribution(), note: 'Cesium ion free tier: non-commercial use' });
  });
  app.get('/api/imagery/:z/:x/:y.jpg', async (req, res) => {
    const t = parseTileParams(req.params.z, req.params.x, req.params.y);
    if (!t || t.z > 17) return res.status(400).send('bad tile');
    if (!imageryEnabled()) return res.status(404).send('imagery disabled');
    try {
      const v = await fetchImageryTile(t);
      if (!v) return res.status(404).send('imagery disabled');
      res.set('Cache-Control', 'public, max-age=86400');
      res.type(v.type).send(v.buf);
    } catch {
      res.status(502).send('imagery error');
    }
  });

  app.get('/api/cockpit/entries', async (req, res) => {
    if (req.query.demo === '1' || !req.student) return res.json({ demo: true, signedIn: !!req.student, entries: demoData().entries });
    res.json({ demo: false, entries: await data.entries(req.student) });
  });

  app.post('/api/cockpit/entries', requireStudent, async (req, res) => {
    try {
      const body = sanitizeEntry(req.body || {});
      const list = await data.entries(req.student);
      if (list.length >= 5000) throw new Error('logbook is full');
      const entry = {
        id: crypto.randomBytes(8).toString('hex'),
        ...body,
        dual: body.dual ?? (body.solo ? 0 : body.totalTime),
        solo: body.solo ?? 0,
        from: body.from || '',
        to: body.to || body.from || '',
        createdAt: new Date().toISOString(),
      };
      list.push(entry);
      await data.saveEntries(req.student, list);
      res.status(201).json(entry);
    } catch (err) { fail(res, err); }
  });

  app.put('/api/cockpit/entries/:id', requireStudent, async (req, res) => {
    try {
      const list = await data.entries(req.student);
      const i = list.findIndex((e) => e.id === req.params.id);
      if (i < 0) return fail(res, 'unknown entry', 404);
      list[i] = { ...list[i], ...sanitizeEntry(req.body || {}, { partial: true }), updatedAt: new Date().toISOString() };
      await data.saveEntries(req.student, list);
      res.json(list[i]);
    } catch (err) { fail(res, err); }
  });

  app.delete('/api/cockpit/entries/:id', requireStudent, async (req, res) => {
    try {
      const list = await data.entries(req.student);
      const next = list.filter((e) => e.id !== req.params.id);
      if (next.length === list.length) return fail(res, 'unknown entry', 404);
      await data.saveEntries(req.student, next);
      res.json({ ok: true });
    } catch (err) { fail(res, err); }
  });

  // Radio Practice history (per student). Signed-out / demo attempts are not stored.
  app.get('/api/cockpit/radio/attempts', requireStudent, async (req, res) => {
    res.json({ attempts: await data.radio(req.student) });
  });
  app.post('/api/cockpit/radio/attempts', requireStudent, async (req, res) => {
    try { res.status(201).json(await data.addRadioAttempt(req.student, sanitizeRadioAttempt(req.body || {}, SCENARIO_IDS))); }
    catch (err) { fail(res, err); }
  });

  // AI coach usage ledger (read-only to the browser; written server-side by the future coach).
  app.get('/api/cockpit/usage', requireStudent, async (req, res) => {
    const month = /^\d{4}-\d{2}$/.test(String(req.query.month || '')) ? String(req.query.month) : undefined;
    res.json(await data.store.usage(req.student.id, { month }));
  });

  const htmlPage = (handler) => async (req, res) => {
    try {
      const ctx = await loadContext(req);
      res.type('html').send(handler(escapeHtml, ctx));
    } catch (err) {
      console.error('[cockpit]', err);
      res
        .status(500)
        .type('html')
        .send(`<!doctype html><title>Cockpit error</title><pre>${escapeHtml(String(err.message || err))}</pre>`);
    }
  };

  app.get('/cockpit', async (req, res) => {
    try {
      const ctx = await loadContext(req);
      res.type('html').send(
        renderCockpitPage(ctx.cr, escapeHtml, {
          entries: ctx.entries,
          demo: ctx.demo,
          weather: ctx.weather,
          briefing: ctx.briefing,
          user: ctx.user,
          settings: ctx.settings,
        })
      );
    } catch (err) {
      console.error('[cockpit]', err);
      res
        .status(500)
        .type('html')
        .send(`<!doctype html><title>Cockpit error</title><pre>${escapeHtml(String(err.message || err))}</pre>`);
    }
  });

  registerExaminerRoutes(app, { data, loadContext, escapeHtml, renderPage: renderExaminerPage, ...examiner });

  app.get('/cockpit/flight-plan', htmlPage((esc, ctx) => renderFlightPlanPage(esc, ctx)));
  app.get('/cockpit/logbook', htmlPage((esc, ctx) => renderLogbookPage(esc, ctx)));
  app.get('/cockpit/training', htmlPage((esc, ctx) => renderTrainingPage(esc, ctx)));
  app.get('/cockpit/acs', htmlPage((esc, ctx) => renderAcsPage(esc, ctx)));
  app.get('/cockpit/resources', htmlPage((esc, ctx) => renderResourcesPage(esc, ctx)));
  app.get('/cockpit/radio', async (req, res) => {
    try {
      const ctx = await loadContext(req);
      const station = ctx.weather?.station?.lat != null ? ctx.weather.station : null;
      // Open data is cached server-side; never hold the page more than ~4 s for a cold fetch
      // (the fetch keeps running and fills the cache for the next load).
      const pending = getRadioAirportData(station, null, { dataDir }).catch(() => null);
      const airportData = await Promise.race([pending, new Promise((r) => setTimeout(() => r(null), 4000))]);
      res.type('html').send(renderRadioPage(escapeHtml, { ...ctx, airportData }));
    } catch (err) {
      console.error('[cockpit]', err);
      res.status(500).type('html').send(`<!doctype html><title>Cockpit error</title><pre>${escapeHtml(String(err.message || err))}</pre>`);
    }
  });
  app.get('/cockpit/settings', htmlPage((esc, ctx) =>
    renderSettingsPage(esc, { ...ctx, rates: ctx.crStore?.rates })));

  app.get('/cockpit/replay', async (req, res) => {
    try {
      const ctx = await loadContext(req);
      const track = ctx.demo
        ? buildSampleKapaTrack()
        : (req.query.entry && ENTRY_ID_RE.test(String(req.query.entry)) && (await data.tracks(req.student))[String(req.query.entry)]) || buildSampleKapaTrack();
      // Non-demo without a stored track still shows SAMPLE track clearly labeled
      if (!ctx.demo && track?.sample) {
        /* keep sample flag */
      }
      const mission = buildMissionMap(ctx.entries, { testDate: ctx.cr?.testDate, cr: ctx.cr });
      const wxForCall = ctx.demo
        ? {
            ...ctx.weather,
            goNoGo: { decision: 'GO', reasons: ['SAMPLE: VFR mins met'], advisory: ctx.weather?.goNoGo?.advisory },
            metar: {
              ...(ctx.weather?.metar || {}),
              windDir: 70,
              windSpeed: 12,
              visibilitySm: 10,
              ceilingFt: 7500,
            },
            bestCrosswind: { runway: '17L', crosswindKt: 10 },
          }
        : ctx.weather;
      const call = todaysCall(wxForCall, ctx.cr, ctx.settings?.limits);
      call.booking = bookingAction(ctx.settings, { demo: ctx.demo });
      const strip = acsSkillStrip(ctx.cr?.acs);
      res.type('html').send(
        renderReplayPage(escapeHtml, {
          demo: ctx.demo || !!track.sample,
          user: ctx.user,
          track,
          mission,
          call,
          acsStrip: strip,
          cr: ctx.cr,
          settings: ctx.settings,
          station: ctx.weather?.station || null,
        })
      );
    } catch (err) {
      console.error('[replay]', err);
      res.status(500).type('html').send(`<!doctype html><title>Replay error</title><pre>${escapeHtml(String(err.message || err))}</pre>`);
    }
  });

  app.get('/api/cockpit/tracks/sample', (_req, res) => {
    res.json(buildSampleKapaTrack());
  });

  app.post('/api/cockpit/tracks/parse', (req, res) => {
    try {
      const text = req.body?.text || '';
      const filename = req.body?.filename || '';
      const parsed = parseTrack(text, filename);
      const events = detectEvents(parsed.points);
      res.json({ format: parsed.format, pointCount: parsed.points.length, events, points: parsed.points.slice(0, 5) });
    } catch (err) {
      res.status(400).json({ error: String(err.message || err) });
    }
  });

  app.get('/api/cockpit/tracks/:entryId', requireStudent, async (req, res) => {
    if (!ENTRY_ID_RE.test(req.params.entryId)) return fail(res, 'invalid entry id');
    const track = (await data.tracks(req.student))[req.params.entryId];
    if (!track) return res.status(404).json({ error: 'no track' });
    res.json(track);
  });

  app.post('/api/cockpit/tracks/:entryId', requireStudent, async (req, res) => {
    try {
      if (!ENTRY_ID_RE.test(req.params.entryId) || req.params.entryId === 'parse') throw new Error('invalid entry id');
      const body = req.body || {};
      const text = body.text || body.gpx || body.csv || '';
      const filename = body.filename || body.name || '';
      if (!text) return res.status(400).json({ error: 'missing track text' });
      if (typeof text !== 'string' || text.length > 5_000_000) throw new Error('track text too large');
      const track = buildTrack(req.params.entryId, text, filename);
      const all = await data.tracks(req.student);
      all[req.params.entryId] = track;
      if (Object.keys(all).length > 500) throw new Error('too many stored tracks');
      await data.saveTracks(req.student, all);
      res.status(201).json({ id: track.id, entryId: track.entryId, stats: track.stats, events: track.events, format: track.format });
    } catch (err) {
      res.status(400).json({ error: String(err.message || err) });
    }
  });

}
