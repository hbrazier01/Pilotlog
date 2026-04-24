import type * as __compactRuntime from '@midnight-ntwrk/compact-runtime';

export type EntryAnchor = { owner: { bytes: Uint8Array };
                            recordHash: Uint8Array;
                            anchoredAt: bigint
                          };

export type Witnesses<PS> = {
}

export type ImpureCircuits<PS> = {
  anchorEntry(context: __compactRuntime.CircuitContext<PS>,
              recordHash_0: Uint8Array,
              anchoredAt_0: bigint): __compactRuntime.CircuitResults<PS, bigint>;
  getEntry(context: __compactRuntime.CircuitContext<PS>, entryId_0: bigint): __compactRuntime.CircuitResults<PS, EntryAnchor>;
  getNextEntryId(context: __compactRuntime.CircuitContext<PS>): __compactRuntime.CircuitResults<PS, bigint>;
}

export type ProvableCircuits<PS> = {
  anchorEntry(context: __compactRuntime.CircuitContext<PS>,
              recordHash_0: Uint8Array,
              anchoredAt_0: bigint): __compactRuntime.CircuitResults<PS, bigint>;
  getEntry(context: __compactRuntime.CircuitContext<PS>, entryId_0: bigint): __compactRuntime.CircuitResults<PS, EntryAnchor>;
  getNextEntryId(context: __compactRuntime.CircuitContext<PS>): __compactRuntime.CircuitResults<PS, bigint>;
}

export type PureCircuits = {
}

export type Circuits<PS> = {
  anchorEntry(context: __compactRuntime.CircuitContext<PS>,
              recordHash_0: Uint8Array,
              anchoredAt_0: bigint): __compactRuntime.CircuitResults<PS, bigint>;
  getEntry(context: __compactRuntime.CircuitContext<PS>, entryId_0: bigint): __compactRuntime.CircuitResults<PS, EntryAnchor>;
  getNextEntryId(context: __compactRuntime.CircuitContext<PS>): __compactRuntime.CircuitResults<PS, bigint>;
}

export type Ledger = {
  entryStore: {
    isEmpty(): boolean;
    size(): bigint;
    member(key_0: bigint): boolean;
    lookup(key_0: bigint): EntryAnchor;
    [Symbol.iterator](): Iterator<[bigint, EntryAnchor]>
  };
  nextEntryId: {
    isEmpty(): boolean;
    size(): bigint;
    member(key_0: bigint): boolean;
    lookup(key_0: bigint): bigint;
    [Symbol.iterator](): Iterator<[bigint, bigint]>
  };
}

export type ContractReferenceLocations = any;

export declare const contractReferenceLocations : ContractReferenceLocations;

export declare class Contract<PS = any, W extends Witnesses<PS> = Witnesses<PS>> {
  witnesses: W;
  circuits: Circuits<PS>;
  impureCircuits: ImpureCircuits<PS>;
  provableCircuits: ProvableCircuits<PS>;
  constructor(witnesses: W);
  initialState(context: __compactRuntime.ConstructorContext<PS>): __compactRuntime.ConstructorResult<PS>;
}

export declare function ledger(state: __compactRuntime.StateValue | __compactRuntime.ChargedState): Ledger;
export declare const pureCircuits: PureCircuits;
