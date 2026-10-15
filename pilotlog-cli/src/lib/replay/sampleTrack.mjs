/**
 * Realistic SAMPLE KAPA pattern + steep turns + slow flight + bounced landing.
 * Clearly labeled SAMPLE — synthetic GPS, not a real flight.
 */
import { enrich } from './parse.mjs';
import { detectEvents } from './events.mjs';

const KAPA = { lat: 39.5701, lon: -104.849, elev: 5885 };
const DEG = Math.PI / 180;

function dest(lat, lon, brgDeg, distNm) {
  const R = 3440.065;
  const δ = distNm / R;
  const θ = brgDeg * DEG;
  const φ1 = lat * DEG;
  const λ1 = lon * DEG;
  const φ2 = Math.asin(Math.sin(φ1) * Math.cos(δ) + Math.cos(φ1) * Math.sin(δ) * Math.cos(θ));
  const λ2 =
    λ1 +
    Math.atan2(Math.sin(θ) * Math.sin(δ) * Math.cos(φ1), Math.cos(δ) - Math.sin(φ1) * Math.sin(φ2));
  return { lat: φ2 / DEG, lon: ((λ2 / DEG + 540) % 360) - 180 };
}

function pushSeg(pts, { from, to, altFrom, altTo, gs, dtSec, t0 }) {
  const steps = Math.max(2, Math.round(dtSec / 2));
  for (let i = 1; i <= steps; i++) {
    const u = i / steps;
    const lat = from.lat + (to.lat - from.lat) * u;
    const lon = from.lon + (to.lon - from.lon) * u;
    const altFt = Math.round(altFrom + (altTo - altFrom) * u);
    pts.push({
      t: t0 + i * 2000,
      lat,
      lon,
      altFt,
      gsKt: gs,
      hdgDeg: null,
    });
  }
  return t0 + steps * 2000;
}

/** Build SAMPLE track starting at a fixed UTC for stable demos. */
export function buildSampleKapaTrack({ startIso = '2024-05-18T14:15:00Z' } = {}) {
  const tStart = Date.parse(startIso);
  const pts = [];
  // Start on runway 17L heading ~170
  let pos = { lat: KAPA.lat + 0.008, lon: KAPA.lon + 0.001 };
  let t = tStart;
  pts.push({ t, lat: pos.lat, lon: pos.lon, altFt: KAPA.elev + 10, gsKt: 5, hdgDeg: 170 });

  // Takeoff roll + climb runway heading
  let next = dest(pos.lat, pos.lon, 170, 1.2);
  t = pushSeg(pts, { from: pos, to: next, altFrom: KAPA.elev + 10, altTo: KAPA.elev + 700, gs: 85, dtSec: 70, t0: t });
  pos = next;

  // Crosswind / downwind pattern
  next = dest(pos.lat, pos.lon, 260, 1.0);
  t = pushSeg(pts, { from: pos, to: next, altFrom: KAPA.elev + 700, altTo: KAPA.elev + 1000, gs: 90, dtSec: 50, t0: t });
  pos = next;
  next = dest(pos.lat, pos.lon, 350, 2.2);
  t = pushSeg(pts, { from: pos, to: next, altFrom: KAPA.elev + 1000, altTo: KAPA.elev + 1000, gs: 95, dtSec: 90, t0: t });
  pos = next;

  // Leave pattern SE to practice area — climb
  next = dest(pos.lat, pos.lon, 130, 4.5);
  t = pushSeg(pts, { from: pos, to: next, altFrom: KAPA.elev + 1000, altTo: KAPA.elev + 2500, gs: 110, dtSec: 160, t0: t });
  pos = next;

  // Steep turns: 45° bank @ ~95 kt → ~11.5°/s → ~32s per 360°
  const turnCenter = pos;
  const radiusNm = 0.28; // tighter radius for ~45° bank at 95 kt
  const turnSteps = 18;  // ~2s * 18 = 36s
  for (let i = 1; i <= turnSteps; i++) {
    const brg = (i / turnSteps) * 360;
    const p = dest(turnCenter.lat, turnCenter.lon, brg, radiusNm);
    t += 2000;
    pts.push({
      t,
      lat: p.lat,
      lon: p.lon,
      altFt: KAPA.elev + 2500,
      gsKt: 95,
      hdgDeg: (brg + 90) % 360,
    });
  }
  pos = pts[pts.length - 1];

  // Slow flight box
  next = dest(pos.lat, pos.lon, 40, 1.5);
  t = pushSeg(pts, { from: pos, to: next, altFrom: KAPA.elev + 2500, altTo: KAPA.elev + 2400, gs: 55, dtSec: 90, t0: t });
  pos = next;
  next = dest(pos.lat, pos.lon, 130, 0.8);
  t = pushSeg(pts, { from: pos, to: next, altFrom: KAPA.elev + 2400, altTo: KAPA.elev + 2400, gs: 52, dtSec: 50, t0: t });
  pos = next;

  // Return to KAPA for landing
  next = { lat: KAPA.lat - 0.012, lon: KAPA.lon - 0.004 };
  t = pushSeg(pts, { from: pos, to: next, altFrom: KAPA.elev + 2400, altTo: KAPA.elev + 800, gs: 100, dtSec: 180, t0: t });
  pos = next;

  // Final 17L
  next = { lat: KAPA.lat + 0.002, lon: KAPA.lon };
  t = pushSeg(pts, { from: pos, to: next, altFrom: KAPA.elev + 800, altTo: KAPA.elev + 20, gs: 70, dtSec: 70, t0: t });
  pos = next;

  // Bounce: near field elev, GS low then accelerates (T&G signature)
  for (const step of [
    { d: 0.08, alt: 12, gs: 52, dt: 4 },
    { d: 0.06, alt: 4, gs: 42, dt: 4 },
    { d: 0.05, alt: 3, gs: 38, dt: 3 },
    { d: 0.08, alt: 35, gs: 58, dt: 5 },
    { d: 0.12, alt: 55, gs: 72, dt: 6 },
    { d: 0.2, alt: 8, gs: 45, dt: 10 },
    { d: 0.25, alt: 5, gs: 30, dt: 14 },
  ]) {
    next = dest(pos.lat, pos.lon, 170, step.d);
    t = pushSeg(pts, {
      from: pos,
      to: next,
      altFrom: pts[pts.length - 1].altFt,
      altTo: KAPA.elev + step.alt,
      gs: step.gs,
      dtSec: step.dt,
      t0: t,
    });
    pos = next;
  }

  const points = enrich(pts);
  const events = detectEvents(points, { fieldElevFt: KAPA.elev });
  return {
    id: 'sample-kapa-pattern',
    sample: true,
    label: 'SAMPLE · KAPA Traffic Pattern & Steep Turns',
    airport: 'KAPA',
    fieldElevFt: KAPA.elev,
    startIso,
    points,
    events,
    skills: ['Steep Turns', 'Slow Flight', 'Crosswind Landings'],
    hours: 1.4, // logged lesson time (track is a condensed SAMPLE replay)
    takeoffs: 1,
    dateLabel: 'May 18, 2024 · 14:15 MDT',
  };
}

export function sampleTrackJson() {
  return buildSampleKapaTrack();
}
