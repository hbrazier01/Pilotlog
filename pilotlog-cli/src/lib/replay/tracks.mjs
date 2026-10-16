/**
 * Persist GPS tracks alongside logbook entries (data/tracks.json).
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { parseTrack, trackStats } from './parse.mjs';
import { detectEvents } from './events.mjs';

export function tracksPath(dataDir) {
  return path.join(dataDir, 'tracks.json');
}

export function readTracks(dataDir) {
  try {
    const raw = fs.readFileSync(tracksPath(dataDir), 'utf8');
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export function writeTracks(dataDir, tracks) {
  const file = tracksPath(dataDir);
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(tracks, null, 2));
  fs.renameSync(tmp, file);
}

export function getTrack(dataDir, entryId) {
  const all = readTracks(dataDir);
  return all[entryId] || null;
}

/** Parse + analyse a track file into the stored track shape (pure; no I/O). */
export function buildTrack(entryId, text, filename = '') {
  const parsed = parseTrack(text, filename);
  const fieldElevFt = 5885;
  const events = detectEvents(parsed.points, { fieldElevFt });
  const stats = trackStats(parsed.points);
  const track = {
    id: crypto.randomBytes(8).toString('hex'),
    entryId,
    format: parsed.format,
    filename: String(filename || '').slice(0, 120),
    sample: false,
    points: parsed.points,
    events,
    stats,
    fieldElevFt,
    savedAt: new Date().toISOString(),
  };
  return track;
}

export function saveTrackForEntry(dataDir, entryId, text, filename = '') {
  const track = buildTrack(entryId, text, filename);
  const all = readTracks(dataDir);
  all[entryId] = track;
  writeTracks(dataDir, all);
  return track;
}

export function deleteTrack(dataDir, entryId) {
  const all = readTracks(dataDir);
  if (!all[entryId]) return false;
  delete all[entryId];
  writeTracks(dataDir, all);
  return true;
}
