/**
 * Settings page — scheduling provider, home airport, instructor, aircraft & rates,
 * personal minimums, time zone. Glass-cockpit style; saves via PUT /api/cockpit/settings.
 */
import { shellStart, shellEnd } from './chrome.mjs';
import { SCHEDULING_PROVIDERS } from './settings.mjs';

const TZ = [
  '', 'America/New_York', 'America/Chicago', 'America/Denver', 'America/Phoenix', 'America/Los_Angeles',
  'America/Anchorage', 'Pacific/Honolulu', 'America/Puerto_Rico', 'UTC', 'Europe/London', 'Australia/Sydney',
];

export function renderSettingsPage(esc, { demo = false, user = null, settings, rates = {} } = {}) {
  const s = settings;
  const sc = s.scheduling || {};
  const L = s.limits || {};
  const tzOpts = [...new Set([...TZ, s.timeZone || ''])]
    .map((z) => `<option value="${esc(z)}"${z === (s.timeZone || '') ? ' selected' : ''}>${esc(z || 'Device time zone')}</option>`)
    .join('');
  const provOpts = SCHEDULING_PROVIDERS.map(
    (p) => `<option value="${esc(p.id)}" data-hint="${esc(p.hint)}"${p.id === (sc.provider || 'none') ? ' selected' : ''}>${esc(p.label)}</option>`
  ).join('');
  const ro = demo ? ' disabled' : '';
  const field = (label, html, hint = '') =>
    `<label class="fld"><span class="eyebrow">${esc(label)}</span>${html}${hint ? `<small class="dim">${esc(hint)}</small>` : ''}</label>`;
  const css = `<style>
.set-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}
.card{padding:18px}.card h2{font-size:15px;font-weight:650;margin:4px 0 12px;display:flex;align-items:center;gap:8px}
.card h2 .dot{width:8px;height:8px;border-radius:50%;background:var(--cy);box-shadow:0 0 10px var(--cy)}
.fld{display:flex;flex-direction:column;gap:6px;margin-bottom:12px}.fld small{font-size:11px}
.row2{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.save-bar{position:sticky;bottom:12px;margin-top:14px;display:flex;align-items:center;gap:12px;padding:12px 16px}
#msg.err{color:#fb7185}#msg.ok{color:var(--gr)}
.preview{margin-top:4px;padding:10px;border-radius:12px;background:rgba(0,0,0,.3);border:1px solid var(--line)}
@media(max-width:820px){.set-grid{grid-template-columns:1fr}}
</style>`;
  return (
    shellStart({ title: 'Settings', active: 'settings', demo, escapeHtml: esc, user, timeZone: s.timeZone }) +
    css +
    `<header style="margin:4px 2px 14px">
  <div class="eyebrow">Pilot settings</div>
  <h1 style="font-size:26px;letter-spacing:-.02em;margin-top:6px">Make PilotLog yours</h1>
  <p class="dim" style="max-width:64ch;margin-top:4px">Your school, airport, airplane and limits. Nothing here is shared; it's stored with your logbook.${demo ? ' <span class="mg">Demo mode shows a SAMPLE configuration and can\'t be saved.</span>' : ''}</p>
</header>
<form id="settingsForm" novalidate>
<div class="set-grid">
  <section class="glass card" id="scheduling">
    <h2><span class="dot"></span>Lesson scheduling</h2>
    ${field('Scheduling system', `<select name="provider" id="provider"${ro}>${provOpts}</select>`, 'Used by the Book button on Today\'s Call.')}
    <div id="urlWrap">
      ${field('Booking link', `<input name="url" id="url" type="url" inputmode="url" placeholder="https://" value="${esc(sc.url || '')}"${ro}>`, 'Your school\'s scheduling page. Must start with https://')}
    </div>
    <div id="labelWrap">${field('Button name', `<input name="label" maxlength="40" placeholder="e.g. Club scheduler" value="${esc(sc.label || '')}"${ro}>`)}</div>
    <div class="preview"><span class="eyebrow">Preview</span><div style="margin-top:8px"><span class="btn" id="pv">📅 Book</span></div></div>
  </section>

  <section class="glass card" id="airport">
    <h2><span class="dot"></span>Home airport</h2>
    ${field('ICAO / FAA id', `<input name="homeAirport" maxlength="4" placeholder="e.g. KPAO" style="text-transform:uppercase" value="${esc(s.homeAirport || '')}"${ro}>`, 'Drives live METAR/TAF, runway crosswind and the 3D map origin.')}
    ${field('Time zone', `<select name="timeZone"${ro}>${tzOpts}</select>`, 'Cockpit clock. Defaults to this device.')}
  </section>

  <section class="glass card" id="training">
    <h2><span class="dot"></span>Instructor & aircraft</h2>
    ${field('Instructor name', `<input name="instructorName" maxlength="40" placeholder="Your CFI" value="${esc(s.instructorName || '')}"${ro}>`, 'Used in the "Brief my instructor" message.')}
    ${field('Aircraft type', `<input name="aircraftLabel" maxlength="40" placeholder="e.g. C172S" value="${esc(s.aircraftLabel || rates.aircraftLabel || '')}"${ro}>`)}
    <div class="row2">
      ${field('Aircraft $/hr (wet)', `<input name="aircraftRate" type="number" min="0" max="9999" step="1" value="${esc(String(rates.aircraftRate ?? ''))}"${ro}>`)}
      ${field('Instructor $/hr', `<input name="instructorRate" type="number" min="0" max="9999" step="1" value="${esc(String(rates.instructorRate ?? ''))}"${ro}>`)}
    </div>
  </section>

  <section class="glass card" id="limits">
    <h2><span class="dot"></span>Personal minimums</h2>
    <div class="row2">
      ${field('Max crosswind (kt)', `<input name="maxCrosswindKt" type="number" min="0" max="40" value="${esc(String(L.maxCrosswindKt))}"${ro}>`)}
      ${field('Max gust (kt)', `<input name="maxGustKt" type="number" min="0" max="60" value="${esc(String(L.maxGustKt))}"${ro}>`)}
      ${field('Max wind (kt)', `<input name="maxWindKt" type="number" min="0" max="60" value="${esc(String(L.maxWindKt))}"${ro}>`)}
      ${field('Min ceiling (ft AGL)', `<input name="minCeilingFt" type="number" min="1000" max="20000" step="100" value="${esc(String(L.minCeilingFt))}"${ro}>`)}
      ${field('Min visibility (SM)', `<input name="minVisibilitySm" type="number" min="3" max="10" step="0.5" value="${esc(String(L.minVisibilitySm))}"${ro}>`)}
    </div>
    <small class="dim">Today's Call flags CAUTION past these. Hard VFR minimums still apply.</small>
  </section>
</div>
<div class="glass save-bar">
  <button class="btn" type="submit"${ro}>Save settings</button>
  <span id="msg" class="mono dim" role="status"></span>
</div>
</form>` +
    shellEnd(`
(function(){
const f=document.getElementById('settingsForm'),prov=document.getElementById('provider'),url=document.getElementById('url');
const uw=document.getElementById('urlWrap'),lw=document.getElementById('labelWrap'),pv=document.getElementById('pv'),msg=document.getElementById('msg');
function sync(){const v=prov.value;uw.hidden=v==='none';lw.hidden=v!=='other';
 const o=prov.selectedOptions[0];url.placeholder=o.dataset.hint||'https://';
 const name=v==='other'?(f.label.value||'scheduler'):o.textContent;
 pv.textContent=v==='none'?'⚙ Set up scheduling':'📅 Book on '+name;pv.classList.toggle('ghost',v==='none');}
prov.addEventListener('change',sync);f.label.addEventListener('input',sync);sync();
f.addEventListener('submit',async(e)=>{e.preventDefault();msg.className='mono';msg.textContent='Saving…';
 const v=prov.value;
 if(v!=='none'&&!/^https:\\/\\//i.test(url.value.trim())){msg.className='mono err';msg.textContent='Booking link must start with https://';url.focus();return;}
 const n=(k)=>f[k].value===''?undefined:Number(f[k].value);
 const body={scheduling:{provider:v,url:url.value.trim(),label:f.label.value},homeAirport:f.homeAirport.value.trim().toUpperCase(),
  timeZone:f.timeZone.value,instructorName:f.instructorName.value,aircraftLabel:f.aircraftLabel.value,
  limits:{maxCrosswindKt:n('maxCrosswindKt'),maxGustKt:n('maxGustKt'),maxWindKt:n('maxWindKt'),minCeilingFt:n('minCeilingFt'),minVisibilitySm:n('minVisibilitySm')},
  rates:{aircraftRate:n('aircraftRate'),instructorRate:n('instructorRate')}};
 try{const r=await fetch('/api/cockpit/settings',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  const j=await r.json();if(!r.ok)throw new Error(j.error||('HTTP '+r.status));msg.className='mono ok';msg.textContent='Saved ✓';}
 catch(err){msg.className='mono err';msg.textContent=String(err.message||err);}
});
})();`)
  );
}
