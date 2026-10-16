/**
 * Derived "cockpit" insights for the Checkride view: readiness %, projected
 * checkride date, flight-path milestones, next-lesson focus, and a demo seed.
 * Pure functions — no I/O.
 */
const r1 = (v) => Math.round(v * 10) / 10;
const DAY = 86400000;

export function readinessScore(cr) {
  const reqs = Object.values(cr.readiness.requirements);
  const req = reqs.length ? reqs.reduce((a, r) => a + (r.pct || 0), 0) / reqs.length / 100 : 0;
  const t = cr.acs.total || 1;
  const acs = (cr.acs.counts.proficient + 0.4 * cr.acs.counts.introduced) / t;
  const end = cr.endorsements.length ? cr.endorsements.filter(e => e.obtained).length / cr.endorsements.length : 0;
  const spent = cr.costs.toDate, total = spent + cr.costs.projection.total;
  const budget = total > 0 ? spent / total : 0;
  return { req, acs, end, budget, pct: Math.round((0.55 * req + 0.3 * acs + 0.15 * end) * 100) };
}

/** Lessons/week from logged history (last 8 weeks, fallback all-time), and projected date. */
export function projectCheckride(cr, entries = [], asOf = new Date()) {
  const dates = entries.map(e => e.date).filter(Boolean).sort();
  const now = new Date(asOf).getTime();
  let perWeek = 0;
  if (dates.length) {
    const recent = dates.filter(d => now - new Date(d).getTime() <= 56 * DAY);
    if (recent.length >= 2) perWeek = recent.length / 8;
    else {
      const span = Math.max(7, (now - new Date(dates[0]).getTime()) / DAY);
      perWeek = dates.length / (span / 7);
    }
  }
  perWeek = r1(perWeek);
  const lessons = cr.costs.projection.estimatedLessons;
  if (!perWeek || !lessons) return { perWeek, lessons, date: null, weeks: null };
  const weeks = Math.ceil(lessons / perWeek);
  return { perWeek, lessons, weeks, date: new Date(now + weeks * 7 * DAY).toISOString().slice(0, 10) };
}

export function flightPath(cr, entries = []) {
  const q = cr.readiness.requirements, en = Object.fromEntries(cr.endorsements.map(e => [e.key, e]));
  const anySolo = entries.some(e => Number(e.solo) > 0) || !!en.soloFlight?.obtained;
  const pts = [
    { key: 'first', label: 'First Flight', done: entries.length > 0 },
    { key: 'solo', label: 'Solo', done: anySolo },
    { key: 'soloxc', label: 'Solo XC', done: !!(q.soloXC?.met && q.longSoloXC?.met) },
    { key: 'written', label: 'Knowledge Test', done: !!en.knowledgeTest?.obtained },
    { key: 'prep', label: 'Checkride Prep', done: !!q.checkridePrep?.met },
    { key: 'ride', label: 'Checkride', done: false },
  ];
  let current = pts.findIndex(p => !p.done);
  if (current < 0) current = pts.length - 1;
  return { points: pts, current };
}

const FOCUS_HINT = {
  soloTime: 'Build solo time — pattern work to stay sharp',
  dualXC: 'Dual cross-country: plan a 50+ NM route with a full stop',
  nightTraining: 'Night training block — schedule after sunset',
  instrument: 'Hood work: straight-and-level, climbs, turns by reference',
  nightFullStops: 'Night full-stop landings',
  soloTowerOps: 'Towered full-stops (any Class B/C/D field)',
};

/** 2–3 focus items: in-progress ACS tasks first, then the next untouched task, then a top hour deficit. */
export function nextLesson(cr) {
  const tasks = cr.acs.areas.flatMap(a => a.tasks.map(t => ({ ...t, area: a.area, areaTitle: a.title })));
  const items = [];
  for (const t of tasks.filter(t => t.status === 'introduced').slice(0, 2))
    items.push({ kind: 'ACS', code: t.id, text: `${t.title}`, sub: 'Introduced → take it to proficient' });
  const fresh = tasks.find(t => t.status === 'not_started' && !['I', 'XII'].includes(t.area));
  if (fresh && items.length < 2) items.push({ kind: 'ACS', code: fresh.id, text: fresh.title, sub: `New: ${fresh.areaTitle}` });
  const def = Object.values(cr.readiness.requirements).filter(r => !r.met && FOCUS_HINT[r.key]);
  if (def[0]) items.push({ kind: 'HRS', code: def[0].regulation.replace('14 CFR ', ''), text: FOCUS_HINT[def[0].key], sub: `${def[0].deficit}${def[0].unit === 'hours' ? ' hrs' : ''} still needed` });
  return items.slice(0, 3);
}

export function briefText(items, { name = '' } = {}) {
  name = String(name || '').trim() || 'there';
  if (!items.length) return `Hi ${name}, for my next lesson I'd like to work toward checkride prep.`;
  return `Hi ${name}! For my next lesson I'd like to focus on: ` +
    items.map((i, n) => `${n + 1}) ${i.text}`).join('; ') + '. Thanks!';
}

/** Demo seed (never persisted): coherent Solo → XC progression, ~20 hrs, ~$4k spent. */
export function demoData(asOf = new Date()) {
  const base = new Date(asOf);
  const day = (ago) => new Date(base.getTime() - ago * DAY).toISOString().slice(0, 10);
  // Chronological dual → first solo → more solo → dual XC (short) → dual. No night yet.
  // Totals ~19.5 hrs; solo ~3.2 hrs; first solo after ~14 dual hrs.
  const raw = [
    { ago: 68, h: 1.4, dual: 1.4 },
    { ago: 64, h: 1.3, dual: 1.3 },
    { ago: 60, h: 1.5, dual: 1.5, instrument: 0.4 },
    { ago: 55, h: 1.2, dual: 1.2 },
    { ago: 50, h: 1.4, dual: 1.4 },
    { ago: 45, h: 1.3, dual: 1.3 },
    { ago: 40, h: 1.5, dual: 1.5, instrument: 0.4 },
    { ago: 35, h: 1.2, dual: 1.2 },
    { ago: 30, h: 1.4, dual: 1.4 },
    { ago: 26, h: 1.3, dual: 1.3 },
    // first solo (~14.5 hrs total)
    { ago: 22, h: 1.2, solo: 1.2, tower: 3 },
    { ago: 18, h: 1.0, solo: 1.0 },
    { ago: 14, h: 1.0, solo: 1.0 },
    // dual XC after solo (does not meet long solo XC — keeps flightPath on soloxc)
    { ago: 10, h: 1.6, dual: 1.6, xc: 1.6, to: 'KCOS', nm: 52 },
    { ago: 5, h: 1.2, dual: 1.2 },
  ];
  const entries = raw.map((r, i) => ({
    id: `demo${i}`,
    date: day(r.ago),
    from: 'KAPA',
    to: r.to || 'KAPA',
    totalTime: r.h,
    dual: r.dual || 0,
    solo: r.solo || 0,
    xc: r.xc || 0,
    simulatedInstrument: r.instrument || 0,
    xcDistanceNm: r.nm || 0,
    towerFullStops: r.tower || 0,
  }));
  const soloEntry = entries.find(e => e.solo > 0);
  const p = (s) => ({ status: s });
  const store = {
    rates: { aircraftRate: 145, instructorRate: 60, aircraftLabel: 'DA40' },
    endorsements: {
      preSoloKnowledge: { date: day(28), cfiName: 'Alex (sample CFI)' },
      preSoloFlightTraining: { date: day(23), cfiName: 'Alex (sample CFI)' },
      soloFlight: { date: soloEntry.date, cfiName: 'Alex (sample CFI)' },
    },
    acs: {
      'PA.II.A': p('proficient'), 'PA.II.C': p('proficient'), 'PA.II.D': p('proficient'), 'PA.II.F': p('proficient'),
      'PA.IV.A': p('proficient'), 'PA.IV.B': p('proficient'), 'PA.IV.C': p('introduced'), 'PA.IV.D': p('introduced'),
      'PA.V.A': p('introduced'), 'PA.VII.A': p('introduced'), 'PA.III.A': p('proficient'), 'PA.I.C': p('introduced'),
    },
    flights: {}, testDate: null,
  };
  return { entries, store };
}
