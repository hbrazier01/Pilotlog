/**
 * Cockpit-dashboard helpers: milestone gates (Solo/XC/Night/Checkride),
 * ACS area tiles (mastered / in progress / pending), and logbook timeline.
 * Pure — no I/O. Demo data must come from insights.demoData().
 */
import { flightPath } from './insights.mjs';

const DAY = 86400000;

/** Concept gates: Solo → XC → Night → Checkride. Lit when done. */
export function cockpitGates(cr, entries = []) {
  const q = cr.readiness.requirements || {};
  const en = Object.fromEntries((cr.endorsements || []).map(e => [e.key, e]));
  const anySolo = entries.some(e => Number(e.solo) > 0) || !!en.soloFlight?.obtained;
  const anyXc = entries.some(e => Number(e.xc) > 0) || !!(q.soloXC?.met || q.dualXC?.met);
  const anyNight = entries.some(e => Number(e.night) > 0) || !!(q.nightTraining?.met);
  const gates = [
    { key: 'solo', label: 'Solo', done: anySolo },
    { key: 'xc', label: 'XC', done: anyXc },
    { key: 'night', label: 'Night', done: anyNight },
    { key: 'checkride', label: 'Checkride', done: !!q.checkridePrep?.met && (cr.acs?.proficientPct || 0) >= 90 },
  ];
  let current = gates.findIndex(g => !g.done);
  if (current < 0) current = gates.length - 1;
  return { gates, current, litCount: gates.filter(g => g.done).length };
}

/**
 * Area-of-operation tiles for the bottom ACS strip.
 * mastered = all proficient; in_progress = any introduced/proficient; pending = none started.
 * Skips empty areas (e.g. Area X for ASEL).
 */
export function acsTiles(acs) {
  const areas = (acs?.areas || []).filter(a => a.tasks.length > 0);
  return areas.map(a => {
    const total = a.tasks.length;
    const proficient = a.tasks.filter(t => t.status === 'proficient').length;
    const introduced = a.tasks.filter(t => t.status === 'introduced').length;
    let status = 'pending';
    if (proficient === total) status = 'mastered';
    else if (proficient + introduced > 0) status = 'in_progress';
    return {
      area: a.area,
      title: a.title,
      total,
      proficient,
      introduced,
      status,
      label: status === 'mastered' ? 'MASTERED' : status === 'in_progress' ? 'IN PROGRESS' : 'PENDING',
    };
  });
}

/** Horizontal milestone timeline with cumulative hours at each gate. */
export function logbookTimeline(cr, entries = [], projDate = null) {
  const sorted = [...entries].filter(e => e.date).sort((a, b) => a.date.localeCompare(b.date));
  const cumAt = (pred) => {
    let hrs = 0, date = null;
    for (const e of sorted) {
      hrs += Number(e.totalTime) || 0;
      if (pred(e)) { date = e.date; break; }
    }
    return { hours: Math.round(hrs * 10) / 10, date };
  };
  const solo = cumAt(e => Number(e.solo) > 0);
  const xc = cumAt(e => Number(e.xc) > 0);
  const night = cumAt(e => Number(e.night) > 0);
  const totalHrs = sorted.reduce((s, e) => s + (Number(e.totalTime) || 0), 0);
  const dualHrs = sorted.reduce((s, e) => s + (Number(e.dual) || 0), 0);
  const picHrs = sorted.reduce((s, e) => s + (Number(e.solo) || Number(e.pic) || 0), 0);

  const nodes = [
    { key: 'solo', label: 'SOLO', hours: solo.date ? solo.hours : null, date: solo.date, done: !!solo.date },
    { key: 'xc', label: 'XC', hours: xc.date ? xc.hours : null, date: xc.date, done: !!xc.date },
    { key: 'night', label: 'NIGHT', hours: night.date ? night.hours : null, date: night.date, done: !!night.date },
    {
      key: 'checkride',
      label: 'CHECKRIDE READY',
      hours: 70,
      date: projDate || null,
      done: false,
      target: true,
    },
  ];
  return {
    nodes,
    totals: {
      total: Math.round(totalHrs * 10) / 10,
      dual: Math.round(dualHrs * 10) / 10,
      pic: Math.round(picHrs * 10) / 10,
    },
  };
}

/** Progress bars for the left column (flight / solo / ACS / written). */
export function progressBars(cr) {
  const q = cr.readiness.requirements || {};
  const en = Object.fromEntries((cr.endorsements || []).map(e => [e.key, e]));
  const flight = q.totalTime || { actual: 0, required: 40, pct: 0 };
  const solo = q.soloTime || { actual: 0, required: 10, pct: 0 };
  const acsDone = (cr.acs?.counts?.proficient || 0) + (cr.acs?.counts?.introduced || 0);
  const acsTotal = cr.acs?.total || 1;
  const written = !!en.knowledgeTest?.obtained;
  return [
    {
      key: 'flight',
      label: 'Flight Time',
      actual: flight.actual,
      required: flight.required,
      unit: 'HRS',
      pct: Math.min(100, flight.pct || 0),
    },
    {
      key: 'solo',
      label: 'Solo Time',
      actual: solo.actual,
      required: solo.required,
      unit: 'HRS',
      pct: Math.min(100, solo.pct || 0),
    },
    {
      key: 'acs',
      label: 'ACS Tasks',
      actual: acsDone,
      required: acsTotal,
      unit: '',
      pct: Math.round((acsDone / acsTotal) * 100),
    },
    {
      key: 'written',
      label: 'Written Exam',
      actual: written ? 1 : 0,
      required: 1,
      unit: '',
      pct: written ? 100 : 0,
      pass: written,
    },
  ];
}

export { flightPath };
