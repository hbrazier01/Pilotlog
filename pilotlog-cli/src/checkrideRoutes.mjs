/**
 * Checkride Tracker routes (v0.2).
 *   GET  /checkride                       HTML view (simple three-card design)
 *   GET  /api/checkride                   full computed state
 *   PUT  /api/checkride/rates             { aircraftRate, instructorRate, aircraftLabel }
 *   PUT  /api/checkride/test-date         { testDate: 'YYYY-MM-DD' | null }
 *   PUT  /api/checkride/endorsements/:key { date, cfiName, cfiCert, notes }
 *   PUT  /api/checkride/acs/:taskId       { status }
 *   PUT  /api/checkride/flights/:entryId  per-flight details
 *
 * Persistence: when DATABASE_URL is set, store is wallet-scoped in
 * pilot_profiles.checkride_json (same pattern as identity_json). Otherwise
 * falls back to <DATA_DIR>/checkride.json.
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  computeCheckride, EMPTY_STORE, ENDORSEMENT_CATALOG, sanitizeEndorsement,
  ACS_STATUSES, isValidAcsTask, PHASES, PHASE_LABELS,
} from './lib/checkride/index.mjs';

const FLIGHT_NUM_FIELDS = ['xcDistanceNm', 'fullStopPoints', 'longestLegNm', 'towerFullStops', 'nightTakeoffs', 'nightFullStops', 'aircraftRate', 'instructorRate', 'instructorHours'];

export function createCheckrideStore(dataDir, pg = null) {
  const file = path.join(dataDir, 'checkride.json');
  const fileRead = () => {
    try { return { ...EMPTY_STORE(), ...JSON.parse(fs.readFileSync(file, 'utf8')) }; } catch { return EMPTY_STORE(); }
  };
  const fileWrite = (store) => {
    const tmp = file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(store, null, 2));
    fs.renameSync(tmp, file);
  };
  return {
    file,
    read() {
      if (pg?.enabled?.()) {
        const cached = pg.read();
        return cached ? { ...EMPTY_STORE(), ...cached } : EMPTY_STORE();
      }
      return fileRead();
    },
    write(store) {
      if (pg?.enabled?.()) { pg.write(store); return; }
      fileWrite(store);
    },
  };
}

export function sanitizeFlightDetails(input = {}) {
  const out = {};
  for (const k of FLIGHT_NUM_FIELDS) {
    if (input[k] === undefined || input[k] === null || input[k] === '') continue;
    const v = Number(input[k]);
    if (!Number.isFinite(v) || v < 0 || v > 100000) throw new Error(`${k} must be a non-negative number`);
    out[k] = v;
  }
  if (input.checkridePrep !== undefined) out.checkridePrep = input.checkridePrep === true || input.checkridePrep === 'true';
  if (input.phase) { if (!PHASES.includes(input.phase)) throw new Error('invalid phase'); out.phase = input.phase; }
  return out;
}

function usd(v) {
  return '$' + Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function renderPage(cr, escapeHtml) {
  const esc = escapeHtml;
  const p = cr.costs.projection;
  const reqRows = Object.values(cr.readiness.requirements).map(r => `
    <tr><td>${r.met ? '<span class="ok">✓</span>' : '<span class="no">○</span>'}</td>
    <td>${esc(r.label)}${r.note ? `<div class="sub">${esc(r.note)}</div>` : ''}</td>
    <td class="num">${r.unit === 'event' ? (r.met ? 'Done' : '—') : `${esc(r.actual)} / ${esc(r.required)}${r.unit === 'hours' ? 'h' : ''}`}</td>
    <td class="cite">${esc(r.regulation)}</td></tr>`).join('');
  const endRows = cr.endorsements.map(e => `
    <tr data-key="${esc(e.key)}"><td>${e.obtained ? '<span class="ok">✓</span>' : '<span class="no">○</span>'}</td>
    <td>${esc(e.label)}<div class="sub">${esc(e.group)} · ${esc(e.regulation)}</div></td>
    <td><input type="date" name="date" value="${esc(e.date || '')}"></td>
    <td><input name="cfiName" placeholder="CFI name" value="${esc(e.cfiName)}"></td>
    <td><input name="cfiCert" placeholder="Cert #" value="${esc(e.cfiCert)}" size="8"></td>
    <td><button type="button" onclick="saveEndorsement(this)">Save</button></td></tr>`).join('');
  const acsHtml = cr.acs.areas.map(a => `
    <div class="acs-area"><div class="acs-area-h"><b>${esc(a.area)}.</b> ${esc(a.title)}
      <span class="sub">${a.tasks.filter(t => t.status === 'proficient').length}/${a.tasks.length}</span></div>
      ${a.tasks.length ? a.tasks.map(t => `<div class="acs-row"><span>${esc(t.letter)}. ${esc(t.title)}</span>
        <select data-task="${esc(t.id)}" onchange="saveAcs(this)">${ACS_STATUSES.map(st =>
          `<option value="${st}" ${st === t.status ? 'selected' : ''}>${st.replace('_', ' ')}</option>`).join('')}</select></div>`).join('')
      : '<div class="sub" style="padding:4px 0 4px 12px">Not applicable to ASEL.</div>'}
    </div>`).join('');
  const phaseRows = cr.costs.byPhase.filter(x => x.flights).map(x =>
    `<tr><td>${esc(x.label)}</td><td class="num">${x.flights}</td><td class="num">${x.hours}h</td>
     <td class="num">${usd(x.aircraft)}</td><td class="num">${usd(x.instructor)}</td><td class="num"><b>${usd(x.total)}</b></td></tr>`).join('')
    || '<tr><td colspan="6" class="sub">No flights logged yet.</td></tr>';
  const fd = cr.flightDetails || {};
  const flightRows = cr.costs.flights.slice().reverse().map(f => {
    const d = fd[f.id] || {};
    const inp = (k, ph, sz = 4) => `<input name="${k}" placeholder="${ph}" size="${sz}" value="${esc(d[k] ?? '')}">`;
    return `<tr data-id="${esc(f.id)}"><td>${esc(f.date)}<div class="sub">${esc(f.route)}</div></td>
      <td class="num">${f.hours}h</td>
      <td><select name="phase"><option value="">auto</option>${PHASES.map(ph =>
        `<option value="${ph}" ${d.phase === ph ? 'selected' : ''}>${esc(PHASE_LABELS[ph])}</option>`).join('')}</select></td>
      <td>${inp('aircraftRate', '$/hr')}${inp('instructorRate', '$/hr')}${inp('instructorHours', 'CFI h')}</td>
      <td>${inp('xcDistanceNm', 'NM')}${inp('fullStopPoints', 'pts', 3)}${inp('longestLegNm', 'leg')}${inp('towerFullStops', 'twr', 3)}${inp('nightTakeoffs', 'nTO', 3)}
        <label class="sub"><input type="checkbox" name="checkridePrep" ${d.checkridePrep ? 'checked' : ''}> prep</label></td>
      <td class="num">${usd(f.total)}</td><td><button type="button" onclick="saveFlight(this)">Save</button></td></tr>`;
  }).join('') || '<tr><td colspan="7" class="sub">No flights yet.</td></tr>';

  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Checkride Tracker — PilotLog</title><style>
*{box-sizing:border-box;margin:0;padding:0}
body{background:#020817;color:#e2e8f0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;min-height:100vh;line-height:1.45}
a{color:#818cf8;text-decoration:none}a:hover{text-decoration:underline}
.page{max-width:720px;margin:0 auto;padding:24px 16px 56px}
nav{display:flex;gap:4px;flex-wrap:wrap;margin-bottom:22px;padding:10px 0;border-bottom:1px solid #1e293b}
nav a{color:#64748b;font-size:13px;padding:5px 10px;border-radius:6px}nav a:hover{color:#e2e8f0;background:#1e293b;text-decoration:none}nav a.active{color:#818cf8;background:#1e293b}
h1{font-size:22px;font-weight:800;letter-spacing:-.02em;margin-bottom:2px}
.lede{color:#64748b;font-size:13px;margin-bottom:18px}
.cards{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:14px}
.card-btn{display:block;width:100%;text-align:center;background:#0b1120;border:1px solid #1e293b;border-radius:12px;padding:18px 10px;cursor:pointer;color:inherit;font:inherit;transition:border-color .15s,background .15s}
.card-btn:hover,.card-btn[aria-expanded="true"]{border-color:#4f46e5;background:#0f172a}
.card-btn .big{display:block;font-size:26px;font-weight:800;letter-spacing:-.02em;color:#f1f5f9}
.card-btn .lbl{display:block;color:#94a3b8;font-size:11px;font-weight:600;margin-top:4px;text-transform:uppercase;letter-spacing:.04em}
.card-btn .hint{display:block;color:#64748b;font-size:11px;margin-top:6px}
.whats{background:#0b1120;border:1px solid #1e293b;border-radius:10px;padding:12px 14px;margin-bottom:18px;font-size:14px;color:#cbd5e1}
.whats b{color:#f1f5f9}
.panel{display:none;background:#0b1120;border:1px solid #1e293b;border-radius:12px;padding:16px;margin-bottom:16px;overflow-x:auto}
.panel.open{display:block}
.section-title{color:#94a3b8;font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;margin:0 0 10px}
.sub{color:#64748b;font-size:11px}.ok{color:#22c55e;font-weight:700}.no{color:#475569}
table{width:100%;border-collapse:collapse;font-size:13px}td,th{padding:7px 5px;border-bottom:1px solid #1e293b;text-align:left;vertical-align:top}
th{color:#64748b;font-weight:600;font-size:11px}.num{text-align:right;white-space:nowrap}.cite{color:#64748b;font-size:11px;white-space:nowrap}
input,select{background:#0f172a;color:#e2e8f0;border:1px solid #334155;border-radius:5px;padding:4px 6px;font-size:12px;margin:1px;max-width:100%}
button{background:#4f46e5;color:#fff;border:0;border-radius:5px;padding:5px 10px;font-size:12px;cursor:pointer}
button.ghost{background:transparent;color:#818cf8;border:1px solid #334155}
.acs-area{border-bottom:1px solid #1e293b;padding:8px 0}.acs-area-h{font-size:13px;margin-bottom:4px}
.acs-row{display:flex;justify-content:space-between;align-items:center;gap:8px;padding:3px 0 3px 10px;font-size:13px}
details.flights{margin-top:10px}.details.flights summary,.flights>summary{cursor:pointer;color:#818cf8;font-size:13px;padding:6px 0;list-style:none}
.flights>summary::-webkit-details-marker{display:none}
#toast{position:fixed;bottom:16px;right:16px;background:#14532d;color:#4ade80;padding:8px 14px;border-radius:8px;display:none;font-size:13px;z-index:9}
@media(max-width:560px){.cards{grid-template-columns:1fr}.card-btn .big{font-size:22px}.page{padding:16px 12px 48px}}
</style></head><body><div class="page">
<nav><a href="/">Dashboard</a><a href="/progression">Progression</a><a class="active" href="/checkride">Checkride</a><a href="/pilot-report">Pilot Report</a></nav>
<h1>Checkride Tracker</h1>
<p class="lede">How close am I, and what will it cost?</p>

<div class="cards">
  <button type="button" class="card-btn" id="btn-req" aria-expanded="false" aria-controls="panel-req" onclick="toggle('req')">
    <span class="big">${cr.readiness.metCount}<span style="color:#64748b;font-weight:600;font-size:.55em"> / ${cr.readiness.totalCount}</span></span>
    <span class="lbl">Requirements met</span>
    <span class="hint">FAA §61.109</span>
  </button>
  <button type="button" class="card-btn" id="btn-acs" aria-expanded="false" aria-controls="panel-acs" onclick="toggle('acs')">
    <span class="big">${cr.acs.counts.proficient}<span style="color:#64748b;font-weight:600;font-size:.55em"> / ${cr.acs.total}</span></span>
    <span class="lbl">ACS proficient</span>
    <span class="hint">tap for checklist</span>
  </button>
  <button type="button" class="card-btn" id="btn-cost" aria-expanded="false" aria-controls="panel-cost" onclick="toggle('cost')">
    <span class="big">${usd(p.total)}</span>
    <span class="lbl">Est. cost to finish</span>
    <span class="hint">${usd(cr.costs.toDate)} spent so far</span>
  </button>
</div>

<div class="whats"><b>What's left.</b> ${esc(cr.whatsLeft)}</div>

<div class="panel" id="panel-req" role="region" aria-labelledby="btn-req">
  <div class="section-title">Aeronautical experience — §61.109(a)</div>
  <div class="sub" style="margin-bottom:10px">Planned checkride date (sets the §61.109(a)(4) prep window):
    <input type="date" id="testDate" value="${esc(cr.testDate || '')}">
    <button type="button" onclick="put('/api/checkride/test-date',{testDate:val('testDate')||null})">Save</button>
    · <a href="${esc(cr.readiness.source)}" target="_blank" rel="noopener">eCFR</a>
  </div>
  <table><thead><tr><th></th><th>Requirement</th><th class="num">Logged</th><th>Reg</th></tr></thead><tbody>${reqRows}</tbody></table>
  <div class="section-title" style="margin-top:18px">Endorsements</div>
  <table><thead><tr><th></th><th>Endorsement</th><th>Date</th><th>CFI</th><th>Cert</th><th></th></tr></thead><tbody>${endRows}</tbody></table>
</div>

<div class="panel" id="panel-acs" role="region" aria-labelledby="btn-acs">
  <div class="section-title">ACS tasks — ${esc(cr.acs.standard)}</div>
  ${acsHtml}
</div>

<div class="panel" id="panel-cost" role="region" aria-labelledby="btn-cost">
  <div class="section-title">Costs</div>
  <div style="margin-bottom:12px;font-size:13px">Aircraft <input id="aircraftLabel" size="8" value="${esc(cr.costs.rates.aircraftLabel || '')}">
    $<input id="aircraftRate" size="5" value="${esc(cr.costs.rates.aircraftRate)}">/hr · Instructor
    $<input id="instructorRate" size="5" value="${esc(cr.costs.rates.instructorRate)}">/hr
    <button type="button" onclick="put('/api/checkride/rates',{aircraftLabel:val('aircraftLabel'),aircraftRate:val('aircraftRate'),instructorRate:val('instructorRate')})">Save</button>
  </div>
  <table><thead><tr><th>Phase</th><th class="num">Flights</th><th class="num">Hours</th><th class="num">Aircraft</th><th class="num">Instructor</th><th class="num">Total</th></tr></thead>
  <tbody>${phaseRows}<tr><td><b>To date</b></td><td colspan="4"></td><td class="num"><b>${usd(cr.costs.toDate)}</b></td></tr></tbody></table>
  <p style="margin-top:12px;font-size:13px"><b>Projected remaining: ${usd(p.total)}</b>
    <span class="sub"> (aircraft ${usd(p.aircraftCost)} + instructor ${usd(p.instructorCost)}) · ${p.remainingDualHours}h dual + ${p.remainingSoloHours}h solo · ~${p.estimatedLessons} lessons · ${esc(p.basis)}</span></p>
  <details class="flights"><summary>Edit flight details</summary>
    <p class="sub" style="margin:6px 0 8px">XC distance, full-stop points, longest leg, tower ops, night takeoffs, prep flag, and per-flight rates. Saved separately so anchored logbook entries aren't rewritten.</p>
    <table><thead><tr><th>Flight</th><th class="num">Hrs</th><th>Phase</th><th>Rates</th><th>XC / tower / night</th><th class="num">Cost</th><th></th></tr></thead><tbody>${flightRows}</tbody></table>
  </details>
</div>

</div><div id="toast">Saved</div>
<script>
function val(id){return document.getElementById(id).value}
function toggle(name){
  const panel=document.getElementById('panel-'+name), btn=document.getElementById('btn-'+name);
  const open=!panel.classList.contains('open');
  ['req','acs','cost'].forEach(n=>{
    const p=document.getElementById('panel-'+n), b=document.getElementById('btn-'+n);
    const on=n===name&&open; p.classList.toggle('open',on); b.setAttribute('aria-expanded',on?'true':'false');
  });
  if(open) panel.scrollIntoView({behavior:'smooth',block:'nearest'});
}
async function put(url,body){
  const r=await fetch(url,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  const j=await r.json().catch(()=>({}));
  if(!r.ok){alert(j.error||'Save failed');return}
  const t=document.getElementById('toast');t.style.display='block';setTimeout(()=>location.reload(),350);
}
function rowData(tr){const o={};tr.querySelectorAll('input,select').forEach(i=>{o[i.name]=i.type==='checkbox'?i.checked:i.value});return o}
function saveEndorsement(b){const tr=b.closest('tr');put('/api/checkride/endorsements/'+encodeURIComponent(tr.dataset.key),rowData(tr))}
function saveFlight(b){const tr=b.closest('tr');put('/api/checkride/flights/'+encodeURIComponent(tr.dataset.id),rowData(tr))}
function saveAcs(s){fetch('/api/checkride/acs/'+encodeURIComponent(s.dataset.task),{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({status:s.value})}).then(r=>{if(!r.ok)alert('Save failed')})}
</script></body></html>`;
}

export function registerCheckrideRoutes(app, { dataDir, readEntries, escapeHtml, safeJsonForScript, pg = null }) {
  const store = createCheckrideStore(dataDir, pg);
  const state = (asOf) => computeCheckride(readEntries(), store.read(), { asOf });
  const update = (res, fn) => {
    try { const s = store.read(); fn(s); store.write(s); res.json({ ok: true }); }
    catch (err) { res.status(400).json({ ok: false, error: err.message }); }
  };

  app.get('/api/checkride', (req, res) => res.json(state(req.query.asOf ? String(req.query.asOf) : undefined)));

  app.put('/api/checkride/rates', (req, res) => update(res, s => {
    const a = Number(req.body?.aircraftRate), i = Number(req.body?.instructorRate);
    if (!(a >= 0 && a < 10000) || !(i >= 0 && i < 10000)) throw new Error('rates must be numbers between 0 and 10000');
    s.rates = { aircraftRate: a, instructorRate: i, aircraftLabel: String(req.body?.aircraftLabel ?? s.rates?.aircraftLabel ?? '').slice(0, 40) };
  }));

  app.put('/api/checkride/test-date', (req, res) => update(res, s => {
    const d = req.body?.testDate;
    if (d && !/^\d{4}-\d{2}-\d{2}$/.test(String(d))) throw new Error('testDate must be YYYY-MM-DD');
    s.testDate = d || null;
  }));

  app.put('/api/checkride/endorsements/:key', (req, res) => update(res, s => {
    if (!ENDORSEMENT_CATALOG.some(c => c.key === req.params.key)) throw new Error('unknown endorsement');
    s.endorsements[req.params.key] = sanitizeEndorsement(req.body);
  }));

  app.put('/api/checkride/acs/:taskId', (req, res) => update(res, s => {
    if (!isValidAcsTask(req.params.taskId)) throw new Error('unknown ACS task');
    if (!ACS_STATUSES.includes(req.body?.status)) throw new Error('invalid status');
    s.acs[req.params.taskId] = { status: req.body.status, updatedAt: new Date().toISOString() };
  }));

  app.put('/api/checkride/flights/:entryId', (req, res) => update(res, s => {
    if (!readEntries().some(e => e.id === req.params.entryId)) throw new Error('unknown flight');
    s.flights[req.params.entryId] = sanitizeFlightDetails(req.body);
  }));

  app.get('/checkride', (_req, res) => {
    res.type('html').send(renderPage(state(), escapeHtml));
  });
}
