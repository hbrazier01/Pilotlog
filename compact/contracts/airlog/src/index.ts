import ContractModule from "./managed/airlog/contract/index.cjs";
import type { Ledger, Entry, EntryType } from "./managed/airlog/contract/index.cjs";

export const pureCircuits = ContractModule.pureCircuits;

// Patch the original Contract prototype to add `provableCircuits` without subclassing.
// Subclassing breaks Midnight's instanceof checks (ContractMaintenanceAuthority).
// All circuits here are impure (ZK-provable), so provableCircuits aliases circuits.
Object.defineProperty(ContractModule.Contract.prototype, 'provableCircuits', {
  get() { return this.circuits; },
  configurable: true,
  enumerable: false,
});

export * as Airlog from "./managed/airlog/contract/index.cjs";

export * from "./witnesses.js";
export type { AirlogPrivateState } from "./witnesses.js";
export { witnesses } from "./witnesses.js";
export { createAirlogPrivateState } from "./witnesses.js";

// Re-export types explicitly
export type { Ledger, Entry, EntryType };
