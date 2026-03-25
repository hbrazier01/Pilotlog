/**
 * ingest-entry.mjs — Ingest a maintenance entry into the AirLog ledger.
 *
 * Usage:
 *   node scripts/ingest-entry.mjs <tail> "<raw log line>"
 *   node scripts/ingest-entry.mjs <tail> --file data/records/sample.json
 *
 * Examples:
 *   node scripts/ingest-entry.mjs N123AB "2026-03-15 Tach: 1312.7 Replaced left brake pads. Signed A&P Mike Torres #MT0011"
 *   node scripts/ingest-entry.mjs N123AB --file data/records/sample.json
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseLine, parseLines } from "../src/lib/maintenance-parser.mjs";
import { writeEntry } from "../src/services/ledger.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function usage() {
  console.error('Usage: node scripts/ingest-entry.mjs <tail> "<raw log line>"');
  console.error("       node scripts/ingest-entry.mjs <tail> --file <path>");
  process.exit(1);
}

const [, , tail, ...rest] = process.argv;
if (!tail || rest.length === 0) usage();

let records = [];

if (rest[0] === "--file") {
  const filePath = path.resolve(rest[1]);
  if (!fs.existsSync(filePath)) {
    console.error(`File not found: ${filePath}`);
    process.exit(1);
  }
  const raw = JSON.parse(fs.readFileSync(filePath, "utf8"));
  // Support both array of parsed records and array of raw strings
  if (Array.isArray(raw) && typeof raw[0] === "string") {
    records = parseLines(raw);
  } else if (Array.isArray(raw)) {
    records = raw; // already parsed maintenance records
  } else {
    console.error("File must be a JSON array");
    process.exit(1);
  }
} else {
  const rawLine = rest.join(" ");
  records = [parseLine(rawLine)];
}

let added = 0;
let skipped = 0;

for (const record of records) {
  const entry = { ...record, aircraft_ident: tail };
  const { hash, isNew } = writeEntry(entry);
  if (isNew) {
    added++;
    console.log(`  + ${hash.slice(0, 12)}  ${entry.date ?? "no-date"}  ${entry.action ?? "?"}  ${entry.component ?? "?"}`);
  } else {
    skipped++;
    console.log(`  ~ ${hash.slice(0, 12)}  (duplicate, skipped)`);
  }
}

console.log(`\nLedger updated — ${added} added, ${skipped} skipped (${tail.toUpperCase()})`);
