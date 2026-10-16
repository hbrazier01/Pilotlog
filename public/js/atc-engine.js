/**
 * PilotLog Radio Practice — deterministic tower/ground phraseology + readback grader.
 * Pure module (no DOM, no network, no LLM); shared by browser + server tests.
 * Phraseology modeled on FAA JO 7110.65 (Ch. 2-4 number usage, 3-7 taxi, 3-9 departure,
 * 3-10 arrival) and AIM 4-2 / 4-3. TRAINING ONLY — not real ATC.
 */

export const DISCLAIMER = 'Training only — simulated ATC, not real air traffic control. Phraseology is simplified; always follow your CFI, the AIM and actual ATC instructions.';

const DIGIT_WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'niner'];
const PHONETIC = { A: 'Alpha', B: 'Bravo', C: 'Charlie', D: 'Delta', E: 'Echo', F: 'Foxtrot', G: 'Golf', H: 'Hotel', I: 'India', J: 'Juliett', K: 'Kilo', L: 'Lima', M: 'Mike', N: 'November', O: 'Oscar', P: 'Papa', Q: 'Quebec', R: 'Romeo', S: 'Sierra', T: 'Tango', U: 'Uniform', V: 'Victor', W: 'Whiskey', X: 'X-ray', Y: 'Yankee', Z: 'Zulu' };

/* ----------------------------- speaking helpers ----------------------------- */
export const sayDigits = (s) => String(s).split('').map((c) => (/\d/.test(c) ? DIGIT_WORDS[+c] : c === '.' ? 'point' : PHONETIC[c.toUpperCase()] || c)).join(' ');
export function sayRunway(rw) {
  const m = String(rw || '').toUpperCase().match(/^(\d{1,2})([LRC]?)$/);
  if (!m) return String(rw || '');
  return `${sayDigits(m[1].padStart(2, '0'))}${m[2] ? ' ' + { L: 'left', R: 'right', C: 'center' }[m[2]] : ''}`;
}
export const sayLetter = (l) => PHONETIC[String(l || '').toUpperCase()] || String(l || '');
export function sayCallsign(cs) {
  return String(cs || '').toUpperCase().split('').map((c) => (/\d/.test(c) ? DIGIT_WORDS[+c] : PHONETIC[c] || c)).join(' ');
}
/** Abbreviated N-number per 7110.65 2-4-20: type/“November” + last three characters. */
export function abbreviatedCallsign(cs, typeName = '') {
  const s = String(cs || '').toUpperCase();
  const tail = s.length > 3 ? s.slice(-3) : s;
  return `${typeName || 'N'}${typeName ? ' ' : ''}${tail}`;
}
const fmtWind = (w) => (!w || w.kt == null ? null : w.kt < 3 ? 'wind calm' : `wind ${w.dir === 'VRB' ? 'variable' : String(w.dir).padStart(3, '0')} at ${w.kt}`);
const sayWind = (w) => (!w || w.kt == null ? null : w.kt < 3 ? 'wind calm' : `wind ${w.dir === 'VRB' ? 'variable' : sayDigits(String(w.dir).padStart(3, '0'))} at ${sayDigits(String(w.kt))}`);
const fmtAlt = (a) => (a ? a.toFixed(2) : null);
const sayAlt = (a) => (a ? sayDigits(a.toFixed(2).replace('.', '')) : null);

/* ------------------------------ context setup ------------------------------ */
export const SCENARIOS = Object.freeze([
  { id: 'ground_taxi', title: 'Ground · Taxi', icon: '⟿', facility: 'ground', blurb: 'Call Ground from the ramp with the ATIS and get a taxi clearance with a hold-short.' },
  { id: 'takeoff', title: 'Takeoff clearance', icon: '↗', facility: 'tower', blurb: 'Holding short, ready for departure, staying in the pattern.' },
  { id: 'pattern_entry', title: 'Pattern entry', icon: '⤵', facility: 'tower', blurb: 'Inbound from 10 miles out with the ATIS — get your pattern entry and altimeter.' },
  { id: 'touch_and_go', title: 'Touch-and-go', icon: '⟲', facility: 'tower', blurb: 'Midfield downwind, request the option to keep working the pattern.' },
  { id: 'full_stop', title: 'Full stop', icon: '■', facility: 'tower', blurb: 'Landing clearance, then the exit and the hand-off to Ground.' },
]);

const TYPE_NAMES = { c172: 'Skyhawk', c152: 'Cessna', pa28: 'Cherokee', da40: 'Diamond Star', da20: 'Katana', sr20: 'Cirrus' };
/** Phraseology name for the aircraft type (used before the N-number, AIM 4-2-4). */
export const radioTypeName = (type) => TYPE_NAMES[String(type || '').toLowerCase()] || 'November';

/** Pick the active runway end most into the wind from "17L/35R, 10/28" style specs. */
export function activeRunway(runways, wind) {
  const ends = [];
  for (const spec of runways || []) {
    const id = typeof spec === 'string' ? spec : spec?.id;
    for (const e of String(id || '').split('/')) {
      const m = e.trim().toUpperCase().match(/^(\d{1,2})([LRC]?)$/);
      if (m) ends.push({ id: m[1] + m[2], hdg: (+m[1] % 36 || 36) * 10, side: m[2] });
    }
  }
  if (!ends.length) return null;
  if (!wind || wind.kt == null || wind.dir === 'VRB' || wind.kt < 3) return ends[0].id;
  let best = ends[0], bestHw = -1e9;
  for (const e of ends) {
    const hw = Math.cos(((wind.dir - e.hdg) * Math.PI) / 180) * wind.kt;
    if (hw > bestHw + 0.01) { best = e; bestHw = hw; }
  }
  return best.id;
}

/** Normalise user settings + weather into a practice context. Nothing user-specific is hard-coded. */
/* ------------------------------ traffic / rng ------------------------------ */
/** Small deterministic PRNG (mulberry32) so tests can pin the "random" traffic. */
export function rng(seed) {
  let a = (Number(seed) >>> 0) || 1;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
export const TRAFFIC_TYPES = Object.freeze(['Cessna', 'Skyhawk', 'Cherokee', 'Archer', 'Warrior', 'Diamond Star', 'Cirrus', 'Bonanza', 'Mooney', 'Citation', 'King Air', 'Pilatus']);
const TRAFFIC_POS = Object.freeze([
  { leg: 'base', text: (s) => `on ${s} base` }, { leg: 'final', text: () => 'on a two mile final' },
  { leg: 'final', text: () => 'on short final' }, { leg: 'downwind', text: (s) => `turning ${s} base` },
]);
/** Randomised traffic to follow: type, abbreviated callsign, position, our sequence number. */
export function pickTraffic(rand, side = 'left') {
  const type = TRAFFIC_TYPES[Math.floor(rand() * TRAFFIC_TYPES.length)];
  const p = TRAFFIC_POS[Math.floor(rand() * TRAFFIC_POS.length)];
  const tail = String(Math.floor(rand() * 9) + 1) + 'ABCDEFGHJKLMNPRSTUVWXYZ'[Math.floor(rand() * 23)] + 'ABCDEFGHJKLMNPRSTUVWXYZ'[Math.floor(rand() * 23)];
  const number = rand() < 0.7 ? 2 : 3;
  return { type, callsign: `N${Math.floor(rand() * 900) + 100}${tail.slice(1)}`, position: p.text(side), number };
}
const NUM_WORD = ['zero', 'one', 'two', 'three', 'four'];
/** Speakable taxiway list: ["A","A3"] → "Alpha, Alpha three". */
export const sayTaxiways = (route) => route.map((r) => r.replace(/^([A-Z]{1,2})(\d*)$/, (_, l, d) => l.split('').map(sayLetter).join(' ') + (d ? ' ' + sayDigits(d) : ''))).join(', ');

export function buildContext({ settings = {}, weather = null, scenario = 'ground_taxi', airportData = null, seed = Date.now() } = {}) {
  const airport = String(settings.homeAirport || '').toUpperCase();
  const m = weather?.metar || null;
  const simulated = [];
  let wind = m && m.wdir != null && m.wspd != null ? { dir: m.wdir === 'VRB' ? 'VRB' : Math.round(Number(m.wdir) / 10) * 10 || 360, kt: Math.round(Number(m.wspd)) } : null;
  if (!wind) { wind = { dir: 0, kt: 0 }; simulated.push('wind'); }
  let altimeter = m?.altim ? (Number(m.altim) > 100 ? Number(m.altim) * 0.0295300 : Number(m.altim)) : null;
  if (!altimeter) { altimeter = 29.92; simulated.push('altimeter'); }
  altimeter = Math.round(altimeter * 100) / 100;
  const rwSpecs = (settings.runways ? String(settings.runways).split(/[,;]+/) : null) || weather?.station?.runways || [];
  let runway = activeRunway(rwSpecs, wind);
  if (!runway) { runway = '18'; simulated.push('runway'); }
  const facilityName = String(settings.towerName || '').trim() || (airport ? airport : 'Practice');
  const callsign = String(settings.tailNumber || '').toUpperCase().replace(/[^A-Z0-9]/g, '') || 'N123PL';
  if (!settings.tailNumber) simulated.push('callsign');
  const typeName = radioTypeName(settings.aircraftType);
  // ATIS: real letter from D-ATIS when the field publishes one, else a stable simulated letter
  let atis = airportData?.atis?.letter || null;
  if (!atis) { atis = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'[(new Date(weather?.metar?.obsTime || Date.now()).getUTCHours()) % 26]; simulated.push('atis'); }
  const side = runway.endsWith('R') ? 'right' : 'left'; // standard pattern is left unless parallel right
  // Taxi route from OpenStreetMap taxiway names, else a clearly-labelled generic route
  const taxi = airportData?.taxi?.[runway] || null;
  const taxiRoute = taxi?.route?.length ? taxi.route : ['A'];
  if (!taxi?.route?.length) simulated.push('taxi');
  const exitTaxiway = taxi?.exit || (taxi?.route?.length ? taxi.route[0] : 'C');
  if (!taxi?.exit) simulated.push('exit');
  const exitSide = taxi?.exitSide || 'left';
  const f = airportData?.freqs || null;
  const freqs = { tower: f?.tower || null, ground: f?.ground || null, atis: f?.atis || null, source: f ? f.source : null };
  if (!f) simulated.push('freq');
  const traffic = pickTraffic(rng(seed), side);
  return { scenario, airport, facilityName, callsign, typeName, wind, altimeter, runway, atis, side, taxiRoute, taxiway: taxiRoute.join(', '), sayTaxi: sayTaxiways(taxiRoute), exitTaxiway, sayExit: sayTaxiways([exitTaxiway]), exitSide, freqs, traffic, taxiSource: taxi ? 'OpenStreetMap' : null, simulated, needsSetup: !airport };
}

/* ------------------------------- normaliser -------------------------------- */
const WORD_MAP = {
  zero: '0', one: '1', won: '1', two: '2', to: null, too: '2', three: '3', tree: '3', four: '4', for: null, fower: '4', five: '5', fife: '5', six: '6', seven: '7', eight: '8', ate: '8', nine: '9', niner: '9',
  left: 'L', right: 'R', center: 'C', centre: 'C',
};
const PHON_IN = Object.fromEntries(Object.entries(PHONETIC).map(([k, v]) => [v.toLowerCase().replace('-', ''), k]));
PHON_IN.alfa = 'A'; PHON_IN.juliet = 'J'; PHON_IN.xray = 'X'; PHON_IN.whisky = 'W';

/**
 * Normalise free speech/text into tokens: spoken digits → digits, phonetic letters → letters,
 * runs of single digits/letters joined ("one seven left" → "17L", "november four five two one delta" → "N4521D",
 * "three zero one two" / "30.12" → "3012").
 */
const TEENS = { ten: '10', eleven: '11', twelve: '12', thirteen: '13', fourteen: '14', fifteen: '15', sixteen: '16', seventeen: '17', eighteen: '18', nineteen: '19' };
const ONES = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, niner: 9 };
/** Canonicalise common spoken/typed variants before tokenising. */
export function canonicalize(text) {
  let t = String(text || '').toLowerCase().replace(/&/g, ' and ').replace(/[’']/g, '');
  t = t.replace(/\b(twenty|thirty)[\s-]+(one|two|three|four|five|six|seven|eight|nine|niner)\b/g, (_, a, b) => String((a === 'twenty' ? 20 : 30) + ONES[b]));
  t = t.replace(/\b(ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen)\b/g, (w) => TEENS[w]).replace(/\btwenty\b/g, '20').replace(/\bthirty\b/g, '30');
  return t
    .replace(/\btake[\s-]+off\b/g, 'takeoff').replace(/\bdown[\s-]+wind\b/g, 'downwind').replace(/\bmid[\s-]+field\b/g, 'midfield')
    .replace(/\btouch[\s-]*(and|n|&)?[\s-]*go(es)?\b/g, 'touch and go').replace(/\bfull[\s-]+stop\b/g, 'full stop')
    .replace(/\bclear(ed)?\b/g, 'cleared').replace(/\bholding short\b/g, 'hold short').replace(/\bhold[\s-]+short\b/g, 'hold short')
    .replace(/\bnumber to\b/g, 'number two').replace(/\bright[\s-]+hand\b/g, 'right').replace(/\bleft[\s-]+hand\b/g, 'left')
    .replace(/\bwilco\b/g, 'wilco').replace(/\bwith (the )?information\b/g, 'information').replace(/\bwe have\b/g, 'have');
}
export function normalizeUtterance(text) {
  const raw = canonicalize(text).replace(/(\d)\.(\d)/g, '$1$2').replace(/[,;:!?.]/g, ' | ').replace(/[^a-z0-9\s|-]/g, ' ').replace(/-/g, ' ');
  const toks = [];
  for (const w of raw.split(/\s+/).filter(Boolean)) {
    if (w === '|') { toks.push({ t: '|', glue: false, sep: true }); continue; }
    if (/^\d+$/.test(w)) { toks.push({ t: w, glue: true }); continue; }
    if (/^\d+[lrc]$/.test(w)) { toks.push({ t: w.toUpperCase(), glue: true }); continue; }
    if (/^[a-z]{1,2}\d+[a-z]{0,3}$/.test(w)) { toks.push({ t: w.toUpperCase(), glue: true }); continue; }
    if (WORD_MAP[w] !== undefined && WORD_MAP[w] !== null) {
      const v = WORD_MAP[w];
      // left/right/centre only glue onto a preceding number (runway designator)
      if (/^[LRC]$/.test(v)) { const p = toks[toks.length - 1]; if (p && p.glue && /\d$/.test(p.t)) { p.t += v; p.closed = true; continue; } toks.push({ t: w, glue: false }); continue; }
      toks.push({ t: v, glue: true }); continue;
    }
    if (PHON_IN[w]) { toks.push({ t: PHON_IN[w], glue: true, letter: true }); continue; }
    toks.push({ t: w, glue: false });
  }
  const out = [];
  for (const k of toks) {
    const p = out[out.length - 1];
    if (k.glue && p && p.glue && !p.closed) { p.t += k.t; if (k.closed) p.closed = true; continue; }
    out.push({ ...k });
  }
  return out.filter((k) => !k.sep).map((k) => (k.glue ? k.t.toUpperCase() : k.t));
}
const has = (toks, re) => toks.some((t) => re.test(t));
const afterWord = (toks, w, letter) => toks.some((t, i) => t.toLowerCase() === w && String(toks[i + 1] || '').toUpperCase().startsWith(letter.toUpperCase()) && /^[A-Z]/.test(String(toks[i + 1] || '')));
const hasPhrase = (toks, phrase) => (' ' + toks.join(' ').toLowerCase() + ' ').includes(' ' + phrase.toLowerCase() + ' ');

/** Callsign heard: full ("N4521D"), without N, or abbreviated last three ("21D") per 2-4-20. */
export function heardCallsign(toks, cs) {
  const full = cs.toUpperCase(), noN = full.replace(/^N/, ''), last3 = full.slice(-3);
  // speech has no commas, so a callsign can glue onto a preceding taxiway letter ("alpha eight sierra papa" → A8SP)
  return toks.some((t) => { const u = t.toUpperCase(); return u === full || u === noN || u.endsWith(noN) || (u.length >= 3 && u.endsWith(last3)); });
}
/** Taxiway designator heard: exact token, or glued onto a following callsign/number ("A3" + "PL" → "A3PL"). */
export function heardTaxiway(toks, ref) {
  const r = String(ref || '').toUpperCase();
  // speech has no commas, so "alpha alpha three" arrives glued as "AA3": accept ref anywhere inside a glued token
  const L = r.replace(/\d+$/, '').toLowerCase(), D = r.slice(L.length);
  const lead = new Set(['via', 'at', 'and', 'then', 'left', 'right', 'on', 'cross']);
  // typed single letters ("via a 3") stay lowercase words — accept them after a route keyword
  if (toks.some((t, i) => t === L && lead.has(String(toks[i - 1])) && (!D || String(toks[i + 1] || '').startsWith(D)))) return true;
  return toks.some((t) => {
    if (t !== t.toUpperCase() || !/[A-Z]/.test(t)) return false;
    for (let i = t.indexOf(r); i >= 0; i = t.indexOf(r, i + 1)) {
      if (/\d$/.test(r) && /^\d/.test(t.slice(i + r.length))) continue;
      if (/^[A-Z]/.test(r) && i > 0 && /\d/.test(t[i - 1]) && i + r.length < t.length) continue;
      return true;
    }
    return false;
  });
}
const heardRunway = (toks, rw) => {
  const R = rw.toUpperCase(), alts = [R, R.padStart(R.length + 1, '0')];
  // exact, or glued onto a following callsign ("18" + "3PL" → "183PL") as long as the designator is complete
  return toks.some((t) => { const u = t.toUpperCase(); return alts.some((a) => u === a || (u.startsWith(a) && u.length > a.length + 1 && (/[LRC]$/.test(a) || /[A-Z]/.test(u.slice(a.length))))); });
};

/* ------------------------------ scenario script ----------------------------- */
const el = (id, label, why, test) => ({ id, label, why, test });
const CS = (c) => el('callsign', 'Your callsign', 'Every transmission and readback ends (or starts) with your callsign so ATC knows who acknowledged (AIM 4-2-3).', (t) => heardCallsign(t, c.callsign));
const RW = (c) => el('runway', `Runway ${c.runway}`, 'Runway assignments must be read back (7110.65 3-7-2, AIM 4-3-18).', (t) => heardRunway(t, c.runway));

/**
 * Full scripted exchange for a scenario. Each step: the student's expected call (graded),
 * then the controller's reply (display + spoken), then the readback elements required.
 */
export function scenarioScript(ctx) {
  const c = ctx;
  const fac = (kind) => `${c.facilityName} ${kind === 'ground' ? 'Ground' : 'Tower'}`;
  const csFull = `${c.typeName} ${c.callsign}`;
  const csSayFull = `${c.typeName} ${sayCallsign(c.callsign)}`;
  const csAbbr = abbreviatedCallsign(c.callsign, c.typeName);
  const csSayAbbr = `${c.typeName} ${sayCallsign(c.callsign.slice(-3))}`;
  const wind = fmtWind(c.wind), swind = sayWind(c.wind);
  const alt = fmtAlt(c.altimeter), salt = sayAlt(c.altimeter);
  const facEl = (kind) => el('facility', `Who you're calling (${fac(kind)})`, 'Open with the facility you are calling, then who you are (AIM 4-2-3 initial contact).', (t) => hasPhrase(t, kind === 'ground' ? 'ground' : 'tower'));
  const atisEl = el('atis', `ATIS “information ${sayLetter(c.atis)}”`, 'Tell ATC you have the current ATIS so they don\'t have to read you the weather (AIM 4-1-13).', (t) => has(t, new RegExp(`^${c.atis}$`, 'i')) && (hasPhrase(t, 'information') || hasPhrase(t, 'with') || hasPhrase(t, 'have') || hasPhrase(t, 'got')));
  const S = {
    ground_taxi: [{
      cue: 'You\'re parked on the ramp with the ATIS. Call Ground for taxi to the active runway, staying in the pattern.',
      example: `${fac('ground')}, ${csFull}, at the ramp with information ${sayLetter(c.atis)}, ready to taxi, VFR closed traffic.`,
      call: [facEl('ground'), CS(c), el('position', 'Your position (e.g. “at the ramp”)', 'Ground needs to know where you are to build a taxi route.', (t) => hasPhrase(t, 'ramp') || hasPhrase(t, 'parking') || hasPhrase(t, 'fbo') || hasPhrase(t, 'hangar') || hasPhrase(t, 'tie down') || hasPhrase(t, 'spot')), atisEl, el('request', 'Request (“ready to taxi”)', 'State what you want.', (t) => hasPhrase(t, 'taxi'))],
      reply: { text: `${csFull}, ${fac('ground')}, runway ${c.runway}, taxi via ${c.taxiway}, hold short of runway ${c.runway}.`, speak: `${csSayFull}, ${fac('ground')}, runway ${sayRunway(c.runway)}, taxi via ${c.sayTaxi}, hold short of runway ${sayRunway(c.runway)}.` },
      readback: [RW(c), el('route', `Taxi route “via ${c.taxiway}”`, 'Read back the taxi route so Ground can catch a wrong turn before it happens (7110.65 3-7-2).', (t) => { const l3 = c.callsign.slice(-3); const u = t.map((x) => (x.length > l3.length && x.endsWith(l3) ? x.slice(0, -l3.length) : x)); return heardTaxiway(u, c.taxiRoute[0]) && heardTaxiway(u, c.taxiRoute[c.taxiRoute.length - 1]); }), el('hold_short', `“Hold short runway ${c.runway}”`, 'Hold-short instructions MUST be read back word-for-word (7110.65 3-7-2, AIM 4-3-18). This is the #1 runway-incursion safeguard.', (t) => hasPhrase(t, 'hold short') || hasPhrase(t, 'short of')), CS(c)],
      ideal: `Runway ${c.runway}, taxi via ${c.taxiway}, hold short runway ${c.runway}, ${csAbbr}.`,
    }],
    takeoff: [{
      cue: `You\'ve switched to Tower and you\'re holding short of runway ${c.runway}, run-up complete. Tell Tower you\'re ready, staying in the pattern.`,
      example: `${fac('tower')}, ${csFull}, holding short runway ${c.runway}, ready for departure, closed traffic.`,
      call: [facEl('tower'), CS(c), el('position', `Position (“holding short runway ${c.runway}”)`, 'Tell Tower exactly where you are holding.', (t) => hasPhrase(t, 'holding short') || hasPhrase(t, 'hold short')), el('request', 'Request (“ready for departure”)', 'Say what you\'re ready for; add your intentions (closed traffic / departure direction).', (t) => hasPhrase(t, 'ready'))],
      reply: { text: `${csAbbr}, ${wind}, runway ${c.runway}, cleared for takeoff, make ${c.side} closed traffic.`, speak: `${csSayAbbr}, ${swind}, runway ${sayRunway(c.runway)}, cleared for takeoff, make ${c.side} closed traffic.` },
      readback: [RW(c), el('clearance', '“Cleared for takeoff”', 'Never roll without reading back the takeoff clearance with the runway (AIM 4-3-18).', (t) => hasPhrase(t, 'cleared for takeoff') || hasPhrase(t, 'cleared takeoff') || hasPhrase(t, 'cleared to go')), el('pattern', `“${c.side} closed traffic”`, 'Read back pattern instructions so Tower knows you\'ll stay in the pattern.', (t) => hasPhrase(t, `${c.side} closed`) || hasPhrase(t, `${c.side} traffic`) || hasPhrase(t, 'closed traffic') || hasPhrase(t, 'closed pattern') || hasPhrase(t, 'closed')), CS(c)],
      ideal: `Runway ${c.runway}, cleared for takeoff, ${c.side} closed traffic, ${csAbbr}.`,
    }],
    pattern_entry: [{
      cue: `You\'re 10 miles south at 7,500 with the ATIS, inbound to land. Make your initial call to ${fac('tower')}.`,
      example: `${fac('tower')}, ${csFull}, one zero miles south, seven thousand five hundred, with information ${sayLetter(c.atis)}, inbound for landing.`,
      call: [facEl('tower'), CS(c), el('position', 'Position (distance + direction)', 'Give your position as distance and direction from the airport (AIM 4-3-2).', (t) => hasPhrase(t, 'miles') || hasPhrase(t, 'mile')), atisEl, el('request', 'Intentions (“inbound for landing”)', 'Say what you intend to do.', (t) => hasPhrase(t, 'landing') || hasPhrase(t, 'full stop') || hasPhrase(t, 'touch and go') || hasPhrase(t, 'inbound'))],
      reply: { text: `${csAbbr}, ${fac('tower')}, enter ${c.side} downwind runway ${c.runway}, report midfield, altimeter ${alt}.`, speak: `${csSayAbbr}, ${fac('tower')}, enter ${c.side} downwind runway ${sayRunway(c.runway)}, report midfield, altimeter ${salt}.` },
      readback: [el('entry', `“Enter ${c.side} downwind”`, 'Read back the pattern entry — the leg AND direction matter for traffic separation.', (t) => hasPhrase(t, `${c.side} downwind`)), RW(c), el('report', '“Report midfield”', 'Acknowledge reporting points so you remember to call (AIM 4-3-2).', (t) => hasPhrase(t, 'midfield')), el('altimeter', `Altimeter ${alt}`, 'Read back the altimeter setting and set it — a wrong setting means a wrong pattern altitude (AIM 7-2-2).', (t) => has(t, new RegExp(`^${alt.replace('.', '')}$`))), CS(c)],
      ideal: `${c.side[0].toUpperCase() + c.side.slice(1)} downwind runway ${c.runway}, report midfield, ${alt}, ${csAbbr}.`,
    }],
    touch_and_go: [{
      cue: `You\'re midfield ${c.side} downwind for runway ${c.runway}. Report and ask for a touch-and-go.`,
      example: `${fac('tower')}, ${csAbbr}, midfield ${c.side} downwind, touch and go.`,
      call: [facEl('tower'), CS(c), el('position', `Position (“midfield ${c.side} downwind”)`, 'Report where you are in the pattern.', (t) => hasPhrase(t, 'downwind') || hasPhrase(t, 'midfield')), el('request', 'Request (“touch and go” / “the option”)', 'Tell Tower what kind of landing you want.', (t) => hasPhrase(t, 'touch and go') || hasPhrase(t, 'option'))],
      reply: { text: `${csAbbr}, number ${c.traffic.number === 3 ? 'three' : 'two'}, follow the ${c.traffic.type} ${c.traffic.position}, runway ${c.runway}, cleared touch-and-go.`, speak: `${csSayAbbr}, number ${c.traffic.number === 3 ? 'three' : 'two'}, follow the ${c.traffic.type} ${c.traffic.position}, runway ${sayRunway(c.runway)}, cleared touch and go.` },
      readback: [el('sequence', `“Number ${c.traffic.number === 3 ? 'three' : 'two'}, follow the ${c.traffic.type}”`, 'Acknowledge your sequence and traffic so Tower knows you have it (AIM 4-3-3).', (t) => hasPhrase(t, 'number 2') || hasPhrase(t, 'number 3') || hasPhrase(t, 'number two') || hasPhrase(t, 'number three') || hasPhrase(t, 'follow') || hasPhrase(t, 'in sight') || hasPhrase(t, 'traffic')), RW(c), el('clearance', '“Cleared touch-and-go”', 'Read back the landing clearance with the runway — it\'s a runway clearance (AIM 4-3-18).', (t) => hasPhrase(t, 'cleared touch and go') || hasPhrase(t, 'cleared option') || hasPhrase(t, 'cleared for the option') || hasPhrase(t, 'cleared for touch and go') || hasPhrase(t, 'cleared for the touch and go')), CS(c)],
      ideal: `Number ${c.traffic.number === 3 ? 'three' : 'two'}, ${c.traffic.type} in sight, runway ${c.runway}, cleared touch-and-go, ${csAbbr}.`,
    }],
    full_stop: [{
      cue: `You\'re turning ${c.side} base for runway ${c.runway}. Report and request a full stop.`,
      example: `${fac('tower')}, ${csAbbr}, ${c.side} base runway ${c.runway}, full stop.`,
      call: [facEl('tower'), CS(c), el('position', `Position (“${c.side} base”)`, 'Report your leg.', (t) => hasPhrase(t, 'base') || hasPhrase(t, 'final')), el('request', 'Request (“full stop”)', 'Tell Tower this landing is a full stop.', (t) => hasPhrase(t, 'full stop') || hasPhrase(t, 'landing'))],
      reply: { text: `${csAbbr}, ${wind}, runway ${c.runway}, cleared to land.`, speak: `${csSayAbbr}, ${swind}, runway ${sayRunway(c.runway)}, cleared to land.` },
      readback: [RW(c), el('clearance', '“Cleared to land”', 'Always read back a landing clearance with the runway (AIM 4-3-18).', (t) => hasPhrase(t, 'cleared to land') || hasPhrase(t, 'cleared for landing') || hasPhrase(t, 'cleared land')), CS(c)],
      ideal: `Runway ${c.runway}, cleared to land, ${csAbbr}.`,
    }, {
      cue: 'You\'re down and slowing. Tower calls you with your exit — read it back.',
      example: null,
      call: null,
      reply: { text: `${csAbbr}, turn ${c.exitSide} at ${c.exitTaxiway}, contact Ground${c.freqs.ground ? ' point ' + c.freqs.ground.split('.')[1].replace(/0+$/, '') : ''}.`, speak: `${csSayAbbr}, turn ${c.exitSide} at ${c.sayExit}, contact Ground${c.freqs.ground ? ' point ' + sayDigits(c.freqs.ground.split('.')[1].replace(/0+$/, '')) : ''}.` },
      readback: [el('exit', `“${c.exitSide[0].toUpperCase() + c.exitSide.slice(1)} at ${c.exitTaxiway}”`, 'Read back the exit taxiway so Tower knows when you\'ll be clear.', (t) => heardTaxiway(t, c.exitTaxiway)), el('contact', '“Contact Ground”', 'Acknowledge the frequency change before switching.', (t) => hasPhrase(t, 'ground')), CS(c)],
      ideal: `${c.exitSide[0].toUpperCase() + c.exitSide.slice(1)} at ${c.exitTaxiway}, over to Ground, ${csAbbr}.`,
    }],
  };
  return S[c.scenario] || S.ground_taxi;
}

/* --------------------------------- grading --------------------------------- */
/** Grade an utterance against required elements. Returns score + per-element feedback. */
export function gradeElements(utterance, elements) {
  const toks = normalizeUtterance(utterance);
  const results = elements.map((e) => ({ id: e.id, label: e.label, why: e.why, ok: !!e.test(toks) }));
  const got = results.filter((r) => r.ok).length;
  const score = elements.length ? Math.round((got / elements.length) * 100) : 100;
  const missing = results.filter((r) => !r.ok);
  return { score, passed: missing.length === 0, results, missing, tokens: toks };
}
export function gradeCall(utterance, step) { return step.call ? gradeElements(utterance, step.call) : null; }
export function gradeReadback(utterance, step) {
  const g = gradeElements(utterance, step.readback);
  const critical = g.missing.filter((m) => ['hold_short', 'runway', 'clearance', 'callsign'].includes(m.id));
  g.verdict = g.passed ? 'Good readback.' : critical.length ? `Readback incomplete — missing ${critical.map((m) => m.label).join(', ')}.` : `Close — add ${g.missing.map((m) => m.label).join(', ')}.`;
  g.ideal = step.ideal;
  return g;
}

/**
 * State machine for one practice run.
 * phases per step: 'call' (student initiates, if step.call) → 'readback' → next step / 'done'.
 * Tower says "say again" (deterministic) when the initial call is missing the callsign.
 */
export function createSession(ctx) {
  const steps = scenarioScript(ctx);
  return { ctx, steps, i: 0, phase: steps[0].call ? 'call' : 'readback', log: [], grades: [], done: false };
}
export function towerOpening(s) {
  const st = s.steps[s.i];
  return !st.call ? st.reply : null;
}
export function respond(s, utterance) {
  const st = s.steps[s.i];
  const out = { tower: null, grade: null, phase: s.phase };
  s.log.push({ who: 'you', text: String(utterance || '') });
  if (s.phase === 'call') {
    const g = gradeCall(utterance, st);
    out.grade = { kind: 'call', ...g };
    s.grades.push(out.grade);
    if (!g.results.find((r) => r.id === 'callsign').ok) {
      out.tower = { text: `Station calling ${s.ctx.facilityName} ${st.call[0].label.includes('Ground') ? 'Ground' : 'Tower'}, say again your callsign.`, speak: `Station calling ${s.ctx.facilityName} ${st.call[0].label.includes('Ground') ? 'Ground' : 'Tower'}, say again your callsign.` };
      s.log.push({ who: 'atc', text: out.tower.text });
      return out; // stay in 'call'
    }
    out.tower = st.reply; s.phase = 'readback';
    s.log.push({ who: 'atc', text: st.reply.text });
    return out;
  }
  if (s.phase === 'readback') {
    const g = gradeReadback(utterance, st);
    out.grade = { kind: 'readback', ...g };
    s.grades.push(out.grade);
    const holdMissing = g.missing.some((m) => m.id === 'hold_short' || m.id === 'clearance');
    if (holdMissing) {
      // 7110.65 3-7-2: controller restates when a required readback is missing
      const what = g.missing.find((m) => m.id === 'hold_short') ? `hold short of runway ${s.ctx.runway}` : 'read back the clearance';
      out.tower = { text: `${abbreviatedCallsign(s.ctx.callsign, s.ctx.typeName)}, ${what === 'read back the clearance' ? 'verify — read back the clearance' : 'read back ' + what}.`, speak: `${s.ctx.typeName} ${sayCallsign(s.ctx.callsign.slice(-3))}, ${what === 'read back the clearance' ? 'verify, read back the clearance' : 'read back hold short of runway ' + sayRunway(s.ctx.runway)}.` };
      s.log.push({ who: 'atc', text: out.tower.text });
      return out; // let the student try again
    }
    s.i++;
    if (s.i >= s.steps.length) { s.done = true; s.phase = 'done'; }
    else {
      const nx = s.steps[s.i];
      s.phase = nx.call ? 'call' : 'readback';
      if (!nx.call) { out.tower = nx.reply; s.log.push({ who: 'atc', text: nx.reply.text }); }
    }
    return out;
  }
  return out;
}
export function sessionScore(s) {
  if (!s.grades.length) return 0;
  return Math.round(s.grades.reduce((a, g) => a + g.score, 0) / s.grades.length);
}
