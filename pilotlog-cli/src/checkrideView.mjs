/**
 * Checkride view — "glass cockpit" design. SVG + CSS only, no dependencies.
 */
import { ACS_STATUSES, PHASES, PHASE_LABELS } from './lib/checkride/index.mjs';
import { whatsLeft } from './lib/checkride/summary.mjs';
import { readinessScore, projectCheckride, flightPath, nextLesson, briefText } from './lib/checkride/insights.mjs';

const usd = (v) => '$' + Math.round(Number(v || 0)).toLocaleString('en-US');
const fmtDate = (iso) => iso ? new Date(iso + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }) : '—';

function ring(r, frac, color, id) {
  const c = 2 * Math.PI * r;
  return `<circle cx="120" cy="120" r="${r}" class="track"/>
  <circle cx="120" cy="120" r="${r}" class="arc" stroke="${color}" style="--c:${c.toFixed(1)};--o:${(c * (1 - Math.min(1, frac))).toFixed(1)}" stroke-dasharray="${c.toFixed(1)}" stroke-dashoffset="${c.toFixed(1)}" filter="url(#glow)" data-ring="${id}"/>`;
}

function ticks() {
  let s = '';
  for (let i = 0; i < 60; i++) {
    const a = (i * 6 - 90) * Math.PI / 180, long = i % 5 === 0;
    const r1 = 113, r2 = long ? 104 : 108;
    s += `<line x1="${(120 + r1 * Math.cos(a)).toFixed(1)}" y1="${(120 + r1 * Math.sin(a)).toFixed(1)}" x2="${(120 + r2 * Math.cos(a)).toFixed(1)}" y2="${(120 + r2 * Math.sin(a)).toFixed(1)}" class="${long ? 'tk l' : 'tk'}"/>`;
  }
  return s;
}

function pathSvg(fp) {
  const n = fp.points.length, W = 1000, pad = 60, step = (W - 2 * pad) / (n - 1);
  const y = (i) => 52 + (i % 2 ? -14 : 14);
  const xy = fp.points.map((_, i) => [pad + i * step, y(i)]);
  const d = xy.map((p, i) => (i ? 'L' : 'M') + p[0] + ' ' + p[1]).join(' ');
  const cur = xy[fp.current], prev = xy[Math.max(0, fp.current - 1)];
  const doneD = xy.slice(0, fp.current + 1).map((p, i) => (i ? 'L' : 'M') + p[0] + ' ' + p[1]).join(' ');
  // place aircraft halfway along the active leg, heading along it
  const ax = fp.current ? (prev[0] + cur[0]) / 2 : cur[0], ay = fp.current ? (prev[1] + cur[1]) / 2 : cur[1];
  const ang = fp.current ? Math.atan2(cur[1] - prev[1], cur[0] - prev[0]) * 180 / Math.PI : 0;
  const wps = fp.points.map((p, i) => {
    const [x, yy] = xy[i], cls = p.done ? 'done' : i === fp.current ? 'next' : 'todo';
    const ly = i % 2 ? yy - 22 : yy + 34;
    return `<g class="wp ${cls}"><polygon points="${x},${yy - 9} ${x + 8},${yy + 5} ${x - 8},${yy + 5}"/>${p.done ? `<circle cx="${x}" cy="${yy + 1}" r="2.4" class="dot"/>` : ''}
      <text x="${x}" y="${ly}" text-anchor="middle">${p.label.toUpperCase()}</text></g>`;
  }).join('');
  return `<svg viewBox="0 0 ${W} 110" class="route" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Training flight path">
    <path d="${d}" class="leg"/><path d="${doneD}" class="leg-done" filter="url(#glow2)"/>
    ${wps}
    <g transform="translate(${ax} ${ay}) rotate(${ang})" class="plane"><path d="M14 0 L4 -2 L-2 -12 L-6 -12 L-3 -2 L-10 -2 L-13 -6 L-15 -6 L-14 0 L-15 6 L-13 6 L-10 2 L-3 2 L-6 12 L-2 12 L4 2 Z"/></g>
  </svg>`;
}

function fuelGauge(spent, remaining) {
  const total = spent + remaining, frac = total ? spent / total : 0;
  // 180° arc gauge, needle shows fraction of budget burned
  const a = Math.PI * (1 - frac), x = 100 + 70 * Math.cos(a), y = 96 - 70 * Math.sin(a);
  return `<svg viewBox="0 0 200 116" class="fuel" role="img" aria-label="Budget used ${Math.round(frac * 100)}%">
    <path d="M22 96 A78 78 0 0 1 178 96" class="fz"/>
    <path d="M22 96 A78 78 0 0 1 178 96" class="fz-on" pathLength="100" style="--p:${(frac * 100).toFixed(1)}" filter="url(#glow)"/>
    <text x="16" y="113" class="fl">E</text><text x="184" y="113" class="fl" text-anchor="end">F</text>
    <line x1="100" y1="96" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" class="needle" style="--na:${(frac * 180).toFixed(1)}deg"/><circle cx="100" cy="96" r="5" class="hub"/>
  </svg>`;
}

export function renderCheckridePage(cr, esc, { entries = [], demo = false } = {}) {
  const score = readinessScore(cr), proj = projectCheckride(cr, entries), fp = flightPath(cr, entries);
  const focus = nextLesson(cr), brief = briefText(focus);
  const p = cr.costs.projection, reqs = Object.values(cr.readiness.requirements);
  const endDone = cr.endorsements.filter(e => e.obtained).length;
  const dis = demo ? 'disabled' : '';
  const unmet = reqs.filter(r => !r.met);
  const top = whatsLeft(Object.fromEntries(unmet.slice(0, 3).map(r => [r.key, r])), []);
  const more = unmet.length - 3 + (cr.endorsements.length - endDone ? 1 : 0);
  const lede = unmet.length ? top.replace(/\.$/, '') + (more > 0 ? ` — plus ${more} more item${more === 1 ? '' : 's'}.` : '.') : cr.whatsLeft;

  const reqRows = reqs.map(r => `<div class="rq ${r.met ? 'met' : ''}"><div class="rq-h"><span>${esc(r.label)}</span>
      <span class="mono">${r.unit === 'event' ? (r.met ? 'DONE' : '—') : `${esc(r.actual)}<i>/${esc(r.required)}${r.unit === 'hours' ? 'h' : ''}</i>`}</span></div>
      <div class="bar"><b style="width:${r.pct}%"></b></div><div class="cite">${esc(r.regulation)}${r.note ? ' · ' + esc(r.note) : ''}</div></div>`).join('');
  const endRows = cr.endorsements.map(e => `<div class="en ${e.obtained ? 'met' : ''}" data-key="${esc(e.key)}">
      <span class="chk">${e.obtained ? '✓' : ''}</span><div class="en-t">${esc(e.label)}<div class="cite">${esc(e.regulation)}</div></div>
      <div class="en-f"><input type="date" name="date" value="${esc(e.date || '')}" ${dis}><input name="cfiName" placeholder="CFI" value="${esc(e.cfiName || '')}" ${dis}><input name="cfiCert" placeholder="Cert #" value="${esc(e.cfiCert || '')}" ${dis}>
      <button type="button" class="btn sm" onclick="saveEndorsement(this)" ${dis}>Save</button></div></div>`).join('');
  const acsHtml = cr.acs.areas.map(a => {
    const pr = a.tasks.filter(t => t.status === 'proficient').length;
    return `<div class="area"><div class="area-h"><span class="mono c">${esc(a.area)}</span> ${esc(a.title)}<span class="mono dim">${pr}/${a.tasks.length}</span></div>
      ${a.tasks.map(t => `<div class="task"><span class="pip ${t.status}"></span><span class="tt">${esc(t.letter)}. ${esc(t.title)}</span>
        <select data-task="${esc(t.id)}" onchange="saveAcs(this)" ${dis}>${ACS_STATUSES.map(st => `<option value="${st}" ${st === t.status ? 'selected' : ''}>${st.replace('_', ' ')}</option>`).join('')}</select></div>`).join('') || '<div class="dim sm-t">Not applicable to ASEL.</div>'}</div>`;
  }).join('');
  const phaseRows = cr.costs.byPhase.filter(x => x.flights).map(x => `<tr><td>${esc(x.label)}</td><td class="mono r">${x.hours}h</td><td class="mono r">${usd(x.total)}</td></tr>`).join('') || '<tr><td colspan="3" class="dim">No flights yet.</td></tr>';
  const fd = cr.flightDetails || {};
  const flightRows = cr.costs.flights.slice().reverse().map(f => {
    const d = fd[f.id] || {}, inp = (k, ph) => `<input name="${k}" placeholder="${ph}" value="${esc(d[k] ?? '')}" ${dis}>`;
    return `<div class="fl-row" data-id="${esc(f.id)}"><div class="fl-h"><span class="mono">${esc(f.date)}</span> <span class="dim">${esc(f.route)}</span><span class="mono r">${f.hours}h · ${usd(f.total)}</span></div>
      <div class="fl-g"><select name="phase" ${dis}><option value="">phase: auto</option>${PHASES.map(ph => `<option value="${ph}" ${d.phase === ph ? 'selected' : ''}>${esc(PHASE_LABELS[ph])}</option>`).join('')}</select>
      ${inp('aircraftRate', 'A/C $/h')}${inp('instructorRate', 'CFI $/h')}${inp('instructorHours', 'CFI hrs')}${inp('xcDistanceNm', 'XC NM')}${inp('fullStopPoints', 'stops')}${inp('longestLegNm', 'long leg')}${inp('towerFullStops', 'twr FS')}${inp('nightTakeoffs', 'night TO')}
      <label class="dim"><input type="checkbox" name="checkridePrep" ${d.checkridePrep ? 'checked' : ''} ${dis}> prep</label><button type="button" class="btn sm" onclick="saveFlight(this)" ${dis}>Save</button></div></div>`;
  }).join('') || '<div class="dim">No flights yet.</div>';

  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" content="#03060f"><title>Checkride Readiness — PilotLog</title><style>
:root{--bg:#03060f;--panel:rgba(14,22,40,.72);--line:rgba(120,160,255,.12);--txt:#e6edf7;--dim:#7d8aa5;--cy:#22d3ee;--gr:#34f5a0;--mg:#f472d0;--am:#fbbf24;--mono:ui-monospace,'SF Mono','JetBrains Mono',Menlo,Consolas,monospace}
*{box-sizing:border-box;margin:0;padding:0}
body{background:radial-gradient(1200px 600px at 50% -200px,#0c1a3a 0,transparent 60%),radial-gradient(800px 400px at 100% 100%,#1a0b2e55,transparent),var(--bg);color:var(--txt);font:15px/1.45 -apple-system,BlinkMacSystemFont,'Inter','Segoe UI',sans-serif;min-height:100vh;-webkit-font-smoothing:antialiased}
body:before{content:"";position:fixed;inset:0;pointer-events:none;background-image:linear-gradient(var(--line) 1px,transparent 1px),linear-gradient(90deg,var(--line) 1px,transparent 1px);background-size:44px 44px;mask-image:radial-gradient(ellipse at 50% 20%,#000 0,transparent 75%);opacity:.35}
a{color:var(--cy);text-decoration:none}
.mono{font-family:var(--mono);font-variant-numeric:tabular-nums}.dim{color:var(--dim)}.c{color:var(--cy)}.r{text-align:right;margin-left:auto}
.page{position:relative;max-width:1040px;margin:0 auto;padding:18px 20px 64px}
nav{display:flex;align-items:center;gap:4px;margin-bottom:22px;overflow-x:auto;scrollbar-width:none}
nav .brand{font-family:var(--mono);font-size:12px;letter-spacing:.2em;color:var(--cy);margin-right:14px;white-space:nowrap}
nav a{color:var(--dim);font-size:13px;padding:6px 11px;border-radius:999px;white-space:nowrap}nav a.on{color:var(--txt);background:rgba(34,211,238,.1);box-shadow:inset 0 0 0 1px rgba(34,211,238,.35)}
.demo{margin-left:auto;font:600 10px var(--mono);letter-spacing:.15em;color:var(--mg);border:1px solid rgba(244,114,208,.45);padding:4px 8px;border-radius:999px;white-space:nowrap}
.glass{background:var(--panel);border:1px solid var(--line);border-radius:22px;backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);box-shadow:0 1px 0 rgba(255,255,255,.04) inset,0 20px 60px -30px #000}
.eyebrow{font:600 11px var(--mono);letter-spacing:.22em;text-transform:uppercase;color:var(--dim)}
/* hero */
.hero{display:grid;grid-template-columns:minmax(260px,340px) 1fr;gap:28px;align-items:center;padding:26px 30px}
.gauge{position:relative;width:100%;max-width:340px;aspect-ratio:1;margin:0 auto}
.gauge svg{width:100%;height:100%;transform:rotate(-90deg)}
.track{fill:none;stroke:rgba(255,255,255,.06);stroke-width:13}
.arc{fill:none;stroke-width:13;stroke-linecap:round;animation:fill 1.6s cubic-bezier(.2,.8,.2,1) .25s forwards}
.arc[data-ring=b]{animation-delay:.45s}.arc[data-ring=c]{animation-delay:.65s}
@keyframes fill{to{stroke-dashoffset:var(--o)}}
.tk{stroke:rgba(255,255,255,.14);stroke-width:1}.tk.l{stroke:rgba(255,255,255,.35);stroke-width:1.6}
.g-c{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center}
.g-pct{font:700 64px/1 var(--mono);letter-spacing:-.04em;text-shadow:0 0 28px rgba(34,211,238,.45)}
.g-pct small{font-size:.42em;color:var(--dim);margin-left:2px}
.g-l{font:600 10px var(--mono);letter-spacing:.24em;color:var(--cy);margin-top:6px}
.hero h1{font-size:32px;font-weight:750;letter-spacing:-.025em;line-height:1.1;margin:8px 0 6px}
.hero .lede{color:var(--dim);max-width:46ch}
.eta{display:flex;gap:26px;flex-wrap:wrap;margin:20px 0 18px}
.eta div b{display:block;font:600 24px var(--mono);letter-spacing:-.02em}.eta div span{font:600 10px var(--mono);letter-spacing:.18em;color:var(--dim)}
.legend{display:grid;gap:8px}
.lg{display:flex;align-items:center;gap:10px;width:100%;background:rgba(255,255,255,.025);border:1px solid var(--line);border-radius:12px;padding:9px 12px;color:inherit;font:inherit;cursor:pointer;text-align:left;transition:transform .15s,border-color .2s,background .2s}
.lg:hover{border-color:rgba(34,211,238,.4);background:rgba(34,211,238,.05)}.lg:active{transform:scale(.98)}
.lg[aria-expanded=true]{border-color:currentColor;background:rgba(255,255,255,.05)}
.sw{width:10px;height:10px;border-radius:50%;box-shadow:0 0 10px currentColor;background:currentColor;flex:none}
.lg .t{font-size:13px;color:var(--txt)}.lg .v{margin-left:auto;font:600 14px var(--mono);color:var(--txt)}.lg .chev{color:var(--dim);transition:transform .3s}.lg[aria-expanded=true] .chev{transform:rotate(90deg)}
/* path */
.sec{margin-top:18px;padding:20px 22px}
.sec-h{display:flex;align-items:baseline;justify-content:space-between;gap:12px;margin-bottom:6px}
.route{width:100%;height:auto;display:block;overflow:visible}
.leg{fill:none;stroke:rgba(255,255,255,.18);stroke-width:2;stroke-dasharray:6 7}
.leg-done{fill:none;stroke:var(--mg);stroke-width:3;stroke-linecap:round;stroke-dasharray:1200;stroke-dashoffset:1200;animation:draw 1.8s ease .4s forwards}
@keyframes draw{to{stroke-dashoffset:0}}
.wp polygon{fill:var(--bg);stroke:rgba(255,255,255,.35);stroke-width:2}
.wp text{font:600 11px var(--mono);letter-spacing:.08em;fill:var(--dim)}
.wp.done polygon{stroke:var(--mg);fill:rgba(244,114,208,.18)}.wp.done text{fill:#f5b8e6}.wp .dot{fill:var(--mg)}
.wp.next polygon{stroke:var(--cy);animation:pulse 2s infinite}.wp.next text{fill:var(--cy)}
@keyframes pulse{50%{stroke-opacity:.35}}
.plane path{fill:#fff;filter:drop-shadow(0 0 6px var(--cy))}
/* grid */
.duo{display:grid;grid-template-columns:1.25fr 1fr;gap:18px;margin-top:18px}
.brief{padding:20px 22px;position:relative;overflow:hidden}
.brief:after{content:"";position:absolute;right:-60px;top:-60px;width:180px;height:180px;border-radius:50%;background:radial-gradient(circle,rgba(52,245,160,.12),transparent 70%)}
.slip{display:flex;justify-content:space-between;font:600 10px var(--mono);letter-spacing:.18em;color:var(--dim);border-bottom:1px dashed rgba(255,255,255,.14);padding-bottom:10px;margin-bottom:12px}
.fi{display:flex;gap:12px;padding:10px 0;border-bottom:1px solid rgba(255,255,255,.05);opacity:0;transform:translateY(6px);animation:in .5s ease forwards}
.fi:nth-child(2){animation-delay:.6s}.fi:nth-child(3){animation-delay:.75s}.fi:nth-child(4){animation-delay:.9s}
@keyframes in{to{opacity:1;transform:none}}
.fi .n{font:700 13px var(--mono);color:var(--gr);width:22px;flex:none;padding-top:1px}
.fi .tag{font:600 9px var(--mono);letter-spacing:.12em;color:var(--gr);border:1px solid rgba(52,245,160,.35);border-radius:4px;padding:1px 5px;margin-left:6px;vertical-align:2px}
.fi .s{font-size:12px;color:var(--dim)}
.btn{display:inline-flex;align-items:center;gap:8px;background:linear-gradient(180deg,#14324a,#0c2234);color:var(--cy);border:1px solid rgba(34,211,238,.45);border-radius:10px;padding:10px 14px;font:600 13px inherit;font-family:inherit;cursor:pointer;transition:transform .12s,box-shadow .2s}
.btn:hover{box-shadow:0 0 20px rgba(34,211,238,.25)}.btn:active{transform:scale(.97)}.btn.ok{color:var(--gr);border-color:rgba(52,245,160,.5)}
.btn.sm{padding:5px 10px;font-size:12px;border-radius:7px}.btn:disabled{opacity:.4;cursor:not-allowed}
.brief .btn{margin-top:14px}
.fuelc{padding:20px 22px;cursor:pointer;transition:border-color .2s}.fuelc:hover{border-color:rgba(251,191,36,.35)}
.fuel{width:100%;max-width:280px;display:block;margin:6px auto 0}
.fz{fill:none;stroke:rgba(255,255,255,.07);stroke-width:14;stroke-linecap:round}
.fz-on{fill:none;stroke:url(#fuelg);stroke-width:14;stroke-linecap:round;stroke-dasharray:100;stroke-dashoffset:100;animation:fz 1.6s cubic-bezier(.2,.8,.2,1) .5s forwards}
@keyframes fz{to{stroke-dashoffset:calc(100 - var(--p))}}
.fl{font:700 12px var(--mono);fill:var(--dim)}
.needle{stroke:#fff;stroke-width:2.5;stroke-linecap:round;transform-origin:100px 96px;animation:sw 1.6s cubic-bezier(.2,.8,.2,1) .5s both}
@keyframes sw{from{transform:rotate(calc(-1 * var(--na,0deg)))}}
.hub{fill:#fff}
.fuel-n{display:flex;justify-content:space-between;text-align:center;margin-top:8px}
.fuel-n b{display:block;font:600 20px var(--mono)}.fuel-n span{font:600 9px var(--mono);letter-spacing:.16em;color:var(--dim)}
.fuel-n .rem b{color:var(--am);text-shadow:0 0 18px rgba(251,191,36,.35)}
.whats{margin-top:18px;padding:14px 18px;font-size:14px;color:#c4cee0;border-left:3px solid var(--cy);border-radius:14px}
.whats b{font:600 10px var(--mono);letter-spacing:.2em;color:var(--cy);display:block;margin-bottom:3px}
/* expanding panels */
.panel{display:grid;grid-template-rows:0fr;transition:grid-template-rows .45s cubic-bezier(.2,.8,.2,1),margin .3s;margin-top:0}
.panel>div{overflow:hidden}.panel.open{grid-template-rows:1fr;margin-top:18px}
.panel .inner{padding:20px 22px}
.cols{display:grid;grid-template-columns:1fr 1fr;gap:10px 24px}
.rq{padding:8px 0}.rq-h{display:flex;justify-content:space-between;gap:10px;font-size:13px}.rq-h i{color:var(--dim);font-style:normal}
.bar{height:5px;background:rgba(255,255,255,.06);border-radius:9px;margin:6px 0 3px;overflow:hidden}.bar b{display:block;height:100%;background:linear-gradient(90deg,#0891b2,var(--cy));border-radius:9px;box-shadow:0 0 10px var(--cy)}
.rq.met .bar b{background:linear-gradient(90deg,#059669,var(--gr));box-shadow:0 0 10px var(--gr)}
.cite{font:10px var(--mono);color:#56627c}
.en{display:grid;grid-template-columns:22px 1fr;gap:4px 10px;padding:10px 0;border-top:1px solid rgba(255,255,255,.05)}
.chk{width:18px;height:18px;border-radius:5px;border:1.5px solid #39445e;display:grid;place-items:center;font-size:11px;color:var(--bg)}.en.met .chk{background:var(--gr);border-color:var(--gr);box-shadow:0 0 10px rgba(52,245,160,.5)}
.en-t{font-size:13px}.en-f{grid-column:2;display:flex;flex-wrap:wrap;gap:6px}
input,select{background:rgba(3,6,15,.7);color:var(--txt);border:1px solid #26314a;border-radius:7px;padding:6px 8px;font:12px var(--mono);min-width:0}
input:focus,select:focus{outline:none;border-color:var(--cy);box-shadow:0 0 0 3px rgba(34,211,238,.15)}
.areas{columns:2;column-gap:24px}.area{break-inside:avoid;padding:8px 0 10px}
.area-h{display:flex;gap:8px;font-size:13px;font-weight:600;margin-bottom:4px}.area-h .dim{margin-left:auto}
.task{display:flex;align-items:center;gap:9px;padding:3px 0 3px 4px;font-size:13px}.tt{flex:1;color:#c4cee0}
.task select{padding:3px 4px;font-size:11px}
.pip{width:8px;height:8px;border-radius:50%;border:1.5px solid #3a4560;flex:none}.pip.introduced{background:var(--am);border-color:var(--am);box-shadow:0 0 8px var(--am)}.pip.proficient{background:var(--gr);border-color:var(--gr);box-shadow:0 0 8px var(--gr)}
table{width:100%;border-collapse:collapse;font-size:13px}td{padding:8px 4px;border-bottom:1px solid rgba(255,255,255,.05)}
.rates{display:flex;flex-wrap:wrap;gap:8px;align-items:center;font-size:13px;margin:14px 0}
.rates input{width:84px}
details.fd{margin-top:14px}details.fd summary{cursor:pointer;color:var(--cy);font-size:13px;list-style:none}details.fd summary::-webkit-details-marker{display:none}details.fd summary:before{content:"›";display:inline-block;margin-right:6px;transition:transform .2s}details.fd[open] summary:before{transform:rotate(90deg)}
.fl-row{padding:10px 0;border-bottom:1px solid rgba(255,255,255,.05)}.fl-h{display:flex;gap:8px;font-size:13px;margin-bottom:6px}
.fl-g{display:flex;flex-wrap:wrap;gap:6px}.fl-g input{width:78px}
#toast{position:fixed;left:50%;bottom:22px;transform:translate(-50%,30px);opacity:0;background:#06281c;color:var(--gr);border:1px solid rgba(52,245,160,.4);padding:9px 16px;border-radius:999px;font:600 12px var(--mono);letter-spacing:.08em;transition:.3s;z-index:9}#toast.on{opacity:1;transform:translate(-50%,0)}
@media(max-width:820px){.hero{grid-template-columns:1fr;text-align:center;padding:22px 18px}.hero .lede{margin:0 auto}.eta{justify-content:center}.gauge{max-width:280px}.duo{grid-template-columns:1fr}.cols{grid-template-columns:1fr}.areas{columns:1}}
@media(max-width:520px){.page{padding:12px 12px 56px}.g-pct{font-size:52px}.hero h1{font-size:26px}.eta{display:grid;grid-template-columns:1.6fr 1fr 1fr;gap:8px}.eta div b{font-size:16px}.eta div span{font-size:8px;letter-spacing:.12em}.sec,.brief,.fuelc,.panel .inner{padding:16px}
 .route{display:none}.route-v{display:grid!important}}
.route-v{display:none;gap:0;margin-top:8px}
.rv{display:flex;align-items:center;gap:12px;font:600 12px var(--mono);letter-spacing:.06em;color:var(--dim);position:relative;padding:7px 0 7px 2px}
.rv:before{content:"";position:absolute;left:8px;top:-10px;bottom:50%;width:2px;background:rgba(255,255,255,.12)}.rv:first-child:before{display:none}
.rv.done:before{background:var(--mg)}.rv i{width:14px;height:14px;transform:rotate(45deg);border:2px solid #3a4560;background:var(--bg);position:relative;z-index:1;flex:none;margin-left:2px}
.rv.done{color:#f5b8e6}.rv.done i{border-color:var(--mg);background:rgba(244,114,208,.35)}.rv.next{color:var(--cy)}.rv.next i{border-color:var(--cy);box-shadow:0 0 10px var(--cy)}
.rv .you{margin-left:auto;font-size:10px;color:var(--cy);letter-spacing:.14em}
@media(prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}.arc{stroke-dashoffset:var(--o)}.leg-done{stroke-dashoffset:0}.fz-on{stroke-dashoffset:calc(100 - var(--p))}.fi{opacity:1;transform:none}}
</style></head><body>
<svg width="0" height="0" style="position:absolute"><defs>
<filter id="glow" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="3.2" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
<filter id="glow2" x="-10%" y="-60%" width="120%" height="220%"><feGaussianBlur stdDeviation="2.5" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
<linearGradient id="fuelg" x1="0" x2="1"><stop offset="0" stop-color="#34f5a0"/><stop offset=".6" stop-color="#fbbf24"/><stop offset="1" stop-color="#f472d0"/></linearGradient>
</defs></svg>
<div class="page">
<nav><span class="brand">PILOTLOG</span><a href="/">Dashboard</a><a href="/progression">Progression</a><a class="on" href="/checkride">Checkride</a><a href="/pilot-report">Pilot Report</a>${demo ? '<span class="demo">DEMO DATA</span>' : ''}</nav>

<section class="hero glass">
  <div class="gauge">
    <svg viewBox="0 0 240 240">${ticks()}${ring(94, score.req, '#22d3ee', 'a')}${ring(76, score.acs, '#34f5a0', 'b')}${ring(58, score.end, '#f472d0', 'c')}</svg>
    <div class="g-c"><div class="g-pct" data-count="${score.pct}">0<small>%</small></div><div class="g-l">READINESS</div></div>
  </div>
  <div>
    <div class="eyebrow">Private Pilot · ASEL</div>
    <h1>${score.pct >= 90 ? 'Cleared for the checkride.' : score.pct >= 50 ? 'On final for the checkride.' : 'Climbing toward your checkride.'}</h1>
    <p class="lede">${esc(lede)}</p>
    <div class="eta">
      <div><b class="mono">${proj.date ? fmtDate(proj.date) : '—'}</b><span>PROJECTED CHECKRIDE</span></div>
      <div><b class="mono">${proj.lessons || 0}</b><span>LESSONS TO GO</span></div>
      <div><b class="mono">${proj.perWeek || 0}<small class="dim">/wk</small></b><span>LESSON PACE</span></div>
    </div>
    <div class="legend">
      <button class="lg" style="color:#22d3ee" id="btn-req" aria-expanded="false" onclick="tog('req')"><span class="sw"></span><span class="t">FAA §61.109 requirements</span><span class="v">${cr.readiness.metCount}/${cr.readiness.totalCount}</span><span class="chev">›</span></button>
      <button class="lg" style="color:#34f5a0" id="btn-acs" aria-expanded="false" onclick="tog('acs')"><span class="sw"></span><span class="t">ACS tasks proficient</span><span class="v">${cr.acs.counts.proficient}/${cr.acs.total}</span><span class="chev">›</span></button>
      <button class="lg" style="color:#f472d0" id="btn-end" aria-expanded="false" onclick="tog('req')"><span class="sw"></span><span class="t">Endorsements</span><span class="v">${endDone}/${cr.endorsements.length}</span><span class="chev">›</span></button>
    </div>
  </div>
</section>

<div class="panel" id="panel-req"><div><div class="inner glass">
  <div class="sec-h"><span class="eyebrow">Aeronautical experience · §61.109(a)</span><a class="cite" href="${esc(cr.readiness.source)}" target="_blank" rel="noopener">eCFR ↗</a></div>
  <div class="rates">Checkride date <input type="date" id="testDate" value="${esc(cr.testDate || '')}" ${dis}><button class="btn sm" onclick="put('/api/checkride/test-date',{testDate:val('testDate')||null})" ${dis}>Set</button></div>
  <div class="cols">${reqRows}</div>
  <div class="eyebrow" style="margin:22px 0 4px">Endorsements</div>${endRows}
</div></div></div>
<div class="panel" id="panel-acs"><div><div class="inner glass">
  <div class="sec-h"><span class="eyebrow">${esc(cr.acs.standard)}</span><span class="mono dim">${cr.acs.counts.introduced} introduced</span></div>
  <div class="areas">${acsHtml}</div>
</div></div></div>

<section class="sec glass">
  <div class="sec-h"><span class="eyebrow">Flight path</span><span class="mono dim">LEG ${fp.current + 1} OF ${fp.points.length}</span></div>
  ${pathSvg(fp)}
  <div class="route-v">${fp.points.map((pt, i) => `<div class="rv ${pt.done ? 'done' : i === fp.current ? 'next' : ''}"><i></i>${esc(pt.label.toUpperCase())}${i === fp.current ? '<span class="you">✈ YOU ARE HERE</span>' : ''}</div>`).join('')}</div>
</section>

<div class="duo">
  <section class="brief glass">
    <div class="slip"><span>NEXT LESSON · BRIEFING</span><span>${esc(cr.costs.rates.aircraftLabel || '')}</span></div>
    ${focus.map((f, i) => `<div class="fi"><span class="n">0${i + 1}</span><div><div>${esc(f.text)}<span class="tag">${esc(f.code)}</span></div><div class="s">${esc(f.sub)}</div></div></div>`).join('') || '<div class="dim">Log a flight to generate your briefing.</div>'}
    <button class="btn" id="briefBtn" onclick="brief()"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg><span>Brief Giselle</span></button>
  </section>
  <section class="fuelc glass" onclick="tog('cost')" role="button" aria-expanded="false" id="btn-cost">
    <div class="sec-h"><span class="eyebrow">Fuel · training budget</span><span class="mono dim">${Math.round(score.budget * 100)}% burned</span></div>
    ${fuelGauge(cr.costs.toDate, p.total)}
    <div class="fuel-n"><div><b>${usd(cr.costs.toDate)}</b><span>SPENT</span></div><div class="rem"><b>${usd(p.total)}</b><span>TO CHECKRIDE</span></div><div><b>${usd(p.projectedTotalToCheckride)}</b><span>TOTAL</span></div></div>
  </section>
</div>

<div class="panel" id="panel-cost"><div><div class="inner glass">
  <div class="sec-h"><span class="eyebrow">Cost breakdown</span><span class="mono dim">${p.remainingDualHours}h dual + ${p.remainingSoloHours}h solo</span></div>
  <table>${phaseRows}<tr><td><b>Spent to date</b></td><td></td><td class="mono r"><b>${usd(cr.costs.toDate)}</b></td></tr><tr><td class="c">Projected remaining</td><td class="mono r dim">~${p.estimatedLessons} lessons</td><td class="mono r c"><b>${usd(p.total)}</b></td></tr></table>
  <div class="rates">Aircraft <input id="aircraftLabel" value="${esc(cr.costs.rates.aircraftLabel || '')}" ${dis}> $<input id="aircraftRate" value="${esc(cr.costs.rates.aircraftRate)}" ${dis}>/h · CFI $<input id="instructorRate" value="${esc(cr.costs.rates.instructorRate)}" ${dis}>/h
    <button class="btn sm" onclick="put('/api/checkride/rates',{aircraftLabel:val('aircraftLabel'),aircraftRate:val('aircraftRate'),instructorRate:val('instructorRate')})" ${dis}>Save</button></div>
  <div class="cite">${esc(p.basis)}</div>
  <details class="fd"><summary>Edit flight details</summary><div style="margin-top:8px">${flightRows}</div></details>
</div></div></div>

</div><div id="toast">SAVED</div>
<script>
const BRIEF=${JSON.stringify(brief).replace(/</g, '\\u003c')};
function val(id){return document.getElementById(id).value}
function toast(t){const e=document.getElementById('toast');e.textContent=t;e.classList.add('on');setTimeout(()=>e.classList.remove('on'),1600)}
function tog(n){const p=document.getElementById('panel-'+n),open=!p.classList.contains('open');
  document.querySelectorAll('.panel').forEach(x=>x.classList.remove('open'));
  document.querySelectorAll('[aria-expanded]').forEach(b=>b.setAttribute('aria-expanded','false'));
  if(open){p.classList.add('open');(n==='req'?['btn-req','btn-end']:['btn-'+n]).forEach(id=>document.getElementById(id).setAttribute('aria-expanded','true'));setTimeout(()=>p.scrollIntoView({behavior:'smooth',block:'nearest'}),120)}}
async function brief(){const b=document.getElementById('briefBtn');
  try{await navigator.clipboard.writeText(BRIEF)}catch{const t=document.createElement('textarea');t.value=BRIEF;document.body.appendChild(t);t.select();document.execCommand('copy');t.remove()}
  b.classList.add('ok');b.querySelector('span').textContent='Copied ✓';setTimeout(()=>{b.classList.remove('ok');b.querySelector('span').textContent='Brief Giselle'},1800)}
async function put(url,body){const r=await fetch(url,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const j=await r.json().catch(()=>({}));if(!r.ok){alert(j.error||'Save failed');return}toast('SAVED');setTimeout(()=>location.reload(),500)}
function rowData(el){const o={};el.querySelectorAll('input,select').forEach(i=>{o[i.name]=i.type==='checkbox'?i.checked:i.value});return o}
function saveEndorsement(b){const r=b.closest('[data-key]');put('/api/checkride/endorsements/'+encodeURIComponent(r.dataset.key),rowData(r))}
function saveFlight(b){const r=b.closest('[data-id]');put('/api/checkride/flights/'+encodeURIComponent(r.dataset.id),rowData(r))}
function saveAcs(s){fetch('/api/checkride/acs/'+encodeURIComponent(s.dataset.task),{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({status:s.value})}).then(r=>{if(!r.ok)alert('Save failed');else{s.closest('.task').querySelector('.pip').className='pip '+s.value;toast('SAVED')}})}
(function(){const el=document.querySelector('.g-pct'),to=+el.dataset.count,t0=performance.now()+250,d=1500;
  if(matchMedia('(prefers-reduced-motion: reduce)').matches){el.firstChild.nodeValue=to;return}
  (function f(t){const k=Math.max(0,Math.min(1,(t-t0)/d)),e=1-Math.pow(1-k,3);el.firstChild.nodeValue=Math.round(to*e);if(k<1)requestAnimationFrame(f)})(t0)})();
</script></body></html>`;
}
