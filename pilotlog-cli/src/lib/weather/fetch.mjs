/**
 * Fetch METAR + TAF (and airport runway data) for the user's home airport from
 * aviationweather.gov with a short per-station in-memory cache.
 * Graceful failure: returns { ok:false, error, goNoGo: UNKNOWN } rather than throwing.
 */
import {
  KAPA, normalizeMetar, evaluateVfrGoNoGo, demoWeather, stationFromAirport,
} from './kapa.mjs';

const CACHE_MS = 5 * 60 * 1000;
const AIRPORT_CACHE_MS = 24 * 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 8000;
const API = 'https://aviationweather.gov/api/data';

const cache = new Map(); // icao → { at, payload }
const airportCache = new Map(); // icao → { at, station }

async function fetchJson(url) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { Accept: 'application/json', 'User-Agent': 'PilotLog/1.0 (training dashboard)' },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

export function clearWeatherCache() {
  cache.clear();
  airportCache.clear();
}

export function normalizeIcao(icao) {
  const s = String(icao || '').trim().toUpperCase();
  return /^[A-Z0-9]{3,4}$/.test(s) ? s : '';
}

/** Placeholder returned when the user hasn't chosen a home airport yet. */
export function noStationWeather() {
  return {
    ok: false,
    demo: false,
    needsSetup: true,
    station: null,
    metar: null,
    taf: null,
    goNoGo: {
      decision: 'UNKNOWN',
      reasons: ['Set your home airport in Settings'],
      crosswind: { kt: null, runway: null, headwind: null },
      advisory: 'Advisory only — not a substitute for an official weather briefing.',
    },
    fetchedAt: new Date().toISOString(),
    stale: false,
  };
}

export async function getStation(icao) {
  const id = normalizeIcao(icao);
  if (!id) return null;
  if (id === KAPA.icao) return { ...KAPA };
  const hit = airportCache.get(id);
  if (hit && Date.now() - hit.at < AIRPORT_CACHE_MS) return hit.station;
  try {
    const rows = await fetchJson(`${API}/airport?ids=${id}&format=json`);
    const st = stationFromAirport(Array.isArray(rows) ? rows[0] : null, id) || { icao: id, name: '', runways: [] };
    airportCache.set(id, { at: Date.now(), station: st });
    return st;
  } catch {
    return { icao: id, name: '', runways: [] };
  }
}

/**
 * @param {{ icao?: string, force?: boolean, demo?: boolean }} opts
 */
export async function getStationWeather({ icao = '', force = false, demo = false } = {}) {
  if (demo) return demoWeather();
  const id = normalizeIcao(icao);
  if (!id) return noStationWeather();

  const now = Date.now();
  const hit = cache.get(id);
  if (!force && hit && now - hit.at < CACHE_MS) {
    return { ...hit.payload, stale: false, cached: true };
  }

  try {
    const [metarArr, tafArr, station] = await Promise.all([
      fetchJson(`${API}/metar?ids=${id}&format=json`),
      fetchJson(`${API}/taf?ids=${id}&format=json`).catch(() => []),
      getStation(id),
    ]);
    const row = Array.isArray(metarArr) ? metarArr[0] : null;
    const tafRow = Array.isArray(tafArr) ? tafArr[0] : null;
    const metar = normalizeMetar(row);
    const goNoGo = evaluateVfrGoNoGo(metar || {}, { runways: station?.runways });
    const payload = {
      ok: true,
      demo: false,
      station,
      metar,
      taf: tafRow ? { raw: tafRow.rawTAF || tafRow.raw || '', issueTime: tafRow.issueTime || null } : null,
      goNoGo,
      fetchedAt: new Date().toISOString(),
      stale: false,
      cached: false,
    };
    cache.set(id, { at: now, payload });
    return payload;
  } catch (err) {
    if (hit) {
      return { ...hit.payload, stale: true, cached: true, error: String(err.message || err) };
    }
    return {
      ok: false,
      demo: false,
      station: { icao: id, name: '', runways: [] },
      metar: null,
      taf: null,
      goNoGo: evaluateVfrGoNoGo({}),
      fetchedAt: new Date().toISOString(),
      stale: true,
      error: String(err.message || err),
      advisory: 'Advisory only — weather feed unavailable. Get an official briefing before flight.',
    };
  }
}

/** Back-compat: KAPA weather (used by older callers/tests). */
export function getKapaWeather({ force = false, demo = false } = {}) {
  return getStationWeather({ icao: 'KAPA', force, demo });
}
