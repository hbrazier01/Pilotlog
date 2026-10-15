/**
 * Cockpit Dashboard routes.
 *   GET  /cockpit (+ pages)   glass-cockpit UI (?demo=1 for SAMPLE)
 *   GET  /api/weather/kapa    Live METAR+TAF + go/no-go
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
import { getKapaWeather } from './lib/weather/fetch.mjs';
import { parseTileParams, terrariumUrl } from './lib/weather/terrain.mjs';
import { createCheckrideStore } from './checkrideRoutes.mjs';

const SAMPLE_USER = {
  name: 'JORDAN P.',
  role: 'PRIVATE PILOT STUDENT',
  initials: 'JP',
  sample: true,
};

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
      const weather = await getKapaWeather({ demo: true });
      const briefing = instructorBriefing(cr);
      return { demo: true, entries: d.entries, cr, weather, briefing, user: SAMPLE_USER };
    }
    const entries = cockpitEntries();
    const cr = state(undefined, entries);
    const weather = await getKapaWeather({ demo: false });
    const briefing = instructorBriefing(cr);
    return { demo: false, entries, cr, weather, briefing, user: SAMPLE_USER };
  }

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
}
