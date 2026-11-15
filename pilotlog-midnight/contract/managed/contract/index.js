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

const _descriptor_4 = new __compactRuntime.CompactTypeUnsignedInteger(65535n, 2);

const _descriptor_5 = __compactRuntime.CompactTypeSecp256r1Point;

const _descriptor_6 = new __compactRuntime.CompactTypeBytes(37);

const _descriptor_7 = new __compactRuntime.CompactTypeBytes(43);

const _descriptor_8 = new __compactRuntime.CompactTypeBytes(74);

const _descriptor_9 = new __compactRuntime.CompactTypeUnsignedInteger(1n, 1);

const _descriptor_10 = new __compactRuntime.CompactTypeUnsignedInteger(31n, 1);

const _descriptor_11 = __compactRuntime.CompactTypeSecp256r1Scalar;

class _Secp256r1EcdsaSignature_0 {
  alignment() {
    return _descriptor_11.alignment().concat(_descriptor_11.alignment());
  }
  fromValue(value_0) {
    return {
      r: _descriptor_11.fromValue(value_0),
      s: _descriptor_11.fromValue(value_0)
    }
  }
  toValue(value_0) {
    return _descriptor_11.toValue(value_0.r).concat(_descriptor_11.toValue(value_0.s));
  }
}

const _descriptor_12 = new _Secp256r1EcdsaSignature_0();

class _Endorsement_0 {
  alignment() {
    return _descriptor_0.alignment().concat(_descriptor_0.alignment().concat(_descriptor_0.alignment().concat(_descriptor_1.alignment())));
  }
  fromValue(value_0) {
    return {
      entryHash: _descriptor_0.fromValue(value_0),
      keyId: _descriptor_0.fromValue(value_0),
      studentCommit: _descriptor_0.fromValue(value_0),
      seq: _descriptor_1.fromValue(value_0)
    }
  }
  toValue(value_0) {
    return _descriptor_0.toValue(value_0.entryHash).concat(_descriptor_0.toValue(value_0.keyId).concat(_descriptor_0.toValue(value_0.studentCommit).concat(_descriptor_1.toValue(value_0.seq))));
  }
}

const _descriptor_13 = new _Endorsement_0();

const _descriptor_14 = new __compactRuntime.CompactTypeUnsignedInteger(255n, 1);

const _descriptor_15 = __compactRuntime.CompactTypeField;

const _descriptor_16 = __compactRuntime.CompactTypeSecp256r1Base;

class _tuple_0 {
  alignment() {
    return _descriptor_6.alignment().concat(_descriptor_0.alignment());
  }
  fromValue(value_0) {
    return [
      _descriptor_6.fromValue(value_0),
      _descriptor_0.fromValue(value_0)
    ]
  }
  toValue(value_0) {
    return _descriptor_6.toValue(value_0[0]).concat(_descriptor_0.toValue(value_0[1]));
  }
}

const _descriptor_17 = new _tuple_0();

const _descriptor_18 = new __compactRuntime.CompactTypeBytes(36);

class _tuple_1 {
  alignment() {
    return _descriptor_18.alignment().concat(_descriptor_7.alignment().concat(_descriptor_8.alignment()));
  }
  fromValue(value_0) {
    return [
      _descriptor_18.fromValue(value_0),
      _descriptor_7.fromValue(value_0),
      _descriptor_8.fromValue(value_0)
    ]
  }
  toValue(value_0) {
    return _descriptor_18.toValue(value_0[0]).concat(_descriptor_7.toValue(value_0[1]).concat(_descriptor_8.toValue(value_0[2])));
  }
}

const _descriptor_19 = new _tuple_1();

const _descriptor_20 = new __compactRuntime.CompactTypeVector(4, _descriptor_0);

const _descriptor_21 = new __compactRuntime.CompactTypeVector(3, _descriptor_0);

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

const _descriptor_22 = new _tuple_2();

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

const _descriptor_23 = new _Either_0();

const _descriptor_24 = new __compactRuntime.CompactTypeUnsignedInteger(340282366920938463463374607431768211455n, 16);

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

const _descriptor_25 = new _UserAddress_0();

class _Either_1 {
  alignment() {
    return _descriptor_2.alignment().concat(_descriptor_3.alignment().concat(_descriptor_25.alignment()));
  }
  fromValue(value_0) {
    return {
      is_left: _descriptor_2.fromValue(value_0),
      left: _descriptor_3.fromValue(value_0),
      right: _descriptor_25.fromValue(value_0)
    }
  }
  toValue(value_0) {
    return _descriptor_2.toValue(value_0.is_left).concat(_descriptor_3.toValue(value_0.left).concat(_descriptor_25.toValue(value_0.right)));
  }
}

const _descriptor_26 = new _Either_1();

class _Maybe_0 {
  alignment() {
    return _descriptor_2.alignment().concat(_descriptor_26.alignment());
  }
  fromValue(value_0) {
    return {
      is_some: _descriptor_2.fromValue(value_0),
      value: _descriptor_26.fromValue(value_0)
    }
  }
  toValue(value_0) {
    return _descriptor_2.toValue(value_0.is_some).concat(_descriptor_26.toValue(value_0.value));
  }
}

const _descriptor_27 = new _Maybe_0();

const _descriptor_28 = new __compactRuntime.CompactTypeUnsignedInteger(4294967295n, 4);

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
    if (typeof(witnesses_0.adminSecret) !== 'function') {
      throw new __compactRuntime.CompactError('first (witnesses) argument to Contract constructor does not contain a function-valued field named adminSecret');
    }
    this.witnesses = witnesses_0;
    this.circuits = {
      async adminCommitment(context, ...args_1) {
        return { result: pureCircuits.adminCommitment(...args_1), context };
      },
      async keyIdOf(context, ...args_1) {
        return { result: pureCircuits.keyIdOf(...args_1), context };
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
      enrollCfi: async (...args_1) => {
        if (args_1.length !== 3) {
          throw new __compactRuntime.CompactError(`enrollCfi: expected 3 arguments (as invoked from Typescript), received ${args_1.length}`);
        }
        const contextOrig_0 = args_1[0];
        const keyId_0 = args_1[1];
        const cfiRef_0 = args_1[2];
        if (!(typeof(contextOrig_0) === 'object' && contextOrig_0.callContext.currentQueryContext != undefined)) {
          __compactRuntime.typeError('enrollCfi',
                                     'argument 1 (as invoked from Typescript)',
                                     'cfi_endorse.compact line 121 char 1',
                                     'CircuitContext',
                                     contextOrig_0)
        }
        if (!(keyId_0.buffer instanceof ArrayBuffer && keyId_0.BYTES_PER_ELEMENT === 1 && keyId_0.length === 32)) {
          __compactRuntime.typeError('enrollCfi',
                                     'argument 1 (argument 2 as invoked from Typescript)',
                                     'cfi_endorse.compact line 121 char 1',
                                     'Bytes<32>',
                                     keyId_0)
        }
        if (!(cfiRef_0.buffer instanceof ArrayBuffer && cfiRef_0.BYTES_PER_ELEMENT === 1 && cfiRef_0.length === 32)) {
          __compactRuntime.typeError('enrollCfi',
                                     'argument 2 (argument 3 as invoked from Typescript)',
                                     'cfi_endorse.compact line 121 char 1',
                                     'Bytes<32>',
                                     cfiRef_0)
        }
        const context = __compactRuntime.copyCircuitContext(contextOrig_0);
        const partialProofData = {
          input: {
            value: _descriptor_0.toValue(keyId_0).concat(_descriptor_0.toValue(cfiRef_0)),
            alignment: _descriptor_0.alignment().concat(_descriptor_0.alignment())
          },
          output: undefined,
          publicTranscript: [],
          privateTranscriptOutputs: []
        };
        const result_0 = await this._enrollCfi_0(context,
                                                 partialProofData,
                                                 keyId_0,
                                                 cfiRef_0);
        partialProofData.output = { value: [], alignment: [] };
        __compactRuntime.finalizeCallProofData(context, partialProofData);
        return { result: result_0, context: context, gasCost: context.callContext.currentGasCost };
      },
      revokeCfi: async (...args_1) => {
        if (args_1.length !== 2) {
          throw new __compactRuntime.CompactError(`revokeCfi: expected 2 arguments (as invoked from Typescript), received ${args_1.length}`);
        }
        const contextOrig_0 = args_1[0];
        const keyId_0 = args_1[1];
        if (!(typeof(contextOrig_0) === 'object' && contextOrig_0.callContext.currentQueryContext != undefined)) {
          __compactRuntime.typeError('revokeCfi',
                                     'argument 1 (as invoked from Typescript)',
                                     'cfi_endorse.compact line 129 char 1',
                                     'CircuitContext',
                                     contextOrig_0)
        }
        if (!(keyId_0.buffer instanceof ArrayBuffer && keyId_0.BYTES_PER_ELEMENT === 1 && keyId_0.length === 32)) {
          __compactRuntime.typeError('revokeCfi',
                                     'argument 1 (argument 2 as invoked from Typescript)',
                                     'cfi_endorse.compact line 129 char 1',
                                     'Bytes<32>',
                                     keyId_0)
        }
        const context = __compactRuntime.copyCircuitContext(contextOrig_0);
        const partialProofData = {
          input: {
            value: _descriptor_0.toValue(keyId_0),
            alignment: _descriptor_0.alignment()
          },
          output: undefined,
          publicTranscript: [],
          privateTranscriptOutputs: []
        };
        const result_0 = await this._revokeCfi_0(context,
                                                 partialProofData,
                                                 keyId_0);
        partialProofData.output = { value: [], alignment: [] };
        __compactRuntime.finalizeCallProofData(context, partialProofData);
        return { result: result_0, context: context, gasCost: context.callContext.currentGasCost };
      },
      rotateAdmin: async (...args_1) => {
        if (args_1.length !== 2) {
          throw new __compactRuntime.CompactError(`rotateAdmin: expected 2 arguments (as invoked from Typescript), received ${args_1.length}`);
        }
        const contextOrig_0 = args_1[0];
        const newAdminCommit_0 = args_1[1];
        if (!(typeof(contextOrig_0) === 'object' && contextOrig_0.callContext.currentQueryContext != undefined)) {
          __compactRuntime.typeError('rotateAdmin',
                                     'argument 1 (as invoked from Typescript)',
                                     'cfi_endorse.compact line 138 char 1',
                                     'CircuitContext',
                                     contextOrig_0)
        }
        if (!(newAdminCommit_0.buffer instanceof ArrayBuffer && newAdminCommit_0.BYTES_PER_ELEMENT === 1 && newAdminCommit_0.length === 32)) {
          __compactRuntime.typeError('rotateAdmin',
                                     'argument 1 (argument 2 as invoked from Typescript)',
                                     'cfi_endorse.compact line 138 char 1',
                                     'Bytes<32>',
                                     newAdminCommit_0)
        }
        const context = __compactRuntime.copyCircuitContext(contextOrig_0);
        const partialProofData = {
          input: {
            value: _descriptor_0.toValue(newAdminCommit_0),
            alignment: _descriptor_0.alignment()
          },
          output: undefined,
          publicTranscript: [],
          privateTranscriptOutputs: []
        };
        const result_0 = await this._rotateAdmin_0(context,
                                                   partialProofData,
                                                   newAdminCommit_0);
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
                                     'cfi_endorse.compact line 145 char 1',
                                     'CircuitContext',
                                     contextOrig_0)
        }
        if (!(__compactRuntime.isValidSecp256r1Point(cfiPubKey_0))) {
          __compactRuntime.typeError('selfRevoke',
                                     'argument 1 (argument 2 as invoked from Typescript)',
                                     'cfi_endorse.compact line 145 char 1',
                                     'Secp256r1Point',
                                     cfiPubKey_0)
        }
        if (!(authData_0.buffer instanceof ArrayBuffer && authData_0.BYTES_PER_ELEMENT === 1 && authData_0.length === 37)) {
          __compactRuntime.typeError('selfRevoke',
                                     'argument 2 (argument 3 as invoked from Typescript)',
                                     'cfi_endorse.compact line 145 char 1',
                                     'Bytes<37>',
                                     authData_0)
        }
        if (!(challenge_0.buffer instanceof ArrayBuffer && challenge_0.BYTES_PER_ELEMENT === 1 && challenge_0.length === 43)) {
          __compactRuntime.typeError('selfRevoke',
                                     'argument 3 (argument 4 as invoked from Typescript)',
                                     'cfi_endorse.compact line 145 char 1',
                                     'Bytes<43>',
                                     challenge_0)
        }
        if (!(cdSuffix_0.buffer instanceof ArrayBuffer && cdSuffix_0.BYTES_PER_ELEMENT === 1 && cdSuffix_0.length === 74)) {
          __compactRuntime.typeError('selfRevoke',
                                     'argument 4 (argument 5 as invoked from Typescript)',
                                     'cfi_endorse.compact line 145 char 1',
                                     'Bytes<74>',
                                     cdSuffix_0)
        }
        if (!(typeof(flagsBit1_0) === 'bigint' && flagsBit1_0 >= 0n && flagsBit1_0 <= 1n)) {
          __compactRuntime.typeError('selfRevoke',
                                     'argument 5 (argument 6 as invoked from Typescript)',
                                     'cfi_endorse.compact line 145 char 1',
                                     'Uint<0..2>',
                                     flagsBit1_0)
        }
        if (!(typeof(flagsHigh_0) === 'bigint' && flagsHigh_0 >= 0n && flagsHigh_0 <= 31n)) {
          __compactRuntime.typeError('selfRevoke',
                                     'argument 6 (argument 7 as invoked from Typescript)',
                                     'cfi_endorse.compact line 145 char 1',
                                     'Uint<0..32>',
                                     flagsHigh_0)
        }
        if (!(typeof(sig_0) === 'object' && typeof(sig_0.r) === 'bigint' && sig_0.r >= 0 && sig_0.r <= __compactRuntime.MAX_SECP256R1_SCALAR && typeof(sig_0.s) === 'bigint' && sig_0.s >= 0 && sig_0.s <= __compactRuntime.MAX_SECP256R1_SCALAR)) {
          __compactRuntime.typeError('selfRevoke',
                                     'argument 7 (argument 8 as invoked from Typescript)',
                                     'cfi_endorse.compact line 145 char 1',
                                     'struct Secp256r1EcdsaSignature<r: Secp256r1Scalar, s: Secp256r1Scalar>',
                                     sig_0)
        }
        const context = __compactRuntime.copyCircuitContext(contextOrig_0);
        const partialProofData = {
          input: {
            value: _descriptor_5.toValue(cfiPubKey_0).concat(_descriptor_6.toValue(authData_0).concat(_descriptor_7.toValue(challenge_0).concat(_descriptor_8.toValue(cdSuffix_0).concat(_descriptor_9.toValue(flagsBit1_0).concat(_descriptor_10.toValue(flagsHigh_0).concat(_descriptor_12.toValue(sig_0))))))),
            alignment: _descriptor_5.alignment().concat(_descriptor_6.alignment().concat(_descriptor_7.alignment().concat(_descriptor_8.alignment().concat(_descriptor_9.alignment().concat(_descriptor_10.alignment().concat(_descriptor_12.alignment()))))))
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
        if (args_1.length !== 10) {
          throw new __compactRuntime.CompactError(`endorseEntry: expected 10 arguments (as invoked from Typescript), received ${args_1.length}`);
        }
        const contextOrig_0 = args_1[0];
        const entryHash_0 = args_1[1];
        const studentCommit_0 = args_1[2];
        const cfiPubKey_0 = args_1[3];
        const authData_0 = args_1[4];
        const challenge_0 = args_1[5];
        const cdSuffix_0 = args_1[6];
        const flagsBit1_0 = args_1[7];
        const flagsHigh_0 = args_1[8];
        const sig_0 = args_1[9];
        if (!(typeof(contextOrig_0) === 'object' && contextOrig_0.callContext.currentQueryContext != undefined)) {
          __compactRuntime.typeError('endorseEntry',
                                     'argument 1 (as invoked from Typescript)',
                                     'cfi_endorse.compact line 157 char 1',
                                     'CircuitContext',
                                     contextOrig_0)
        }
        if (!(entryHash_0.buffer instanceof ArrayBuffer && entryHash_0.BYTES_PER_ELEMENT === 1 && entryHash_0.length === 32)) {
          __compactRuntime.typeError('endorseEntry',
                                     'argument 1 (argument 2 as invoked from Typescript)',
                                     'cfi_endorse.compact line 157 char 1',
                                     'Bytes<32>',
                                     entryHash_0)
        }
        if (!(studentCommit_0.buffer instanceof ArrayBuffer && studentCommit_0.BYTES_PER_ELEMENT === 1 && studentCommit_0.length === 32)) {
          __compactRuntime.typeError('endorseEntry',
                                     'argument 2 (argument 3 as invoked from Typescript)',
                                     'cfi_endorse.compact line 157 char 1',
                                     'Bytes<32>',
                                     studentCommit_0)
        }
        if (!(__compactRuntime.isValidSecp256r1Point(cfiPubKey_0))) {
          __compactRuntime.typeError('endorseEntry',
                                     'argument 3 (argument 4 as invoked from Typescript)',
                                     'cfi_endorse.compact line 157 char 1',
                                     'Secp256r1Point',
                                     cfiPubKey_0)
        }
        if (!(authData_0.buffer instanceof ArrayBuffer && authData_0.BYTES_PER_ELEMENT === 1 && authData_0.length === 37)) {
          __compactRuntime.typeError('endorseEntry',
                                     'argument 4 (argument 5 as invoked from Typescript)',
                                     'cfi_endorse.compact line 157 char 1',
                                     'Bytes<37>',
                                     authData_0)
        }
        if (!(challenge_0.buffer instanceof ArrayBuffer && challenge_0.BYTES_PER_ELEMENT === 1 && challenge_0.length === 43)) {
          __compactRuntime.typeError('endorseEntry',
                                     'argument 5 (argument 6 as invoked from Typescript)',
                                     'cfi_endorse.compact line 157 char 1',
                                     'Bytes<43>',
                                     challenge_0)
        }
        if (!(cdSuffix_0.buffer instanceof ArrayBuffer && cdSuffix_0.BYTES_PER_ELEMENT === 1 && cdSuffix_0.length === 74)) {
          __compactRuntime.typeError('endorseEntry',
                                     'argument 6 (argument 7 as invoked from Typescript)',
                                     'cfi_endorse.compact line 157 char 1',
                                     'Bytes<74>',
                                     cdSuffix_0)
        }
        if (!(typeof(flagsBit1_0) === 'bigint' && flagsBit1_0 >= 0n && flagsBit1_0 <= 1n)) {
          __compactRuntime.typeError('endorseEntry',
                                     'argument 7 (argument 8 as invoked from Typescript)',
                                     'cfi_endorse.compact line 157 char 1',
                                     'Uint<0..2>',
                                     flagsBit1_0)
        }
        if (!(typeof(flagsHigh_0) === 'bigint' && flagsHigh_0 >= 0n && flagsHigh_0 <= 31n)) {
          __compactRuntime.typeError('endorseEntry',
                                     'argument 8 (argument 9 as invoked from Typescript)',
                                     'cfi_endorse.compact line 157 char 1',
                                     'Uint<0..32>',
                                     flagsHigh_0)
        }
        if (!(typeof(sig_0) === 'object' && typeof(sig_0.r) === 'bigint' && sig_0.r >= 0 && sig_0.r <= __compactRuntime.MAX_SECP256R1_SCALAR && typeof(sig_0.s) === 'bigint' && sig_0.s >= 0 && sig_0.s <= __compactRuntime.MAX_SECP256R1_SCALAR)) {
          __compactRuntime.typeError('endorseEntry',
                                     'argument 9 (argument 10 as invoked from Typescript)',
                                     'cfi_endorse.compact line 157 char 1',
                                     'struct Secp256r1EcdsaSignature<r: Secp256r1Scalar, s: Secp256r1Scalar>',
                                     sig_0)
        }
        const context = __compactRuntime.copyCircuitContext(contextOrig_0);
        const partialProofData = {
          input: {
            value: _descriptor_0.toValue(entryHash_0).concat(_descriptor_0.toValue(studentCommit_0).concat(_descriptor_5.toValue(cfiPubKey_0).concat(_descriptor_6.toValue(authData_0).concat(_descriptor_7.toValue(challenge_0).concat(_descriptor_8.toValue(cdSuffix_0).concat(_descriptor_9.toValue(flagsBit1_0).concat(_descriptor_10.toValue(flagsHigh_0).concat(_descriptor_12.toValue(sig_0))))))))),
            alignment: _descriptor_0.alignment().concat(_descriptor_0.alignment().concat(_descriptor_5.alignment().concat(_descriptor_6.alignment().concat(_descriptor_7.alignment().concat(_descriptor_8.alignment().concat(_descriptor_9.alignment().concat(_descriptor_10.alignment().concat(_descriptor_12.alignment()))))))))
          },
          output: undefined,
          publicTranscript: [],
          privateTranscriptOutputs: []
        };
        const result_0 = await this._endorseEntry_0(context,
                                                    partialProofData,
                                                    entryHash_0,
                                                    studentCommit_0,
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
      enrollCfi: this.circuits.enrollCfi,
      revokeCfi: this.circuits.revokeCfi,
      rotateAdmin: this.circuits.rotateAdmin,
      selfRevoke: this.circuits.selfRevoke,
      endorseEntry: this.circuits.endorseEntry
    };
    this.provableCircuits = {
      enrollCfi: this.circuits.enrollCfi,
      revokeCfi: this.circuits.revokeCfi,
      rotateAdmin: this.circuits.rotateAdmin,
      selfRevoke: this.circuits.selfRevoke,
      endorseEntry: this.circuits.endorseEntry
    };
  }
  async initialState(...args_0) {
    if (args_0.length !== 2) {
      throw new __compactRuntime.CompactError(`Contract state constructor: expected 2 arguments (as invoked from Typescript), received ${args_0.length}`);
    }
    const constructorContext_0 = args_0[0];
    const adminCommit_0 = args_0[1];
    if (typeof(constructorContext_0) !== 'object') {
      throw new __compactRuntime.CompactError(`Contract state constructor: expected 'constructorContext' in argument 1 (as invoked from Typescript) to be an object`);
    }
    if (!('initialPrivateState' in constructorContext_0)) {
      throw new __compactRuntime.CompactError(`Contract state constructor: expected 'initialPrivateState' in argument 1 (as invoked from Typescript)`);
    }
    if (!('initialZswapLocalState' in constructorContext_0)) {
      throw new __compactRuntime.CompactError(`Contract state constructor: expected 'initialZswapLocalState' in argument 1 (as invoked from Typescript)`);
    }
    if (typeof(constructorContext_0.initialZswapLocalState) !== 'object') {
      throw new __compactRuntime.CompactError(`Contract state constructor: expected 'initialZswapLocalState' in argument 1 (as invoked from Typescript) to be an object`);
    }
    if (!(adminCommit_0.buffer instanceof ArrayBuffer && adminCommit_0.BYTES_PER_ELEMENT === 1 && adminCommit_0.length === 32)) {
      __compactRuntime.typeError('Contract state constructor',
                                 'argument 1 (argument 2 as invoked from Typescript)',
                                 'cfi_endorse.compact line 30 char 1',
                                 'Bytes<32>',
                                 adminCommit_0)
    }
    const state_0 = new __compactRuntime.ContractState();
    let stateValue_0 = __compactRuntime.StateValue.newArray();
    stateValue_0 = stateValue_0.arrayPush(__compactRuntime.StateValue.newNull());
    stateValue_0 = stateValue_0.arrayPush(__compactRuntime.StateValue.newNull());
    stateValue_0 = stateValue_0.arrayPush(__compactRuntime.StateValue.newNull());
    stateValue_0 = stateValue_0.arrayPush(__compactRuntime.StateValue.newNull());
    stateValue_0 = stateValue_0.arrayPush(__compactRuntime.StateValue.newNull());
    state_0.data = new __compactRuntime.ChargedState(stateValue_0);
    state_0.setOperation('enrollCfi', new __compactRuntime.ContractOperation());
    state_0.setOperation('revokeCfi', new __compactRuntime.ContractOperation());
    state_0.setOperation('rotateAdmin', new __compactRuntime.ContractOperation());
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
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_14.toValue(0n),
                                                                                              alignment: _descriptor_14.alignment() }).encode() } },
                                       { push: { storage: true,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_0.toValue(new Uint8Array(32)),
                                                                                              alignment: _descriptor_0.alignment() }).encode() } },
                                       { ins: { cached: false, n: 1 } }]);
    __compactRuntime.queryLedgerState(context,
                                      partialProofData,
                                      [
                                       { push: { storage: false,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_14.toValue(1n),
                                                                                              alignment: _descriptor_14.alignment() }).encode() } },
                                       { push: { storage: true,
                                                 value: __compactRuntime.StateValue.newMap(
                                                          new __compactRuntime.StateMap()
                                                        ).encode() } },
                                       { ins: { cached: false, n: 1 } }]);
    __compactRuntime.queryLedgerState(context,
                                      partialProofData,
                                      [
                                       { push: { storage: false,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_14.toValue(2n),
                                                                                              alignment: _descriptor_14.alignment() }).encode() } },
                                       { push: { storage: true,
                                                 value: __compactRuntime.StateValue.newMap(
                                                          new __compactRuntime.StateMap()
                                                        ).encode() } },
                                       { ins: { cached: false, n: 1 } }]);
    __compactRuntime.queryLedgerState(context,
                                      partialProofData,
                                      [
                                       { push: { storage: false,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_14.toValue(3n),
                                                                                              alignment: _descriptor_14.alignment() }).encode() } },
                                       { push: { storage: true,
                                                 value: __compactRuntime.StateValue.newMap(
                                                          new __compactRuntime.StateMap()
                                                        ).encode() } },
                                       { ins: { cached: false, n: 1 } }]);
    __compactRuntime.queryLedgerState(context,
                                      partialProofData,
                                      [
                                       { push: { storage: false,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_14.toValue(4n),
                                                                                              alignment: _descriptor_14.alignment() }).encode() } },
                                       { push: { storage: true,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_1.toValue(0n),
                                                                                              alignment: _descriptor_1.alignment() }).encode() } },
                                       { ins: { cached: false, n: 1 } }]);
    __compactRuntime.queryLedgerState(context,
                                      partialProofData,
                                      [
                                       { push: { storage: false,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_14.toValue(0n),
                                                                                              alignment: _descriptor_14.alignment() }).encode() } },
                                       { push: { storage: true,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_0.toValue(adminCommit_0),
                                                                                              alignment: _descriptor_0.alignment() }).encode() } },
                                       { ins: { cached: false, n: 1 } }]);
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
    const result_0 = __compactRuntime.persistentHash(_descriptor_22, value_0);
    return result_0;
  }
  _persistentHash_1(value_0) {
    const result_0 = __compactRuntime.persistentHash(_descriptor_20, value_0);
    return result_0;
  }
  _persistentHash_2(value_0) {
    const result_0 = __compactRuntime.persistentHash(_descriptor_21, value_0);
    return result_0;
  }
  _persistentHash_3(value_0) {
    const result_0 = __compactRuntime.persistentHash(_descriptor_19, value_0);
    return result_0;
  }
  _persistentHash_4(value_0) {
    const result_0 = __compactRuntime.persistentHash(_descriptor_0, value_0);
    return result_0;
  }
  _persistentHash_5(value_0) {
    const result_0 = __compactRuntime.persistentHash(_descriptor_17, value_0);
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
  _adminSecret_0(context, partialProofData) {
    const witnessContext_0 = __compactRuntime.createWitnessContext(ledger(context.callContext.currentQueryContext.state), context.callContext.currentPrivateState, context.callContext.currentQueryContext.address);
    const [nextPrivateState_0, result_0] = this.witnesses.adminSecret(witnessContext_0);
    context.callContext.currentPrivateState = nextPrivateState_0;
    if (!(result_0.buffer instanceof ArrayBuffer && result_0.BYTES_PER_ELEMENT === 1 && result_0.length === 32)) {
      __compactRuntime.typeError('adminSecret',
                                 'return value',
                                 'cfi_endorse.compact line 28 char 1',
                                 'Bytes<32>',
                                 result_0)
    }
    partialProofData.privateTranscriptOutputs.push({
      value: _descriptor_0.toValue(result_0),
      alignment: _descriptor_0.alignment()
    });
    return result_0;
  }
  _adminCommitment_0(sk_0) {
    return this._persistentHash_0([new Uint8Array([112, 105, 108, 111, 116, 108, 111, 103, 58, 99, 102, 105, 45, 97, 100, 109, 105, 110, 58, 118, 49, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]),
                                   sk_0]);
  }
  async _assertAdmin_0(context, partialProofData) {
    __compactRuntime.assert(this._equal_1(_descriptor_0.fromValue(__compactRuntime.queryLedgerState(context,
                                                                                                    partialProofData,
                                                                                                    [
                                                                                                     { dup: { n: 0 } },
                                                                                                     { idx: { cached: false,
                                                                                                              pushPath: false,
                                                                                                              path: [
                                                                                                                     { tag: 'value',
                                                                                                                       value: { value: _descriptor_14.toValue(0n),
                                                                                                                                alignment: _descriptor_14.alignment() } }] } },
                                                                                                     { popeq: { cached: false,
                                                                                                                result: undefined } }]).value),
                                          this._adminCommitment_0(this._adminSecret_0(context,
                                                                                      partialProofData))),
                            'not the maintenance authority');
    return [];
  }
  _keyIdOf_0(pk_0) {
    return this._persistentHash_0([__compactRuntime.convertBigintToBytes(32,
                                                                         this._secp256r1PointX_0(pk_0),
                                                                         'cfi_endorse.compact line 44 char 8'),
                                   __compactRuntime.convertBigintToBytes(32,
                                                                         this._secp256r1PointY_0(pk_0),
                                                                         'cfi_endorse.compact line 44 char 42')]);
  }
  _endorseDigest_0(contractAddr_0, entryHash_0, studentCommit_0) {
    return this._persistentHash_1([new Uint8Array([112, 105, 108, 111, 116, 108, 111, 103, 58, 99, 102, 105, 45, 101, 110, 100, 111, 114, 115, 101, 58, 118, 49, 0, 0, 0, 0, 0, 0, 0, 0, 0]),
                                   contractAddr_0,
                                   entryHash_0,
                                   studentCommit_0]);
  }
  _revokeDigest_0(contractAddr_0, keyId_0) {
    return this._persistentHash_2([new Uint8Array([112, 105, 108, 111, 116, 108, 111, 103, 58, 99, 102, 105, 45, 114, 101, 118, 111, 107, 101, 58, 118, 49, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]),
                                   contractAddr_0,
                                   keyId_0]);
  }
  _endorsementKey_0(entryHash_0, keyId_0) {
    return this._persistentHash_2([new Uint8Array([112, 105, 108, 111, 116, 108, 111, 103, 58, 99, 102, 105, 45, 101, 110, 100, 111, 114, 115, 101, 109, 101, 110, 116, 58, 118, 49, 0, 0, 0, 0, 0]),
                                   entryHash_0,
                                   keyId_0]);
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
    __compactRuntime.assert(this._equal_2(cdSuffix_0,
                                          new Uint8Array([34, 44, 34, 111, 114, 105, 103, 105, 110, 34, 58, 34, 104, 116, 116, 112, 115, 58, 47, 47, 112, 105, 108, 111, 116, 108, 111, 103, 46, 100, 105, 103, 105, 116, 97, 108, 97, 118, 105, 97, 116, 105, 111, 110, 112, 111, 111, 108, 46, 99, 111, 109, 34, 44, 34, 99, 114, 111, 115, 115, 79, 114, 105, 103, 105, 110, 34, 58, 102, 97, 108, 115, 101, 125])),
                            'unsupported clientDataJSON (origin/crossOrigin/profile)');
    const clientDataHash_0 = this._persistentHash_3([new Uint8Array([123, 34, 116, 121, 112, 101, 34, 58, 34, 119, 101, 98, 97, 117, 116, 104, 110, 46, 103, 101, 116, 34, 44, 34, 99, 104, 97, 108, 108, 101, 110, 103, 101, 34, 58, 34]),
                                                     challenge_0,
                                                     cdSuffix_0]);
    const ad_0 = Array.from(authData_0, BigInt);
    const rv_0 = Array.from(this._persistentHash_4(new Uint8Array([112, 105, 108, 111, 116, 108, 111, 103, 46, 100, 105, 103, 105, 116, 97, 108, 97, 118, 105, 97, 116, 105, 111, 110, 112, 111, 111, 108, 46, 99, 111, 109])),
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
    const msgHash_0 = this._persistentHash_5([authData_0, clientDataHash_0]);
    __compactRuntime.assert(this._secp256r1EcdsaVerify_0(msgHash_0, sig_0, pk_0),
                            'passkey signature invalid');
    return [];
  }
  async _enrollCfi_0(context, partialProofData, keyId_0, cfiRef_0) {
    await this._assertAdmin_0(context, partialProofData);
    const k_0 = keyId_0;
    __compactRuntime.assert(!_descriptor_2.fromValue(__compactRuntime.queryLedgerState(context,
                                                                                       partialProofData,
                                                                                       [
                                                                                        { dup: { n: 0 } },
                                                                                        { idx: { cached: false,
                                                                                                 pushPath: false,
                                                                                                 path: [
                                                                                                        { tag: 'value',
                                                                                                          value: { value: _descriptor_14.toValue(2n),
                                                                                                                   alignment: _descriptor_14.alignment() } }] } },
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
                                                                                                          value: { value: _descriptor_14.toValue(1n),
                                                                                                                   alignment: _descriptor_14.alignment() } }] } },
                                                                                        { push: { storage: false,
                                                                                                  value: __compactRuntime.StateValue.newCell({ value: _descriptor_0.toValue(k_0),
                                                                                                                                               alignment: _descriptor_0.alignment() }).encode() } },
                                                                                        'member',
                                                                                        { popeq: { cached: true,
                                                                                                   result: undefined } }]).value),
                            'key already enrolled');
    __compactRuntime.queryLedgerState(context,
                                      partialProofData,
                                      [
                                       { idx: { cached: false,
                                                pushPath: true,
                                                path: [
                                                       { tag: 'value',
                                                         value: { value: _descriptor_14.toValue(1n),
                                                                  alignment: _descriptor_14.alignment() } }] } },
                                       { push: { storage: false,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_0.toValue(k_0),
                                                                                              alignment: _descriptor_0.alignment() }).encode() } },
                                       { push: { storage: true,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_0.toValue(cfiRef_0),
                                                                                              alignment: _descriptor_0.alignment() }).encode() } },
                                       { ins: { cached: false, n: 1 } },
                                       { ins: { cached: true, n: 1 } }]);
    return [];
  }
  async _revokeCfi_0(context, partialProofData, keyId_0) {
    await this._assertAdmin_0(context, partialProofData);
    const k_0 = keyId_0;
    __compactRuntime.assert(_descriptor_2.fromValue(__compactRuntime.queryLedgerState(context,
                                                                                      partialProofData,
                                                                                      [
                                                                                       { dup: { n: 0 } },
                                                                                       { idx: { cached: false,
                                                                                                pushPath: false,
                                                                                                path: [
                                                                                                       { tag: 'value',
                                                                                                         value: { value: _descriptor_14.toValue(1n),
                                                                                                                  alignment: _descriptor_14.alignment() } }] } },
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
                                                                                                          value: { value: _descriptor_14.toValue(2n),
                                                                                                                   alignment: _descriptor_14.alignment() } }] } },
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
                                                                                               value: { value: _descriptor_14.toValue(4n),
                                                                                                        alignment: _descriptor_14.alignment() } }] } },
                                                                             { popeq: { cached: true,
                                                                                        result: undefined } }]).value);
    __compactRuntime.queryLedgerState(context,
                                      partialProofData,
                                      [
                                       { idx: { cached: false,
                                                pushPath: true,
                                                path: [
                                                       { tag: 'value',
                                                         value: { value: _descriptor_14.toValue(2n),
                                                                  alignment: _descriptor_14.alignment() } }] } },
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
                                                         value: { value: _descriptor_14.toValue(4n),
                                                                  alignment: _descriptor_14.alignment() } }] } },
                                       { addi: { immediate: parseInt(__compactRuntime.valueToBigInt(
                                                              { value: _descriptor_4.toValue(tmp_1),
                                                                alignment: _descriptor_4.alignment() }
                                                                .value
                                                            )) } },
                                       { ins: { cached: true, n: 1 } }]);
    return [];
  }
  async _rotateAdmin_0(context, partialProofData, newAdminCommit_0) {
    await this._assertAdmin_0(context, partialProofData);
    __compactRuntime.queryLedgerState(context,
                                      partialProofData,
                                      [
                                       { push: { storage: false,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_14.toValue(0n),
                                                                                              alignment: _descriptor_14.alignment() }).encode() } },
                                       { push: { storage: true,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_0.toValue(newAdminCommit_0),
                                                                                              alignment: _descriptor_0.alignment() }).encode() } },
                                       { ins: { cached: false, n: 1 } }]);
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
                                                                                                                            value: { value: _descriptor_14.toValue(0n),
                                                                                                                                     alignment: _descriptor_14.alignment() } }] } },
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
                                                                                                         value: { value: _descriptor_14.toValue(1n),
                                                                                                                  alignment: _descriptor_14.alignment() } }] } },
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
                                                                                                          value: { value: _descriptor_14.toValue(2n),
                                                                                                                   alignment: _descriptor_14.alignment() } }] } },
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
                                                                                               value: { value: _descriptor_14.toValue(4n),
                                                                                                        alignment: _descriptor_14.alignment() } }] } },
                                                                             { popeq: { cached: true,
                                                                                        result: undefined } }]).value);
    __compactRuntime.queryLedgerState(context,
                                      partialProofData,
                                      [
                                       { idx: { cached: false,
                                                pushPath: true,
                                                path: [
                                                       { tag: 'value',
                                                         value: { value: _descriptor_14.toValue(2n),
                                                                  alignment: _descriptor_14.alignment() } }] } },
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
                                                         value: { value: _descriptor_14.toValue(4n),
                                                                  alignment: _descriptor_14.alignment() } }] } },
                                       { addi: { immediate: parseInt(__compactRuntime.valueToBigInt(
                                                              { value: _descriptor_4.toValue(tmp_1),
                                                                alignment: _descriptor_4.alignment() }
                                                                .value
                                                            )) } },
                                       { ins: { cached: true, n: 1 } }]);
    return [];
  }
  async _endorseEntry_0(context,
                        partialProofData,
                        entryHash_0,
                        studentCommit_0,
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
                                                                                                                             value: { value: _descriptor_14.toValue(0n),
                                                                                                                                      alignment: _descriptor_14.alignment() } }] } },
                                                                                                           { popeq: { cached: true,
                                                                                                                      result: undefined } }]).value).bytes,
                                                e_0,
                                                sc_0),
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
                                                                                                         value: { value: _descriptor_14.toValue(1n),
                                                                                                                  alignment: _descriptor_14.alignment() } }] } },
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
                                                                                                          value: { value: _descriptor_14.toValue(2n),
                                                                                                                   alignment: _descriptor_14.alignment() } }] } },
                                                                                        { push: { storage: false,
                                                                                                  value: __compactRuntime.StateValue.newCell({ value: _descriptor_0.toValue(k_0),
                                                                                                                                               alignment: _descriptor_0.alignment() }).encode() } },
                                                                                        'member',
                                                                                        { popeq: { cached: true,
                                                                                                   result: undefined } }]).value),
                            'CFI key revoked');
    const ek_0 = this._endorsementKey_0(e_0, k_0);
    __compactRuntime.assert(!_descriptor_2.fromValue(__compactRuntime.queryLedgerState(context,
                                                                                       partialProofData,
                                                                                       [
                                                                                        { dup: { n: 0 } },
                                                                                        { idx: { cached: false,
                                                                                                 pushPath: false,
                                                                                                 path: [
                                                                                                        { tag: 'value',
                                                                                                          value: { value: _descriptor_14.toValue(3n),
                                                                                                                   alignment: _descriptor_14.alignment() } }] } },
                                                                                        { push: { storage: false,
                                                                                                  value: __compactRuntime.StateValue.newCell({ value: _descriptor_0.toValue(ek_0),
                                                                                                                                               alignment: _descriptor_0.alignment() }).encode() } },
                                                                                        'member',
                                                                                        { popeq: { cached: true,
                                                                                                   result: undefined } }]).value),
                            'entry already endorsed by this CFI');
    const tmp_0 = { entryHash: e_0,
                    keyId: k_0,
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
                                                                                                   value: { value: _descriptor_14.toValue(4n),
                                                                                                            alignment: _descriptor_14.alignment() } }] } },
                                                                                 { popeq: { cached: true,
                                                                                            result: undefined } }]).value) };
    __compactRuntime.queryLedgerState(context,
                                      partialProofData,
                                      [
                                       { idx: { cached: false,
                                                pushPath: true,
                                                path: [
                                                       { tag: 'value',
                                                         value: { value: _descriptor_14.toValue(3n),
                                                                  alignment: _descriptor_14.alignment() } }] } },
                                       { push: { storage: false,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_0.toValue(ek_0),
                                                                                              alignment: _descriptor_0.alignment() }).encode() } },
                                       { push: { storage: true,
                                                 value: __compactRuntime.StateValue.newCell({ value: _descriptor_13.toValue(tmp_0),
                                                                                              alignment: _descriptor_13.alignment() }).encode() } },
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
                                                         value: { value: _descriptor_14.toValue(4n),
                                                                  alignment: _descriptor_14.alignment() } }] } },
                                       { addi: { immediate: parseInt(__compactRuntime.valueToBigInt(
                                                              { value: _descriptor_4.toValue(tmp_1),
                                                                alignment: _descriptor_4.alignment() }
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
  _equal_1(x0, y0) {
    if (!x0.every((x, i) => y0[i] === x)) { return false; }
    return true;
  }
  _folder_0(f, x, a0) {
    for (let i = 0; i < 10; i++) { x = f(x, a0[i]); }
    return x;
  }
  _equal_2(x0, y0) {
    if (!x0.every((x, i) => y0[i] === x)) { return false; }
    return true;
  }
  _folder_1(f, x, a0) {
    for (let i = 0; i < 32; i++) { x = f(x, a0[i]); }
    return x;
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
    get admin() {
      return _descriptor_0.fromValue(__compactRuntime.queryLedgerState(context,
                                                                       partialProofData,
                                                                       [
                                                                        { dup: { n: 0 } },
                                                                        { idx: { cached: false,
                                                                                 pushPath: false,
                                                                                 path: [
                                                                                        { tag: 'value',
                                                                                          value: { value: _descriptor_14.toValue(0n),
                                                                                                   alignment: _descriptor_14.alignment() } }] } },
                                                                        { popeq: { cached: false,
                                                                                   result: undefined } }]).value);
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
                                                                                            value: { value: _descriptor_14.toValue(1n),
                                                                                                     alignment: _descriptor_14.alignment() } }] } },
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
                                                                                            value: { value: _descriptor_14.toValue(1n),
                                                                                                     alignment: _descriptor_14.alignment() } }] } },
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
                                     'cfi_endorse.compact line 22 char 1',
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
                                                                                            value: { value: _descriptor_14.toValue(1n),
                                                                                                     alignment: _descriptor_14.alignment() } }] } },
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
                                     'cfi_endorse.compact line 22 char 1',
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
                                                                                            value: { value: _descriptor_14.toValue(1n),
                                                                                                     alignment: _descriptor_14.alignment() } }] } },
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
        const self_0 = state.asArray()[1];
        return self_0.asMap().keys().map(  (key) => {    const value = self_0.asMap().get(key).asCell();    return [      _descriptor_0.fromValue(key.value),      _descriptor_0.fromValue(value.value)    ];  })[Symbol.iterator]();
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
                                                                                            value: { value: _descriptor_14.toValue(2n),
                                                                                                     alignment: _descriptor_14.alignment() } }] } },
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
                                                                                            value: { value: _descriptor_14.toValue(2n),
                                                                                                     alignment: _descriptor_14.alignment() } }] } },
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
                                     'cfi_endorse.compact line 23 char 1',
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
                                                                                            value: { value: _descriptor_14.toValue(2n),
                                                                                                     alignment: _descriptor_14.alignment() } }] } },
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
                                     'cfi_endorse.compact line 23 char 1',
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
                                                                                            value: { value: _descriptor_14.toValue(2n),
                                                                                                     alignment: _descriptor_14.alignment() } }] } },
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
                                                                                            value: { value: _descriptor_14.toValue(3n),
                                                                                                     alignment: _descriptor_14.alignment() } }] } },
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
                                                                                            value: { value: _descriptor_14.toValue(3n),
                                                                                                     alignment: _descriptor_14.alignment() } }] } },
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
                                     'cfi_endorse.compact line 24 char 1',
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
                                                                                            value: { value: _descriptor_14.toValue(3n),
                                                                                                     alignment: _descriptor_14.alignment() } }] } },
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
                                     'cfi_endorse.compact line 24 char 1',
                                     'Bytes<32>',
                                     key_0)
        }
        return _descriptor_13.fromValue(__compactRuntime.queryLedgerState(context,
                                                                          partialProofData,
                                                                          [
                                                                           { dup: { n: 0 } },
                                                                           { idx: { cached: false,
                                                                                    pushPath: false,
                                                                                    path: [
                                                                                           { tag: 'value',
                                                                                             value: { value: _descriptor_14.toValue(3n),
                                                                                                      alignment: _descriptor_14.alignment() } }] } },
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
        return self_0.asMap().keys().map(  (key) => {    const value = self_0.asMap().get(key).asCell();    return [      _descriptor_0.fromValue(key.value),      _descriptor_13.fromValue(value.value)    ];  })[Symbol.iterator]();
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
                                                                                          value: { value: _descriptor_14.toValue(4n),
                                                                                                   alignment: _descriptor_14.alignment() } }] } },
                                                                        { popeq: { cached: true,
                                                                                   result: undefined } }]).value);
    }
  };
}
const _emptyContext = {
  callContext: { currentQueryContext: new __compactRuntime.QueryContext(new __compactRuntime.ContractState().data, __compactRuntime.dummyContractAddress()), currentGasCost: __compactRuntime.emptyRunningCost() }
};
const _dummyContract = new Contract({ adminSecret: (...args) => undefined });
export const pureCircuits = {
  adminCommitment: (...args_0) => {
    if (args_0.length !== 1) {
      throw new __compactRuntime.CompactError(`adminCommitment: expected 1 argument (as invoked from Typescript), received ${args_0.length}`);
    }
    const sk_0 = args_0[0];
    if (!(sk_0.buffer instanceof ArrayBuffer && sk_0.BYTES_PER_ELEMENT === 1 && sk_0.length === 32)) {
      __compactRuntime.typeError('adminCommitment',
                                 'argument 1',
                                 'cfi_endorse.compact line 34 char 1',
                                 'Bytes<32>',
                                 sk_0)
    }
    return _dummyContract._adminCommitment_0(sk_0);
  },
  keyIdOf: (...args_0) => {
    if (args_0.length !== 1) {
      throw new __compactRuntime.CompactError(`keyIdOf: expected 1 argument (as invoked from Typescript), received ${args_0.length}`);
    }
    const pk_0 = args_0[0];
    if (!(__compactRuntime.isValidSecp256r1Point(pk_0))) {
      __compactRuntime.typeError('keyIdOf',
                                 'argument 1',
                                 'cfi_endorse.compact line 42 char 1',
                                 'Secp256r1Point',
                                 pk_0)
    }
    return _dummyContract._keyIdOf_0(pk_0);
  },
  endorseDigest: (...args_0) => {
    if (args_0.length !== 3) {
      throw new __compactRuntime.CompactError(`endorseDigest: expected 3 arguments (as invoked from Typescript), received ${args_0.length}`);
    }
    const contractAddr_0 = args_0[0];
    const entryHash_0 = args_0[1];
    const studentCommit_0 = args_0[2];
    if (!(contractAddr_0.buffer instanceof ArrayBuffer && contractAddr_0.BYTES_PER_ELEMENT === 1 && contractAddr_0.length === 32)) {
      __compactRuntime.typeError('endorseDigest',
                                 'argument 1',
                                 'cfi_endorse.compact line 48 char 1',
                                 'Bytes<32>',
                                 contractAddr_0)
    }
    if (!(entryHash_0.buffer instanceof ArrayBuffer && entryHash_0.BYTES_PER_ELEMENT === 1 && entryHash_0.length === 32)) {
      __compactRuntime.typeError('endorseDigest',
                                 'argument 2',
                                 'cfi_endorse.compact line 48 char 1',
                                 'Bytes<32>',
                                 entryHash_0)
    }
    if (!(studentCommit_0.buffer instanceof ArrayBuffer && studentCommit_0.BYTES_PER_ELEMENT === 1 && studentCommit_0.length === 32)) {
      __compactRuntime.typeError('endorseDigest',
                                 'argument 3',
                                 'cfi_endorse.compact line 48 char 1',
                                 'Bytes<32>',
                                 studentCommit_0)
    }
    return _dummyContract._endorseDigest_0(contractAddr_0,
                                           entryHash_0,
                                           studentCommit_0);
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
                                 'cfi_endorse.compact line 53 char 1',
                                 'Bytes<32>',
                                 contractAddr_0)
    }
    if (!(keyId_0.buffer instanceof ArrayBuffer && keyId_0.BYTES_PER_ELEMENT === 1 && keyId_0.length === 32)) {
      __compactRuntime.typeError('revokeDigest',
                                 'argument 2',
                                 'cfi_endorse.compact line 53 char 1',
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
                                 'cfi_endorse.compact line 57 char 1',
                                 'Bytes<32>',
                                 entryHash_0)
    }
    if (!(keyId_0.buffer instanceof ArrayBuffer && keyId_0.BYTES_PER_ELEMENT === 1 && keyId_0.length === 32)) {
      __compactRuntime.typeError('endorsementKey',
                                 'argument 2',
                                 'cfi_endorse.compact line 57 char 1',
                                 'Bytes<32>',
                                 keyId_0)
    }
    return _dummyContract._endorsementKey_0(entryHash_0, keyId_0);
  }
};
export const expectedVk = {
  'endorseEntry': '20c43b3ac4bfc6b2bd559f1ad8cca1c24f3e0b90d596d5200d5722d950a04b20',
  'enrollCfi': '109ce35a68c817ded4b9e9d5cf12398ffcd52631f780462c7018117daada3b9c',
  'revokeCfi': 'a1bd6b8d513b0d789d805216cef4b731e2e29910ca2608a4278c2d997ad4fe88',
  'rotateAdmin': '6d33203640bfb0b35949c931efa9f1efa373c50ba3e4fb7c69d168ecbeb7ebd4',
  'selfRevoke': 'b5eae3ccd1a7e7d3f66dcdad46e13123f20136da1275ad3564220314012d75ec',
};

export const circuitSignatures = {
  'adminCommitment': {pure: true, provable: false, argumentTypes: [{tag: 'Bytes', length: 32}], resultType: {tag: 'Bytes', length: 32}},
  'keyIdOf': {pure: true, provable: false, argumentTypes: [{tag: 'Secp256r1Point'}], resultType: {tag: 'Bytes', length: 32}},
  'endorseDigest': {pure: true, provable: false, argumentTypes: [{tag: 'Bytes', length: 32}, {tag: 'Bytes', length: 32}, {tag: 'Bytes', length: 32}], resultType: {tag: 'Bytes', length: 32}},
  'revokeDigest': {pure: true, provable: false, argumentTypes: [{tag: 'Bytes', length: 32}, {tag: 'Bytes', length: 32}], resultType: {tag: 'Bytes', length: 32}},
  'endorsementKey': {pure: true, provable: false, argumentTypes: [{tag: 'Bytes', length: 32}, {tag: 'Bytes', length: 32}], resultType: {tag: 'Bytes', length: 32}},
  'enrollCfi': {pure: false, provable: true, argumentTypes: [{tag: 'Bytes', length: 32}, {tag: 'Bytes', length: 32}], resultType: {tag: 'Tuple', types: []}},
  'revokeCfi': {pure: false, provable: true, argumentTypes: [{tag: 'Bytes', length: 32}], resultType: {tag: 'Tuple', types: []}},
  'rotateAdmin': {pure: false, provable: true, argumentTypes: [{tag: 'Bytes', length: 32}], resultType: {tag: 'Tuple', types: []}},
  'selfRevoke': {pure: false, provable: true, argumentTypes: [{tag: 'Secp256r1Point'}, {tag: 'Bytes', length: 37}, {tag: 'Bytes', length: 43}, {tag: 'Bytes', length: 74}, {tag: 'Uint', maxval: '1'}, {tag: 'Uint', maxval: '31'}, {tag: 'Struct', name: 'Secp256r1EcdsaSignature', elements: [{name: 'r', type: {tag: 'Secp256r1Scalar'}}, {name: 's', type: {tag: 'Secp256r1Scalar'}}]}], resultType: {tag: 'Tuple', types: []}},
  'endorseEntry': {pure: false, provable: true, argumentTypes: [{tag: 'Bytes', length: 32}, {tag: 'Bytes', length: 32}, {tag: 'Secp256r1Point'}, {tag: 'Bytes', length: 37}, {tag: 'Bytes', length: 43}, {tag: 'Bytes', length: 74}, {tag: 'Uint', maxval: '1'}, {tag: 'Uint', maxval: '31'}, {tag: 'Struct', name: 'Secp256r1EcdsaSignature', elements: [{name: 'r', type: {tag: 'Secp256r1Scalar'}}, {name: 's', type: {tag: 'Secp256r1Scalar'}}]}], resultType: {tag: 'Tuple', types: []}},
};

export const declaredInterfaces = {};

//# sourceMappingURL=index.js.map
