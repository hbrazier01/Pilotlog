import ContractModule from "./managed/airlog/contract/index.cjs";
import type { Ledger, Entry, EntryType, Witnesses, ImpureCircuits } from "./managed/airlog/contract/index.cjs";

export const pureCircuits = ContractModule.pureCircuits;

// Subclass the generated Contract to add `provableCircuits` required by compact-js runtime.
// All circuits in this contract are impure (ZK-provable), so provableCircuits aliases circuits.
class Contract<T, W extends Witnesses<T> = Witnesses<T>> extends ContractModule.Contract<T, W> {
  get provableCircuits(): ImpureCircuits<T> {
    return this.circuits as unknown as ImpureCircuits<T>;
  }
}

export const Airlog = {
  ...ContractModule,
  Contract,
};

export * from "./witnesses.js";
export type { AirlogPrivateState } from "./witnesses.js";
export { witnesses } from "./witnesses.js";
export { createAirlogPrivateState } from "./witnesses.js";

// Re-export types explicitly
export type { Ledger, Entry, EntryType };
