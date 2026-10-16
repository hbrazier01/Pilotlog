/**
 * Student-pilot endorsement checklist (PPL ASEL, Part 61).
 * Text references follow AC 61-65 (current revision); the CFI must still write
 * the exact endorsement in the logbook — PilotLog only tracks that it exists.
 */
export const ENDORSEMENT_CATALOG = [
  { key: 'preSoloKnowledge', group: 'Pre-solo', label: 'Pre-solo aeronautical knowledge test', regulation: '14 CFR §61.87(b)' },
  { key: 'preSoloFlightTraining', group: 'Pre-solo', label: 'Pre-solo flight training', regulation: '14 CFR §61.87(c)(1)–(2)' },
  { key: 'soloFlight', group: 'Pre-solo', label: 'Solo flight (first 90-day period)', regulation: '14 CFR §61.87(n)' },
  { key: 'soloOtherAirport', group: 'Solo', label: 'Solo takeoffs/landings at another airport within 25 NM', regulation: '14 CFR §61.93(b)(1)' },
  { key: 'soloXCTraining', group: 'Solo cross-country', label: 'Solo cross-country flight training', regulation: '14 CFR §61.93(c)(1)' },
  { key: 'soloXCEachFlight', group: 'Solo cross-country', label: 'Solo cross-country flight (each flight)', regulation: '14 CFR §61.93(c)(2)' },
  { key: 'knowledgeTest', group: 'Knowledge test', label: 'Private pilot knowledge test (PAR)', regulation: '14 CFR §61.35(a)(1), §61.103(d), §61.105' },
  { key: 'practicalTest', group: 'Practical test', label: 'Practical test (flight proficiency & aeronautical experience)', regulation: '14 CFR §61.39(a)(6)(i)–(ii), §61.103(f), §61.107(b), §61.109' },
  { key: 'practicalTestDeficiency', group: 'Practical test', label: 'Review of knowledge-test deficiencies', regulation: '14 CFR §61.39(a)(6)(iii)' },
];

/** Merge stored endorsements { key: { date, cfiName, cfiCert, notes } } with the catalog. */
export function buildEndorsementChecklist(stored = {}) {
  return ENDORSEMENT_CATALOG.map(c => {
    const s = stored[c.key] || {};
    const obtained = Boolean(s.date);
    return { ...c, obtained, date: s.date || null, cfiName: s.cfiName || '', cfiCert: s.cfiCert || '', notes: s.notes || '' };
  });
}

export function sanitizeEndorsement(input = {}) {
  const str = (v, max) => String(v ?? '').trim().slice(0, max);
  const date = str(input.date, 10);
  if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('date must be YYYY-MM-DD');
  return { date: date || null, cfiName: str(input.cfiName, 80), cfiCert: str(input.cfiCert, 20), notes: str(input.notes, 200) };
}
