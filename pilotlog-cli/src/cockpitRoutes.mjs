/**
 * Cockpit Dashboard routes.
 *   GET  /cockpit (+ pages)   glass-cockpit UI (?demo=1 for SAMPLE)
 *   GET  /api/weather         Live METAR+TAF + go/no-go for the user's home airport
 *   GET  /api/weather/kapa    (compat) KAPA weather
 *   GET  /cockpit/radio       Radio Practice (simulated tower; training only)
 *   GET  /cockpit/settings    Settings UI;  GET/PUT /api/cockpit/settings
 *   CRUD /api/cockpit/entries File-backed logbook (no wallet gate)
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
import {
  readCockpitEntries,
  createEntry,
  updateEntry,
  deleteEntry,
} from './lib/cockpit/entries.mjs';
import { computeCheckride } from './lib/checkride/index.mjs';
import { demoData } from './lib/checkride/insights.mjs';
import { getKapaWeather, getStationWeather } from './lib/weather/fetch.mjs';
import { settingsFor, writeSettings, bookingAction, sanitizeSettings, readSettings } from './lib/cockpit/settings.mjs';
import { renderSettingsPage } from './lib/cockpit/settingsPage.mjs';
import { renderRadioPage } from './lib/cockpit/radioPage.mjs';
import { getRadioAirportData } from './lib/airport/airportData.mjs';
import { parseTileParams, terrariumUrl } from './lib/weather/terrain.mjs';
import { imageryEnabled, fetchImageryTile, imageryAttribution } from './lib/weather/imagery.mjs';
import { createCheckrideStore } from './checkrideRoutes.mjs';
import { cockpitUser, DEMO_USER } from './lib/cockpit/profile.mjs';
import { renderReplayPage } from './replayView.mjs';
import { buildSampleKapaTrack } from './lib/replay/sampleTrack.mjs';
import { buildMissionMap } from './lib/replay/missionMap.mjs';
import { todaysCall } from './lib/replay/todaysCall.mjs';
import { acsSkillStrip } from './lib/replay/acsStrip.mjs';
import { getTrack, saveTrackForEntry, readTracks } from './lib/replay/tracks.mjs';
import { parseTrack } from './lib/replay/parse.mjs';
import { detectEvents } from './lib/replay/events.mjs';

export function registerCockpitRoutes(app, { dataDir, readEntries, escapeHtml, pg = null }) {
  const store = createCheckrideStore(dataDir, pg);

  /** Prefer file-backed cockpit entries so readiness works without a wallet. */
  function cockpitEntries() {
    const file = readCockpitEntries(dataDir);
    if (file.length) return file;
    try {
      const gated = typeof readEntries === 'function' ? readEntries() : [];
      return Array.isArray(gated) ? gated : [];
    } catch {
      return [];
    }
  }

  function state(asOf, entries) {
    return computeCheckride(entries ?? cockpitEntries(), store.read(), { asOf });
  }

  async function loadContext(req) {
    const demo = req.query.demo === '1';
    if (demo) {
      const d = demoData();
      const cr = computeCheckride(d.entries, d.store);
      const weather = await getStationWeather({ demo: true });
      const settings = settingsFor({ demo: true });
      const briefing = instructorBriefing(cr, { instructorName: settings.instructorName });
      return { demo: true, entries: d.entries, cr, weather, briefing, user: DEMO_USER, settings };
    }
    const entries = cockpitEntries();
    const cr = state(undefined, entries);
    const settings = settingsFor({ demo: false, dataDir });
    const weather = await getStationWeather({ icao: settings.homeAirport, force: req.query.refresh === '1' });
    const briefing = instructorBriefing(cr, { instructorName: settings.instructorName });
    return { demo: false, entries, cr, weather, briefing, user: cockpitUser({ demo: false, dataDir }), settings };
  }

  app.get('/api/weather', async (req, res) => {
    const demo = req.query.demo === '1';
    const icao = demo ? '' : settingsFor({ dataDir }).homeAirport;
    res.json(await getStationWeather({ icao, demo, force: req.query.refresh === '1' }));
  });

  app.get('/api/cockpit/settings', (req, res) => {
    const demo = req.query.demo === '1';
    res.json({ demo, settings: settingsFor({ demo, dataDir }), rates: demo ? demoData().store.rates : store.read().rates });
  });

  app.put('/api/cockpit/settings', (req, res) => {
    try {
      const body = req.body || {};
      // Validate everything first so a bad field never half-saves.
      const next = sanitizeSettings(body, readSettings(dataDir));
      let rates = null;
      if (body.rates && (body.rates.aircraftRate !== undefined || body.rates.instructorRate !== undefined)) {
        const cur = store.read();
        const a = body.rates.aircraftRate ?? cur.rates?.aircraftRate;
        const i = body.rates.instructorRate ?? cur.rates?.instructorRate;
        if (!(Number(a) >= 0 && Number(a) < 10000) || !(Number(i) >= 0 && Number(i) < 10000)) throw new Error('rates must be numbers between 0 and 10000');
        rates = { aircraftRate: Number(a), instructorRate: Number(i), aircraftLabel: next.aircraftLabel || cur.rates?.aircraftLabel || '' };
        cur.rates = rates;
        store.write(cur);
      }
      const saved = writeSettings(dataDir, next);
      res.json({ ok: true, settings: saved, rates });
    } catch (err) {
      res.status(400).json({ ok: false, error: String(err.message || err) });
    }
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

  app.get('/api/cockpit/entries', (req, res) => {
    if (req.query.demo === '1') {
      return res.json({ demo: true, entries: demoData().entries });
    }
    res.json({ demo: false, entries: cockpitEntries() });
  });

  app.post('/api/cockpit/entries', (req, res) => {
    try {
      const entry = createEntry(dataDir, req.body || {});
      res.status(201).json(entry);
    } catch (err) {
      res.status(400).json({ error: String(err.message || err) });
    }
  });

  app.put('/api/cockpit/entries/:id', (req, res) => {
    try {
      const entry = updateEntry(dataDir, req.params.id, req.body || {});
      res.json(entry);
    } catch (err) {
      res.status(err.message === 'unknown entry' ? 404 : 400).json({ error: String(err.message || err) });
    }
  });

  app.delete('/api/cockpit/entries/:id', (req, res) => {
    try {
      res.json(deleteEntry(dataDir, req.params.id));
    } catch (err) {
      res.status(err.message === 'unknown entry' ? 404 : 400).json({ error: String(err.message || err) });
    }
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
    renderSettingsPage(esc, { ...ctx, rates: ctx.demo ? demoData().store.rates : store.read().rates })));

  app.get('/cockpit/replay', async (req, res) => {
    try {
      const ctx = await loadContext(req);
      const track = ctx.demo
        ? buildSampleKapaTrack()
        : (req.query.entry && getTrack(dataDir, String(req.query.entry))) || buildSampleKapaTrack();
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

  app.get('/api/cockpit/tracks/:entryId', (req, res) => {
    const track = getTrack(dataDir, req.params.entryId);
    if (!track) return res.status(404).json({ error: 'no track' });
    res.json(track);
  });

  app.post('/api/cockpit/tracks/:entryId', (req, res) => {
    try {
      const body = req.body || {};
      const text = body.text || body.gpx || body.csv || '';
      const filename = body.filename || body.name || '';
      if (!text) return res.status(400).json({ error: 'missing track text' });
      const track = saveTrackForEntry(dataDir, req.params.entryId, text, filename);
      res.status(201).json({ id: track.id, entryId: track.entryId, stats: track.stats, events: track.events, format: track.format });
    } catch (err) {
      res.status(400).json({ error: String(err.message || err) });
    }
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
}
