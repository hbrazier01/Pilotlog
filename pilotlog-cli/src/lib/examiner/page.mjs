/**
 * AI Examiner — "The Right Seat". A DPE-style oral exam: ACS radar of weak areas, examiner MFD,
 * push-to-talk answers (Web Speech, optional), checkride-style verdict stamp and debrief.
 */
import { shellStart, shellEnd } from '../cockpit/chrome.mjs';
import { ACS_AREAS } from './acsBank.mjs';

export function renderExaminerPage(esc, { demo = false, signedOut = false, user = null, settings = {}, examiner = {} } = {}) {
  const boot = {
    demo, signedIn: !demo && !!user?.account?.signedIn, mode: examiner.mode || 'mock', model: examiner.model || '',
    aircraft: settings.aircraftLabel || '', airport: settings.homeAirport || '', areas: ACS_AREAS,
  };
  const ctxChips = [
    ['AIRCRAFT', settings.aircraftLabel || 'Generic trainer'],
    ['HOME FIELD', settings.homeAirport || '—'],
    ['STANDARD', 'PPL ACS · FAA-S-ACS-6'],
    ['GRADER', boot.mode === 'gateway' ? 'AI · ' + boot.model : 'PRACTICE (OFFLINE)'],
  ].map(([k, v]) => `<div class="cx">${esc(k)}<b>${esc(v)}</b></div>`).join('');
  const css = `<style>
.ex-head{display:flex;align-items:flex-end;justify-content:space-between;gap:14px;flex-wrap:wrap;margin:4px 2px 14px}
.ex-head h1{font-size:34px;font-weight:850;letter-spacing:-.025em;line-height:1;background:linear-gradient(90deg,#fff 0,#fde68a 45%,#f472d0);-webkit-background-clip:text;background-clip:text;color:transparent}
.ex-head .sub{color:var(--dim);font-size:13px;margin-top:6px;max-width:520px}
.ctxs{display:flex;gap:6px;flex-wrap:wrap}.cx{padding:6px 10px;border-radius:10px;border:1px solid var(--line);background:rgba(3,6,15,.55);font:600 9px var(--mono);letter-spacing:.14em;color:var(--dim)}.cx b{display:block;color:var(--txt);font-size:12px;letter-spacing:.04em;margin-top:2px}
.ex{display:grid;grid-template-columns:300px minmax(0,1fr) 320px;gap:14px;align-items:start}
.panel-t{font:700 10px var(--mono);letter-spacing:.22em;color:var(--dim);display:flex;justify-content:space-between;align-items:center;margin-bottom:10px}
.radar{padding:16px}
.scope{position:relative;aspect-ratio:1;border-radius:50%;background:radial-gradient(circle,#06281c 0,#031510 60%,#020a08 100%);box-shadow:inset 0 0 40px rgba(52,245,160,.25),0 0 0 1px rgba(52,245,160,.3),0 0 40px -10px rgba(52,245,160,.5);overflow:hidden}
.scope svg{position:absolute;inset:0;width:100%;height:100%}
.sweep{position:absolute;inset:0;border-radius:50%;background:conic-gradient(from 0deg,rgba(52,245,160,.42),rgba(52,245,160,0) 22%,transparent);animation:sweep 4.5s linear infinite;mix-blend-mode:screen}
@keyframes sweep{to{transform:rotate(360deg)}}
.legend{display:flex;flex-direction:column;gap:5px;margin-top:12px}
.lg{display:grid;grid-template-columns:26px 1fr auto;gap:8px;align-items:center;padding:6px 8px;border-radius:9px;border:1px solid transparent;font-size:12px;cursor:pointer;background:none;color:var(--txt);text-align:left;font-family:inherit}
.lg:hover{background:rgba(255,255,255,.03)}.lg.on{border-color:rgba(251,191,36,.55);background:rgba(251,191,36,.07)}
.lg .id{font:800 10px var(--mono);color:var(--gr)}.lg .v{font:700 11px var(--mono);color:var(--dim)}.lg.weak .v{color:#fb7185}.lg.weak .id{color:#fb7185}
.mfd{padding:0;overflow:hidden;display:flex;flex-direction:column;min-height:600px;border-color:rgba(251,191,36,.28)}
.bezel{display:flex;align-items:center;gap:10px;padding:12px 18px;background:linear-gradient(180deg,#1a1405,#0b0802);border-bottom:1px solid rgba(251,191,36,.25)}
.bezel .tag{font:800 10px var(--mono);letter-spacing:.22em;color:var(--am)}.bezel .acs{margin-left:auto;font:800 13px var(--mono);color:#fde68a;text-shadow:0 0 12px rgba(251,191,36,.6)}
.dpe{display:flex;gap:16px;padding:22px 22px 6px;align-items:flex-start}
.avatar{flex:none;width:64px;height:64px;border-radius:50%;position:relative;background:radial-gradient(circle at 35% 30%,#fff3c4,#fbbf24 45%,#7c4a03);box-shadow:0 0 0 4px rgba(251,191,36,.15),0 0 30px rgba(251,191,36,.45)}
.avatar:after{content:"DPE";position:absolute;inset:0;display:grid;place-items:center;font:900 13px var(--mono);color:#2a1700;letter-spacing:.08em}
.avatar.talk{animation:pulse 1s ease-in-out infinite}@keyframes pulse{50%{box-shadow:0 0 0 10px rgba(251,191,36,.08),0 0 44px rgba(251,191,36,.8)}}
.qcard{flex:1;min-width:0}
.qcard .task{font:700 10px var(--mono);letter-spacing:.18em;color:var(--am);margin-bottom:8px}
.qcard .qt{font-size:22px;line-height:1.35;font-weight:650;letter-spacing:-.01em;min-height:3em}
.qcard .qt .caret{display:inline-block;width:.55em;height:1em;background:var(--am);vertical-align:-2px;margin-left:2px;animation:blink 1s steps(1) infinite}
.ans{margin:auto 18px 0;padding:14px 0 18px;display:flex;gap:14px;align-items:flex-end}
.ans textarea{flex:1;min-height:110px;resize:vertical;font:14px/1.5 -apple-system,Inter,sans-serif;padding:12px 14px;border-radius:14px;border-color:#3a2e10;background:rgba(10,8,2,.6)}
.ans textarea:focus{border-color:var(--am);box-shadow:0 0 0 3px rgba(251,191,36,.15)}
.ptt{width:88px;height:88px;flex:none;border-radius:50%;border:0;cursor:pointer;color:#2a1700;font:900 11px var(--mono);letter-spacing:.12em;background:radial-gradient(circle at 35% 30%,#fff3c4,#fbbf24 55%,#92400e);box-shadow:0 0 0 6px rgba(251,191,36,.12),0 0 34px rgba(251,191,36,.5)}
.ptt.live{background:radial-gradient(circle at 35% 30%,#ffd1dc,#fb7185 55%,#9f1239);box-shadow:0 0 0 9px rgba(251,113,133,.18),0 0 44px rgba(251,113,133,.7)}
.ptt[disabled]{filter:grayscale(1);opacity:.35;cursor:not-allowed}
.bar{display:flex;gap:8px;flex-wrap:wrap;align-items:center;padding:0 18px 16px}
.bar .btn.go{background:linear-gradient(180deg,#fbbf24,#d97706);color:#1a1000;border-color:#fbbf24;font-weight:800;letter-spacing:.1em}
.bar .note{font:600 10px var(--mono);color:var(--dim);margin-left:auto;letter-spacing:.06em}
.deb{padding:16px;position:relative;overflow:hidden}
.gauge{display:flex;align-items:center;gap:14px}
.ring{--p:0;flex:none;width:104px;height:104px;border-radius:50%;display:grid;place-items:center;background:conic-gradient(var(--rc,var(--am)) calc(var(--p)*1%),rgba(255,255,255,.07) 0);position:relative;transition:--p .6s}
.ring:after{content:"";position:absolute;inset:9px;border-radius:50%;background:#0a0d18}
.ring span{position:relative;z-index:1;font:900 26px var(--mono)}
.stamp{display:inline-block;padding:6px 12px;border:3px solid currentColor;border-radius:8px;font:900 15px var(--mono);letter-spacing:.14em;transform:rotate(-7deg);opacity:0}
.stamp.show{animation:stamp .45s cubic-bezier(.2,1.6,.4,1) forwards}@keyframes stamp{0%{opacity:0;transform:rotate(-7deg) scale(2.4)}100%{opacity:.95;transform:rotate(-7deg) scale(1)}}
.stamp.satisfactory{color:var(--gr)}.stamp.partial{color:var(--am)}.stamp.unsatisfactory{color:#fb7185}
.fb{margin:14px 0 10px;font-size:14px;line-height:1.5}
.miss{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:12px}.miss span{font:700 10px var(--mono);padding:4px 8px;border-radius:999px;background:rgba(251,113,133,.12);border:1px solid rgba(251,113,133,.4);color:#fecdd3}
.ref{padding:10px 12px;border-radius:12px;background:rgba(251,191,36,.06);border:1px solid rgba(251,191,36,.3);font:12px/1.55 var(--mono)}
.ref .eyebrow{display:block;color:var(--am);margin-bottom:4px}
.fuel{margin-top:14px;padding-top:12px;border-top:1px solid var(--line)}
.fuel .tube{height:10px;border-radius:999px;background:rgba(255,255,255,.06);overflow:hidden;margin-top:6px}
.fuel .tube i{display:block;height:100%;background:linear-gradient(90deg,#fb7185,#fbbf24 30%,#34f5a0);border-radius:999px;transition:width .6s}
.empty{color:var(--dim);font-size:13px}
.capmsg{margin:0 18px 14px;padding:12px 14px;border-radius:12px;border:1px solid rgba(251,113,133,.5);background:rgba(251,113,133,.08);color:#fecdd3;font-size:13px}
.streak{font:800 10px var(--mono);letter-spacing:.16em;color:var(--am)}
@media(max-width:1100px){.ex{grid-template-columns:minmax(0,1fr) minmax(0,1fr)}.mfd{grid-column:1/-1;order:-1}}
@media(max-width:720px){.ex{grid-template-columns:minmax(0,1fr)}.ex-head h1{font-size:27px}.mfd{min-height:0}.dpe{padding:16px 14px 4px;gap:12px}.avatar{width:46px;height:46px}.avatar:after{font-size:10px}.qcard .qt{font-size:17px}
 .ans{margin:0 12px;gap:10px}.ans textarea{min-height:90px}.ptt{width:66px;height:66px}.bar{padding:0 12px 14px}.bar .note{width:100%;margin:0}
 .radar{display:grid;grid-template-columns:130px 1fr;gap:12px;align-items:center}.radar .panel-t{grid-column:1/-1;margin:0}.legend{margin:0}.lg{padding:3px 6px;font-size:11px}.ring{width:84px;height:84px}}
</style>`;
  return (
    shellStart({ title: 'AI Examiner', active: 'examiner', demo, escapeHtml: esc, user, timeZone: settings.timeZone }) + css +
    `<header class="ex-head"><div><div class="eyebrow">Private Pilot · Oral Exam · Right Seat</div><h1>The Examiner</h1>
<div class="sub">A calm DPE in the right seat. Questions straight from the ACS, about your airplane and your field. Answer out loud or type, then get a checkride-style verdict.${signedOut ? ` <span class="mg">Demo mode: practice grader, nothing saved. Connect a wallet to track your weak areas.</span>` : ''}</div></div>
<div class="ctxs">${ctxChips}</div></header>
<div class="ex">
  <aside class="glass radar"><div class="panel-t"><span>ACS RADAR</span><span class="streak" id="streak"></span></div>
    <div class="scope"><div class="sweep"></div><svg id="scope" viewBox="-100 -100 200 200" aria-label="ACS areas by score"></svg></div>
    <div class="legend" id="legend"></div></aside>
  <section class="glass mfd">
    <div class="bezel"><span class="tag">EXAMINER · MFD</span><span class="dim mono" id="area" style="font-size:11px"></span><span class="acs" id="acsRef">—</span></div>
    <div class="dpe"><div class="avatar" id="avatar"></div><div class="qcard"><div class="task" id="task">STAND BY</div><div class="qt" id="qt" aria-live="polite">Preparing your first question…</div></div></div>
    <div class="capmsg" id="cap" hidden></div>
    <div class="ans"><textarea id="ansIn" maxlength="1500" placeholder="Answer like you would to the examiner…" aria-label="Your answer"></textarea>
      <button type="button" class="ptt" id="ptt" aria-label="Hold to answer by voice">PTT</button></div>
    <div class="bar"><button class="btn go" id="submit" type="button">SUBMIT ANSWER</button><button class="btn ghost" id="next" type="button">Next question →</button><button class="btn ghost" id="voice" type="button">Examiner voice: ON</button><span class="note" id="note"></span></div>
  </section>
  <aside class="glass deb" id="deb"><div class="panel-t"><span>DEBRIEF</span></div>
    <div class="gauge"><div class="ring" id="ring"><span id="score">—</span></div><div><div class="stamp" id="stamp"></div></div></div>
    <div class="fb" id="fb"><span class="empty">Your grade, what you missed and the ACS reference will appear here.</span></div>
    <div class="miss" id="miss"></div><div id="refBox"></div>
    <div class="fuel" id="fuel"></div></aside>
</div>
<script type="application/json" id="exBoot">${JSON.stringify(boot).replace(/</g, '\\u003c')}</script>
<script type="module" src="/js/examiner.js"></script>` +
    shellEnd('')
  );
}
