/**
 * ledger.mjs — AirLog core aircraft record ledger
 *
 * Each maintenance entry is stored as a content-addressed file:
 *   data/ledger/{TAIL}/{entry-hash}.json
 *
 * The entry hash is SHA-256 of the canonical entry content (stable fields only,
 * excluding generated metadata like id, confidence_score, missing_fields).
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { sha256Hex } from "../lib/hash-records.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LEDGER_DIR = path.join(__dirname, "..", "..", "data", "ledger");

/** Canonical fields that determine entry identity (content-addressed). */
function canonicalEntryPayload(entry) {
  return JSON.stringify({
    aircraft_ident: String(entry.aircraft_ident || "").trim().toUpperCase(),
    date: entry.date ?? null,
    action: entry.action ?? null,
    component: entry.component ?? null,
    description: entry.description ?? null,
    tach_time: entry.tach_time ?? null,
    hobbs_time: entry.hobbs_time ?? null,
    signer: entry.signer ?? null,
    source_line: entry.source_line ?? null,
  });
}

/** Derive the content-addressed hash for an entry. */
export function entryHash(entry) {
  return sha256Hex(canonicalEntryPayload(entry));
}

/** Directory for a given tail number. */
function tailDir(tail) {
  return path.join(LEDGER_DIR, tail.toUpperCase());
}

/**
 * Write an entry to the ledger.
 * Returns { hash, filePath, isNew } — isNew=false if entry already exists.
 */
export function writeEntry(entry) {
  const tail = String(entry.aircraft_ident || "").trim().toUpperCase();
  if (!tail) throw new Error("entry.aircraft_ident is required");

  const hash = entryHash(entry);
  const dir = tailDir(tail);
  fs.mkdirSync(dir, { recursive: true });

  const filePath = path.join(dir, `${hash}.json`);
  const isNew = !fs.existsSync(filePath);

  if (isNew) {
    const stored = {
      hash,
      aircraft_ident: tail,
      date: entry.date ?? null,
      action: entry.action ?? null,
      component: entry.component ?? null,
      description: entry.description ?? null,
      tach_time: entry.tach_time ?? null,
      hobbs_time: entry.hobbs_time ?? null,
      signer: entry.signer ?? null,
      source_line: entry.source_line ?? null,
      ingested_at: new Date().toISOString(),
    };
    fs.writeFileSync(filePath, JSON.stringify(stored, null, 2));
  }

  return { hash, filePath, isNew };
}

/**
 * Read all entries for a tail number, sorted by date then hash.
 */
export function readEntries(tail) {
  const dir = tailDir(tail);
  if (!fs.existsSync(dir)) return [];

  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")))
    .sort((a, b) => {
      if (a.date && b.date) return a.date.localeCompare(b.date);
      if (a.date) return -1;
      if (b.date) return 1;
      return a.hash.localeCompare(b.hash);
    });
}

/**
 * Verify all entries for a tail number by recomputing each hash.
 * Returns { ok: boolean, results: [{ hash, file, valid, expected }] }
 */
export function verifyLedger(tail) {
  const dir = tailDir(tail);
  if (!fs.existsSync(dir)) return { ok: true, results: [] };

  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".json"));
  const results = [];

  for (const file of files) {
    const filePath = path.join(dir, file);
    const stored = JSON.parse(fs.readFileSync(filePath, "utf8"));
    const expected = entryHash(stored);
    const claimedHash = stored.hash;
    const valid = claimedHash === expected && file === `${claimedHash}.json`;
    results.push({ hash: claimedHash, file, valid, expected });
  }

  return { ok: results.every((r) => r.valid), results };
}
