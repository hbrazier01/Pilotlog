/**
 * Cockpit identity chip from pilot profile (file-backed, no wallet gate).
 */
import fs from 'node:fs';
import path from 'node:path';

export const DEMO_USER = {
  name: 'JORDAN P.',
  role: 'PRIVATE PILOT STUDENT',
  initials: 'JP',
  sample: true,
};

export const FALLBACK_USER = {
  name: 'PILOT',
  role: 'PRIVATE PILOT STUDENT',
  initials: 'P',
  sample: false,
};

export function readCockpitProfile(dataDir) {
  try {
    const raw = fs.readFileSync(path.join(dataDir, 'profile.json'), 'utf8');
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

/** "Holland Brazier" → { display: "HOLLAND B.", initials: "HB" } */
export function formatPilotChip(fullName) {
  const parts = String(fullName || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return null;
  const first = parts[0];
  const last = parts.length > 1 ? parts[parts.length - 1] : '';
  const initials = (first[0] + (last[0] || '')).toUpperCase();
  const display = last
    ? `${first.toUpperCase()} ${last[0].toUpperCase()}.`
    : first.toUpperCase();
  return { name: display, initials, fullName: parts.join(' ') };
}

export function userFromProfile(profile) {
  const full =
    profile?.pilot?.fullName ||
    profile?.fullName ||
    profile?.name ||
    '';
  const chip = formatPilotChip(full);
  if (!chip) return { ...FALLBACK_USER };
  return {
    name: chip.name,
    initials: chip.initials,
    role: 'PRIVATE PILOT STUDENT',
    sample: false,
    fullName: chip.fullName,
  };
}

export function cockpitUser({ demo = false, dataDir = null, profile = null } = {}) {
  if (demo) return { ...DEMO_USER };
  const p = profile ?? (dataDir ? readCockpitProfile(dataDir) : null);
  return userFromProfile(p);
}
