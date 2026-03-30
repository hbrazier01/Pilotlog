import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve, dirname } from "node:path";
import { buildIntegrityResult } from "./build-integrity-result.mjs";

// NOTE: compact-runtime is NOT loaded at module init time.
// It is lazy-loaded inside simulateAirlogAnchor() so that missing
// the runtime package never prevents app startup.

const CONTRACT_PATH = path.resolve(
  process.cwd(),
  "compact/contracts/airlog/src/managed/airlog/contract/index.cjs"
);

let ContractModule = null;
let CompactRuntime = null;
let runtimeAvailable = false;

const _require = createRequire(import.meta.url);
const _dir = dirname(fileURLToPath(import.meta.url));

const CONTRACT_CJS = resolve(_dir, "../../compact/contracts/airlog/src/managed/airlog/contract/index.cjs");
const RUNTIME_JS = resolve(_dir, "../../compact/contracts/airlog/node_modules/@midnight-ntwrk/compact-runtime/dist/runtime.js");

function loadRuntime() {
  if (!existsSync(CONTRACT_CJS) || !existsSync(RUNTIME_JS)) {
    throw new Error("Midnight runtime not available in this environment");
  }
  const ContractModule = _require(CONTRACT_CJS);
  const CompactRuntime = _require(RUNTIME_JS);
  return { ContractModule, CompactRuntime };
}

const RUNTIME_PATH = path.resolve(
  process.cwd(),
  "compact/contracts/airlog/node_modules/@midnight-ntwrk/compact-runtime/dist/runtime.js"
);

function loadCompactDeps() {
  if (!fs.existsSync(CONTRACT_PATH) || !fs.existsSync(RUNTIME_PATH)) {
    return {
      available: false,
      reason: "Compact contract/runtime not available in this environment",
    };
  }

  try {
    const ContractModule = _require(CONTRACT_PATH);
    const CompactRuntime = _require(RUNTIME_PATH);
    return {
      available: true,
      ContractModule,
      CompactRuntime,
    };
  } catch (error) {
    return {
      available: false,
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}

function hexToBytes32(hex) {
  const clean = String(hex).trim().replace(/^0x/, "");
  if (clean.length !== 64) {
    throw new Error(`Expected 32-byte hex string, got length ${clean.length}`);
  }
  return new Uint8Array(Buffer.from(clean, "hex"));
}

function zeroBytes32() {
  return new Uint8Array(32);
}

function hoursToTenthsBigInt(entries) {
  const total = entries.reduce((sum, e) => sum + Number(e.total || 0), 0);
  return BigInt(Math.round(total * 10));
}

function nowUnixSecondsBigInt() {
  return BigInt(Math.floor(Date.now() / 1000));
}

function dummyCoinPublicKey() {
  return {
    bytes: new Uint8Array(32).fill(1),
  };
}

function createCircuitContext(contract, CompactRuntime) {
  const stateResult = contract.initialState({
    initialPrivateState: {},
    initialZswapLocalState: {
      coinPublicKey: dummyCoinPublicKey(),
    },
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

export function simulateAirlogAnchor({ aircraft, entries }) {
  const integrity = buildIntegrityResult({
    aircraft,
    entries,
    network: "midnight-preview",
  });

  const compact = loadCompactDeps();

  if (!compact.available) {
    return {
      runtimeAvailable: false,
      degraded: true,
      message: compact.reason,
      integrity,
    };
  }

  const { ContractModule, CompactRuntime } = compact;

  const contract = new ContractModule.Contract({});
  const context = createCircuitContext(contract, CompactRuntime);

  const airframeId = hexToBytes32(integrity.airframeId);
  const docHash = hexToBytes32(integrity.anchorHash);
  const docRef = zeroBytes32();

  const registerResult = contract.circuits.registerAirframe(context, airframeId);

  const authorizeResult = contract.circuits.authorizeIssuer(
    registerResult.context,
    airframeId,
    dummyCoinPublicKey()
  );

  const addEntryResult = contract.circuits.addEntry(
    authorizeResult.context,
    airframeId,
    ContractModule.EntryType.OTHER,
    nowUnixSecondsBigInt(),
    hoursToTenthsBigInt(entries),
    docHash,
    docRef
  );

  return {
    runtimeAvailable: true,
    degraded: false,
    integrity,
    runtimeAvailable: true,
    registerResult,
    authorizeResult,
    addEntryResult,
  };
}
