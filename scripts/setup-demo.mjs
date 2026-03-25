#!/usr/bin/env node
/**
 * setup-demo.mjs
 * Verifies demo data is in place and prints all available AirLog endpoints.
 * Run before handing off to a design partner.
 *
 * Usage:
 *   node scripts/setup-demo.mjs
 */

import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { buildTrustReport } from "../src/services/build-trust-report.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.PILOTLOG_HOME || path.join(__dirname, "../data");
const PORT = process.env.PORT || 8788;
const BASE = `http://localhost:${PORT}`;

function readJSON(filePath, fallback) {
  try { return JSON.parse(fs.readFileSync(filePath, "utf-8")); }
  catch { return fallback; }
}

const aircraft = readJSON(path.join(DATA_DIR, "aircraft.json"), { aircraft: [] })?.aircraft || [];
const entries  = readJSON(path.join(DATA_DIR, "entries.json"), []);
const maint    = readJSON(path.join(DATA_DIR, "maintenance.json"), []);
const verif    = readJSON(path.join(DATA_DIR, "verification.json"), {});
const profile  = readJSON(path.join(DATA_DIR, "profile.json"), {});

// Quick hash (matches readApi.mjs hashLogbook)
const currentHash = createHash("sha256")
  .update(JSON.stringify({ entries, profile, aircraft }))
  .digest("hex");

// Run trust report for live score
const report = buildTrustReport({
  aircraft, entries, maintenance: maint,
  verification: { ...verif, currentHash },
});

const PRIMARY = aircraft[0] || {};

console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
console.log("  AirLog Demo Setup");
console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

// Data status
console.log("DATA STATUS");
console.log(`  Aircraft      : ${aircraft.length > 0 ? `✓  ${PRIMARY.ident} (${PRIMARY.type}, ${PRIMARY.manufactureYear || "??"})` : "✗  No aircraft loaded"}`);
console.log(`  Flight entries: ${entries.length > 0 ? `✓  ${entries.length} entries` : "✗  None"}`);
console.log(`  Maintenance   : ${maint.length > 0 ? `✓  ${maint.length} records` : "✗  None"}`);
console.log(`  Verification  : ${verif.anchored ? "✓  Anchored" : "⚠  Not anchored (demo mode)"}`);

console.log("\nTRUST REPORT (live)");
console.log(`  Score         : ${report.trustScore} / 100`);
console.log(`  Risk Level    : ${report.riskLevel.toUpperCase()}`);
console.log(`  Flags         : ${report.riskFlags.length}`);
for (const f of report.riskFlags) {
  console.log(`    [${f.severity.toUpperCase().padEnd(8)}] ${f.code} — ${f.detail}`);
}

console.log("\nENDPOINTS — make sure `docker compose up` (or node readApi.mjs) is running\n");
const endpoints = [
  ["Dashboard",                      "/"],
  ["Sale Packet (HTML)",             "/export/sale-packet/html"],
  ["Sale Packet (JSON)",             "/export/sale-packet"],
  ["Trust Report (HTML)",            "/export/trust-report/html"],
  ["Trust Report (JSON)",            "/export/trust-report"],
  ["Logbook Summary (HTML)",         "/export/summary"],
  ["Logbook Summary (JSON)",         "/export/summary/download"],
  ["Verify Current Hash",            `/verify/hash/${currentHash.slice(0, 16)}...`],
  ["Aircraft (JSON)",                "/aircraft"],
  ["Entries (JSON)",                 "/entries"],
  ["Maintenance (JSON)",             "/maintenance"],
];
for (const [label, path_] of endpoints) {
  const url = path_.startsWith("/verify") ? `${BASE}/verify/hash/${currentHash}` : `${BASE}${path_}`;
  console.log(`  ${label.padEnd(30)} ${url}`);
}

console.log("\nFEEDBACK FORM");
console.log(`  data/feedback-template.json — share with design partners after demo\n`);
console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
