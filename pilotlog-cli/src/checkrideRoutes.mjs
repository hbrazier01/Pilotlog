/**
 * Checkride Tracker routes (v0.2).
 *   GET  /checkride                       HTML view
 *   GET  /api/checkride                   full computed state
 *   PUT  /api/checkride/rates             { aircraftRate, instructorRate, aircraftLabel }
 *   PUT  /api/checkride/test-date         { testDate: 'YYYY-MM-DD' | null }
 *   PUT  /api/checkride/endorsements/:key { date, cfiName, cfiCert, notes }
 *   PUT  /api/checkride/acs/:taskId       { status }
 *   PUT  /api/checkride/flights/:entryId  per-flight details (distance, tower ops, rates…)
 * Storage: <DATA_DIR>/checkride.json (separate from entries so anchored records are untouched).
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  computeCheckride, EMPTY_STORE, ENDORSEMENT_CATALOG, sanitizeEndorsement,
  ACS_STATUSES, isValidAcsTask, PHASES, PHASE_LABELS,
} from './lib/checkride/index.mjs';

const FLIGHT_NUM_FIELDS = ['xcDistanceNm', 'fullStopPoints', 'longestLegNm', 'towerFullStops', 'nightTakeoffs', 'nightFullStops', 'aircraftRate', 'instructorRate', 'instructorHours'];

export function createCheckrideStore(dataDir) {
  const file = path.join(dataDir, 'checkride.json');
  return {
    file,
    read() {
      try { return { ...EMPTY_STORE(), ...JSON.parse(fs.readFileSync(file, 'utf8')) }; } catch { return EMPTY_STORE(); }
    },
    write(store) {
      const tmp = file + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify(store, null, 2));
      fs.renameSync(tmp, file);
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

export function registerCheckrideRoutes(app, { dataDir, readEntries, escapeHtml, safeJsonForScript }) {
  const store = createCheckrideStore(dataDir);
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
    const cr = state();
    const esc = escapeHtml;
    const usd = (v) => '$' + Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
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
      <td><input name="cfiCert" placeholder="CFI cert #" value="${esc(e.cfiCert)}" size="10"></td>
      <td><button onclick="saveEndorsement(this)">Save</button></td></tr>`).join('');
    const acsHtml = cr.acs.areas.map(a => `
      <details ${a.tasks.some(t => t.status !== 'proficient') && a.tasks.length ? '' : ''}><summary><b>${esc(a.area)}.</b> ${esc(a.title)}
        <span class="sub">${a.tasks.filter(t => t.status === 'proficient').length}/${a.tasks.length} proficient</span></summary>
        ${a.tasks.length ? a.tasks.map(t => `<div class="acs-row"><span>${esc(t.letter)}. ${esc(t.title)}</span>
          <select data-task="${esc(t.id)}" onchange="saveAcs(this)">${ACS_STATUSES.map(st => `<option value="${st}" ${st === t.status ? 'selected' : ''}>${st.replace('_', ' ')}</option>`).join('')}</select></div>`).join('')
        : '<div class="sub">Not applicable to ASEL.</div>'}
      </details>`).join('');
    const phaseRows = cr.costs.byPhase.filter(p => p.flights).map(p => `<tr><td>${esc(p.label)}</td><td class="num">${p.flights}</td><td class="num">${p.hours}h</td><td class="num">${usd(p.aircraft)}</td><td class="num">${usd(p.instructor)}</td><td class="num"><b>${usd(p.total)}</b></td></tr>`).join('')
      || '<tr><td colspan="6" class="sub">No flights logged yet.</td></tr>';
    const fd = cr.flightDetails || {};
    const flightRows = cr.costs.flights.slice().reverse().map(f => {
      const d = fd[f.id] || {};
      const inp = (k, ph, sz = 5) => `<input name="${k}" placeholder="${ph}" size="${sz}" value="${esc(d[k] ?? '')}">`;
      return `<tr data-id="${esc(f.id)}"><td>${esc(f.date)}<div class="sub">${esc(f.route)}</div></td><td class="num">${f.hours}h</td>
        <td><select name="phase"><option value="">auto (${esc(PHASE_LABELS[f.phase])})</option>${PHASES.map(p => `<option value="${p}" ${d.phase === p ? 'selected' : ''}>${esc(PHASE_LABELS[p])}</option>`).join('')}</select></td>
        <td>${inp('aircraftRate', '$/hr')}${inp('instructorRate', '$/hr')}${inp('instructorHours', 'CFI h', 4)}</td>
        <td>${inp('xcDistanceNm', 'NM', 4)}${inp('fullStopPoints', 'pts', 3)}${inp('longestLegNm', 'leg NM', 4)}${inp('towerFullStops', 'twr', 3)}${inp('nightTakeoffs', 'n T/O', 3)}
          <label class="sub"><input type="checkbox" name="checkridePrep" ${d.checkridePrep ? 'checked' : ''}> prep</label></td>
        <td class="num">${usd(f.total)}</td><td><button onclick="saveFlight(this)">Save</button></td></tr>`;
    }).join('') || '<tr><td colspan="7" class="sub">No flights. Connect your wallet and log flights on the dashboard.</td></tr>';
    const p = cr.costs.projection;
    res.type('html').send(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Checkride Tracker — PilotLog</title><style>
*{box-sizing:border-box;margin:0;padding:0}body{background:#020817;color:#e2e8f0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif}
a{color:#818cf8;text-decoration:none}.page{max-width:1040px;margin:0 auto;padding:32px 20px 60px}
nav{display:flex;gap:8px;margin-bottom:24px;padding:12px 0;border-bottom:1px solid #1e293b}nav a{color:#64748b;font-size:13px;padding:4px 10px;border-radius:6px}nav a.active{color:#818cf8;background:#1e293b}
h1{font-size:24px;font-weight:800;margin-bottom:4px}.card{background:#0b1120;border:1px solid #1e293b;border-radius:12px;padding:18px 20px;margin-bottom:20px;overflow-x:auto}
.section-title{color:#94a3b8;font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;margin-bottom:12px}
table{width:100%;border-collapse:collapse;font-size:13px}td,th{padding:7px 6px;border-bottom:1px solid #1e293b;text-align:left;vertical-align:top}th{color:#64748b;font-weight:600;font-size:11px}
.num{text-align:right;white-space:nowrap}.cite{color:#64748b;font-size:11px;white-space:nowrap}.sub{color:#64748b;font-size:11px}.ok{color:#22c55e;font-weight:700}.no{color:#475569}
input,select{background:#0f172a;color:#e2e8f0;border:1px solid #334155;border-radius:5px;padding:3px 5px;font-size:12px;margin:1px}button{background:#4f46e5;color:#fff;border:0;border-radius:5px;padding:4px 10px;font-size:12px;cursor:pointer}
.kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:20px}.kpi{background:#0f172a;border:1px solid #1e293b;border-radius:8px;padding:12px;text-align:center}.kpi b{display:block;font-size:20px}.kpi span{color:#64748b;font-size:11px}
details{border-bottom:1px solid #1e293b;padding:8px 0}summary{cursor:pointer;font-size:13px}.acs-row{display:flex;justify-content:space-between;align-items:center;padding:4px 0 4px 18px;font-size:13px}
@media(max-width:700px){.kpis{grid-template-columns:repeat(2,1fr)}}#toast{position:fixed;bottom:16px;right:16px;background:#14532d;color:#4ade80;padding:8px 14px;border-radius:8px;display:none;font-size:13px}
</style></head><body><div class="page">
<nav><a href="/">Dashboard</a><a href="/progression">Progression</a><a class="active" href="/checkride">Checkride Tracker</a><a href="/pilot-report">Pilot Report</a></nav>
<h1>Checkride Tracker</h1><div class="sub" style="margin-bottom:18px">Private Pilot ASEL · 14 CFR §61.109(a) · <a href="${esc(cr.readiness.source)}" target="_blank" rel="noopener">eCFR text</a></div>
<div class="kpis">
 <div class="kpi"><b>${cr.readiness.metCount}/${cr.readiness.totalCount}</b><span>§61.109(a) items met</span></div>
 <div class="kpi"><b>${cr.endorsements.filter(e => e.obtained).length}/${cr.endorsements.length}</b><span>Endorsements</span></div>
 <div class="kpi"><b>${cr.acs.counts.proficient}/${cr.acs.total}</b><span>ACS tasks proficient</span></div>
 <div class="kpi"><b>${usd(cr.costs.toDate)}</b><span>Spent · ~${usd(p.total)} to go</span></div>
</div>
<div class="card"><div class="section-title">Aeronautical experience — §61.109(a)</div>
 <div class="sub" style="margin-bottom:8px">Planned checkride date (sets the §61.109(a)(4) window): <input type="date" id="testDate" value="${esc(cr.testDate || '')}"> <button onclick="put('/api/checkride/test-date',{testDate:document.getElementById('testDate').value||null})">Save</button></div>
 <table><tr><th></th><th>Requirement</th><th class="num">Logged</th><th>Reg</th></tr>${reqRows}</table></div>
<div class="card"><div class="section-title">Endorsements</div><table><tr><th></th><th>Endorsement</th><th>Date</th><th>CFI</th><th>Cert #</th><th></th></tr>${endRows}</table></div>
<div class="card"><div class="section-title">ACS tasks — ${esc(cr.acs.standard)}</div>${acsHtml}</div>
<div class="card"><div class="section-title">Costs</div>
 <div style="margin-bottom:10px;font-size:13px">Default rates: aircraft <input id="aircraftLabel" size="9" value="${esc(cr.costs.rates.aircraftLabel || '')}"> $<input id="aircraftRate" size="5" value="${esc(cr.costs.rates.aircraftRate)}">/hr · instructor $<input id="instructorRate" size="5" value="${esc(cr.costs.rates.instructorRate)}">/hr
 <button onclick="put('/api/checkride/rates',{aircraftLabel:val('aircraftLabel'),aircraftRate:val('aircraftRate'),instructorRate:val('instructorRate')})">Save</button></div>
 <table><tr><th>Phase</th><th class="num">Flights</th><th class="num">Hours</th><th class="num">Aircraft</th><th class="num">Instructor</th><th class="num">Total</th></tr>${phaseRows}
 <tr><td><b>To date</b></td><td colspan="4"></td><td class="num"><b>${usd(cr.costs.toDate)}</b></td></tr></table>
 <div style="margin-top:14px;font-size:13px"><b>Projected remaining to checkride: ${usd(p.total)}</b> (aircraft ${usd(p.aircraftCost)} + instructor ${usd(p.instructorCost)})<br>
 <span class="sub">${p.remainingDualHours}h dual + ${p.remainingSoloHours}h solo ≈ ${p.estimatedLessons} lessons at ${p.avgHoursPerLesson}h avg · instructor block factor ×${p.instructorBlockFactor} · projected total ${usd(p.projectedTotalToCheckride)}. ${esc(p.basis)}</span></div></div>
<div class="card"><div class="section-title">Flight details (rates, XC distance, tower ops, prep)</div>
 <table><tr><th>Flight</th><th class="num">Hrs</th><th>Phase</th><th>Aircraft $ · CFI $ · CFI billed h</th><th>XC NM · full-stop pts · longest leg · tower full-stops · night T/O</th><th class="num">Cost</th><th></th></tr>${flightRows}</table></div>
</div><div id="toast">Saved</div>
<script>
function val(id){return document.getElementById(id).value}
async function put(url,body){const r=await fetch(url,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const j=await r.json().catch(()=>({}));
 if(!r.ok){alert(j.error||'Save failed');return}const t=document.getElementById('toast');t.style.display='block';setTimeout(()=>location.reload(),400)}
function rowData(tr){const o={};tr.querySelectorAll('input,select').forEach(i=>{o[i.name]=i.type==='checkbox'?i.checked:i.value});return o}
function saveEndorsement(b){const tr=b.closest('tr');put('/api/checkride/endorsements/'+encodeURIComponent(tr.dataset.key),rowData(tr))}
function saveFlight(b){const tr=b.closest('tr');put('/api/checkride/flights/'+encodeURIComponent(tr.dataset.id),rowData(tr))}
function saveAcs(s){fetch('/api/checkride/acs/'+encodeURIComponent(s.dataset.task),{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({status:s.value})}).then(r=>{if(!r.ok)alert('Save failed')})}
</script></body></html>`);
  });
}
