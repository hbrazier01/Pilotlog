/**
 * Free open airport data for Radio Practice, cached server-side.
 *  - Taxiways/aprons/runways: OpenStreetMap via the Overpass API (© OpenStreetMap contributors, ODbL).
 *    Usage policy: identified User-Agent, one small bbox query per airport, cached 30 days on disk,
 *    failures back off for 6 h. https://dev.overpass-api.de/overpass-doc/en/preface/commons.html
 *  - Frequencies: OurAirports airport-frequencies.csv (public domain), downloaded at most weekly.
 *  - ATIS letter: FAA D-ATIS mirror datis.clowd.io (only towered airports with D-ATIS).
 *  - Offline fallback: a bundled OSM snapshot (snapshots/, © OpenStreetMap contributors, ODbL) for airports
 *    with FAA-verified TAXI_RULES (KAPA only). Live Overpass stays the preferred source; the snapshot is used
 *    only when there is no live/cached data (cold start with no volume, Overpass error/timeout, 6 h backoff).
 *    Airports without a bundled snapshot still degrade to null — no invented routes.
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
 * Airport-specific corrections to the OpenStreetMap taxiway graph, only where an official FAA source
 * requires one. OSM tags every paved lane as aeroway=taxiway; it does not say which ones are
 * non-movement (uncontrolled) taxilanes, so Ground must never route over them.
 *  - KAPA: FAA From the Flight Deck (https://www.faa.gov/flight_deck/apa), HS 3: "Taxi-lane C is not
 *    a TWY and is not ATC controlled", on the ramp parallel to RWY 10/28, so C is never part of a
 *    graph-searched Ground route. FAA Airport Diagram AL-5715, cycle 26134
 *    (https://aeronav.faa.gov/d-tpp/2611/05715AD.PDF): the RWY 28 departure end (east, elev 5794, MTC
 *    run-up) is reached from the midfield ramp on taxilane C, then C5. A8 is at HS 2, the west (RWY 10)
 *    end, so it is the wrong way to 28. `paths` is the allowlist for that one verified path: Ground
 *    clears a student at the midfield run-up (east of TWY A, north of HS 2) "runway 28, taxi to C5 via C"
 *    (Holland Brazier, CFI-checked correction, Nov 10 2026). The route is still computed over the OSM
 *    graph from that start, and is issued only if it comes out exactly as `expect` (else fail closed).
 */
export const TAXI_RULES = Object.freeze({
  KAPA: Object.freeze({
    nonMovement: Object.freeze(['C']),
    paths: Object.freeze({
      28: Object.freeze({
        // Midfield run-up pad (OSM way 663953885), east of TWY A between A6 and A8 / HS 2 on AL-5715.
        start: Object.freeze({ lat: 39.57611, lon: -104.84885, name: 'midfield run-up' }),
        taxilanes: Object.freeze(['C']), // allowed on this path only (never as general Ground routing)
        // OSM tags the paved ramp throat east of TWY A (between the run-up and the west end of C) as part of
        // A8. On AL-5715 A8 is the connector west of TWY A at HS 2, so here that stub is ramp lead-in only:
        // it is never named in the clearance, and the lead-in may not touch TWY A or any other named taxiway.
        rampRefs: Object.freeze(['A8']),
        expect: Object.freeze(['C', 'C5']),
        phrase: 'to', // "taxi to C5 via C"
      }),
    }),
    source: 'FAA airport diagram AL-5715 (cycle 26134) + FAA From the Flight Deck APA',
  }),
});
/** Max distance from the departure threshold to the route's last taxiway node (else the route doesn't reach that end). */
export const THRESHOLD_MAX_M = 150;
/** Max unnamed ramp lead-in before the first named taxiway. */
export const LEAD_IN_MAX_M = 500;
const MAX_ROUTE = 5;

/** OSM ways that are taxilanes / non-movement, never part of a Ground taxi clearance. */
export function isNonMovement(tags, rules) {
  const t = tags || {};
  if (t.aeroway === 'taxilane' || /^taxilane$/i.test(t.taxiway || '') || /taxi ?lane/i.test(t.name || '') || /taxi ?lane/i.test(t.ref || '')) return true;
  const ref = cleanRef(t.ref);
  return !!(ref && rules?.nonMovement?.includes(ref));
}

/**
 * Taxi route for a Ground clearance: Dijkstra over the OSM taxiway graph from the taxiway node nearest
 * the ramp/apron (or FBO) to the taxiway node at the departure threshold. Returns the ordered list of
 * taxiway designators ("A", "A3") plus an exit taxiway for the landing roll, or null (fail closed) when
 * there is no movement-area path that actually reaches that runway end:
 *  - non-movement taxilanes (OSM taxilane tags, or TAXI_RULES for the field) are not in the graph;
 *  - unnamed segments are only allowed as the ramp lead-in, before the first named taxiway
 *    (≤ LEAD_IN_MAX_M) — once on the movement area every segment must be a named taxiway;
 *  - the route must end on a named taxiway within THRESHOLD_MAX_M of the departure threshold;
 *  - the route may not enter or cross any runway on the way (7110.65 3-7-2 requires an explicit
 *    crossing / hold-short instruction for each runway, which this practice clearance does not issue);
 *  - routes are never truncated (a cut route would not reach the runway);
 *  - a TAXI_RULES `paths` entry for this runway end sets the start (e.g. KAPA midfield run-up), allows
 *    its listed taxilanes on that path only, and the result must equal its `expect` route.
 */
export function buildTaxiRoute(osm, rwId, { icao, rules: rulesOpt } = {}) {
  const els = osm?.elements || [];
  const rules = rulesOpt ?? TAXI_RULES[String(icao || '').toUpperCase()] ?? null;
  const end = runwayEnd(osm, rwId);
  if (!end) return null;
  const vp = rules?.paths?.[end.id] || null; // verified path for this runway end (start + allowed taxilanes)
  const allowLane = (tags) => !!vp?.taxilanes?.includes(cleanRef(tags?.ref));
  const taxi = els.filter((e) => e.type === 'way' && e.tags?.aeroway === 'taxiway' && e.nodes?.length >= 2 && e.geometry?.length === e.nodes.length && (!isNonMovement(e.tags, rules) || allowLane(e.tags)));
  if (!taxi.length) return null;
  const pos = new Map(), adj = new Map();
  const link = (a, b, w, ref) => { if (!adj.has(a)) adj.set(a, []); adj.get(a).push({ to: b, w, ref }); };
  const onNamed = new Map(); // node → named movement-area refs through it (for the ramp lead-in check)
  for (const w of taxi) {
    const named = cleanRef(w.tags.ref);
    const ref = named && vp?.rampRefs?.includes(named) ? null : named; // OSM ramp-side stub of that ref = ramp lead-in only
    if (ref) for (const n of w.nodes) { if (!onNamed.has(n)) onNamed.set(n, new Set()); onNamed.get(n).add(ref); }
    w.nodes.forEach((n, i) => pos.set(n, { lat: w.geometry[i].lat, lon: w.geometry[i].lon }));
    for (let i = 1; i < w.nodes.length; i++) {
      const d = distM(w.geometry[i - 1], w.geometry[i]) * (ref ? 1 : 1.6); // prefer named taxiways
      link(w.nodes[i - 1], w.nodes[i], d, ref); link(w.nodes[i], w.nodes[i - 1], d, ref);
    }
  }
  const aprons = els.filter((e) => e.tags?.aeroway === 'apron' && e.geometry?.length);
  const fbo = els.find((e) => e.type === 'node' && /fbo|gate/i.test(e.tags?.aeroway || '') && e.lat);
  let ramp = vp?.start || null;
  if (ramp) { /* airport-specific verified start */ } else if (aprons.length) {
    const cents = aprons.map((a) => ({ lat: a.geometry.reduce((s, p) => s + p.lat, 0) / a.geometry.length, lon: a.geometry.reduce((s, p) => s + p.lon, 0) / a.geometry.length, n: a.geometry.length, name: a.tags.name || '' }));
    // GA ramp heuristic: a named FBO/GA apron, else the biggest apron
    ramp = cents.find((c) => /fbo|ga\b|general|jet|signature|atlantic|million|ross|ramp/i.test(c.name)) || cents.sort((a, b) => b.n - a.n)[0];
  } else if (fbo) ramp = { lat: fbo.lat, lon: fbo.lon };
  if (!ramp) return null;
  const nearest = (p) => { let best = null, bd = Infinity; for (const [n, q] of pos) { if (!adj.has(n)) continue; const d = distM(p, q); if (d < bd) { bd = d; best = n; } } return { n: best, d: bd }; };
  const src = nearest(ramp).n, dstHit = nearest(end.start), dst = dstHit.n;
  if (src == null || dst == null || src === dst) return null;
  if (dstHit.d > THRESHOLD_MAX_M) return null; // no taxiway reaches this runway end
  // State = node + whether we are already on a named (movement-area) taxiway.
  const key = (n, named) => `${n}|${named ? 1 : 0}`;
  const leadMax = LEAD_IN_MAX_M * 1.6;
  const dist = new Map([[key(src, false), 0]]), prev = new Map(), done = new Set();
  const q = [[0, src, false]];
  let goal = null;
  while (q.length) {
    q.sort((a, b) => a[0] - b[0]);
    const [d, n, named] = q.shift();
    const k = key(n, named);
    if (done.has(k)) continue; done.add(k);
    if (n === dst && named) { goal = k; break; }
    for (const e of adj.get(n) || []) {
      if (!e.ref && named) continue; // no unnamed gaps once on the movement area
      if (!e.ref && d + e.w > leadMax) continue; // lead-in too long to be a ramp connector
      const nk = key(e.to, named || !!e.ref), nd = d + e.w;
      if (nd < (dist.get(nk) ?? Infinity)) { dist.set(nk, nd); prev.set(nk, { k, ref: e.ref }); q.push([nd, e.to, named || !!e.ref]); }
    }
  }
  if (!goal) return null;
  const refs = [], path = [goal.split('|')[0]];
  for (let k = goal; prev.has(k); k = prev.get(k).k) { refs.unshift(prev.get(k).ref); path.unshift(prev.get(k).k.split('|')[0]); }
  if (vp?.rampRefs?.length) {
    // the ramp lead-in may not touch any named taxiway before the junction with the route (e.g. may not reach TWY A)
    const first = refs.findIndex(Boolean);
    if (first < 0 || path.slice(0, first).some((n) => onNamed.has(+n) || onNamed.has(n))) return null;
  }
  if (crossesRunway(path.map((n) => pos.get(+n) ?? pos.get(n)), path, els, end.wayId)) return null; // crossings need their own ATC instruction
  const route = refs.filter(Boolean).filter((r, i, a) => r !== a[i - 1]);
  // drop a one-segment connector between the same parallel (A → A3 → A reads as A), then re-dedupe
  const compact = route.filter((r, i) => !(i > 0 && i < route.length - 1 && route[i - 1] === route[i + 1])).filter((r, i, a) => r !== a[i - 1]);
  if (!compact.length || compact.length > MAX_ROUTE) return null; // never truncate: a cut route would not reach the runway
  if (vp?.expect && compact.join(',') !== vp.expect.join(',')) return null; // verified path didn't reproduce → fail closed
  const ex = buildExit(osm, end.id, { icao, rules });
  const out = { runway: end.id, route: compact, exit: ex?.exit || null, exitSide: ex?.exitSide || 'left', source: rules ? `OpenStreetMap + ${rules.source}` : 'OpenStreetMap' };
  if (vp) { out.from = vp.start?.name || null; if (vp.phrase) out.phrase = vp.phrase; }
  return out;
}

/** Landing exit: named movement-area taxiway touching the runway nearest ~55% of the way down the roll. */
export function buildExit(osm, rwId, { icao, rules: rulesOpt } = {}) {
  const els = osm?.elements || [];
  const rules = rulesOpt ?? TAXI_RULES[String(icao || '').toUpperCase()] ?? null;
  const end = runwayEnd(osm, rwId);
  if (!end) return null;
  const taxi = els.filter((e) => e.type === 'way' && e.tags?.aeroway === 'taxiway' && e.nodes?.length >= 2 && e.geometry?.length === e.nodes.length && !isNonMovement(e.tags, rules));
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
  return exit ? { exit: exit.ref, exitSide } : null;
}
/** True when a taxi path enters or crosses a runway before its final segment to the departure threshold. */
function crossesRunway(pts, nodes, els, depWayId) {
  const orient = (a, b, c) => Math.sign((b.lon - a.lon) * (c.lat - a.lat) - (b.lat - a.lat) * (c.lon - a.lon));
  const crosses = (p1, p2, q1, q2) => orient(p1, p2, q1) * orient(p1, p2, q2) < 0 && orient(q1, q2, p1) * orient(q1, q2, p2) < 0;
  const last = nodes.length - 1;
  for (const rw of els.filter((e) => e.type === 'way' && e.tags?.aeroway === 'runway' && e.geometry?.length >= 2)) {
    const rwNodes = new Set((rw.nodes || []).map(String));
    if (nodes.some((n, i) => i < last && rwNodes.has(String(n)))) return true;
    for (let i = 1; i < pts.length; i++) {
      if (rw.id === depWayId && i === last) continue; // the final segment onto the departure threshold
      for (let j = 1; j < rw.geometry.length; j++) if (pts[i - 1] && pts[i] && crosses(pts[i - 1], pts[i], rw.geometry[j - 1], rw.geometry[j])) return true;
    }
  }
  return false;
}
function nearestOnSeg(p, a, b) {
  const ax = b.lon - a.lon, ay = b.lat - a.lat, t = Math.max(0, Math.min(1, ((p.lon - a.lon) * ax + (p.lat - a.lat) * ay) / (ax * ax + ay * ay || 1)));
  return { lat: a.lat + ay * t, lon: a.lon + ax * t };
}

/* ----------------------------- bundled snapshots ---------------------------- */
/** ICAO → committed OSM snapshot shipped in the deploy image. Only airports with FAA-verified TAXI_RULES. */
export const BUNDLED_OSM = Object.freeze({ KAPA: 'osm-KAPA.json' });
const SNAPSHOT_DIR = new URL('./snapshots/', import.meta.url);
const snapMem = new Map();
/** Bundled OSM snapshot for an airport (sync, local file, read once), or null when none is shipped. */
export function bundledOsm(icao) {
  const id = String(icao || '').toUpperCase(), file = BUNDLED_OSM[id];
  if (!file) return null;
  if (!snapMem.has(id)) {
    let v = null;
    try {
      const j = JSON.parse(fs.readFileSync(new URL(file, SNAPSHOT_DIR), 'utf8'));
      if (Array.isArray(j?.elements)) v = { fetchedAt: j.fetchedAt || null, elements: j.elements, snapshot: true, attribution: j.attribution || null };
    } catch { /* missing / unreadable → no fallback */ }
    snapMem.set(id, v);
  }
  return snapMem.get(id);
}
/** Test hook: forget in-memory OSM data, Overpass backoff and snapshot reads. */
export function _resetAirportCache() { mem.clear(); failedAt.clear(); snapMem.clear(); }

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
/** Live OSM for an airport: memory → 30-day disk cache → Overpass; on failure/backoff the bundled snapshot (if any). */
export async function getAirportOsm(station, { dataDir, fetchImpl = fetch, bundled = true } = {}) {
  const live = await getLiveAirportOsm(station, { dataDir, fetchImpl });
  return live || (bundled ? bundledOsm(station?.icao) : null);
}
async function getLiveAirportOsm(station, { dataDir, fetchImpl = fetch } = {}) {
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

/** How long Radio Practice waits for live OSM before using a bundled snapshot (the page races ~4 s total). */
export const LIVE_OSM_WAIT_MS = 1500;

/** Taxi routes for every runway end of one OSM dataset (client picks the end the wind favours); null if none. */
function taxiTable(osm, icao) {
  if (!osm) return null;
  const taxi = {}, opts2 = { icao };
  const snap = osm.snapshot ? ` (offline snapshot ${String(osm.fetchedAt || '').slice(0, 10)})` : '';
  for (const w of osm.elements.filter((e) => e.tags?.aeroway === 'runway')) for (const end of String(w.tags.ref || '').toUpperCase().split('/')) {
    const id = end.trim();
    // no verified route → route: [] (Radio Practice fails closed and names no via), exit kept if known
    const r = buildTaxiRoute(osm, id, opts2), ex = r ? null : buildExit(osm, id, opts2);
    if (r) taxi[id] = { ...r, source: r.source + snap }; else if (ex) taxi[id] = { runway: id.toUpperCase(), route: [], exit: ex.exit, exitSide: ex.exitSide, source: 'OpenStreetMap' + snap };
  }
  return Object.keys(taxi).length ? taxi : null;
}

/**
 * Everything Radio Practice needs; each piece null when unavailable.
 * OSM: live (memory / disk cache / Overpass) is preferred. For an airport with a bundled snapshot (KAPA) the
 * live lookup gets `liveWaitMs`; if it has not produced data by then (cold start, Overpass error, 6 h
 * backoff) the local snapshot is used so the page can embed routes inside its 4 s race, and the live fetch
 * keeps running in the background to fill the cache for later loads. Airports with no snapshot are unchanged.
 * A runway end with an FAA-verified TAXI_RULES path that live OSM no longer reproduces (OSM edit) is filled
 * from the snapshot route; any other runway end keeps the live result (incl. fail-closed route: []).
 */
export async function getRadioAirportData(station, _runway, opts = {}) {
  const icao = String(station?.icao || '').toUpperCase();
  const snap = opts.bundled === false ? null : bundledOsm(icao);
  const live = getAirportOsm(station, { ...opts, bundled: false }).catch(() => null);
  const osmP = snap
    ? Promise.race([live, new Promise((r) => { const t = setTimeout(() => r(null), opts.liveWaitMs ?? LIVE_OSM_WAIT_MS); t.unref?.(); })]).then((o) => o || snap)
    : live;
  const [osm, freqs, atis] = await Promise.all([
    osmP,
    getFrequencies(station?.icao, opts).catch(() => null),
    getAtis(station?.icao, opts).catch(() => null),
  ]);
  let taxi = taxiTable(osm, station?.icao);
  if (snap && osm !== snap) {
    const paths = TAXI_RULES[icao]?.paths || {};
    const verified = Object.keys(paths).filter((id) => !taxi?.[id]?.route?.length);
    if (verified.length) {
      const fromSnap = taxiTable(snap, station?.icao) || {};
      for (const id of verified) if (fromSnap[id]?.route?.length) (taxi ||= {})[id] = fromSnap[id];
    }
  }
  return { taxi, freqs, atis };
}
