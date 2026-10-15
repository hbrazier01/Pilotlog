/**
 * Per-user cockpit settings (file-backed: <DATA_DIR>/settings.json).
 * Everything that used to be hard-coded to one student's setup lives here:
 * scheduling provider, home airport, instructor, aircraft, personal minimums, time zone.
 */
import fs from 'node:fs';
import path from 'node:path';
import { DEFAULT_LIMITS } from '../replay/todaysCall.mjs';
import { AIRCRAFT_TYPES, AIRCRAFT_TYPE_IDS } from '../../../../public/js/aircraft-types.js';

export { AIRCRAFT_TYPES };

export const SCHEDULING_PROVIDERS = [
  { id: 'none', label: 'None', hint: '' },
  { id: 'flightcircle', label: 'FlightCircle', hint: 'https://www.flightcircle.com/…' },
  { id: 'flightschedulepro', label: 'Flight Schedule Pro', hint: 'https://app.flightschedulepro.com/…' },
  { id: 'schedulemaster', label: 'Schedule Master', hint: 'https://www.schedulemaster.com/…' },
  { id: 'myfbo', label: 'myFBO', hint: 'https://*.myfbo.com/…' },
  { id: 'other', label: 'Other', hint: 'Any https:// booking link' },
];
const PROVIDER_IDS = new Set(SCHEDULING_PROVIDERS.map((p) => p.id));

export const DEFAULT_SETTINGS = Object.freeze({
  scheduling: { provider: 'none', url: '', label: '' },
  homeAirport: '',
  instructorName: '',
  aircraftLabel: '',
  aircraftType: '',
  timeZone: '',
  limits: { ...DEFAULT_LIMITS },
});

/** Sample config used in ?demo=1 — never persisted. */
export const DEMO_SETTINGS = Object.freeze({
  scheduling: { provider: 'flightcircle', url: 'https://www.flightcircle.com/', label: '' },
  homeAirport: 'KAPA',
  instructorName: 'Alex (sample CFI)',
  aircraftLabel: 'DA40',
  aircraftType: 'da40',
  timeZone: 'America/Denver',
  limits: { ...DEFAULT_LIMITS },
  sample: true,
});

/** https-only URL validation. Returns normalized href or throws. */
export function validateHttpsUrl(raw) {
  const s = String(raw ?? '').trim();
  if (!s) throw new Error('booking URL is required');
  if (s.length > 500) throw new Error('booking URL is too long');
  let u;
  try { u = new URL(s); } catch { throw new Error('booking URL is not a valid URL'); }
  if (u.protocol !== 'https:') throw new Error('booking URL must start with https://');
  if (!u.hostname || !u.hostname.includes('.')) throw new Error('booking URL needs a real host');
  if (u.username || u.password) throw new Error('booking URL must not contain credentials');
  return u.href;
}

export function isValidTimeZone(tz) {
  if (!tz) return true;
  try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return true; } catch { return false; }
}

const num = (v, lo, hi, name) => {
  const n = Number(v);
  if (!Number.isFinite(n) || n < lo || n > hi) throw new Error(`${name} must be between ${lo} and ${hi}`);
  return n;
};
const str = (v, max) => String(v ?? '').trim().slice(0, max);

/** Validate + normalize a (possibly partial) settings patch. Throws on bad input. */
export function sanitizeSettings(input = {}, base = DEFAULT_SETTINGS) {
  const out = structuredClone({ ...DEFAULT_SETTINGS, ...base, limits: { ...DEFAULT_SETTINGS.limits, ...(base.limits || {}) } });
  delete out.sample;
  if (input.scheduling !== undefined) {
    const sc = input.scheduling || {};
    const provider = String(sc.provider || 'none').toLowerCase();
    if (!PROVIDER_IDS.has(provider)) throw new Error('unknown scheduling provider');
    if (provider === 'none') out.scheduling = { provider, url: '', label: '' };
    else out.scheduling = { provider, url: validateHttpsUrl(sc.url), label: provider === 'other' ? str(sc.label, 40) : '' };
  }
  if (input.homeAirport !== undefined) {
    const icao = str(input.homeAirport, 4).toUpperCase();
    if (icao && !/^[A-Z0-9]{3,4}$/.test(icao)) throw new Error('home airport must be a 3–4 character ICAO/FAA id');
    out.homeAirport = icao;
  }
  if (input.instructorName !== undefined) out.instructorName = str(input.instructorName, 40);
  if (input.aircraftLabel !== undefined) out.aircraftLabel = str(input.aircraftLabel, 40);
  if (input.aircraftType !== undefined) {
    const t = str(input.aircraftType, 10).toLowerCase();
    if (t && !AIRCRAFT_TYPE_IDS.includes(t)) throw new Error('unknown aircraft type');
    out.aircraftType = t;
  }
  if (input.timeZone !== undefined) {
    const tz = str(input.timeZone, 64);
    if (!isValidTimeZone(tz)) throw new Error('unknown time zone');
    out.timeZone = tz;
  }
  if (input.limits !== undefined) {
    const l = input.limits || {};
    const cur = out.limits;
    out.limits = {
      maxCrosswindKt: l.maxCrosswindKt != null ? num(l.maxCrosswindKt, 0, 40, 'max crosswind') : cur.maxCrosswindKt,
      maxGustKt: l.maxGustKt != null ? num(l.maxGustKt, 0, 60, 'max gust') : cur.maxGustKt,
      maxWindKt: l.maxWindKt != null ? num(l.maxWindKt, 0, 60, 'max wind') : cur.maxWindKt,
      minCeilingFt: l.minCeilingFt != null ? num(l.minCeilingFt, 1000, 20000, 'min ceiling') : cur.minCeilingFt,
      minVisibilitySm: l.minVisibilitySm != null ? num(l.minVisibilitySm, 3, 10, 'min visibility') : cur.minVisibilitySm,
    };
  }
  return out;
}

export function readSettings(dataDir) {
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(dataDir, 'settings.json'), 'utf8'));
    // Re-validate on read so a hand-edited file can't inject a javascript: URL.
    return sanitizeSettings(raw, DEFAULT_SETTINGS);
  } catch {
    return structuredClone({ ...DEFAULT_SETTINGS, limits: { ...DEFAULT_SETTINGS.limits } });
  }
}

export function writeSettings(dataDir, patch) {
  const next = sanitizeSettings(patch, readSettings(dataDir));
  const file = path.join(dataDir, 'settings.json');
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(file + '.tmp', JSON.stringify(next, null, 2));
  fs.renameSync(file + '.tmp', file);
  return next;
}

export function settingsFor({ demo = false, dataDir = null } = {}) {
  if (demo) return structuredClone(DEMO_SETTINGS);
  return dataDir ? readSettings(dataDir) : structuredClone(DEFAULT_SETTINGS);
}

/** What the Today's Call booking control should render. */
export function bookingAction(settings, { demo = false } = {}) {
  const sc = settings?.scheduling || {};
  const p = SCHEDULING_PROVIDERS.find((x) => x.id === sc.provider);
  let href = null;
  if (p && p.id !== 'none') { try { href = validateHttpsUrl(sc.url); } catch { href = null; } }
  if (!href) return { kind: 'setup', label: 'Set up scheduling', href: '/cockpit/settings#scheduling' + (demo ? '' : '') };
  const name = p.id === 'other' ? (sc.label || 'scheduler') : p.label;
  return { kind: 'book', label: `Book on ${name}`, href, provider: p.id };
}
