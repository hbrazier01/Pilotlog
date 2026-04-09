import type * as __compactRuntime from '@midnight-ntwrk/compact-runtime';

export enum EntryType { ANNUAL = 0,
                        HUNDRED_HOUR = 1,
                        AD_COMPLIANCE = 2,
                        REPAIR = 3,
                        MOD_STC = 4,
                        OVERHAUL = 5,
                        OTHER = 6
}

export type Entry = { entryType: EntryType;
                      dateUtc: bigint;
                      tachOrTT: bigint;
                      issuer: { bytes: Uint8Array };
                      docHash: Uint8Array;
                      docRef: Uint8Array
                    };

export type Witnesses<PS> = {
}

export type ImpureCircuits<PS> = {
  registerAirframe(context: __compactRuntime.CircuitContext<PS>,
                   airframeId_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  authorizeIssuer(context: __compactRuntime.CircuitContext<PS>,
                  airframeId_0: Uint8Array,
                  issuerPk_0: { bytes: Uint8Array }): __compactRuntime.CircuitResults<PS, []>;
  revokeIssuer(context: __compactRuntime.CircuitContext<PS>,
               airframeId_0: Uint8Array,
               issuerPk_0: { bytes: Uint8Array }): __compactRuntime.CircuitResults<PS, []>;
  addEntry(context: __compactRuntime.CircuitContext<PS>,
           airframeId_0: Uint8Array,
           entryType_0: EntryType,
           dateUtc_0: bigint,
           tachOrTT_0: bigint,
           docHash_0: Uint8Array,
           docRef_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  transferAirframe(context: __compactRuntime.CircuitContext<PS>,
                   airframeId_0: Uint8Array,
                   newOwner_0: { bytes: Uint8Array }): __compactRuntime.CircuitResults<PS, []>;
  getNextEntryId(context: __compactRuntime.CircuitContext<PS>,
                 airframeId_0: Uint8Array): __compactRuntime.CircuitResults<PS, bigint>;
  getEntry(context: __compactRuntime.CircuitContext<PS>,
           airframeId_0: Uint8Array,
           entryId_0: bigint): __compactRuntime.CircuitResults<PS, Entry>;
}

export type ProvableCircuits<PS> = {
  registerAirframe(context: __compactRuntime.CircuitContext<PS>,
                   airframeId_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  authorizeIssuer(context: __compactRuntime.CircuitContext<PS>,
                  airframeId_0: Uint8Array,
                  issuerPk_0: { bytes: Uint8Array }): __compactRuntime.CircuitResults<PS, []>;
  revokeIssuer(context: __compactRuntime.CircuitContext<PS>,
               airframeId_0: Uint8Array,
               issuerPk_0: { bytes: Uint8Array }): __compactRuntime.CircuitResults<PS, []>;
  addEntry(context: __compactRuntime.CircuitContext<PS>,
           airframeId_0: Uint8Array,
           entryType_0: EntryType,
           dateUtc_0: bigint,
           tachOrTT_0: bigint,
           docHash_0: Uint8Array,
           docRef_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  transferAirframe(context: __compactRuntime.CircuitContext<PS>,
                   airframeId_0: Uint8Array,
                   newOwner_0: { bytes: Uint8Array }): __compactRuntime.CircuitResults<PS, []>;
  getNextEntryId(context: __compactRuntime.CircuitContext<PS>,
                 airframeId_0: Uint8Array): __compactRuntime.CircuitResults<PS, bigint>;
  getEntry(context: __compactRuntime.CircuitContext<PS>,
           airframeId_0: Uint8Array,
           entryId_0: bigint): __compactRuntime.CircuitResults<PS, Entry>;
}

export type PureCircuits = {
}

export type Circuits<PS> = {
  registerAirframe(context: __compactRuntime.CircuitContext<PS>,
                   airframeId_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  authorizeIssuer(context: __compactRuntime.CircuitContext<PS>,
                  airframeId_0: Uint8Array,
                  issuerPk_0: { bytes: Uint8Array }): __compactRuntime.CircuitResults<PS, []>;
  revokeIssuer(context: __compactRuntime.CircuitContext<PS>,
               airframeId_0: Uint8Array,
               issuerPk_0: { bytes: Uint8Array }): __compactRuntime.CircuitResults<PS, []>;
  addEntry(context: __compactRuntime.CircuitContext<PS>,
           airframeId_0: Uint8Array,
           entryType_0: EntryType,
           dateUtc_0: bigint,
           tachOrTT_0: bigint,
           docHash_0: Uint8Array,
           docRef_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  transferAirframe(context: __compactRuntime.CircuitContext<PS>,
                   airframeId_0: Uint8Array,
                   newOwner_0: { bytes: Uint8Array }): __compactRuntime.CircuitResults<PS, []>;
  getNextEntryId(context: __compactRuntime.CircuitContext<PS>,
                 airframeId_0: Uint8Array): __compactRuntime.CircuitResults<PS, bigint>;
  getEntry(context: __compactRuntime.CircuitContext<PS>,
           airframeId_0: Uint8Array,
           entryId_0: bigint): __compactRuntime.CircuitResults<PS, Entry>;
}

export type Ledger = {
  owners: {
    isEmpty(): boolean;
    size(): bigint;
    member(key_0: Uint8Array): boolean;
    lookup(key_0: Uint8Array): { bytes: Uint8Array };
    [Symbol.iterator](): Iterator<[Uint8Array, { bytes: Uint8Array }]>
  };
  issuerAuth: {
    isEmpty(): boolean;
    size(): bigint;
    member(key_0: bigint): boolean;
    lookup(key_0: bigint): boolean;
    [Symbol.iterator](): Iterator<[bigint, boolean]>
  };
  entryStore: {
    isEmpty(): boolean;
    size(): bigint;
    member(key_0: bigint): boolean;
    lookup(key_0: bigint): Entry;
    [Symbol.iterator](): Iterator<[bigint, Entry]>
  };
  nextEntryId: {
    isEmpty(): boolean;
    size(): bigint;
    member(key_0: Uint8Array): boolean;
    lookup(key_0: Uint8Array): bigint;
    [Symbol.iterator](): Iterator<[Uint8Array, bigint]>
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
