/**
 * Cockpit Dashboard routes.
 *   GET /cockpit              HTML dashboard (?demo=1 for sample data)
 *   GET /api/weather/kapa     Live METAR+TAF + go/no-go (?demo=1 for sample)
 */
import { renderCockpitPage } from './cockpitView.mjs';
import { computeCheckride } from './lib/checkride/index.mjs';
import { demoData } from './lib/checkride/insights.mjs';
import { getKapaWeather } from './lib/weather/fetch.mjs';
import { parseTileParams, terrariumUrl } from './lib/weather/terrain.mjs';
import { createCheckrideStore } from './checkrideRoutes.mjs';

export function registerCockpitRoutes(app, { dataDir, readEntries, escapeHtml, pg = null }) {
  const store = createCheckrideStore(dataDir, pg);
  const state = (asOf) => computeCheckride(readEntries(), store.read(), { asOf });

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
        goNoGo: { decision: 'UNKNOWN', reasons: ['Weather fetch failed'], advisory: 'Get an official briefing before flight.' },
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
    } catch (err) {
      res.status(502).send('tile error');
    }
  });

  app.get('/cockpit', async (req, res) => {
    const demo = req.query.demo === '1';
    try {
      let cr, entries, weather;
      if (demo) {
        const d = demoData();
        entries = d.entries;
        cr = computeCheckride(d.entries, d.store);
        weather = await getKapaWeather({ demo: true });
      } else {
        entries = readEntries();
        cr = state();
        weather = await getKapaWeather({ demo: false });
      }
      res.type('html').send(renderCockpitPage(cr, escapeHtml, { entries, demo, weather }));
    } catch (err) {
      console.error('[cockpit]', err);
      res.status(500).type('html').send(`<!doctype html><title>Cockpit error</title><pre>${escapeHtml(String(err.message || err))}</pre>`);
    }
  });
}
