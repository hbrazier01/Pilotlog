/**
 * Today's Call — GO / CAUTION / NO-GO from live weather + student limits + weakest ACS.
 */
import { weakestAcsFocus } from '../cockpit/briefing.mjs';

export const DEFAULT_LIMITS = {
  maxCrosswindKt: 12,
  maxGustKt: 22,
  minCeilingFt: 1500,
  minVisibilitySm: 5,
  maxWindKt: 25,
};

/**
 * @param {object} weather from getStationWeather
 * @param {object} cr checkride state
 * @param {object} limits student settings
 */
export function todaysCall(weather, cr, limits = {}) {
  const L = { ...DEFAULT_LIMITS, ...limits };
  const go = weather?.goNoGo || {};
  const metar = weather?.metar || {};
  const windDir = metar.windDir ?? metar.wdir ?? null;
  const windSpd = metar.windSpeed ?? metar.wspd ?? null;
  const gust = metar.windGust ?? metar.gust ?? null;
  const vis = metar.visibilitySm ?? metar.visib ?? null;
  const ceiling = metar.ceilingFt ?? null;
  // Prefer runway from weather helper if present
  const engineX = weather?.goNoGo?.crosswind;
  const xwind = weather?.bestCrosswind?.crosswindKt ?? weather?.crosswindKt ?? engineX?.kt ?? null;
  const runway = weather?.bestCrosswind?.runway || engineX?.runway || null;

  const chips = {
    wind: windSpd != null ? `${windDir != null ? String(windDir).padStart(3, '0') + '°' : 'VRB'} @ ${windSpd} kts` : '—',
    crosswind: xwind != null ? `${Math.round(Math.abs(xwind))} kts` : '—',
    ceiling: ceiling != null ? `${ceiling.toLocaleString('en-US')} FT AGL` : 'No BKN/OVC',
    visibility: vis != null ? `${vis}+ SM`.replace('++', '+') : '—',
  };
  if (vis != null && vis >= 10) chips.visibility = '10+ SM';

  const reasons = [];
  let decision = 'GO';

  if (vis != null && vis < 3) {
    decision = 'NO-GO';
    reasons.push(`Visibility ${vis} SM below VFR minimum`);
  } else if (vis != null && vis < L.minVisibilitySm) {
    decision = 'CAUTION';
    reasons.push(`Visibility ${vis} SM below your ${L.minVisibilitySm} SM limit`);
  }

  if (ceiling != null && ceiling < 1000) {
    decision = 'NO-GO';
    reasons.push(`Ceiling ${ceiling} FT below VFR`);
  } else if (ceiling != null && ceiling < L.minCeilingFt && decision !== 'NO-GO') {
    decision = 'CAUTION';
    reasons.push(`Ceiling ${ceiling} FT below your ${L.minCeilingFt} FT limit`);
  }

  if (gust != null && gust > L.maxGustKt) {
    decision = decision === 'NO-GO' ? 'NO-GO' : 'CAUTION';
    reasons.push(`Gusts ${gust} kt above your ${L.maxGustKt} kt limit`);
  }
  if (windSpd != null && Number(windSpd) > L.maxWindKt) {
    decision = decision === 'NO-GO' ? 'NO-GO' : 'CAUTION';
    reasons.push(`Wind ${windSpd} kt above your ${L.maxWindKt} kt limit`);
  }
  if (xwind != null && Math.abs(xwind) > L.maxCrosswindKt) {
    decision = decision === 'NO-GO' ? 'NO-GO' : 'CAUTION';
    reasons.push(`Crosswind ${Math.round(Math.abs(xwind))} kt above your ${L.maxCrosswindKt} kt limit`);
  } else if (xwind != null && Math.abs(xwind) > L.maxCrosswindKt - 1 && Math.abs(xwind) <= L.maxCrosswindKt && decision === 'GO') {
    decision = 'CAUTION';
    reasons.push(`Crosswind ${Math.round(Math.abs(xwind))} kt near your limit`);
  }

  // No observation (no home airport set, or feed down): never claim GO.
  const noObs = windSpd == null && vis == null && ceiling == null && !weather?.metar?.raw;
  if (noObs && (go.decision === 'UNKNOWN' || !go.decision)) {
    return {
      decision: 'UNKNOWN',
      suggested: weather?.needsSetup ? 'Set your home airport to get a call' : 'Weather unavailable — get an official briefing',
      chips: { ...chips, ceiling: '—' },
      reasons: go.reasons || [],
      advisory: 'Advisory only — not a substitute for an official weather briefing or CFI judgment.',
      limits: L,
      focus: weakestAcsFocus(cr || { acs: { areas: [] } }, 2),
      needsSetup: !!weather?.needsSetup,
    };
  }

  // Inherit hard NO-GO from weather engine
  if (go.decision === 'NO-GO') decision = 'NO-GO';
  else if (go.decision === 'CAUTION' && decision === 'GO') decision = 'CAUTION';

  const focus = weakestAcsFocus(cr || { acs: { areas: [] } }, 2);
  let suggested = 'Review ACS weak areas on the ground';
  if (decision === 'NO-GO') {
    suggested = 'Stand down — use the time for ground / sim';
  } else if (xwind != null && Math.abs(xwind) >= 5 && Math.abs(xwind) <= L.maxCrosswindKt) {
    suggested = runway ? `Practice crosswind landings on ${runway}` : 'Practice crosswind landings';
  } else if (focus[0]?.text) {
    suggested = `Focus: ${focus[0].text}`;
  } else if (decision === 'GO') {
    suggested = 'Pattern work — normal & crosswind takeoffs/landings';
  }

  return {
    decision,
    suggested,
    chips,
    reasons: reasons.length ? reasons : go.reasons || [],
    advisory: 'Advisory only — not a substitute for an official weather briefing or CFI judgment.',
    limits: L,
    focus,
  };
}

