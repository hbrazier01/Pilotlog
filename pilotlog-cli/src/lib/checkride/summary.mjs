/**
 * Plain-language "What's left" line generated from §61.109(a) deficits and
 * missing endorsements, e.g.
 *   "You need 3.2 more hrs solo XC, 3 night landings, and 2 endorsements."
 */
const PHRASES = {
  totalTime:      (d) => `${d} more hrs total time`,
  dualReceived:   (d) => `${d} more hrs dual`,
  soloTime:       (d) => `${d} more hrs solo`,
  dualXC:         (d) => `${d} more hrs dual XC`,
  nightTraining:  (d) => `${d} more hrs night training`,
  nightXC:        ()  => 'a night XC over 100 NM',
  nightTakeoffs:  (d) => `${d} night takeoff${d === 1 ? '' : 's'}`,
  nightFullStops: (d) => `${d} night landing${d === 1 ? '' : 's'}`,
  instrument:     (d) => `${d} more hrs instrument`,
  checkridePrep:  (d) => `${d} more hrs checkride prep`,
  soloXC:         (d) => `${d} more hrs solo XC`,
  longSoloXC:     ()  => 'the long solo XC (150 NM, 3 stops)',
  soloTowerOps:   (d) => `${d} solo towered landing${d === 1 ? '' : 's'}`,
};

export function joinList(items) {
  if (items.length <= 1) return items.join('');
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}`;
}

export function whatsLeft(requirements = {}, endorsements = []) {
  const parts = [];
  for (const [key, r] of Object.entries(requirements)) {
    if (r.met || !PHRASES[key]) continue;
    parts.push(PHRASES[key](r.deficit));
  }
  const missing = endorsements.filter(e => !e.obtained).length;
  if (missing) parts.push(`${missing} endorsement${missing === 1 ? '' : 's'}`);
  if (!parts.length) return 'All FAA minimums and endorsements are logged. Time to schedule your checkride.';
  return `You need ${joinList(parts)}.`;
}
