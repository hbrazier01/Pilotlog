/**
 * Training cost model: per-flight aircraft + instructor rates, cost to date by
 * phase, and projected remaining cost to the checkride from §61.109(a) deficits.
 */
import { isDual, isSolo, xcHours, totalHours } from './requirements.mjs';

/** Generic placeholder rates until the student sets their own in Settings. */
export const DEFAULT_RATES = { aircraftRate: 180, instructorRate: 65, aircraftLabel: '' };
export const PHASES = ['pre_solo', 'dual', 'solo', 'cross_country', 'night', 'checkride_prep'];
export const PHASE_LABELS = { pre_solo: 'Pre-solo dual', dual: 'Post-solo dual', solo: 'Solo', cross_country: 'Cross-country', night: 'Night', checkride_prep: 'Checkride prep' };

const n = (v) => Number(v) || 0;
const money = (v) => Math.round(v * 100) / 100;

export function flightPhase(e, firstSoloDate) {
  if (PHASES.includes(e.phase)) return e.phase;
  if (e.checkridePrep) return 'checkride_prep';
  if (n(e.night) > 0) return 'night';
  if (xcHours(e) > 0) return 'cross_country';
  if (isSolo(e)) return 'solo';
  if (!firstSoloDate || (e.date && e.date < firstSoloDate)) return 'pre_solo';
  return 'dual';
}

/** Cost of one flight. Instructor is billed for instructorHours (block), defaulting to dual time. */
export function flightCost(e, rates = DEFAULT_RATES) {
  const hrs = totalHours(e);
  const aircraftRate = e.aircraftRate != null && e.aircraftRate !== '' ? n(e.aircraftRate) : n(rates.aircraftRate);
  const instructorRate = e.instructorRate != null && e.instructorRate !== '' ? n(e.instructorRate) : n(rates.instructorRate);
  const instructorHours = e.instructorHours != null && e.instructorHours !== '' ? n(e.instructorHours) : n(e.dual ?? e.dualReceived);
  const aircraft = money(hrs * aircraftRate);
  const instructor = money(instructorHours * instructorRate);
  return { hours: hrs, aircraftRate, instructorRate, instructorHours, aircraft, instructor, total: money(aircraft + instructor) };
}

export function computeCosts(entries, requirements, rates = DEFAULT_RATES) {
  const r = { ...DEFAULT_RATES, ...rates };
  const sorted = [...entries].sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const firstSolo = sorted.find(isSolo)?.date || null;
  const byPhase = Object.fromEntries(PHASES.map(p => [p, { phase: p, label: PHASE_LABELS[p], flights: 0, hours: 0, aircraft: 0, instructor: 0, total: 0 }]));
  const flights = [];
  let toDate = 0, dualLessons = 0, dualFlightHours = 0, dualInstrHours = 0, flightHours = 0;
  for (const e of sorted) {
    const c = flightCost(e, r);
    const phase = flightPhase(e, firstSolo);
    const b = byPhase[phase];
    b.flights++; b.hours += c.hours; b.aircraft += c.aircraft; b.instructor += c.instructor; b.total += c.total;
    toDate += c.total; flightHours += c.hours;
    if (isDual(e)) { dualLessons++; dualFlightHours += c.hours; dualInstrHours += c.instructorHours; }
    flights.push({ id: e.id, date: e.date, route: [e.from, e.to].filter(Boolean).join('→'), phase, ...c });
  }
  for (const b of Object.values(byPhase)) { b.hours = Math.round(b.hours * 10) / 10; b.aircraft = money(b.aircraft); b.instructor = money(b.instructor); b.total = money(b.total); }

  // ── Projection ──
  const def = (k) => requirements[k]?.deficit || 0;
  // Dual-only items are distinct flights in practice; take the larger of the dual
  // total deficit or the sum of its sub-requirements (conservative).
  const remainingDual = Math.max(def('dualReceived'), def('dualXC') + def('nightTraining') + def('instrument') + def('checkridePrep'));
  const remainingSolo = Math.max(def('soloTime'), def('soloXC'));
  const extra = Math.max(0, def('totalTime') - remainingDual - remainingSolo); // filler hours, assumed dual
  const projDual = Math.round((remainingDual + extra) * 10) / 10;
  const projSolo = Math.round(remainingSolo * 10) / 10;
  const avgHoursPerLesson = sorted.length ? flightHours / sorted.length : 1.2;
  const blockFactor = dualFlightHours > 0 ? dualInstrHours / dualFlightHours : 1; // instructor billed hrs per dual flight hr
  const remainingHours = Math.round((projDual + projSolo) * 10) / 10;
  const aircraftCost = money(remainingHours * r.aircraftRate);
  const instructorCost = money(projDual * blockFactor * r.instructorRate);
  return {
    rates: r,
    toDate: money(toDate),
    byPhase: Object.values(byPhase),
    flights,
    projection: {
      remainingDualHours: projDual,
      remainingSoloHours: projSolo,
      remainingHours,
      avgHoursPerLesson: Math.round(avgHoursPerLesson * 100) / 100,
      estimatedLessons: avgHoursPerLesson > 0 ? Math.ceil(remainingHours / avgHoursPerLesson) : 0,
      instructorBlockFactor: Math.round(blockFactor * 100) / 100,
      aircraftCost, instructorCost,
      total: money(aircraftCost + instructorCost),
      projectedTotalToCheckride: money(toDate + aircraftCost + instructorCost),
      basis: 'FAA minimums only (§61.109(a) deficits). Most students need more than the minimums; checkride fees not included.',
    },
  };
}
