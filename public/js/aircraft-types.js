/**
 * Aircraft type catalog (pure; shared by server + browser).
 * type id → 3D model family. Unknown/empty → generic low-wing.
 */
export const AIRCRAFT_TYPES = Object.freeze([
  { id: 'c172', label: 'Cessna 172', family: 'cessna-high', scale: 1.0 },
  { id: 'c152', label: 'Cessna 152', family: 'cessna-high', scale: 0.88 },
  { id: 'pa28', label: 'Piper PA-28 Warrior/Archer', family: 'piper-low', scale: 1.0 },
  { id: 'da40', label: 'Diamond DA40', family: 'diamond-t', scale: 1.0 },
  { id: 'da20', label: 'Diamond DA20', family: 'diamond-t', scale: 0.85 },
  { id: 'sr20', label: 'Cirrus SR20', family: 'cirrus-low', scale: 1.0 },
  { id: 'other', label: 'Other', family: 'generic-low', scale: 1.0 },
]);
export const AIRCRAFT_TYPE_IDS = Object.freeze(AIRCRAFT_TYPES.map((t) => t.id));
export const MODEL_FAMILIES = Object.freeze(['cessna-high', 'piper-low', 'diamond-t', 'cirrus-low', 'generic-low']);

/** Normalize loose input ("C-172", "PA28", "Archer", "DA-40") to a type id; '' if blank, 'other' if unknown. */
export function normalizeAircraftType(raw) {
  const s = String(raw ?? '').trim().toLowerCase().replace(/[\s_-]+/g, '');
  if (!s) return '';
  if (AIRCRAFT_TYPE_IDS.includes(s)) return s;
  if (/^c?172|skyhawk/.test(s)) return 'c172';
  if (/^c?152|^c?150/.test(s)) return 'c152';
  if (/^pa28|warrior|archer|cherokee/.test(s)) return 'pa28';
  if (/^da40|diamondstar/.test(s)) return 'da40';
  if (/^da20|katana|eclipse/.test(s)) return 'da20';
  if (/^sr2[02]|cirrus/.test(s)) return 'sr20';
  return 'other';
}

/** type id (or loose string) → { id, label, family, scale } — always returns a model. */
export function aircraftModelFor(type) {
  const id = normalizeAircraftType(type) || 'other';
  return { ...(AIRCRAFT_TYPES.find((t) => t.id === id) || AIRCRAFT_TYPES[AIRCRAFT_TYPES.length - 1]) };
}
