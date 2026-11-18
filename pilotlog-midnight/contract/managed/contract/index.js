import * as __compactRuntime from '@midnight-ntwrk/compact-runtime';
__compactRuntime.checkRuntimeVersion('0.21.0');

const _descriptor_0 = new __compactRuntime.CompactTypeBytes(32);

const _descriptor_1 = new __compactRuntime.CompactTypeUnsignedInteger(18446744073709551615n, 8);

const _descriptor_2 = __compactRuntime.CompactTypeBoolean;

class _ContractAddress_0 {
  alignment() {
    return _descriptor_0.alignment();
  }
  fromValue(value_0) {
    return {
      bytes: _descriptor_0.fromValue(value_0)
    }
  }
  toValue(value_0) {
    return _descriptor_0.toValue(value_0.bytes);
  }
}

const _descriptor_3 = new _ContractAddress_0();

class _CfiRecord_0 {
  alignment() {
    return _descriptor_0.alignment().concat(_descriptor_0.alignment());
  }
  fromValue(value_0) {
    return {
      cfiRef: _descriptor_0.fromValue(value_0),
      schoolId: _descriptor_0.fromValue(value_0)
    }
  }
  toValue(value_0) {
    return _descriptor_0.toValue(value_0.cfiRef).concat(_descriptor_0.toValue(value_0.schoolId));
  }
}

const _descriptor_4 = new _CfiRecord_0();

const _descriptor_5 = new __compactRuntime.CompactTypeUnsignedInteger(65535n, 2);

const _descriptor_6 = __compactRuntime.CompactTypeSecp256r1Point;

const _descriptor_7 = new __compactRuntime.CompactTypeBytes(37);

const _descriptor_8 = new __compactRuntime.CompactTypeBytes(43);

const _descriptor_9 = new __compactRuntime.CompactTypeBytes(84);

const _descriptor_10 = new __compactRuntime.CompactTypeUnsignedInteger(1n, 1);

const _descriptor_11 = new __compactRuntime.CompactTypeUnsignedInteger(31n, 1);

const _descriptor_12 = __compactRuntime.CompactTypeSecp256r1Scalar;

class _Secp256r1EcdsaSignature_0 {
  alignment() {
    return _descriptor_12.alignment().concat(_descriptor_12.alignment());
  }
  fromValue(value_0) {
    return {
      r: _descriptor_12.fromValue(value_0),
      s: _descriptor_12.fromValue(value_0)
    }
  }
  toValue(value_0) {
    return _descriptor_12.toValue(value_0.r).concat(_descriptor_12.toValue(value_0.s));
  }
}

const _descriptor_13 = new _Secp256r1EcdsaSignature_0();

class _Endorsement_0 {
  alignment() {
    return _descriptor_0.alignment().concat(_descriptor_0.alignment().concat(_descriptor_0.alignment().concat(_descriptor_0.alignment().concat(_descriptor_1.alignment()))));
  }
  fromValue(value_0) {
    return {
      entryHash: _descriptor_0.fromValue(value_0),
      keyId: _descriptor_0.fromValue(value_0),
      schoolId: _descriptor_0.fromValue(value_0),
      studentCommit: _descriptor_0.fromValue(value_0),
      seq: _descriptor_1.fromValue(value_0)
    }
  }
  toValue(value_0) {
    return _descriptor_0.toValue(value_0.entryHash).concat(_descriptor_0.toValue(value_0.keyId).concat(_descriptor_0.toValue(value_0.schoolId).concat(_descriptor_0.toValue(value_0.studentCommit).concat(_descriptor_1.toValue(value_0.seq)))));
  }
}

const _descriptor_14 = new _Endorsement_0();

const _descriptor_15 = new __compactRuntime.CompactTypeUnsignedInteger(255n, 1);

const _descriptor_16 = __compactRuntime.CompactTypeField;

const _descriptor_17 = __compactRuntime.CompactTypeSecp256r1Base;

const _descriptor_18 = new __compactRuntime.CompactTypeBytes(42);

class _tuple_0 {
  alignment() {
    return _descriptor_7.alignment().concat(_descriptor_0.alignment());
  }
  fromValue(value_0) {
    return [
      _descriptor_7.fromValue(value_0),
      _descriptor_0.fromValue(value_0)
    ]
  }
  toValue(value_0) {
    return _descriptor_7.toValue(value_0[0]).concat(_descriptor_0.toValue(value_0[1]));
  }
}

const _descriptor_19 = new _tuple_0();

const _descriptor_20 = new __compactRuntime.CompactTypeBytes(36);

class _tuple_1 {
  alignment() {
    return _descriptor_20.alignment().concat(_descriptor_8.alignment().concat(_descriptor_9.alignment()));
  }
  fromValue(value_0) {
    return [
      _descriptor_20.fromValue(value_0),
      _descriptor_8.fromValue(value_0),
      _descriptor_9.fromValue(value_0)
    ]
  }
  toValue(value_0) {
    return _descriptor_20.toValue(value_0[0]).concat(_descriptor_8.toValue(value_0[1]).concat(_descriptor_9.toValue(value_0[2])));
  }
}

const _descriptor_21 = new _tuple_1();

const _descriptor_22 = new __compactRuntime.CompactTypeVector(5, _descriptor_0);

const _descriptor_23 = new __compactRuntime.CompactTypeVector(3, _descriptor_0);

class _tuple_2 {
  alignment() {
    return _descriptor_0.alignment().concat(_descriptor_0.alignment());
  }
  fromValue(value_0) {
    return [
      _descriptor_0.fromValue(value_0),
      _descriptor_0.fromValue(value_0)
    ]
  }
  toValue(value_0) {
    return _descriptor_0.toValue(value_0[0]).concat(_descriptor_0.toValue(value_0[1]));
  }
}

const _descriptor_24 = new _tuple_2();

const _descriptor_25 = new __compactRuntime.CompactTypeVector(6, _descriptor_0);

class _Either_0 {
  alignment() {
    return _descriptor_2.alignment().concat(_descriptor_0.alignment().concat(_descriptor_0.alignment()));
  }
  fromValue(value_0) {
    return {
      is_left: _descriptor_2.fromValue(value_0),
      left: _descriptor_0.fromValue(value_0),
      right: _descriptor_0.fromValue(value_0)
    }
  }
  toValue(value_0) {
    return _descriptor_2.toValue(value_0.is_left).concat(_descriptor_0.toValue(value_0.left).concat(_descriptor_0.toValue(value_0.right)));
  }
}

const _descriptor_26 = new _Either_0();

const _descriptor_27 = new __compactRuntime.CompactTypeUnsignedInteger(340282366920938463463374607431768211455n, 16);

class _UserAddress_0 {
  alignment() {
    return _descriptor_0.alignment();
  }
  fromValue(value_0) {
    return {
      bytes: _descriptor_0.fromValue(value_0)
    }
  }
  toValue(value_0) {
    return _descriptor_0.toValue(value_0.bytes);
  }
}

const _descriptor_28 = new _UserAddress_0();

class _Either_1 {
  alignment() {
    return _descriptor_2.alignment().concat(_descriptor_3.alignment().concat(_descriptor_28.alignment()));
  }
  fromValue(value_0) {
    return {
      is_left: _descriptor_2.fromValue(value_0),
      left: _descriptor_3.fromValue(value_0),
      right: _descriptor_28.fromValue(value_0)
    }
  }
  toValue(value_0) {
    return _descriptor_2.toValue(value_0.is_left).concat(_descriptor_3.toValue(value_0.left).concat(_descriptor_28.toValue(value_0.right)));
  }
}

const _descriptor_29 = new _Either_1();

class _Maybe_0 {
  alignment() {
    return _descriptor_2.alignment().concat(_descriptor_29.alignment());
  }
  fromValue(value_0) {
    return {
      is_some: _descriptor_2.fromValue(value_0),
      value: _descriptor_29.fromValue(value_0)
    }
  }
  toValue(value_0) {
    return _descriptor_2.toValue(value_0.is_some).concat(_descriptor_29.toValue(value_0.value));
  }
}

const _descriptor_30 = new _Maybe_0();

const _descriptor_31 = new __compactRuntime.CompactTypeUnsignedInteger(4294967295n, 4);

export class Contract {
  witnesses;
  constructor(...args_0) {
    if (args_0.length !== 1) {
      throw new __compactRuntime.CompactError(`Contract constructor: expected 1 argument, received ${args_0.length}`);
    }
    const witnesses_0 = args_0[0];
    if (typeof(witnesses_0) !== 'object') {
      throw new __compactRuntime.CompactError('first (witnesses) argument to Contract constructor is not an object');
    }
    this.witnesses = witnesses_0;
    this.circuits = {
      async keyIdOf(context, ...args_1) {
        return { result: pureCircuits.keyIdOf(...args_1), context };
      },
      async rootDigest(context, ...args_1) {
        return { result: pureCircuits.rootDigest(...args_1), context };
      },
      async schoolDigest(context, ...args_1) {
        return { result: pureCircuits.schoolDigest(...args_1), context };
      },
      async endorseDigest(context, ...args_1) {
        return { result: pureCircuits.endorseDigest(...args_1), context };
      },
      async revokeDigest(context, ...args_1) {
        return { result: pureCircuits.revokeDigest(...args_1), context };
      },
      async endorsementKey(context, ...args_1) {
        return { result: pureCircuits.endorsementKey(...args_1), context };
      },
      rootOnboardSchool: async (...args_1) => {
        if (args_1.length !== 5) {
          throw new __compactRuntime.CompactError(`rootOnboardSchool: expected 5 arguments (as invoked from Typescript), received ${args_1.length}`);
        }
        const contextOrig_0 = args_1[0];
        const schoolId_0 = args_1[1];
        const adminKeyId_0 = args_1[2];
        const rootPk_0 = args_1[3];
        const sig_0 = args_1[4];
        if (!(typeof(contextOrig_0) === 'object' && contextOrig_0.callContext.currentQueryContext != undefined)) {
          __compactRuntime.typeError('rootOnboardSchool',
                                     'argument 1 (as invoked from Typescript)',
                                     'cfi_endorse.compact line 178 char 1',
                                     'CircuitContext',
                                     contextOrig_0)
        }
        if (!(schoolId_0.buffer instanceof ArrayBuffer && schoolId_0.BYTES_PER_ELEMENT === 1 && schoolId_0.length === 32)) {
          __compactRuntime.typeError('rootOnboardSchool',
                                     'argument 1 (argument 2 as invoked from Typescript)',
                                     'cfi_endorse.compact line 178 char 1',
                                     'Bytes<32>',
                                     schoolId_0)
        }
        if (!(adminKeyId_0.buffer instanceof ArrayBuffer && adminKeyId_0.BYTES_PER_ELEMENT === 1 && adminKeyId_0.length === 32)) {
          __compactRuntime.typeError('rootOnboardSchool',
                                     'argument 2 (argument 3 as invoked from Typescript)',
                                     'cfi_endorse.compact line 178 char 1',
                                     'Bytes<32>',
                                     adminKeyId_0)
        }
        if (!(__compactRuntime.isValidSecp256r1Point(rootPk_0))) {
          __compactRuntime.typeError('rootOnboardSchool',
                                     'argument 3 (argument 4 as invoked from Typescript)',
                                     'cfi_endorse.compact line 178 char 1',
                                     'Secp256r1Point',
                                     rootPk_0)
        }
        if (!(typeof(sig_0) === 'object' && typeof(sig_0.r) === 'bigint' && sig_0.r >= 0 && sig_0.r <= __compactRuntime.MAX_SECP256R1_SCALAR && typeof(sig_0.s) === 'bigint' && sig_0.s >= 0 && sig_0.s <= __compactRuntime.MAX_SECP256R1_SCALAR)) {
          __compactRuntime.typeError('rootOnboardSchool',
                                     'argument 4 (argument 5 as invoked from Typescript)',
                                     'cfi_endorse.compact line 178 char 1',
                                     'struct Secp256r1EcdsaSignature<r: Secp256r1Scalar, s: Secp256r1Scalar>',
                                     sig_0)
        }
        const context = __compactRuntime.copyCircuitContext(contextOrig_0);
        const partialProofData = {
          input: {
            value: _descriptor_0.toValue(schoolId_0).concat(_descriptor_0.toValue(adminKeyId_0).concat(_descriptor_6.toValue(rootPk_0).concat(_descriptor_13.toValue(sig_0)))),
            alignment: _descriptor_0.alignment().concat(_descriptor_0.alignment().concat(_descriptor_6.alignment().concat(_descriptor_13.alignment())))
          },
          output: undefined,
          publicTranscript: [],
          privateTranscriptOutputs: []
        };
        const result_0 = await this._rootOnboardSchool_0(context,
                                                         partialProofData,
                                                         schoolId_0,
                                                         adminKeyId_0,
                                                         rootPk_0,
                                                         sig_0);
        partialProofData.output = { value: [], alignment: [] };
        __compactRuntime.finalizeCallProofData(context, partialProofData);
        return { result: result_0, context: context, gasCost: context.callContext.currentGasCost };
      },
      rootRevokeSchool: async (...args_1) => {
        if (args_1.length !== 4) {
          throw new __compactRuntime.CompactError(`rootRevokeSchool: expected 4 arguments (as invoked from Typescript), received ${args_1.length}`);
        }
        const contextOrig_0 = args_1[0];
        const schoolId_0 = args_1[1];
        const rootPk_0 = args_1[2];
        const sig_0 = args_1[3];
        if (!(typeof(contextOrig_0) === 'object' && contextOrig_0.callContext.currentQueryContext != undefined)) {
          __compactRuntime.typeError('rootRevokeSchool',
                                     'argument 1 (as invoked from Typescript)',
                                     'cfi_endorse.compact line 190 char 1',
                                     'CircuitContext',
                                     contextOrig_0)
        }
        if (!(schoolId_0.buffer instanceof ArrayBuffer && schoolId_0.BYTES_PER_ELEMENT === 1 && schoolId_0.length === 32)) {
          __compactRuntime.typeError('rootRevokeSchool',
                                     'argument 1 (argument 2 as invoked from Typescript)',
                                     'cfi_endorse.compact line 190 char 1',
                                     'Bytes<32>',
                                     schoolId_0)
        }
        if (!(__compactRuntime.isValidSecp256r1Point(rootPk_0))) {
          __compactRuntime.typeError('rootRevokeSchool',
                                     'argument 2 (argument 3 as invoked from Typescript)',
                                     'cfi_endorse.compact line 190 char 1',
                                     'Secp256r1Point',
                                     rootPk_0)
        }
        if (!(typeof(sig_0) === 'object' && typeof(sig_0.r) === 'bigint' && sig_0.r >= 0 && sig_0.r <= __compactRuntime.MAX_SECP256R1_SCALAR && typeof(sig_0.s) === 'bigint' && sig_0.s >= 0 && sig_0.s <= __compactRuntime.MAX_SECP256R1_SCALAR)) {
          __compactRuntime.typeError('rootRevokeSchool',
                                     'argument 3 (argument 4 as invoked from Typescript)',
                                     'cfi_endorse.compact line 190 char 1',
                                     'struct Secp256r1EcdsaSignature<r: Secp256r1Scalar, s: Secp256r1Scalar>',
                                     sig_0)
        }
        const context = __compactRuntime.copyCircuitContext(contextOrig_0);
        const partialProofData = {
          input: {
            value: _descriptor_0.toValue(schoolId_0).concat(_descriptor_6.toValue(rootPk_0).concat(_descriptor_13.toValue(sig_0))),
            alignment: _descriptor_0.alignment().concat(_descriptor_6.alignment().concat(_descriptor_13.alignment()))
          },
          output: undefined,
          publicTranscript: [],
          privateTranscriptOutputs: []
        };
        const result_0 = await this._rootRevokeSchool_0(context,
                                                        partialProofData,
                                                        schoolId_0,
                                                        rootPk_0,
                                                        sig_0);
        partialProofData.output = { value: [], alignment: [] };
        __compactRuntime.finalizeCallProofData(context, partialProofData);
        return { result: result_0, context: context, gasCost: context.callContext.currentGasCost };
      },
      rootSetSchoolAdmin: async (...args_1) => {
        if (args_1.length !== 5) {
          throw new __compactRuntime.CompactError(`rootSetSchoolAdmin: expected 5 arguments (as invoked from Typescript), received ${args_1.length}`);
        }
        const contextOrig_0 = args_1[0];
        const schoolId_0 = args_1[1];
        const newAdminKeyId_0 = args_1[2];
        const rootPk_0 = args_1[3];
        const sig_0 = args_1[4];
        if (!(typeof(contextOrig_0) === 'object' && contextOrig_0.callContext.currentQueryContext != undefined)) {
          __compactRuntime.typeError('rootSetSchoolAdmin',
                                     'argument 1 (as invoked from Typescript)',
                                     'cfi_endorse.compact line 200 char 1',
                                     'CircuitContext',
                                     contextOrig_0)
        }
        if (!(schoolId_0.buffer instanceof ArrayBuffer && schoolId_0.BYTES_PER_ELEMENT === 1 && schoolId_0.length === 32)) {
          __compactRuntime.typeError('rootSetSchoolAdmin',
                                     'argument 1 (argument 2 as invoked from Typescript)',
                                     'cfi_endorse.compact line 200 char 1',
                                     'Bytes<32>',
                                     schoolId_0)
        }
        if (!(newAdminKeyId_0.buffer instanceof ArrayBuffer && newAdminKeyId_0.BYTES_PER_ELEMENT === 1 && newAdminKeyId_0.length === 32)) {
          __compactRuntime.typeError('rootSetSchoolAdmin',
                                     'argument 2 (argument 3 as invoked from Typescript)',
                                     'cfi_endorse.compact line 200 char 1',
                                     'Bytes<32>',
                                     newAdminKeyId_0)
        }
        if (!(__compactRuntime.isValidSecp256r1Point(rootPk_0))) {
          __compactRuntime.typeError('rootSetSchoolAdmin',
                                     'argument 3 (argument 4 as invoked from Typescript)',
                                     'cfi_endorse.compact line 200 char 1',
                                     'Secp256r1Point',
                                     rootPk_0)
        }
        if (!(typeof(sig_0) === 'object' && typeof(sig_0.r) === 'bigint' && sig_0.r >= 0 && sig_0.r <= __compactRuntime.MAX_SECP256R1_SCALAR && typeof(sig_0.s) === 'bigint' && sig_0.s >= 0 && sig_0.s <= __compactRuntime.MAX_SECP256R1_SCALAR)) {
          __compactRuntime.typeError('rootSetSchoolAdmin',
                                     'argument 4 (argument 5 as invoked from Typescript)',
                                     'cfi_endorse.compact line 200 char 1',
                                     'struct Secp256r1EcdsaSignature<r: Secp256r1Scalar, s: Secp256r1Scalar>',
                                     sig_0)
        }
        const context = __compactRuntime.copyCircuitContext(contextOrig_0);
        const partialProofData = {
          input: {
            value: _descriptor_0.toValue(schoolId_0).concat(_descriptor_0.toValue(newAdminKeyId_0).concat(_descriptor_6.toValue(rootPk_0).concat(_descriptor_13.toValue(sig_0)))),
            alignment: _descriptor_0.alignment().concat(_descriptor_0.alignment().concat(_descriptor_6.alignment().concat(_descriptor_13.alignment())))
          },
          output: undefined,
          publicTranscript: [],
          privateTranscriptOutputs: []
        };
        const result_0 = await this._rootSetSchoolAdmin_0(context,
                                                          partialProofData,
                                                          schoolId_0,
                                                          newAdminKeyId_0,
                                                          rootPk_0,
                                                          sig_0);
        partialProofData.output = { value: [], alignment: [] };
        __compactRuntime.finalizeCallProofData(context, partialProofData);
        return { result: result_0, context: context, gasCost: context.callContext.currentGasCost };
      },
      rootSetKey: async (...args_1) => {
        if (args_1.length !== 5) {
          throw new __compactRuntime.CompactError(`rootSetKey: expected 5 arguments (as invoked from Typescript), received ${args_1.length}`);
        }
        const contextOrig_0 = args_1[0];
        const keyId_0 = args_1[1];
        const active_0 = args_1[2];
        const rootPk_0 = args_1[3];
        const sig_0 = args_1[4];
        if (!(typeof(contextOrig_0) === 'object' && contextOrig_0.callContext.currentQueryContext != undefined)) {
          __compactRuntime.typeError('rootSetKey',
                                     'argument 1 (as invoked from Typescript)',
                                     'cfi_endorse.compact line 217 char 1',
                                     'CircuitContext',
                                     contextOrig_0)
        }
        if (!(keyId_0.buffer instanceof ArrayBuffer && keyId_0.BYTES_PER_ELEMENT === 1 && keyId_0.length === 32)) {
          __compactRuntime.typeError('rootSetKey',
                                     'argument 1 (argument 2 as invoked from Typescript)',
                                     'cfi_endorse.compact line 217 char 1',
                                     'Bytes<32>',
                                     keyId_0)
        }
        if (!(typeof(active_0) === 'boolean')) {
          __compactRuntime.typeError('rootSetKey',
                                     'argument 2 (argument 3 as invoked from Typescript)',
                                     'cfi_endorse.compact line 217 char 1',
                                     'Boolean',
                                     active_0)
        }
        if (!(__compactRuntime.isValidSecp256r1Point(rootPk_0))) {
          __compactRuntime.typeError('rootSetKey',
                                     'argument 3 (argument 4 as invoked from Typescript)',
                                     'cfi_endorse.compact line 217 char 1',
                                     'Secp256r1Point',
                                     rootPk_0)
        }
        if (!(typeof(sig_0) === 'object' && typeof(sig_0.r) === 'bigint' && sig_0.r >= 0 && sig_0.r <= __compactRuntime.MAX_SECP256R1_SCALAR && typeof(sig_0.s) === 'bigint' && sig_0.s >= 0 && sig_0.s <= __compactRuntime.MAX_SECP256R1_SCALAR)) {
          __compactRuntime.typeError('rootSetKey',
                                     'argument 4 (argument 5 as invoked from Typescript)',
                                     'cfi_endorse.compact line 217 char 1',
                                     'struct Secp256r1EcdsaSignature<r: Secp256r1Scalar, s: Secp256r1Scalar>',
                                     sig_0)
        }
        const context = __compactRuntime.copyCircuitContext(contextOrig_0);
        const partialProofData = {
          input: {
            value: _descriptor_0.toValue(keyId_0).concat(_descriptor_2.toValue(active_0).concat(_descriptor_6.toValue(rootPk_0).concat(_descriptor_13.toValue(sig_0)))),
            alignment: _descriptor_0.alignment().concat(_descriptor_2.alignment().concat(_descriptor_6.alignment().concat(_descriptor_13.alignment())))
          },
          output: undefined,
          publicTranscript: [],
          privateTranscriptOutputs: []
        };
        const result_0 = await this._rootSetKey_0(context,
                                                  partialProofData,
                                                  keyId_0,
                                                  active_0,
                                                  rootPk_0,
                                                  sig_0);
        partialProofData.output = { value: [], alignment: [] };
        __compactRuntime.finalizeCallProofData(context, partialProofData);
        return { result: result_0, context: context, gasCost: context.callContext.currentGasCost };
      },
      schoolEnrollCfi: async (...args_1) => {
        if (args_1.length !== 11) {
          throw new __compactRuntime.CompactError(`schoolEnrollCfi: expected 11 arguments (as invoked from Typescript), received ${args_1.length}`);
        }
        const contextOrig_0 = args_1[0];
        const schoolId_0 = args_1[1];
        const cfiKeyId_0 = args_1[2];
        const cfiRef_0 = args_1[3];
        const adminPk_0 = args_1[4];
        const authData_0 = args_1[5];
        const challenge_0 = args_1[6];
        const cdSuffix_0 = args_1[7];
        const flagsBit1_0 = args_1[8];
        const flagsHigh_0 = args_1[9];
        const sig_0 = args_1[10];
        if (!(typeof(contextOrig_0) === 'object' && contextOrig_0.callContext.currentQueryContext != undefined)) {
          __compactRuntime.typeError('schoolEnrollCfi',
                                     'argument 1 (as invoked from Typescript)',
                                     'cfi_endorse.compact line 236 char 1',
                                     'CircuitContext',
                                     contextOrig_0)
        }
        if (!(schoolId_0.buffer instanceof ArrayBuffer && schoolId_0.BYTES_PER_ELEMENT === 1 && schoolId_0.length === 32)) {
          __compactRuntime.typeError('schoolEnrollCfi',
                                     'argument 1 (argument 2 as invoked from Typescript)',
                                     'cfi_endorse.compact line 236 char 1',
                                     'Bytes<32>',
                                     schoolId_0)
        }
        if (!(cfiKeyId_0.buffer instanceof ArrayBuffer && cfiKeyId_0.BYTES_PER_ELEMENT === 1 && cfiKeyId_0.length === 32)) {
          __compactRuntime.typeError('schoolEnrollCfi',
                                     'argument 2 (argument 3 as invoked from Typescript)',
                                     'cfi_endorse.compact line 236 char 1',
                                     'Bytes<32>',
                                     cfiKeyId_0)
        }
        if (!(cfiRef_0.buffer instanceof ArrayBuffer && cfiRef_0.BYTES_PER_ELEMENT === 1 && cfiRef_0.length === 32)) {
          __compactRuntime.typeError('schoolEnrollCfi',
                                     'argument 3 (argument 4 as invoked from Typescript)',
                                     'cfi_endorse.compact line 236 char 1',
                                     'Bytes<32>',
                                     cfiRef_0)
        }
        if (!(__compactRuntime.isValidSecp256r1Point(adminPk_0))) {
          __compactRuntime.typeError('schoolEnrollCfi',
                                     'argument 4 (argument 5 as invoked from Typescript)',
                                     'cfi_endorse.compact line 236 char 1',
                                     'Secp256r1Point',
                                     adminPk_0)
        }
        if (!(authData_0.buffer instanceof ArrayBuffer && authData_0.BYTES_PER_ELEMENT === 1 && authData_0.length === 37)) {
          __compactRuntime.typeError('schoolEnrollCfi',
                                     'argument 5 (argument 6 as invoked from Typescript)',
                                     'cfi_endorse.compact line 236 char 1',
                                     'Bytes<37>',
                                     authData_0)
        }
        if (!(challenge_0.buffer instanceof ArrayBuffer && challenge_0.BYTES_PER_ELEMENT === 1 && challenge_0.length === 43)) {
          __compactRuntime.typeError('schoolEnrollCfi',
                                     'argument 6 (argument 7 as invoked from Typescript)',
                                     'cfi_endorse.compact line 236 char 1',
                                     'Bytes<43>',
                                     challenge_0)
        }
        if (!(cdSuffix_0.buffer instanceof ArrayBuffer && cdSuffix_0.BYTES_PER_ELEMENT === 1 && cdSuffix_0.length === 84)) {
          __compactRuntime.typeError('schoolEnrollCfi',
                                     'argument 7 (argument 8 as invoked from Typescript)',
                                     'cfi_endorse.compact line 236 char 1',
                                     'Bytes<84>',
                                     cdSuffix_0)
        }
        if (!(typeof(flagsBit1_0) === 'bigint' && flagsBit1_0 >= 0n && flagsBit1_0 <= 1n)) {
          __compactRuntime.typeError('schoolEnrollCfi',
                                     'argument 8 (argument 9 as invoked from Typescript)',
                                     'cfi_endorse.compact line 236 char 1',
                                     'Uint<0..2>',
                                     flagsBit1_0)
        }
        if (!(typeof(flagsHigh_0) === 'bigint' && flagsHigh_0 >= 0n && flagsHigh_0 <= 31n)) {
          __compactRuntime.typeError('schoolEnrollCfi',
                                     'argument 9 (argument 10 as invoked from Typescript)',
                                     'cfi_endorse.compact line 236 char 1',
                                     'Uint<0..32>',
                                     flagsHigh_0)
        }
        if (!(typeof(sig_0) === 'object' && typeof(sig_0.r) === 'bigint' && sig_0.r >= 0 && sig_0.r <= __compactRuntime.MAX_SECP256R1_SCALAR && typeof(sig_0.s) === 'bigint' && sig_0.s >= 0 && sig_0.s <= __compactRuntime.MAX_SECP256R1_SCALAR)) {
          __compactRuntime.typeError('schoolEnrollCfi',
                                     'argument 10 (argument 11 as invoked from Typescript)',
                                     'cfi_endorse.compact line 236 char 1',
                                     'struct Secp256r1EcdsaSignature<r: Secp256r1Scalar, s: Secp256r1Scalar>',
                                     sig_0)
        }
        const context = __compactRuntime.copyCircuitContext(contextOrig_0);
        const partialProofData = {
          input: {
            value: _descriptor_0.toValue(schoolId_0).concat(_descriptor_0.toValue(cfiKeyId_0).concat(_descriptor_0.toValue(cfiRef_0).concat(_descriptor_6.toValue(adminPk_0).concat(_descriptor_7.toValue(authData_0).concat(_descriptor_8.toValue(challenge_0).concat(_descriptor_9.toValue(cdSuffix_0).concat(_descriptor_10.toValue(flagsBit1_0).concat(_descriptor_11.toValue(flagsHigh_0).concat(_descriptor_13.toValue(sig_0)))))))))),
            alignment: _descriptor_0.alignment().concat(_descriptor_0.alignment().concat(_descriptor_0.alignment().concat(_descriptor_6.alignment().concat(_descriptor_7.alignment().concat(_descriptor_8.alignment().concat(_descriptor_9.alignment().concat(_descriptor_10.alignment().concat(_descriptor_11.alignment().concat(_descriptor_13.alignment())))))))))
          },
          output: undefined,
          publicTranscript: [],
          privateTranscriptOutputs: []
        };
        const result_0 = await this._schoolEnrollCfi_0(context,
                                                       partialProofData,
                                                       schoolId_0,
                                                       cfiKeyId_0,
                                                       cfiRef_0,
                                                       adminPk_0,
                                                       authData_0,
                                                       challenge_0,
                                                       cdSuffix_0,
                                                       flagsBit1_0,
                                                       flagsHigh_0,
                                                       sig_0);
        partialProofData.output = { value: [], alignment: [] };
        __compactRuntime.finalizeCallProofData(context, partialProofData);
        return { result: result_0, context: context, gasCost: context.callContext.currentGasCost };
      },
      schoolRevokeCfi: async (...args_1) => {
        if (args_1.length !== 10) {
          throw new __compactRuntime.CompactError(`schoolRevokeCfi: expected 10 arguments (as invoked from Typescript), received ${args_1.length}`);
        }
        const contextOrig_0 = args_1[0];
        const schoolId_0 = args_1[1];
        const cfiKeyId_0 = args_1[2];
        const adminPk_0 = args_1[3];
        const authData_0 = args_1[4];
        const challenge_0 = args_1[5];
        const cdSuffix_0 = args_1[6];
        const flagsBit1_0 = args_1[7];
        const flagsHigh_0 = args_1[8];
        const sig_0 = args_1[9];
        if (!(typeof(contextOrig_0) === 'object' && contextOrig_0.callContext.currentQueryContext != undefined)) {
          __compactRuntime.typeError('schoolRevokeCfi',
                                     'argument 1 (as invoked from Typescript)',
                                     'cfi_endorse.compact line 248 char 1',
                                     'CircuitContext',
                                     contextOrig_0)
        }
        if (!(schoolId_0.buffer instanceof ArrayBuffer && schoolId_0.BYTES_PER_ELEMENT === 1 && schoolId_0.length === 32)) {
          __compactRuntime.typeError('schoolRevokeCfi',
                                     'argument 1 (argument 2 as invoked from Typescript)',
                                     'cfi_endorse.compact line 248 char 1',
                                     'Bytes<32>',
                                     schoolId_0)
        }
        if (!(cfiKeyId_0.buffer instanceof ArrayBuffer && cfiKeyId_0.BYTES_PER_ELEMENT === 1 && cfiKeyId_0.length === 32)) {
          __compactRuntime.typeError('schoolRevokeCfi',
                                     'argument 2 (argument 3 as invoked from Typescript)',
                                     'cfi_endorse.compact line 248 char 1',
                                     'Bytes<32>',
                                     cfiKeyId_0)
        }
        if (!(__compactRuntime.isValidSecp256r1Point(adminPk_0))) {
          __compactRuntime.typeError('schoolRevokeCfi',
                                     'argument 3 (argument 4 as invoked from Typescript)',
                                     'cfi_endorse.compact line 248 char 1',
                                     'Secp256r1Point',
                                     adminPk_0)
        }
        if (!(authData_0.buffer instanceof ArrayBuffer && authData_0.BYTES_PER_ELEMENT === 1 && authData_0.length === 37)) {
          __compactRuntime.typeError('schoolRevokeCfi',
                                     'argument 4 (argument 5 as invoked from Typescript)',
                                     'cfi_endorse.compact line 248 char 1',
                                     'Bytes<37>',
                                     authData_0)
        }
        if (!(challenge_0.buffer instanceof ArrayBuffer && challenge_0.BYTES_PER_ELEMENT === 1 && challenge_0.length === 43)) {
          __compactRuntime.typeError('schoolRevokeCfi',
                                     'argument 5 (argument 6 as invoked from Typescript)',
                                     'cfi_endorse.compact line 248 char 1',
                                     'Bytes<43>',
                                     challenge_0)
        }
        if (!(cdSuffix_0.buffer instanceof ArrayBuffer && cdSuffix_0.BYTES_PER_ELEMENT === 1 && cdSuffix_0.length === 84)) {
          __compactRuntime.typeError('schoolRevokeCfi',
                                     'argument 6 (argument 7 as invoked from Typescript)',
                                     'cfi_endorse.compact line 248 char 1',
                                     'Bytes<84>',
                                     cdSuffix_0)
        }
        if (!(typeof(flagsBit1_0) === 'bigint' && flagsBit1_0 >= 0n && flagsBit1_0 <= 1n)) {
          __compactRuntime.typeError('schoolRevokeCfi',
                                     'argument 7 (argument 8 as invoked from Typescript)',
                                     'cfi_endorse.compact line 248 char 1',
                                     'Uint<0..2>',
                                     flagsBit1_0)
        }
        if (!(typeof(flagsHigh_0) === 'bigint' && flagsHigh_0 >= 0n && flagsHigh_0 <= 31n)) {
          __compactRuntime.typeError('schoolRevokeCfi',
                                     'argument 8 (argument 9 as invoked from Typescript)',
                                     'cfi_endorse.compact line 248 char 1',
                                     'Uint<0..32>',
                                     flagsHigh_0)
        }
        if (!(typeof(sig_0) === 'object' && typeof(sig_0.r) === 'bigint' && sig_0.r >= 0 && sig_0.r <= __compactRuntime.MAX_SECP256R1_SCALAR && typeof(sig_0.s) === 'bigint' && sig_0.s >= 0 && sig_0.s <= __compactRuntime.MAX_SECP256R1_SCALAR)) {
          __compactRuntime.typeError('schoolRevokeCfi',
                                     'argument 9 (argument 10 as invoked from Typescript)',
                                     'cfi_endorse.compact line 248 char 1',
                                     'struct Secp256r1EcdsaSignature<r: Secp256r1Scalar, s: Secp256r1Scalar>',
                                     sig_0)
        }
        const context = __compactRuntime.copyCircuitContext(contextOrig_0);
        const partialProofData = {
          input: {
            value: _descriptor_0.toValue(schoolId_0).concat(_descriptor_0.toValue(cfiKeyId_0).concat(_descriptor_6.toValue(adminPk_0).concat(_descriptor_7.toValue(authData_0).concat(_descriptor_8.toValue(challenge_0).concat(_descriptor_9.toValue(cdSuffix_0).concat(_descriptor_10.toValue(flagsBit1_0).concat(_descriptor_11.toValue(flagsHigh_0).concat(_descriptor_13.toValue(sig_0))))))))),
            alignment: _descriptor_0.alignment().concat(_descriptor_0.alignment().concat(_descriptor_6.alignment().concat(_descriptor_7.alignment().concat(_descriptor_8.alignment().concat(_descriptor_9.alignment().concat(_descriptor_10.alignment().concat(_descriptor_11.alignment().concat(_descriptor_13.alignment()))))))))
          },
          output: undefined,
          publicTranscript: [],
          privateTranscriptOutputs: []
        };
        const result_0 = await this._schoolRevokeCfi_0(context,
                                                       partialProofData,
                                                       schoolId_0,
                                                       cfiKeyId_0,
                                                       adminPk_0,
                                                       authData_0,
                                                       challenge_0,
                                                       cdSuffix_0,
                                                       flagsBit1_0,
                                                       flagsHigh_0,
                                                       sig_0);
        partialProofData.output = { value: [], alignment: [] };
        __compactRuntime.finalizeCallProofData(context, partialProofData);
        return { result: result_0, context: context, gasCost: context.callContext.currentGasCost };
      },
      schoolRotateAdmin: async (...args_1) => {
        if (args_1.length !== 10) {
          throw new __compactRuntime.CompactError(`schoolRotateAdmin: expected 10 arguments (as invoked from Typescript), received ${args_1.length}`);
        }
        const contextOrig_0 = args_1[0];
        const schoolId_0 = args_1[1];
        const newAdminKeyId_0 = args_1[2];
        const adminPk_0 = args_1[3];
        const authData_0 = args_1[4];
        const challenge_0 = args_1[5];
        const cdSuffix_0 = args_1[6];
        const flagsBit1_0 = args_1[7];
        const flagsHigh_0 = args_1[8];
        const sig_0 = args_1[9];
        if (!(typeof(contextOrig_0) === 'object' && contextOrig_0.callContext.currentQueryContext != undefined)) {
          __compactRuntime.typeError('schoolRotateAdmin',
                                     'argument 1 (as invoked from Typescript)',
                                     'cfi_endorse.compact line 263 char 1',
                                     'CircuitContext',
                                     contextOrig_0)
        }
        if (!(schoolId_0.buffer instanceof ArrayBuffer && schoolId_0.BYTES_PER_ELEMENT === 1 && schoolId_0.length === 32)) {
          __compactRuntime.typeError('schoolRotateAdmin',
                                     'argument 1 (argument 2 as invoked from Typescript)',
                                     'cfi_endorse.compact line 263 char 1',
                                     'Bytes<32>',
                                     schoolId_0)
        }
        if (!(newAdminKeyId_0.buffer instanceof ArrayBuffer && newAdminKeyId_0.BYTES_PER_ELEMENT === 1 && newAdminKeyId_0.length === 32)) {
          __compactRuntime.typeError('schoolRotateAdmin',
                                     'argument 2 (argument 3 as invoked from Typescript)',
                                     'cfi_endorse.compact line 263 char 1',
                                     'Bytes<32>',
                                     newAdminKeyId_0)
        }
        if (!(__compactRuntime.isValidSecp256r1Point(adminPk_0))) {
          __compactRuntime.typeError('schoolRotateAdmin',
                                     'argument 3 (argument 4 as invoked from Typescript)',
                                     'cfi_endorse.compact line 263 char 1',
                                     'Secp256r1Point',
                                     adminPk_0)
        }
        if (!(authData_0.buffer instanceof ArrayBuffer && authData_0.BYTES_PER_ELEMENT === 1 && authData_0.length === 37)) {
          __compactRuntime.typeError('schoolRotateAdmin',
                                     'argument 4 (argument 5 as invoked from Typescript)',
                                     'cfi_endorse.compact line 263 char 1',
                                     'Bytes<37>',
                                     authData_0)
        }
        if (!(challenge_0.buffer instanceof ArrayBuffer && challenge_0.BYTES_PER_ELEMENT === 1 && challenge_0.length === 43)) {
          __compactRuntime.typeError('schoolRotateAdmin',
                                     'argument 5 (argument 6 as invoked from Typescript)',
                                     'cfi_endorse.compact line 263 char 1',
                                     'Bytes<43>',
                                     challenge_0)
        }
        if (!(cdSuffix_0.buffer instanceof ArrayBuffer && cdSuffix_0.BYTES_PER_ELEMENT === 1 && cdSuffix_0.length === 84)) {
          __compactRuntime.typeError('schoolRotateAdmin',
                                     'argument 6 (argument 7 as invoked from Typescript)',
                                     'cfi_endorse.compact line 263 char 1',
                                     'Bytes<84>',
                                     cdSuffix_0)
        }
        if (!(typeof(flagsBit1_0) === 'bigint' && flagsBit1_0 >= 0n && flagsBit1_0 <= 1n)) {
          __compactRuntime.typeError('schoolRotateAdmin',
                                     'argument 7 (argument 8 as invoked from Typescript)',
                                     'cfi_endorse.compact line 263 char 1',
                                     'Uint<0..2>',
                                     flagsBit1_0)
        }
        if (!(typeof(flagsHigh_0) === 'bigint' && flagsHigh_0 >= 0n && flagsHigh_0 <= 31n)) {
          __compactRuntime.typeError('schoolRotateAdmin',
                                     'argument 8 (argument 9 as invoked from Typescript)',
                                     'cfi_endorse.compact line 263 char 1',
                                     'Uint<0..32>',
                                     flagsHigh_0)
        }
        if (!(typeof(sig_0) === 'object' && typeof(sig_0.r) === 'bigint' && sig_0.r >= 0 && sig_0.r <= __compactRuntime.MAX_SECP256R1_SCALAR && typeof(sig_0.s) === 'bigint' && sig_0.s >= 0 && sig_0.s <= __compactRuntime.MAX_SECP256R1_SCALAR)) {
          __compactRuntime.typeError('schoolRotateAdmin',
                                     'argument 9 (argument 10 as invoked from Typescript)',
                                     'cfi_endorse.compact line 263 char 1',
                                     'struct Secp256r1EcdsaSignature<r: Secp256r1Scalar, s: Secp256r1Scalar>',
                                     sig_0)
        }
        const context = __compactRuntime.copyCircuitContext(contextOrig_0);
        const partialProofData = {
          input: {
            value: _descriptor_0.toValue(schoolId_0).concat(_descriptor_0.toValue(newAdminKeyId_0).concat(_descriptor_6.toValue(adminPk_0).concat(_descriptor_7.toValue(authData_0).concat(_descriptor_8.toValue(challenge_0).concat(_descriptor_9.toValue(cdSuffix_0).concat(_descriptor_10.toValue(flagsBit1_0).concat(_descriptor_11.toValue(flagsHigh_0).concat(_descriptor_13.toValue(sig_0))))))))),
            alignment: _descriptor_0.alignment().concat(_descriptor_0.alignment().concat(_descriptor_6.alignment().concat(_descriptor_7.alignment().concat(_descriptor_8.alignment().concat(_descriptor_9.alignment().concat(_descriptor_10.alignment().concat(_descriptor_11.alignment().concat(_descriptor_13.alignment()))))))))
          },
          output: undefined,
          publicTranscript: [],
          privateTranscriptOutputs: []
        };
        const result_0 = await this._schoolRotateAdmin_0(context,
                                                         partialProofData,
                                                         schoolId_0,
                                                         newAdminKeyId_0,
                                                         adminPk_0,
                                                         authData_0,
                                                         challenge_0,
                                                         cdSuffix_0,
                                                         flagsBit1_0,
                                                         flagsHigh_0,
                                                         sig_0);
        partialProofData.output = { value: [], alignment: [] };
        __compactRuntime.finalizeCallProofData(context, partialProofData);
        return { result: result_0, context: context, gasCost: context.callContext.currentGasCost };
      },
      selfRevoke: async (...args_1) => {
        if (args_1.length !== 8) {
          throw new __compactRuntime.CompactError(`selfRevoke: expected 8 arguments (as invoked from Typescript), received ${args_1.length}`);
        }
        const contextOrig_0 = args_1[0];
        const cfiPubKey_0 = args_1[1];
        const authData_0 = args_1[2];
        const challenge_0 = args_1[3];
        const cdSuffix_0 = args_1[4];
        const flagsBit1_0 = args_1[5];
        const flagsHigh_0 = args_1[6];
        const sig_0 = args_1[7];
        if (!(typeof(contextOrig_0) === 'object' && contextOrig_0.callContext.currentQueryContext != undefined)) {
          __compactRuntime.typeError('selfRevoke',
                                     'argument 1 (as invoked from Typescript)',
                                     'cfi_endorse.compact line 282 char 1',
                                     'CircuitContext',
                                     contextOrig_0)
        }
        if (!(__compactRuntime.isValidSecp256r1Point(cfiPubKey_0))) {
          __compactRuntime.typeError('selfRevoke',
                                     'argument 1 (argument 2 as invoked from Typescript)',
                                     'cfi_endorse.compact line 282 char 1',
                                     'Secp256r1Point',
                                     cfiPubKey_0)
        }
        if (!(authData_0.buffer instanceof ArrayBuffer && authData_0.BYTES_PER_ELEMENT === 1 && authData_0.length === 37)) {
          __compactRuntime.typeError('selfRevoke',
                                     'argument 2 (argument 3 as invoked from Typescript)',
                                     'cfi_endorse.compact line 282 char 1',
                                     'Bytes<37>',
                                     authData_0)
        }
        if (!(challenge_0.buffer instanceof ArrayBuffer && challenge_0.BYTES_PER_ELEMENT === 1 && challenge_0.length === 43)) {
          __compactRuntime.typeError('selfRevoke',
                                     'argument 3 (argument 4 as invoked from Typescript)',
                                     'cfi_endorse.compact line 282 char 1',
                                     'Bytes<43>',
                                     challenge_0)
        }
        if (!(cdSuffix_0.buffer instanceof ArrayBuffer && cdSuffix_0.BYTES_PER_ELEMENT === 1 && cdSuffix_0.length === 84)) {
          __compactRuntime.typeError('selfRevoke',
                                     'argument 4 (argument 5 as invoked from Typescript)',
                                     'cfi_endorse.compact line 282 char 1',
                                     'Bytes<84>',
                                     cdSuffix_0)
        }
        if (!(typeof(flagsBit1_0) === 'bigint' && flagsBit1_0 >= 0n && flagsBit1_0 <= 1n)) {
          __compactRuntime.typeError('selfRevoke',
                                     'argument 5 (argument 6 as invoked from Typescript)',
                                     'cfi_endorse.compact line 282 char 1',
                                     'Uint<0..2>',
                                     flagsBit1_0)
        }
        if (!(typeof(flagsHigh_0) === 'bigint' && flagsHigh_0 >= 0n && flagsHigh_0 <= 31n)) {
          __compactRuntime.typeError('selfRevoke',
                                     'argument 6 (argument 7 as invoked from Typescript)',
                                     'cfi_endorse.compact line 282 char 1',
                                     'Uint<0..32>',
                                     flagsHigh_0)
        }
        if (!(typeof(sig_0) === 'object' && typeof(sig_0.r) === 'bigint' && sig_0.r >= 0 && sig_0.r <= __compactRuntime.MAX_SECP256R1_SCALAR && typeof(sig_0.s) === 'bigint' && sig_0.s >= 0 && sig_0.s <= __compactRuntime.MAX_SECP256R1_SCALAR)) {
          __compactRuntime.typeError('selfRevoke',
                                     'argument 7 (argument 8 as invoked from Typescript)',
                                     'cfi_endorse.compact line 282 char 1',
                                     'struct Secp256r1EcdsaSignature<r: Secp256r1Scalar, s: Secp256r1Scalar>',
                                     sig_0)
        }
        const context = __compactRuntime.copyCircuitContext(contextOrig_0);
        const partialProofData = {
          input: {
            value: _descriptor_6.toValue(cfiPubKey_0).concat(_descriptor_7.toValue(authData_0).concat(_descriptor_8.toValue(challenge_0).concat(_descriptor_9.toValue(cdSuffix_0).concat(_descriptor_10.toValue(flagsBit1_0).concat(_descriptor_11.toValue(flagsHigh_0).concat(_descriptor_13.toValue(sig_0))))))),
            alignment: _descriptor_6.alignment().concat(_descriptor_7.alignment().concat(_descriptor_8.alignment().concat(_descriptor_9.alignment().concat(_descriptor_10.alignment().concat(_descriptor_11.alignment().concat(_descriptor_13.alignment()))))))
          },
          output: undefined,
          publicTranscript: [],
          privateTranscriptOutputs: []
        };
        const result_0 = await this._selfRevoke_0(context,
                                                  partialProofData,
                                                  cfiPubKey_0,
                                                  authData_0,
                                                  challenge_0,
                                                  cdSuffix_0,
                                                  flagsBit1_0,
                                                  flagsHigh_0,
                                                  sig_0);
        partialProofData.output = { value: [], alignment: [] };
        __compactRuntime.finalizeCallProofData(context, partialProofData);
        return { result: result_0, context: context, gasCost: context.callContext.currentGasCost };
      },
      endorseEntry: async (...args_1) => {
        if (args_1.length !== 11) {
          throw new __compactRuntime.CompactError(`endorseEntry: expected 11 arguments (as invoked from Typescript), received ${args_1.length}`);
        }
        const contextOrig_0 = args_1[0];
        const entryHash_0 = args_1[1];
        const studentCommit_0 = args_1[2];
        const attestHash_0 = args_1[3];
        const cfiPubKey_0 = args_1[4];
        const authData_0 = args_1[5];
        const challenge_0 = args_1[6];
        const cdSuffix_0 = args_1[7];
        const flagsBit1_0 = args_1[8];
        const flagsHigh_0 = args_1[9];
        const sig_0 = args_1[10];
        if (!(typeof(contextOrig_0) === 'object' && contextOrig_0.callContext.currentQueryContext != undefined)) {
          __compactRuntime.typeError('endorseEntry',
                                     'argument 1 (as invoked from Typescript)',
                                     'cfi_endorse.compact line 294 char 1',
                                     'CircuitContext',
                                     contextOrig_0)
        }
        if (!(entryHash_0.buffer instanceof ArrayBuffer && entryHash_0.BYTES_PER_ELEMENT === 1 && entryHash_0.length === 32)) {
          __compactRuntime.typeError('endorseEntry',
                                     'argument 1 (argument 2 as invoked from Typescript)',
                                     'cfi_endorse.compact line 294 char 1',
                                     'Bytes<32>',
                                     entryHash_0)
        }
        if (!(studentCommit_0.buffer instanceof ArrayBuffer && studentCommit_0.BYTES_PER_ELEMENT === 1 && studentCommit_0.length === 32)) {
          __compactRuntime.typeError('endorseEntry',
                                     'argument 2 (argument 3 as invoked from Typescript)',
                                     'cfi_endorse.compact line 294 char 1',
                                     'Bytes<32>',
                                     studentCommit_0)
        }
        if (!(attestHash_0.buffer instanceof ArrayBuffer && attestHash_0.BYTES_PER_ELEMENT === 1 && attestHash_0.length === 32)) {
          __compactRuntime.typeError('endorseEntry',
                                     'argument 3 (argument 4 as invoked from Typescript)',
                                     'cfi_endorse.compact line 294 char 1',
                                     'Bytes<32>',
                                     attestHash_0)
        }
        if (!(__compactRuntime.isValidSecp256r1Point(cfiPubKey_0))) {
          __compactRuntime.typeError('endorseEntry',
                                     'argument 4 (argument 5 as invoked from Typescript)',
                                     'cfi_endorse.compact line 294 char 1',
                                     'Secp256r1Point',
                                     cfiPubKey_0)
        }
        if (!(authData_0.buffer instanceof ArrayBuffer && authData_0.BYTES_PER_ELEMENT === 1 && authData_0.length === 37)) {
          __compactRuntime.typeError('endorseEntry',
                                     'argument 5 (argument 6 as invoked from Typescript)',
                                     'cfi_endorse.compact line 294 char 1',
                                     'Bytes<37>',
                                     authData_0)
        }
        if (!(challenge_0.buffer instanceof ArrayBuffer && challenge_0.BYTES_PER_ELEMENT === 1 && challenge_0.length === 43)) {
          __compactRuntime.typeError('endorseEntry',
                                     'argument 6 (argument 7 as invoked from Typescript)',
                                     'cfi_endorse.compact line 294 char 1',
                                     'Bytes<43>',
                                     challenge_0)
        }
        if (!(cdSuffix_0.buffer instanceof ArrayBuffer && cdSuffix_0.BYTES_PER_ELEMENT === 1 && cdSuffix_0.length === 84)) {
          __compactRuntime.typeError('endorseEntry',
                                     'argument 7 (argument 8 as invoked from Typescript)',
                                     'cfi_endorse.compact line 294 char 1',
                                     'Bytes<84>',
                                     cdSuffix_0)
        }
        if (!(typeof(flagsBit1_0) === 'bigint' && flagsBit1_0 >= 0n && flagsBit1_0 <= 1n)) {
          __compactRuntime.typeError('endorseEntry',
                                     'argument 8 (argument 9 as invoked from Typescript)',
                                     'cfi_endorse.compact line 294 char 1',
                                     'Uint<0..2>',
                                     flagsBit1_0)
        }
        if (!(typeof(flagsHigh_0) === 'bigint' && flagsHigh_0 >= 0n && flagsHigh_0 <= 31n)) {
          __compactRuntime.typeError('endorseEntry',
                                     'argument 9 (argument 10 as invoked from Typescript)',
                                     'cfi_endorse.compact line 294 char 1',
                                     'Uint<0..32>',
                                     flagsHigh_0)
        }
        if (!(typeof(sig_0) === 'object' && typeof(sig_0.r) === 'bigint' && sig_0.r >= 0 && sig_0.r <= __compactRuntime.MAX_SECP256R1_SCALAR && typeof(sig_0.s) === 'bigint' && sig_0.s >= 0 && sig_0.s <= __compactRuntime.MAX_SECP256R1_SCALAR)) {
          __compactRuntime.typeError('endorseEntry',
                                     'argument 10 (argument 11 as invoked from Typescript)',
                                     'cfi_endorse.compact line 294 char 1',
                                     'struct Secp256r1EcdsaSignature<r: Secp256r1Scalar, s: Secp256r1Scalar>',
                                     sig_0)
        }
        const context = __compactRuntime.copyCircuitContext(contextOrig_0);
        const partialProofData = {
          input: {
            value: _descriptor_0.toValue(entryHash_0).concat(_descriptor_0.toValue(studentCommit_0).concat(_descriptor_0.toValue(attestHash_0).concat(_descriptor_6.toValue(cfiPubKey_0).concat(_descriptor_7.toValue(authData_0).concat(_descriptor_8.toValue(challenge_0).concat(_descriptor_9.toValue(cdSuffix_0).concat(_descriptor_10.toValue(flagsBit1_0).concat(_descriptor_11.toValue(flagsHigh_0).concat(_descriptor_13.toValue(sig_0)))))))))),
            alignment: _descriptor_0.alignment().concat(_descriptor_0.alignment().concat(_descriptor_0.alignment().concat(_descriptor_6.alignment().concat(_descriptor_7.alignment().concat(_descriptor_8.alignment().concat(_descriptor_9.alignment().concat(_descriptor_10.alignment().concat(_descriptor_11.alignment().concat(_descriptor_13.alignment())))))))))
          },
          output: undefined,
          publicTranscript: [],
          privateTranscriptOutputs: []
        };
        const result_0 = await this._endorseEntry_0(context,
                                                    partialProofData,
                                                    entryHash_0,
                                                    studentCommit_0,
                                                    attestHash_0,
                                                    cfiPubKey_0,
                                                    authData_0,
                                                    challenge_0,
                                                    cdSuffix_0,
                                                    flagsBit1_0,
                                                    flagsHigh_0,
                                                    sig_0);
        partialProofData.output = { value: [], alignment: [] };
        __compactRuntime.finalizeCallProofData(context, partialProofData);
        return { result: result_0, context: context, gasCost: context.callContext.currentGasCost };
      }
    };
    this.impureCircuits = {
      rootOnboardSchool: this.circuits.rootOnboardSchool,
      rootRevokeSchool: this.circuits.rootRevokeSchool,
      rootSetSchoolAdmin: this.circuits.rootSetSchoolAdmin,
      rootSetKey: this.circuits.rootSetKey,
      schoolEnrollCfi: this.circuits.schoolEnrollCfi,
      schoolRevokeCfi: this.circuits.schoolRevokeCfi,
      schoolRotateAdmin: this.circuits.schoolRotateAdmin,
      selfRevoke: this.circuits.selfRevoke,
      endorseEntry: this.circuits.endorseEntry
    };
    this.provableCircuits = {
      rootOnboardSchool: this.circuits.rootOnboardSchool,
      rootRevokeSchool: this.circuits.rootRevokeSchool,
      rootSetSchoolAdmin: this.circuits.rootSetSchoolAdmin,
      rootSetKey: this.circuits.rootSetKey,
      schoolEnrollCfi: this.circuits.schoolEnrollCfi,
      schoolRevokeCfi: this.circuits.schoolRevokeCfi,
      schoolRotateAdmin: this.circuits.schoolRotateAdmin,
      selfRevoke: this.circuits.selfRevoke,
      endorseEntry: this.circuits.endorseEntry
    };
  }
  async initialState(...args_0) {
    if (args_0.length !== 2) {
      throw new __compactRuntime.CompactError(`Contract state constructor: expected 2 arguments (as invoked from Typescript), received ${args_0.length}`);
    }
    const constructorContext_0 = args_0[0];
    const rootKeyId_0 = args_0[1];
    if (typeof(constructorContext_0) !== 'object') {
      throw new __compactRuntime.CompactError(`Contract state constructor: expected 'constructorContext' in argument 1 (as invoked from Typescript) to be an object`);
    }
    if (!('initialZswapLocalState' in constructorContext_0)) {
      throw new __compactRuntime.CompactError(`Contract state constructor: expected 'initialZswapLocalState' in argument 1 (as invoked from Typescript)`);
    }
    if (typeof(constructorContext_0.initialZswapLocalState) !== 'object') {
      throw new __compactRuntime.CompactError(`Contract state constructor: expected 'initialZswapLocalState' in argument 1 (as invoked from Typescript) to be an object`);
    }
    if (!(rootKeyId_0.buffer instanceof ArrayBuffer && rootKeyId_0.BYTES_PER_ELEMENT === 1 && rootKeyId_0.length === 32)) {
      __compactRuntime.typeError('Contract state constructor',
                                 'argument 1 (argument 2 as invoked from Typescript)',
                                 'cfi_endorse.compact line 57 char 1',
                                 'Bytes<32>',
                                 rootKeyId_0)
    }
    const state_0 = new __compactRuntime.ContractState();
    let stateValue_0 = __compactRuntime.StateValue.newArray();
    stateValue_0 = stateValue_0.arrayPush(__compactRuntime.StateValue.newNull());
    stateValue_0 = stateValue_0.arrayPush(__compactRuntime.StateValue.newNull());
    stateValue_0 = stateValue_0.arrayPush(__compactRuntime.StateValue.newNull());
    stateValue_0 = stateValue_0.arrayPush(__compactRuntime.StateValue.newNull());
    stateValue_0 = stateValue_0.arrayPush(__compactRuntime.StateValue.newNull());
    stateValue_0 = stateValue_0.arrayPush(__compactRuntime.StateValue.newNull());
    stateValue_0 = stateValue_0.arrayPush(__compactRuntime.StateValue.newNull());
    stateValue_0 = stateValue_0.arrayPush(__compactRuntime.StateValue.newNull());
    stateValue_0 = stateValue_0.arrayPush(__compactRuntime.StateValue.newNull());
    stateValue_0 = stateValue_0.arrayPush(__compactRuntime.StateValue.newNull());
    state_0.data = new __compactRuntime.ChargedState(stateValue_0);
    state_0.setOperation('rootOnboardSchool', new __compactRuntime.ContractOperation());
    state_0.setOperation('rootRevokeSchool', new __compactRuntime.ContractOperation());
    state_0.setOperation('rootSetSchoolAdmin', new __compactRuntime.ContractOperation());
    state_0.setOperation('rootSetKey', new __compactRuntime.ContractOperation());
    state_0.setOperation('schoolEnrollCfi', new __compactRuntime.ContractOperation());
    state_0.setOperation('schoolRevokeCfi', new __compactRuntime.ContractOperation());
    state_0.setOperation('schoolRotateAdmin', new __compactRuntime.ContractOperation());
    state_0.setOperation('selfRevoke', new __compactRuntime.ContractOperation());
    state_0.setOperation('endorseEntry', new __compactRuntime.ContractOperation());
    const context = __compactRuntime.createCircuitContext({circuitId: 'constructor', contractAddress: __compactRuntime.dummyContractAddress(), coinPublicKeyOrZswapState: constructorContext_0.initialZswapLocalState.coinPublicKey, contractState: state_0.data, privateState: constructorContext_0.initialPrivateState});
    const partialProofData = {
      input: { value: [], alignment: [] },
      output: undefined,
      publicTranscript: [],
      privateTranscriptOutputs: []
    };
    __compactRuntime.queryLedgerState(context,
                                      partialProofData,
                                      [
                                       { push: { storage: false,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_15.toValue(0n),
                                                                                              alignment: _descriptor_15.alignment() }).encode() } },
                                       { push: { storage: true,
                                                 value: __compactRuntime.StateValue.newMap(
                                                          new __compactRuntime.StateMap()
                                                        ).encode() } },
                                       { ins: { cached: false, n: 1 } }]);
    __compactRuntime.queryLedgerState(context,
                                      partialProofData,
                                      [
                                       { push: { storage: false,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_15.toValue(1n),
                                                                                              alignment: _descriptor_15.alignment() }).encode() } },
                                       { push: { storage: true,
                                                 value: __compactRuntime.StateValue.newMap(
                                                          new __compactRuntime.StateMap()
                                                        ).encode() } },
                                       { ins: { cached: false, n: 1 } }]);
    __compactRuntime.queryLedgerState(context,
                                      partialProofData,
                                      [
                                       { push: { storage: false,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_15.toValue(2n),
                                                                                              alignment: _descriptor_15.alignment() }).encode() } },
                                       { push: { storage: true,
                                                 value: __compactRuntime.StateValue.newMap(
                                                          new __compactRuntime.StateMap()
                                                        ).encode() } },
                                       { ins: { cached: false, n: 1 } }]);
    __compactRuntime.queryLedgerState(context,
                                      partialProofData,
                                      [
                                       { push: { storage: false,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_15.toValue(3n),
                                                                                              alignment: _descriptor_15.alignment() }).encode() } },
                                       { push: { storage: true,
                                                 value: __compactRuntime.StateValue.newMap(
                                                          new __compactRuntime.StateMap()
                                                        ).encode() } },
                                       { ins: { cached: false, n: 1 } }]);
    __compactRuntime.queryLedgerState(context,
                                      partialProofData,
                                      [
                                       { push: { storage: false,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_15.toValue(4n),
                                                                                              alignment: _descriptor_15.alignment() }).encode() } },
                                       { push: { storage: true,
                                                 value: __compactRuntime.StateValue.newMap(
                                                          new __compactRuntime.StateMap()
                                                        ).encode() } },
                                       { ins: { cached: false, n: 1 } }]);
    __compactRuntime.queryLedgerState(context,
                                      partialProofData,
                                      [
                                       { push: { storage: false,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_15.toValue(5n),
                                                                                              alignment: _descriptor_15.alignment() }).encode() } },
                                       { push: { storage: true,
                                                 value: __compactRuntime.StateValue.newMap(
                                                          new __compactRuntime.StateMap()
                                                        ).encode() } },
                                       { ins: { cached: false, n: 1 } }]);
    __compactRuntime.queryLedgerState(context,
                                      partialProofData,
                                      [
                                       { push: { storage: false,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_15.toValue(6n),
                                                                                              alignment: _descriptor_15.alignment() }).encode() } },
                                       { push: { storage: true,
                                                 value: __compactRuntime.StateValue.newMap(
                                                          new __compactRuntime.StateMap()
                                                        ).encode() } },
                                       { ins: { cached: false, n: 1 } }]);
    __compactRuntime.queryLedgerState(context,
                                      partialProofData,
                                      [
                                       { push: { storage: false,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_15.toValue(7n),
                                                                                              alignment: _descriptor_15.alignment() }).encode() } },
                                       { push: { storage: true,
                                                 value: __compactRuntime.StateValue.newMap(
                                                          new __compactRuntime.StateMap()
                                                        ).encode() } },
                                       { ins: { cached: false, n: 1 } }]);
    __compactRuntime.queryLedgerState(context,
                                      partialProofData,
                                      [
                                       { push: { storage: false,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_15.toValue(8n),
                                                                                              alignment: _descriptor_15.alignment() }).encode() } },
                                       { push: { storage: true,
                                                 value: __compactRuntime.StateValue.newMap(
                                                          new __compactRuntime.StateMap()
                                                        ).encode() } },
                                       { ins: { cached: false, n: 1 } }]);
    __compactRuntime.queryLedgerState(context,
                                      partialProofData,
                                      [
                                       { push: { storage: false,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_15.toValue(9n),
                                                                                              alignment: _descriptor_15.alignment() }).encode() } },
                                       { push: { storage: true,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_1.toValue(0n),
                                                                                              alignment: _descriptor_1.alignment() }).encode() } },
                                       { ins: { cached: false, n: 1 } }]);
    __compactRuntime.queryLedgerState(context,
                                      partialProofData,
                                      [
                                       { idx: { cached: false,
                                                pushPath: true,
                                                path: [
                                                       { tag: 'value',
                                                         value: { value: _descriptor_15.toValue(0n),
                                                                  alignment: _descriptor_15.alignment() } }] } },
                                       { push: { storage: false,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_0.toValue(rootKeyId_0),
                                                                                              alignment: _descriptor_0.alignment() }).encode() } },
                                       { push: { storage: true,
                                                 value: __compactRuntime.StateValue.newNull().encode() } },
                                       { ins: { cached: false, n: 1 } },
                                       { ins: { cached: true, n: 1 } }]);
    state_0.data = new __compactRuntime.ChargedState(context.callContext.currentQueryContext.state.state);
    return {
      currentContractState: state_0,
      currentPrivateState: context.callContext.currentPrivateState,
      currentZswapLocalState: context.callContext.currentZswapLocalState
    }
  }
  _reverseBytes32_0(b_0) {
    const v_0 = Array.from(b_0, BigInt);
    return Uint8Array.from([v_0[31],
                            v_0[30],
                            v_0[29],
                            v_0[28],
                            v_0[27],
                            v_0[26],
                            v_0[25],
                            v_0[24],
                            v_0[23],
                            v_0[22],
                            v_0[21],
                            v_0[20],
                            v_0[19],
                            v_0[18],
                            v_0[17],
                            v_0[16],
                            v_0[15],
                            v_0[14],
                            v_0[13],
                            v_0[12],
                            v_0[11],
                            v_0[10],
                            v_0[9],
                            v_0[8],
                            v_0[7],
                            v_0[6],
                            v_0[5],
                            v_0[4],
                            v_0[3],
                            v_0[2],
                            v_0[1],
                            v_0[0]],
                           Number);
  }
  _secp256r1EcdsaVerify_0(msgHash_0, sig_0, pk_0) {
    __compactRuntime.assert(!this._equal_0(pk_0,
                                           ({x: 0n, y: 0n, identity: true})),
                            'Secp256r1Point identity is not a permitted secp256r1EcdsaVerify verification key');
    const z_0 = __compactRuntime.convertBytesToField(115792089210356248762697446949407573529996955224135760342422259061068512044368n,
                                                     32,
                                                     this._reverseBytes32_0(msgHash_0),
                                                     'Secp256r1Scalar',
                                                     '<standard library>');
    const __compact_pattern_tmp2_0 = sig_0;
    const r_0 = __compact_pattern_tmp2_0.r;
    const s_0 = __compact_pattern_tmp2_0.s;
    const w_0 = this._inv_0(s_0);
    const u1_0 = __compactRuntime.secp256r1ScalarMul(z_0, w_0);
    const u2_0 = __compactRuntime.secp256r1ScalarMul(r_0, w_0);
    const point_0 = this._ecAdd_0(this._ecMulGenerator_0(u1_0),
                                  this._ecMul_0(pk_0, u2_0));
    return __compactRuntime.convertBytesToField(115792089210356248762697446949407573529996955224135760342422259061068512044368n,
                                                32,
                                                __compactRuntime.convertBigintToBytes(32,
                                                                                      this._secp256r1PointX_0(point_0),
                                                                                      '<standard library>'),
                                                'Secp256r1Scalar',
                                                '<standard library>')
           ===
           r_0;
  }
  _persistentHash_0(value_0) {
    const result_0 = __compactRuntime.persistentHash(_descriptor_24, value_0);
    return result_0;
  }
  _persistentHash_1(value_0) {
    const result_0 = __compactRuntime.persistentHash(_descriptor_25, value_0);
    return result_0;
  }
  _persistentHash_2(value_0) {
    const result_0 = __compactRuntime.persistentHash(_descriptor_22, value_0);
    return result_0;
  }
  _persistentHash_3(value_0) {
    const result_0 = __compactRuntime.persistentHash(_descriptor_23, value_0);
    return result_0;
  }
  _persistentHash_4(value_0) {
    const result_0 = __compactRuntime.persistentHash(_descriptor_0, value_0);
    return result_0;
  }
  _persistentHash_5(value_0) {
    const result_0 = __compactRuntime.persistentHash(_descriptor_21, value_0);
    return result_0;
  }
  _persistentHash_6(value_0) {
    const result_0 = __compactRuntime.persistentHash(_descriptor_18, value_0);
    return result_0;
  }
  _persistentHash_7(value_0) {
    const result_0 = __compactRuntime.persistentHash(_descriptor_19, value_0);
    return result_0;
  }
  _inv_0(s_0) {
    const result_0 = __compactRuntime.secp256r1ScalarInv(s_0);
    return result_0;
  }
  _secp256r1PointX_0(pt_0) {
    const result_0 = __compactRuntime.secp256r1PointX(pt_0);
    return result_0;
  }
  _secp256r1PointY_0(pt_0) {
    const result_0 = __compactRuntime.secp256r1PointY(pt_0);
    return result_0;
  }
  _ecAdd_0(a_0, b_0) {
    const result_0 = __compactRuntime.secp256r1Add(a_0, b_0);
    return result_0;
  }
  _ecMul_0(a_0, b_0) {
    const result_0 = __compactRuntime.secp256r1Mul(a_0, b_0);
    return result_0;
  }
  _ecMulGenerator_0(b_0) {
    const result_0 = __compactRuntime.secp256r1MulGenerator(b_0);
    return result_0;
  }
  _keyIdOf_0(pk_0) {
    return this._persistentHash_0([__compactRuntime.convertBigintToBytes(32,
                                                                         this._secp256r1PointX_0(pk_0),
                                                                         'cfi_endorse.compact line 65 char 8'),
                                   __compactRuntime.convertBigintToBytes(32,
                                                                         this._secp256r1PointY_0(pk_0),
                                                                         'cfi_endorse.compact line 65 char 42')]);
  }
  _rootDigest_0(contractAddr_0, op_0, a_0, b_0) {
    return this._persistentHash_2([new Uint8Array([112, 105, 108, 111, 116, 108, 111, 103, 58, 99, 102, 105, 45, 114, 111, 111, 116, 58, 118, 49, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]),
                                   contractAddr_0,
                                   op_0,
                                   a_0,
                                   b_0]);
  }
  _schoolDigest_0(contractAddr_0, op_0, schoolId_0, a_0, b_0) {
    return this._persistentHash_1([new Uint8Array([112, 105, 108, 111, 116, 108, 111, 103, 58, 99, 102, 105, 45, 115, 99, 104, 111, 111, 108, 58, 118, 49, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]),
                                   contractAddr_0,
                                   op_0,
                                   schoolId_0,
                                   a_0,
                                   b_0]);
  }
  _endorseDigest_0(contractAddr_0, entryHash_0, studentCommit_0, attestHash_0) {
    return this._persistentHash_2([new Uint8Array([112, 105, 108, 111, 116, 108, 111, 103, 58, 99, 102, 105, 45, 101, 110, 100, 111, 114, 115, 101, 58, 118, 50, 0, 0, 0, 0, 0, 0, 0, 0, 0]),
                                   contractAddr_0,
                                   entryHash_0,
                                   studentCommit_0,
                                   attestHash_0]);
  }
  _revokeDigest_0(contractAddr_0, keyId_0) {
    return this._persistentHash_3([new Uint8Array([112, 105, 108, 111, 116, 108, 111, 103, 58, 99, 102, 105, 45, 114, 101, 118, 111, 107, 101, 58, 118, 49, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]),
                                   contractAddr_0,
                                   keyId_0]);
  }
  _endorsementKey_0(entryHash_0, keyId_0) {
    return this._persistentHash_3([new Uint8Array([112, 105, 108, 111, 116, 108, 111, 103, 58, 99, 102, 105, 45, 101, 110, 100, 111, 114, 115, 101, 109, 101, 110, 116, 58, 118, 49, 0, 0, 0, 0, 0]),
                                   entryHash_0,
                                   keyId_0]);
  }
  async _assertRoot_0(context, partialProofData, op_0, a_0, b_0, rootPk_0, sig_0)
  {
    let tmp_0;
    __compactRuntime.assert((tmp_0 = this._keyIdOf_0(rootPk_0),
                             _descriptor_2.fromValue(__compactRuntime.queryLedgerState(context,
                                                                                       partialProofData,
                                                                                       [
                                                                                        { dup: { n: 0 } },
                                                                                        { idx: { cached: false,
                                                                                                 pushPath: false,
                                                                                                 path: [
                                                                                                        { tag: 'value',
                                                                                                          value: { value: _descriptor_15.toValue(0n),
                                                                                                                   alignment: _descriptor_15.alignment() } }] } },
                                                                                        { push: { storage: false,
                                                                                                  value: __compactRuntime.StateValue.newCell({ value: _descriptor_0.toValue(tmp_0),
                                                                                                                                               alignment: _descriptor_0.alignment() }).encode() } },
                                                                                        'member',
                                                                                        { popeq: { cached: true,
                                                                                                   result: undefined } }]).value)),
                            'not a root key');
    __compactRuntime.assert(sig_0.r !== 0n, 'zero ECDSA r');
    __compactRuntime.assert(sig_0.s !== 0n, 'zero ECDSA s');
    const d_0 = this._rootDigest_0(_descriptor_3.fromValue(__compactRuntime.queryLedgerState(context,
                                                                                             partialProofData,
                                                                                             [
                                                                                              { dup: { n: 2 } },
                                                                                              { idx: { cached: true,
                                                                                                       pushPath: false,
                                                                                                       path: [
                                                                                                              { tag: 'value',
                                                                                                                value: { value: _descriptor_15.toValue(0n),
                                                                                                                         alignment: _descriptor_15.alignment() } }] } },
                                                                                              { popeq: { cached: true,
                                                                                                         result: undefined } }]).value).bytes,
                                   op_0,
                                   a_0,
                                   b_0);
    __compactRuntime.assert(this._secp256r1EcdsaVerify_0(this._persistentHash_4(d_0),
                                                         sig_0,
                                                         rootPk_0),
                            'root signature invalid');
    return [];
  }
  _b64urlIndex_0(c_0) {
    if (c_0 === 95n) {
      return 63n;
    } else {
      if (c_0 >= 97n) {
        __compactRuntime.assert(c_0 <= 122n, 'bad b64url char');
        return __compactRuntime.subField(c_0, 71n);
      } else {
        if (c_0 >= 65n) {
          __compactRuntime.assert(c_0 <= 90n, 'bad b64url char');
          return __compactRuntime.subField(c_0, 65n);
        } else {
          if (c_0 >= 48n) {
            __compactRuntime.assert(c_0 <= 57n, 'bad b64url char');
            return __compactRuntime.addField(c_0, 4n);
          } else {
            __compactRuntime.assert(c_0 === 45n, 'bad b64url char'); return 62n;
          }
        }
      }
    }
  }
  _assertChallengeIsB64url_0(h_0, chal_0) {
    const hb_0 = Array.from(h_0, BigInt);
    const cb_0 = Array.from(chal_0, BigInt);
    this._folder_0(((t_0, g_0) =>
                    {
                      const bytes_0 = __compactRuntime.addField(__compactRuntime.addField(__compactRuntime.mulField(hb_0[3n
                                                                                                                         *
                                                                                                                         g_0],
                                                                                                                    65536n),
                                                                                          __compactRuntime.mulField(hb_0[3n
                                                                                                                         *
                                                                                                                         g_0
                                                                                                                         +
                                                                                                                         1n],
                                                                                                                    256n)),
                                                                hb_0[3n * g_0
                                                                     +
                                                                     2n]);
                      const sixes_0 = __compactRuntime.addField(__compactRuntime.addField(__compactRuntime.addField(__compactRuntime.mulField(this._b64urlIndex_0(cb_0[4n
                                                                                                                                                                       *
                                                                                                                                                                       g_0]),
                                                                                                                                              262144n),
                                                                                                                    __compactRuntime.mulField(this._b64urlIndex_0(cb_0[4n
                                                                                                                                                                       *
                                                                                                                                                                       g_0
                                                                                                                                                                       +
                                                                                                                                                                       1n]),
                                                                                                                                              4096n)),
                                                                                          __compactRuntime.mulField(this._b64urlIndex_0(cb_0[4n
                                                                                                                                             *
                                                                                                                                             g_0
                                                                                                                                             +
                                                                                                                                             2n]),
                                                                                                                    64n)),
                                                                this._b64urlIndex_0(cb_0[4n
                                                                                         *
                                                                                         g_0
                                                                                         +
                                                                                         3n]));
                      __compactRuntime.assert(bytes_0 === sixes_0,
                                              'challenge != base64url(digest)');
                      return t_0;
                    }),
                   [],
                   [0n, 1n, 2n, 3n, 4n, 5n, 6n, 7n, 8n, 9n]);
    const tail_0 = __compactRuntime.addField(__compactRuntime.mulField(hb_0[30],
                                                                       1024n),
                                             __compactRuntime.mulField(hb_0[31],
                                                                       4n));
    const tailSixes_0 = __compactRuntime.addField(__compactRuntime.addField(__compactRuntime.mulField(this._b64urlIndex_0(cb_0[40]),
                                                                                                      4096n),
                                                                            __compactRuntime.mulField(this._b64urlIndex_0(cb_0[41]),
                                                                                                      64n)),
                                                  this._b64urlIndex_0(cb_0[42]));
    __compactRuntime.assert(tail_0 === tailSixes_0,
                            'challenge != base64url(digest) (tail)');
    return [];
  }
  _verifyPasskey_0(digest_0,
                   pk_0,
                   authData_0,
                   challenge_0,
                   cdSuffix_0,
                   flagsBit1_0,
                   flagsHigh_0,
                   sig_0)
  {
    this._assertChallengeIsB64url_0(digest_0, challenge_0);
    __compactRuntime.assert(this._equal_1(cdSuffix_0,
                                          new Uint8Array([34, 44, 34, 111, 114, 105, 103, 105, 110, 34, 58, 34, 104, 116, 116, 112, 115, 58, 47, 47, 99, 102, 105, 45, 112, 97, 115, 115, 107, 101, 121, 45, 115, 116, 97, 103, 105, 110, 103, 45, 115, 116, 97, 103, 105, 110, 103, 46, 117, 112, 46, 114, 97, 105, 108, 119, 97, 121, 46, 97, 112, 112, 34, 44, 34, 99, 114, 111, 115, 115, 79, 114, 105, 103, 105, 110, 34, 58, 102, 97, 108, 115, 101, 125])),
                            'unsupported clientDataJSON (origin/crossOrigin/profile)');
    const clientDataHash_0 = this._persistentHash_5([new Uint8Array([123, 34, 116, 121, 112, 101, 34, 58, 34, 119, 101, 98, 97, 117, 116, 104, 110, 46, 103, 101, 116, 34, 44, 34, 99, 104, 97, 108, 108, 101, 110, 103, 101, 34, 58, 34]),
                                                     challenge_0,
                                                     cdSuffix_0]);
    const ad_0 = Array.from(authData_0, BigInt);
    const rv_0 = Array.from(this._persistentHash_6(new Uint8Array([99, 102, 105, 45, 112, 97, 115, 115, 107, 101, 121, 45, 115, 116, 97, 103, 105, 110, 103, 45, 115, 116, 97, 103, 105, 110, 103, 46, 117, 112, 46, 114, 97, 105, 108, 119, 97, 121, 46, 97, 112, 112])),
                            BigInt);
    this._folder_1(((t_0, i_0) =>
                    {
                      __compactRuntime.assert(ad_0[i_0] === rv_0[i_0],
                                              'rpIdHash mismatch');
                      return t_0;
                    }),
                   [],
                   [0n,
                    1n,
                    2n,
                    3n,
                    4n,
                    5n,
                    6n,
                    7n,
                    8n,
                    9n,
                    10n,
                    11n,
                    12n,
                    13n,
                    14n,
                    15n,
                    16n,
                    17n,
                    18n,
                    19n,
                    20n,
                    21n,
                    22n,
                    23n,
                    24n,
                    25n,
                    26n,
                    27n,
                    28n,
                    29n,
                    30n,
                    31n]);
    __compactRuntime.assert(ad_0[32]
                            ===
                            __compactRuntime.addField(__compactRuntime.addField(__compactRuntime.addField(1n,
                                                                                                          __compactRuntime.mulField(2n,
                                                                                                                                    flagsBit1_0)),
                                                                                4n),
                                                      __compactRuntime.mulField(8n,
                                                                                flagsHigh_0)),
                            'authenticator flags must include UP and UV');
    __compactRuntime.assert(sig_0.r !== 0n, 'zero ECDSA r');
    __compactRuntime.assert(sig_0.s !== 0n, 'zero ECDSA s');
    const msgHash_0 = this._persistentHash_7([authData_0, clientDataHash_0]);
    __compactRuntime.assert(this._secp256r1EcdsaVerify_0(msgHash_0, sig_0, pk_0),
                            'passkey signature invalid');
    return [];
  }
  async _assertSchoolAdmin_0(context,
                             partialProofData,
                             op_0,
                             schoolId_0,
                             a_0,
                             b_0,
                             adminPk_0,
                             authData_0,
                             challenge_0,
                             cdSuffix_0,
                             flagsBit1_0,
                             flagsHigh_0,
                             sig_0)
  {
    this._verifyPasskey_0(this._schoolDigest_0(_descriptor_3.fromValue(__compactRuntime.queryLedgerState(context,
                                                                                                         partialProofData,
                                                                                                         [
                                                                                                          { dup: { n: 2 } },
                                                                                                          { idx: { cached: true,
                                                                                                                   pushPath: false,
                                                                                                                   path: [
                                                                                                                          { tag: 'value',
                                                                                                                            value: { value: _descriptor_15.toValue(0n),
                                                                                                                                     alignment: _descriptor_15.alignment() } }] } },
                                                                                                          { popeq: { cached: true,
                                                                                                                     result: undefined } }]).value).bytes,
                                               op_0,
                                               schoolId_0,
                                               a_0,
                                               b_0),
                          adminPk_0,
                          authData_0,
                          challenge_0,
                          cdSuffix_0,
                          flagsBit1_0,
                          flagsHigh_0,
                          sig_0);
    const s_0 = schoolId_0;
    __compactRuntime.assert(_descriptor_2.fromValue(__compactRuntime.queryLedgerState(context,
                                                                                      partialProofData,
                                                                                      [
                                                                                       { dup: { n: 0 } },
                                                                                       { idx: { cached: false,
                                                                                                pushPath: false,
                                                                                                path: [
                                                                                                       { tag: 'value',
                                                                                                         value: { value: _descriptor_15.toValue(2n),
                                                                                                                  alignment: _descriptor_15.alignment() } }] } },
                                                                                       { push: { storage: false,
                                                                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_0.toValue(s_0),
                                                                                                                                              alignment: _descriptor_0.alignment() }).encode() } },
                                                                                       'member',
                                                                                       { popeq: { cached: true,
                                                                                                  result: undefined } }]).value),
                            'unknown school');
    __compactRuntime.assert(!_descriptor_2.fromValue(__compactRuntime.queryLedgerState(context,
                                                                                       partialProofData,
                                                                                       [
                                                                                        { dup: { n: 0 } },
                                                                                        { idx: { cached: false,
                                                                                                 pushPath: false,
                                                                                                 path: [
                                                                                                        { tag: 'value',
                                                                                                          value: { value: _descriptor_15.toValue(5n),
                                                                                                                   alignment: _descriptor_15.alignment() } }] } },
                                                                                        { push: { storage: false,
                                                                                                  value: __compactRuntime.StateValue.newCell({ value: _descriptor_0.toValue(s_0),
                                                                                                                                               alignment: _descriptor_0.alignment() }).encode() } },
                                                                                        'member',
                                                                                        { popeq: { cached: true,
                                                                                                   result: undefined } }]).value),
                            'school revoked');
    __compactRuntime.assert(this._equal_2(_descriptor_0.fromValue(__compactRuntime.queryLedgerState(context,
                                                                                                    partialProofData,
                                                                                                    [
                                                                                                     { dup: { n: 0 } },
                                                                                                     { idx: { cached: false,
                                                                                                              pushPath: false,
                                                                                                              path: [
                                                                                                                     { tag: 'value',
                                                                                                                       value: { value: _descriptor_15.toValue(2n),
                                                                                                                                alignment: _descriptor_15.alignment() } }] } },
                                                                                                     { idx: { cached: false,
                                                                                                              pushPath: false,
                                                                                                              path: [
                                                                                                                     { tag: 'value',
                                                                                                                       value: { value: _descriptor_0.toValue(s_0),
                                                                                                                                alignment: _descriptor_0.alignment() } }] } },
                                                                                                     { popeq: { cached: false,
                                                                                                                result: undefined } }]).value),
                                          this._keyIdOf_0(adminPk_0)),
                            "not this school's admin");
    return [];
  }
  async _rootOnboardSchool_0(context,
                             partialProofData,
                             schoolId_0,
                             adminKeyId_0,
                             rootPk_0,
                             sig_0)
  {
    await this._assertRoot_0(context,
                             partialProofData,
                             new Uint8Array([111, 110, 98, 111, 97, 114, 100, 45, 115, 99, 104, 111, 111, 108, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]),
                             schoolId_0,
                             adminKeyId_0,
                             rootPk_0,
                             sig_0);
    const s_0 = schoolId_0;
    const k_0 = adminKeyId_0;
    __compactRuntime.assert(!_descriptor_2.fromValue(__compactRuntime.queryLedgerState(context,
                                                                                       partialProofData,
                                                                                       [
                                                                                        { dup: { n: 0 } },
                                                                                        { idx: { cached: false,
                                                                                                 pushPath: false,
                                                                                                 path: [
                                                                                                        { tag: 'value',
                                                                                                          value: { value: _descriptor_15.toValue(2n),
                                                                                                                   alignment: _descriptor_15.alignment() } }] } },
                                                                                        { push: { storage: false,
                                                                                                  value: __compactRuntime.StateValue.newCell({ value: _descriptor_0.toValue(s_0),
                                                                                                                                               alignment: _descriptor_0.alignment() }).encode() } },
                                                                                        'member',
                                                                                        { popeq: { cached: true,
                                                                                                   result: undefined } }]).value),
                            'school already onboarded');
    __compactRuntime.assert(!_descriptor_2.fromValue(__compactRuntime.queryLedgerState(context,
                                                                                       partialProofData,
                                                                                       [
                                                                                        { dup: { n: 0 } },
                                                                                        { idx: { cached: false,
                                                                                                 pushPath: false,
                                                                                                 path: [
                                                                                                        { tag: 'value',
                                                                                                          value: { value: _descriptor_15.toValue(5n),
                                                                                                                   alignment: _descriptor_15.alignment() } }] } },
                                                                                        { push: { storage: false,
                                                                                                  value: __compactRuntime.StateValue.newCell({ value: _descriptor_0.toValue(s_0),
                                                                                                                                               alignment: _descriptor_0.alignment() }).encode() } },
                                                                                        'member',
                                                                                        { popeq: { cached: true,
                                                                                                   result: undefined } }]).value),
                            'revoked school ids cannot be reused');
    __compactRuntime.assert(!_descriptor_2.fromValue(__compactRuntime.queryLedgerState(context,
                                                                                       partialProofData,
                                                                                       [
                                                                                        { dup: { n: 0 } },
                                                                                        { idx: { cached: false,
                                                                                                 pushPath: false,
                                                                                                 path: [
                                                                                                        { tag: 'value',
                                                                                                          value: { value: _descriptor_15.toValue(3n),
                                                                                                                   alignment: _descriptor_15.alignment() } }] } },
                                                                                        { push: { storage: false,
                                                                                                  value: __compactRuntime.StateValue.newCell({ value: _descriptor_0.toValue(k_0),
                                                                                                                                               alignment: _descriptor_0.alignment() }).encode() } },
                                                                                        'member',
                                                                                        { popeq: { cached: true,
                                                                                                   result: undefined } }]).value),
                            'admin key already serves a school');
    __compactRuntime.assert(!_descriptor_2.fromValue(__compactRuntime.queryLedgerState(context,
                                                                                       partialProofData,
                                                                                       [
                                                                                        { dup: { n: 0 } },
                                                                                        { idx: { cached: false,
                                                                                                 pushPath: false,
                                                                                                 path: [
                                                                                                        { tag: 'value',
                                                                                                          value: { value: _descriptor_15.toValue(4n),
                                                                                                                   alignment: _descriptor_15.alignment() } }] } },
                                                                                        { push: { storage: false,
                                                                                                  value: __compactRuntime.StateValue.newCell({ value: _descriptor_0.toValue(k_0),
                                                                                                                                               alignment: _descriptor_0.alignment() }).encode() } },
                                                                                        'member',
                                                                                        { popeq: { cached: true,
                                                                                                   result: undefined } }]).value),
                            'retired admin keys cannot be reused');
    __compactRuntime.queryLedgerState(context,
                                      partialProofData,
                                      [
                                       { idx: { cached: false,
                                                pushPath: true,
                                                path: [
                                                       { tag: 'value',
                                                         value: { value: _descriptor_15.toValue(2n),
                                                                  alignment: _descriptor_15.alignment() } }] } },
                                       { push: { storage: false,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_0.toValue(s_0),
                                                                                              alignment: _descriptor_0.alignment() }).encode() } },
                                       { push: { storage: true,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_0.toValue(k_0),
                                                                                              alignment: _descriptor_0.alignment() }).encode() } },
                                       { ins: { cached: false, n: 1 } },
                                       { ins: { cached: true, n: 1 } }]);
    __compactRuntime.queryLedgerState(context,
                                      partialProofData,
                                      [
                                       { idx: { cached: false,
                                                pushPath: true,
                                                path: [
                                                       { tag: 'value',
                                                         value: { value: _descriptor_15.toValue(3n),
                                                                  alignment: _descriptor_15.alignment() } }] } },
                                       { push: { storage: false,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_0.toValue(k_0),
                                                                                              alignment: _descriptor_0.alignment() }).encode() } },
                                       { push: { storage: true,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_0.toValue(s_0),
                                                                                              alignment: _descriptor_0.alignment() }).encode() } },
                                       { ins: { cached: false, n: 1 } },
                                       { ins: { cached: true, n: 1 } }]);
    return [];
  }
  async _rootRevokeSchool_0(context,
                            partialProofData,
                            schoolId_0,
                            rootPk_0,
                            sig_0)
  {
    await this._assertRoot_0(context,
                             partialProofData,
                             new Uint8Array([114, 101, 118, 111, 107, 101, 45, 115, 99, 104, 111, 111, 108, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]),
                             schoolId_0,
                             new Uint8Array(32),
                             rootPk_0,
                             sig_0);
    const s_0 = schoolId_0;
    __compactRuntime.assert(_descriptor_2.fromValue(__compactRuntime.queryLedgerState(context,
                                                                                      partialProofData,
                                                                                      [
                                                                                       { dup: { n: 0 } },
                                                                                       { idx: { cached: false,
                                                                                                pushPath: false,
                                                                                                path: [
                                                                                                       { tag: 'value',
                                                                                                         value: { value: _descriptor_15.toValue(2n),
                                                                                                                  alignment: _descriptor_15.alignment() } }] } },
                                                                                       { push: { storage: false,
                                                                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_0.toValue(s_0),
                                                                                                                                              alignment: _descriptor_0.alignment() }).encode() } },
                                                                                       'member',
                                                                                       { popeq: { cached: true,
                                                                                                  result: undefined } }]).value),
                            'unknown school');
    __compactRuntime.assert(!_descriptor_2.fromValue(__compactRuntime.queryLedgerState(context,
                                                                                       partialProofData,
                                                                                       [
                                                                                        { dup: { n: 0 } },
                                                                                        { idx: { cached: false,
                                                                                                 pushPath: false,
                                                                                                 path: [
                                                                                                        { tag: 'value',
                                                                                                          value: { value: _descriptor_15.toValue(5n),
                                                                                                                   alignment: _descriptor_15.alignment() } }] } },
                                                                                        { push: { storage: false,
                                                                                                  value: __compactRuntime.StateValue.newCell({ value: _descriptor_0.toValue(s_0),
                                                                                                                                               alignment: _descriptor_0.alignment() }).encode() } },
                                                                                        'member',
                                                                                        { popeq: { cached: true,
                                                                                                   result: undefined } }]).value),
                            'school already revoked');
    const tmp_0 = _descriptor_1.fromValue(__compactRuntime.queryLedgerState(context,
                                                                            partialProofData,
                                                                            [
                                                                             { dup: { n: 0 } },
                                                                             { idx: { cached: false,
                                                                                      pushPath: false,
                                                                                      path: [
                                                                                             { tag: 'value',
                                                                                               value: { value: _descriptor_15.toValue(9n),
                                                                                                        alignment: _descriptor_15.alignment() } }] } },
                                                                             { popeq: { cached: true,
                                                                                        result: undefined } }]).value);
    __compactRuntime.queryLedgerState(context,
                                      partialProofData,
                                      [
                                       { idx: { cached: false,
                                                pushPath: true,
                                                path: [
                                                       { tag: 'value',
                                                         value: { value: _descriptor_15.toValue(5n),
                                                                  alignment: _descriptor_15.alignment() } }] } },
                                       { push: { storage: false,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_0.toValue(s_0),
                                                                                              alignment: _descriptor_0.alignment() }).encode() } },
                                       { push: { storage: true,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_1.toValue(tmp_0),
                                                                                              alignment: _descriptor_1.alignment() }).encode() } },
                                       { ins: { cached: false, n: 1 } },
                                       { ins: { cached: true, n: 1 } }]);
    const tmp_1 = 1n;
    __compactRuntime.queryLedgerState(context,
                                      partialProofData,
                                      [
                                       { idx: { cached: false,
                                                pushPath: true,
                                                path: [
                                                       { tag: 'value',
                                                         value: { value: _descriptor_15.toValue(9n),
                                                                  alignment: _descriptor_15.alignment() } }] } },
                                       { addi: { immediate: parseInt(__compactRuntime.valueToBigInt(
                                                              { value: _descriptor_5.toValue(tmp_1),
                                                                alignment: _descriptor_5.alignment() }
                                                                .value
                                                            )) } },
                                       { ins: { cached: true, n: 1 } }]);
    return [];
  }
  async _rootSetSchoolAdmin_0(context,
                              partialProofData,
                              schoolId_0,
                              newAdminKeyId_0,
                              rootPk_0,
                              sig_0)
  {
    await this._assertRoot_0(context,
                             partialProofData,
                             new Uint8Array([115, 101, 116, 45, 115, 99, 104, 111, 111, 108, 45, 97, 100, 109, 105, 110, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]),
                             schoolId_0,
                             newAdminKeyId_0,
                             rootPk_0,
                             sig_0);
    const s_0 = schoolId_0;
    const k_0 = newAdminKeyId_0;
    __compactRuntime.assert(_descriptor_2.fromValue(__compactRuntime.queryLedgerState(context,
                                                                                      partialProofData,
                                                                                      [
                                                                                       { dup: { n: 0 } },
                                                                                       { idx: { cached: false,
                                                                                                pushPath: false,
                                                                                                path: [
                                                                                                       { tag: 'value',
                                                                                                         value: { value: _descriptor_15.toValue(2n),
                                                                                                                  alignment: _descriptor_15.alignment() } }] } },
                                                                                       { push: { storage: false,
                                                                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_0.toValue(s_0),
                                                                                                                                              alignment: _descriptor_0.alignment() }).encode() } },
                                                                                       'member',
                                                                                       { popeq: { cached: true,
                                                                                                  result: undefined } }]).value),
                            'unknown school');
    __compactRuntime.assert(!_descriptor_2.fromValue(__compactRuntime.queryLedgerState(context,
                                                                                       partialProofData,
                                                                                       [
                                                                                        { dup: { n: 0 } },
                                                                                        { idx: { cached: false,
                                                                                                 pushPath: false,
                                                                                                 path: [
                                                                                                        { tag: 'value',
                                                                                                          value: { value: _descriptor_15.toValue(5n),
                                                                                                                   alignment: _descriptor_15.alignment() } }] } },
                                                                                        { push: { storage: false,
                                                                                                  value: __compactRuntime.StateValue.newCell({ value: _descriptor_0.toValue(s_0),
                                                                                                                                               alignment: _descriptor_0.alignment() }).encode() } },
                                                                                        'member',
                                                                                        { popeq: { cached: true,
                                                                                                   result: undefined } }]).value),
                            'school revoked');
    __compactRuntime.assert(!_descriptor_2.fromValue(__compactRuntime.queryLedgerState(context,
                                                                                       partialProofData,
                                                                                       [
                                                                                        { dup: { n: 0 } },
                                                                                        { idx: { cached: false,
                                                                                                 pushPath: false,
                                                                                                 path: [
                                                                                                        { tag: 'value',
                                                                                                          value: { value: _descriptor_15.toValue(3n),
                                                                                                                   alignment: _descriptor_15.alignment() } }] } },
                                                                                        { push: { storage: false,
                                                                                                  value: __compactRuntime.StateValue.newCell({ value: _descriptor_0.toValue(k_0),
                                                                                                                                               alignment: _descriptor_0.alignment() }).encode() } },
                                                                                        'member',
                                                                                        { popeq: { cached: true,
                                                                                                   result: undefined } }]).value),
                            'admin key already serves a school');
    __compactRuntime.assert(!_descriptor_2.fromValue(__compactRuntime.queryLedgerState(context,
                                                                                       partialProofData,
                                                                                       [
                                                                                        { dup: { n: 0 } },
                                                                                        { idx: { cached: false,
                                                                                                 pushPath: false,
                                                                                                 path: [
                                                                                                        { tag: 'value',
                                                                                                          value: { value: _descriptor_15.toValue(4n),
                                                                                                                   alignment: _descriptor_15.alignment() } }] } },
                                                                                        { push: { storage: false,
                                                                                                  value: __compactRuntime.StateValue.newCell({ value: _descriptor_0.toValue(k_0),
                                                                                                                                               alignment: _descriptor_0.alignment() }).encode() } },
                                                                                        'member',
                                                                                        { popeq: { cached: true,
                                                                                                   result: undefined } }]).value),
                            'retired admin keys cannot be reused');
    const old_0 = _descriptor_0.fromValue(__compactRuntime.queryLedgerState(context,
                                                                            partialProofData,
                                                                            [
                                                                             { dup: { n: 0 } },
                                                                             { idx: { cached: false,
                                                                                      pushPath: false,
                                                                                      path: [
                                                                                             { tag: 'value',
                                                                                               value: { value: _descriptor_15.toValue(2n),
                                                                                                        alignment: _descriptor_15.alignment() } }] } },
                                                                             { idx: { cached: false,
                                                                                      pushPath: false,
                                                                                      path: [
                                                                                             { tag: 'value',
                                                                                               value: { value: _descriptor_0.toValue(s_0),
                                                                                                        alignment: _descriptor_0.alignment() } }] } },
                                                                             { popeq: { cached: false,
                                                                                        result: undefined } }]).value);
    __compactRuntime.queryLedgerState(context,
                                      partialProofData,
                                      [
                                       { idx: { cached: false,
                                                pushPath: true,
                                                path: [
                                                       { tag: 'value',
                                                         value: { value: _descriptor_15.toValue(4n),
                                                                  alignment: _descriptor_15.alignment() } }] } },
                                       { push: { storage: false,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_0.toValue(old_0),
                                                                                              alignment: _descriptor_0.alignment() }).encode() } },
                                       { push: { storage: true,
                                                 value: __compactRuntime.StateValue.newNull().encode() } },
                                       { ins: { cached: false, n: 1 } },
                                       { ins: { cached: true, n: 1 } }]);
    __compactRuntime.queryLedgerState(context,
                                      partialProofData,
                                      [
                                       { idx: { cached: false,
                                                pushPath: true,
                                                path: [
                                                       { tag: 'value',
                                                         value: { value: _descriptor_15.toValue(3n),
                                                                  alignment: _descriptor_15.alignment() } }] } },
                                       { push: { storage: false,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_0.toValue(old_0),
                                                                                              alignment: _descriptor_0.alignment() }).encode() } },
                                       { rem: { cached: false } },
                                       { ins: { cached: true, n: 1 } }]);
    __compactRuntime.queryLedgerState(context,
                                      partialProofData,
                                      [
                                       { idx: { cached: false,
                                                pushPath: true,
                                                path: [
                                                       { tag: 'value',
                                                         value: { value: _descriptor_15.toValue(2n),
                                                                  alignment: _descriptor_15.alignment() } }] } },
                                       { push: { storage: false,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_0.toValue(s_0),
                                                                                              alignment: _descriptor_0.alignment() }).encode() } },
                                       { push: { storage: true,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_0.toValue(k_0),
                                                                                              alignment: _descriptor_0.alignment() }).encode() } },
                                       { ins: { cached: false, n: 1 } },
                                       { ins: { cached: true, n: 1 } }]);
    __compactRuntime.queryLedgerState(context,
                                      partialProofData,
                                      [
                                       { idx: { cached: false,
                                                pushPath: true,
                                                path: [
                                                       { tag: 'value',
                                                         value: { value: _descriptor_15.toValue(3n),
                                                                  alignment: _descriptor_15.alignment() } }] } },
                                       { push: { storage: false,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_0.toValue(k_0),
                                                                                              alignment: _descriptor_0.alignment() }).encode() } },
                                       { push: { storage: true,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_0.toValue(s_0),
                                                                                              alignment: _descriptor_0.alignment() }).encode() } },
                                       { ins: { cached: false, n: 1 } },
                                       { ins: { cached: true, n: 1 } }]);
    return [];
  }
  async _rootSetKey_0(context,
                      partialProofData,
                      keyId_0,
                      active_0,
                      rootPk_0,
                      sig_0)
  {
    const add_0 = active_0;
    await this._assertRoot_0(context,
                             partialProofData,
                             add_0 ?
                             new Uint8Array([97, 100, 100, 45, 114, 111, 111, 116, 45, 107, 101, 121, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0])
                             :
                             new Uint8Array([114, 101, 109, 111, 118, 101, 45, 114, 111, 111, 116, 45, 107, 101, 121, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]),
                             keyId_0,
                             new Uint8Array(32),
                             rootPk_0,
                             sig_0);
    const k_0 = keyId_0;
    if (add_0) {
      __compactRuntime.assert(!_descriptor_2.fromValue(__compactRuntime.queryLedgerState(context,
                                                                                         partialProofData,
                                                                                         [
                                                                                          { dup: { n: 0 } },
                                                                                          { idx: { cached: false,
                                                                                                   pushPath: false,
                                                                                                   path: [
                                                                                                          { tag: 'value',
                                                                                                            value: { value: _descriptor_15.toValue(0n),
                                                                                                                     alignment: _descriptor_15.alignment() } }] } },
                                                                                          { push: { storage: false,
                                                                                                    value: __compactRuntime.StateValue.newCell({ value: _descriptor_0.toValue(k_0),
                                                                                                                                                 alignment: _descriptor_0.alignment() }).encode() } },
                                                                                          'member',
                                                                                          { popeq: { cached: true,
                                                                                                     result: undefined } }]).value),
                              'already a root key');
      __compactRuntime.assert(!_descriptor_2.fromValue(__compactRuntime.queryLedgerState(context,
                                                                                         partialProofData,
                                                                                         [
                                                                                          { dup: { n: 0 } },
                                                                                          { idx: { cached: false,
                                                                                                   pushPath: false,
                                                                                                   path: [
                                                                                                          { tag: 'value',
                                                                                                            value: { value: _descriptor_15.toValue(1n),
                                                                                                                     alignment: _descriptor_15.alignment() } }] } },
                                                                                          { push: { storage: false,
                                                                                                    value: __compactRuntime.StateValue.newCell({ value: _descriptor_0.toValue(k_0),
                                                                                                                                                 alignment: _descriptor_0.alignment() }).encode() } },
                                                                                          'member',
                                                                                          { popeq: { cached: true,
                                                                                                     result: undefined } }]).value),
                              'retired root keys cannot be re-added');
      __compactRuntime.queryLedgerState(context,
                                        partialProofData,
                                        [
                                         { idx: { cached: false,
                                                  pushPath: true,
                                                  path: [
                                                         { tag: 'value',
                                                           value: { value: _descriptor_15.toValue(0n),
                                                                    alignment: _descriptor_15.alignment() } }] } },
                                         { push: { storage: false,
                                                   value: __compactRuntime.StateValue.newCell({ value: _descriptor_0.toValue(k_0),
                                                                                                alignment: _descriptor_0.alignment() }).encode() } },
                                         { push: { storage: true,
                                                   value: __compactRuntime.StateValue.newNull().encode() } },
                                         { ins: { cached: false, n: 1 } },
                                         { ins: { cached: true, n: 1 } }]);
    } else {
      __compactRuntime.assert(_descriptor_2.fromValue(__compactRuntime.queryLedgerState(context,
                                                                                        partialProofData,
                                                                                        [
                                                                                         { dup: { n: 0 } },
                                                                                         { idx: { cached: false,
                                                                                                  pushPath: false,
                                                                                                  path: [
                                                                                                         { tag: 'value',
                                                                                                           value: { value: _descriptor_15.toValue(0n),
                                                                                                                    alignment: _descriptor_15.alignment() } }] } },
                                                                                         { push: { storage: false,
                                                                                                   value: __compactRuntime.StateValue.newCell({ value: _descriptor_0.toValue(k_0),
                                                                                                                                                alignment: _descriptor_0.alignment() }).encode() } },
                                                                                         'member',
                                                                                         { popeq: { cached: true,
                                                                                                    result: undefined } }]).value),
                              'not a root key');
      let t_0;
      __compactRuntime.assert((t_0 = _descriptor_1.fromValue(__compactRuntime.queryLedgerState(context,
                                                                                               partialProofData,
                                                                                               [
                                                                                                { dup: { n: 0 } },
                                                                                                { idx: { cached: false,
                                                                                                         pushPath: false,
                                                                                                         path: [
                                                                                                                { tag: 'value',
                                                                                                                  value: { value: _descriptor_15.toValue(0n),
                                                                                                                           alignment: _descriptor_15.alignment() } }] } },
                                                                                                'size',
                                                                                                { popeq: { cached: true,
                                                                                                           result: undefined } }]).value),
                               t_0 > 1n),
                              'cannot remove the last root key');
      __compactRuntime.queryLedgerState(context,
                                        partialProofData,
                                        [
                                         { idx: { cached: false,
                                                  pushPath: true,
                                                  path: [
                                                         { tag: 'value',
                                                           value: { value: _descriptor_15.toValue(0n),
                                                                    alignment: _descriptor_15.alignment() } }] } },
                                         { push: { storage: false,
                                                   value: __compactRuntime.StateValue.newCell({ value: _descriptor_0.toValue(k_0),
                                                                                                alignment: _descriptor_0.alignment() }).encode() } },
                                         { rem: { cached: false } },
                                         { ins: { cached: true, n: 1 } }]);
      __compactRuntime.queryLedgerState(context,
                                        partialProofData,
                                        [
                                         { idx: { cached: false,
                                                  pushPath: true,
                                                  path: [
                                                         { tag: 'value',
                                                           value: { value: _descriptor_15.toValue(1n),
                                                                    alignment: _descriptor_15.alignment() } }] } },
                                         { push: { storage: false,
                                                   value: __compactRuntime.StateValue.newCell({ value: _descriptor_0.toValue(k_0),
                                                                                                alignment: _descriptor_0.alignment() }).encode() } },
                                         { push: { storage: true,
                                                   value: __compactRuntime.StateValue.newNull().encode() } },
                                         { ins: { cached: false, n: 1 } },
                                         { ins: { cached: true, n: 1 } }]);
    }
    return [];
  }
  async _schoolEnrollCfi_0(context,
                           partialProofData,
                           schoolId_0,
                           cfiKeyId_0,
                           cfiRef_0,
                           adminPk_0,
                           authData_0,
                           challenge_0,
                           cdSuffix_0,
                           flagsBit1_0,
                           flagsHigh_0,
                           sig_0)
  {
    await this._assertSchoolAdmin_0(context,
                                    partialProofData,
                                    new Uint8Array([101, 110, 114, 111, 108, 108, 45, 99, 102, 105, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]),
                                    schoolId_0,
                                    cfiKeyId_0,
                                    cfiRef_0,
                                    adminPk_0,
                                    authData_0,
                                    challenge_0,
                                    cdSuffix_0,
                                    flagsBit1_0,
                                    flagsHigh_0,
                                    sig_0);
    const k_0 = cfiKeyId_0;
    __compactRuntime.assert(!_descriptor_2.fromValue(__compactRuntime.queryLedgerState(context,
                                                                                       partialProofData,
                                                                                       [
                                                                                        { dup: { n: 0 } },
                                                                                        { idx: { cached: false,
                                                                                                 pushPath: false,
                                                                                                 path: [
                                                                                                        { tag: 'value',
                                                                                                          value: { value: _descriptor_15.toValue(7n),
                                                                                                                   alignment: _descriptor_15.alignment() } }] } },
                                                                                        { push: { storage: false,
                                                                                                  value: __compactRuntime.StateValue.newCell({ value: _descriptor_0.toValue(k_0),
                                                                                                                                               alignment: _descriptor_0.alignment() }).encode() } },
                                                                                        'member',
                                                                                        { popeq: { cached: true,
                                                                                                   result: undefined } }]).value),
                            'revoked keys cannot be re-enrolled');
    __compactRuntime.assert(!_descriptor_2.fromValue(__compactRuntime.queryLedgerState(context,
                                                                                       partialProofData,
                                                                                       [
                                                                                        { dup: { n: 0 } },
                                                                                        { idx: { cached: false,
                                                                                                 pushPath: false,
                                                                                                 path: [
                                                                                                        { tag: 'value',
                                                                                                          value: { value: _descriptor_15.toValue(6n),
                                                                                                                   alignment: _descriptor_15.alignment() } }] } },
                                                                                        { push: { storage: false,
                                                                                                  value: __compactRuntime.StateValue.newCell({ value: _descriptor_0.toValue(k_0),
                                                                                                                                               alignment: _descriptor_0.alignment() }).encode() } },
                                                                                        'member',
                                                                                        { popeq: { cached: true,
                                                                                                   result: undefined } }]).value),
                            'key already enrolled');
    const tmp_0 = { cfiRef: cfiRef_0, schoolId: schoolId_0 };
    __compactRuntime.queryLedgerState(context,
                                      partialProofData,
                                      [
                                       { idx: { cached: false,
                                                pushPath: true,
                                                path: [
                                                       { tag: 'value',
                                                         value: { value: _descriptor_15.toValue(6n),
                                                                  alignment: _descriptor_15.alignment() } }] } },
                                       { push: { storage: false,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_0.toValue(k_0),
                                                                                              alignment: _descriptor_0.alignment() }).encode() } },
                                       { push: { storage: true,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_4.toValue(tmp_0),
                                                                                              alignment: _descriptor_4.alignment() }).encode() } },
                                       { ins: { cached: false, n: 1 } },
                                       { ins: { cached: true, n: 1 } }]);
    return [];
  }
  async _schoolRevokeCfi_0(context,
                           partialProofData,
                           schoolId_0,
                           cfiKeyId_0,
                           adminPk_0,
                           authData_0,
                           challenge_0,
                           cdSuffix_0,
                           flagsBit1_0,
                           flagsHigh_0,
                           sig_0)
  {
    await this._assertSchoolAdmin_0(context,
                                    partialProofData,
                                    new Uint8Array([114, 101, 118, 111, 107, 101, 45, 99, 102, 105, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]),
                                    schoolId_0,
                                    cfiKeyId_0,
                                    new Uint8Array(32),
                                    adminPk_0,
                                    authData_0,
                                    challenge_0,
                                    cdSuffix_0,
                                    flagsBit1_0,
                                    flagsHigh_0,
                                    sig_0);
    const k_0 = cfiKeyId_0;
    __compactRuntime.assert(_descriptor_2.fromValue(__compactRuntime.queryLedgerState(context,
                                                                                      partialProofData,
                                                                                      [
                                                                                       { dup: { n: 0 } },
                                                                                       { idx: { cached: false,
                                                                                                pushPath: false,
                                                                                                path: [
                                                                                                       { tag: 'value',
                                                                                                         value: { value: _descriptor_15.toValue(6n),
                                                                                                                  alignment: _descriptor_15.alignment() } }] } },
                                                                                       { push: { storage: false,
                                                                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_0.toValue(k_0),
                                                                                                                                              alignment: _descriptor_0.alignment() }).encode() } },
                                                                                       'member',
                                                                                       { popeq: { cached: true,
                                                                                                  result: undefined } }]).value),
                            'key not enrolled');
    __compactRuntime.assert(this._equal_3(_descriptor_4.fromValue(__compactRuntime.queryLedgerState(context,
                                                                                                    partialProofData,
                                                                                                    [
                                                                                                     { dup: { n: 0 } },
                                                                                                     { idx: { cached: false,
                                                                                                              pushPath: false,
                                                                                                              path: [
                                                                                                                     { tag: 'value',
                                                                                                                       value: { value: _descriptor_15.toValue(6n),
                                                                                                                                alignment: _descriptor_15.alignment() } }] } },
                                                                                                     { idx: { cached: false,
                                                                                                              pushPath: false,
                                                                                                              path: [
                                                                                                                     { tag: 'value',
                                                                                                                       value: { value: _descriptor_0.toValue(k_0),
                                                                                                                                alignment: _descriptor_0.alignment() } }] } },
                                                                                                     { popeq: { cached: false,
                                                                                                                result: undefined } }]).value).schoolId,
                                          schoolId_0),
                            'CFI belongs to another school');
    __compactRuntime.assert(!_descriptor_2.fromValue(__compactRuntime.queryLedgerState(context,
                                                                                       partialProofData,
                                                                                       [
                                                                                        { dup: { n: 0 } },
                                                                                        { idx: { cached: false,
                                                                                                 pushPath: false,
                                                                                                 path: [
                                                                                                        { tag: 'value',
                                                                                                          value: { value: _descriptor_15.toValue(7n),
                                                                                                                   alignment: _descriptor_15.alignment() } }] } },
                                                                                        { push: { storage: false,
                                                                                                  value: __compactRuntime.StateValue.newCell({ value: _descriptor_0.toValue(k_0),
                                                                                                                                               alignment: _descriptor_0.alignment() }).encode() } },
                                                                                        'member',
                                                                                        { popeq: { cached: true,
                                                                                                   result: undefined } }]).value),
                            'key already revoked');
    const tmp_0 = _descriptor_1.fromValue(__compactRuntime.queryLedgerState(context,
                                                                            partialProofData,
                                                                            [
                                                                             { dup: { n: 0 } },
                                                                             { idx: { cached: false,
                                                                                      pushPath: false,
                                                                                      path: [
                                                                                             { tag: 'value',
                                                                                               value: { value: _descriptor_15.toValue(9n),
                                                                                                        alignment: _descriptor_15.alignment() } }] } },
                                                                             { popeq: { cached: true,
                                                                                        result: undefined } }]).value);
    __compactRuntime.queryLedgerState(context,
                                      partialProofData,
                                      [
                                       { idx: { cached: false,
                                                pushPath: true,
                                                path: [
                                                       { tag: 'value',
                                                         value: { value: _descriptor_15.toValue(7n),
                                                                  alignment: _descriptor_15.alignment() } }] } },
                                       { push: { storage: false,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_0.toValue(k_0),
                                                                                              alignment: _descriptor_0.alignment() }).encode() } },
                                       { push: { storage: true,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_1.toValue(tmp_0),
                                                                                              alignment: _descriptor_1.alignment() }).encode() } },
                                       { ins: { cached: false, n: 1 } },
                                       { ins: { cached: true, n: 1 } }]);
    const tmp_1 = 1n;
    __compactRuntime.queryLedgerState(context,
                                      partialProofData,
                                      [
                                       { idx: { cached: false,
                                                pushPath: true,
                                                path: [
                                                       { tag: 'value',
                                                         value: { value: _descriptor_15.toValue(9n),
                                                                  alignment: _descriptor_15.alignment() } }] } },
                                       { addi: { immediate: parseInt(__compactRuntime.valueToBigInt(
                                                              { value: _descriptor_5.toValue(tmp_1),
                                                                alignment: _descriptor_5.alignment() }
                                                                .value
                                                            )) } },
                                       { ins: { cached: true, n: 1 } }]);
    return [];
  }
  async _schoolRotateAdmin_0(context,
                             partialProofData,
                             schoolId_0,
                             newAdminKeyId_0,
                             adminPk_0,
                             authData_0,
                             challenge_0,
                             cdSuffix_0,
                             flagsBit1_0,
                             flagsHigh_0,
                             sig_0)
  {
    await this._assertSchoolAdmin_0(context,
                                    partialProofData,
                                    new Uint8Array([114, 111, 116, 97, 116, 101, 45, 97, 100, 109, 105, 110, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]),
                                    schoolId_0,
                                    newAdminKeyId_0,
                                    new Uint8Array(32),
                                    adminPk_0,
                                    authData_0,
                                    challenge_0,
                                    cdSuffix_0,
                                    flagsBit1_0,
                                    flagsHigh_0,
                                    sig_0);
    const s_0 = schoolId_0;
    const k_0 = newAdminKeyId_0;
    __compactRuntime.assert(!_descriptor_2.fromValue(__compactRuntime.queryLedgerState(context,
                                                                                       partialProofData,
                                                                                       [
                                                                                        { dup: { n: 0 } },
                                                                                        { idx: { cached: false,
                                                                                                 pushPath: false,
                                                                                                 path: [
                                                                                                        { tag: 'value',
                                                                                                          value: { value: _descriptor_15.toValue(3n),
                                                                                                                   alignment: _descriptor_15.alignment() } }] } },
                                                                                        { push: { storage: false,
                                                                                                  value: __compactRuntime.StateValue.newCell({ value: _descriptor_0.toValue(k_0),
                                                                                                                                               alignment: _descriptor_0.alignment() }).encode() } },
                                                                                        'member',
                                                                                        { popeq: { cached: true,
                                                                                                   result: undefined } }]).value),
                            'admin key already serves a school');
    __compactRuntime.assert(!_descriptor_2.fromValue(__compactRuntime.queryLedgerState(context,
                                                                                       partialProofData,
                                                                                       [
                                                                                        { dup: { n: 0 } },
                                                                                        { idx: { cached: false,
                                                                                                 pushPath: false,
                                                                                                 path: [
                                                                                                        { tag: 'value',
                                                                                                          value: { value: _descriptor_15.toValue(4n),
                                                                                                                   alignment: _descriptor_15.alignment() } }] } },
                                                                                        { push: { storage: false,
                                                                                                  value: __compactRuntime.StateValue.newCell({ value: _descriptor_0.toValue(k_0),
                                                                                                                                               alignment: _descriptor_0.alignment() }).encode() } },
                                                                                        'member',
                                                                                        { popeq: { cached: true,
                                                                                                   result: undefined } }]).value),
                            'retired admin keys cannot be reused');
    const old_0 = _descriptor_0.fromValue(__compactRuntime.queryLedgerState(context,
                                                                            partialProofData,
                                                                            [
                                                                             { dup: { n: 0 } },
                                                                             { idx: { cached: false,
                                                                                      pushPath: false,
                                                                                      path: [
                                                                                             { tag: 'value',
                                                                                               value: { value: _descriptor_15.toValue(2n),
                                                                                                        alignment: _descriptor_15.alignment() } }] } },
                                                                             { idx: { cached: false,
                                                                                      pushPath: false,
                                                                                      path: [
                                                                                             { tag: 'value',
                                                                                               value: { value: _descriptor_0.toValue(s_0),
                                                                                                        alignment: _descriptor_0.alignment() } }] } },
                                                                             { popeq: { cached: false,
                                                                                        result: undefined } }]).value);
    __compactRuntime.queryLedgerState(context,
                                      partialProofData,
                                      [
                                       { idx: { cached: false,
                                                pushPath: true,
                                                path: [
                                                       { tag: 'value',
                                                         value: { value: _descriptor_15.toValue(4n),
                                                                  alignment: _descriptor_15.alignment() } }] } },
                                       { push: { storage: false,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_0.toValue(old_0),
                                                                                              alignment: _descriptor_0.alignment() }).encode() } },
                                       { push: { storage: true,
                                                 value: __compactRuntime.StateValue.newNull().encode() } },
                                       { ins: { cached: false, n: 1 } },
                                       { ins: { cached: true, n: 1 } }]);
    __compactRuntime.queryLedgerState(context,
                                      partialProofData,
                                      [
                                       { idx: { cached: false,
                                                pushPath: true,
                                                path: [
                                                       { tag: 'value',
                                                         value: { value: _descriptor_15.toValue(3n),
                                                                  alignment: _descriptor_15.alignment() } }] } },
                                       { push: { storage: false,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_0.toValue(old_0),
                                                                                              alignment: _descriptor_0.alignment() }).encode() } },
                                       { rem: { cached: false } },
                                       { ins: { cached: true, n: 1 } }]);
    __compactRuntime.queryLedgerState(context,
                                      partialProofData,
                                      [
                                       { idx: { cached: false,
                                                pushPath: true,
                                                path: [
                                                       { tag: 'value',
                                                         value: { value: _descriptor_15.toValue(2n),
                                                                  alignment: _descriptor_15.alignment() } }] } },
                                       { push: { storage: false,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_0.toValue(s_0),
                                                                                              alignment: _descriptor_0.alignment() }).encode() } },
                                       { push: { storage: true,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_0.toValue(k_0),
                                                                                              alignment: _descriptor_0.alignment() }).encode() } },
                                       { ins: { cached: false, n: 1 } },
                                       { ins: { cached: true, n: 1 } }]);
    __compactRuntime.queryLedgerState(context,
                                      partialProofData,
                                      [
                                       { idx: { cached: false,
                                                pushPath: true,
                                                path: [
                                                       { tag: 'value',
                                                         value: { value: _descriptor_15.toValue(3n),
                                                                  alignment: _descriptor_15.alignment() } }] } },
                                       { push: { storage: false,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_0.toValue(k_0),
                                                                                              alignment: _descriptor_0.alignment() }).encode() } },
                                       { push: { storage: true,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_0.toValue(s_0),
                                                                                              alignment: _descriptor_0.alignment() }).encode() } },
                                       { ins: { cached: false, n: 1 } },
                                       { ins: { cached: true, n: 1 } }]);
    return [];
  }
  async _selfRevoke_0(context,
                      partialProofData,
                      cfiPubKey_0,
                      authData_0,
                      challenge_0,
                      cdSuffix_0,
                      flagsBit1_0,
                      flagsHigh_0,
                      sig_0)
  {
    const k_0 = this._keyIdOf_0(cfiPubKey_0);
    this._verifyPasskey_0(this._revokeDigest_0(_descriptor_3.fromValue(__compactRuntime.queryLedgerState(context,
                                                                                                         partialProofData,
                                                                                                         [
                                                                                                          { dup: { n: 2 } },
                                                                                                          { idx: { cached: true,
                                                                                                                   pushPath: false,
                                                                                                                   path: [
                                                                                                                          { tag: 'value',
                                                                                                                            value: { value: _descriptor_15.toValue(0n),
                                                                                                                                     alignment: _descriptor_15.alignment() } }] } },
                                                                                                          { popeq: { cached: true,
                                                                                                                     result: undefined } }]).value).bytes,
                                               k_0),
                          cfiPubKey_0,
                          authData_0,
                          challenge_0,
                          cdSuffix_0,
                          flagsBit1_0,
                          flagsHigh_0,
                          sig_0);
    __compactRuntime.assert(_descriptor_2.fromValue(__compactRuntime.queryLedgerState(context,
                                                                                      partialProofData,
                                                                                      [
                                                                                       { dup: { n: 0 } },
                                                                                       { idx: { cached: false,
                                                                                                pushPath: false,
                                                                                                path: [
                                                                                                       { tag: 'value',
                                                                                                         value: { value: _descriptor_15.toValue(6n),
                                                                                                                  alignment: _descriptor_15.alignment() } }] } },
                                                                                       { push: { storage: false,
                                                                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_0.toValue(k_0),
                                                                                                                                              alignment: _descriptor_0.alignment() }).encode() } },
                                                                                       'member',
                                                                                       { popeq: { cached: true,
                                                                                                  result: undefined } }]).value),
                            'key not enrolled');
    __compactRuntime.assert(!_descriptor_2.fromValue(__compactRuntime.queryLedgerState(context,
                                                                                       partialProofData,
                                                                                       [
                                                                                        { dup: { n: 0 } },
                                                                                        { idx: { cached: false,
                                                                                                 pushPath: false,
                                                                                                 path: [
                                                                                                        { tag: 'value',
                                                                                                          value: { value: _descriptor_15.toValue(7n),
                                                                                                                   alignment: _descriptor_15.alignment() } }] } },
                                                                                        { push: { storage: false,
                                                                                                  value: __compactRuntime.StateValue.newCell({ value: _descriptor_0.toValue(k_0),
                                                                                                                                               alignment: _descriptor_0.alignment() }).encode() } },
                                                                                        'member',
                                                                                        { popeq: { cached: true,
                                                                                                   result: undefined } }]).value),
                            'key already revoked');
    const tmp_0 = _descriptor_1.fromValue(__compactRuntime.queryLedgerState(context,
                                                                            partialProofData,
                                                                            [
                                                                             { dup: { n: 0 } },
                                                                             { idx: { cached: false,
                                                                                      pushPath: false,
                                                                                      path: [
                                                                                             { tag: 'value',
                                                                                               value: { value: _descriptor_15.toValue(9n),
                                                                                                        alignment: _descriptor_15.alignment() } }] } },
                                                                             { popeq: { cached: true,
                                                                                        result: undefined } }]).value);
    __compactRuntime.queryLedgerState(context,
                                      partialProofData,
                                      [
                                       { idx: { cached: false,
                                                pushPath: true,
                                                path: [
                                                       { tag: 'value',
                                                         value: { value: _descriptor_15.toValue(7n),
                                                                  alignment: _descriptor_15.alignment() } }] } },
                                       { push: { storage: false,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_0.toValue(k_0),
                                                                                              alignment: _descriptor_0.alignment() }).encode() } },
                                       { push: { storage: true,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_1.toValue(tmp_0),
                                                                                              alignment: _descriptor_1.alignment() }).encode() } },
                                       { ins: { cached: false, n: 1 } },
                                       { ins: { cached: true, n: 1 } }]);
    const tmp_1 = 1n;
    __compactRuntime.queryLedgerState(context,
                                      partialProofData,
                                      [
                                       { idx: { cached: false,
                                                pushPath: true,
                                                path: [
                                                       { tag: 'value',
                                                         value: { value: _descriptor_15.toValue(9n),
                                                                  alignment: _descriptor_15.alignment() } }] } },
                                       { addi: { immediate: parseInt(__compactRuntime.valueToBigInt(
                                                              { value: _descriptor_5.toValue(tmp_1),
                                                                alignment: _descriptor_5.alignment() }
                                                                .value
                                                            )) } },
                                       { ins: { cached: true, n: 1 } }]);
    return [];
  }
  async _endorseEntry_0(context,
                        partialProofData,
                        entryHash_0,
                        studentCommit_0,
                        attestHash_0,
                        cfiPubKey_0,
                        authData_0,
                        challenge_0,
                        cdSuffix_0,
                        flagsBit1_0,
                        flagsHigh_0,
                        sig_0)
  {
    const e_0 = entryHash_0;
    const sc_0 = studentCommit_0;
    const k_0 = this._keyIdOf_0(cfiPubKey_0);
    this._verifyPasskey_0(this._endorseDigest_0(_descriptor_3.fromValue(__compactRuntime.queryLedgerState(context,
                                                                                                          partialProofData,
                                                                                                          [
                                                                                                           { dup: { n: 2 } },
                                                                                                           { idx: { cached: true,
                                                                                                                    pushPath: false,
                                                                                                                    path: [
                                                                                                                           { tag: 'value',
                                                                                                                             value: { value: _descriptor_15.toValue(0n),
                                                                                                                                      alignment: _descriptor_15.alignment() } }] } },
                                                                                                           { popeq: { cached: true,
                                                                                                                      result: undefined } }]).value).bytes,
                                                e_0,
                                                sc_0,
                                                attestHash_0),
                          cfiPubKey_0,
                          authData_0,
                          challenge_0,
                          cdSuffix_0,
                          flagsBit1_0,
                          flagsHigh_0,
                          sig_0);
    __compactRuntime.assert(_descriptor_2.fromValue(__compactRuntime.queryLedgerState(context,
                                                                                      partialProofData,
                                                                                      [
                                                                                       { dup: { n: 0 } },
                                                                                       { idx: { cached: false,
                                                                                                pushPath: false,
                                                                                                path: [
                                                                                                       { tag: 'value',
                                                                                                         value: { value: _descriptor_15.toValue(6n),
                                                                                                                  alignment: _descriptor_15.alignment() } }] } },
                                                                                       { push: { storage: false,
                                                                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_0.toValue(k_0),
                                                                                                                                              alignment: _descriptor_0.alignment() }).encode() } },
                                                                                       'member',
                                                                                       { popeq: { cached: true,
                                                                                                  result: undefined } }]).value),
                            'CFI key not enrolled');
    __compactRuntime.assert(!_descriptor_2.fromValue(__compactRuntime.queryLedgerState(context,
                                                                                       partialProofData,
                                                                                       [
                                                                                        { dup: { n: 0 } },
                                                                                        { idx: { cached: false,
                                                                                                 pushPath: false,
                                                                                                 path: [
                                                                                                        { tag: 'value',
                                                                                                          value: { value: _descriptor_15.toValue(7n),
                                                                                                                   alignment: _descriptor_15.alignment() } }] } },
                                                                                        { push: { storage: false,
                                                                                                  value: __compactRuntime.StateValue.newCell({ value: _descriptor_0.toValue(k_0),
                                                                                                                                               alignment: _descriptor_0.alignment() }).encode() } },
                                                                                        'member',
                                                                                        { popeq: { cached: true,
                                                                                                   result: undefined } }]).value),
                            'CFI key revoked');
    const s_0 = _descriptor_4.fromValue(__compactRuntime.queryLedgerState(context,
                                                                          partialProofData,
                                                                          [
                                                                           { dup: { n: 0 } },
                                                                           { idx: { cached: false,
                                                                                    pushPath: false,
                                                                                    path: [
                                                                                           { tag: 'value',
                                                                                             value: { value: _descriptor_15.toValue(6n),
                                                                                                      alignment: _descriptor_15.alignment() } }] } },
                                                                           { idx: { cached: false,
                                                                                    pushPath: false,
                                                                                    path: [
                                                                                           { tag: 'value',
                                                                                             value: { value: _descriptor_0.toValue(k_0),
                                                                                                      alignment: _descriptor_0.alignment() } }] } },
                                                                           { popeq: { cached: false,
                                                                                      result: undefined } }]).value).schoolId;
    __compactRuntime.assert(!_descriptor_2.fromValue(__compactRuntime.queryLedgerState(context,
                                                                                       partialProofData,
                                                                                       [
                                                                                        { dup: { n: 0 } },
                                                                                        { idx: { cached: false,
                                                                                                 pushPath: false,
                                                                                                 path: [
                                                                                                        { tag: 'value',
                                                                                                          value: { value: _descriptor_15.toValue(5n),
                                                                                                                   alignment: _descriptor_15.alignment() } }] } },
                                                                                        { push: { storage: false,
                                                                                                  value: __compactRuntime.StateValue.newCell({ value: _descriptor_0.toValue(s_0),
                                                                                                                                               alignment: _descriptor_0.alignment() }).encode() } },
                                                                                        'member',
                                                                                        { popeq: { cached: true,
                                                                                                   result: undefined } }]).value),
                            "CFI's school revoked");
    const ek_0 = this._endorsementKey_0(e_0, k_0);
    __compactRuntime.assert(!_descriptor_2.fromValue(__compactRuntime.queryLedgerState(context,
                                                                                       partialProofData,
                                                                                       [
                                                                                        { dup: { n: 0 } },
                                                                                        { idx: { cached: false,
                                                                                                 pushPath: false,
                                                                                                 path: [
                                                                                                        { tag: 'value',
                                                                                                          value: { value: _descriptor_15.toValue(8n),
                                                                                                                   alignment: _descriptor_15.alignment() } }] } },
                                                                                        { push: { storage: false,
                                                                                                  value: __compactRuntime.StateValue.newCell({ value: _descriptor_0.toValue(ek_0),
                                                                                                                                               alignment: _descriptor_0.alignment() }).encode() } },
                                                                                        'member',
                                                                                        { popeq: { cached: true,
                                                                                                   result: undefined } }]).value),
                            'entry already endorsed by this CFI');
    const tmp_0 = { entryHash: e_0,
                    keyId: k_0,
                    schoolId: s_0,
                    studentCommit: sc_0,
                    seq:
                      _descriptor_1.fromValue(__compactRuntime.queryLedgerState(context,
                                                                                partialProofData,
                                                                                [
                                                                                 { dup: { n: 0 } },
                                                                                 { idx: { cached: false,
                                                                                          pushPath: false,
                                                                                          path: [
                                                                                                 { tag: 'value',
                                                                                                   value: { value: _descriptor_15.toValue(9n),
                                                                                                            alignment: _descriptor_15.alignment() } }] } },
                                                                                 { popeq: { cached: true,
                                                                                            result: undefined } }]).value) };
    __compactRuntime.queryLedgerState(context,
                                      partialProofData,
                                      [
                                       { idx: { cached: false,
                                                pushPath: true,
                                                path: [
                                                       { tag: 'value',
                                                         value: { value: _descriptor_15.toValue(8n),
                                                                  alignment: _descriptor_15.alignment() } }] } },
                                       { push: { storage: false,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_0.toValue(ek_0),
                                                                                              alignment: _descriptor_0.alignment() }).encode() } },
                                       { push: { storage: true,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_14.toValue(tmp_0),
                                                                                              alignment: _descriptor_14.alignment() }).encode() } },
                                       { ins: { cached: false, n: 1 } },
                                       { ins: { cached: true, n: 1 } }]);
    const tmp_1 = 1n;
    __compactRuntime.queryLedgerState(context,
                                      partialProofData,
                                      [
                                       { idx: { cached: false,
                                                pushPath: true,
                                                path: [
                                                       { tag: 'value',
                                                         value: { value: _descriptor_15.toValue(9n),
                                                                  alignment: _descriptor_15.alignment() } }] } },
                                       { addi: { immediate: parseInt(__compactRuntime.valueToBigInt(
                                                              { value: _descriptor_5.toValue(tmp_1),
                                                                alignment: _descriptor_5.alignment() }
                                                                .value
                                                            )) } },
                                       { ins: { cached: true, n: 1 } }]);
    return [];
  }
  _equal_0(x0, y0) {
    if (x0.identity) { return y0.identity; }
    if (y0.identity || x0.x != y0.x || x0.y != y0.y) {
      return false;
    }
    return true;
  }
  _folder_0(f, x, a0) {
    for (let i = 0; i < 10; i++) { x = f(x, a0[i]); }
    return x;
  }
  _equal_1(x0, y0) {
    if (!x0.every((x, i) => y0[i] === x)) { return false; }
    return true;
  }
  _folder_1(f, x, a0) {
    for (let i = 0; i < 32; i++) { x = f(x, a0[i]); }
    return x;
  }
  _equal_2(x0, y0) {
    if (!x0.every((x, i) => y0[i] === x)) { return false; }
    return true;
  }
  _equal_3(x0, y0) {
    if (!x0.every((x, i) => y0[i] === x)) { return false; }
    return true;
  }
}
export function ledger(stateOrChargedState) {
  const state = stateOrChargedState instanceof __compactRuntime.StateValue ? stateOrChargedState : stateOrChargedState.state;
  const chargedState = stateOrChargedState instanceof __compactRuntime.StateValue ? new __compactRuntime.ChargedState(stateOrChargedState) : stateOrChargedState;
  const context = {
    callContext: { currentQueryContext: new __compactRuntime.QueryContext(chargedState, __compactRuntime.dummyContractAddress()), currentGasCost: __compactRuntime.emptyRunningCost() },
    costModel: __compactRuntime.CostModel.initialCostModel()
  };
  const partialProofData = {
    input: { value: [], alignment: [] },
    output: undefined,
    publicTranscript: [],
    privateTranscriptOutputs: []
  };
  return {
    rootKeys: {
      isEmpty(...args_0) {
        if (args_0.length !== 0) {
          throw new __compactRuntime.CompactError(`isEmpty: expected 0 arguments, received ${args_0.length}`);
        }
        return _descriptor_2.fromValue(__compactRuntime.queryLedgerState(context,
                                                                         partialProofData,
                                                                         [
                                                                          { dup: { n: 0 } },
                                                                          { idx: { cached: false,
                                                                                   pushPath: false,
                                                                                   path: [
                                                                                          { tag: 'value',
                                                                                            value: { value: _descriptor_15.toValue(0n),
                                                                                                     alignment: _descriptor_15.alignment() } }] } },
                                                                          'size',
                                                                          { push: { storage: false,
                                                                                    value: __compactRuntime.StateValue.newCell({ value: _descriptor_1.toValue(0n),
                                                                                                                                 alignment: _descriptor_1.alignment() }).encode() } },
                                                                          'eq',
                                                                          { popeq: { cached: true,
                                                                                     result: undefined } }]).value);
      },
      size(...args_0) {
        if (args_0.length !== 0) {
          throw new __compactRuntime.CompactError(`size: expected 0 arguments, received ${args_0.length}`);
        }
        return _descriptor_1.fromValue(__compactRuntime.queryLedgerState(context,
                                                                         partialProofData,
                                                                         [
                                                                          { dup: { n: 0 } },
                                                                          { idx: { cached: false,
                                                                                   pushPath: false,
                                                                                   path: [
                                                                                          { tag: 'value',
                                                                                            value: { value: _descriptor_15.toValue(0n),
                                                                                                     alignment: _descriptor_15.alignment() } }] } },
                                                                          'size',
                                                                          { popeq: { cached: true,
                                                                                     result: undefined } }]).value);
      },
      member(...args_0) {
        if (args_0.length !== 1) {
          throw new __compactRuntime.CompactError(`member: expected 1 argument, received ${args_0.length}`);
        }
        const elem_0 = args_0[0];
        if (!(elem_0.buffer instanceof ArrayBuffer && elem_0.BYTES_PER_ELEMENT === 1 && elem_0.length === 32)) {
          __compactRuntime.typeError('member',
                                     'argument 1',
                                     'cfi_endorse.compact line 46 char 1',
                                     'Bytes<32>',
                                     elem_0)
        }
        return _descriptor_2.fromValue(__compactRuntime.queryLedgerState(context,
                                                                         partialProofData,
                                                                         [
                                                                          { dup: { n: 0 } },
                                                                          { idx: { cached: false,
                                                                                   pushPath: false,
                                                                                   path: [
                                                                                          { tag: 'value',
                                                                                            value: { value: _descriptor_15.toValue(0n),
                                                                                                     alignment: _descriptor_15.alignment() } }] } },
                                                                          { push: { storage: false,
                                                                                    value: __compactRuntime.StateValue.newCell({ value: _descriptor_0.toValue(elem_0),
                                                                                                                                 alignment: _descriptor_0.alignment() }).encode() } },
                                                                          'member',
                                                                          { popeq: { cached: true,
                                                                                     result: undefined } }]).value);
      },
      [Symbol.iterator](...args_0) {
        if (args_0.length !== 0) {
          throw new __compactRuntime.CompactError(`iter: expected 0 arguments, received ${args_0.length}`);
        }
        const self_0 = state.asArray()[0];
        return self_0.asMap().keys().map((elem) => _descriptor_0.fromValue(elem.value))[Symbol.iterator]();
      }
    },
    retiredRootKeys: {
      isEmpty(...args_0) {
        if (args_0.length !== 0) {
          throw new __compactRuntime.CompactError(`isEmpty: expected 0 arguments, received ${args_0.length}`);
        }
        return _descriptor_2.fromValue(__compactRuntime.queryLedgerState(context,
                                                                         partialProofData,
                                                                         [
                                                                          { dup: { n: 0 } },
                                                                          { idx: { cached: false,
                                                                                   pushPath: false,
                                                                                   path: [
                                                                                          { tag: 'value',
                                                                                            value: { value: _descriptor_15.toValue(1n),
                                                                                                     alignment: _descriptor_15.alignment() } }] } },
                                                                          'size',
                                                                          { push: { storage: false,
                                                                                    value: __compactRuntime.StateValue.newCell({ value: _descriptor_1.toValue(0n),
                                                                                                                                 alignment: _descriptor_1.alignment() }).encode() } },
                                                                          'eq',
                                                                          { popeq: { cached: true,
                                                                                     result: undefined } }]).value);
      },
      size(...args_0) {
        if (args_0.length !== 0) {
          throw new __compactRuntime.CompactError(`size: expected 0 arguments, received ${args_0.length}`);
        }
        return _descriptor_1.fromValue(__compactRuntime.queryLedgerState(context,
                                                                         partialProofData,
                                                                         [
                                                                          { dup: { n: 0 } },
                                                                          { idx: { cached: false,
                                                                                   pushPath: false,
                                                                                   path: [
                                                                                          { tag: 'value',
                                                                                            value: { value: _descriptor_15.toValue(1n),
                                                                                                     alignment: _descriptor_15.alignment() } }] } },
                                                                          'size',
                                                                          { popeq: { cached: true,
                                                                                     result: undefined } }]).value);
      },
      member(...args_0) {
        if (args_0.length !== 1) {
          throw new __compactRuntime.CompactError(`member: expected 1 argument, received ${args_0.length}`);
        }
        const elem_0 = args_0[0];
        if (!(elem_0.buffer instanceof ArrayBuffer && elem_0.BYTES_PER_ELEMENT === 1 && elem_0.length === 32)) {
          __compactRuntime.typeError('member',
                                     'argument 1',
                                     'cfi_endorse.compact line 47 char 1',
                                     'Bytes<32>',
                                     elem_0)
        }
        return _descriptor_2.fromValue(__compactRuntime.queryLedgerState(context,
                                                                         partialProofData,
                                                                         [
                                                                          { dup: { n: 0 } },
                                                                          { idx: { cached: false,
                                                                                   pushPath: false,
                                                                                   path: [
                                                                                          { tag: 'value',
                                                                                            value: { value: _descriptor_15.toValue(1n),
                                                                                                     alignment: _descriptor_15.alignment() } }] } },
                                                                          { push: { storage: false,
                                                                                    value: __compactRuntime.StateValue.newCell({ value: _descriptor_0.toValue(elem_0),
                                                                                                                                 alignment: _descriptor_0.alignment() }).encode() } },
                                                                          'member',
                                                                          { popeq: { cached: true,
                                                                                     result: undefined } }]).value);
      },
      [Symbol.iterator](...args_0) {
        if (args_0.length !== 0) {
          throw new __compactRuntime.CompactError(`iter: expected 0 arguments, received ${args_0.length}`);
        }
        const self_0 = state.asArray()[1];
        return self_0.asMap().keys().map((elem) => _descriptor_0.fromValue(elem.value))[Symbol.iterator]();
      }
    },
    schools: {
      isEmpty(...args_0) {
        if (args_0.length !== 0) {
          throw new __compactRuntime.CompactError(`isEmpty: expected 0 arguments, received ${args_0.length}`);
        }
        return _descriptor_2.fromValue(__compactRuntime.queryLedgerState(context,
                                                                         partialProofData,
                                                                         [
                                                                          { dup: { n: 0 } },
                                                                          { idx: { cached: false,
                                                                                   pushPath: false,
                                                                                   path: [
                                                                                          { tag: 'value',
                                                                                            value: { value: _descriptor_15.toValue(2n),
                                                                                                     alignment: _descriptor_15.alignment() } }] } },
                                                                          'size',
                                                                          { push: { storage: false,
                                                                                    value: __compactRuntime.StateValue.newCell({ value: _descriptor_1.toValue(0n),
                                                                                                                                 alignment: _descriptor_1.alignment() }).encode() } },
                                                                          'eq',
                                                                          { popeq: { cached: true,
                                                                                     result: undefined } }]).value);
      },
      size(...args_0) {
        if (args_0.length !== 0) {
          throw new __compactRuntime.CompactError(`size: expected 0 arguments, received ${args_0.length}`);
        }
        return _descriptor_1.fromValue(__compactRuntime.queryLedgerState(context,
                                                                         partialProofData,
                                                                         [
                                                                          { dup: { n: 0 } },
                                                                          { idx: { cached: false,
                                                                                   pushPath: false,
                                                                                   path: [
                                                                                          { tag: 'value',
                                                                                            value: { value: _descriptor_15.toValue(2n),
                                                                                                     alignment: _descriptor_15.alignment() } }] } },
                                                                          'size',
                                                                          { popeq: { cached: true,
                                                                                     result: undefined } }]).value);
      },
      member(...args_0) {
        if (args_0.length !== 1) {
          throw new __compactRuntime.CompactError(`member: expected 1 argument, received ${args_0.length}`);
        }
        const key_0 = args_0[0];
        if (!(key_0.buffer instanceof ArrayBuffer && key_0.BYTES_PER_ELEMENT === 1 && key_0.length === 32)) {
          __compactRuntime.typeError('member',
                                     'argument 1',
                                     'cfi_endorse.compact line 48 char 1',
                                     'Bytes<32>',
                                     key_0)
        }
        return _descriptor_2.fromValue(__compactRuntime.queryLedgerState(context,
                                                                         partialProofData,
                                                                         [
                                                                          { dup: { n: 0 } },
                                                                          { idx: { cached: false,
                                                                                   pushPath: false,
                                                                                   path: [
                                                                                          { tag: 'value',
                                                                                            value: { value: _descriptor_15.toValue(2n),
                                                                                                     alignment: _descriptor_15.alignment() } }] } },
                                                                          { push: { storage: false,
                                                                                    value: __compactRuntime.StateValue.newCell({ value: _descriptor_0.toValue(key_0),
                                                                                                                                 alignment: _descriptor_0.alignment() }).encode() } },
                                                                          'member',
                                                                          { popeq: { cached: true,
                                                                                     result: undefined } }]).value);
      },
      lookup(...args_0) {
        if (args_0.length !== 1) {
          throw new __compactRuntime.CompactError(`lookup: expected 1 argument, received ${args_0.length}`);
        }
        const key_0 = args_0[0];
        if (!(key_0.buffer instanceof ArrayBuffer && key_0.BYTES_PER_ELEMENT === 1 && key_0.length === 32)) {
          __compactRuntime.typeError('lookup',
                                     'argument 1',
                                     'cfi_endorse.compact line 48 char 1',
                                     'Bytes<32>',
                                     key_0)
        }
        return _descriptor_0.fromValue(__compactRuntime.queryLedgerState(context,
                                                                         partialProofData,
                                                                         [
                                                                          { dup: { n: 0 } },
                                                                          { idx: { cached: false,
                                                                                   pushPath: false,
                                                                                   path: [
                                                                                          { tag: 'value',
                                                                                            value: { value: _descriptor_15.toValue(2n),
                                                                                                     alignment: _descriptor_15.alignment() } }] } },
                                                                          { idx: { cached: false,
                                                                                   pushPath: false,
                                                                                   path: [
                                                                                          { tag: 'value',
                                                                                            value: { value: _descriptor_0.toValue(key_0),
                                                                                                     alignment: _descriptor_0.alignment() } }] } },
                                                                          { popeq: { cached: false,
                                                                                     result: undefined } }]).value);
      },
      [Symbol.iterator](...args_0) {
        if (args_0.length !== 0) {
          throw new __compactRuntime.CompactError(`iter: expected 0 arguments, received ${args_0.length}`);
        }
        const self_0 = state.asArray()[2];
        return self_0.asMap().keys().map(  (key) => {    const value = self_0.asMap().get(key).asCell();    return [      _descriptor_0.fromValue(key.value),      _descriptor_0.fromValue(value.value)    ];  })[Symbol.iterator]();
      }
    },
    adminKeySchool: {
      isEmpty(...args_0) {
        if (args_0.length !== 0) {
          throw new __compactRuntime.CompactError(`isEmpty: expected 0 arguments, received ${args_0.length}`);
        }
        return _descriptor_2.fromValue(__compactRuntime.queryLedgerState(context,
                                                                         partialProofData,
                                                                         [
                                                                          { dup: { n: 0 } },
                                                                          { idx: { cached: false,
                                                                                   pushPath: false,
                                                                                   path: [
                                                                                          { tag: 'value',
                                                                                            value: { value: _descriptor_15.toValue(3n),
                                                                                                     alignment: _descriptor_15.alignment() } }] } },
                                                                          'size',
                                                                          { push: { storage: false,
                                                                                    value: __compactRuntime.StateValue.newCell({ value: _descriptor_1.toValue(0n),
                                                                                                                                 alignment: _descriptor_1.alignment() }).encode() } },
                                                                          'eq',
                                                                          { popeq: { cached: true,
                                                                                     result: undefined } }]).value);
      },
      size(...args_0) {
        if (args_0.length !== 0) {
          throw new __compactRuntime.CompactError(`size: expected 0 arguments, received ${args_0.length}`);
        }
        return _descriptor_1.fromValue(__compactRuntime.queryLedgerState(context,
                                                                         partialProofData,
                                                                         [
                                                                          { dup: { n: 0 } },
                                                                          { idx: { cached: false,
                                                                                   pushPath: false,
                                                                                   path: [
                                                                                          { tag: 'value',
                                                                                            value: { value: _descriptor_15.toValue(3n),
                                                                                                     alignment: _descriptor_15.alignment() } }] } },
                                                                          'size',
                                                                          { popeq: { cached: true,
                                                                                     result: undefined } }]).value);
      },
      member(...args_0) {
        if (args_0.length !== 1) {
          throw new __compactRuntime.CompactError(`member: expected 1 argument, received ${args_0.length}`);
        }
        const key_0 = args_0[0];
        if (!(key_0.buffer instanceof ArrayBuffer && key_0.BYTES_PER_ELEMENT === 1 && key_0.length === 32)) {
          __compactRuntime.typeError('member',
                                     'argument 1',
                                     'cfi_endorse.compact line 49 char 1',
                                     'Bytes<32>',
                                     key_0)
        }
        return _descriptor_2.fromValue(__compactRuntime.queryLedgerState(context,
                                                                         partialProofData,
                                                                         [
                                                                          { dup: { n: 0 } },
                                                                          { idx: { cached: false,
                                                                                   pushPath: false,
                                                                                   path: [
                                                                                          { tag: 'value',
                                                                                            value: { value: _descriptor_15.toValue(3n),
                                                                                                     alignment: _descriptor_15.alignment() } }] } },
                                                                          { push: { storage: false,
                                                                                    value: __compactRuntime.StateValue.newCell({ value: _descriptor_0.toValue(key_0),
                                                                                                                                 alignment: _descriptor_0.alignment() }).encode() } },
                                                                          'member',
                                                                          { popeq: { cached: true,
                                                                                     result: undefined } }]).value);
      },
      lookup(...args_0) {
        if (args_0.length !== 1) {
          throw new __compactRuntime.CompactError(`lookup: expected 1 argument, received ${args_0.length}`);
        }
        const key_0 = args_0[0];
        if (!(key_0.buffer instanceof ArrayBuffer && key_0.BYTES_PER_ELEMENT === 1 && key_0.length === 32)) {
          __compactRuntime.typeError('lookup',
                                     'argument 1',
                                     'cfi_endorse.compact line 49 char 1',
                                     'Bytes<32>',
                                     key_0)
        }
        return _descriptor_0.fromValue(__compactRuntime.queryLedgerState(context,
                                                                         partialProofData,
                                                                         [
                                                                          { dup: { n: 0 } },
                                                                          { idx: { cached: false,
                                                                                   pushPath: false,
                                                                                   path: [
                                                                                          { tag: 'value',
                                                                                            value: { value: _descriptor_15.toValue(3n),
                                                                                                     alignment: _descriptor_15.alignment() } }] } },
                                                                          { idx: { cached: false,
                                                                                   pushPath: false,
                                                                                   path: [
                                                                                          { tag: 'value',
                                                                                            value: { value: _descriptor_0.toValue(key_0),
                                                                                                     alignment: _descriptor_0.alignment() } }] } },
                                                                          { popeq: { cached: false,
                                                                                     result: undefined } }]).value);
      },
      [Symbol.iterator](...args_0) {
        if (args_0.length !== 0) {
          throw new __compactRuntime.CompactError(`iter: expected 0 arguments, received ${args_0.length}`);
        }
        const self_0 = state.asArray()[3];
        return self_0.asMap().keys().map(  (key) => {    const value = self_0.asMap().get(key).asCell();    return [      _descriptor_0.fromValue(key.value),      _descriptor_0.fromValue(value.value)    ];  })[Symbol.iterator]();
      }
    },
    retiredAdminKeys: {
      isEmpty(...args_0) {
        if (args_0.length !== 0) {
          throw new __compactRuntime.CompactError(`isEmpty: expected 0 arguments, received ${args_0.length}`);
        }
        return _descriptor_2.fromValue(__compactRuntime.queryLedgerState(context,
                                                                         partialProofData,
                                                                         [
                                                                          { dup: { n: 0 } },
                                                                          { idx: { cached: false,
                                                                                   pushPath: false,
                                                                                   path: [
                                                                                          { tag: 'value',
                                                                                            value: { value: _descriptor_15.toValue(4n),
                                                                                                     alignment: _descriptor_15.alignment() } }] } },
                                                                          'size',
                                                                          { push: { storage: false,
                                                                                    value: __compactRuntime.StateValue.newCell({ value: _descriptor_1.toValue(0n),
                                                                                                                                 alignment: _descriptor_1.alignment() }).encode() } },
                                                                          'eq',
                                                                          { popeq: { cached: true,
                                                                                     result: undefined } }]).value);
      },
      size(...args_0) {
        if (args_0.length !== 0) {
          throw new __compactRuntime.CompactError(`size: expected 0 arguments, received ${args_0.length}`);
        }
        return _descriptor_1.fromValue(__compactRuntime.queryLedgerState(context,
                                                                         partialProofData,
                                                                         [
                                                                          { dup: { n: 0 } },
                                                                          { idx: { cached: false,
                                                                                   pushPath: false,
                                                                                   path: [
                                                                                          { tag: 'value',
                                                                                            value: { value: _descriptor_15.toValue(4n),
                                                                                                     alignment: _descriptor_15.alignment() } }] } },
                                                                          'size',
                                                                          { popeq: { cached: true,
                                                                                     result: undefined } }]).value);
      },
      member(...args_0) {
        if (args_0.length !== 1) {
          throw new __compactRuntime.CompactError(`member: expected 1 argument, received ${args_0.length}`);
        }
        const elem_0 = args_0[0];
        if (!(elem_0.buffer instanceof ArrayBuffer && elem_0.BYTES_PER_ELEMENT === 1 && elem_0.length === 32)) {
          __compactRuntime.typeError('member',
                                     'argument 1',
                                     'cfi_endorse.compact line 50 char 1',
                                     'Bytes<32>',
                                     elem_0)
        }
        return _descriptor_2.fromValue(__compactRuntime.queryLedgerState(context,
                                                                         partialProofData,
                                                                         [
                                                                          { dup: { n: 0 } },
                                                                          { idx: { cached: false,
                                                                                   pushPath: false,
                                                                                   path: [
                                                                                          { tag: 'value',
                                                                                            value: { value: _descriptor_15.toValue(4n),
                                                                                                     alignment: _descriptor_15.alignment() } }] } },
                                                                          { push: { storage: false,
                                                                                    value: __compactRuntime.StateValue.newCell({ value: _descriptor_0.toValue(elem_0),
                                                                                                                                 alignment: _descriptor_0.alignment() }).encode() } },
                                                                          'member',
                                                                          { popeq: { cached: true,
                                                                                     result: undefined } }]).value);
      },
      [Symbol.iterator](...args_0) {
        if (args_0.length !== 0) {
          throw new __compactRuntime.CompactError(`iter: expected 0 arguments, received ${args_0.length}`);
        }
        const self_0 = state.asArray()[4];
        return self_0.asMap().keys().map((elem) => _descriptor_0.fromValue(elem.value))[Symbol.iterator]();
      }
    },
    schoolRevokedAtSeq: {
      isEmpty(...args_0) {
        if (args_0.length !== 0) {
          throw new __compactRuntime.CompactError(`isEmpty: expected 0 arguments, received ${args_0.length}`);
        }
        return _descriptor_2.fromValue(__compactRuntime.queryLedgerState(context,
                                                                         partialProofData,
                                                                         [
                                                                          { dup: { n: 0 } },
                                                                          { idx: { cached: false,
                                                                                   pushPath: false,
                                                                                   path: [
                                                                                          { tag: 'value',
                                                                                            value: { value: _descriptor_15.toValue(5n),
                                                                                                     alignment: _descriptor_15.alignment() } }] } },
                                                                          'size',
                                                                          { push: { storage: false,
                                                                                    value: __compactRuntime.StateValue.newCell({ value: _descriptor_1.toValue(0n),
                                                                                                                                 alignment: _descriptor_1.alignment() }).encode() } },
                                                                          'eq',
                                                                          { popeq: { cached: true,
                                                                                     result: undefined } }]).value);
      },
      size(...args_0) {
        if (args_0.length !== 0) {
          throw new __compactRuntime.CompactError(`size: expected 0 arguments, received ${args_0.length}`);
        }
        return _descriptor_1.fromValue(__compactRuntime.queryLedgerState(context,
                                                                         partialProofData,
                                                                         [
                                                                          { dup: { n: 0 } },
                                                                          { idx: { cached: false,
                                                                                   pushPath: false,
                                                                                   path: [
                                                                                          { tag: 'value',
                                                                                            value: { value: _descriptor_15.toValue(5n),
                                                                                                     alignment: _descriptor_15.alignment() } }] } },
                                                                          'size',
                                                                          { popeq: { cached: true,
                                                                                     result: undefined } }]).value);
      },
      member(...args_0) {
        if (args_0.length !== 1) {
          throw new __compactRuntime.CompactError(`member: expected 1 argument, received ${args_0.length}`);
        }
        const key_0 = args_0[0];
        if (!(key_0.buffer instanceof ArrayBuffer && key_0.BYTES_PER_ELEMENT === 1 && key_0.length === 32)) {
          __compactRuntime.typeError('member',
                                     'argument 1',
                                     'cfi_endorse.compact line 51 char 1',
                                     'Bytes<32>',
                                     key_0)
        }
        return _descriptor_2.fromValue(__compactRuntime.queryLedgerState(context,
                                                                         partialProofData,
                                                                         [
                                                                          { dup: { n: 0 } },
                                                                          { idx: { cached: false,
                                                                                   pushPath: false,
                                                                                   path: [
                                                                                          { tag: 'value',
                                                                                            value: { value: _descriptor_15.toValue(5n),
                                                                                                     alignment: _descriptor_15.alignment() } }] } },
                                                                          { push: { storage: false,
                                                                                    value: __compactRuntime.StateValue.newCell({ value: _descriptor_0.toValue(key_0),
                                                                                                                                 alignment: _descriptor_0.alignment() }).encode() } },
                                                                          'member',
                                                                          { popeq: { cached: true,
                                                                                     result: undefined } }]).value);
      },
      lookup(...args_0) {
        if (args_0.length !== 1) {
          throw new __compactRuntime.CompactError(`lookup: expected 1 argument, received ${args_0.length}`);
        }
        const key_0 = args_0[0];
        if (!(key_0.buffer instanceof ArrayBuffer && key_0.BYTES_PER_ELEMENT === 1 && key_0.length === 32)) {
          __compactRuntime.typeError('lookup',
                                     'argument 1',
                                     'cfi_endorse.compact line 51 char 1',
                                     'Bytes<32>',
                                     key_0)
        }
        return _descriptor_1.fromValue(__compactRuntime.queryLedgerState(context,
                                                                         partialProofData,
                                                                         [
                                                                          { dup: { n: 0 } },
                                                                          { idx: { cached: false,
                                                                                   pushPath: false,
                                                                                   path: [
                                                                                          { tag: 'value',
                                                                                            value: { value: _descriptor_15.toValue(5n),
                                                                                                     alignment: _descriptor_15.alignment() } }] } },
                                                                          { idx: { cached: false,
                                                                                   pushPath: false,
                                                                                   path: [
                                                                                          { tag: 'value',
                                                                                            value: { value: _descriptor_0.toValue(key_0),
                                                                                                     alignment: _descriptor_0.alignment() } }] } },
                                                                          { popeq: { cached: false,
                                                                                     result: undefined } }]).value);
      },
      [Symbol.iterator](...args_0) {
        if (args_0.length !== 0) {
          throw new __compactRuntime.CompactError(`iter: expected 0 arguments, received ${args_0.length}`);
        }
        const self_0 = state.asArray()[5];
        return self_0.asMap().keys().map(  (key) => {    const value = self_0.asMap().get(key).asCell();    return [      _descriptor_0.fromValue(key.value),      _descriptor_1.fromValue(value.value)    ];  })[Symbol.iterator]();
      }
    },
    cfiKeys: {
      isEmpty(...args_0) {
        if (args_0.length !== 0) {
          throw new __compactRuntime.CompactError(`isEmpty: expected 0 arguments, received ${args_0.length}`);
        }
        return _descriptor_2.fromValue(__compactRuntime.queryLedgerState(context,
                                                                         partialProofData,
                                                                         [
                                                                          { dup: { n: 0 } },
                                                                          { idx: { cached: false,
                                                                                   pushPath: false,
                                                                                   path: [
                                                                                          { tag: 'value',
                                                                                            value: { value: _descriptor_15.toValue(6n),
                                                                                                     alignment: _descriptor_15.alignment() } }] } },
                                                                          'size',
                                                                          { push: { storage: false,
                                                                                    value: __compactRuntime.StateValue.newCell({ value: _descriptor_1.toValue(0n),
                                                                                                                                 alignment: _descriptor_1.alignment() }).encode() } },
                                                                          'eq',
                                                                          { popeq: { cached: true,
                                                                                     result: undefined } }]).value);
      },
      size(...args_0) {
        if (args_0.length !== 0) {
          throw new __compactRuntime.CompactError(`size: expected 0 arguments, received ${args_0.length}`);
        }
        return _descriptor_1.fromValue(__compactRuntime.queryLedgerState(context,
                                                                         partialProofData,
                                                                         [
                                                                          { dup: { n: 0 } },
                                                                          { idx: { cached: false,
                                                                                   pushPath: false,
                                                                                   path: [
                                                                                          { tag: 'value',
                                                                                            value: { value: _descriptor_15.toValue(6n),
                                                                                                     alignment: _descriptor_15.alignment() } }] } },
                                                                          'size',
                                                                          { popeq: { cached: true,
                                                                                     result: undefined } }]).value);
      },
      member(...args_0) {
        if (args_0.length !== 1) {
          throw new __compactRuntime.CompactError(`member: expected 1 argument, received ${args_0.length}`);
        }
        const key_0 = args_0[0];
        if (!(key_0.buffer instanceof ArrayBuffer && key_0.BYTES_PER_ELEMENT === 1 && key_0.length === 32)) {
          __compactRuntime.typeError('member',
                                     'argument 1',
                                     'cfi_endorse.compact line 52 char 1',
                                     'Bytes<32>',
                                     key_0)
        }
        return _descriptor_2.fromValue(__compactRuntime.queryLedgerState(context,
                                                                         partialProofData,
                                                                         [
                                                                          { dup: { n: 0 } },
                                                                          { idx: { cached: false,
                                                                                   pushPath: false,
                                                                                   path: [
                                                                                          { tag: 'value',
                                                                                            value: { value: _descriptor_15.toValue(6n),
                                                                                                     alignment: _descriptor_15.alignment() } }] } },
                                                                          { push: { storage: false,
                                                                                    value: __compactRuntime.StateValue.newCell({ value: _descriptor_0.toValue(key_0),
                                                                                                                                 alignment: _descriptor_0.alignment() }).encode() } },
                                                                          'member',
                                                                          { popeq: { cached: true,
                                                                                     result: undefined } }]).value);
      },
      lookup(...args_0) {
        if (args_0.length !== 1) {
          throw new __compactRuntime.CompactError(`lookup: expected 1 argument, received ${args_0.length}`);
        }
        const key_0 = args_0[0];
        if (!(key_0.buffer instanceof ArrayBuffer && key_0.BYTES_PER_ELEMENT === 1 && key_0.length === 32)) {
          __compactRuntime.typeError('lookup',
                                     'argument 1',
                                     'cfi_endorse.compact line 52 char 1',
                                     'Bytes<32>',
                                     key_0)
        }
        return _descriptor_4.fromValue(__compactRuntime.queryLedgerState(context,
                                                                         partialProofData,
                                                                         [
                                                                          { dup: { n: 0 } },
                                                                          { idx: { cached: false,
                                                                                   pushPath: false,
                                                                                   path: [
                                                                                          { tag: 'value',
                                                                                            value: { value: _descriptor_15.toValue(6n),
                                                                                                     alignment: _descriptor_15.alignment() } }] } },
                                                                          { idx: { cached: false,
                                                                                   pushPath: false,
                                                                                   path: [
                                                                                          { tag: 'value',
                                                                                            value: { value: _descriptor_0.toValue(key_0),
                                                                                                     alignment: _descriptor_0.alignment() } }] } },
                                                                          { popeq: { cached: false,
                                                                                     result: undefined } }]).value);
      },
      [Symbol.iterator](...args_0) {
        if (args_0.length !== 0) {
          throw new __compactRuntime.CompactError(`iter: expected 0 arguments, received ${args_0.length}`);
        }
        const self_0 = state.asArray()[6];
        return self_0.asMap().keys().map(  (key) => {    const value = self_0.asMap().get(key).asCell();    return [      _descriptor_0.fromValue(key.value),      _descriptor_4.fromValue(value.value)    ];  })[Symbol.iterator]();
      }
    },
    revokedAtSeq: {
      isEmpty(...args_0) {
        if (args_0.length !== 0) {
          throw new __compactRuntime.CompactError(`isEmpty: expected 0 arguments, received ${args_0.length}`);
        }
        return _descriptor_2.fromValue(__compactRuntime.queryLedgerState(context,
                                                                         partialProofData,
                                                                         [
                                                                          { dup: { n: 0 } },
                                                                          { idx: { cached: false,
                                                                                   pushPath: false,
                                                                                   path: [
                                                                                          { tag: 'value',
                                                                                            value: { value: _descriptor_15.toValue(7n),
                                                                                                     alignment: _descriptor_15.alignment() } }] } },
                                                                          'size',
                                                                          { push: { storage: false,
                                                                                    value: __compactRuntime.StateValue.newCell({ value: _descriptor_1.toValue(0n),
                                                                                                                                 alignment: _descriptor_1.alignment() }).encode() } },
                                                                          'eq',
                                                                          { popeq: { cached: true,
                                                                                     result: undefined } }]).value);
      },
      size(...args_0) {
        if (args_0.length !== 0) {
          throw new __compactRuntime.CompactError(`size: expected 0 arguments, received ${args_0.length}`);
        }
        return _descriptor_1.fromValue(__compactRuntime.queryLedgerState(context,
                                                                         partialProofData,
                                                                         [
                                                                          { dup: { n: 0 } },
                                                                          { idx: { cached: false,
                                                                                   pushPath: false,
                                                                                   path: [
                                                                                          { tag: 'value',
                                                                                            value: { value: _descriptor_15.toValue(7n),
                                                                                                     alignment: _descriptor_15.alignment() } }] } },
                                                                          'size',
                                                                          { popeq: { cached: true,
                                                                                     result: undefined } }]).value);
      },
      member(...args_0) {
        if (args_0.length !== 1) {
          throw new __compactRuntime.CompactError(`member: expected 1 argument, received ${args_0.length}`);
        }
        const key_0 = args_0[0];
        if (!(key_0.buffer instanceof ArrayBuffer && key_0.BYTES_PER_ELEMENT === 1 && key_0.length === 32)) {
          __compactRuntime.typeError('member',
                                     'argument 1',
                                     'cfi_endorse.compact line 53 char 1',
                                     'Bytes<32>',
                                     key_0)
        }
        return _descriptor_2.fromValue(__compactRuntime.queryLedgerState(context,
                                                                         partialProofData,
                                                                         [
                                                                          { dup: { n: 0 } },
                                                                          { idx: { cached: false,
                                                                                   pushPath: false,
                                                                                   path: [
                                                                                          { tag: 'value',
                                                                                            value: { value: _descriptor_15.toValue(7n),
                                                                                                     alignment: _descriptor_15.alignment() } }] } },
                                                                          { push: { storage: false,
                                                                                    value: __compactRuntime.StateValue.newCell({ value: _descriptor_0.toValue(key_0),
                                                                                                                                 alignment: _descriptor_0.alignment() }).encode() } },
                                                                          'member',
                                                                          { popeq: { cached: true,
                                                                                     result: undefined } }]).value);
      },
      lookup(...args_0) {
        if (args_0.length !== 1) {
          throw new __compactRuntime.CompactError(`lookup: expected 1 argument, received ${args_0.length}`);
        }
        const key_0 = args_0[0];
        if (!(key_0.buffer instanceof ArrayBuffer && key_0.BYTES_PER_ELEMENT === 1 && key_0.length === 32)) {
          __compactRuntime.typeError('lookup',
                                     'argument 1',
                                     'cfi_endorse.compact line 53 char 1',
                                     'Bytes<32>',
                                     key_0)
        }
        return _descriptor_1.fromValue(__compactRuntime.queryLedgerState(context,
                                                                         partialProofData,
                                                                         [
                                                                          { dup: { n: 0 } },
                                                                          { idx: { cached: false,
                                                                                   pushPath: false,
                                                                                   path: [
                                                                                          { tag: 'value',
                                                                                            value: { value: _descriptor_15.toValue(7n),
                                                                                                     alignment: _descriptor_15.alignment() } }] } },
                                                                          { idx: { cached: false,
                                                                                   pushPath: false,
                                                                                   path: [
                                                                                          { tag: 'value',
                                                                                            value: { value: _descriptor_0.toValue(key_0),
                                                                                                     alignment: _descriptor_0.alignment() } }] } },
                                                                          { popeq: { cached: false,
                                                                                     result: undefined } }]).value);
      },
      [Symbol.iterator](...args_0) {
        if (args_0.length !== 0) {
          throw new __compactRuntime.CompactError(`iter: expected 0 arguments, received ${args_0.length}`);
        }
        const self_0 = state.asArray()[7];
        return self_0.asMap().keys().map(  (key) => {    const value = self_0.asMap().get(key).asCell();    return [      _descriptor_0.fromValue(key.value),      _descriptor_1.fromValue(value.value)    ];  })[Symbol.iterator]();
      }
    },
    endorsements: {
      isEmpty(...args_0) {
        if (args_0.length !== 0) {
          throw new __compactRuntime.CompactError(`isEmpty: expected 0 arguments, received ${args_0.length}`);
        }
        return _descriptor_2.fromValue(__compactRuntime.queryLedgerState(context,
                                                                         partialProofData,
                                                                         [
                                                                          { dup: { n: 0 } },
                                                                          { idx: { cached: false,
                                                                                   pushPath: false,
                                                                                   path: [
                                                                                          { tag: 'value',
                                                                                            value: { value: _descriptor_15.toValue(8n),
                                                                                                     alignment: _descriptor_15.alignment() } }] } },
                                                                          'size',
                                                                          { push: { storage: false,
                                                                                    value: __compactRuntime.StateValue.newCell({ value: _descriptor_1.toValue(0n),
                                                                                                                                 alignment: _descriptor_1.alignment() }).encode() } },
                                                                          'eq',
                                                                          { popeq: { cached: true,
                                                                                     result: undefined } }]).value);
      },
      size(...args_0) {
        if (args_0.length !== 0) {
          throw new __compactRuntime.CompactError(`size: expected 0 arguments, received ${args_0.length}`);
        }
        return _descriptor_1.fromValue(__compactRuntime.queryLedgerState(context,
                                                                         partialProofData,
                                                                         [
                                                                          { dup: { n: 0 } },
                                                                          { idx: { cached: false,
                                                                                   pushPath: false,
                                                                                   path: [
                                                                                          { tag: 'value',
                                                                                            value: { value: _descriptor_15.toValue(8n),
                                                                                                     alignment: _descriptor_15.alignment() } }] } },
                                                                          'size',
                                                                          { popeq: { cached: true,
                                                                                     result: undefined } }]).value);
      },
      member(...args_0) {
        if (args_0.length !== 1) {
          throw new __compactRuntime.CompactError(`member: expected 1 argument, received ${args_0.length}`);
        }
        const key_0 = args_0[0];
        if (!(key_0.buffer instanceof ArrayBuffer && key_0.BYTES_PER_ELEMENT === 1 && key_0.length === 32)) {
          __compactRuntime.typeError('member',
                                     'argument 1',
                                     'cfi_endorse.compact line 54 char 1',
                                     'Bytes<32>',
                                     key_0)
        }
        return _descriptor_2.fromValue(__compactRuntime.queryLedgerState(context,
                                                                         partialProofData,
                                                                         [
                                                                          { dup: { n: 0 } },
                                                                          { idx: { cached: false,
                                                                                   pushPath: false,
                                                                                   path: [
                                                                                          { tag: 'value',
                                                                                            value: { value: _descriptor_15.toValue(8n),
                                                                                                     alignment: _descriptor_15.alignment() } }] } },
                                                                          { push: { storage: false,
                                                                                    value: __compactRuntime.StateValue.newCell({ value: _descriptor_0.toValue(key_0),
                                                                                                                                 alignment: _descriptor_0.alignment() }).encode() } },
                                                                          'member',
                                                                          { popeq: { cached: true,
                                                                                     result: undefined } }]).value);
      },
      lookup(...args_0) {
        if (args_0.length !== 1) {
          throw new __compactRuntime.CompactError(`lookup: expected 1 argument, received ${args_0.length}`);
        }
        const key_0 = args_0[0];
        if (!(key_0.buffer instanceof ArrayBuffer && key_0.BYTES_PER_ELEMENT === 1 && key_0.length === 32)) {
          __compactRuntime.typeError('lookup',
                                     'argument 1',
                                     'cfi_endorse.compact line 54 char 1',
                                     'Bytes<32>',
                                     key_0)
        }
        return _descriptor_14.fromValue(__compactRuntime.queryLedgerState(context,
                                                                          partialProofData,
                                                                          [
                                                                           { dup: { n: 0 } },
                                                                           { idx: { cached: false,
                                                                                    pushPath: false,
                                                                                    path: [
                                                                                           { tag: 'value',
                                                                                             value: { value: _descriptor_15.toValue(8n),
                                                                                                      alignment: _descriptor_15.alignment() } }] } },
                                                                           { idx: { cached: false,
                                                                                    pushPath: false,
                                                                                    path: [
                                                                                           { tag: 'value',
                                                                                             value: { value: _descriptor_0.toValue(key_0),
                                                                                                      alignment: _descriptor_0.alignment() } }] } },
                                                                           { popeq: { cached: false,
                                                                                      result: undefined } }]).value);
      },
      [Symbol.iterator](...args_0) {
        if (args_0.length !== 0) {
          throw new __compactRuntime.CompactError(`iter: expected 0 arguments, received ${args_0.length}`);
        }
        const self_0 = state.asArray()[8];
        return self_0.asMap().keys().map(  (key) => {    const value = self_0.asMap().get(key).asCell();    return [      _descriptor_0.fromValue(key.value),      _descriptor_14.fromValue(value.value)    ];  })[Symbol.iterator]();
      }
    },
    get seq() {
      return _descriptor_1.fromValue(__compactRuntime.queryLedgerState(context,
                                                                       partialProofData,
                                                                       [
                                                                        { dup: { n: 0 } },
                                                                        { idx: { cached: false,
                                                                                 pushPath: false,
                                                                                 path: [
                                                                                        { tag: 'value',
                                                                                          value: { value: _descriptor_15.toValue(9n),
                                                                                                   alignment: _descriptor_15.alignment() } }] } },
                                                                        { popeq: { cached: true,
                                                                                   result: undefined } }]).value);
    }
  };
}
const _emptyContext = {
  callContext: { currentQueryContext: new __compactRuntime.QueryContext(new __compactRuntime.ContractState().data, __compactRuntime.dummyContractAddress()), currentGasCost: __compactRuntime.emptyRunningCost() }
};
const _dummyContract = new Contract({ });
export const pureCircuits = {
  keyIdOf: (...args_0) => {
    if (args_0.length !== 1) {
      throw new __compactRuntime.CompactError(`keyIdOf: expected 1 argument (as invoked from Typescript), received ${args_0.length}`);
    }
    const pk_0 = args_0[0];
    if (!(__compactRuntime.isValidSecp256r1Point(pk_0))) {
      __compactRuntime.typeError('keyIdOf',
                                 'argument 1',
                                 'cfi_endorse.compact line 63 char 1',
                                 'Secp256r1Point',
                                 pk_0)
    }
    return _dummyContract._keyIdOf_0(pk_0);
  },
  rootDigest: (...args_0) => {
    if (args_0.length !== 4) {
      throw new __compactRuntime.CompactError(`rootDigest: expected 4 arguments (as invoked from Typescript), received ${args_0.length}`);
    }
    const contractAddr_0 = args_0[0];
    const op_0 = args_0[1];
    const a_0 = args_0[2];
    const b_0 = args_0[3];
    if (!(contractAddr_0.buffer instanceof ArrayBuffer && contractAddr_0.BYTES_PER_ELEMENT === 1 && contractAddr_0.length === 32)) {
      __compactRuntime.typeError('rootDigest',
                                 'argument 1',
                                 'cfi_endorse.compact line 69 char 1',
                                 'Bytes<32>',
                                 contractAddr_0)
    }
    if (!(op_0.buffer instanceof ArrayBuffer && op_0.BYTES_PER_ELEMENT === 1 && op_0.length === 32)) {
      __compactRuntime.typeError('rootDigest',
                                 'argument 2',
                                 'cfi_endorse.compact line 69 char 1',
                                 'Bytes<32>',
                                 op_0)
    }
    if (!(a_0.buffer instanceof ArrayBuffer && a_0.BYTES_PER_ELEMENT === 1 && a_0.length === 32)) {
      __compactRuntime.typeError('rootDigest',
                                 'argument 3',
                                 'cfi_endorse.compact line 69 char 1',
                                 'Bytes<32>',
                                 a_0)
    }
    if (!(b_0.buffer instanceof ArrayBuffer && b_0.BYTES_PER_ELEMENT === 1 && b_0.length === 32)) {
      __compactRuntime.typeError('rootDigest',
                                 'argument 4',
                                 'cfi_endorse.compact line 69 char 1',
                                 'Bytes<32>',
                                 b_0)
    }
    return _dummyContract._rootDigest_0(contractAddr_0, op_0, a_0, b_0);
  },
  schoolDigest: (...args_0) => {
    if (args_0.length !== 5) {
      throw new __compactRuntime.CompactError(`schoolDigest: expected 5 arguments (as invoked from Typescript), received ${args_0.length}`);
    }
    const contractAddr_0 = args_0[0];
    const op_0 = args_0[1];
    const schoolId_0 = args_0[2];
    const a_0 = args_0[3];
    const b_0 = args_0[4];
    if (!(contractAddr_0.buffer instanceof ArrayBuffer && contractAddr_0.BYTES_PER_ELEMENT === 1 && contractAddr_0.length === 32)) {
      __compactRuntime.typeError('schoolDigest',
                                 'argument 1',
                                 'cfi_endorse.compact line 74 char 1',
                                 'Bytes<32>',
                                 contractAddr_0)
    }
    if (!(op_0.buffer instanceof ArrayBuffer && op_0.BYTES_PER_ELEMENT === 1 && op_0.length === 32)) {
      __compactRuntime.typeError('schoolDigest',
                                 'argument 2',
                                 'cfi_endorse.compact line 74 char 1',
                                 'Bytes<32>',
                                 op_0)
    }
    if (!(schoolId_0.buffer instanceof ArrayBuffer && schoolId_0.BYTES_PER_ELEMENT === 1 && schoolId_0.length === 32)) {
      __compactRuntime.typeError('schoolDigest',
                                 'argument 3',
                                 'cfi_endorse.compact line 74 char 1',
                                 'Bytes<32>',
                                 schoolId_0)
    }
    if (!(a_0.buffer instanceof ArrayBuffer && a_0.BYTES_PER_ELEMENT === 1 && a_0.length === 32)) {
      __compactRuntime.typeError('schoolDigest',
                                 'argument 4',
                                 'cfi_endorse.compact line 74 char 1',
                                 'Bytes<32>',
                                 a_0)
    }
    if (!(b_0.buffer instanceof ArrayBuffer && b_0.BYTES_PER_ELEMENT === 1 && b_0.length === 32)) {
      __compactRuntime.typeError('schoolDigest',
                                 'argument 5',
                                 'cfi_endorse.compact line 74 char 1',
                                 'Bytes<32>',
                                 b_0)
    }
    return _dummyContract._schoolDigest_0(contractAddr_0,
                                          op_0,
                                          schoolId_0,
                                          a_0,
                                          b_0);
  },
  endorseDigest: (...args_0) => {
    if (args_0.length !== 4) {
      throw new __compactRuntime.CompactError(`endorseDigest: expected 4 arguments (as invoked from Typescript), received ${args_0.length}`);
    }
    const contractAddr_0 = args_0[0];
    const entryHash_0 = args_0[1];
    const studentCommit_0 = args_0[2];
    const attestHash_0 = args_0[3];
    if (!(contractAddr_0.buffer instanceof ArrayBuffer && contractAddr_0.BYTES_PER_ELEMENT === 1 && contractAddr_0.length === 32)) {
      __compactRuntime.typeError('endorseDigest',
                                 'argument 1',
                                 'cfi_endorse.compact line 82 char 1',
                                 'Bytes<32>',
                                 contractAddr_0)
    }
    if (!(entryHash_0.buffer instanceof ArrayBuffer && entryHash_0.BYTES_PER_ELEMENT === 1 && entryHash_0.length === 32)) {
      __compactRuntime.typeError('endorseDigest',
                                 'argument 2',
                                 'cfi_endorse.compact line 82 char 1',
                                 'Bytes<32>',
                                 entryHash_0)
    }
    if (!(studentCommit_0.buffer instanceof ArrayBuffer && studentCommit_0.BYTES_PER_ELEMENT === 1 && studentCommit_0.length === 32)) {
      __compactRuntime.typeError('endorseDigest',
                                 'argument 3',
                                 'cfi_endorse.compact line 82 char 1',
                                 'Bytes<32>',
                                 studentCommit_0)
    }
    if (!(attestHash_0.buffer instanceof ArrayBuffer && attestHash_0.BYTES_PER_ELEMENT === 1 && attestHash_0.length === 32)) {
      __compactRuntime.typeError('endorseDigest',
                                 'argument 4',
                                 'cfi_endorse.compact line 82 char 1',
                                 'Bytes<32>',
                                 attestHash_0)
    }
    return _dummyContract._endorseDigest_0(contractAddr_0,
                                           entryHash_0,
                                           studentCommit_0,
                                           attestHash_0);
  },
  revokeDigest: (...args_0) => {
    if (args_0.length !== 2) {
      throw new __compactRuntime.CompactError(`revokeDigest: expected 2 arguments (as invoked from Typescript), received ${args_0.length}`);
    }
    const contractAddr_0 = args_0[0];
    const keyId_0 = args_0[1];
    if (!(contractAddr_0.buffer instanceof ArrayBuffer && contractAddr_0.BYTES_PER_ELEMENT === 1 && contractAddr_0.length === 32)) {
      __compactRuntime.typeError('revokeDigest',
                                 'argument 1',
                                 'cfi_endorse.compact line 87 char 1',
                                 'Bytes<32>',
                                 contractAddr_0)
    }
    if (!(keyId_0.buffer instanceof ArrayBuffer && keyId_0.BYTES_PER_ELEMENT === 1 && keyId_0.length === 32)) {
      __compactRuntime.typeError('revokeDigest',
                                 'argument 2',
                                 'cfi_endorse.compact line 87 char 1',
                                 'Bytes<32>',
                                 keyId_0)
    }
    return _dummyContract._revokeDigest_0(contractAddr_0, keyId_0);
  },
  endorsementKey: (...args_0) => {
    if (args_0.length !== 2) {
      throw new __compactRuntime.CompactError(`endorsementKey: expected 2 arguments (as invoked from Typescript), received ${args_0.length}`);
    }
    const entryHash_0 = args_0[0];
    const keyId_0 = args_0[1];
    if (!(entryHash_0.buffer instanceof ArrayBuffer && entryHash_0.BYTES_PER_ELEMENT === 1 && entryHash_0.length === 32)) {
      __compactRuntime.typeError('endorsementKey',
                                 'argument 1',
                                 'cfi_endorse.compact line 91 char 1',
                                 'Bytes<32>',
                                 entryHash_0)
    }
    if (!(keyId_0.buffer instanceof ArrayBuffer && keyId_0.BYTES_PER_ELEMENT === 1 && keyId_0.length === 32)) {
      __compactRuntime.typeError('endorsementKey',
                                 'argument 2',
                                 'cfi_endorse.compact line 91 char 1',
                                 'Bytes<32>',
                                 keyId_0)
    }
    return _dummyContract._endorsementKey_0(entryHash_0, keyId_0);
  }
};
export const expectedVk = {
  'endorseEntry': '42b49e50c2ac12a632667736fedde8f5e8da3732aa2d2b9cea1e276f782941ab',
  'rootOnboardSchool': '6591f44953710e5750705869b3e8775a531fc7bcc9f9cebb37a3eae25d2bf3c0',
  'rootRevokeSchool': '237292cb4d557c286d0c76d5f953b8cbcfaf48b9a4f16bb7950721190e067b14',
  'rootSetKey': 'b19646301d922d2e39533d019fd8f99e5f274ac22c5f3152531b3e988494a487',
  'rootSetSchoolAdmin': '599bc62b97edac5183dd37651231cf091990ff7c3e765d33c5f59e2c9b0d9c19',
  'schoolEnrollCfi': '8f73a627388c7f6e0b1de1d9e104aabee9c828996e8d2b9d165df44c52dd6282',
  'schoolRevokeCfi': 'ab9f34af450036b4b2934e3c06ee29694584b36adad02d699524311a519946ab',
  'schoolRotateAdmin': '37458533a8e1420946905a9cc3cdefe0caae4f81bc77cf0bb8f53f238c206f3e',
  'selfRevoke': 'ae4a720a1394a2dd0a28f90eea024d90d8c5ed7b002b67f61c2df2f5af751bd2',
};

export const circuitSignatures = {
  'keyIdOf': {pure: true, provable: false, argumentTypes: [{tag: 'Secp256r1Point'}], resultType: {tag: 'Bytes', length: 32}},
  'rootDigest': {pure: true, provable: false, argumentTypes: [{tag: 'Bytes', length: 32}, {tag: 'Bytes', length: 32}, {tag: 'Bytes', length: 32}, {tag: 'Bytes', length: 32}], resultType: {tag: 'Bytes', length: 32}},
  'schoolDigest': {pure: true, provable: false, argumentTypes: [{tag: 'Bytes', length: 32}, {tag: 'Bytes', length: 32}, {tag: 'Bytes', length: 32}, {tag: 'Bytes', length: 32}, {tag: 'Bytes', length: 32}], resultType: {tag: 'Bytes', length: 32}},
  'endorseDigest': {pure: true, provable: false, argumentTypes: [{tag: 'Bytes', length: 32}, {tag: 'Bytes', length: 32}, {tag: 'Bytes', length: 32}, {tag: 'Bytes', length: 32}], resultType: {tag: 'Bytes', length: 32}},
  'revokeDigest': {pure: true, provable: false, argumentTypes: [{tag: 'Bytes', length: 32}, {tag: 'Bytes', length: 32}], resultType: {tag: 'Bytes', length: 32}},
  'endorsementKey': {pure: true, provable: false, argumentTypes: [{tag: 'Bytes', length: 32}, {tag: 'Bytes', length: 32}], resultType: {tag: 'Bytes', length: 32}},
  'rootOnboardSchool': {pure: false, provable: true, argumentTypes: [{tag: 'Bytes', length: 32}, {tag: 'Bytes', length: 32}, {tag: 'Secp256r1Point'}, {tag: 'Struct', name: 'Secp256r1EcdsaSignature', elements: [{name: 'r', type: {tag: 'Secp256r1Scalar'}}, {name: 's', type: {tag: 'Secp256r1Scalar'}}]}], resultType: {tag: 'Tuple', types: []}},
  'rootRevokeSchool': {pure: false, provable: true, argumentTypes: [{tag: 'Bytes', length: 32}, {tag: 'Secp256r1Point'}, {tag: 'Struct', name: 'Secp256r1EcdsaSignature', elements: [{name: 'r', type: {tag: 'Secp256r1Scalar'}}, {name: 's', type: {tag: 'Secp256r1Scalar'}}]}], resultType: {tag: 'Tuple', types: []}},
  'rootSetSchoolAdmin': {pure: false, provable: true, argumentTypes: [{tag: 'Bytes', length: 32}, {tag: 'Bytes', length: 32}, {tag: 'Secp256r1Point'}, {tag: 'Struct', name: 'Secp256r1EcdsaSignature', elements: [{name: 'r', type: {tag: 'Secp256r1Scalar'}}, {name: 's', type: {tag: 'Secp256r1Scalar'}}]}], resultType: {tag: 'Tuple', types: []}},
  'rootSetKey': {pure: false, provable: true, argumentTypes: [{tag: 'Bytes', length: 32}, {tag: 'Boolean'}, {tag: 'Secp256r1Point'}, {tag: 'Struct', name: 'Secp256r1EcdsaSignature', elements: [{name: 'r', type: {tag: 'Secp256r1Scalar'}}, {name: 's', type: {tag: 'Secp256r1Scalar'}}]}], resultType: {tag: 'Tuple', types: []}},
  'schoolEnrollCfi': {pure: false, provable: true, argumentTypes: [{tag: 'Bytes', length: 32}, {tag: 'Bytes', length: 32}, {tag: 'Bytes', length: 32}, {tag: 'Secp256r1Point'}, {tag: 'Bytes', length: 37}, {tag: 'Bytes', length: 43}, {tag: 'Bytes', length: 84}, {tag: 'Uint', maxval: '1'}, {tag: 'Uint', maxval: '31'}, {tag: 'Struct', name: 'Secp256r1EcdsaSignature', elements: [{name: 'r', type: {tag: 'Secp256r1Scalar'}}, {name: 's', type: {tag: 'Secp256r1Scalar'}}]}], resultType: {tag: 'Tuple', types: []}},
  'schoolRevokeCfi': {pure: false, provable: true, argumentTypes: [{tag: 'Bytes', length: 32}, {tag: 'Bytes', length: 32}, {tag: 'Secp256r1Point'}, {tag: 'Bytes', length: 37}, {tag: 'Bytes', length: 43}, {tag: 'Bytes', length: 84}, {tag: 'Uint', maxval: '1'}, {tag: 'Uint', maxval: '31'}, {tag: 'Struct', name: 'Secp256r1EcdsaSignature', elements: [{name: 'r', type: {tag: 'Secp256r1Scalar'}}, {name: 's', type: {tag: 'Secp256r1Scalar'}}]}], resultType: {tag: 'Tuple', types: []}},
  'schoolRotateAdmin': {pure: false, provable: true, argumentTypes: [{tag: 'Bytes', length: 32}, {tag: 'Bytes', length: 32}, {tag: 'Secp256r1Point'}, {tag: 'Bytes', length: 37}, {tag: 'Bytes', length: 43}, {tag: 'Bytes', length: 84}, {tag: 'Uint', maxval: '1'}, {tag: 'Uint', maxval: '31'}, {tag: 'Struct', name: 'Secp256r1EcdsaSignature', elements: [{name: 'r', type: {tag: 'Secp256r1Scalar'}}, {name: 's', type: {tag: 'Secp256r1Scalar'}}]}], resultType: {tag: 'Tuple', types: []}},
  'selfRevoke': {pure: false, provable: true, argumentTypes: [{tag: 'Secp256r1Point'}, {tag: 'Bytes', length: 37}, {tag: 'Bytes', length: 43}, {tag: 'Bytes', length: 84}, {tag: 'Uint', maxval: '1'}, {tag: 'Uint', maxval: '31'}, {tag: 'Struct', name: 'Secp256r1EcdsaSignature', elements: [{name: 'r', type: {tag: 'Secp256r1Scalar'}}, {name: 's', type: {tag: 'Secp256r1Scalar'}}]}], resultType: {tag: 'Tuple', types: []}},
  'endorseEntry': {pure: false, provable: true, argumentTypes: [{tag: 'Bytes', length: 32}, {tag: 'Bytes', length: 32}, {tag: 'Bytes', length: 32}, {tag: 'Secp256r1Point'}, {tag: 'Bytes', length: 37}, {tag: 'Bytes', length: 43}, {tag: 'Bytes', length: 84}, {tag: 'Uint', maxval: '1'}, {tag: 'Uint', maxval: '31'}, {tag: 'Struct', name: 'Secp256r1EcdsaSignature', elements: [{name: 'r', type: {tag: 'Secp256r1Scalar'}}, {name: 's', type: {tag: 'Secp256r1Scalar'}}]}], resultType: {tag: 'Tuple', types: []}},
};

export const declaredInterfaces = {};

//# sourceMappingURL=index.js.map
