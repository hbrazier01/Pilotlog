import { createRequire } from "node:module";
import { buildIntegrityResult } from "./build-integrity-result.mjs";
import ContractModule from "../../compact/contracts/airlog/src/managed/airlog/contract/index.cjs";

const require = createRequire(import.meta.url);

const CompactRuntime = require(
  "../../compact/contracts/airlog/node_modules/@midnight-ntwrk/compact-runtime/dist/runtime.js"
);

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

function createCircuitContext(contract) {
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

  const contract = new ContractModule.Contract({});
  const context = createCircuitContext(contract);

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
    integrity,
    registerResult,
    authorizeResult,
    addEntryResult,
  };
}
