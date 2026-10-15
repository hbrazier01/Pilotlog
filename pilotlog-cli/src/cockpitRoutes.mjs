/**
 * Cockpit Dashboard routes.
 *   GET /cockpit              HTML dashboard (?demo=1 for sample data)
 *   GET /api/weather/kapa     Live METAR+TAF + go/no-go (?demo=1 for sample)
 */
import { renderCockpitPage } from './cockpitView.mjs';
import { computeCheckride } from './lib/checkride/index.mjs';
import { demoData } from './lib/checkride/insights.mjs';
import { getKapaWeather } from './lib/weather/fetch.mjs';
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
