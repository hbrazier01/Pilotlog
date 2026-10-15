/** Shared glass-cockpit chrome: nav, tokens, shell HTML helpers. */

export const COCKPIT_NAV = [
  { href: '/cockpit', id: 'dashboard', label: 'Dashboard' },
  { href: '/cockpit/replay', id: 'replay', label: 'Replay' },
  { href: '/cockpit/flight-plan', id: 'flight-plan', label: 'Flight Plan' },
  { href: '/cockpit/logbook', id: 'logbook', label: 'Logbook' },
  { href: '/cockpit/training', id: 'training', label: 'Training' },
  { href: '/cockpit/acs', id: 'acs', label: 'ACS' },
  { href: '/cockpit/resources', id: 'resources', label: 'Resources' },
  { href: '/cockpit/settings', id: 'settings', label: 'Settings' },
];

export function demoQ(demo) {
  return demo ? '?demo=1' : '';
}

export function chromeCss() {
  return `:root{--bg:#03060f;--panel:rgba(14,22,40,.72);--line:rgba(120,160,255,.14);--txt:#e6edf7;--dim:#7d8aa5;--cy:#22d3ee;--gr:#34f5a0;--mg:#f472d0;--am:#fbbf24;--mono:ui-monospace,'SF Mono','JetBrains Mono',Menlo,Consolas,monospace}
*{box-sizing:border-box;margin:0;padding:0}
body{background:radial-gradient(1400px 700px at 50% -220px,#0c1a3a 0,transparent 55%),radial-gradient(900px 500px at 100% 100%,#1a0b2e66,transparent),var(--bg);color:var(--txt);font:14px/1.45 -apple-system,BlinkMacSystemFont,'Inter','Segoe UI',sans-serif;min-height:100vh;-webkit-font-smoothing:antialiased}
body:before{content:"";position:fixed;inset:0;pointer-events:none;background-image:linear-gradient(var(--line) 1px,transparent 1px),linear-gradient(90deg,var(--line) 1px,transparent 1px);background-size:48px 48px;mask-image:radial-gradient(ellipse at 50% 15%,#000 0,transparent 72%);opacity:.3}
a{color:var(--cy);text-decoration:none}
.mono{font-family:var(--mono);font-variant-numeric:tabular-nums}.dim{color:var(--dim)}.c{color:var(--cy)}.ok{color:var(--gr)}.am{color:var(--am)}.mg{color:var(--mg)}
.page{position:relative;max-width:1280px;margin:0 auto;padding:16px 18px 48px}
nav.top{display:flex;align-items:center;gap:2px;margin-bottom:16px;overflow-x:auto;scrollbar-width:none;padding-bottom:2px}
nav.top .brand{font-family:var(--mono);font-size:12px;letter-spacing:.22em;color:var(--cy);margin-right:12px;white-space:nowrap;display:flex;align-items:center;gap:8px}
nav.top .brand:before{content:"";width:18px;height:18px;background:conic-gradient(from 210deg,var(--cy),var(--mg),var(--am),var(--cy));border-radius:50%;box-shadow:0 0 12px rgba(34,211,238,.5)}
nav.top a{color:var(--dim);font-size:11px;letter-spacing:.1em;text-transform:uppercase;padding:7px 11px;border-radius:999px;white-space:nowrap;border-bottom:2px solid transparent}
nav.top a.on{color:var(--txt);background:rgba(34,211,238,.1);box-shadow:inset 0 0 0 1px rgba(34,211,238,.4);border-bottom-color:var(--cy)}
.nav-r{margin-left:auto;display:flex;align-items:center;gap:10px;font:600 10px var(--mono);letter-spacing:.1em;color:var(--dim)}
.live{display:inline-flex;align-items:center;gap:6px;color:var(--gr)}.live:before{content:"";width:7px;height:7px;border-radius:50%;background:var(--gr);box-shadow:0 0 8px var(--gr);animation:blink 1.6s infinite}
@keyframes blink{50%{opacity:.35}}
.demo{color:var(--mg);border:1px solid rgba(244,114,208,.45);padding:3px 8px;border-radius:999px}
.userchip{display:inline-flex;align-items:center;gap:8px;padding:4px 10px 4px 4px;border-radius:999px;border:1px solid var(--line);background:rgba(255,255,255,.03)}
.userchip .av{width:26px;height:26px;border-radius:50%;background:linear-gradient(135deg,#0891b2,#f472d0);display:grid;place-items:center;font:700 10px var(--mono);color:#031018}
.userchip .nm{font:600 10px var(--mono);letter-spacing:.08em;color:var(--txt);line-height:1.2}
.userchip .role{font:600 8px var(--mono);letter-spacing:.12em;color:var(--dim)}
.glass{background:var(--panel);border:1px solid var(--line);border-radius:20px;backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);box-shadow:0 1px 0 rgba(255,255,255,.04) inset,0 24px 60px -32px #000}
.eyebrow{font:600 10px var(--mono);letter-spacing:.2em;text-transform:uppercase;color:var(--dim)}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;background:linear-gradient(180deg,#14324a,#0c2234);color:var(--cy);border:1px solid rgba(34,211,238,.45);border-radius:10px;padding:10px 14px;font:600 12px inherit;cursor:pointer;letter-spacing:.04em}
.btn:hover{box-shadow:0 0 18px rgba(34,211,238,.25)}.btn.sm{padding:6px 10px;font-size:11px}
.btn:disabled{opacity:.4;cursor:not-allowed}
.btn.ghost{background:transparent;color:var(--dim);border-style:dashed}
input,select,textarea{background:rgba(3,6,15,.7);color:var(--txt);border:1px solid #26314a;border-radius:8px;padding:8px 10px;font:12px var(--mono);width:100%}
input:focus,select:focus,textarea:focus{outline:none;border-color:var(--cy);box-shadow:0 0 0 3px rgba(34,211,238,.15)}
table.grid{width:100%;border-collapse:collapse;font-size:13px}
table.grid th{text-align:left;font:600 10px var(--mono);letter-spacing:.14em;color:var(--dim);padding:8px 6px;border-bottom:1px solid var(--line)}
table.grid td{padding:10px 6px;border-bottom:1px solid rgba(255,255,255,.05);vertical-align:top}
.pill{font:700 8px var(--mono);letter-spacing:.1em;padding:2px 7px;border-radius:999px;display:inline-block}
.pill.go{background:var(--gr);color:#06281c}.pill.caut{background:var(--am);color:#1a1200}.pill.nogo{background:#fb7185;color:#1a0505}
.pill.ok{background:var(--gr);color:#06281c}.pill.warn{background:var(--am);color:#1a1200}.pill.dim{background:rgba(255,255,255,.08);color:var(--dim)}
@media(max-width:720px){.page{padding:12px 10px 40px}.userchip .role,.nav-r .clock{display:none}}
@media(prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}`;
}

export function renderNav(esc, { active, demo = false, user = null, timeZone = '' } = {}) {
  const q = demoQ(demo);
  const links = COCKPIT_NAV.map((n) => {
    const href = n.href === '/cockpit' ? `/cockpit${q}` : `${n.href}${q}`;
    return `<a class="${n.id === active ? 'on' : ''}" href="${esc(href)}">${esc(n.label)}</a>`;
  }).join('');
  const u = user || (demo
    ? { name: 'JORDAN P.', role: 'PRIVATE PILOT STUDENT', initials: 'JP', sample: true }
    : { name: 'PILOT', role: 'PRIVATE PILOT STUDENT', initials: 'P', sample: false });
  return `<nav class="top">
  <span class="brand">PILOTLOG</span>
  ${links}
  <div class="nav-r">
    ${demo ? '<span class="demo">SAMPLE</span>' : '<span class="live">LIVE</span>'}
    <span class="clock" id="clock" data-tz="${esc(timeZone || '')}">—</span>
    <div class="userchip" title="${esc(u.sample ? 'Sample pilot identity' : u.name)}">
      <span class="av">${esc(u.initials || 'JP')}</span>
      <span><span class="nm">${esc(u.name)}</span><br><span class="role">${esc(u.role)}</span></span>
    </div>
  </div>
</nav>`;
}

export function clockScript() {
  return `(function(){const c=document.getElementById('clock');if(!c)return;
const tz=c.dataset.tz||undefined;
function tick(){try{const parts=new Intl.DateTimeFormat('en-US',{timeZone:tz,hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false,timeZoneName:'short'}).formatToParts(new Date());
const g=(t)=>(parts.find(p=>p.type===t)||{}).value||'';c.textContent=g('hour')+':'+g('minute')+':'+g('second')+' '+g('timeZoneName');}
catch{c.textContent=new Date().toISOString().slice(11,19)+' Z';}}
tick();setInterval(tick,1000);})();`;
}

export function shellStart({ title, active, demo, escapeHtml: esc, user, timeZone = '' }) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" content="#03060f">
<title>${esc(title)} — PilotLog</title>
<style>${chromeCss()}</style></head><body>
<div class="page">
${renderNav(esc, { active, demo, user, timeZone })}`;
}

export function shellEnd(extraScript = '') {
  return `</div>
<script>${clockScript()}${extraScript}</script>
</body></html>`;
}
