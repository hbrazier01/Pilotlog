/**
 * KAPA (Centennial) student VFR go/no-go helpers.
 * Pure functions — no I/O. Advisory only; not a substitute for an official briefing.
 *
 * Class D VFR (student-oriented minimums we use):
 *   ceiling >= 1000 ft AGL (lowest BKN/OVC base)
 *   visibility >= 3 SM
 * Gust / crosswind caution against KAPA runways 17/35 and 10/28.
 */

export const KAPA = {
  icao: 'KAPA',
  name: 'Centennial Airport',
  elevFt: 5885,
  runways: [
    { id: '17L/35R', headings: [170, 350] },
    { id: '17R/35L', headings: [170, 350] },
    { id: '10/28', headings: [100, 280] },
  ],
};

/** Parse visibility from METAR-style value: number, "10+", "6+", "1/2", "1 1/2", etc. */
export function parseVisibilitySm(visib) {
  if (visib == null || visib === '') return null;
  if (typeof visib === 'number' && Number.isFinite(visib)) return visib;
  const s = String(visib).trim().toUpperCase();
  if (s.endsWith('+')) {
    const n = parseFloat(s);
    return Number.isFinite(n) ? n : null;
  }
  if (s.includes(' ')) {
    const [whole, frac] = s.split(/\s+/);
    const [a, b] = (frac || '').split('/');
    const w = parseFloat(whole);
    const f = a && b ? parseFloat(a) / parseFloat(b) : 0;
    return Number.isFinite(w) ? w + (Number.isFinite(f) ? f : 0) : null;
  }
  if (s.includes('/')) {
    const [a, b] = s.split('/');
    const v = parseFloat(a) / parseFloat(b);
    return Number.isFinite(v) ? v : null;
  }
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : null;
}

/** Lowest BKN/OVC base in feet AGL; null if no broken/overcast (unlimited for our purposes). */
export function ceilingFt(clouds = []) {
  let low = null;
  for (const c of clouds || []) {
    const cover = String(c.cover || '').toUpperCase();
    if (cover !== 'BKN' && cover !== 'OVC') continue;
    const base = Number(c.base);
    if (!Number.isFinite(base)) continue;
    if (low == null || base < low) low = base;
  }
  return low;
}

/** Crosswind component (kt) for a runway heading; wind from wdir at wspd. */
export function crosswindKt(wdir, wspd, runwayHdg) {
  if (wdir == null || wdir === 'VRB' || !Number.isFinite(Number(wspd))) return null;
  const dir = Number(wdir);
  const spd = Number(wspd);
  if (!Number.isFinite(dir)) return null;
  const diff = ((dir - runwayHdg + 540) % 360) - 180;
  return Math.abs(Math.sin((diff * Math.PI) / 180) * spd);
}

/** Headwind component (kt); positive = headwind for that runway heading. */
export function headwindKt(wdir, wspd, runwayHdg) {
  if (wdir == null || wdir === 'VRB' || !Number.isFinite(Number(wspd))) return null;
  const dir = Number(wdir);
  const spd = Number(wspd);
  if (!Number.isFinite(dir)) return null;
  const diff = ((dir - runwayHdg + 540) % 360) - 180;
  return Math.cos((diff * Math.PI) / 180) * spd;
}

/** Best runway end at KAPA: lowest crosswind, then strongest headwind. */
export function bestCrosswind(wdir, wspd, runways = KAPA.runways) {
  let bestX = null;
  let bestHw = null;
  let bestRw = null;
  for (const rw of runways) {
    const ends = rw.id.split('/');
    rw.headings.forEach((hdg, i) => {
      const x = crosswindKt(wdir, wspd, hdg);
      const hw = headwindKt(wdir, wspd, hdg);
      if (x == null) return;
      const xr = Math.round(x * 10) / 10;
      if (
        bestX == null ||
        xr < bestX - 0.05 ||
        (Math.abs(xr - bestX) <= 0.05 && (bestHw == null || (hw ?? -999) > bestHw))
      ) {
        bestX = xr;
        bestHw = hw;
        bestRw = ends[i] || rw.id;
      }
    });
  }
  return { kt: bestX, runway: bestRw, headwind: bestHw == null ? null : Math.round(bestHw * 10) / 10 };
}

const GUST_CAUTION = 20; // kt
const XWIND_CAUTION = 12; // kt student caution
const XWIND_NOGO = 20; // kt hard caution → still GO if VFR mins met, but flag NO-GO caution? We'll use CAUTION badge

/**
 * Compute go/no-go from a normalized observation.
 * @param {{ visib, clouds, wdir, wspd, wgst, fltCat }} obs
 * @returns {{ decision: 'GO'|'NO-GO'|'CAUTION'|'UNKNOWN', reasons: string[], ceilingFt, visSm, crosswind, advisory: string }}
 */
export function evaluateVfrGoNoGo(obs = {}) {
  const visSm = parseVisibilitySm(obs.visib);
  const ceil = ceilingFt(obs.clouds);
  const reasons = [];
  const xw = bestCrosswind(obs.wdir, obs.wspd ?? obs.wgst);

  if (visSm == null && ceil == null && obs.wdir == null) {
    return {
      decision: 'UNKNOWN',
      reasons: ['No observation available'],
      ceilingFt: null,
      visSm: null,
      crosswind: xw,
      advisory: 'Advisory only — not a substitute for an official weather briefing.',
    };
  }

  let hardFail = false;
  if (visSm != null && visSm < 3) {
    hardFail = true;
    reasons.push(`Visibility ${visSm} SM below 3 SM Class D minimum`);
  }
  if (ceil != null && ceil < 1000) {
    hardFail = true;
    reasons.push(`Ceiling ${ceil} ft AGL below 1,000 ft Class D minimum`);
  }

  const gust = Number(obs.wgst);
  if (Number.isFinite(gust) && gust >= GUST_CAUTION) {
    reasons.push(`Gusts ${gust} kt`);
  }
  if (xw.kt != null && xw.kt >= XWIND_NOGO) {
    reasons.push(`Crosswind ~${xw.kt} kt on preferred runway ${xw.runway}`);
  } else if (xw.kt != null && xw.kt >= XWIND_CAUTION) {
    reasons.push(`Crosswind ~${xw.kt} kt (caution) on ${xw.runway}`);
  }

  let decision;
  if (hardFail) decision = 'NO-GO';
  else if (reasons.some(r => /Gusts|Crosswind/.test(r))) decision = 'CAUTION';
  else {
    decision = 'GO';
    if (visSm != null) reasons.push(`Visibility ${visSm >= 10 ? '10+' : visSm} SM`);
    if (ceil == null) reasons.push('No BKN/OVC ceiling');
    else reasons.push(`Ceiling ${ceil} ft AGL`);
  }

  return {
    decision,
    reasons,
    ceilingFt: ceil,
    visSm,
    crosswind: xw,
    advisory: 'Advisory only — not a substitute for an official weather briefing. Check NOTAMs and get a full brief before flight.',
  };
}

/** Normalize aviationweather.gov METAR JSON row → observation used by evaluateVfrGoNoGo. */
export function normalizeMetar(row) {
  if (!row) return null;
  return {
    icao: row.icaoId || KAPA.icao,
    raw: row.rawOb || row.raw || '',
    obsTime: row.reportTime || row.obsTime || null,
    tempC: row.temp ?? null,
    dewpC: row.dewp ?? null,
    wdir: row.wdir ?? null,
    wspd: row.wspd ?? null,
    wgst: row.wgst ?? null,
    visib: row.visib ?? null,
    altim: row.altim ?? null,
    cover: row.cover ?? null,
    clouds: row.clouds || [],
    fltCat: row.fltCat || null,
  };
}

/** Demo weather — clearly fake, labeled as sample. */
export function demoWeather() {
  const obs = {
    icao: 'KAPA',
    raw: 'METAR KAPA 000000Z 02008KT 10SM FEW060 18/07 A2986 RMK AO2 DEMO SAMPLE DATA',
    obsTime: new Date().toISOString(),
    tempC: 18,
    dewpC: 7,
    wdir: 20,
    wspd: 8,
    wgst: null,
    visib: '10+',
    altim: 1011.2,
    cover: 'FEW',
    clouds: [{ cover: 'FEW', base: 6000 }],
    fltCat: 'VFR',
  };
  const tafRaw =
    'TAF KAPA 000000Z 0000/0106 02008KT P6SM FEW060 FM000600 35010KT P6SM SCT080 (DEMO SAMPLE)';
  const go = evaluateVfrGoNoGo(obs);
  return {
    demo: true,
    station: KAPA,
    metar: obs,
    taf: { raw: tafRaw },
    goNoGo: go,
    fetchedAt: new Date().toISOString(),
    stale: false,
  };
}
