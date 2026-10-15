/**
 * Free open airport data for Radio Practice, cached server-side.
 *  - Taxiways/aprons/runways: OpenStreetMap via the Overpass API (© OpenStreetMap contributors, ODbL).
 *    Usage policy: identified User-Agent, one small bbox query per airport, cached 30 days on disk,
 *    failures back off for 6 h. https://dev.overpass-api.de/overpass-doc/en/preface/commons.html
 *  - Frequencies: OurAirports airport-frequencies.csv (public domain), downloaded at most weekly.
 *  - ATIS letter: FAA D-ATIS mirror datis.clowd.io (only towered airports with D-ATIS).
 * Everything degrades to null so the UI can label values SIM.
 */
import fs from 'node:fs';
import path from 'node:path';

const UA = 'PilotLog/0.1 (student pilot training app; github.com/hbrazier01/Pilotlog)';
const OVERPASS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'];
const DAY = 864e5;
const TAXI_TTL = 30 * DAY, FREQ_TTL = 7 * DAY, FAIL_BACKOFF = 6 * 36e5, ATIS_TTL = 10 * 6e4;
const mem = new Map();
const failedAt = new Map();

const R = 6371000, rad = (d) => (d * Math.PI) / 180;
export function distM(a, b) {
  const x = rad(b.lon - a.lon) * Math.cos(rad((a.lat + b.lat) / 2)), y = rad(b.lat - a.lat);
  return Math.hypot(x, y) * R;
}
function bearing(a, b) {
  const y = Math.sin(rad(b.lon - a.lon)) * Math.cos(rad(b.lat));
  const x = Math.cos(rad(a.lat)) * Math.sin(rad(b.lat)) - Math.sin(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.cos(rad(b.lon - a.lon));
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}
const angDiff = (a, b) => Math.abs((((a - b) % 360) + 540) % 360 - 180);

/** Clean an OSM taxiway ref into a spoken-style designator ("A 3" → "A3"); null if unusable. */
export function cleanRef(ref) {
  const s = String(ref || '').toUpperCase().replace(/\s+/g, '').replace(/^TWY/, '');
  return /^[A-Z]{1,2}\d{0,2}$/.test(s) ? s : null;
}

/** Runway end threshold point + heading for designator like "17L" from OSM runway ways ("17L/35R"). */
export function runwayEnd(osm, rwId) {
  const want = String(rwId || '').toUpperCase();
  const num = +want.replace(/\D/g, '');
  for (const w of (osm?.elements || []).filter((e) => e.type === 'way' && e.tags?.aeroway === 'runway' && e.geometry?.length >= 2)) {
    const ends = String(w.tags.ref || '').toUpperCase().split('/').map((s) => s.trim());
    if (!ends.includes(want)) continue;
    const p0 = w.geometry[0], p1 = w.geometry[w.geometry.length - 1];
    const hdg = num * 10;
    // takeoff on runway N starts at the end that points toward heading N*10
    const start = angDiff(bearing(p0, p1), hdg) < 90 ? p0 : p1, far = start === p0 ? p1 : p0;
    return { id: want, start, far, hdg, wayId: w.id };
  }
  return null;
}

/**
 * Plausible taxi route: Dijkstra over the OSM taxiway graph from the taxiway node nearest the
 * ramp/apron (or FBO) to the taxiway node nearest the departure threshold. Returns the ordered list
 * of taxiway designators ("A", "A3") plus an exit taxiway for the landing roll.
 */
export function buildTaxiRoute(osm, rwId) {
  const els = osm?.elements || [];
  const end = runwayEnd(osm, rwId);
  const taxi = els.filter((e) => e.type === 'way' && e.tags?.aeroway === 'taxiway' && e.nodes?.length >= 2 && e.geometry?.length === e.nodes.length);
  if (!end || !taxi.length) return null;
  const pos = new Map(), adj = new Map();
  const link = (a, b, w, ref) => { if (!adj.has(a)) adj.set(a, []); adj.get(a).push({ to: b, w, ref }); };
  for (const w of taxi) {
    const ref = cleanRef(w.tags.ref);
    w.nodes.forEach((n, i) => pos.set(n, { lat: w.geometry[i].lat, lon: w.geometry[i].lon }));
    for (let i = 1; i < w.nodes.length; i++) {
      const d = distM(w.geometry[i - 1], w.geometry[i]) * (ref ? 1 : 1.6); // prefer named taxiways
      link(w.nodes[i - 1], w.nodes[i], d, ref); link(w.nodes[i], w.nodes[i - 1], d, ref);
    }
  }
  const aprons = els.filter((e) => e.tags?.aeroway === 'apron' && e.geometry?.length);
  const fbo = els.find((e) => e.type === 'node' && /fbo|gate/i.test(e.tags?.aeroway || '') && e.lat);
  let ramp = null;
  if (aprons.length) {
    const cents = aprons.map((a) => ({ lat: a.geometry.reduce((s, p) => s + p.lat, 0) / a.geometry.length, lon: a.geometry.reduce((s, p) => s + p.lon, 0) / a.geometry.length, n: a.geometry.length, name: a.tags.name || '' }));
    // GA ramp heuristic: a named FBO/GA apron, else the biggest apron
    ramp = cents.find((c) => /fbo|ga\b|general|jet|signature|atlantic|million|ross|ramp/i.test(c.name)) || cents.sort((a, b) => b.n - a.n)[0];
  } else if (fbo) ramp = { lat: fbo.lat, lon: fbo.lon };
  if (!ramp) return null;
  const nearest = (p, filter = () => true) => { let best = null, bd = Infinity; for (const [n, q] of pos) { if (!adj.has(n) || !filter(n)) continue; const d = distM(p, q); if (d < bd) { bd = d; best = n; } } return best; };
  const src = nearest(ramp), dst = nearest(end.start);
  if (src == null || dst == null) return null;
  const dist = new Map([[src, 0]]), prev = new Map(), done = new Set();
  const q = [[0, src]];
  while (q.length) {
    q.sort((a, b) => a[0] - b[0]);
    const [d, n] = q.shift();
    if (done.has(n)) continue; done.add(n);
    if (n === dst) break;
    for (const e of adj.get(n) || []) {
      const nd = d + e.w;
      if (nd < (dist.get(e.to) ?? Infinity)) { dist.set(e.to, nd); prev.set(e.to, { n, ref: e.ref }); q.push([nd, e.to]); }
    }
  }
  if (!prev.has(dst) && src !== dst) return null;
  const refs = [];
  for (let n = dst; prev.has(n); n = prev.get(n).n) refs.unshift(prev.get(n).ref);
  const route = refs.filter(Boolean).filter((r, i, a) => r !== a[i - 1]);
  // drop tiny connector refs that appear for <1 segment between the same parallel (A → A3 → A stays as A3? keep order, cap 4)
  const compact = route.filter((r, i) => !(i > 0 && i < route.length - 1 && route[i - 1] === route[i + 1])).slice(0, 4);
  // Exit: named taxiway touching the runway nearest ~55% of the way down the landing roll
  const rw = els.find((e) => e.id === end.wayId);
  const rwNodes = new Set(rw?.nodes || []);
  const target = { lat: end.start.lat + (end.far.lat - end.start.lat) * 0.55, lon: end.start.lon + (end.far.lon - end.start.lon) * 0.55 };
  let exit = null, ed = Infinity;
  for (const w of taxi) {
    const ref = cleanRef(w.tags.ref); if (!ref) continue;
    w.geometry.forEach((g, i) => {
      const onRw = rwNodes.has(w.nodes[i]) || distM(g, nearestOnSeg(g, end.start, end.far)) < 30;
      if (!onRw) return;
      const d = distM(g, target);
      if (d < ed) { ed = d; exit = { ref, pt: g }; }
    });
  }
  let exitSide = 'left';
  if (exit) {
    const cross = (end.far.lon - end.start.lon) * (exit.pt.lat - end.start.lat) - (end.far.lat - end.start.lat) * (exit.pt.lon - end.start.lon);
    exitSide = cross > 0 ? 'left' : 'right';
  }
  if (!compact.length) return null;
  return { runway: end.id, route: compact, exit: exit?.ref || null, exitSide, source: 'OpenStreetMap' };
}
function nearestOnSeg(p, a, b) {
  const ax = b.lon - a.lon, ay = b.lat - a.lat, t = Math.max(0, Math.min(1, ((p.lon - a.lon) * ax + (p.lat - a.lat) * ay) / (ax * ax + ay * ay || 1)));
  return { lat: a.lat + ay * t, lon: a.lon + ax * t };
}

/* ------------------------------- fetch + cache ------------------------------ */
function cacheFile(dir, name) { return dir ? path.join(dir, 'airport-cache', name) : null; }
function readCache(file, ttl) {
  try { const st = fs.statSync(file); if (Date.now() - st.mtimeMs < ttl) return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { /* miss */ }
  return null;
}
function writeCache(file, data) { try { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(data)); } catch { /* best effort */ } }

export function overpassQuery(lat, lon, radiusM = 3500) {
  const a = `(around:${radiusM},${lat},${lon})`;
  return `[out:json][timeout:25];(way["aeroway"="taxiway"]${a};way["aeroway"~"^(apron|runway)$"]${a};node["aeroway"="gate"]${a};);out body geom;`;
}
export async function getAirportOsm(station, { dataDir, fetchImpl = fetch } = {}) {
  if (!station?.icao || !Number.isFinite(station.lat) || !Number.isFinite(station.lon)) return null;
  const key = `osm-${station.icao}.json`, file = cacheFile(dataDir, key);
  if (mem.has(key)) return mem.get(key);
  const c = file && readCache(file, TAXI_TTL);
  if (c) { mem.set(key, c); return c; }
  if (Date.now() - (failedAt.get(key) || 0) < FAIL_BACKOFF) return null;
  for (const url of OVERPASS) {
    try {
      const r = await fetchImpl(url, { method: 'POST', headers: { 'User-Agent': UA, 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'data=' + encodeURIComponent(overpassQuery(station.lat, station.lon)), signal: AbortSignal.timeout(40000) });
      if (!r.ok) continue;
      const j = await r.json();
      if (!Array.isArray(j?.elements)) continue;
      const slim = { fetchedAt: new Date().toISOString(), elements: j.elements.map((e) => ({ type: e.type, id: e.id, tags: e.tags, nodes: e.nodes, geometry: e.geometry?.map((g) => ({ lat: +g.lat.toFixed(6), lon: +g.lon.toFixed(6) })), lat: e.lat, lon: e.lon })) };
      if (file) writeCache(file, slim);
      mem.set(key, slim);
      return slim;
    } catch { /* try next mirror */ }
  }
  failedAt.set(key, Date.now());
  return null;
}

/** Parse OurAirports airport-frequencies.csv rows for one airport. */
export function parseFrequencies(csv, ident) {
  const id = String(ident || '').toUpperCase(), out = [];
  for (const line of String(csv).split(/\r?\n/)) {
    if (!line.includes(`"${id}"`)) continue;
    const cols = line.match(/("([^"]*)"|[^,]*)(,|$)/g)?.map((c) => c.replace(/,$/, '').replace(/^"|"$/g, '')) || [];
    if (cols[2]?.toUpperCase() !== id) continue;
    const mhz = Number(cols[5]);
    if (Number.isFinite(mhz)) out.push({ type: cols[3].toUpperCase(), desc: cols[4], mhz: mhz.toFixed(mhz * 1000 % 10 ? 3 : 2) });
  }
  const pick = (re) => out.find((f) => re.test(f.type))?.mhz || null;
  return out.length ? { all: out, tower: pick(/^TWR$/), ground: pick(/^GND$/), atis: pick(/^(ATIS|AWOS|ASOS)$/), clearance: pick(/^(CLD|DEL)$/), ctaf: pick(/^(CTAF|UNIC)$/), source: 'OurAirports' } : null;
}
let freqCsv = null;
export async function getFrequencies(icao, { dataDir, fetchImpl = fetch } = {}) {
  if (!icao) return null;
  if (!freqCsv) {
    const file = cacheFile(dataDir, 'airport-frequencies.csv');
    try { if (file && Date.now() - fs.statSync(file).mtimeMs < FREQ_TTL) freqCsv = fs.readFileSync(file, 'utf8'); } catch { /* miss */ }
    if (!freqCsv && Date.now() - (failedAt.get('freq') || 0) > FAIL_BACKOFF) {
      try {
        const r = await fetchImpl('https://davidmegginson.github.io/ourairports-data/airport-frequencies.csv', { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(20000) });
        if (r.ok) { freqCsv = await r.text(); if (file) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, freqCsv); } }
      } catch { failedAt.set('freq', Date.now()); }
    }
  }
  return freqCsv ? parseFrequencies(freqCsv, icao) : null;
}

/** Current ATIS letter from D-ATIS (towered airports only). */
export function parseDatis(rows) {
  const r = Array.isArray(rows) ? rows.find((x) => x?.type === 'dep' || x?.type === 'combined') || rows[0] : null;
  const code = String(r?.code || '').toUpperCase();
  return /^[A-Z]$/.test(code) ? { letter: code, source: 'D-ATIS' } : null;
}
export async function getAtis(icao, { fetchImpl = fetch } = {}) {
  if (!icao) return null;
  const key = 'atis-' + icao, hit = mem.get(key);
  if (hit && Date.now() - hit.at < ATIS_TTL) return hit.v;
  let v = null;
  try {
    const r = await fetchImpl(`https://datis.clowd.io/api/${encodeURIComponent(icao)}`, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(6000) });
    if (r.ok) v = parseDatis(await r.json());
  } catch { /* none */ }
  mem.set(key, { at: Date.now(), v });
  return v;
}

/** Everything Radio Practice needs; each piece null when unavailable. */
export async function getRadioAirportData(station, _runway, opts = {}) {
  const [osm, freqs, atis] = await Promise.all([
    getAirportOsm(station, opts).catch(() => null),
    getFrequencies(station?.icao, opts).catch(() => null),
    getAtis(station?.icao, opts).catch(() => null),
  ]);
  let taxi = null;
  if (osm) {
    // build routes for every runway end so the client can pick the one the wind favours
    taxi = {};
    for (const w of osm.elements.filter((e) => e.tags?.aeroway === 'runway')) for (const end of String(w.tags.ref || '').toUpperCase().split('/')) {
      const r = buildTaxiRoute(osm, end.trim()); if (r) taxi[end.trim()] = r;
    }
    if (!Object.keys(taxi).length) taxi = null;
  }
  return { taxi, freqs, atis };
}
