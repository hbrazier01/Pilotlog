/**
 * Secondary cockpit pages: Flight Plan, Logbook, Training, ACS, Resources.
 */
import { shellStart, shellEnd, demoQ } from './chrome.mjs';
import { entryTotals } from './entries.mjs';
import { ACS_STATUSES } from '../checkride/acs.mjs';

const usd = () => '';

export function renderFlightPlanPage(esc, { demo = false, weather = null, user = null, settings = null } = {}) {
  const wx = weather || {};
  const go = wx.goNoGo || {};
  const metar = wx.metar?.raw || '—';
  const taf = wx.taf?.raw || '—';
  const st = wx.station || null;
  const icao = st?.icao || '';
  const home = icao || 'Home';
  const ac = settings?.aircraftLabel || '';
  const rw = (st?.runways || []).map((r) => r.id).join(', ');
  const needs = !icao;
  return (
    shellStart({ title: 'Flight Plan', active: 'flight-plan', demo, escapeHtml: esc, user, timeZone: settings?.timeZone }) +
    `<section class="glass" style="padding:20px">
  <div class="eyebrow">${esc(home)} · Local practice area</div>
  <h1 style="font-size:26px;margin:8px 0 6px;letter-spacing:-.02em">${esc(st?.name ? st.name.replace(/\b\w+/g, (w) => w[0] + w.slice(1).toLowerCase()) : 'Local')} training plan</h1>
  <p class="dim" style="max-width:62ch;margin-bottom:18px">${needs
    ? 'Set your home airport in <a href="/cockpit/settings#airport">Settings</a> to see live weather and runways here.'
    : `Local dual/solo pattern and airwork from ${esc(icao)}${rw ? ` (runways ${esc(rw)})` : ''}. Check the sectional for airspace around your practice area — this is not an IFR filing.`}</p>
  <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:14px">
    <div class="glass" style="padding:16px;background:rgba(0,0,0,.25)">
      <div class="eyebrow">Route</div>
      <table class="grid" style="margin-top:8px">
        <tr><th>Leg</th><th>From</th><th>To</th><th>Notes</th></tr>
        <tr><td class="mono">1</td><td>${esc(home)}</td><td>Practice area</td><td>Depart per local procedures; remain clear of overlying airspace</td></tr>
        <tr><td class="mono">2</td><td>Practice area</td><td>Practice area</td><td>Steep turns / slow flight / stalls as briefed</td></tr>
        <tr><td class="mono">3</td><td>Practice area</td><td>${esc(home)}</td><td>Return via a published VFR landmark; get ATIS/AWOS early</td></tr>
      </table>
      <p class="dim" style="font-size:11px;margin-top:12px">Frequencies: use the current Chart Supplement for ${esc(home)}.</p>
    </div>
    <div class="glass" style="padding:16px;background:rgba(0,0,0,.25)">
      <div class="eyebrow">Weather snapshot · ${esc(home)}</div>
      <div style="margin:10px 0"><span class="pill ${go.decision === 'GO' ? 'go' : go.decision === 'CAUTION' ? 'caut' : go.decision === 'NO-GO' ? 'nogo' : 'dim'}">${esc(go.decision || 'UNKNOWN')}</span>
      <span class="dim mono" style="margin-left:8px">${esc((go.reasons || []).slice(0, 2).join(' · '))}</span></div>
      <div class="eyebrow">METAR</div>
      <pre class="mono dim" style="white-space:pre-wrap;font-size:11px;margin:6px 0 12px">${esc(metar)}</pre>
      <div class="eyebrow">TAF</div>
      <pre class="mono dim" style="white-space:pre-wrap;font-size:11px">${esc(taf)}</pre>
      <p class="dim" style="font-size:11px;margin-top:12px">Advisory only — get an official briefing and check NOTAMs before flight.${wx.demo ? ' · SAMPLE weather.' : ''}</p>
    </div>
  </div>
  <div class="glass" style="padding:16px;margin-top:14px;background:rgba(0,0,0,.2)">
    <div class="eyebrow">Alternates & fuel</div>
    <p style="margin-top:8px">Pick a primary and secondary alternate within range. Plan ≥ 30 min day / 45 min night VFR reserve (§91.151)${ac ? ` and confirm ${esc(ac)} fuel burn in the POH` : ' and confirm fuel burn in your POH'}.</p>
  </div>
</section>` +
    shellEnd()
  );
}

export function renderLogbookPage(esc, { demo = false, entries = [], user = null, settings = null } = {}) {
  const homeIcao = settings?.homeAirport || '';
  const tot = entryTotals(entries);
  const q = demoQ(demo);
  const rows = [...entries]
    .sort((a, b) => String(b.date).localeCompare(String(a.date)))
    .map(
      (e) => `<tr>
      <td class="mono">${esc(e.date)}</td>
      <td>${esc(e.from || '—')}→${esc(e.to || '—')}</td>
      <td class="mono">${esc(e.aircraftId || '—')}</td>
      <td class="mono">${Number(e.totalTime || 0).toFixed(1)}</td>
      <td class="mono">${Number(e.dual || 0).toFixed(1)}</td>
      <td class="mono">${Number(e.solo || 0).toFixed(1)}</td>
      <td class="mono">${Number(e.night || 0).toFixed(1)}</td>
      <td class="dim">${esc((e.remarks || '').slice(0, 48))}</td>
      ${demo ? '<td></td>' : `<td><button class="btn sm" type="button" data-del="${esc(e.id)}">Delete</button></td>`}
    </tr>`
    )
    .join('') || `<tr><td colspan="9" class="dim">No flights yet. Add your first entry below.</td></tr>`;

  const form = demo
    ? `<p class="dim" style="margin-top:12px">Demo mode is read-only SAMPLE data. Open <a href="/cockpit/logbook">/cockpit/logbook</a> without <span class="mono">?demo=1</span> to add real flights.</p>`
    : `<form id="addEntry" class="glass" style="padding:16px;margin-top:14px;background:rgba(0,0,0,.22)">
  <div class="eyebrow">Add flight</div>
  <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-top:10px">
    <label class="dim">Date<input name="date" type="date" required></label>
    <label class="dim">Aircraft<input name="aircraftId" placeholder="N12345"></label>
    <label class="dim">From<input name="from" placeholder="ICAO" value="${esc(homeIcao)}"></label>
    <label class="dim">To<input name="to" placeholder="ICAO" value="${esc(homeIcao)}"></label>
    <label class="dim">Total hrs<input name="totalTime" type="number" step="0.1" min="0" max="24" required></label>
    <label class="dim">Dual<input name="dual" type="number" step="0.1" min="0"></label>
    <label class="dim">Solo<input name="solo" type="number" step="0.1" min="0"></label>
    <label class="dim">Night<input name="night" type="number" step="0.1" min="0"></label>
    <label class="dim">XC<input name="xc" type="number" step="0.1" min="0"></label>
    <label class="dim" style="grid-column:span 3">Remarks<input name="remarks" placeholder="Pattern work with my CFI"></label>
  </div>
  <button class="btn" style="margin-top:12px" type="submit">Save flight</button>
  <span id="saveMsg" class="dim mono" style="margin-left:10px"></span>
</form>`;

  const script = demo
    ? ''
    : `
document.getElementById('addEntry')?.addEventListener('submit',async(ev)=>{
  ev.preventDefault();
  const fd=new FormData(ev.target); const body=Object.fromEntries(fd.entries());
  ['totalTime','dual','solo','night','xc'].forEach(k=>{if(body[k]==='') delete body[k]; else body[k]=Number(body[k]);});
  const r=await fetch('/api/cockpit/entries',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  const j=await r.json().catch(()=>({}));
  const m=document.getElementById('saveMsg');
  if(!r.ok){m.textContent=j.error||'Save failed';return;}
  m.textContent='Saved'; location.reload();
});
document.querySelectorAll('[data-del]').forEach(b=>b.addEventListener('click',async()=>{
  if(!confirm('Delete this flight?'))return;
  const r=await fetch('/api/cockpit/entries/'+encodeURIComponent(b.dataset.del),{method:'DELETE'});
  if(r.ok) location.reload(); else alert('Delete failed');
}));`;

  return (
    shellStart({ title: 'Logbook', active: 'logbook', demo, escapeHtml: esc, user, timeZone: settings?.timeZone }) +
    `<section class="glass" style="padding:20px">
  <div style="display:flex;justify-content:space-between;align-items:baseline;gap:12px;flex-wrap:wrap">
    <div><div class="eyebrow">Logbook</div><h1 style="font-size:26px;margin:6px 0">Flight entries</h1></div>
    <div class="mono dim" style="display:flex;gap:16px">
      <span>TOTAL <b class="c">${tot.total}</b></span>
      <span>DUAL <b>${tot.dual}</b></span>
      <span>SOLO <b>${tot.solo}</b></span>
      <span>NIGHT <b>${tot.night}</b></span>
      <span>FLIGHTS <b>${tot.count}</b></span>
    </div>
  </div>
  <div style="overflow-x:auto;margin-top:12px">
  <table class="grid">
    <thead><tr><th>Date</th><th>Route</th><th>A/C</th><th>Total</th><th>Dual</th><th>Solo</th><th>Night</th><th>Remarks</th><th></th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
  </div>
  ${form}
  <p class="dim" style="margin-top:12px;font-size:12px">Entries feed Dashboard readiness, timeline, and ACS progress. <a href="/cockpit${q}">Back to Dashboard</a></p>
</section>` +
    shellEnd(script)
  );
}

export function renderTrainingPage(esc, { demo = false, cr = null, briefing = null, user = null, settings = null } = {}) {
  const lessons = [
    { n: '01', title: 'Preflight & taxi flow', tags: ['PA.II', 'Ground'], status: 'done' },
    { n: '02', title: 'Normal & crosswind takeoffs/landings', tags: ['PA.IV'], status: 'done' },
    { n: '03', title: 'Steep turns & ground reference', tags: ['PA.V'], status: 'active' },
    { n: '04', title: 'Slow flight & stalls', tags: ['PA.VII'], status: 'next' },
    { n: '05', title: 'Short & soft field', tags: ['PA.IV'], status: 'queued' },
    { n: '06', title: 'Night local', tags: ['PA.XI', '§61.109'], status: 'queued' },
    { n: '07', title: 'Dual XC to KCOS', tags: ['PA.VI', 'XC'], status: 'queued' },
    { n: '08', title: 'Hood / basic instruments', tags: ['PA.VIII'], status: 'queued' },
  ];
  const focus = briefing?.focus || [];
  const cards = lessons
    .map((l) => {
      const pill =
        l.status === 'done' ? 'ok' : l.status === 'active' ? 'warn' : 'dim';
      const label = l.status === 'done' ? 'COMPLETE' : l.status === 'active' ? 'THIS WEEK' : l.status === 'next' ? 'UP NEXT' : 'QUEUED';
      return `<div class="glass" style="padding:14px;background:rgba(0,0,0,.22)">
      <div style="display:flex;justify-content:space-between;gap:8px"><span class="mono c">${l.n}</span><span class="pill ${pill}">${label}</span></div>
      <div style="font-weight:600;margin:8px 0 6px">${esc(l.title)}</div>
      <div>${l.tags.map((t) => `<span class="pill dim" style="margin-right:4px">${esc(t)}</span>`).join('')}</div>
    </div>`;
    })
    .join('');

  return (
    shellStart({ title: 'Training', active: 'training', demo, escapeHtml: esc, user, timeZone: settings?.timeZone }) +
    `<section class="glass" style="padding:20px">
  <div class="eyebrow">Training syllabus</div>
  <h1 style="font-size:26px;margin:6px 0 8px">Lesson plan</h1>
  <p class="dim" style="margin-bottom:14px">Suggested sequence for Private ASEL. Next focus from your ACS: ${
    focus.length ? focus.map((f) => esc(f.text)).join(', ') : 'log flights to personalize'
  }.</p>
  <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:12px">${cards}</div>
</section>` +
    shellEnd()
  );
}

export function renderAcsPage(esc, { demo = false, cr = null, user = null, settings = null } = {}) {
  const areas = cr?.acs?.areas || [];
  const dis = demo ? 'disabled' : '';
  const html = areas
    .filter((a) => a.tasks.length)
    .map((a) => {
      const pr = a.tasks.filter((t) => t.status === 'proficient').length;
      const tasks = a.tasks
        .map(
          (t) => `<div class="task-row" style="display:flex;align-items:center;gap:10px;padding:6px 0;border-bottom:1px solid rgba(255,255,255,.05)">
        <span class="mono dim" style="width:72px">${esc(t.id)}</span>
        <span style="flex:1">${esc(t.title)}</span>
        <select data-task="${esc(t.id)}" ${dis}>${ACS_STATUSES.map(
            (s) => `<option value="${s}" ${s === t.status ? 'selected' : ''}>${s.replace('_', ' ')}</option>`
          ).join('')}</select>
      </div>`
        )
        .join('');
      return `<div class="glass" style="padding:14px;margin-bottom:12px;background:rgba(0,0,0,.2)">
      <div style="display:flex;justify-content:space-between;gap:8px;margin-bottom:8px">
        <div><span class="mono c">Area ${esc(a.area)}</span> · ${esc(a.title)}</div>
        <span class="mono dim">${pr}/${a.tasks.length}</span>
      </div>${tasks}</div>`;
    })
    .join('');

  const script = demo
    ? ''
    : `
document.querySelectorAll('select[data-task]').forEach(s=>s.addEventListener('change',async()=>{
  const r=await fetch('/api/checkride/acs/'+encodeURIComponent(s.dataset.task),{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({status:s.value})});
  if(!r.ok){const j=await r.json().catch(()=>({}));alert(j.error||'Save failed');}
}));`;

  return (
    shellStart({ title: 'ACS', active: 'acs', demo, escapeHtml: esc, user, timeZone: settings?.timeZone }) +
    `<section class="glass" style="padding:20px">
  <div class="eyebrow">${esc(cr?.acs?.standard || 'FAA-S-ACS-6C')}</div>
  <h1 style="font-size:26px;margin:6px 0 8px">Airman Certification Standards</h1>
  <p class="dim" style="margin-bottom:14px">${cr?.acs?.counts?.proficient || 0} proficient · ${cr?.acs?.counts?.introduced || 0} introduced · ${cr?.acs?.counts?.not_started || 0} not started${demo ? ' · SAMPLE (read-only)' : ''}.</p>
  ${html || '<p class="dim">No ACS data.</p>'}
</section>` +
    shellEnd(script)
  );
}

export function renderResourcesPage(esc, { demo = false, user = null, settings = null } = {}) {
  const links = [
    { title: 'Private Pilot ACS (FAA-S-ACS-6C)', href: 'https://www.faa.gov/training_testing/testing/acs', note: 'Airman Certification Standards' },
    { title: 'Pilot’s Handbook of Aeronautical Knowledge (PHAK)', href: 'https://www.faa.gov/regulations_policies/handbooks_manuals/aviation/phak', note: 'FAA-H-8083-25' },
    { title: 'Airplane Flying Handbook (AFH)', href: 'https://www.faa.gov/regulations_policies/handbooks_manuals/aviation/airplane_handbook', note: 'FAA-H-8083-3' },
    { title: 'Aeronautical Information Manual (AIM)', href: 'https://www.faa.gov/air_traffic/publications/atpubs/aim_html/', note: 'Procedures & phraseology' },
    { title: '14 CFR Part 61 — Certification', href: 'https://www.ecfr.gov/current/title-14/chapter-I/subchapter-D/part-61', note: '§61.109 aeronautical experience' },
    { title: 'aviationweather.gov', href: 'https://aviationweather.gov/', note: 'METAR / TAF / GFA' },
    { title: 'Chart Supplement (your airport)', href: 'https://www.faa.gov/air_traffic/flight_info/aeronav/digital_products/dafd/', note: 'Airport remarks, frequencies & procedures' },
  ];
  const cards = links
    .map(
      (l) => `<a class="glass" href="${esc(l.href)}" target="_blank" rel="noopener" style="display:block;padding:16px;background:rgba(0,0,0,.22)">
      <div style="font-weight:650;color:var(--txt)">${esc(l.title)} ↗</div>
      <div class="dim" style="margin-top:4px;font-size:12px">${esc(l.note)}</div>
    </a>`
    )
    .join('');
  return (
    shellStart({ title: 'Resources', active: 'resources', demo, escapeHtml: esc, user, timeZone: settings?.timeZone }) +
    `<section class="glass" style="padding:20px">
  <div class="eyebrow">Resources</div>
  <h1 style="font-size:26px;margin:6px 0 14px">FAA references</h1>
  <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:12px">${cards}</div>
</section>` +
    shellEnd()
  );
}
