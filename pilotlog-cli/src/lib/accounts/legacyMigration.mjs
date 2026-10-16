/**
 * One-time, idempotent hand-off of the old single-user shared files to one student.
 *
 * Runs only when LEGACY_OWNER_WALLET is set and that exact wallet signs in (or via
 * scripts/migrate-legacy-to-student.mjs). For each kind it copies the legacy file ONLY if the
 * student has no doc of that kind yet, then records meta.legacyMigration. Legacy files are never
 * modified or deleted, so re-running is a no-op and nothing is lost.
 */
import fs from 'node:fs';
import path from 'node:path';

export const LEGACY_FILES = Object.freeze({
  settings: 'settings.json',
  checkride: 'checkride.json',
  tracks: 'tracks.json',
  entries: 'entries.json',
});

export function legacyOwnerWallet() {
  return (process.env.LEGACY_OWNER_WALLET || '').trim() || null;
}

export async function migrateLegacyData({ dataDir, store, studentId, walletAddress, ownerWallet = legacyOwnerWallet(), dryRun = false }) {
  if (!ownerWallet || walletAddress !== ownerWallet) return { ran: false, reason: 'not legacy owner' };
  const meta = (await store.get(studentId, 'meta')) || {};
  if (meta.legacyMigration?.completedAt) return { ran: false, reason: 'already migrated', copied: [] };
  const copied = [], skipped = [];
  for (const [kind, file] of Object.entries(LEGACY_FILES)) {
    const f = path.join(dataDir, file);
    if (!fs.existsSync(f)) { skipped.push(`${kind}: no legacy file`); continue; }
    let doc;
    try { doc = JSON.parse(fs.readFileSync(f, 'utf8')); } catch { skipped.push(`${kind}: unreadable`); continue; }
    if (kind === 'entries' && (!Array.isArray(doc) || !doc.length)) { skipped.push('entries: empty'); continue; }
    if ((await store.get(studentId, kind)) != null) { skipped.push(`${kind}: student already has data`); continue; }
    if (!dryRun) await store.put(studentId, kind, doc);
    copied.push(kind);
  }
  if (!dryRun) await store.put(studentId, 'meta', { ...meta, legacyMigration: { completedAt: new Date().toISOString(), copied, skipped, from: dataDir } });
  return { ran: true, dryRun, copied, skipped };
}
