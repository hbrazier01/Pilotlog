/**
 * Auto-detect maneuver events from a GPS track.
 * Bank ≈ atan(V * ω / g) from heading rate + groundspeed (coordinated-turn approx).
 */
const G_KT_PER_S = 19.07; // g in knots/s ≈ 32.2 ft/s² → kt/s

function unwrapDelta(a, b) {
  let d = b - a;
  while (d > 180) d -= 360;
  while (d < -180) d += 360;
  return d;
}

/**
 * @param {Array} points normalized track points
 * @param {{ fieldElevFt?: number }} opts
 */
export function detectEvents(points, { fieldElevFt = 5885 } = {}) {
  if (!points || points.length < 5) return [];
  const events = [];
  const bankSeries = [];

  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const dt = Math.max(0.5, (b.t - a.t) / 1000);
    const dHdg = unwrapDelta(a.hdgDeg ?? 0, b.hdgDeg ?? 0);
    const omega = (dHdg * Math.PI) / 180 / dt; // rad/s
    const V = ((a.gsKt ?? 0) + (b.gsKt ?? 0)) / 2; // kt
    // bank rad ≈ atan(V_fps * omega / g); V_kt * 1.6878 = fps; g=32.2
    const Vfps = V * 1.6878;
    const bankDeg = Math.abs((Math.atan((Vfps * omega) / 32.2) * 180) / Math.PI);
    bankSeries.push({ i, t: b.t, bankDeg, gs: V, alt: b.altFt ?? 0, hdg: b.hdgDeg ?? 0 });
  }

  // Steep turns: sustained bank > 40° for ≥ 8s with GS > 60
  let runStart = null;
  for (let i = 0; i < bankSeries.length; i++) {
    const s = bankSeries[i];
    const steep = s.bankDeg >= 38 && s.gs >= 60 && s.alt > fieldElevFt + 400;
    if (steep && runStart == null) runStart = i;
    if ((!steep || i === bankSeries.length - 1) && runStart != null) {
      const end = steep && i === bankSeries.length - 1 ? i : i - 1;
      const dur = (bankSeries[end].t - bankSeries[runStart].t) / 1000;
      if (dur >= 8) {
        const mid = bankSeries[runStart + Math.floor((end - runStart) / 2)];
        events.push({
          type: 'steep_turn',
          label: 'Steep turn',
          t: mid.t,
          index: mid.i,
          meta: { bankDeg: Math.round(mid.bankDeg), durationSec: Math.round(dur) },
        });
      }
      runStart = null;
    }
  }

  // Slow flight: GS 45–70 kt at ≥ 800 AGL for ≥ 12s
  runStart = null;
  for (let i = 0; i < bankSeries.length; i++) {
    const s = bankSeries[i];
    const slow = s.gs >= 40 && s.gs <= 70 && s.alt >= fieldElevFt + 800;
    if (slow && runStart == null) runStart = i;
    if ((!slow || i === bankSeries.length - 1) && runStart != null) {
      const end = slow && i === bankSeries.length - 1 ? i : i - 1;
      const dur = (bankSeries[end].t - bankSeries[runStart].t) / 1000;
      if (dur >= 12) {
        const mid = bankSeries[runStart + Math.floor((end - runStart) / 2)];
        events.push({
          type: 'slow_flight',
          label: 'Slow flight',
          t: mid.t,
          index: mid.i,
          meta: { gsKt: Math.round(mid.gs), durationSec: Math.round(dur) },
        });
      }
      runStart = null;
    }
  }

  // Landings: find ground-contact runs (≤ 20 ft AGL, ≤ 75 kt), then classify.
  //  - airborne gap < 12 s that stays below 60 ft AGL between two contacts → bounced landing
  //  - contact followed by climb above 300 ft AGL → touch-and-go
  //  - final contact that decelerates below 20 kt → full-stop landing
  const onGnd = points.map((p) => {
    const agl = (p.altFt ?? 99999) - fieldElevFt;
    return agl <= 20 && agl > -60 && (p.gsKt ?? 0) <= 75;
  });
  const runs = [];
  for (let i = 0; i < points.length; i++) {
    if (!onGnd[i]) continue;
    let j = i;
    while (j + 1 < points.length && onGnd[j + 1]) j++;
    runs.push({ a: i, b: j });
    i = j;
  }
  // skip the initial departure run (starts slow and only accelerates)
  const isTakeoffOnly = (r) => r.a === 0 || (points[r.a].gsKt ?? 0) < 30;
  for (let k = 0; k < runs.length; k++) {
    const r = runs[k];
    if (isTakeoffOnly(r)) continue;
    const nxt = runs[k + 1];
    const p = points[r.a];
    const meta = { altFt: p.altFt, gsKt: Math.round(p.gsKt ?? 0) };
    if (nxt) {
      const gapSec = (points[nxt.a].t - points[r.b].t) / 1000;
      let maxAgl = -Infinity;
      for (let i = r.b; i <= nxt.a; i++) maxAgl = Math.max(maxAgl, (points[i].altFt ?? 0) - fieldElevFt);
      if (gapSec < 12 && maxAgl < 60) {
        events.push({ type: 'bounced_landing', label: 'Bounced landing', t: p.t, index: r.a, meta: { ...meta, bounceFt: Math.round(maxAgl) } });
        runs[k + 1] = { a: r.a, b: nxt.b, second: nxt.a };
        // fall through to classify the merged run on next iteration (as a continuation)
        runs[k + 1].continuation = true;
        continue;
      }
    }
    const minGs = Math.min(...points.slice(r.a, r.b + 1).map((q) => q.gsKt ?? 0));
    if (minGs < 20) {
      if (!r.continuation) events.push({ type: 'full_stop', label: 'Full-stop landing', t: p.t, index: r.a, meta });
      else { const q = points[r.second]; events.push({ type: 'full_stop', label: 'Full-stop landing', t: q.t, index: r.second, meta: { altFt: q.altFt, gsKt: Math.round(q.gsKt ?? 0) } }); }
    } else if (!r.continuation) {
      events.push({ type: 'touch_and_go', label: 'Touch-and-go', t: p.t, index: r.a, meta });
    }
  }

  // Deduplicate close same-type events (< 20s)
  events.sort((a, b) => a.t - b.t);
  const dedup = [];
  for (const e of events) {
    const prev = dedup[dedup.length - 1];
    if (prev && prev.type === e.type && e.t - prev.t < 20000) continue;
    dedup.push(e);
  }
  return dedup;
}

export function formatEventClock(t0, t) {
  const sec = Math.max(0, Math.round((t - t0) / 1000));
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
