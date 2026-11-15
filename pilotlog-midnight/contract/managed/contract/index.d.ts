import type * as __compactRuntime from '@midnight-ntwrk/compact-runtime';

export type Endorsement = { entryHash: Uint8Array;
                            keyId: Uint8Array;
                            studentCommit: Uint8Array;
                            seq: bigint
                          };

export type Witnesses<PS> = {
  adminSecret(context: __compactRuntime.WitnessContext<Ledger, PS>): [PS, Uint8Array];
}

export type ImpureCircuits<PS> = {
  enrollCfi(context: __compactRuntime.CircuitContext<PS>,
            keyId_0: Uint8Array,
            cfiRef_0: Uint8Array): Promise<__compactRuntime.CircuitResults<PS, []>>;
  revokeCfi(context: __compactRuntime.CircuitContext<PS>, keyId_0: Uint8Array): Promise<__compactRuntime.CircuitResults<PS, []>>;
  rotateAdmin(context: __compactRuntime.CircuitContext<PS>,
              newAdminCommit_0: Uint8Array): Promise<__compactRuntime.CircuitResults<PS, []>>;
  selfRevoke(context: __compactRuntime.CircuitContext<PS>,
             cfiPubKey_0: __compactRuntime.Secp256r1Point,
             authData_0: Uint8Array,
             challenge_0: Uint8Array,
             cdSuffix_0: Uint8Array,
             flagsBit1_0: bigint,
             flagsHigh_0: bigint,
             sig_0: { r: bigint, s: bigint }): Promise<__compactRuntime.CircuitResults<PS, []>>;
  endorseEntry(context: __compactRuntime.CircuitContext<PS>,
               entryHash_0: Uint8Array,
               studentCommit_0: Uint8Array,
               cfiPubKey_0: __compactRuntime.Secp256r1Point,
               authData_0: Uint8Array,
               challenge_0: Uint8Array,
               cdSuffix_0: Uint8Array,
               flagsBit1_0: bigint,
               flagsHigh_0: bigint,
               sig_0: { r: bigint, s: bigint }): Promise<__compactRuntime.CircuitResults<PS, []>>;
}

export type ProvableCircuits<PS> = {
  enrollCfi(context: __compactRuntime.CircuitContext<PS>,
            keyId_0: Uint8Array,
            cfiRef_0: Uint8Array): Promise<__compactRuntime.CircuitResults<PS, []>>;
  revokeCfi(context: __compactRuntime.CircuitContext<PS>, keyId_0: Uint8Array): Promise<__compactRuntime.CircuitResults<PS, []>>;
  rotateAdmin(context: __compactRuntime.CircuitContext<PS>,
              newAdminCommit_0: Uint8Array): Promise<__compactRuntime.CircuitResults<PS, []>>;
  selfRevoke(context: __compactRuntime.CircuitContext<PS>,
             cfiPubKey_0: __compactRuntime.Secp256r1Point,
             authData_0: Uint8Array,
             challenge_0: Uint8Array,
             cdSuffix_0: Uint8Array,
             flagsBit1_0: bigint,
             flagsHigh_0: bigint,
             sig_0: { r: bigint, s: bigint }): Promise<__compactRuntime.CircuitResults<PS, []>>;
  endorseEntry(context: __compactRuntime.CircuitContext<PS>,
               entryHash_0: Uint8Array,
               studentCommit_0: Uint8Array,
               cfiPubKey_0: __compactRuntime.Secp256r1Point,
               authData_0: Uint8Array,
               challenge_0: Uint8Array,
               cdSuffix_0: Uint8Array,
               flagsBit1_0: bigint,
               flagsHigh_0: bigint,
               sig_0: { r: bigint, s: bigint }): Promise<__compactRuntime.CircuitResults<PS, []>>;
}

export type PureCircuits = {
  adminCommitment(sk_0: Uint8Array): Uint8Array;
  keyIdOf(pk_0: __compactRuntime.Secp256r1Point): Uint8Array;
  endorseDigest(contractAddr_0: Uint8Array,
                entryHash_0: Uint8Array,
                studentCommit_0: Uint8Array): Uint8Array;
  revokeDigest(contractAddr_0: Uint8Array, keyId_0: Uint8Array): Uint8Array;
  endorsementKey(entryHash_0: Uint8Array, keyId_0: Uint8Array): Uint8Array;
}

export type Circuits<PS> = {
  adminCommitment(context: __compactRuntime.CircuitContext<PS>, sk_0: Uint8Array): Promise<__compactRuntime.CircuitResults<PS, Uint8Array>>;
  keyIdOf(context: __compactRuntime.CircuitContext<PS>,
          pk_0: __compactRuntime.Secp256r1Point): Promise<__compactRuntime.CircuitResults<PS, Uint8Array>>;
  endorseDigest(context: __compactRuntime.CircuitContext<PS>,
                contractAddr_0: Uint8Array,
                entryHash_0: Uint8Array,
                studentCommit_0: Uint8Array): Promise<__compactRuntime.CircuitResults<PS, Uint8Array>>;
  revokeDigest(context: __compactRuntime.CircuitContext<PS>,
               contractAddr_0: Uint8Array,
               keyId_0: Uint8Array): Promise<__compactRuntime.CircuitResults<PS, Uint8Array>>;
  endorsementKey(context: __compactRuntime.CircuitContext<PS>,
                 entryHash_0: Uint8Array,
                 keyId_0: Uint8Array): Promise<__compactRuntime.CircuitResults<PS, Uint8Array>>;
  enrollCfi(context: __compactRuntime.CircuitContext<PS>,
            keyId_0: Uint8Array,
            cfiRef_0: Uint8Array): Promise<__compactRuntime.CircuitResults<PS, []>>;
  revokeCfi(context: __compactRuntime.CircuitContext<PS>, keyId_0: Uint8Array): Promise<__compactRuntime.CircuitResults<PS, []>>;
  rotateAdmin(context: __compactRuntime.CircuitContext<PS>,
              newAdminCommit_0: Uint8Array): Promise<__compactRuntime.CircuitResults<PS, []>>;
  selfRevoke(context: __compactRuntime.CircuitContext<PS>,
             cfiPubKey_0: __compactRuntime.Secp256r1Point,
             authData_0: Uint8Array,
             challenge_0: Uint8Array,
             cdSuffix_0: Uint8Array,
             flagsBit1_0: bigint,
             flagsHigh_0: bigint,
             sig_0: { r: bigint, s: bigint }): Promise<__compactRuntime.CircuitResults<PS, []>>;
  endorseEntry(context: __compactRuntime.CircuitContext<PS>,
               entryHash_0: Uint8Array,
               studentCommit_0: Uint8Array,
               cfiPubKey_0: __compactRuntime.Secp256r1Point,
               authData_0: Uint8Array,
               challenge_0: Uint8Array,
               cdSuffix_0: Uint8Array,
               flagsBit1_0: bigint,
               flagsHigh_0: bigint,
               sig_0: { r: bigint, s: bigint }): Promise<__compactRuntime.CircuitResults<PS, []>>;
}

export type Ledger = {
  readonly admin: Uint8Array;
  cfiKeys: {
    isEmpty(): boolean;
    size(): bigint;
    member(key_0: Uint8Array): boolean;
    lookup(key_0: Uint8Array): Uint8Array;
    [Symbol.iterator](): Iterator<[Uint8Array, Uint8Array]>
  };
  revokedAtSeq: {
    isEmpty(): boolean;
    size(): bigint;
    member(key_0: Uint8Array): boolean;
    lookup(key_0: Uint8Array): bigint;
    [Symbol.iterator](): Iterator<[Uint8Array, bigint]>
  };
  endorsements: {
    isEmpty(): boolean;
    size(): bigint;
    member(key_0: Uint8Array): boolean;
    lookup(key_0: Uint8Array): Endorsement;
    [Symbol.iterator](): Iterator<[Uint8Array, Endorsement]>
  };
  readonly seq: bigint;
}

export declare class Contract<PS = any, W extends Witnesses<PS> = Witnesses<PS>> {
  witnesses: W;
  circuits: Circuits<PS>;
  impureCircuits: ImpureCircuits<PS>;
  provableCircuits: ProvableCircuits<PS>;
  constructor(witnesses: W);
  initialState(context: __compactRuntime.ConstructorContext<PS>,
               adminCommit_0: Uint8Array): Promise<__compactRuntime.ConstructorResult<PS>>;
}

export declare function ledger(state: __compactRuntime.StateValue | __compactRuntime.ChargedState): Ledger;
export declare const pureCircuits: PureCircuits;
export declare const expectedVk: Record<string, string>;
export declare const circuitSignatures: __compactRuntime.CircuitSignatures;
export declare const declaredInterfaces: __compactRuntime.DeclaredInterfaces;
