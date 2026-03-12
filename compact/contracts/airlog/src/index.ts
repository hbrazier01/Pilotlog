import ContractModule from "./managed/airlog/contract/index.cjs";
import type { Ledger, Entry, EntryType } from "./managed/airlog/contract/index.cjs";

export const pureCircuits = ContractModule.pureCircuits;
export * as Airlog from "./managed/airlog/contract/index.cjs";

export * from "./witnesses.js";
export type { AirlogPrivateState } from "./witnesses.js";
export { witnesses } from "./witnesses.js";
export { createAirlogPrivateState } from "./witnesses.js";

// Re-export types explicitly
export type { Ledger, Entry, EntryType };
