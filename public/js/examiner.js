// AI Examiner client — "The Right Seat". Web Speech in/out is optional; text always works.
const boot = JSON.parse(document.getElementById('exBoot').textContent);
const $ = (id) => document.getElementById(id);
const qs = boot.demo ? '?demo=1' : '';
const api = (p, body) => fetch(p + qs, { method: body ? 'POST' : 'GET', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }).then(async (r) => ({ status: r.status, j: await r.json().catch(() => ({})) }));
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

let current = null, area = '', asked = [], voiceOn = true, streak = 0, busy = false;
let areas = boot.areas.map((a) => ({ ...a, asked: 0, avg: null, weak: false }));

function color(avg) { return avg == null ? '#2f6b55' : avg >= 75 ? '#34f5a0' : avg >= 40 ? '#fbbf24' : '#fb7185'; }
function drawRadar() {
  const n = areas.length, svg = $('scope');
  let s = '';
  for (const r of [30, 60, 90]) s += `<circle r="${r}" fill="none" stroke="rgba(52,245,160,.22)" stroke-width=".6"/>`;
  for (let i = 0; i < n; i++) { const a = (i / n) * 2 * Math.PI - Math.PI / 2; s += `<line x1="0" y1="0" x2="${90 * Math.cos(a)}" y2="${90 * Math.sin(a)}" stroke="rgba(52,245,160,.14)" stroke-width=".5"/>`; }
  const pts = areas.map((x, i) => { const a = (i / n) * 2 * Math.PI - Math.PI / 2; const r = 18 + 72 * ((x.avg ?? 0) / 100); return [r * Math.cos(a), r * Math.sin(a), x, a]; });
  s += `<polygon points="${pts.map((p) => p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' ')}" fill="rgba(52,245,160,.14)" stroke="#34f5a0" stroke-width="1"/>`;
  for (const [x, y, ar, a] of pts) {
    const c = color(ar.avg), on = ar.id === area;
    s += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${on ? 5 : 3.4}" fill="${c}" style="filter:drop-shadow(0 0 4px ${c})"/>`;
    s += `<text x="${(97 * Math.cos(a)).toFixed(1)}" y="${(97 * Math.sin(a) + 3).toFixed(1)}" text-anchor="middle" font-size="8" font-weight="800" font-family="ui-monospace,monospace" fill="${on ? '#fbbf24' : 'rgba(167,243,208,.85)'}">${ar.id}</text>`;
  }
  s += `<circle r="2" fill="#34f5a0"/>`;
  svg.innerHTML = s;
  $('legend').innerHTML = `<button class="lg${area === '' ? ' on' : ''}" data-a=""><span class="id">◎</span><span>Auto · weakest first</span><span class="v"></span></button>` +
    areas.map((x) => `<button class="lg${x.weak ? ' weak' : ''}${x.id === area ? ' on' : ''}" data-a="${esc(x.id)}"><span class="id">${esc(x.id)}</span><span>${esc(x.title)}</span><span class="v">${x.avg == null ? '—' : x.avg + '%'}</span></button>`).join('');
  $('legend').querySelectorAll('.lg').forEach((b) => b.onclick = () => { area = b.dataset.a; drawRadar(); nextQuestion(); });
}

function speak(text) {
  if (!voiceOn || !('speechSynthesis' in window)) return;
  try { speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(text); u.rate = 0.98; u.pitch = 0.9; const av = $('avatar'); u.onstart = () => av.classList.add('talk'); u.onend = () => av.classList.remove('talk'); speechSynthesis.speak(u); } catch {}
}
function typeOut(el, text) {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches || navigator.webdriver;
  if (reduce) { el.textContent = text; return; }
  let i = 0; el.innerHTML = '';
  const t = setInterval(() => { i += 2; el.innerHTML = esc(text.slice(0, i)) + '<span class="caret"></span>'; if (i >= text.length) { clearInterval(t); el.textContent = text; } }, 16);
}

async function nextQuestion() {
  const { j } = await api('/api/cockpit/examiner/question', { area, exclude: asked.slice(-6) });
  current = j.question; if (!current) return;
  asked.push(current.id);
  $('task').textContent = `AREA ${current.area} · ${current.areaTitle.toUpperCase()} · ${current.task.toUpperCase()}`;
  $('acsRef').textContent = current.acs; $('area').textContent = '';
  typeOut($('qt'), current.text); speak(current.text);
  $('ansIn').value = ''; $('ansIn').focus({ preventScroll: true });
}

function renderAllowance(a) {
  if (!a) { $('fuel').innerHTML = `<div class="eyebrow">EXAMINER FUEL</div><div class="dim" style="font-size:12px;margin-top:4px">Demo uses the free practice grader. Signed-in students get a monthly AI allowance.</div>`; return; }
  const pct = a.capUsd > 0 ? Math.max(0, Math.min(100, (a.remainingUsd / a.capUsd) * 100)) : 0;
  $('fuel').innerHTML = `<div class="eyebrow" style="display:flex;justify-content:space-between"><span>EXAMINER FUEL · ${esc(a.month)}</span><span>$${a.remainingUsd.toFixed(2)} / $${a.capUsd.toFixed(2)}</span></div><div class="tube"><i style="width:${pct}%"></i></div>`;
}

async function submit() {
  if (busy || !current) return;
  const answer = $('ansIn').value.trim();
  if (!answer) { $('note').textContent = 'Say or type an answer first.'; return; }
  busy = true; $('submit').disabled = true; $('note').textContent = 'Examiner is considering your answer…';
  try {
    const { status, j } = await api('/api/cockpit/examiner/answer', { questionId: current.id, answer });
    if (status === 402 || j.capReached) { $('cap').hidden = false; $('cap').textContent = j.error; renderAllowance(j.allowance); speak(j.error); return; }
    if (!j.ok) { $('note').textContent = j.error || 'Something went wrong.'; return; }
    const ring = $('ring'); ring.style.setProperty('--p', j.score); ring.style.setProperty('--rc', color(j.score)); $('score').textContent = j.score;
    const st = $('stamp'); st.className = 'stamp'; void st.offsetWidth; st.className = 'stamp show ' + j.verdict; st.textContent = j.verdict.toUpperCase();
    $('fb').textContent = j.feedback;
    $('miss').innerHTML = (j.missing || []).map((m) => `<span>${esc(m)}</span>`).join('');
    $('refBox').innerHTML = `<div class="ref"><span class="eyebrow">${esc(j.acs)} · ${esc(j.task)}</span>${esc(j.reference)}</div>`;
    streak = j.verdict === 'satisfactory' ? streak + 1 : 0; $('streak').textContent = streak > 1 ? `${streak}× SAT STREAK` : '';
    if (j.areas) areas = j.areas;
    else { const x = areas.find((a) => a.id === j.area); if (x) { x.asked++; x.avg = x.avg == null ? j.score : Math.round((x.avg + j.score) / 2); x.weak = x.avg < 70; } }
    drawRadar(); renderAllowance(j.allowance || null);
    $('note').textContent = j.mode === 'gateway' ? 'Graded by AI examiner' : 'Graded by practice grader';
    speak(j.feedback);
  } finally { busy = false; $('submit').disabled = false; }
}

// Push-to-talk (Web Speech recognition), optional.
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
if (!SR) { $('ptt').disabled = true; $('ptt').title = 'Voice input not supported in this browser — type instead'; }
else {
  let rec = null, base = '';
  const start = () => { if (rec) return; rec = new SR(); rec.lang = 'en-US'; rec.interimResults = true; rec.continuous = true; base = $('ansIn').value ? $('ansIn').value + ' ' : '';
    rec.onresult = (e) => { let t = ''; for (const r of e.results) t += r[0].transcript; $('ansIn').value = base + t; };
    rec.onend = () => { rec = null; $('ptt').classList.remove('live'); };
    try { speechSynthesis?.cancel(); rec.start(); $('ptt').classList.add('live'); } catch { rec = null; } };
  const stop = () => { try { rec?.stop(); } catch {} };
  $('ptt').addEventListener('pointerdown', (e) => { e.preventDefault(); start(); });
  ['pointerup', 'pointerleave', 'pointercancel'].forEach((ev) => $('ptt').addEventListener(ev, stop));
}

$('submit').onclick = submit; $('next').onclick = nextQuestion;
$('ansIn').addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit(); });
$('voice').onclick = () => { voiceOn = !voiceOn; $('voice').textContent = 'Examiner voice: ' + (voiceOn ? 'ON' : 'OFF'); if (!voiceOn) try { speechSynthesis.cancel(); } catch {} };
if (!('speechSynthesis' in window)) { voiceOn = false; $('voice').hidden = true; }

(async () => {
  const { j } = await api('/api/cockpit/examiner/state');
  if (j.areas) areas = j.areas;
  drawRadar(); renderAllowance(j.allowance || null);
  if (j.allowance?.overCap) { $('cap').hidden = false; $('cap').textContent = "You've used this month's examiner allowance. It resets on the 1st."; }
  nextQuestion();
})();
