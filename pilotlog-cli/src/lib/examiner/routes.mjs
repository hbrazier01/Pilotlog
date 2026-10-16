/**
 * AI Examiner routes.
 *   GET  /cockpit/examiner                  page (signed out / ?demo=1 = demo, mock grader, nothing saved)
 *   GET  /api/cockpit/examiner/state        weak areas + monthly allowance
 *   POST /api/cockpit/examiner/question     { area? } -> next ACS question
 *   POST /api/cockpit/examiner/answer       { questionId, answer } -> grade + feedback + ACS ref
 */
import { examinerConfig, mockGrade, gatewayGrade, costUsd, worstCaseUsd, recordResult, areaSummary, pickQuestion, presentQuestion, questionById, emptyRecord, MAX_ANSWER_CHARS } from './engine.mjs';

export const CAP_MESSAGE = "You've used this month's examiner allowance — nice work putting in the reps. It resets on the 1st. Until then, review your weak areas in the ACS tab.";

export function registerExaminerRoutes(app, { data, renderPage, loadContext, escapeHtml, config = null, generateImpl = null }) {
  const cfg = () => config || examinerConfig();
  const inFlight = new Set();
  const isDemo = (req) => req.query.demo === '1' || !req.student;
  const record = async (st) => (await data.store.get(st.id, 'examiner')) || emptyRecord();
  const allowance = async (st) => {
    const u = await data.store.usage(st.id);
    return { month: u.month, usd: u.usd, capUsd: u.capUsd, remainingUsd: u.remainingUsd, overCap: u.overCap || u.remainingUsd < worstCaseUsd(cfg().price) };
  };
  const settingsOf = async (req) => (isDemo(req) ? {} : await data.settings(req.student));

  app.get('/cockpit/examiner', async (req, res) => {
    try {
      const ctx = await loadContext(req);
      const c = cfg();
      res.type('html').send(renderPage(escapeHtml, { ...ctx, settings: isDemo(req) ? { ...ctx.settings, aircraftLabel: '', homeAirport: '' } : ctx.settings, examiner: { mode: isDemo(req) ? 'mock' : c.mode, model: c.model } }));
    } catch (err) {
      console.error('[examiner]', err);
      res.status(500).type('html').send(`<!doctype html><title>Examiner error</title><pre>${escapeHtml(String(err.message || err))}</pre>`);
    }
  });

  app.get('/api/cockpit/examiner/state', async (req, res) => {
    if (isDemo(req)) return res.json({ demo: true, mode: 'mock', areas: areaSummary(null), allowance: null });
    res.json({ demo: false, mode: cfg().mode, model: cfg().model, areas: areaSummary(await record(req.student)), allowance: await allowance(req.student) });
  });

  app.post('/api/cockpit/examiner/question', async (req, res) => {
    const b = req.body || {};
    const rec = isDemo(req) ? null : await record(req.student);
    const exclude = Array.isArray(b.exclude) ? b.exclude.slice(0, 20).map(String) : [];
    const seed = isDemo(req) ? exclude.length : (rec?.history?.length || 0);
    const qn = pickQuestion(rec, { area: String(b.area || ''), exclude, seed });
    res.json({ question: presentQuestion(qn, await settingsOf(req)) });
  });

  app.post('/api/cockpit/examiner/answer', async (req, res) => {
    const b = req.body || {};
    const qn = questionById(String(b.questionId || ''));
    const answer = String(b.answer || '').trim();
    if (!qn) return res.status(400).json({ ok: false, error: 'unknown question' });
    if (!answer) return res.status(400).json({ ok: false, error: 'answer required' });
    if (answer.length > MAX_ANSWER_CHARS) return res.status(400).json({ ok: false, error: `answer too long (max ${MAX_ANSWER_CHARS} characters)` });
    const shown = presentQuestion(qn, await settingsOf(req));
    const base = { acs: qn.acs, task: qn.task, area: qn.area, reference: qn.model };

    if (isDemo(req)) return res.json({ ok: true, demo: true, mode: 'mock', ...base, ...strip(mockGrade(qn, answer)) });

    const st = req.student;
    const c = cfg();
    if (c.mode === 'mock') {
      const g = mockGrade(qn, answer);
      const rec = recordResult(await record(st), qn, g.score);
      await data.store.put(st.id, 'examiner', rec);
      return res.json({ ok: true, mode: 'mock', ...base, ...strip(g), areas: areaSummary(rec), allowance: await allowance(st) });
    }
    if (inFlight.has(st.id)) return res.status(429).json({ ok: false, error: 'One answer at a time — the examiner is still grading.' });
    inFlight.add(st.id);
    try {
      const before = await allowance(st);
      if (before.overCap) return res.status(402).json({ ok: false, capReached: true, error: CAP_MESSAGE, allowance: before });
      let g;
      try { g = await gatewayGrade(qn, shown.text, answer, { model: c.model, generateImpl }); }
      catch (err) {
        console.error('[examiner] gateway', err?.message || err);
        g = { ...mockGrade(qn, answer), fallback: true };
      }
      if (g.usage.inputTokens || g.usage.outputTokens) await data.store.recordUsage(st.id, { ...g.usage, usd: costUsd(g.usage, c.price) });
      const rec = recordResult(await record(st), qn, g.score);
      await data.store.put(st.id, 'examiner', rec);
      res.json({ ok: true, mode: g.fallback ? 'mock' : 'gateway', ...base, ...strip(g), areas: areaSummary(rec), allowance: await allowance(st) });
    } finally { inFlight.delete(st.id); }
  });
}

const strip = ({ usage, ...g }) => g;
