import { SCENARIOS, buildContext, createSession, respond, towerOpening, scenarioScript, sessionScore, sayLetter } from './atc-engine.js';

const boot = JSON.parse(document.getElementById('atcBoot').textContent);
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
let scenario = new URLSearchParams(location.search).get('scenario') || SCENARIOS[0].id;
let ctx, session, lastTower = null, voiceOn = true;

const synth = window.speechSynthesis || null;
function speak(t) {
  if (!synth || !voiceOn || !t) return;
  try {
    synth.cancel();
    const u = new SpeechSynthesisUtterance(t.speak || t.text);
    u.rate = 1.12; u.pitch = 0.9;
    const v = synth.getVoices().find((x) => /en[-_]US/i.test(x.lang) && /male|david|alex|daniel|google us/i.test(x.name)) || synth.getVoices().find((x) => /^en/i.test(x.lang));
    if (v) u.voice = v;
    $('rxLed').classList.add('on'); u.onend = () => $('rxLed').classList.remove('on');
    synth.speak(u);
  } catch { /* speech optional */ }
}

function addMsg(who, text) {
  const d = document.createElement('div');
  d.className = 'msg ' + who;
  d.innerHTML = who === 'sys' ? esc(text) : `<span class="who">${who === 'atc' ? esc(facLabel()) : 'YOU'}</span>${esc(text)}`;
  $('log').appendChild(d); $('log').scrollTop = 1e9;
}
function facLabel() {
  const st = session?.steps[session.i];
  const ground = scenario === 'ground_taxi' || (st && /contact Ground/.test(st.reply.text) && session.phase === 'readback' && false);
  return `${ctx.facilityName.toUpperCase()} ${ground ? 'GROUND' : 'TOWER'}`;
}

function renderCtx() {
  const sim = (k) => (ctx.simulated.includes(k) ? '<span class="sim">SIM</span>' : '');
  const w = ctx.wind.kt < 3 ? 'CALM' : `${String(ctx.wind.dir).padStart(3, '0')}@${ctx.wind.kt}`;
  $('ctx').innerHTML = [
    ['FIELD', ctx.airport || '—', ''], ['RWY', ctx.runway, sim('runway')], ['WIND', w, sim('wind')],
    ['ALTM', ctx.altimeter.toFixed(2), sim('altimeter')], ['ATIS', sayLetter(ctx.atis).toUpperCase(), sim('atis')],
    ['TAXI', ctx.taxiRoute.join('→'), sim('taxi')], ['TWR', ctx.freqs.tower || '—', sim('freq')], ['GND', ctx.freqs.ground || '—', sim('freq')], ['CALLSIGN', ctx.callsign, sim('callsign')],
  ].map(([k, v, s]) => `<div class="cx">${k}${s}<b>${esc(v)}</b></div>`).join('');
  $('setupNote').hidden = !(ctx.needsSetup || ctx.simulated.includes('callsign'));
  renderFreq();
  const src = [ctx.taxiSource ? 'Taxiways © OpenStreetMap contributors (ODbL)' : 'Taxi route SIM (no map data for this field)', ctx.freqs.source ? 'Frequencies: OurAirports' : 'Frequencies SIM', ctx.simulated.includes('atis') ? 'ATIS letter SIM (no D-ATIS)' : 'ATIS: FAA D-ATIS'];
  $('dataSrc').textContent = src.join(' · ');
}
function renderFreq() {
  const ground = facLabel().endsWith('GROUND');
  const mhz = ground ? ctx.freqs.ground : ctx.freqs.tower;
  $('mhz').textContent = mhz || '';
  $('freq').textContent = facLabel();
  $('freqSrc').textContent = mhz ? `${ctx.freqs.source} · verify on the chart supplement` : 'SIM · frequency not available';
}
function renderCue() {
  if (session.done) {
    const sc = sessionScore(session);
    $('cue').innerHTML = `<span class="eyebrow">Scenario complete · ${sc}%</span>Pick another scenario or restart to try for 100%.`;
    return;
  }
  const st = session.steps[session.i];
  const phaseTxt = session.phase === 'call' ? 'Your call' : 'Read it back';
  $('cue').innerHTML = `<span class="eyebrow">${phaseTxt}</span>${esc(session.phase === 'readback' && st.call ? 'Read back the instruction — include every required item (runway, hold-short, clearance, callsign…).' : st.cue)}${st.example && session.phase === 'call' ? `<details><summary>Show an example call</summary>${esc(st.example)}</details>` : ''}`;
  renderFreq();
}
function renderGrade(g) {
  if (!g) return;
  const colm = g.score === 100 ? 'var(--gr)' : g.score >= 60 ? 'var(--am)' : '#fb7185';
  const vm = g.kind === 'call' ? (g.passed ? 'Clean initial call.' : `Call missing ${g.missing.length} item${g.missing.length > 1 ? 's' : ''}.`) : g.verdict;
  $('gmini').innerHTML = `<div class="ring" style="--p:${g.score};--rc:${colm}"><span style="color:${colm}">${g.score}</span></div><div><div class="gm-t">${esc(vm)}</div>${g.missing.length ? `<div class="gm-m">✕ ${esc(g.missing.map((m) => m.label).join(' · '))}</div>` : ''}${g.ideal ? `<div class="gm-m" style="color:var(--cy)">Model: ${esc(g.ideal)}</div>` : ''}<a href="#grade">Full check ↓</a></div>`;
  const col = g.score === 100 ? 'var(--gr)' : g.score >= 60 ? 'var(--am)' : '#fb7185';
  const verdict = g.kind === 'call' ? (g.passed ? 'Clean initial call.' : `Call missing ${g.missing.length} item${g.missing.length > 1 ? 's' : ''}.`) : g.verdict;
  $('grade').innerHTML = `<h3>${g.kind === 'call' ? 'INITIAL CALL CHECK' : 'READBACK CHECK'}</h3>
  <div class="score"><div class="ring" style="--p:${g.score};--rc:${col}"><span style="color:${col}">${g.score}</span></div><div class="verdict">${esc(verdict)}</div></div>
  <ul class="chk">${g.results.map((r) => `<li class="${r.ok ? 'ok' : 'no'}"><span class="m">${r.ok ? '✓' : '✕'}</span><div><div class="l">${esc(r.label)}</div>${r.ok ? '' : `<div class="w">${esc(r.why)}</div>`}</div></li>`).join('')}</ul>
  ${g.ideal ? `<div class="ideal"><span class="eyebrow">Model readback</span>${esc(g.ideal)}</div>` : ''}`;
}

function start(id) {
  scenario = id;
  document.querySelectorAll('.sc').forEach((b) => b.classList.toggle('on', b.dataset.id === id));
  ctx = buildContext({ settings: boot.settings, weather: boot.weather, scenario: id, airportData: boot.airportData, seed: Number(new URLSearchParams(location.search).get('seed')) || Date.now() });
  session = createSession(ctx);
  $('log').innerHTML = ''; $('gmini').innerHTML = '';
  $('grade').innerHTML = '<h3>READBACK CHECK</h3><div class="empty">Make your call. Each transmission is checked for the required elements: callsign, runway, clearance, hold-short, altimeter, and more.</div>';
  renderCtx();
  addMsg('sys', `${ctx.facilityName} · runway ${ctx.runway} in use · information ${sayLetter(ctx.atis)}`);
  const open = towerOpening(session);
  if (open) { addMsg('atc', open.text); lastTower = open; speak(open); }
  renderCue();
}

function transmit(text) {
  text = String(text || '').trim();
  if (!text || session.done) return;
  addMsg('you', text);
  const r = respond(session, text);
  renderGrade(r.grade);
  if (r.tower) { setTimeout(() => { addMsg('atc', r.tower.text); lastTower = r.tower; speak(r.tower); renderCue(); }, 450); }
  else renderCue();
  if (session.done) setTimeout(() => addMsg('sys', `Scenario complete — overall ${sessionScore(session)}%`), 500);
}
window.__atc = { transmit, start, get session() { return session; } };

$('scen').addEventListener('click', (e) => { const b = e.target.closest('.sc'); if (b) start(b.dataset.id); });
$('sayForm').addEventListener('submit', (e) => { e.preventDefault(); transmit($('sayIn').value); $('sayIn').value = ''; });
$('replayBtn').addEventListener('click', () => { if (lastTower) { const v = voiceOn; voiceOn = true; speak(lastTower); voiceOn = v; } });
$('voiceBtn').addEventListener('click', (e) => { voiceOn = !voiceOn; e.currentTarget.textContent = `Tower voice: ${voiceOn ? 'ON' : 'OFF'}`; if (!voiceOn) synth?.cancel(); });
$('resetBtn').addEventListener('click', () => start(scenario));
if (!synth) $('voiceBtn').hidden = true;

// Speech in: Web Speech API (Chrome/Edge/Safari). Hold PTT (or click to toggle).
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
const ptt = $('ptt');
if (!SR) {
  ptt.disabled = true; ptt.title = 'Voice input not supported in this browser — type instead';
  $('micNote').textContent = 'Voice input not supported here — type your call.';
} else {
  let rec = null, live = false, finalText = '';
  const stop = () => { if (rec && live) rec.stop(); };
  const begin = () => {
    if (live) return;
    synth?.cancel();
    rec = new SR(); rec.lang = 'en-US'; rec.interimResults = true; rec.continuous = true; finalText = '';
    rec.onresult = (ev) => { let s = ''; for (const r of ev.results) s += r[0].transcript + ' '; finalText = s.trim(); $('sayIn').value = finalText; };
    rec.onerror = (ev) => { $('micNote').textContent = ev.error === 'not-allowed' ? 'Mic blocked — allow it or type instead.' : 'Mic error — type instead.'; };
    rec.onend = () => { live = false; ptt.classList.remove('live'); $('txLed').classList.remove('tx'); if (finalText) { transmit(finalText); $('sayIn').value = ''; } };
    rec.start(); live = true; ptt.classList.add('live'); $('txLed').classList.add('tx');
  };
  ptt.addEventListener('pointerdown', (e) => { e.preventDefault(); live ? stop() : begin(); });
  ptt.addEventListener('pointerup', () => { /* hold-to-talk: release ends after a short tail */ if (live) setTimeout(stop, 350); });
  $('micNote').textContent = 'Hold PTT and speak, or type.';
}

start(SCENARIOS.some((s) => s.id === scenario) ? scenario : SCENARIOS[0].id);
