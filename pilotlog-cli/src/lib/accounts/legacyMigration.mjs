/**
 * legacyMigration.mjs — explicit, one-time hand-off of the legacy single-user data to ONE accounts-v2 student
 * (adapted from PR #11). Never automatic: it runs only from scripts/migrate-legacy-to-student.mjs, defaults to a
 * dry run, and needs the owner named explicitly (LEGACY_OWNER_WALLET / --wallet, --email, or --student).
 *
 * Sources (read-only — legacy files and rows are never modified or deleted):
 *   settings.json, checkride.json, tracks.json, entries.json in the data dir (PILOTLOG_HOME | PILOTLOG_DIR | ./data)
 *   pilot_profiles.checkride_json for the owner wallet (pg-mode checkride) when checkride.json is absent
 * Each kind is copied ONLY if the student has no doc of that kind yet; meta.legacyMigration records the run,
 * so re-running is a no-op. Wallet-keyed flights/aircraft/milestones rows are covered by backfill.mjs (PR-1).
 */
import fs from "node:fs";
import path from "node:path";
import { isValidStudentId } from "./ids.mjs";
import { WALLET_PROVIDERS } from "./walletVerify.mjs";
import { normalizeEmail } from "./magicLink.mjs";
import { sanitizeSettings, DEFAULT_SETTINGS } from "../cockpit/settings.mjs";

export const LEGACY_FILES = Object.freeze({ settings: "settings.json", checkride: "checkride.json", tracks: "tracks.json", entries: "entries.json" });

/** Resolve exactly one active student for the named owner (wallet identity, verified email, or explicit id). */
export async function resolveOwnerStudent(pool, { wallet = null, email = null, studentId = null }) {
  const named = [wallet, email, studentId].filter(Boolean).length;
  if (named !== 1) throw new Error("name exactly one owner: --wallet (or LEGACY_OWNER_WALLET), --email, or --student");
  let rows;
  if (studentId) {
    if (!isValidStudentId(studentId)) throw new Error("invalid student id");
    ({ rows } = await pool.query("SELECT id, status FROM students WHERE id = $1", [studentId]));
  } else if (wallet) {
    ({ rows } = await pool.query(`SELECT s.id, s.status FROM identities i JOIN students s ON s.id = i.student_id
      WHERE i.type = ANY($1) AND i.subject = $2 AND i.verified_at IS NOT NULL`, [Object.keys(WALLET_PROVIDERS), String(wallet).trim()]));
  } else {
    const e = normalizeEmail(email);
    if (!e) throw new Error("invalid email");
    ({ rows } = await pool.query(`SELECT s.id, s.status FROM identities i JOIN students s ON s.id = i.student_id
      WHERE i.type = 'email' AND i.subject = $1 AND i.verified_at IS NOT NULL`, [e]));
  }
  if (rows.length !== 1) throw new Error(rows.length ? "owner resolves to more than one student" : "no student found for that owner — sign in (and link the wallet) first");
  if (rows[0].status !== "active") throw new Error(`owner student is ${rows[0].status}`);
  return rows[0].id;
}

function validDoc(kind, doc) {
  if (kind === "entries") return Array.isArray(doc) && doc.length > 0 && doc.every((e) => e && typeof e === "object" && typeof e.id === "string");
  if (kind === "settings") { try { sanitizeSettings(doc, DEFAULT_SETTINGS); return true; } catch { return false; } }
  return !!doc && typeof doc === "object" && !Array.isArray(doc);
}

export async function migrateLegacyData({ pool, store, dataDir, studentId, ownerWallet = null, apply = false }) {
  const meta = (await store.get(studentId, "meta")) || {};
  if (meta.legacyMigration?.completedAt) return { mode: apply ? "apply" : "dry-run", studentId, ran: false, reason: "already migrated", previous: meta.legacyMigration };
  const copied = [], skipped = [];
  for (const [kind, file] of Object.entries(LEGACY_FILES)) {
    const f = path.join(dataDir, file);
    let doc = null, source = f;
    if (fs.existsSync(f)) {
      try { doc = JSON.parse(fs.readFileSync(f, "utf8")); } catch { skipped.push(`${kind}: unreadable ${file}`); continue; }
    } else if (kind === "checkride" && ownerWallet) {
      const r = await pool.query("SELECT checkride_json FROM pilot_profiles WHERE wallet_address = $1", [ownerWallet]).catch(() => ({ rows: [] }));
      doc = r.rows[0]?.checkride_json ?? null; source = "pilot_profiles.checkride_json";
    }
    if (doc == null) { skipped.push(`${kind}: no legacy data`); continue; }
    if (!validDoc(kind, doc)) { skipped.push(`${kind}: empty or invalid`); continue; }
    if ((await store.get(studentId, kind)) != null) { skipped.push(`${kind}: student already has data`); continue; }
    if (apply && !(await store.putIfAbsent(studentId, kind, doc))) { skipped.push(`${kind}: student already has data`); continue; }
    copied.push({ kind, source, items: Array.isArray(doc) ? doc.length : Object.keys(doc).length });
  }
  if (apply) await store.put(studentId, "meta", { ...meta, legacyMigration: { completedAt: new Date().toISOString(), copied, skipped, from: dataDir } });
  return { mode: apply ? "apply" : "dry-run", studentId, ran: true, copied, skipped };
}
