/**
 * Checkride Tracker (v0.2) — combines §61.109(a) readiness, endorsements,
 * ACS task status, and costs. Pure; storage lives in checkrideStore.mjs.
 */
import { evaluate61109a } from './requirements.mjs';
import { buildEndorsementChecklist } from './endorsements.mjs';
import { buildAcsChecklist } from './acs.mjs';
import { computeCosts, DEFAULT_RATES } from './costs.mjs';

export const EMPTY_STORE = () => ({ version: 1, rates: { ...DEFAULT_RATES }, testDate: null, endorsements: {}, acs: {}, flights: {} });

export function mergeFlightDetails(entries, flights = {}) {
  return entries.map(e => (e && e.id && flights[e.id] ? { ...e, ...flights[e.id] } : e));
}

export function computeCheckride(entries, store, { asOf } = {}) {
  const s = { ...EMPTY_STORE(), ...(store || {}) };
  const merged = mergeFlightDetails(entries || [], s.flights);
  const readiness = evaluate61109a(merged, { asOf, testDate: s.testDate || undefined });
  const endorsements = buildEndorsementChecklist(s.endorsements);
  const acs = buildAcsChecklist(s.acs);
  const costs = computeCosts(merged, readiness.requirements, s.rates);
  return { readiness, endorsements, acs, costs, testDate: s.testDate, flightDetails: s.flights };
}

export * from './requirements.mjs';
export * from './endorsements.mjs';
export * from './acs.mjs';
export * from './costs.mjs';
