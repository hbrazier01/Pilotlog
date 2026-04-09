/**
 * midnight-browser-sdk.mjs
 *
 * Browser-side entry point for Midnight SDK utilities used in the Save Flight flow.
 * Bundled by scripts/bundle-midnight-sdk.mjs → public/js/midnight-sdk.js
 *
 * Importing from here (not CDN) ensures WASM deps are resolved at build time,
 * preventing "Failed to resolve module specifier @midnight-ntwrk/compact-runtime" errors.
 */

export { setNetworkId } from "@midnight-ntwrk/midnight-js-network-id";
// CostModel and Transaction from @midnight-ntwrk/ledger-v8 intentionally omitted —
// ledger-v8 is a Node/WASM package that is not browser-safe at the entry point.
// Transaction.deserialize is replaced with a duck-typed proxy in readApi.mjs.
// ledger-v8 types are still present transtively (midnight-js-contracts, httpClientProofProvider)
// but are not explicitly re-exported here.
export { CompiledContract } from "@midnight-ntwrk/compact-js";
export { submitCallTx } from "@midnight-ntwrk/midnight-js-contracts";
export { httpClientProofProvider } from "@midnight-ntwrk/midnight-js-http-client-proof-provider";
