#!/usr/bin/env node
/**
 * generate-pilot-report.mjs
 * Generates a pilot-facing report JSON from local data files.
 *
 * Usage:
 *   node scripts/generate-pilot-report.mjs [--out <path>]
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildPilotReport } from "../src/services/build-pilot-report.mjs";

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

const report = buildPilotReport({ profile, entries, aircraft, maintenance, verification });

// Determine output path
const argOut = process.argv.indexOf("--out");
const outPath =
  argOut !== -1 && process.argv[argOut + 1]
    ? process.argv[argOut + 1]
    : path.join(__dirname, `../airlog-pilot-report-${new Date().toISOString().slice(0, 10)}.json`);

fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
console.log(`Pilot report written to: ${outPath}`);
console.log(`  Pilot       : ${report.pilotIdentity.name || "(unnamed)"}`);
console.log(`  Phase       : ${report.pilotIdentity.pilotPhase || "—"}`);
console.log(`  Total Hours : ${report.flightActivity.totalHours}`);
console.log(`  Medical     : ${report.certificateSnapshot.medical.status.label}`);
console.log(`  Flight Rev  : ${report.certificateSnapshot.flightReview.status.label}`);
console.log(`  Day Current : ${report.currencySummary.passengerDay.status.label}`);
console.log(`  Night Curr  : ${report.currencySummary.passengerNight.status.label}`);
console.log(`  Anchored    : ${report.integrityStatus.anchored ? "Yes" : "No"}`);
