/**
 * AirLog Phase 2 — Readiness Validator
 *
 * Checks all requirements for live Midnight PreProd deployment.
 * Runs the full circuit simulation locally and validates env/tooling.
 *
 * Usage:
 *   node scripts/validate-phase2-readiness.mjs
 *
 * For live PreProd check, set env vars:
 *   MIDNIGHT_NODE_URL=https://rpc.testnet-02.midnight.network
 *   MIDNIGHT_INDEXER_URL=https://indexer.testnet-02.midnight.network/api/v1/graphql
 *   MIDNIGHT_PROOF_SERVER_URL=https://proof-server.testnet-02.midnight.network
 *   MIDNIGHT_WALLET_SEED=<your-64-char-hex-seed>
 */

import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { simulateAirlogAnchor } from "../src/services/airlog-contract-local.mjs";

const _dir = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(_dir, "..");

// ── Helpers ────────────────────────────────────────────────────────────────

const PASS = "✓ PASS";
const FAIL = "✗ FAIL";
const WARN = "~ WARN";
const SKIP = "  SKIP";

function check(label, pass, detail = "") {
  const icon = pass === true ? PASS : pass === "warn" ? WARN : pass === "skip" ? SKIP : FAIL;
  const line = `  ${icon}  ${label}`;
  console.log(detail ? `${line}\n         ${detail}` : line);
  return pass === true;
}

function header(title) {
  console.log(`\n${"─".repeat(60)}`);
  console.log(`  ${title}`);
  console.log("─".repeat(60));
}

// ── Load demo data ─────────────────────────────────────────────────────────

const dataDir = process.env.PILOTLOG_HOME || path.resolve(projectRoot, "data");

let aircraft, entries, maintenance;
try {
  const aircraftJson = JSON.parse(fs.readFileSync(path.join(dataDir, "aircraft.json"), "utf8"));
  aircraft = aircraftJson.aircraft?.[0];
  entries = JSON.parse(fs.readFileSync(path.join(dataDir, "entries.json"), "utf8"));
  maintenance = JSON.parse(fs.readFileSync(path.join(dataDir, "maintenance.json"), "utf8"));
} catch (e) {
  console.error(`Failed to load data from ${dataDir}: ${e.message}`);
  process.exit(1);
}

// ── Results accumulator ────────────────────────────────────────────────────

const results = [];
function record(label, pass, detail) {
  results.push({ label, pass, detail });
  return check(label, pass, detail);
}

// ════════════════════════════════════════════════════════════════════════════
// CHECK 1 — Data layer
// ════════════════════════════════════════════════════════════════════════════

header("1 · Data Layer");

record(
  "Aircraft record loaded",
  !!aircraft,
  aircraft ? `${aircraft.ident} — ${aircraft.make} ${aircraft.model} ${aircraft.year || ""}` : "No aircraft in data/aircraft.json"
);

record(
  "Flight log entries present",
  entries.length > 0,
  `${entries.length} entries`
);

const mRecords = Array.isArray(maintenance) ? maintenance : (maintenance?.maintenance || []);
record(
  "Maintenance records present",
  mRecords.length > 0,
  `${mRecords.length} records`
);

const airframeIdHex = aircraft?.serialNumber
  ? Buffer.from(`${aircraft.make || ""}|${aircraft.model || ""}|${aircraft.serialNumber}`, "utf8")
      .toString("hex").padEnd(64, "0").slice(0, 64)
  : null;

record(
  "Aircraft serial number (required for airframeId)",
  !!aircraft?.serialNumber,
  aircraft?.serialNumber ? `Serial: ${aircraft.serialNumber}` : "Missing — airframeId cannot be derived"
);

// ════════════════════════════════════════════════════════════════════════════
// CHECK 2 — Compact contract + runtime
// ════════════════════════════════════════════════════════════════════════════

header("2 · Compact Contract & Local Runtime");

const CONTRACT_CJS = resolve(projectRoot, "compact/contracts/airlog/src/managed/airlog/contract/index.cjs");
const RUNTIME_JS = resolve(projectRoot, "compact/contracts/airlog/node_modules/@midnight-ntwrk/compact-runtime/dist/runtime.js");
const CONTRACT_SOURCE = resolve(projectRoot, "compact/contracts/airlog/src/airlog.compact");

record("Contract source (.compact) present", fs.existsSync(CONTRACT_SOURCE), CONTRACT_SOURCE);
record("Compiled contract (index.cjs) present", fs.existsSync(CONTRACT_CJS), CONTRACT_CJS);
record("Compact runtime (runtime.js) present", fs.existsSync(RUNTIME_JS), RUNTIME_JS);

// ════════════════════════════════════════════════════════════════════════════
// CHECK 3 — Circuit simulation
// ════════════════════════════════════════════════════════════════════════════

header("3 · Circuit Simulation (Local)");

let simResult;
try {
  simResult = simulateAirlogAnchor({ aircraft, entries });

  record(
    "simulateAirlogAnchor executes",
    !simResult.degraded,
    simResult.degraded ? simResult.message : `airframeId: ${simResult.integrity?.airframeId?.slice(0, 16)}…`
  );

  if (!simResult.degraded) {
    record(
      "registerAirframe circuit",
      !!simResult.registerResult?.context,
      "proofData keys: " + Object.keys(simResult.registerResult?.proofData || {}).join(", ")
    );

    record(
      "authorizeIssuer circuit",
      !!simResult.authorizeResult?.context,
      "proofData keys: " + Object.keys(simResult.authorizeResult?.proofData || {}).join(", ")
    );

    record(
      "addEntry circuit",
      !!simResult.addEntryResult?.context,
      `proofData input length: ${simResult.addEntryResult?.proofData?.input?.value?.length ?? "n/a"}`
    );
  }
} catch (e) {
  record("Circuit simulation", false, e.message);
}

// ════════════════════════════════════════════════════════════════════════════
// CHECK 4 — Environment / live network
// ════════════════════════════════════════════════════════════════════════════

header("4 · Live Network Environment");

const nodeUrl = process.env.MIDNIGHT_NODE_URL;
const indexerUrl = process.env.MIDNIGHT_INDEXER_URL;
const proofServerUrl = process.env.MIDNIGHT_PROOF_SERVER_URL;
const walletSeed = process.env.MIDNIGHT_WALLET_SEED;

record(
  "MIDNIGHT_NODE_URL set",
  nodeUrl ? true : "warn",
  nodeUrl || "Not set — required for live deployment (e.g. https://rpc.testnet-02.midnight.network)"
);

record(
  "MIDNIGHT_INDEXER_URL set",
  indexerUrl ? true : "warn",
  indexerUrl || "Not set — required for live deployment"
);

record(
  "MIDNIGHT_PROOF_SERVER_URL set",
  proofServerUrl ? true : "warn",
  proofServerUrl || "Not set — required for live deployment"
);

record(
  "MIDNIGHT_WALLET_SEED set",
  walletSeed ? true : "warn",
  walletSeed
    ? `Seed present (${walletSeed.length} chars)`
    : "Not set — required for signing transactions. Set to a 64-char hex seed."
);

// Live reachability check (only if URLs are set)
if (nodeUrl) {
  try {
    const { default: https } = await import("node:https");
    const { default: http } = await import("node:http");
    await new Promise((resolve, reject) => {
      const client = nodeUrl.startsWith("https") ? https : http;
      const req = client.request(nodeUrl, { method: "HEAD", timeout: 5000 }, (res) => {
        resolve(res.statusCode);
      });
      req.on("error", reject);
      req.on("timeout", () => reject(new Error("Timeout")));
      req.end();
    });
    record("Midnight node reachable", true, nodeUrl);
  } catch (e) {
    record("Midnight node reachable", false, `${nodeUrl} — ${e.message}`);
  }
} else {
  record("Midnight node reachable", "skip", "Set MIDNIGHT_NODE_URL to test");
}

// ════════════════════════════════════════════════════════════════════════════
// CHECK 5 — Lace wallet (manual — cannot automate)
// ════════════════════════════════════════════════════════════════════════════

header("5 · Lace Wallet (Manual Checks Required)");

console.log(`  ${SKIP}  Lace extension installed`);
console.log("         Cannot auto-verify — requires browser. Check: https://chromewebstore.google.com/detail/lace/gafhhkghbfjjkeiendhlofajokpaflmk");
console.log(`  ${SKIP}  Lace connected to Midnight PreProd`);
console.log("         In Lace settings → Network → select Midnight PreProd (testnet-02)");
console.log(`  ${SKIP}  tDUST funds available`);
console.log("         Faucet: https://faucet.testnet-02.midnight.network");

// ════════════════════════════════════════════════════════════════════════════
// SUMMARY
// ════════════════════════════════════════════════════════════════════════════

header("Summary");

const passed = results.filter(r => r.pass === true).length;
const warned = results.filter(r => r.pass === "warn").length;
const failed = results.filter(r => r.pass === false).length;

console.log(`  Automated checks: ${passed} passed, ${warned} warnings, ${failed} failed`);

const localReady = !simResult?.degraded &&
  !!simResult?.registerResult?.context &&
  !!simResult?.authorizeResult?.context &&
  !!simResult?.addEntryResult?.context;

const liveReady = !!(nodeUrl && indexerUrl && proofServerUrl && walletSeed);

console.log(`\n  Local circuit simulation: ${localReady ? "✓ READY" : "✗ NOT READY"}`);
console.log(`  Live network environment: ${liveReady ? "✓ READY" : "✗ NOT READY — set MIDNIGHT_* env vars"}`);
console.log(`  Lace wallet: manual verification required`);

if (!liveReady) {
  console.log(`
  To set up live deployment, export these env vars:

    export MIDNIGHT_NODE_URL=https://rpc.testnet-02.midnight.network
    export MIDNIGHT_INDEXER_URL=https://indexer.testnet-02.midnight.network/api/v1/graphql
    export MIDNIGHT_PROOF_SERVER_URL=https://proof-server.testnet-02.midnight.network
    export MIDNIGHT_WALLET_SEED=<64-char-hex-seed-from-lace-recovery-phrase>

  Then re-run: node scripts/validate-phase2-readiness.mjs
  Then deploy: node scripts/deploy-airlog.mjs
  `);
}

console.log("");
