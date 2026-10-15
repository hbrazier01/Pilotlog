/**
 * Flight Replay dashboard — Mission Map + 3D replay + Today's Call + Debrief + ACS strip.
 */
import { chromeCss, renderNav, clockScript } from './lib/cockpit/chrome.mjs';
import { formatEventClock } from './lib/replay/events.mjs';
import { trackStats } from './lib/replay/parse.mjs';

function fmtClock(sec) {
  const s = Math.max(0, Math.round(sec));
  const m = Math.round(Math.floor(s / 60));
  const r = s % 60;
  return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
}

function miniTrackSvg(points, w = 220, h = 120) {
  if (!points?.length) return '';
  let minLat = Infinity, maxLat = -Infinity, minLon = Infinity, maxLon = -Infinity;
  for (const p of points) {
    minLat = Math.min(minLat, p.lat); maxLat = Math.max(maxLat, p.lat);
    minLon = Math.min(minLon, p.lon); maxLon = Math.max(maxLon, p.lon);
  }
  const pad = 8;
  const sx = (lon) => pad + ((lon - minLon) / Math.max(1e-9, maxLon - minLon)) * (w - pad * 2);
  const sy = (lat) => h - pad - ((lat - minLat) / Math.max(1e-9, maxLat - minLat)) * (h - pad * 2);
  const d = points.map((p, i) => `${i ? 'L' : 'M'}${sx(p.lon).toFixed(1)} ${sy(p.lat).toFixed(1)}`).join(' ');
  return `<svg class="mini-track" viewBox="0 0 ${w} ${h}" width="100%" height="${h}" aria-hidden="true">
    <rect width="${w}" height="${h}" rx="10" fill="rgba(0,0,0,.35)"/>
    <path d="${d}" fill="none" stroke="#22d3ee" stroke-width="2.2" stroke-linecap="round" opacity=".95"/>
  </svg>`;
}

export function renderReplayPage(esc, {
  demo = false,
  user = null,
  track = null,
  mission = null,
  call = null,
  acsStrip = [],
  cr = null,
  settings = null,
  station = null,
} = {}) {
  const tz = settings?.timeZone || '';
  const callStation = station?.icao || '';
  const booking = call?.booking || { kind: 'setup', label: 'Set up scheduling', href: '/cockpit/settings#scheduling' };
  const t = track || { points: [], events: [], label: 'No track', sample: demo };
  const points = t.points || [];
  const t0 = points[0]?.t || 0;
  const t1 = points[points.length - 1]?.t || t0;
  const dur = (t1 - t0) / 1000;
  const stats = trackStats(points);
  const events = t.events || [];
  const missionItems = (mission?.items || [])
    .map((it) => {
      const icon =
        it.status === 'complete' ? '✓' : it.status === 'in_progress' ? '●' : '🔒';
      return `<div class="ms ${esc(it.status)}">
        <div class="ms-dot">${icon}</div>
        <div><div class="ms-lab">${esc(it.label)}</div><div class="ms-d dim">${esc(it.detail)}</div></div>
      </div>`;
    })
    .join('');

  const callDec = call?.decision || 'UNKNOWN';
  const callCls = callDec === 'GO' ? 'go' : callDec === 'CAUTION' ? 'caut' : callDec === 'NO-GO' ? 'nogo' : 'unk';
  const chips = call?.chips || {};
  const eventMarks = events
    .map((e) => {
      const u = dur > 0 ? (e.t - t0) / (t1 - t0) : 0;
      const clock = formatEventClock(t0, e.t);
      return `<button type="button" class="ev" style="left:${(u * 100).toFixed(2)}%" data-u="${u.toFixed(4)}" title="${esc(e.label)} ${clock}">
        <span class="ev-pip"></span><span class="ev-lab">${esc(e.label)} ${clock}</span>
      </button>`;
    })
    .join('');

  const skills = (t.skills || events.map((e) => e.label))
    .slice(0, 4)
    .map((s) => `<span class="skill">${esc(s)}</span>`)
    .join('');

  const acsHtml = acsStrip
    .map(
      (a) => `<div class="acs-card">
      <div class="acs-pct mono">${a.pct}%</div>
      <div class="acs-lab">${esc(a.label)}</div>
      <div class="acs-lvl ${a.pct >= 80 ? 'ok' : a.pct >= 40 ? 'am' : 'dim'}">${esc(a.level)}</div>
      <div class="acs-bar"><b style="width:${a.pct}%"></b></div>
    </div>`
    )
    .join('');

  const trackJson = JSON.stringify({
    points: points.map((p) => ({ t: p.t, lat: p.lat, lon: p.lon, altFt: p.altFt, gsKt: p.gsKt, hdgDeg: p.hdgDeg })),
    events,
    sample: !!t.sample,
    label: t.label,
    aircraftType: settings?.aircraftType || '',
  }).replace(/</g, '\\u003c');

  const css = `
${chromeCss()}
.replay-grid{display:grid;grid-template-columns:minmax(220px,260px) minmax(0,1fr) minmax(240px,300px);gap:14px;align-items:stretch}
.col{display:flex;flex-direction:column;gap:14px;min-width:0}
.mission{padding:16px 14px}
.mission h2{font-size:13px;letter-spacing:.16em;text-transform:uppercase;color:var(--dim);margin:0 0 12px;font-family:var(--mono)}
.ms{display:flex;gap:10px;padding:8px 0;border-bottom:1px solid rgba(255,255,255,.05);align-items:flex-start}
.ms-dot{width:22px;height:22px;border-radius:50%;display:grid;place-items:center;font-size:11px;flex:none;border:1px solid var(--line);background:rgba(0,0,0,.3)}
.ms.complete .ms-dot{background:var(--mg);color:#1a0514;border-color:transparent;box-shadow:0 0 12px rgba(244,114,208,.45)}
.ms.in_progress .ms-dot{color:var(--am);border-color:var(--am);box-shadow:0 0 10px rgba(251,191,36,.35)}
.ms.locked .ms-dot{opacity:.55}
.ms-lab{font-weight:650;font-size:13px}.ms-d{font-size:11px;margin-top:2px}
.ready-row{display:flex;gap:12px;align-items:center;margin-top:14px;padding-top:12px;border-top:1px solid var(--line)}
.ring{width:72px;height:72px;border-radius:50%;background:conic-gradient(var(--cy) calc(var(--p)*1%),rgba(255,255,255,.08) 0);display:grid;place-items:center;flex:none}
.ring>i{width:56px;height:56px;border-radius:50%;background:rgba(3,6,15,.92);display:grid;place-items:center;font:700 14px var(--mono);font-style:normal}
.next b{display:block;font-size:13px;margin-top:2px}
.hero{position:relative;min-height:540px;overflow:hidden;flex:1;padding:0}
.hero-stage{position:absolute;inset:0;background:#05070f}
.replay3d{position:absolute;inset:0;width:100%;height:100%;opacity:0;transition:opacity .5s;z-index:2}
.replay3d.on{opacity:1}
.hero-hud{position:absolute;inset:0;z-index:3;pointer-events:none;font-family:var(--mono)}
.hero-hud .chip{position:absolute;background:rgba(3,6,15,.55);border:1px solid rgba(34,211,238,.25);border-radius:8px;padding:8px 10px;font-size:10px;color:#a8b4cc;backdrop-filter:blur(6px)}
.hero-hud .chip b{color:var(--cy);display:block;font-size:11px;margin-bottom:2px}
.hero-hud .chip .mg{color:var(--mg)}
.chip-tl{top:14px;left:14px}.chip-tr{top:14px;right:14px;text-align:right}
.chip-bl{bottom:86px;left:14px;display:flex;gap:8px;align-items:center}
.view-btn{pointer-events:auto;cursor:pointer;font:700 10px var(--mono);letter-spacing:.08em;color:var(--cy);background:rgba(34,211,238,.08);border:1px solid rgba(34,211,238,.45);border-radius:999px;padding:6px 10px}
.compass{width:44px;height:44px;border-radius:50%;border:1px solid rgba(34,211,238,.45);display:grid;place-items:center;color:var(--cy);font:700 12px var(--mono)}
.playbar{position:absolute;left:12px;right:12px;bottom:12px;z-index:4;pointer-events:auto;padding:10px 12px;display:grid;gap:8px}
.play-row{display:flex;align-items:center;gap:10px}
.play-btn{width:36px;height:36px;border-radius:50%;border:1px solid rgba(34,211,238,.45);background:linear-gradient(180deg,#14324a,#0c2234);color:var(--cy);cursor:pointer;display:grid;place-items:center}
.scrub{position:relative;flex:1;height:28px;display:flex;align-items:center}
.scrub input[type=range]{width:100%;accent-color:var(--cy);cursor:pointer}
.ev{position:absolute;top:-2px;transform:translateX(-50%);background:none;border:0;padding:0;cursor:pointer;pointer-events:auto}
.ev-pip{display:block;width:8px;height:8px;border-radius:50%;background:var(--mg);box-shadow:0 0 8px var(--mg);margin:0 auto}
.ev-lab{display:block;font:600 8px var(--mono);letter-spacing:.04em;color:#f5b8e6;white-space:nowrap;margin-top:2px;opacity:0;transition:opacity .15s}
.ev:hover .ev-lab,.scrub:hover .ev-lab{opacity:1}
.speed{font:600 10px var(--mono);color:var(--dim)}
.speed select{width:auto;padding:4px 6px}
.call,.debrief{padding:14px}
.call-h{display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:10px}
.go-big{font:800 28px/1 var(--mono);letter-spacing:-.02em}
.go-big.go{color:var(--gr);text-shadow:0 0 18px rgba(52,245,160,.4)}
.go-big.caut{color:var(--am)}.go-big.nogo{color:#fb7185}
.suggest{font-size:14px;font-weight:600;margin:8px 0 12px;line-height:1.35}
.chips{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:12px}
.chipx{font:600 10px var(--mono);letter-spacing:.04em;padding:5px 8px;border-radius:8px;background:rgba(255,255,255,.04);border:1px solid var(--line);color:#c4cee0}
.chipx b{color:var(--cy);display:block;font-size:9px;letter-spacing:.12em;margin-bottom:2px}
.adv{font:10px/1.35 var(--mono);color:#56627c;margin-top:8px}
.debrief-h{display:flex;justify-content:space-between;align-items:baseline;gap:8px;margin-bottom:8px}
.share-tag{font:700 8px var(--mono);letter-spacing:.14em;color:var(--mg);border:1px solid rgba(244,114,208,.45);padding:2px 6px;border-radius:999px}
.skills{display:flex;flex-wrap:wrap;gap:6px;margin:8px 0}
.skill{font:600 10px var(--mono);padding:4px 8px;border-radius:999px;background:rgba(34,211,238,.1);border:1px solid rgba(34,211,238,.35);color:var(--cy)}
.acs-strip{margin-top:14px;padding:14px;display:grid;grid-template-columns:repeat(6,1fr);gap:10px}
.acs-card{padding:12px;border-radius:14px;background:rgba(255,255,255,.03);border:1px solid var(--line)}
.acs-pct{font-size:22px;font-weight:700}.acs-lab{font-size:11px;font-weight:600;margin:4px 0;min-height:2.4em;color:#c4cee0}
.acs-lvl{font:700 9px var(--mono);letter-spacing:.1em}.acs-bar{height:4px;background:rgba(255,255,255,.06);border-radius:9px;margin-top:8px;overflow:hidden}
.acs-bar b{display:block;height:100%;background:linear-gradient(90deg,#0891b2,var(--cy))}
.sample-banner{display:inline-flex;align-items:center;gap:6px;font:700 9px var(--mono);letter-spacing:.14em;color:var(--mg);border:1px solid rgba(244,114,208,.45);padding:3px 8px;border-radius:999px;margin-left:8px}
.terrain-note{font:9px/1.3 var(--mono);color:#56627c;margin-top:6px}
@media(max-width:1100px){.replay-grid{grid-template-columns:1fr 1fr}.hero{grid-column:1/-1;order:-1;min-height:420px}.acs-strip{grid-template-columns:repeat(3,1fr)}}
@media(max-width:720px){.replay-grid{grid-template-columns:1fr}.acs-strip{grid-template-columns:1fr 1fr}.hero{min-height:480px}.ev-lab{display:none}}
`;

  const next = mission?.nextMilestone;
  const ringP = mission?.readinessPct ?? 0;

  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" content="#03060f">
<title>Flight Replay — PilotLog</title>
<style>${css}</style></head><body>
<div class="page">
${renderNav(esc, { active: 'replay', demo, user, timeZone: tz })}
<div class="replay-grid">
  <div class="col">
    <section class="mission glass">
      <h2>Mission Map · §61.109(a)</h2>
      ${missionItems || '<p class="dim">No requirements data.</p>'}
      <div class="ready-row">
        <div class="ring" style="--p:${ringP}"><i>${ringP}%</i></div>
        <div class="next dim">
          <span class="eyebrow">${mission?.onTrack ? 'On Track' : 'Building'}</span>
          <b>${esc(next?.label || '—')}</b>
          <div class="mono" style="font-size:11px;margin-top:4px">${
            next?.actual != null
              ? `${esc(String(next.actual))} of ${esc(String(next.required))} ${esc(next.unit || '')}`
              : esc(next?.detail || '')
          }</div>
        </div>
      </div>
    </section>
  </div>

  <div class="col">
    <section class="hero glass" id="hero">
      <div class="hero-stage">
        <canvas class="replay3d" id="replay3d" aria-label="3D flight replay"></canvas>
        <div class="hero-hud">
          <div class="chip chip-tl">
            <b>REPLAY MODE${t.sample ? ' <span class="sample-banner">SAMPLE</span>' : ''}</b>
            <span class="mg">${esc(t.label || 'Flight track')}</span>
            <div id="hudClock" class="mg" style="margin-top:4px">—</div>
          </div>
          <div class="chip chip-tr">
            <b id="hudAlt">ALT — FT</b>
            <span id="hudGs">GS — KT · HDG —°</span>
            <div style="margin-top:4px">GPS 3D</div>
          </div>
          <div class="chip chip-bl"><div class="compass">N</div><button type="button" class="view-btn" id="viewBtn" aria-label="Toggle camera view">ORBIT</button></div>
        </div>
        <div class="playbar glass">
          <div class="play-row">
            <button type="button" class="play-btn" id="playBtn" aria-label="Play/Pause">▶</button>
            <span class="mono dim" id="timeLabel">00:00 / ${fmtClock(dur)}</span>
            <div class="scrub">
              <input type="range" id="scrub" min="0" max="1000" value="0" aria-label="Scrub timeline"/>
              ${eventMarks}
            </div>
            <label class="speed">SPD
              <select id="speed">
                <option value="0.5">0.5×</option>
                <option value="1" selected>1×</option>
                <option value="2">2×</option>
                <option value="4">4×</option>
              </select>
            </label>
          </div>
          <div class="terrain-note">Terrain: stylized Terrarium elevation. Photoreal satellite draping needs a Cesium/Google (or ArcGIS) key — Esri World Imagery terms do not clearly permit commercial product use without a subscription.</div>
        </div>
      </div>
    </section>
  </div>

  <div class="col">
    <section class="call glass">
      <div class="call-h">
        <span class="eyebrow">Today's Call${callStation ? ' · ' + esc(callStation) : ''}</span>
        <span class="go-big ${callCls}">${esc(callDec)}${callDec === 'GO' ? ' →' : ''}</span>
      </div>
      <div class="suggest">${esc(call?.suggested || '—')}</div>
      <div class="chips">
        <div class="chipx"><b>WIND</b>${esc(chips.wind || '—')}</div>
        <div class="chipx"><b>XWIND</b>${esc(chips.crosswind || '—')}</div>
        <div class="chipx"><b>CEILING</b>${esc(chips.ceiling || '—')}</div>
        <div class="chipx"><b>VIS</b>${esc(chips.visibility || '—')}</div>
      </div>
      ${booking.kind === 'book'
        ? `<a class="btn" id="bookBtn" data-provider="${esc(booking.provider)}" href="${esc(booking.href)}" target="_blank" rel="noopener noreferrer">📅 ${esc(booking.label)}</a>`
        : `<a class="btn ghost" id="bookBtn" data-provider="none" href="${esc(booking.href)}">⚙ ${esc(booking.label)}</a>`}
      <div class="adv">${esc(call?.advisory || 'Advisory only.')}${demo || t.sample ? ' · SAMPLE weather/track.' : ''}</div>
    </section>

    <section class="debrief glass" id="debriefCard">
      <div class="debrief-h">
        <span class="eyebrow">Lesson Debrief</span>
        <span class="share-tag">SHAREABLE</span>
      </div>
      ${miniTrackSvg(points)}
      <div style="margin-top:8px;font-weight:650">${esc(t.dateLabel || '—')}</div>
      <div class="mono dim" style="font-size:12px;margin-top:4px">${esc(String(t.hours ?? stats.durationSec / 3600))} hrs · ${esc(String(t.takeoffs ?? 1))} Takeoffs · ${esc(t.airport || callStation || '')}</div>
      <div class="eyebrow" style="margin-top:10px">Skills nailed</div>
      <div class="skills">${skills || '<span class="dim">—</span>'}</div>
      <div class="mono dim" style="font-size:11px;margin:8px 0">+${esc(String(t.hours ?? 1.4))} hrs toward certificate</div>
      <button type="button" class="btn" id="shareBtn">↩ Share PNG</button>
    </section>
  </div>
</div>

<section class="acs-strip glass">
  ${acsHtml}
</section>
</div>
<script type="module">
const TRACK = ${trackJson};
const DUR = ${JSON.stringify(dur)};

function fmt(sec){sec=Math.max(0,Math.round(sec));const m=Math.floor(sec/60),s=sec%60;return String(m).padStart(2,'0')+':'+String(s).padStart(2,'0');}

const playBtn=document.getElementById('playBtn');
const scrub=document.getElementById('scrub');
const speed=document.getElementById('speed');
const timeLabel=document.getElementById('timeLabel');
const hudAlt=document.getElementById('hudAlt');
const hudGs=document.getElementById('hudGs');
const hudClock=document.getElementById('hudClock');

let ctl=null;
(async function(){
  try{
    const canvas=document.getElementById('replay3d');
    const gl=document.createElement('canvas').getContext('webgl');
    if(!gl) throw new Error('no webgl');
    const { mountReplay3d }=await import('/js/cockpit-replay3d.js');
    const handle=mountReplay3d(canvas, TRACK);
    await handle.ready;
    ctl=handle.controls;
    canvas.classList.add('on');
    const vb=document.getElementById('viewBtn'); if(vb&&ctl.view) vb.textContent=ctl.view.toUpperCase();
    ctl.onHud(({altFt,gsKt,hdgDeg,t})=>{
      hudAlt.textContent='ALT '+(altFt!=null?Number(altFt).toLocaleString('en-US'):'—')+' FT';
      hudGs.textContent='GS '+(gsKt!=null?Math.round(gsKt):'—')+' KT · HDG '+(hdgDeg!=null?Math.round(hdgDeg):'—')+'°';
      const d=new Date(t);
      hudClock.textContent=d.toISOString().slice(11,19)+'Z';
    });
    ctl.onTime(({u,playing})=>{
      scrub.value=Math.round(u*1000);
      timeLabel.textContent=fmt(u*DUR)+' / '+fmt(DUR);
      playBtn.textContent=playing?'❚❚':'▶';
    });
  }catch(err){
    console.warn('[replay]',err);
    document.getElementById('hudClock').textContent='SVG / 2D fallback';
  }
})();

document.getElementById('viewBtn')?.addEventListener('click',(ev)=>{ if(!ctl)return; ev.currentTarget.textContent=ctl.toggleView().toUpperCase(); });
playBtn?.addEventListener('click',()=>{ if(!ctl)return; const on=ctl.toggle(); playBtn.textContent=on?'❚❚':'▶'; });
scrub?.addEventListener('input',()=>{ if(!ctl)return; ctl.pause(); ctl.seek((+scrub.value)/1000); playBtn.textContent='▶'; });
speed?.addEventListener('change',()=>ctl?.setSpeed(speed.value));
document.querySelectorAll('.ev').forEach(b=>b.addEventListener('click',()=>{
  if(!ctl)return; ctl.pause(); ctl.seek(+b.dataset.u); playBtn.textContent='▶';
}));

${clockScript()}

document.getElementById('shareBtn')?.addEventListener('click', async ()=>{
  const card=document.getElementById('debriefCard');
  const rect=card.getBoundingClientRect();
  const c=document.createElement('canvas');
  const scale=2;
  c.width=rect.width*scale; c.height=rect.height*scale;
  const ctx=c.getContext('2d');
  ctx.scale(scale,scale);
  ctx.fillStyle='#0b1220';
  ctx.fillRect(0,0,rect.width,rect.height);
  ctx.strokeStyle='rgba(120,160,255,.35)';
  ctx.strokeRect(0.5,0.5,rect.width-1,rect.height-1);
  ctx.fillStyle='#e6edf7';
  ctx.font='600 12px ui-monospace,monospace';
  ctx.fillText('PILOTLOG · LESSON DEBRIEF',16,28);
  ctx.font='700 16px sans-serif';
  ctx.fillText(${JSON.stringify(String(t.dateLabel || 'Flight'))},16,54);
  ctx.font='12px ui-monospace,monospace';
  ctx.fillStyle='#7d8aa5';
  ctx.fillText(${JSON.stringify(`${t.hours ?? '—'} hrs · ${t.airport || callStation || ''}`)}+(${JSON.stringify(t.sample ? ' · SAMPLE' : '')}),16,74);
  ctx.fillStyle='#22d3ee';
  ctx.fillText('Skills: '+${JSON.stringify((t.skills || events.map((e) => e.label)).slice(0, 3).join(' · ') || '—')},16,100);
  // draw mini path
  const pts=TRACK.points||[];
  if(pts.length){
    let minLat=Infinity,maxLat=-Infinity,minLon=Infinity,maxLon=-Infinity;
    for(const p of pts){minLat=Math.min(minLat,p.lat);maxLat=Math.max(maxLat,p.lat);minLon=Math.min(minLon,p.lon);maxLon=Math.max(maxLon,p.lon);}
    const x0=16,y0=120,w=rect.width-32,h=90;
    ctx.strokeStyle='#22d3ee'; ctx.lineWidth=2; ctx.beginPath();
    pts.forEach((p,i)=>{
      const x=x0+((p.lon-minLon)/Math.max(1e-9,maxLon-minLon))*w;
      const y=y0+h-((p.lat-minLat)/Math.max(1e-9,maxLat-minLat))*h;
      i?ctx.lineTo(x,y):ctx.moveTo(x,y);
    });
    ctx.stroke();
  }
  ctx.fillStyle='#f472d0';
  ctx.font='700 10px ui-monospace,monospace';
  ctx.fillText(${JSON.stringify(t.sample ? 'SAMPLE TRACK — NOT A REAL FLIGHT' : 'PilotLog')},16,rect.height-16);
  c.toBlob((blob)=>{
    const a=document.createElement('a');
    a.href=URL.createObjectURL(blob);
    a.download='pilotlog-debrief.png';
    a.click();
    URL.revokeObjectURL(a.href);
  });
});
</script>
</body></html>`;
}
