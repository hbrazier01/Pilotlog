/**
 * midnight-browser-sdk.mjs
 *
 * Browser-side entry point for Midnight SDK utilities used in the Save Flight flow.
 * Bundled by scripts/bundle-midnight-sdk.mjs → public/js/midnight-sdk.js
 *
 * Importing from here (not CDN) ensures WASM deps are resolved at build time,
 * preventing "Failed to resolve module specifier @midnight-ntwrk/compact-runtime" errors.
 */

// Browser-safe Buffer polyfill — must run before any Midnight SDK usage.
// The Midnight SDK uses Node-style Buffer internally; without this the browser
// throws "ReferenceError: Buffer is not defined" during contract compile / deploy.
import { Buffer } from "buffer";
if (typeof globalThis.Buffer === "undefined") {
  globalThis.Buffer = Buffer;
}

export { setNetworkId } from "@midnight-ntwrk/midnight-js-network-id";
// CostModel is exported for use in the official 1AM proving pattern:
//   provingProvider = await api.getProvingProvider(zkConfigProvider)
//   proofProvider = { proveTx: (tx) => tx.prove(provingProvider, CostModel.initialCostModel()) }
// Transaction from ledger-v8 is still omitted — balanceTx uses a duck-typed proxy (AIR-143).
// ledger-v8 is WASM and already present transitively; exporting CostModel adds no new bundle risk.
export { CostModel } from "@midnight-ntwrk/ledger-v8";
export { CompiledContract } from "@midnight-ntwrk/compact-js";
export { submitCallTx, deployContract } from "@midnight-ntwrk/midnight-js-contracts";
// indexerPublicDataProvider is required by submitCallTx to query on-chain ZSwap state.
// Missing this causes: TypeError: Cannot read properties of undefined (reading 'queryZSwapAndContractState')
export { indexerPublicDataProvider } from "@midnight-ntwrk/midnight-js-indexer-public-data-provider";
