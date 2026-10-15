/**
 * Radio Practice — AI tower (deterministic, free). Speech in/out via the browser Web Speech API,
 * text fallback. Uses the student's own Settings (airport, facility, runways, callsign, aircraft).
 */
import { shellStart, shellEnd } from './chrome.mjs';
import { SCENARIOS, DISCLAIMER } from '../../../../public/js/atc-engine.js';

export function renderRadioPage(esc, { demo = false, user = null, settings = {}, weather = null } = {}) {
  const boot = {
    demo,
    settings: { homeAirport: settings.homeAirport || '', towerName: settings.towerName || '', runways: settings.runways || '', tailNumber: settings.tailNumber || '', aircraftType: settings.aircraftType || '' },
    weather: weather && weather.metar ? { metar: { wdir: weather.metar.wdir ?? null, wspd: weather.metar.wspd ?? null, altim: weather.metar.altim ?? null, obsTime: weather.metar.obsTime ?? null }, station: { runways: weather.station?.runways || [] } } : null,
  };
  const q = demo ? '?demo=1' : '';
  const css = `<style>
.disc{display:flex;gap:10px;align-items:center;padding:10px 14px;border-radius:14px;margin-bottom:14px;background:linear-gradient(90deg,rgba(251,191,36,.16),rgba(251,191,36,.04));border:1px solid rgba(251,191,36,.45);color:#fde68a;font:600 12px/1.4 var(--mono);letter-spacing:.02em}
.disc b{background:var(--am);color:#1a1200;border-radius:6px;padding:2px 7px;font-size:10px;letter-spacing:.14em;white-space:nowrap}
.rp-head{display:flex;align-items:flex-end;justify-content:space-between;gap:12px;margin:2px 2px 12px;flex-wrap:wrap}
.rp-head h1{font-size:30px;letter-spacing:-.02em;font-weight:800;background:linear-gradient(90deg,#fff,#7ff3ff 60%,#f472d0);-webkit-background-clip:text;background-clip:text;color:transparent}
.ctxs{display:flex;gap:6px;flex-wrap:wrap}
.cx{padding:6px 10px;border-radius:10px;border:1px solid var(--line);background:rgba(3,6,15,.55);font:600 10px var(--mono);letter-spacing:.1em;color:var(--dim)}
.cx b{display:block;color:var(--txt);font-size:13px;letter-spacing:.04em;margin-top:2px}
.cx .sim{color:var(--am);font-size:8px;margin-left:4px}
.rp{display:grid;grid-template-columns:260px minmax(0,1fr) 330px;gap:14px;align-items:start}
.scen{padding:14px}.scen h3,.grade h3{font:600 10px var(--mono);letter-spacing:.2em;color:var(--dim);margin:2px 4px 10px}
.sc{display:flex;gap:12px;align-items:flex-start;width:100%;text-align:left;padding:12px;border-radius:14px;background:transparent;border:1px solid transparent;color:var(--txt);cursor:pointer;margin-bottom:6px;font:inherit}
.sc:hover{background:rgba(255,255,255,.03)}
.sc.on{background:linear-gradient(135deg,rgba(34,211,238,.16),rgba(244,114,208,.08));border-color:rgba(34,211,238,.5);box-shadow:0 0 24px -8px rgba(34,211,238,.6)}
.sc .ic{width:34px;height:34px;flex:none;border-radius:10px;display:grid;place-items:center;background:rgba(34,211,238,.12);color:var(--cy);font:700 16px var(--mono)}
.sc.on .ic{background:var(--cy);color:#031018}
.sc .t{display:block;font-weight:700;font-size:13px}.sc .d{display:block}.sc .d{font-size:11px;color:var(--dim);margin-top:2px;line-height:1.35}
.radio{padding:0;overflow:hidden;min-width:0;display:flex;flex-direction:column;min-height:640px}
.lcd{display:flex;align-items:center;gap:14px;padding:14px 18px;background:linear-gradient(180deg,#071425,#040a15);border-bottom:1px solid var(--line)}
.lcd .ch{font:800 22px var(--mono);color:#7ff3ff;text-shadow:0 0 14px rgba(34,211,238,.7);letter-spacing:.06em}
.lcd .lab{font:600 9px var(--mono);letter-spacing:.2em;color:var(--dim)}
.lcd .rx{margin-left:auto;display:flex;gap:6px;align-items:center;font:700 10px var(--mono);letter-spacing:.14em;color:var(--dim)}
.lcd .led{width:9px;height:9px;border-radius:50%;background:#1d2a3d}.lcd .led.on{background:var(--gr);box-shadow:0 0 10px var(--gr)}.lcd .led.tx{background:#fb7185;box-shadow:0 0 10px #fb7185}
.cue{margin:14px 18px 0;padding:12px 14px;border-radius:12px;border:1px dashed rgba(34,211,238,.35);background:rgba(34,211,238,.05);font-size:13px}
.cue .eyebrow{color:var(--cy);display:block;margin-bottom:4px}
.cue details{margin-top:6px;font:12px var(--mono);color:var(--dim)}.cue summary{cursor:pointer;color:var(--cy)}
.log{flex:1;overflow:auto;padding:16px 18px;display:flex;flex-direction:column;gap:10px}
.msg{max-width:86%;padding:10px 14px;border-radius:16px;font-size:14px;line-height:1.45}
.msg .who{display:block;font:700 9px var(--mono);letter-spacing:.18em;margin-bottom:3px;opacity:.85}
.msg.atc{align-self:flex-start;background:linear-gradient(135deg,rgba(244,114,208,.18),rgba(120,60,200,.12));border:1px solid rgba(244,114,208,.4);border-top-left-radius:4px}
.msg.atc .who{color:var(--mg)}
.msg.you{align-self:flex-end;background:rgba(52,245,160,.1);border:1px solid rgba(52,245,160,.35);border-top-right-radius:4px}
.msg.you .who{color:var(--gr)}
.msg.sys{align-self:center;font:600 11px var(--mono);color:var(--dim);background:transparent;padding:2px}
.ptt-row{display:flex;align-items:center;gap:14px;padding:14px 18px 18px;border-top:1px solid var(--line);background:rgba(3,6,15,.5)}
.ptt{width:84px;height:84px;flex:none;border-radius:50%;border:0;cursor:pointer;color:#031018;font:800 11px var(--mono);letter-spacing:.12em;background:radial-gradient(circle at 35% 30%,#a5f6ff,#22d3ee 55%,#0e7490);box-shadow:0 0 0 6px rgba(34,211,238,.12),0 0 34px rgba(34,211,238,.55);transition:transform .1s}
.ptt:active,.ptt.live{transform:scale(.96);background:radial-gradient(circle at 35% 30%,#ffd1dc,#fb7185 55%,#9f1239);box-shadow:0 0 0 8px rgba(251,113,133,.18),0 0 44px rgba(251,113,133,.7)}
.ptt[disabled]{filter:grayscale(1);opacity:.4;cursor:not-allowed}
.say{flex:1;display:flex;flex-direction:column;gap:8px}
.say form{display:flex;gap:8px}.say input{font-size:13px;padding:11px 12px}
.tools{display:flex;gap:8px;flex-wrap:wrap}.tools .btn{padding:6px 10px;font-size:11px}
.grade{padding:16px}
.score{display:flex;align-items:center;gap:14px;margin-bottom:12px}
.ring{--p:0;flex:none;width:86px;height:86px;border-radius:50%;display:grid;place-items:center;background:conic-gradient(var(--rc,var(--cy)) calc(var(--p)*1%),rgba(255,255,255,.07) 0);position:relative}
.ring:after{content:"";position:absolute;inset:8px;border-radius:50%;background:#070d1b}
.ring span{position:relative;z-index:1;font:800 22px var(--mono)}
.verdict{font-weight:700;font-size:15px;line-height:1.3}
.chk{list-style:none;display:flex;flex-direction:column;gap:8px;margin:6px 0 12px}
.chk li{display:grid;grid-template-columns:22px 1fr;gap:8px;padding:9px 10px;border-radius:12px;background:rgba(255,255,255,.03);border:1px solid var(--line)}
.chk .m{width:22px;height:22px;border-radius:50%;display:grid;place-items:center;font:800 12px var(--mono)}
.chk li.ok .m{background:var(--gr);color:#06281c}.chk li.no{border-color:rgba(251,113,133,.45);background:rgba(251,113,133,.07)}.chk li.no .m{background:#fb7185;color:#1a0505}
.chk .l{font-weight:650;font-size:13px}.chk .w{font-size:11px;color:var(--dim);margin-top:2px}
.ideal{padding:10px 12px;border-radius:12px;background:rgba(34,211,238,.06);border:1px solid rgba(34,211,238,.3);font:12px/1.5 var(--mono)}
.ideal .eyebrow{display:block;color:var(--cy);margin-bottom:4px}
.empty{color:var(--dim);font-size:13px;padding:8px 4px}
.setup{margin-top:10px;font-size:12px}
@media(max-width:1100px){.rp{grid-template-columns:minmax(0,1fr) minmax(0,1fr)}.radio{grid-column:1/-1;order:-1}}
@media(max-width:720px){.rp{grid-template-columns:minmax(0,1fr)}.rp>*{min-width:0}.scen{order:-2!important}.rp-head h1{font-size:24px}.radio{min-height:520px}
 .scen{padding:10px}.scen-list{display:flex;gap:8px;overflow-x:auto;scrollbar-width:none}.sc{min-width:150px;margin:0;flex-direction:column;gap:6px}.sc .d{display:none}
 .ptt{width:72px;height:72px}.msg{max-width:94%;font-size:13px}.disc{font-size:11px}}
</style>`;
  const scen = SCENARIOS.map((s, i) => `<button type="button" class="sc${i === 0 ? ' on' : ''}" data-id="${esc(s.id)}"><span class="ic">${esc(s.icon)}</span><span><span class="t">${esc(s.title)}</span><span class="d">${esc(s.blurb)}</span></span></button>`).join('');
  return (
    shellStart({ title: 'Radio Practice', active: 'radio', demo, escapeHtml: esc, user, timeZone: settings.timeZone }) + css +
    `<div class="disc" role="note"><b>TRAINING ONLY</b><span>${esc(DISCLAIMER)}</span></div>
<header class="rp-head"><div><div class="eyebrow">Class D · Tower &amp; Ground</div><h1>Radio Practice</h1></div><div class="ctxs" id="ctx"></div></header>
<div class="rp">
  <aside class="glass scen"><h3>SCENARIO</h3><div class="scen-list" id="scen">${scen}</div>
    <div class="setup dim" id="setupNote" hidden>Using generic practice values. <a href="/cockpit/settings${q}#airport">Add your airport, facility and callsign</a> to practice your own field.</div></aside>
  <section class="glass radio">
    <div class="lcd"><div><div class="lab">COM1 · ACTIVE</div><div class="ch" id="freq">—</div></div>
      <div class="rx"><span class="led" id="rxLed"></span>RX<span class="led" id="txLed"></span>TX</div></div>
    <div class="cue" id="cue"></div>
    <div class="log" id="log" aria-live="polite"></div>
    <div class="ptt-row">
      <button type="button" class="ptt" id="ptt" aria-label="Push to talk">PTT</button>
      <div class="say">
        <form id="sayForm"><input id="sayIn" autocomplete="off" placeholder="Type your call or readback…" aria-label="Your transmission"><button class="btn" type="submit">Send</button></form>
        <div class="tools"><button type="button" class="btn ghost" id="replayBtn">🔊 Say again</button><button type="button" class="btn ghost" id="voiceBtn">Tower voice: ON</button><button type="button" class="btn ghost" id="resetBtn">↺ Restart</button><span class="dim mono" id="micNote" style="font-size:11px;align-self:center"></span></div>
      </div>
    </div>
  </section>
  <aside class="glass grade" id="grade"><h3>READBACK CHECK</h3><div class="empty">Make your call. Each transmission is checked for the required elements: callsign, runway, clearance, hold-short, altimeter, and more.</div></aside>
</div>
<script type="application/json" id="atcBoot">${JSON.stringify(boot).replace(/</g, '\\u003c')}</script>
<script type="module" src="/js/atc-practice.js"></script>` +
    shellEnd('')
  );
}
