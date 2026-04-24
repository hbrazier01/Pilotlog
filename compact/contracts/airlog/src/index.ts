import type { Ledger, EntryAnchor } from "./managed/airlog/contract/index.js";

// Dynamic import ensures WASM initialization completes before contract code runs.
// Static top-level import would allow contract code (e.g. maxField()) to execute
// before await __vite__initWasm() resolves, causing wasm.maxField errors.
const ContractModule = await import("./managed/airlog/contract/index.js");

export const pureCircuits = ContractModule.pureCircuits;

// Patch the original Contract prototype to add `provableCircuits` without subclassing.
// Subclassing breaks Midnight's instanceof checks (ContractMaintenanceAuthority).
// All circuits here are impure (ZK-provable), so provableCircuits aliases circuits.
Object.defineProperty(ContractModule.Contract.prototype, 'provableCircuits', {
  get() { return this.circuits; },
  configurable: true,
  enumerable: false,
});

// Patch ContractState.maintenanceAuthority setter to accept the SDK's
// ContractMaintenanceAuthority (from midnight-sdk WASM) in addition to the
// compiled contract's own ContractMaintenanceAuthority.
// The SDK's deployContract internally creates a CMA from its own WASM and tries
// to set it on the contract's ContractState — causing an instanceof failure.
// Fix: bridge via serialize/deserialize when types don't match.
{
  const mod = ContractModule as unknown as Record<string, any>;
  const CMA = mod['ContractMaintenanceAuthority'];
  const ContractState = mod['ContractState'];
  if (CMA && ContractState) {
    const desc = Object.getOwnPropertyDescriptor(ContractState.prototype, 'maintenanceAuthority');
    if (desc && desc.set) {
      Object.defineProperty(ContractState.prototype, 'maintenanceAuthority', {
        get: desc.get,
        set(authority: unknown) {
          if (authority instanceof CMA) {
            desc.set!.call(this, authority);
          } else {
            // Cross-WASM: authority is the SDK's ContractMaintenanceAuthority —
            // round-trip through serialize/deserialize to get the contract's own instance.
            const converted = CMA.deserialize((authority as { serialize(): Uint8Array }).serialize());
            desc.set!.call(this, converted);
          }
        },
        configurable: true,
        enumerable: desc.enumerable,
      });
    }
  }
}

export { ContractModule as Airlog };

export * from "./witnesses.js";
export type { AirlogPrivateState } from "./witnesses.js";
export { witnesses } from "./witnesses.js";
export { createAirlogPrivateState } from "./witnesses.js";

// Re-export types explicitly
export type { Ledger, EntryAnchor };
