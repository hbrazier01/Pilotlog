import type * as __compactRuntime from '@midnight-ntwrk/compact-runtime';

export type Endorsement = { entryHash: Uint8Array;
                            keyId: Uint8Array;
                            schoolId: Uint8Array;
                            studentCommit: Uint8Array;
                            seq: bigint
                          };

export type CfiRecord = { cfiRef: Uint8Array; schoolId: Uint8Array };

export type Witnesses<PS> = {
}

export type ImpureCircuits<PS> = {
  rootOnboardSchool(context: __compactRuntime.CircuitContext<PS>,
                    schoolId_0: Uint8Array,
                    adminKeyId_0: Uint8Array,
                    rootPk_0: __compactRuntime.Secp256r1Point,
                    sig_0: { r: bigint, s: bigint }): Promise<__compactRuntime.CircuitResults<PS, []>>;
  rootRevokeSchool(context: __compactRuntime.CircuitContext<PS>,
                   schoolId_0: Uint8Array,
                   rootPk_0: __compactRuntime.Secp256r1Point,
                   sig_0: { r: bigint, s: bigint }): Promise<__compactRuntime.CircuitResults<PS, []>>;
  rootSetSchoolAdmin(context: __compactRuntime.CircuitContext<PS>,
                     schoolId_0: Uint8Array,
                     newAdminKeyId_0: Uint8Array,
                     rootPk_0: __compactRuntime.Secp256r1Point,
                     sig_0: { r: bigint, s: bigint }): Promise<__compactRuntime.CircuitResults<PS, []>>;
  rootSetKey(context: __compactRuntime.CircuitContext<PS>,
             keyId_0: Uint8Array,
             active_0: boolean,
             rootPk_0: __compactRuntime.Secp256r1Point,
             sig_0: { r: bigint, s: bigint }): Promise<__compactRuntime.CircuitResults<PS, []>>;
  schoolEnrollCfi(context: __compactRuntime.CircuitContext<PS>,
                  schoolId_0: Uint8Array,
                  cfiKeyId_0: Uint8Array,
                  cfiRef_0: Uint8Array,
                  adminPk_0: __compactRuntime.Secp256r1Point,
                  authData_0: Uint8Array,
                  challenge_0: Uint8Array,
                  cdSuffix_0: Uint8Array,
                  flagsBit1_0: bigint,
                  flagsHigh_0: bigint,
                  sig_0: { r: bigint, s: bigint }): Promise<__compactRuntime.CircuitResults<PS, []>>;
  schoolRevokeCfi(context: __compactRuntime.CircuitContext<PS>,
                  schoolId_0: Uint8Array,
                  cfiKeyId_0: Uint8Array,
                  adminPk_0: __compactRuntime.Secp256r1Point,
                  authData_0: Uint8Array,
                  challenge_0: Uint8Array,
                  cdSuffix_0: Uint8Array,
                  flagsBit1_0: bigint,
                  flagsHigh_0: bigint,
                  sig_0: { r: bigint, s: bigint }): Promise<__compactRuntime.CircuitResults<PS, []>>;
  schoolRotateAdmin(context: __compactRuntime.CircuitContext<PS>,
                    schoolId_0: Uint8Array,
                    newAdminKeyId_0: Uint8Array,
                    adminPk_0: __compactRuntime.Secp256r1Point,
                    authData_0: Uint8Array,
                    challenge_0: Uint8Array,
                    cdSuffix_0: Uint8Array,
                    flagsBit1_0: bigint,
                    flagsHigh_0: bigint,
                    sig_0: { r: bigint, s: bigint }): Promise<__compactRuntime.CircuitResults<PS, []>>;
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
               attestHash_0: Uint8Array,
               cfiPubKey_0: __compactRuntime.Secp256r1Point,
               authData_0: Uint8Array,
               challenge_0: Uint8Array,
               cdSuffix_0: Uint8Array,
               flagsBit1_0: bigint,
               flagsHigh_0: bigint,
               sig_0: { r: bigint, s: bigint }): Promise<__compactRuntime.CircuitResults<PS, []>>;
}

export type ProvableCircuits<PS> = {
  rootOnboardSchool(context: __compactRuntime.CircuitContext<PS>,
                    schoolId_0: Uint8Array,
                    adminKeyId_0: Uint8Array,
                    rootPk_0: __compactRuntime.Secp256r1Point,
                    sig_0: { r: bigint, s: bigint }): Promise<__compactRuntime.CircuitResults<PS, []>>;
  rootRevokeSchool(context: __compactRuntime.CircuitContext<PS>,
                   schoolId_0: Uint8Array,
                   rootPk_0: __compactRuntime.Secp256r1Point,
                   sig_0: { r: bigint, s: bigint }): Promise<__compactRuntime.CircuitResults<PS, []>>;
  rootSetSchoolAdmin(context: __compactRuntime.CircuitContext<PS>,
                     schoolId_0: Uint8Array,
                     newAdminKeyId_0: Uint8Array,
                     rootPk_0: __compactRuntime.Secp256r1Point,
                     sig_0: { r: bigint, s: bigint }): Promise<__compactRuntime.CircuitResults<PS, []>>;
  rootSetKey(context: __compactRuntime.CircuitContext<PS>,
             keyId_0: Uint8Array,
             active_0: boolean,
             rootPk_0: __compactRuntime.Secp256r1Point,
             sig_0: { r: bigint, s: bigint }): Promise<__compactRuntime.CircuitResults<PS, []>>;
  schoolEnrollCfi(context: __compactRuntime.CircuitContext<PS>,
                  schoolId_0: Uint8Array,
                  cfiKeyId_0: Uint8Array,
                  cfiRef_0: Uint8Array,
                  adminPk_0: __compactRuntime.Secp256r1Point,
                  authData_0: Uint8Array,
                  challenge_0: Uint8Array,
                  cdSuffix_0: Uint8Array,
                  flagsBit1_0: bigint,
                  flagsHigh_0: bigint,
                  sig_0: { r: bigint, s: bigint }): Promise<__compactRuntime.CircuitResults<PS, []>>;
  schoolRevokeCfi(context: __compactRuntime.CircuitContext<PS>,
                  schoolId_0: Uint8Array,
                  cfiKeyId_0: Uint8Array,
                  adminPk_0: __compactRuntime.Secp256r1Point,
                  authData_0: Uint8Array,
                  challenge_0: Uint8Array,
                  cdSuffix_0: Uint8Array,
                  flagsBit1_0: bigint,
                  flagsHigh_0: bigint,
                  sig_0: { r: bigint, s: bigint }): Promise<__compactRuntime.CircuitResults<PS, []>>;
  schoolRotateAdmin(context: __compactRuntime.CircuitContext<PS>,
                    schoolId_0: Uint8Array,
                    newAdminKeyId_0: Uint8Array,
                    adminPk_0: __compactRuntime.Secp256r1Point,
                    authData_0: Uint8Array,
                    challenge_0: Uint8Array,
                    cdSuffix_0: Uint8Array,
                    flagsBit1_0: bigint,
                    flagsHigh_0: bigint,
                    sig_0: { r: bigint, s: bigint }): Promise<__compactRuntime.CircuitResults<PS, []>>;
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
               attestHash_0: Uint8Array,
               cfiPubKey_0: __compactRuntime.Secp256r1Point,
               authData_0: Uint8Array,
               challenge_0: Uint8Array,
               cdSuffix_0: Uint8Array,
               flagsBit1_0: bigint,
               flagsHigh_0: bigint,
               sig_0: { r: bigint, s: bigint }): Promise<__compactRuntime.CircuitResults<PS, []>>;
}

export type PureCircuits = {
  keyIdOf(pk_0: __compactRuntime.Secp256r1Point): Uint8Array;
  rootDigest(contractAddr_0: Uint8Array,
             op_0: Uint8Array,
             a_0: Uint8Array,
             b_0: Uint8Array): Uint8Array;
  schoolDigest(contractAddr_0: Uint8Array,
               op_0: Uint8Array,
               schoolId_0: Uint8Array,
               a_0: Uint8Array,
               b_0: Uint8Array): Uint8Array;
  endorseDigest(contractAddr_0: Uint8Array,
                entryHash_0: Uint8Array,
                studentCommit_0: Uint8Array,
                attestHash_0: Uint8Array): Uint8Array;
  revokeDigest(contractAddr_0: Uint8Array, keyId_0: Uint8Array): Uint8Array;
  endorsementKey(entryHash_0: Uint8Array, keyId_0: Uint8Array): Uint8Array;
}

export type Circuits<PS> = {
  keyIdOf(context: __compactRuntime.CircuitContext<PS>,
          pk_0: __compactRuntime.Secp256r1Point): Promise<__compactRuntime.CircuitResults<PS, Uint8Array>>;
  rootDigest(context: __compactRuntime.CircuitContext<PS>,
             contractAddr_0: Uint8Array,
             op_0: Uint8Array,
             a_0: Uint8Array,
             b_0: Uint8Array): Promise<__compactRuntime.CircuitResults<PS, Uint8Array>>;
  schoolDigest(context: __compactRuntime.CircuitContext<PS>,
               contractAddr_0: Uint8Array,
               op_0: Uint8Array,
               schoolId_0: Uint8Array,
               a_0: Uint8Array,
               b_0: Uint8Array): Promise<__compactRuntime.CircuitResults<PS, Uint8Array>>;
  endorseDigest(context: __compactRuntime.CircuitContext<PS>,
                contractAddr_0: Uint8Array,
                entryHash_0: Uint8Array,
                studentCommit_0: Uint8Array,
                attestHash_0: Uint8Array): Promise<__compactRuntime.CircuitResults<PS, Uint8Array>>;
  revokeDigest(context: __compactRuntime.CircuitContext<PS>,
               contractAddr_0: Uint8Array,
               keyId_0: Uint8Array): Promise<__compactRuntime.CircuitResults<PS, Uint8Array>>;
  endorsementKey(context: __compactRuntime.CircuitContext<PS>,
                 entryHash_0: Uint8Array,
                 keyId_0: Uint8Array): Promise<__compactRuntime.CircuitResults<PS, Uint8Array>>;
  rootOnboardSchool(context: __compactRuntime.CircuitContext<PS>,
                    schoolId_0: Uint8Array,
                    adminKeyId_0: Uint8Array,
                    rootPk_0: __compactRuntime.Secp256r1Point,
                    sig_0: { r: bigint, s: bigint }): Promise<__compactRuntime.CircuitResults<PS, []>>;
  rootRevokeSchool(context: __compactRuntime.CircuitContext<PS>,
                   schoolId_0: Uint8Array,
                   rootPk_0: __compactRuntime.Secp256r1Point,
                   sig_0: { r: bigint, s: bigint }): Promise<__compactRuntime.CircuitResults<PS, []>>;
  rootSetSchoolAdmin(context: __compactRuntime.CircuitContext<PS>,
                     schoolId_0: Uint8Array,
                     newAdminKeyId_0: Uint8Array,
                     rootPk_0: __compactRuntime.Secp256r1Point,
                     sig_0: { r: bigint, s: bigint }): Promise<__compactRuntime.CircuitResults<PS, []>>;
  rootSetKey(context: __compactRuntime.CircuitContext<PS>,
             keyId_0: Uint8Array,
             active_0: boolean,
             rootPk_0: __compactRuntime.Secp256r1Point,
             sig_0: { r: bigint, s: bigint }): Promise<__compactRuntime.CircuitResults<PS, []>>;
  schoolEnrollCfi(context: __compactRuntime.CircuitContext<PS>,
                  schoolId_0: Uint8Array,
                  cfiKeyId_0: Uint8Array,
                  cfiRef_0: Uint8Array,
                  adminPk_0: __compactRuntime.Secp256r1Point,
                  authData_0: Uint8Array,
                  challenge_0: Uint8Array,
                  cdSuffix_0: Uint8Array,
                  flagsBit1_0: bigint,
                  flagsHigh_0: bigint,
                  sig_0: { r: bigint, s: bigint }): Promise<__compactRuntime.CircuitResults<PS, []>>;
  schoolRevokeCfi(context: __compactRuntime.CircuitContext<PS>,
                  schoolId_0: Uint8Array,
                  cfiKeyId_0: Uint8Array,
                  adminPk_0: __compactRuntime.Secp256r1Point,
                  authData_0: Uint8Array,
                  challenge_0: Uint8Array,
                  cdSuffix_0: Uint8Array,
                  flagsBit1_0: bigint,
                  flagsHigh_0: bigint,
                  sig_0: { r: bigint, s: bigint }): Promise<__compactRuntime.CircuitResults<PS, []>>;
  schoolRotateAdmin(context: __compactRuntime.CircuitContext<PS>,
                    schoolId_0: Uint8Array,
                    newAdminKeyId_0: Uint8Array,
                    adminPk_0: __compactRuntime.Secp256r1Point,
                    authData_0: Uint8Array,
                    challenge_0: Uint8Array,
                    cdSuffix_0: Uint8Array,
                    flagsBit1_0: bigint,
                    flagsHigh_0: bigint,
                    sig_0: { r: bigint, s: bigint }): Promise<__compactRuntime.CircuitResults<PS, []>>;
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
               attestHash_0: Uint8Array,
               cfiPubKey_0: __compactRuntime.Secp256r1Point,
               authData_0: Uint8Array,
               challenge_0: Uint8Array,
               cdSuffix_0: Uint8Array,
               flagsBit1_0: bigint,
               flagsHigh_0: bigint,
               sig_0: { r: bigint, s: bigint }): Promise<__compactRuntime.CircuitResults<PS, []>>;
}

export type Ledger = {
  rootKeys: {
    isEmpty(): boolean;
    size(): bigint;
    member(elem_0: Uint8Array): boolean;
    [Symbol.iterator](): Iterator<Uint8Array>
  };
  retiredRootKeys: {
    isEmpty(): boolean;
    size(): bigint;
    member(elem_0: Uint8Array): boolean;
    [Symbol.iterator](): Iterator<Uint8Array>
  };
  schools: {
    isEmpty(): boolean;
    size(): bigint;
    member(key_0: Uint8Array): boolean;
    lookup(key_0: Uint8Array): Uint8Array;
    [Symbol.iterator](): Iterator<[Uint8Array, Uint8Array]>
  };
  adminKeySchool: {
    isEmpty(): boolean;
    size(): bigint;
    member(key_0: Uint8Array): boolean;
    lookup(key_0: Uint8Array): Uint8Array;
    [Symbol.iterator](): Iterator<[Uint8Array, Uint8Array]>
  };
  retiredAdminKeys: {
    isEmpty(): boolean;
    size(): bigint;
    member(elem_0: Uint8Array): boolean;
    [Symbol.iterator](): Iterator<Uint8Array>
  };
  schoolRevokedAtSeq: {
    isEmpty(): boolean;
    size(): bigint;
    member(key_0: Uint8Array): boolean;
    lookup(key_0: Uint8Array): bigint;
    [Symbol.iterator](): Iterator<[Uint8Array, bigint]>
  };
  cfiKeys: {
    isEmpty(): boolean;
    size(): bigint;
    member(key_0: Uint8Array): boolean;
    lookup(key_0: Uint8Array): CfiRecord;
    [Symbol.iterator](): Iterator<[Uint8Array, CfiRecord]>
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
               rootKeyId_0: Uint8Array): Promise<__compactRuntime.ConstructorResult<PS>>;
}

export declare function ledger(state: __compactRuntime.StateValue | __compactRuntime.ChargedState): Ledger;
export declare const pureCircuits: PureCircuits;
export declare const expectedVk: Record<string, string>;
export declare const circuitSignatures: __compactRuntime.CircuitSignatures;
export declare const declaredInterfaces: __compactRuntime.DeclaredInterfaces;
