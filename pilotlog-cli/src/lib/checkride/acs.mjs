/**
 * Private Pilot — Airplane ACS (FAA-S-ACS-6C), ASEL tasks only.
 * Seaplane and multiengine-only tasks are omitted; Area X (Multiengine
 * Operations) does not apply to ASEL and has no tasks here.
 */
export const ACS_STATUSES = ['not_started', 'introduced', 'proficient'];

export const PPL_ASEL_ACS = [
  { area: 'I', title: 'Preflight Preparation', tasks: [
    ['A', 'Pilot Qualifications'], ['B', 'Airworthiness Requirements'], ['C', 'Weather Information'],
    ['D', 'Cross-Country Flight Planning'], ['E', 'National Airspace System'], ['F', 'Performance and Limitations'],
    ['G', 'Operation of Systems'], ['H', 'Human Factors']] },
  { area: 'II', title: 'Preflight Procedures', tasks: [
    ['A', 'Preflight Assessment'], ['B', 'Flight Deck Management'], ['C', 'Engine Starting'], ['D', 'Taxiing'], ['F', 'Before Takeoff Check']] },
  { area: 'III', title: 'Airport and Seaplane Base Operations', tasks: [
    ['A', 'Communications, Light Signals, and Runway Lighting Systems'], ['B', 'Traffic Patterns']] },
  { area: 'IV', title: 'Takeoffs, Landings, and Go-Arounds', tasks: [
    ['A', 'Normal Takeoff and Climb'], ['B', 'Normal Approach and Landing'], ['C', 'Soft-Field Takeoff and Climb'],
    ['D', 'Soft-Field Approach and Landing'], ['E', 'Short-Field Takeoff and Maximum Performance Climb'],
    ['F', 'Short-Field Approach and Landing'], ['M', 'Forward Slip to a Landing'], ['N', 'Go-Around/Rejected Landing']] },
  { area: 'V', title: 'Performance and Ground Reference Maneuvers', tasks: [['A', 'Steep Turns'], ['B', 'Ground Reference Maneuvers']] },
  { area: 'VI', title: 'Navigation', tasks: [
    ['A', 'Pilotage and Dead Reckoning'], ['B', 'Navigation Systems and Radar Services'], ['C', 'Diversion'], ['D', 'Lost Procedures']] },
  { area: 'VII', title: 'Slow Flight and Stalls', tasks: [
    ['A', 'Maneuvering During Slow Flight'], ['B', 'Power-Off Stalls'], ['C', 'Power-On Stalls'], ['D', 'Spin Awareness']] },
  { area: 'VIII', title: 'Basic Instrument Maneuvers', tasks: [
    ['A', 'Straight-and-Level Flight'], ['B', 'Constant Airspeed Climbs'], ['C', 'Constant Airspeed Descents'],
    ['D', 'Turns to Headings'], ['E', 'Recovery from Unusual Flight Attitudes'],
    ['F', 'Radio Communications, Navigation Systems/Facilities, and Radar Services']] },
  { area: 'IX', title: 'Emergency Operations', tasks: [
    ['A', 'Emergency Descent'], ['B', 'Emergency Approach and Landing (Simulated)'],
    ['C', 'Systems and Equipment Malfunctions'], ['D', 'Emergency Equipment and Survival Gear']] },
  { area: 'X', title: 'Multiengine Operations (not applicable to ASEL)', tasks: [] },
  { area: 'XI', title: 'Night Operations', tasks: [['A', 'Night Preparation']] },
  { area: 'XII', title: 'Postflight Procedures', tasks: [['A', 'After Landing, Parking and Securing']] },
];

export const acsTaskId = (area, letter) => `PA.${area}.${letter}`;

export function buildAcsChecklist(stored = {}) {
  const counts = { not_started: 0, introduced: 0, proficient: 0 };
  const areas = PPL_ASEL_ACS.map(a => ({
    area: a.area, title: a.title,
    tasks: a.tasks.map(([letter, title]) => {
      const id = acsTaskId(a.area, letter);
      const s = stored[id] || {};
      const status = ACS_STATUSES.includes(s.status) ? s.status : 'not_started';
      counts[status]++;
      return { id, letter, title, status, updatedAt: s.updatedAt || null };
    }),
  }));
  const total = counts.not_started + counts.introduced + counts.proficient;
  return { standard: 'FAA-S-ACS-6C (Private Pilot — Airplane), ASEL', areas, counts, total,
    proficientPct: total ? Math.round((counts.proficient / total) * 100) : 0 };
}

export function isValidAcsTask(id) {
  return PPL_ASEL_ACS.some(a => a.tasks.some(([l]) => acsTaskId(a.area, l) === id));
}
