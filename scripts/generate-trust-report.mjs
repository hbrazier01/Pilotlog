#!/usr/bin/env node
/**
 * generate-trust-report.mjs
 * Generates a buyer-facing trust dossier JSON from local data files.
 *
 * Usage:
 *   node scripts/generate-trust-report.mjs [--out <path>]
 */

import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { buildTrustReport } from "../src/services/build-trust-report.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.PILOTLOG_HOME || path.join(__dirname, "../data");

function readJSON(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf-8"));
  } catch {
    return fallback;
  }
}

const aircraftRaw = readJSON(path.join(DATA_DIR, "aircraft.json"), { aircraft: [] });
const aircraft = Array.isArray(aircraftRaw?.aircraft) ? aircraftRaw.aircraft : [];
const entries = readJSON(path.join(DATA_DIR, "entries.json"), []);
const maintenance = readJSON(path.join(DATA_DIR, "maintenance.json"), []);
const verification = readJSON(path.join(DATA_DIR, "verification.json"), {});
const profile = readJSON(path.join(DATA_DIR, "profile.json"), {});

// Compute current hash (same method as readApi.mjs hashLogbook)
function hashLogbook(entries, profile, aircraft) {
  const payload = JSON.stringify({ entries, profile, aircraft });
  return createHash("sha256").update(payload).digest("hex");
}
const currentHash = hashLogbook(entries, profile, aircraft);

const report = buildTrustReport({
  aircraft,
  entries,
  maintenance,
  verification: { ...verification, currentHash },
});

// Determine output path
const argOut = process.argv.indexOf("--out");
const outPath =
  argOut !== -1 && process.argv[argOut + 1]
    ? process.argv[argOut + 1]
    : path.join(__dirname, `../airlog-trust-report-${new Date().toISOString().slice(0, 10)}.json`);

fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
console.log(`Trust report written to: ${outPath}`);
console.log(`  Trust Score : ${report.trustScore} / 100`);
console.log(`  Risk Level  : ${report.riskLevel.toUpperCase()}`);
console.log(`  Risk Flags  : ${report.riskFlags.length}`);
if (report.riskFlags.length > 0) {
  for (const f of report.riskFlags) {
    console.log(`    [${f.severity.toUpperCase()}] ${f.code} — ${f.detail}`);
  }
}
