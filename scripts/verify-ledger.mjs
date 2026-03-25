/**
 * verify-ledger.mjs — Verify the AirLog ledger for a tail number.
 *
 * Recomputes SHA-256 hashes for all stored entries and checks
 * that they match the claimed hash and filename.
 *
 * Usage:
 *   node scripts/verify-ledger.mjs <tail>
 *   node scripts/verify-ledger.mjs N123AB
 */

import { verifyLedger, readEntries } from "../src/services/ledger.mjs";

const [, , tail] = process.argv;
if (!tail) {
  console.error("Usage: node scripts/verify-ledger.mjs <tail>");
  process.exit(1);
}

const entries = readEntries(tail);
const { ok, results } = verifyLedger(tail);

console.log(`\nLedger verification — ${tail.toUpperCase()}`);
console.log(`${"─".repeat(60)}`);

if (results.length === 0) {
  console.log("No entries found.");
  process.exit(0);
}

for (const r of results) {
  const status = r.valid ? "OK  " : "FAIL";
  console.log(`  [${status}] ${r.hash.slice(0, 16)}…  ${r.file}`);
  if (!r.valid) {
    console.log(`        expected: ${r.expected}`);
    console.log(`        claimed:  ${r.hash}`);
  }
}

console.log(`${"─".repeat(60)}`);
console.log(`Total: ${results.length} entries | ${results.filter((r) => r.valid).length} OK | ${results.filter((r) => !r.valid).length} FAIL`);
console.log(`Result: ${ok ? "VERIFIED ✓" : "TAMPER DETECTED ✗"}`);
process.exit(ok ? 0 : 1);
