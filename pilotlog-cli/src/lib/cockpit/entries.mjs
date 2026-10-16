/**
 * Cockpit logbook entries — file-backed CRUD for the training UI.
 * Reads/writes <dataDir>/entries.json without requiring a wallet session,
 * so Holland can log flights and see readiness update immediately.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const NUM = ['totalTime', 'dual', 'solo', 'pic', 'night', 'xc', 'simulatedInstrument', 'dayLandings', 'nightLandings', 'xcDistanceNm', 'fullStopPoints', 'longestLegNm', 'towerFullStops', 'nightTakeoffs', 'nightFullStops'];

export function entriesPath(dataDir) {
  return path.join(dataDir, 'entries.json');
}

export function readCockpitEntries(dataDir) {
  try {
    const raw = fs.readFileSync(entriesPath(dataDir), 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function writeCockpitEntries(dataDir, entries) {
  const file = entriesPath(dataDir);
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(entries, null, 2));
  fs.renameSync(tmp, file);
}

export function sanitizeEntry(input = {}, { partial = false } = {}) {
  const out = {};
  if (!partial || input.date !== undefined) {
    const d = String(input.date || '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) throw new Error('date must be YYYY-MM-DD');
    out.date = d;
  }
  if (!partial || input.totalTime !== undefined) {
    const h = Number(input.totalTime);
    if (!Number.isFinite(h) || h < 0 || h > 24) throw new Error('totalTime must be 0–24');
    out.totalTime = Math.round(h * 10) / 10;
  }
  for (const k of ['from', 'to', 'aircraftId', 'remarks']) {
    if (input[k] !== undefined) out[k] = String(input[k] ?? '').slice(0, k === 'remarks' ? 500 : 40);
  }
  for (const k of NUM) {
    if (input[k] === undefined || input[k] === null || input[k] === '') continue;
    const v = Number(input[k]);
    if (!Number.isFinite(v) || v < 0 || v > 100000) throw new Error(`${k} invalid`);
    out[k] = Math.round(v * 10) / 10;
  }
  if (input.checkridePrep !== undefined) out.checkridePrep = input.checkridePrep === true || input.checkridePrep === 'true';
  return out;
}

export function createEntry(dataDir, input) {
  const body = sanitizeEntry(input);
  const entries = readCockpitEntries(dataDir);
  const entry = {
    id: crypto.randomBytes(8).toString('hex'),
    ...body,
    dual: body.dual ?? (body.solo ? 0 : body.totalTime),
    solo: body.solo ?? 0,
    from: body.from || 'KAPA',
    to: body.to || 'KAPA',
    createdAt: new Date().toISOString(),
  };
  entries.push(entry);
  writeCockpitEntries(dataDir, entries);
  return entry;
}

export function updateEntry(dataDir, id, input) {
  const entries = readCockpitEntries(dataDir);
  const i = entries.findIndex((e) => e.id === id);
  if (i < 0) throw new Error('unknown entry');
  const patch = sanitizeEntry(input, { partial: true });
  entries[i] = { ...entries[i], ...patch, updatedAt: new Date().toISOString() };
  writeCockpitEntries(dataDir, entries);
  return entries[i];
}

export function deleteEntry(dataDir, id) {
  const entries = readCockpitEntries(dataDir);
  const next = entries.filter((e) => e.id !== id);
  if (next.length === entries.length) throw new Error('unknown entry');
  writeCockpitEntries(dataDir, next);
  return { ok: true };
}

export function entryTotals(entries = []) {
  let total = 0, dual = 0, solo = 0, pic = 0, night = 0, xc = 0;
  for (const e of entries) {
    total += Number(e.totalTime) || 0;
    dual += Number(e.dual) || 0;
    solo += Number(e.solo) || 0;
    pic += Number(e.pic) || Number(e.solo) || 0;
    night += Number(e.night) || 0;
    xc += Number(e.xc) || 0;
  }
  const r = (v) => Math.round(v * 10) / 10;
  return { total: r(total), dual: r(dual), solo: r(solo), pic: r(pic), night: r(night), xc: r(xc), count: entries.length };
}
