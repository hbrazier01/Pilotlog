/**
 * Cockpit Dashboard — bold glass-cockpit layout matching the "unlimited" concept.
 * Center hero: three.js + Terrarium terrain with SVG fallback. Live weather for the user's home airport.
 */
import { readinessScore, projectCheckride } from './lib/checkride/insights.mjs';
import { cockpitGates, acsTiles, logbookTimeline, progressBars } from './lib/checkride/cockpit.mjs';
import { chromeCss, renderNav, clockScript } from './lib/cockpit/chrome.mjs';
import { instructorBriefing, minutesAgoLabel } from './lib/cockpit/briefing.mjs';

const usd = (v) => '$' + Math.round(Number(v || 0)).toLocaleString('en-US');
const fmtDate = (iso) =>
  iso
    ? new Date(iso + 'T12:00:00Z').toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        timeZone: 'UTC',
      }).toUpperCase()
    : '—';
const fmtShort = (iso) =>
  iso
    ? new Date(iso + 'T12:00:00Z').toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        timeZone: 'UTC',
      }).toUpperCase()
    : '—';

function ring(r, frac, color, id) {
  const c = 2 * Math.PI * r;
  const o = (c * (1 - Math.min(1, frac))).toFixed(1);
  return `<circle cx="120" cy="120" r="${r}" class="track"/>
  <circle cx="120" cy="120" r="${r}" class="arc" stroke="${color}" style="--c:${c.toFixed(1)};--o:${o}" stroke-dasharray="${c.toFixed(1)}" stroke-dashoffset="${c.toFixed(1)}" filter="url(#glow)" data-ring="${id}"/>`;
}

function ticks() {
  let s = '';
  for (let i = 0; i < 60; i++) {
    const a = ((i * 6 - 90) * Math.PI) / 180;
    const long = i % 5 === 0;
    const r1 = 113,
      r2 = long ? 104 : 108;
    s += `<line x1="${(120 + r1 * Math.cos(a)).toFixed(1)}" y1="${(120 + r1 * Math.sin(a)).toFixed(1)}" x2="${(120 + r2 * Math.cos(a)).toFixed(1)}" y2="${(120 + r2 * Math.sin(a)).toFixed(1)}" class="${long ? 'tk l' : 'tk'}"/>`;
  }
  return s;
}

function fuelGauge(spent, remaining) {
  const total = spent + remaining;
  const frac = total ? spent / total : 0;
  const a = Math.PI * (1 - frac);
  const x = 100 + 70 * Math.cos(a);
  const y = 96 - 70 * Math.sin(a);
  return `<svg viewBox="0 0 200 116" class="fuel" role="img" aria-label="Budget used ${Math.round(frac * 100)}%">
    <path d="M22 96 A78 78 0 0 1 178 96" class="fz"/>
    <path d="M22 96 A78 78 0 0 1 178 96" class="fz-on" pathLength="100" style="--p:${(frac * 100).toFixed(1)}" filter="url(#glow)"/>
    <text x="16" y="113" class="fl">E</text><text x="184" y="113" class="fl" text-anchor="end">F</text>
    <line x1="100" y1="96" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" class="needle" style="--na:${(frac * 180).toFixed(1)}deg"/><circle cx="100" cy="96" r="5" class="hub"/>
  </svg>`;
}


/** HUD labels for the user's home airport (from weather.station). Escaped. */
export function stationLabels(station, esc = (x) => String(x ?? '')) {
  if (!station || !station.icao) {
    return { icao: 'HOME', sub: 'SET AIRPORT IN SETTINGS', long: 'NO HOME AIRPORT SET', origin: null };
  }
  const elev = Number.isFinite(station.elevFt) ? `${Number(station.elevFt).toLocaleString('en-US')} FT` : '';
  const rw = (station.runways || []).slice(0, 2).map((r) => r.id).join(' · ');
  const sub = [elev, rw ? `RWY ${rw}` : ''].filter(Boolean).join(' · ') || '—';
  const name = String(station.name || '').toUpperCase();
  const origin = Number.isFinite(station.lat) && Number.isFinite(station.lon)
    ? { lat: station.lat, lon: station.lon, elev: Number.isFinite(station.elevFt) ? station.elevFt / 3.28084 : 0 }
    : null;
  return {
    icao: esc(station.icao),
    sub: esc(sub),
    long: esc([station.icao, name].filter(Boolean).join(' ') + (elev ? ` · ${elev} MSL` : '')),
    origin,
  };
}

/** Stylized synthetic-vision hero: Front Range silhouette + DA40 + magenta gates. */
function synthVision(gates, st = stationLabels(null)) {
  const n = gates.gates.length;
  const W = 720,
    H = 420;
  const pathY = 210;
  const xs = gates.gates.map((_, i) => 90 + (i * (W - 160)) / (n - 1));
  const ys = gates.gates.map((_, i) => pathY + (i % 2 ? -28 : 18));
  const d = xs.map((x, i) => `${i ? 'L' : 'M'}${x} ${ys[i]}`).join(' ');
  const doneIdx = Math.max(0, gates.current);
  const doneD = xs
    .slice(0, doneIdx + 1)
    .map((x, i) => `${i ? 'L' : 'M'}${x} ${ys[i]}`)
    .join(' ');
  // Aircraft sits on active leg mid-point
  const ci = Math.min(gates.current, n - 1);
  const pi = Math.max(0, ci - 1);
  const ax = gates.current === 0 ? xs[0] : (xs[pi] + xs[ci]) / 2;
  const ay = gates.current === 0 ? ys[0] : (ys[pi] + ys[ci]) / 2 - 8;
  const ang =
    gates.current === 0
      ? -8
      : (Math.atan2(ys[ci] - ys[pi], xs[ci] - xs[pi]) * 180) / Math.PI;

  const gateNodes = gates.gates
    .map((g, i) => {
      const lit = g.done || i === gates.current;
      const cls = g.done ? 'gate done' : i === gates.current ? 'gate next' : 'gate';
      return `<g class="${cls}" transform="translate(${xs[i]} ${ys[i]})">
      <ellipse rx="28" ry="10" class="gate-ring"/>
      <ellipse rx="18" ry="6" class="gate-inner"/>
      <text y="-18" text-anchor="middle" class="gate-lab">${g.label.toUpperCase()}</text>
      ${lit ? '<circle r="3.5" class="gate-core"/>' : ''}
    </g>`;
    })
    .join('');

  return `<svg class="synth" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Training path over Front Range">
    <defs>
      <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#1a0a2e"/>
        <stop offset="35%" stop-color="#3d1a4a"/>
        <stop offset="55%" stop-color="#c45c2a"/>
        <stop offset="72%" stop-color="#f0a050"/>
        <stop offset="100%" stop-color="#1a2838"/>
      </linearGradient>
      <linearGradient id="mtn1" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#2a3548"/>
        <stop offset="100%" stop-color="#0d1520"/>
      </linearGradient>
      <linearGradient id="mtn2" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#3a4860"/>
        <stop offset="100%" stop-color="#121c2a"/>
      </linearGradient>
      <linearGradient id="sunG" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#fff5d0"/>
        <stop offset="40%" stop-color="#ffb040"/>
        <stop offset="100%" stop-color="#ff6a20" stop-opacity="0"/>
      </linearGradient>
      <filter id="mgGlow" x="-40%" y="-40%" width="180%" height="180%">
        <feGaussianBlur stdDeviation="4" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
      </filter>
      <filter id="softGlow" x="-50%" y="-50%" width="200%" height="200%">
        <feGaussianBlur stdDeviation="8" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
      </filter>
      <clipPath id="hudClip"><rect x="0" y="0" width="${W}" height="${H}" rx="18"/></clipPath>
    </defs>
    <g clip-path="url(#hudClip)">
      <rect width="${W}" height="${H}" fill="url(#sky)"/>
      <!-- sun -->
      <circle cx="520" cy="168" r="48" fill="url(#sunG)" opacity=".9" filter="url(#softGlow)"/>
      <circle cx="520" cy="168" r="22" fill="#ffe8a0" opacity=".95"/>
      <!-- far range -->
      <path fill="url(#mtn1)" d="M0 280 L40 250 L90 265 L140 210 L190 240 L250 180 L310 230 L360 195 L420 245 L480 200 L540 235 L600 190 L660 230 L720 210 L720 420 L0 420 Z"/>
      <!-- near range -->
      <path fill="url(#mtn2)" d="M0 320 L60 290 L120 310 L180 260 L240 295 L300 250 L380 285 L450 255 L520 290 L590 260 L660 295 L720 270 L720 420 L0 420 Z" opacity=".95"/>
      <!-- valley floor grid hint -->
      <g opacity=".18" stroke="#22d3ee" stroke-width=".6">
        <path d="M0 340 Q360 310 720 350"/><path d="M0 360 Q360 335 720 375"/><path d="M0 380 Q360 360 720 395"/>
        <path d="M120 300 L80 420"/><path d="M240 290 L220 420"/><path d="M360 285 L360 420"/><path d="M480 290 L500 420"/><path d="M600 295 L640 420"/>
      </g>
      <!-- magenta path -->
      <path d="${d}" fill="none" stroke="rgba(244,114,208,.25)" stroke-width="6" stroke-linecap="round"/>
      <path d="${d}" fill="none" stroke="rgba(255,255,255,.15)" stroke-width="2" stroke-dasharray="6 8"/>
      <path d="${doneD}" fill="none" stroke="#f472d0" stroke-width="3.5" stroke-linecap="round" filter="url(#mgGlow)" class="path-done"/>
      ${gateNodes}
      <!-- DA40 silhouette (simplified diamond-ish low-wing) -->
      <g transform="translate(${ax} ${ay}) rotate(${ang})" class="da40" filter="url(#mgGlow)">
        <path fill="none" stroke="#22d3ee" stroke-width="1.4" opacity=".9"
          d="M0 -6 L55 0 L0 6 L-8 18 L-14 18 L-6 4 L-28 6 L-34 14 L-40 14 L-36 0 L-40 -14 L-34 -14 L-28 -6 L-6 -4 L-14 -18 L-8 -18 Z"/>
        <path fill="rgba(34,211,238,.12)" stroke="#67e8f9" stroke-width="1"
          d="M4 -3 L42 0 L4 3 L-2 10 L-6 10 L0 2 L-22 3 L-26 8 L-30 8 L-28 0 L-30 -8 L-26 -8 L-22 -3 L0 -2 L-6 -10 L-2 -10 Z"/>
        <circle cx="38" cy="0" r="2.2" fill="#22d3ee"/>
      </g>
      <!-- HUD overlays -->
      <g class="hud" font-family="ui-monospace,SF Mono,Menlo,monospace" fill="#e6edf7">
        <g transform="translate(16 16)">
          <rect width="150" height="52" rx="8" fill="rgba(3,6,15,.55)" stroke="rgba(34,211,238,.25)"/>
          <text x="12" y="20" font-size="11" fill="#22d3ee" letter-spacing="1.5">${st.icao}</text>
          <text x="12" y="38" font-size="10" fill="#7d8aa5">${st.sub}</text>
        </g>
        <g transform="translate(${W - 166} 16)">
          <rect width="150" height="52" rx="8" fill="rgba(3,6,15,.55)" stroke="rgba(34,211,238,.25)"/>
          <text x="12" y="20" font-size="10" fill="#7d8aa5">TRK 031° · ALT 7,500</text>
          <text x="12" y="38" font-size="10" fill="#7d8aa5">VSI −200 FPM</text>
        </g>
        <g transform="translate(16 ${H - 48})">
          <rect width="220" height="32" rx="8" fill="rgba(3,6,15,.55)" stroke="rgba(34,211,238,.2)"/>
          <text x="12" y="21" font-size="10" fill="#a8b4cc">${st.long}</text>
        </g>
        <g transform="translate(${W / 2 - 70} ${H - 48})">
          <rect width="140" height="32" rx="8" fill="rgba(3,6,15,.55)" stroke="rgba(244,114,208,.3)"/>
          <text x="70" y="21" text-anchor="middle" font-size="11" fill="#f472d0" letter-spacing="1">HDG 032° · GS 96</text>
        </g>
      </g>
    </g>
  </svg>`;
}

function goBadge(decision) {
  const map = {
    GO: { cls: 'go', icon: '✓', label: 'GO' },
    'NO-GO': { cls: 'nogo', icon: '✕', label: 'NO-GO' },
    CAUTION: { cls: 'caut', icon: '!', label: 'CAUTION' },
    UNKNOWN: { cls: 'unk', icon: '?', label: 'UNKNOWN' },
  };
  const m = map[decision] || map.UNKNOWN;
  return `<span class="badge ${m.cls}"><i>${m.icon}</i> ${m.label}</span>`;
}

/** Large circular GO / NO-GO dial matching the concept. */
function goDial(decision) {
  const map = {
    GO: { cls: 'go', icon: '✓', label: 'GO', ring: '#34f5a0' },
    'NO-GO': { cls: 'nogo', icon: '✕', label: 'NO-GO', ring: '#fb7185' },
    CAUTION: { cls: 'caut', icon: '!', label: 'CAUTION', ring: '#fbbf24' },
    UNKNOWN: { cls: 'unk', icon: '?', label: '—', ring: '#64748b' },
  };
  const m = map[decision] || map.UNKNOWN;
  return `<div class="go-dial ${m.cls}" role="img" aria-label="Go/no-go ${m.label}">
  <svg viewBox="0 0 120 120" class="go-svg">
    <circle cx="60" cy="60" r="52" class="go-track"/>
    <circle cx="60" cy="60" r="52" class="go-arc" stroke="${m.ring}"/>
    <circle cx="60" cy="60" r="40" class="go-face"/>
  </svg>
  <div class="go-core"><span class="go-ico">${m.icon}</span><span class="go-lab">${m.label}</span></div>
</div>
<div class="go-caption">GO / NO-GO</div>`;
}

export function renderCockpitPage(cr, esc, { entries = [], demo = false, weather = null, briefing = null, user = null, settings = null } = {}) {
  const st = stationLabels(weather?.station, esc);
  const acLabel = settings?.aircraftLabel || cr.costs.rates.aircraftLabel || '';
  const score = readinessScore(cr);
  const proj = projectCheckride(cr, entries);
  const bars = progressBars(cr);
  const gates = cockpitGates(cr, entries);
  const tiles = acsTiles(cr.acs);
  const timeline = logbookTimeline(cr, entries, proj.date);
  const briefObj = briefing || instructorBriefing(cr);
  const focus = briefObj.focus || [];
  const brief = briefObj.spoken || briefObj.text || '';
  const briefAgo = minutesAgoLabel(briefObj.updatedAt);
  const p = cr.costs.projection;
  const days =
    proj.date != null
      ? Math.max(0, Math.round((new Date(proj.date) - new Date()) / 86400000))
      : null;

  const wx = weather || {
    demo: true,
    goNoGo: { decision: 'UNKNOWN', reasons: ['Weather loading…'], advisory: '' },
    metar: null,
    taf: null,
  };
  const go = wx.goNoGo || {};
  const metarRaw = wx.metar?.raw || '—';
  const tafRaw = wx.taf?.raw || '—';

  // Show a compact set of ACS tiles (first 5 with data priority: in_progress, mastered, pending)
  const tileOrder = [...tiles].sort((a, b) => {
    const rank = { in_progress: 0, mastered: 1, pending: 2 };
    return (rank[a.status] ?? 3) - (rank[b.status] ?? 3);
  });
  const showTiles = tileOrder.slice(0, 5);

  const barHtml = bars
    .map((b) => {
      if (b.key === 'written') {
        return `<div class="pbar"><div class="pbar-h"><span>${esc(b.label)}</span><span class="mono ${b.pass ? 'ok' : 'dim'}">${b.pass ? 'PASS' : '—'}</span></div>
        <div class="bar"><b style="width:${b.pct}%"></b></div></div>`;
      }
      const val =
        b.unit === 'HRS'
          ? `${b.actual} / ${b.required} ${b.unit}`
          : `${b.actual} / ${b.required}`;
      return `<div class="pbar"><div class="pbar-h"><span>${esc(b.label)}</span><span class="mono">${esc(val)}</span></div>
      <div class="bar"><b style="width:${b.pct}%"></b></div></div>`;
    })
    .join('');

  const tileHtml = showTiles
    .map(
      (t) => `<div class="tile ${esc(t.status)}">
      <div class="tile-top"><span class="mono c">${esc(t.area)}</span><span class="pill">${esc(t.label)}</span></div>
      <div class="tile-title">${esc(t.title)}</div>
      <div class="tile-n mono">${t.proficient}/${t.total}</div>
    </div>`
    )
    .join('');

  const tlHtml = timeline.nodes
    .map((n, i) => {
      const hrs = n.hours != null ? `${n.hours} HRS` : '—';
      const when = n.date ? fmtShort(n.date) : n.target ? 'TARGET' : '—';
      return `<div class="tl-n ${n.done ? 'done' : n.target ? 'target' : ''}">
        <div class="tl-dot"></div>
        <div class="tl-lab">${esc(n.label)}</div>
        <div class="tl-hrs mono">${esc(hrs)}</div>
        <div class="tl-dt">${esc(when)}</div>
      </div>${i < timeline.nodes.length - 1 ? '<div class="tl-line"></div>' : ''}`;
    })
    .join('');

  const briefItems =
    focus
      .map(
        (f, i) =>
          `<div class="fi"><span class="n">0${i + 1}</span><div><div>${esc(f.text)} <span class="tag">${esc(f.code)}</span></div><div class="s">${esc(f.sub)}</div></div></div>`
      )
      .join('') || '<div class="dim">Log a flight to generate your briefing.</div>';

  const remHrs =
    p.remainingDualHours != null || p.remainingSoloHours != null
      ? Math.round(((p.remainingDualHours || 0) + (p.remainingSoloHours || 0)) * 10) / 10
      : null;
  const rate = cr.costs.rates?.aircraftRate || 0;
  const remNote =
    remHrs != null && rate
      ? `≈ ${remHrs} HRS @ $${rate}/HR`
      : p.basis
        ? esc(String(p.basis).slice(0, 48))
        : '';

  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" content="#03060f">
<title>Cockpit — PilotLog</title>
<style>
:root{--bg:#03060f;--panel:rgba(14,22,40,.72);--line:rgba(120,160,255,.14);--txt:#e6edf7;--dim:#7d8aa5;--cy:#22d3ee;--gr:#34f5a0;--mg:#f472d0;--am:#fbbf24;--mono:ui-monospace,'SF Mono','JetBrains Mono',Menlo,Consolas,monospace}
*{box-sizing:border-box;margin:0;padding:0}
body{background:radial-gradient(1400px 700px at 50% -220px,#0c1a3a 0,transparent 55%),radial-gradient(900px 500px at 100% 100%,#1a0b2e66,transparent),var(--bg);color:var(--txt);font:14px/1.45 -apple-system,BlinkMacSystemFont,'Inter','Segoe UI',sans-serif;min-height:100vh;-webkit-font-smoothing:antialiased}
body:before{content:"";position:fixed;inset:0;pointer-events:none;background-image:linear-gradient(var(--line) 1px,transparent 1px),linear-gradient(90deg,var(--line) 1px,transparent 1px);background-size:48px 48px;mask-image:radial-gradient(ellipse at 50% 15%,#000 0,transparent 72%);opacity:.3}
a{color:var(--cy);text-decoration:none}
.mono{font-family:var(--mono);font-variant-numeric:tabular-nums}.dim{color:var(--dim)}.c{color:var(--cy)}.ok{color:var(--gr)}
.page{position:relative;max-width:1280px;margin:0 auto;padding:16px 18px 48px}
nav{display:flex;align-items:center;gap:2px;margin-bottom:16px;overflow-x:auto;scrollbar-width:none}
nav .brand{font-family:var(--mono);font-size:12px;letter-spacing:.22em;color:var(--cy);margin-right:12px;white-space:nowrap;display:flex;align-items:center;gap:8px}
nav .brand:before{content:"";width:18px;height:18px;background:conic-gradient(from 210deg,var(--cy),var(--mg),var(--am),var(--cy));border-radius:50%;box-shadow:0 0 12px rgba(34,211,238,.5)}
nav a{color:var(--dim);font-size:12px;letter-spacing:.08em;text-transform:uppercase;padding:7px 12px;border-radius:999px;white-space:nowrap}
nav a.on{color:var(--txt);background:rgba(34,211,238,.1);box-shadow:inset 0 0 0 1px rgba(34,211,238,.4)}
.nav-r{margin-left:auto;display:flex;align-items:center;gap:10px;font:600 10px var(--mono);letter-spacing:.12em;color:var(--dim)}
.live{display:inline-flex;align-items:center;gap:6px;color:var(--gr)}.live:before{content:"";width:7px;height:7px;border-radius:50%;background:var(--gr);box-shadow:0 0 8px var(--gr);animation:blink 1.6s infinite}
@keyframes blink{50%{opacity:.35}}
.demo{color:var(--mg);border:1px solid rgba(244,114,208,.45);padding:3px 8px;border-radius:999px}
.glass{background:var(--panel);border:1px solid var(--line);border-radius:20px;backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);box-shadow:0 1px 0 rgba(255,255,255,.04) inset,0 24px 60px -32px #000}
.eyebrow{font:600 10px var(--mono);letter-spacing:.2em;text-transform:uppercase;color:var(--dim)}

/* 3-column grid */
.grid{display:grid;grid-template-columns:minmax(240px,280px) minmax(0,1fr) minmax(240px,300px);gap:14px;align-items:stretch}
.col{display:flex;flex-direction:column;gap:14px;min-width:0}

/* left readiness */
.ready{padding:18px 16px 16px;text-align:center}
.gauge{position:relative;width:100%;max-width:220px;aspect-ratio:1;margin:0 auto 8px}
.gauge svg{width:100%;height:100%;transform:rotate(-90deg)}
.track{fill:none;stroke:rgba(255,255,255,.06);stroke-width:12}
.arc{fill:none;stroke-width:12;stroke-linecap:round;animation:fill 1.5s cubic-bezier(.2,.8,.2,1) .2s forwards}
.arc[data-ring=b]{animation-delay:.4s}.arc[data-ring=c]{animation-delay:.55s}
@keyframes fill{to{stroke-dashoffset:var(--o)}}
.tk{stroke:rgba(255,255,255,.14);stroke-width:1}.tk.l{stroke:rgba(255,255,255,.35);stroke-width:1.5}
.g-c{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center}
.g-pct{font:700 48px/1 var(--mono);letter-spacing:-.04em;text-shadow:0 0 24px rgba(34,211,238,.45)}
.g-pct small{font-size:.4em;color:var(--dim)}
.g-l{font:600 9px var(--mono);letter-spacing:.22em;color:var(--cy);margin-top:4px}
.proj{margin:10px 0 14px;padding:10px;border-radius:12px;background:rgba(255,255,255,.03);border:1px solid var(--line)}
.proj b{display:block;font:700 18px var(--mono);letter-spacing:-.02em}
.proj span{font:600 9px var(--mono);letter-spacing:.16em;color:var(--dim)}
.proj .days{color:var(--am);margin-top:2px;font:600 11px var(--mono)}
.pbar{margin-bottom:10px;text-align:left}
.pbar-h{display:flex;justify-content:space-between;gap:8px;font-size:12px;margin-bottom:4px}
.pbar-h .mono{font-size:11px;color:var(--dim)}
.bar{height:5px;background:rgba(255,255,255,.06);border-radius:9px;overflow:hidden}
.bar b{display:block;height:100%;background:linear-gradient(90deg,#0891b2,var(--cy));border-radius:9px;box-shadow:0 0 10px var(--cy)}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;width:100%;margin-top:8px;background:linear-gradient(180deg,#14324a,#0c2234);color:var(--cy);border:1px solid rgba(34,211,238,.45);border-radius:10px;padding:10px 12px;font:600 12px inherit;cursor:pointer;letter-spacing:.04em}
.btn:hover{box-shadow:0 0 18px rgba(34,211,238,.25)}

/* center synth — stretch to match side columns */
.col-center{display:flex;flex-direction:column;min-height:0;align-self:stretch;height:100%}
.hero{padding:0;overflow:hidden;position:relative;flex:1 1 auto;min-height:520px;width:100%;display:block}
.hero-stage{position:absolute;inset:0;width:100%;height:100%;background:#12081c}
.synth{position:absolute;inset:0;width:100%;height:100%;display:block;min-height:0}
.synth3d{position:absolute;inset:0;width:100%;height:100%;display:block;z-index:2;opacity:0;transition:opacity .6s ease}
.synth3d.on{opacity:1}
.synth-fallback{position:absolute;inset:0;z-index:1;width:100%;height:100%}
.synth-fallback .synth{position:absolute;inset:0;width:100%;height:100%}
.hero.webgl-on .synth-fallback{opacity:0;pointer-events:none}
.hero-hud{position:absolute;inset:0;z-index:3;pointer-events:none;font-family:var(--mono)}
.hero-hud .chip{position:absolute;background:rgba(3,6,15,.55);border:1px solid rgba(34,211,238,.25);border-radius:8px;padding:8px 10px;font-size:10px;color:#a8b4cc;letter-spacing:.04em;backdrop-filter:blur(6px)}
.hero-hud .chip b{color:var(--cy);display:block;font-size:11px;margin-bottom:2px}
.hero-hud .chip-tl{top:14px;left:14px}.hero-hud .chip-tr{top:14px;right:14px;text-align:right}
.hero-hud .chip-bl{bottom:14px;left:14px}.hero-hud .chip-bc{bottom:14px;left:50%;transform:translateX(-50%);border-color:rgba(244,114,208,.35);color:#f5b8e6}
.hero-loading{position:absolute;inset:0;z-index:4;display:grid;place-items:center;background:rgba(3,6,15,.35);font:600 11px var(--mono);letter-spacing:.18em;color:var(--cy);pointer-events:none;transition:opacity .4s}
.hero-loading.hide{opacity:0}
.voice-row{display:flex;align-items:center;gap:10px;margin-top:10px}
.voice-btn{flex:none;width:38px;height:38px;border-radius:50%;border:1px solid rgba(34,211,238,.45);background:linear-gradient(180deg,#14324a,#0c2234);color:var(--cy);cursor:pointer;display:grid;place-items:center}
.voice-btn:hover{box-shadow:0 0 14px rgba(34,211,238,.3)}
.voice-btn.talk{color:var(--mg);border-color:rgba(244,114,208,.55);box-shadow:0 0 16px rgba(244,114,208,.35)}
.voice-btn[hidden]{display:none!important}
.wave{display:flex;align-items:center;gap:3px;height:28px;opacity:.35}
.wave.on{opacity:1}
.wave i{display:block;width:3px;height:8px;border-radius:2px;background:var(--cy);animation:none}
.wave.on i{animation:wav 0.8s ease-in-out infinite alternate}
.wave.on i:nth-child(2){animation-delay:.1s}.wave.on i:nth-child(3){animation-delay:.2s}
.wave.on i:nth-child(4){animation-delay:.15s}.wave.on i:nth-child(5){animation-delay:.05s}
.wave.on i:nth-child(6){animation-delay:.25s}.wave.on i:nth-child(7){animation-delay:.12s}
@keyframes wav{from{height:6px;opacity:.5}to{height:22px;opacity:1}}
.path-done{stroke-dasharray:800;stroke-dashoffset:800;animation:draw 1.8s ease .3s forwards}
@keyframes draw{to{stroke-dashoffset:0}}
.gate .gate-ring{fill:none;stroke:rgba(255,255,255,.2);stroke-width:2}
.gate .gate-inner{fill:rgba(3,6,15,.4);stroke:rgba(255,255,255,.15);stroke-width:1}
.gate .gate-lab{font:700 11px var(--mono);letter-spacing:.14em;fill:var(--dim)}
.gate .gate-core{fill:var(--mg)}
.gate.done .gate-ring,.gate.next .gate-ring{stroke:var(--mg);filter:url(#mgGlow)}
.gate.done .gate-lab,.gate.next .gate-lab{fill:#f5b8e6}
.gate.next .gate-ring{animation:pulse 2s infinite}
@keyframes pulse{50%{stroke-opacity:.35}}
.da40{animation:float 4s ease-in-out infinite}
@keyframes float{50%{translate:0 -4px}}

/* right column */
.wx,.brief,.fuelc{padding:14px 14px 12px}
.wx-h{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px}
.badge{display:inline-flex;align-items:center;gap:5px;font:700 11px var(--mono);letter-spacing:.12em;padding:4px 10px;border-radius:999px}
.badge i{font-style:normal;font-size:12px}
.badge.go{color:#06281c;background:var(--gr);box-shadow:0 0 16px rgba(52,245,160,.45)}
.badge.nogo{color:#1a0505;background:#fb7185;box-shadow:0 0 16px rgba(251,113,133,.4)}
.badge.caut{color:#1a1200;background:var(--am);box-shadow:0 0 16px rgba(251,191,36,.4)}
.badge.unk{color:var(--dim);background:rgba(255,255,255,.08);border:1px solid var(--line)}
.raw{font:10px/1.4 var(--mono);color:#9aa8c0;background:rgba(0,0,0,.35);border:1px solid var(--line);border-radius:10px;padding:8px 9px;max-height:72px;overflow:auto;white-space:pre-wrap;word-break:break-word;margin:6px 0}
.adv{font:10px/1.35 var(--mono);color:#56627c;margin-top:6px}
.reasons{font:11px/1.4 var(--mono);color:var(--dim);margin:4px 0 2px}
.slip{display:flex;justify-content:space-between;font:600 9px var(--mono);letter-spacing:.16em;color:var(--dim);border-bottom:1px dashed rgba(255,255,255,.12);padding-bottom:8px;margin-bottom:8px}
.fi{display:flex;gap:10px;padding:7px 0;border-bottom:1px solid rgba(255,255,255,.05)}
.fi .n{font:700 12px var(--mono);color:var(--gr);width:20px;flex:none}
.fi .tag{font:600 8px var(--mono);letter-spacing:.1em;color:var(--gr);border:1px solid rgba(52,245,160,.35);border-radius:3px;padding:1px 4px;margin-left:4px}
.fi .s{font-size:11px;color:var(--dim)}
.fuel{width:100%;max-width:220px;display:block;margin:4px auto 0}
.fz{fill:none;stroke:rgba(255,255,255,.07);stroke-width:14;stroke-linecap:round}
.fz-on{fill:none;stroke:url(#fuelg);stroke-width:14;stroke-linecap:round;stroke-dasharray:100;stroke-dashoffset:100;animation:fz 1.5s cubic-bezier(.2,.8,.2,1) .4s forwards}
@keyframes fz{to{stroke-dashoffset:calc(100 - var(--p))}}
.fl{font:700 11px var(--mono);fill:var(--dim)}
.needle{stroke:#fff;stroke-width:2.5;stroke-linecap:round;transform-origin:100px 96px;animation:sw 1.5s cubic-bezier(.2,.8,.2,1) .4s both}
@keyframes sw{from{transform:rotate(calc(-1 * var(--na,0deg)))}}
.hub{fill:#fff}
.fuel-n{display:flex;justify-content:space-between;text-align:center;margin-top:4px}
.fuel-n b{display:block;font:600 16px var(--mono)}.fuel-n span{font:600 8px var(--mono);letter-spacing:.14em;color:var(--dim)}
.fuel-n .rem b{color:var(--am);text-shadow:0 0 14px rgba(251,191,36,.35)}
.fuel-note{text-align:center;font:600 10px var(--mono);color:var(--dim);margin-top:6px;letter-spacing:.06em}

/* bottom ACS + timeline */
.bottom{margin-top:14px;display:grid;gap:14px}
.acs-row{padding:14px}
.acs-h{display:flex;align-items:baseline;justify-content:space-between;margin-bottom:10px}
.tiles{display:grid;grid-template-columns:repeat(5,1fr);gap:10px}
.tile{padding:12px;border-radius:14px;background:rgba(255,255,255,.03);border:1px solid var(--line);min-width:0}
.tile-top{display:flex;justify-content:space-between;align-items:center;gap:6px;margin-bottom:6px}
.pill{font:700 8px var(--mono);letter-spacing:.1em;padding:2px 6px;border-radius:999px}
.tile.mastered .pill{color:#06281c;background:var(--gr)}
.tile.in_progress .pill{color:#1a1200;background:var(--am)}
.tile.pending .pill{color:var(--dim);background:rgba(255,255,255,.08)}
.tile-title{font-size:12px;font-weight:600;line-height:1.25;color:#c4cee0;min-height:2.4em}
.tile-n{font-size:18px;margin-top:8px;color:var(--txt)}
.tile.mastered{border-color:rgba(52,245,160,.25)}.tile.in_progress{border-color:rgba(251,191,36,.25)}

.tl{padding:16px 18px}
.tl-track{display:flex;align-items:flex-start;gap:0;margin-top:8px;overflow-x:auto}
.tl-n{flex:1;min-width:90px;text-align:center;position:relative}
.tl-dot{width:12px;height:12px;border-radius:50%;margin:0 auto 8px;background:var(--bg);border:2px solid rgba(255,255,255,.25);box-shadow:0 0 0 4px rgba(34,211,238,.08)}
.tl-n.done .tl-dot{border-color:var(--cy);background:var(--cy);box-shadow:0 0 12px var(--cy)}
.tl-n.target .tl-dot{border-color:var(--mg);box-shadow:0 0 12px rgba(244,114,208,.5)}
.tl-line{flex:0 0 24px;height:2px;background:rgba(34,211,238,.35);margin-top:5px;align-self:flex-start}
.tl-lab{font:700 10px var(--mono);letter-spacing:.1em;color:var(--cy)}
.tl-n.target .tl-lab{color:var(--mg)}
.tl-hrs{font-size:12px;margin-top:2px}.tl-dt{font:600 9px var(--mono);color:var(--dim);margin-top:2px}
.tl-sum{display:flex;gap:18px;justify-content:flex-end;margin-top:14px;padding-top:12px;border-top:1px solid var(--line);font:600 11px var(--mono);letter-spacing:.08em;color:var(--dim)}
.tl-sum b{color:var(--txt);font-size:14px;margin-left:6px}


.go-wrap{display:flex;flex-direction:column;align-items:center;margin:4px 0 8px}
.go-dial{position:relative;width:118px;height:118px}
.go-svg{width:100%;height:100%;display:block}
.go-track{fill:none;stroke:rgba(255,255,255,.08);stroke-width:8}
.go-arc{fill:none;stroke-width:8;stroke-linecap:round;filter:drop-shadow(0 0 10px currentColor)}
.go-face{fill:rgba(3,6,15,.55);stroke:rgba(255,255,255,.06);stroke-width:1}
.go-core{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px}
.go-ico{font:700 28px/1 var(--mono)}.go-lab{font:800 14px/1 var(--mono);letter-spacing:.14em}
.go-dial.go .go-ico,.go-dial.go .go-lab{color:var(--gr)}.go-dial.go .go-arc{filter:drop-shadow(0 0 14px #34f5a0)}
.go-dial.nogo .go-ico,.go-dial.nogo .go-lab{color:#fb7185}
.go-dial.caut .go-ico,.go-dial.caut .go-lab{color:var(--am)}
.go-dial.unk .go-ico,.go-dial.unk .go-lab{color:var(--dim)}
.go-caption{font:700 9px var(--mono);letter-spacing:.2em;color:var(--dim);margin-top:2px}
.wx-meta{display:inline-flex;align-items:center;gap:6px;font-size:10px}
.icon-btn{background:transparent;border:1px solid var(--line);color:var(--cy);border-radius:6px;width:22px;height:22px;cursor:pointer;font-size:13px;line-height:1;padding:0}
.icon-btn:hover{box-shadow:0 0 10px rgba(34,211,238,.3)}
.ai-badge{display:inline-block;font:800 8px var(--mono);letter-spacing:.14em;color:#031018;background:linear-gradient(135deg,var(--cy),var(--mg));padding:2px 6px;border-radius:4px;margin-left:6px;vertical-align:middle}
.brief-stamp{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:10px;padding-top:8px;border-top:1px dashed rgba(255,255,255,.1);font:600 9px var(--mono);letter-spacing:.12em}
.userchip{display:inline-flex;align-items:center;gap:8px;padding:4px 10px 4px 4px;border-radius:999px;border:1px solid var(--line);background:rgba(255,255,255,.03)}
.userchip .av{width:26px;height:26px;border-radius:50%;background:linear-gradient(135deg,#0891b2,#f472d0);display:grid;place-items:center;font:700 10px var(--mono);color:#031018}
.userchip .nm{font:600 10px var(--mono);letter-spacing:.08em;color:var(--txt);line-height:1.2}
.userchip .role{font:600 8px var(--mono);letter-spacing:.12em;color:var(--dim)}
.demo{color:var(--mg);border:1px solid rgba(244,114,208,.45);padding:3px 8px;border-radius:999px}
nav.top{display:flex;align-items:center;gap:2px;margin-bottom:16px;overflow-x:auto;scrollbar-width:none;padding-bottom:2px}
nav.top .brand{font-family:var(--mono);font-size:12px;letter-spacing:.22em;color:var(--cy);margin-right:12px;white-space:nowrap;display:flex;align-items:center;gap:8px}
nav.top .brand:before{content:"";width:18px;height:18px;background:conic-gradient(from 210deg,var(--cy),var(--mg),var(--am),var(--cy));border-radius:50%;box-shadow:0 0 12px rgba(34,211,238,.5)}
nav.top a{color:var(--dim);font-size:11px;letter-spacing:.1em;text-transform:uppercase;padding:7px 11px;border-radius:999px;white-space:nowrap;border-bottom:2px solid transparent}
nav.top a.on{color:var(--txt);background:rgba(34,211,238,.1);box-shadow:inset 0 0 0 1px rgba(34,211,238,.4);border-bottom-color:var(--cy)}

@media(max-width:1100px){
  .grid{grid-template-columns:1fr 1fr}
  .hero{grid-column:1/-1;order:-1}
  .tiles{grid-template-columns:repeat(3,1fr)}
}
@media(max-width:720px){
  .grid{grid-template-columns:1fr}
  .page{padding:12px 10px 40px}
  .tiles{grid-template-columns:1fr 1fr}
  .hero{min-height:360px}.hero-stage,.synth{min-height:0}
  .nav-r .clock{display:none}
  .g-pct{font-size:40px}
}
@media(prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}.arc{stroke-dashoffset:var(--o)}.path-done{stroke-dashoffset:0}.fz-on{stroke-dashoffset:calc(100 - var(--p))}}
</style></head><body>
<svg width="0" height="0" style="position:absolute"><defs>
<filter id="glow" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="3" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
<linearGradient id="fuelg" x1="0" x2="1"><stop offset="0" stop-color="#34f5a0"/><stop offset=".55" stop-color="#fbbf24"/><stop offset="1" stop-color="#f472d0"/></linearGradient>
</defs></svg>
<div class="page">
${renderNav(esc, { active: 'dashboard', demo, user, timeZone: settings?.timeZone || '' })}

<div class="grid">
  <div class="col">
    <section class="ready glass">
      <div class="eyebrow">Checkride Readiness</div>
      <div class="gauge">
        <svg viewBox="0 0 240 240">${ticks()}${ring(94, score.req, '#22d3ee', 'a')}${ring(76, score.acs, '#34f5a0', 'b')}${ring(58, score.end, '#f472d0', 'c')}</svg>
        <div class="g-c"><div class="g-pct" data-count="${score.pct}">0<small>%</small></div><div class="g-l">CHECKRIDE READY</div></div>
      </div>
      <div class="proj">
        <b class="mono">${proj.date ? fmtDate(proj.date) : '—'}</b>
        <span>PROJECTED DATE</span>
        ${days != null ? `<div class="days">≈ ${days} DAYS</div>` : ''}
      </div>
      ${barHtml}
      <a class="btn" href="/cockpit/acs${demo ? '?demo=1' : ''}">VIEW READINESS REPORT →</a>
    </section>
  </div>

  <div class="col col-center">
    <section class="hero glass" id="hero">
      <div class="hero-stage">
        <div class="synth-fallback">${synthVision(gates, st)}</div>
        <canvas class="synth3d" id="synth3d" aria-label="3D synthetic vision of ${st.icao}"></canvas>
        <div class="hero-hud" aria-hidden="true">
          <div class="chip chip-tl"><b>${st.icao}</b>${st.sub}</div>
          <div class="chip chip-tr"><b>TRK 031° · ALT 7,500</b>VSI −200 FPM</div>
          <div class="chip chip-bl">${st.long}</div>
          <div class="chip chip-bc">HDG 032° · GS 96</div>
        </div>
        <div class="hero-loading" id="heroLoad">LOADING TERRAIN…</div>
      </div>
    </section>
  </div>

  <div class="col">
    <section class="wx glass" id="wx">
      <div class="wx-h">
        <span class="eyebrow">Live Weather · ${st.icao}</span>${weather?.needsSetup ? `<a class="mono" style="font-size:10px" href="/cockpit/settings#airport">SET HOME AIRPORT →</a>` : ''}
        <span class="wx-meta mono dim"><span id="utcClock">— Z</span>
          <button type="button" class="icon-btn" id="wxRefresh" title="Refresh weather" aria-label="Refresh weather">↻</button>
        </span>
      </div>
      <div class="go-wrap">${goDial(go.decision || 'UNKNOWN')}</div>
      ${(go.reasons || []).length ? `<div class="reasons">${esc((go.reasons || []).slice(0, 3).join(' · '))}</div>` : ''}
      <div class="eyebrow" style="margin-top:6px">METAR</div>
      <div class="raw" id="metar">${esc(metarRaw)}</div>
      <div class="eyebrow">TAF</div>
      <div class="raw" id="taf">${esc(tafRaw)}</div>
      <div class="adv">${esc(go.advisory || wx.advisory || 'Advisory only — not a substitute for an official weather briefing.')}${wx.demo ? ' · SAMPLE weather.' : ''}${wx.stale ? ' · Stale cache.' : ''}</div>
    </section>

    <section class="brief glass">
      <div class="slip"><span>AI INSTRUCTOR BRIEFING <span class="ai-badge">AI</span></span><span>${esc(acLabel)}</span></div>
      ${briefItems}
      <div class="voice-row">
        <div class="wave" id="voiceWave" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div>
        <button type="button" class="voice-btn" id="voiceBtn" hidden title="Play briefing" aria-label="Play briefing">
          <svg id="voiceIcon" width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 14a3 3 0 0 0 3-3V5a3 3 0 1 0-6 0v6a3 3 0 0 0 3 3zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.9V21h2v-3.1A7 7 0 0 0 19 11h-2z"/></svg>
        </button>
      </div>
      <div class="brief-stamp mono dim">BRIEFING UPDATED ${esc(briefAgo).toUpperCase()} <button type="button" class="icon-btn" id="briefRefresh" title="Refresh briefing" aria-label="Refresh briefing">↻</button></div>
    </section>

    <section class="fuelc glass">
      <div class="wx-h"><span class="eyebrow">Budget Tracker</span><span class="mono dim">${usd(cr.costs.toDate)} OF ${usd(cr.costs.toDate + p.total)}</span></div>
      ${fuelGauge(cr.costs.toDate, p.total)}
      <div class="fuel-n">
        <div><b>${usd(cr.costs.toDate)}</b><span>SPENT</span></div>
        <div class="rem"><b>${usd(p.total)}</b><span>REMAINING</span></div>
      </div>
      ${remNote ? `<div class="fuel-note">${remNote}</div>` : ''}
    </section>
  </div>
</div>

<div class="bottom">
  <section class="acs-row glass">
    <div class="acs-h">
      <span class="eyebrow">ACS Tasks · ${cr.acs.total} total</span>
      <a class="mono dim" href="/cockpit/acs${demo ? '?demo=1' : ''}">${cr.acs.counts.proficient} proficient · ${cr.acs.counts.introduced} introduced →</a>
    </div>
    <div class="tiles">${tileHtml}</div>
  </section>

  <section class="tl glass">
    <div class="eyebrow">Logbook Timeline</div>
    <div class="tl-track">${tlHtml}</div>
    <div class="tl-sum">
      <span>TOTAL TIME <b>${timeline.totals.total} HRS</b></span>
      <span>PIC <b>${timeline.totals.pic} HRS</b></span>
      <span>DUAL <b>${timeline.totals.dual} HRS</b></span>
    </div>
  </section>
</div>
</div>
<script type="module">
const ORIGIN = ${JSON.stringify(st.origin)};
const GATE_STATE = ${JSON.stringify({ gates: gates.gates, current: gates.current }).replace(/</g, '\\u003c')};
const BRIEF_TEXT = ${JSON.stringify(brief).replace(/</g, '\\u003c')};

(function(){
  const el=document.querySelector('.g-pct'),to=+el.dataset.count,t0=performance.now()+200,d=1400;
  if(matchMedia('(prefers-reduced-motion: reduce)').matches){el.firstChild.nodeValue=to;return}
  (function f(t){const k=Math.max(0,Math.min(1,(t-t0)/d)),e=1-Math.pow(1-k,3);el.firstChild.nodeValue=Math.round(to*e);if(k<1)requestAnimationFrame(f)})(t0);
})();
(function(){
  const c=document.getElementById('clock');
  const u=document.getElementById('utcClock');
  function tick(){
    const n=new Date();
    try{ if(c){const parts=new Intl.DateTimeFormat('en-US',{timeZone:c.dataset.tz||undefined,hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false,timeZoneName:'short'}).formatToParts(n);const g=(t)=>(parts.find(p=>p.type===t)||{}).value||'';c.textContent=g('hour')+':'+g('minute')+':'+g('second')+' '+g('timeZoneName');} }
    catch{ if(c) c.textContent=n.toISOString().slice(11,19)+' Z'; }
    if(u) u.textContent=n.toISOString().slice(11,16)+'Z';
  }
  tick();setInterval(tick,1000);
})();

document.getElementById('wxRefresh')?.addEventListener('click',()=>{
  const q=new URLSearchParams(location.search); q.set('refresh','1');
  location.search=q.toString();
});
document.getElementById('briefRefresh')?.addEventListener('click',()=>location.reload());

(function(){
  const btn=document.getElementById('voiceBtn');
  const wave=document.getElementById('voiceWave');
  if(!btn || !('speechSynthesis' in window) || !window.SpeechSynthesisUtterance) return;
  btn.hidden=false;
  let speaking=false;
  function setTalk(on){
    speaking=on; btn.classList.toggle('talk',on); wave.classList.toggle('on',on);
  }
  btn.addEventListener('click',()=>{
    if(speaking){ speechSynthesis.cancel(); setTalk(false); return; }
    const u=new SpeechSynthesisUtterance(BRIEF_TEXT);
    u.rate=1; u.pitch=1;
    u.onend=u.onerror=()=>setTalk(false);
    setTalk(true); speechSynthesis.cancel(); speechSynthesis.speak(u);
  });
})();

(async function(){
  const hero=document.getElementById('hero');
  const canvas=document.getElementById('synth3d');
  const load=document.getElementById('heroLoad');
  try{
    const canvasTest=document.createElement('canvas');
    const gl=canvasTest.getContext('webgl')||canvasTest.getContext('experimental-webgl');
    if(!gl) throw new Error('no webgl');
    const { mountSynth3d }=await import('/js/cockpit-synth3d.js');
    const handle=mountSynth3d(canvas, GATE_STATE, ORIGIN);
    await handle.ready;
    canvas.classList.add('on');
    hero.classList.add('webgl-on');
    load?.classList.add('hide');
  }catch(err){
    console.warn('[cockpit] 3D fallback to SVG:', err);
    if(load) load.textContent='SVG VIEW';
    setTimeout(()=>load?.classList.add('hide'), 600);
  }
})();
</script>
</body></html>`;
}
