/**
 * Fetch KAPA METAR + TAF from aviationweather.gov with a short in-memory cache.
 * Graceful failure: returns { ok:false, error, goNoGo: UNKNOWN } rather than throwing.
 */
import {
  KAPA, normalizeMetar, evaluateVfrGoNoGo, demoWeather,
} from './kapa.mjs';

const CACHE_MS = 5 * 60 * 1000;
const FETCH_TIMEOUT_MS = 8000;
const METAR_URL = 'https://aviationweather.gov/api/data/metar?ids=KAPA&format=json';
const TAF_URL = 'https://aviationweather.gov/api/data/taf?ids=KAPA&format=json';

let cache = { at: 0, payload: null };

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
  cache = { at: 0, payload: null };
}

export async function getKapaWeather({ force = false, demo = false } = {}) {
  if (demo) return demoWeather();

  const now = Date.now();
  if (!force && cache.payload && now - cache.at < CACHE_MS) {
    return { ...cache.payload, stale: false, cached: true };
  }

  try {
    const [metarArr, tafArr] = await Promise.all([
      fetchJson(METAR_URL),
      fetchJson(TAF_URL),
    ]);
    const row = Array.isArray(metarArr) ? metarArr[0] : null;
    const tafRow = Array.isArray(tafArr) ? tafArr[0] : null;
    const metar = normalizeMetar(row);
    const goNoGo = evaluateVfrGoNoGo(metar || {});
    const payload = {
      ok: true,
      demo: false,
      station: KAPA,
      metar,
      taf: tafRow ? { raw: tafRow.rawTAF || tafRow.raw || '', issueTime: tafRow.issueTime || null } : null,
      goNoGo,
      fetchedAt: new Date().toISOString(),
      stale: false,
      cached: false,
    };
    cache = { at: now, payload };
    return payload;
  } catch (err) {
    if (cache.payload) {
      return {
        ...cache.payload,
        stale: true,
        cached: true,
        error: String(err.message || err),
      };
    }
    return {
      ok: false,
      demo: false,
      station: KAPA,
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
