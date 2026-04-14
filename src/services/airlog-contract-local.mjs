/**
 * airlog-contract-local.mjs
 *
 * Local simulation of the AirLog v2 hash-anchoring contract.
 *
 * v2 model:
 *   - Full records stay OFF-CHAIN (pilot logbook, maintenance entries, etc.)
 *   - Only recordHash is anchored on-chain via anchorEntry(recordHash, anchoredAt)
 *   - No prerequisites — first write succeeds with zero prior state
 *
 * When the Compact runtime is not available (e.g. Railway deploy),
 * returns a degraded result with integrity data intact.
 */

import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { resolve, dirname } from "node:path";
import { canonicalizeLogbook, buildAnchorPayload } from "../lib/canonicalize-entry.mjs";

const _require = createRequire(import.meta.url);
const _dir = dirname(fileURLToPath(import.meta.url));

const CONTRACT_CJS = resolve(_dir, "../../compact/contracts/airlog/src/managed/airlog/contract/index.cjs");
const RUNTIME_JS = resolve(_dir, "../../compact/contracts/airlog/node_modules/@midnight-ntwrk/compact-runtime/dist/runtime.js");

function loadCompactDeps() {
  if (!existsSync(CONTRACT_CJS) || !existsSync(RUNTIME_JS)) {
    return { available: false, reason: "Compact contract/runtime not available" };
  }
  try {
    const ContractModule = _require(CONTRACT_CJS);
    const CompactRuntime = _require(RUNTIME_JS);
    return { available: true, ContractModule, CompactRuntime };
  } catch (err) {
    return { available: false, reason: err instanceof Error ? err.message : String(err) };
  }
}

function hexToBytes32(hex) {
  const clean = String(hex).replace(/^0x/, "");
  if (clean.length !== 64) throw new Error(`Expected 32-byte hex, got ${clean.length} chars`);
  return new Uint8Array(Buffer.from(clean, "hex"));
}

function dummyCoinPublicKey() {
  return { bytes: new Uint8Array(32).fill(1) };
}

function createCircuitContext(contract, CompactRuntime) {
  const stateResult = contract.initialState({
    initialPrivateState: {},
    initialZswapLocalState: { coinPublicKey: dummyCoinPublicKey() },
  });
  return {
    originalState: stateResult.currentContractState,
    currentPrivateState: stateResult.currentPrivateState,
    currentZswapLocalState: {
      ...stateResult.currentZswapLocalState,
      coinPublicKey: dummyCoinPublicKey(),
    },
    transactionContext: new CompactRuntime.QueryContext(
      stateResult.currentContractState.data,
      CompactRuntime.dummyContractAddress()
    ),
  };
}

/**
 * Simulate anchoring a private logbook record on Midnight.
 *
 * App flow (v2):
 *   1. Canonicalize the full logbook off-chain → deterministic JSON
 *   2. SHA-256 hash the canonical JSON → recordHash (64-char hex)
 *   3. Call anchorEntry(recordHash, anchoredAt) on Midnight
 *   4. Store anchor reference locally: { entryId, anchoredAt, recordHash }
 *
 * Nothing in the logbook is stored on-chain. Only the hash is anchored.
 *
 * @param {{ aircraft: object, entries: object[] }} opts
 */
export function simulateAirlogAnchor({ aircraft, entries }) {
  // Steps 1–2: canonicalize off-chain
  const logbook = canonicalizeLogbook(aircraft, entries);
  const anchorPayload = buildAnchorPayload(logbook);

  const anchoredAt = BigInt(Math.floor(Date.now() / 1000));

  const integrity = {
    anchored: false,
    anchorHash: logbook.recordHash,
    anchorTime: new Date().toISOString(),
    anchorNetwork: "midnight-preprod",
    anchorTx: null,
    entries: entries.length,
    aircraftIdent: String(aircraft.ident || "").trim().toUpperCase(),
    airframeId: logbook.airframeId,
    recordId: logbook.recordId,
  };

  // Step 3: simulate on-chain anchorEntry() call
  const compact = loadCompactDeps();

  if (!compact.available) {
    return {
      runtimeAvailable: false,
      degraded: true,
      message: compact.reason,
      integrity,
      anchorPayload,
    };
  }

  const { ContractModule, CompactRuntime } = compact;

  const contract = new ContractModule.Contract({});
  const context = createCircuitContext(contract, CompactRuntime);

  const recordHashBytes = hexToBytes32(logbook.recordHash);

  // anchorEntry(recordHash, anchoredAt) — no prior setup required
  const anchorResult = contract.circuits.anchorEntry(context, recordHashBytes, anchoredAt);

  return {
    runtimeAvailable: true,
    degraded: false,
    integrity,
    anchorPayload,
    anchorResult,
  };
}
