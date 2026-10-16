/**
 * Parse GPX, KML, and ForeFlight/Garmin CSV into a normalized track.
 * Point: { t: epoch ms, lat, lon, altFt, gsKt, hdgDeg }
 */
const NM_PER_DEG_LAT = 60;

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function haversineNm(a, b) {
  const R = 3440.065; // NM
  const toR = Math.PI / 180;
  const dLat = (b.lat - a.lat) * toR;
  const dLon = (b.lon - a.lon) * toR;
  const la1 = a.lat * toR;
  const la2 = b.lat * toR;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(la1) * Math.cos(la2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

function bearingDeg(a, b) {
  const toR = Math.PI / 180;
  const φ1 = a.lat * toR;
  const φ2 = b.lat * toR;
  const Δλ = (b.lon - a.lon) * toR;
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

function enrich(points) {
  const out = [];
  for (let i = 0; i < points.length; i++) {
    const p = { ...points[i] };
    if (i > 0) {
      const prev = out[i - 1];
      const dtHr = Math.max(1e-6, (p.t - prev.t) / 3600000);
      const dist = haversineNm(prev, p);
      if (p.gsKt == null) p.gsKt = Math.round((dist / dtHr) * 10) / 10;
      if (p.hdgDeg == null && dist > 0.001) p.hdgDeg = Math.round(bearingDeg(prev, p));
      else if (p.hdgDeg == null) p.hdgDeg = prev.hdgDeg ?? 0;
    } else {
      if (p.gsKt == null) p.gsKt = 0;
      if (p.hdgDeg == null) p.hdgDeg = 0;
    }
    out.push(p);
  }
  return out;
}

function parseIsoTime(s, fallbackMs) {
  if (!s) return fallbackMs;
  const t = Date.parse(s);
  return Number.isFinite(t) ? t : fallbackMs;
}

/** GPX 1.1 trkpt */
export function parseGpx(text) {
  const pts = [];
  const re = /<trkpt\s+([^>]+)>([\s\S]*?)<\/trkpt>/gi;
  let m;
  let i = 0;
  const base = Date.now();
  while ((m = re.exec(text))) {
    const attrs = m[1];
    const body = m[2];
    const lat = num(/lat=["']?([-0-9.]+)/i.exec(attrs)?.[1]);
    const lon = num(/lon=["']?([-0-9.]+)/i.exec(attrs)?.[1]);
    if (lat == null || lon == null) continue;
    const eleM = num(/<ele>([^<]+)<\/ele>/i.exec(body)?.[1]);
    const time = /<time>([^<]+)<\/time>/i.exec(body)?.[1];
    const t = parseIsoTime(time, base + i * 2000);
    pts.push({
      t,
      lat,
      lon,
      altFt: eleM != null ? Math.round(eleM * 3.28084) : null,
      gsKt: null,
      hdgDeg: null,
    });
    i++;
  }
  if (!pts.length) throw new Error('No GPX track points found');
  return { format: 'gpx', points: enrich(pts) };
}

/** Simple KML LineString / gx:Track / Placemark coordinates */
export function parseKml(text) {
  const pts = [];
  const base = Date.now();
  // gx:Track with <when> + <gx:coord>
  const whens = [...text.matchAll(/<when>([^<]+)<\/when>/gi)].map((m) => m[1]);
  const coords = [...text.matchAll(/<gx:coord>([^<]+)<\/gx:coord>/gi)].map((m) => m[1].trim());
  if (whens.length && coords.length) {
    const n = Math.min(whens.length, coords.length);
    for (let i = 0; i < n; i++) {
      const [lon, lat, altM] = coords[i].split(/\s+/).map(Number);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
      pts.push({
        t: parseIsoTime(whens[i], base + i * 2000),
        lat,
        lon,
        altFt: Number.isFinite(altM) ? Math.round(altM * 3.28084) : null,
        gsKt: null,
        hdgDeg: null,
      });
    }
  }
  if (!pts.length) {
    const coordBlock = /<coordinates>([\s\S]*?)<\/coordinates>/i.exec(text)?.[1] || '';
    const pairs = coordBlock.trim().split(/[\s\n]+/).filter(Boolean);
    pairs.forEach((pair, i) => {
      const [lon, lat, altM] = pair.split(',').map(Number);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
      pts.push({
        t: base + i * 2000,
        lat,
        lon,
        altFt: Number.isFinite(altM) ? Math.round(altM * 3.28084) : null,
        gsKt: null,
        hdgDeg: null,
      });
    });
  }
  if (!pts.length) throw new Error('No KML track points found');
  return { format: 'kml', points: enrich(pts) };
}

/**
 * ForeFlight / Garmin CSV.
 * Accepts headers containing lat/lon/alt/speed/course/time in common variants.
 */
export function parseCsv(text) {
  const lines = text.replace(/^\uFEFF/, '').trim().split(/\r?\n/);
  if (lines.length < 2) throw new Error('CSV too short');
  const headers = lines[0].split(/,/).map((h) => h.trim().toLowerCase().replace(/['"]/g, ''));
  const idx = (...names) => {
    for (const n of names) {
      const i = headers.findIndex((h) => h === n || h.includes(n));
      if (i >= 0) return i;
    }
    return -1;
  };
  const iLat = idx('latitude', 'lat');
  const iLon = idx('longitude', 'lon', 'lng');
  const iAlt = idx('altitude', 'alt(ft)', 'alt_ft', 'altitude (ft)', 'gps altitude');
  const iAltM = idx('altitude (m)', 'ele');
  const iGs = idx('groundspeed', 'ground speed', 'speed (kts)', 'speed', 'gs');
  const iHdg = idx('course', 'heading', 'track', 'hdg');
  const iTime = idx('timestamp', 'time', 'datetime', 'date/time', 'utc');
  if (iLat < 0 || iLon < 0) throw new Error('CSV missing lat/lon columns');

  const pts = [];
  const base = Date.now();
  for (let r = 1; r < lines.length; r++) {
    const cols = lines[r].split(/,/).map((c) => c.trim().replace(/^"|"$/g, ''));
    if (cols.length < 2) continue;
    const lat = num(cols[iLat]);
    const lon = num(cols[iLon]);
    if (lat == null || lon == null) continue;
    let altFt = iAlt >= 0 ? num(cols[iAlt]) : null;
    if (altFt == null && iAltM >= 0) {
      const m = num(cols[iAltM]);
      if (m != null) altFt = Math.round(m * 3.28084);
    }
    const tRaw = iTime >= 0 ? cols[iTime] : null;
    let t = parseIsoTime(tRaw, NaN);
    if (!Number.isFinite(t)) {
      // ForeFlight often "2024-05-18T14:15:00Z" or "05/18/2024 14:15:00"
      const m = /(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2}):(\d{2})/.exec(tRaw || '');
      if (m) {
        t = Date.UTC(+m[3], +m[1] - 1, +m[2], +m[4], +m[5], +m[6]);
      } else {
        t = base + (r - 1) * 2000;
      }
    }
    pts.push({
      t,
      lat,
      lon,
      altFt,
      gsKt: iGs >= 0 ? num(cols[iGs]) : null,
      hdgDeg: iHdg >= 0 ? num(cols[iHdg]) : null,
    });
  }
  if (!pts.length) throw new Error('No CSV track points found');
  return { format: 'csv', points: enrich(pts) };
}

export function parseTrack(text, filename = '') {
  const name = String(filename).toLowerCase();
  const trimmed = String(text || '').trim();
  if (!trimmed) throw new Error('Empty track');
  if (name.endsWith('.gpx') || trimmed.includes('<gpx') || trimmed.includes('<trkpt')) return parseGpx(trimmed);
  if (name.endsWith('.kml') || trimmed.includes('<kml') || trimmed.includes('<gx:Track')) return parseKml(trimmed);
  if (name.endsWith('.csv') || (trimmed.includes(',') && /lat/i.test(trimmed.split('\n')[0]))) return parseCsv(trimmed);
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    const j = JSON.parse(trimmed);
    const points = Array.isArray(j) ? j : j.points;
    if (!Array.isArray(points) || !points.length) throw new Error('JSON track empty');
    return { format: 'json', points: enrich(points.map((p) => ({ ...p }))) };
  }
  // try GPX then CSV
  try {
    return parseGpx(trimmed);
  } catch {
    return parseCsv(trimmed);
  }
}

export function trackStats(points) {
  if (!points?.length) return { durationSec: 0, distanceNm: 0, maxAltFt: 0, maxGsKt: 0 };
  let dist = 0;
  for (let i = 1; i < points.length; i++) dist += haversineNm(points[i - 1], points[i]);
  return {
    durationSec: Math.round((points[points.length - 1].t - points[0].t) / 1000),
    distanceNm: Math.round(dist * 100) / 100,
    maxAltFt: Math.max(...points.map((p) => p.altFt || 0)),
    maxGsKt: Math.max(...points.map((p) => p.gsKt || 0)),
  };
}

export { haversineNm, bearingDeg, enrich };
