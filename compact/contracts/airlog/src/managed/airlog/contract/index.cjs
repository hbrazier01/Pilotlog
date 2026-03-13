'use strict';
const __compactRuntime = require('@midnight-ntwrk/compact-runtime');
const expectedRuntimeVersionString = '0.8.1';
const expectedRuntimeVersion = expectedRuntimeVersionString.split('-')[0].split('.').map(Number);
const actualRuntimeVersion = __compactRuntime.versionString.split('-')[0].split('.').map(Number);
if (expectedRuntimeVersion[0] != actualRuntimeVersion[0]
     || (actualRuntimeVersion[0] == 0 && expectedRuntimeVersion[1] != actualRuntimeVersion[1])
     || expectedRuntimeVersion[1] > actualRuntimeVersion[1]
     || (expectedRuntimeVersion[1] == actualRuntimeVersion[1] && expectedRuntimeVersion[2] > actualRuntimeVersion[2]))
   throw new __compactRuntime.CompactError(`Version mismatch: compiled code expects ${expectedRuntimeVersionString}, runtime is ${__compactRuntime.versionString}`);
{ const MAX_FIELD = 52435875175126190479447740508185965837690552500527637822603658699938581184512n;
  if (__compactRuntime.MAX_FIELD !== MAX_FIELD)
     throw new __compactRuntime.CompactError(`compiler thinks maximum field value is ${MAX_FIELD}; run time thinks it is ${__compactRuntime.MAX_FIELD}`)
}

var EntryType;
(function (EntryType) {
  EntryType[EntryType['ANNUAL'] = 0] = 'ANNUAL';
  EntryType[EntryType['HUNDRED_HOUR'] = 1] = 'HUNDRED_HOUR';
  EntryType[EntryType['AD_COMPLIANCE'] = 2] = 'AD_COMPLIANCE';
  EntryType[EntryType['REPAIR'] = 3] = 'REPAIR';
  EntryType[EntryType['MOD_STC'] = 4] = 'MOD_STC';
  EntryType[EntryType['OVERHAUL'] = 5] = 'OVERHAUL';
  EntryType[EntryType['OTHER'] = 6] = 'OTHER';
})(EntryType = exports.EntryType || (exports.EntryType = {}));

const _descriptor_0 = new __compactRuntime.CompactTypeBytes(32);

class _ZswapCoinPublicKey_0 {
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

const _descriptor_1 = new _ZswapCoinPublicKey_0();

const _descriptor_2 = new __compactRuntime.CompactTypeBoolean();

const _descriptor_3 = new __compactRuntime.CompactTypeUnsignedInteger(18446744073709551615n, 8);

const _descriptor_4 = new __compactRuntime.CompactTypeField();

const _descriptor_5 = new __compactRuntime.CompactTypeEnum(6, 1);

class _Entry_0 {
  alignment() {
    return _descriptor_5.alignment().concat(_descriptor_3.alignment().concat(_descriptor_3.alignment().concat(_descriptor_1.alignment().concat(_descriptor_0.alignment().concat(_descriptor_0.alignment())))));
  }
  fromValue(value_0) {
    return {
      entryType: _descriptor_5.fromValue(value_0),
      dateUtc: _descriptor_3.fromValue(value_0),
      tachOrTT: _descriptor_3.fromValue(value_0),
      issuer: _descriptor_1.fromValue(value_0),
      docHash: _descriptor_0.fromValue(value_0),
      docRef: _descriptor_0.fromValue(value_0)
    }
  }
  toValue(value_0) {
    return _descriptor_5.toValue(value_0.entryType).concat(_descriptor_3.toValue(value_0.dateUtc).concat(_descriptor_3.toValue(value_0.tachOrTT).concat(_descriptor_1.toValue(value_0.issuer).concat(_descriptor_0.toValue(value_0.docHash).concat(_descriptor_0.toValue(value_0.docRef))))));
  }
}

const _descriptor_6 = new _Entry_0();

class _tuple_0 {
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

const _descriptor_7 = new _tuple_0();

class _tuple_1 {
  alignment() {
    return _descriptor_0.alignment().concat(_descriptor_3.alignment());
  }
  fromValue(value_0) {
    return [
      _descriptor_0.fromValue(value_0),
      _descriptor_3.fromValue(value_0)
    ]
  }
  toValue(value_0) {
    return _descriptor_0.toValue(value_0[0]).concat(_descriptor_3.toValue(value_0[1]));
  }
}

const _descriptor_8 = new _tuple_1();

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

const _descriptor_9 = new _ContractAddress_0();

const _descriptor_10 = new __compactRuntime.CompactTypeUnsignedInteger(255n, 1);

const _descriptor_11 = new __compactRuntime.CompactTypeUnsignedInteger(340282366920938463463374607431768211455n, 16);

class Contract {
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
      registerAirframe: (...args_1) => {
        if (args_1.length !== 2) {
          throw new __compactRuntime.CompactError(`registerAirframe: expected 2 arguments (as invoked from Typescript), received ${args_1.length}`);
        }
        const contextOrig_0 = args_1[0];
        const airframeId_0 = args_1[1];
        if (!(typeof(contextOrig_0) === 'object' && contextOrig_0.originalState != undefined && contextOrig_0.transactionContext != undefined)) {
          __compactRuntime.type_error('registerAirframe',
                                      'argument 1 (as invoked from Typescript)',
                                      'airlog.compact line 83 char 1',
                                      'CircuitContext',
                                      contextOrig_0)
        }
        if (!(airframeId_0.buffer instanceof ArrayBuffer && airframeId_0.BYTES_PER_ELEMENT === 1 && airframeId_0.length === 32)) {
          __compactRuntime.type_error('registerAirframe',
                                      'argument 1 (argument 2 as invoked from Typescript)',
                                      'airlog.compact line 83 char 1',
                                      'Bytes<32>',
                                      airframeId_0)
        }
        const context = { ...contextOrig_0 };
        const partialProofData = {
          input: {
            value: _descriptor_0.toValue(airframeId_0),
            alignment: _descriptor_0.alignment()
          },
          output: undefined,
          publicTranscript: [],
          privateTranscriptOutputs: []
        };
        const result_0 = this._registerAirframe_0(context,
                                                  partialProofData,
                                                  airframeId_0);
        partialProofData.output = { value: [], alignment: [] };
        return { result: result_0, context: context, proofData: partialProofData };
      },
      authorizeIssuer: (...args_1) => {
        if (args_1.length !== 3) {
          throw new __compactRuntime.CompactError(`authorizeIssuer: expected 3 arguments (as invoked from Typescript), received ${args_1.length}`);
        }
        const contextOrig_0 = args_1[0];
        const airframeId_0 = args_1[1];
        const issuerPk_0 = args_1[2];
        if (!(typeof(contextOrig_0) === 'object' && contextOrig_0.originalState != undefined && contextOrig_0.transactionContext != undefined)) {
          __compactRuntime.type_error('authorizeIssuer',
                                      'argument 1 (as invoked from Typescript)',
                                      'airlog.compact line 94 char 1',
                                      'CircuitContext',
                                      contextOrig_0)
        }
        if (!(airframeId_0.buffer instanceof ArrayBuffer && airframeId_0.BYTES_PER_ELEMENT === 1 && airframeId_0.length === 32)) {
          __compactRuntime.type_error('authorizeIssuer',
                                      'argument 1 (argument 2 as invoked from Typescript)',
                                      'airlog.compact line 94 char 1',
                                      'Bytes<32>',
                                      airframeId_0)
        }
        if (!(typeof(issuerPk_0) === 'object' && issuerPk_0.bytes.buffer instanceof ArrayBuffer && issuerPk_0.bytes.BYTES_PER_ELEMENT === 1 && issuerPk_0.bytes.length === 32)) {
          __compactRuntime.type_error('authorizeIssuer',
                                      'argument 2 (argument 3 as invoked from Typescript)',
                                      'airlog.compact line 94 char 1',
                                      'struct ZswapCoinPublicKey<bytes: Bytes<32>>',
                                      issuerPk_0)
        }
        const context = { ...contextOrig_0 };
        const partialProofData = {
          input: {
            value: _descriptor_0.toValue(airframeId_0).concat(_descriptor_1.toValue(issuerPk_0)),
            alignment: _descriptor_0.alignment().concat(_descriptor_1.alignment())
          },
          output: undefined,
          publicTranscript: [],
          privateTranscriptOutputs: []
        };
        const result_0 = this._authorizeIssuer_0(context,
                                                 partialProofData,
                                                 airframeId_0,
                                                 issuerPk_0);
        partialProofData.output = { value: [], alignment: [] };
        return { result: result_0, context: context, proofData: partialProofData };
      },
      revokeIssuer: (...args_1) => {
        if (args_1.length !== 3) {
          throw new __compactRuntime.CompactError(`revokeIssuer: expected 3 arguments (as invoked from Typescript), received ${args_1.length}`);
        }
        const contextOrig_0 = args_1[0];
        const airframeId_0 = args_1[1];
        const issuerPk_0 = args_1[2];
        if (!(typeof(contextOrig_0) === 'object' && contextOrig_0.originalState != undefined && contextOrig_0.transactionContext != undefined)) {
          __compactRuntime.type_error('revokeIssuer',
                                      'argument 1 (as invoked from Typescript)',
                                      'airlog.compact line 99 char 1',
                                      'CircuitContext',
                                      contextOrig_0)
        }
        if (!(airframeId_0.buffer instanceof ArrayBuffer && airframeId_0.BYTES_PER_ELEMENT === 1 && airframeId_0.length === 32)) {
          __compactRuntime.type_error('revokeIssuer',
                                      'argument 1 (argument 2 as invoked from Typescript)',
                                      'airlog.compact line 99 char 1',
                                      'Bytes<32>',
                                      airframeId_0)
        }
        if (!(typeof(issuerPk_0) === 'object' && issuerPk_0.bytes.buffer instanceof ArrayBuffer && issuerPk_0.bytes.BYTES_PER_ELEMENT === 1 && issuerPk_0.bytes.length === 32)) {
          __compactRuntime.type_error('revokeIssuer',
                                      'argument 2 (argument 3 as invoked from Typescript)',
                                      'airlog.compact line 99 char 1',
                                      'struct ZswapCoinPublicKey<bytes: Bytes<32>>',
                                      issuerPk_0)
        }
        const context = { ...contextOrig_0 };
        const partialProofData = {
          input: {
            value: _descriptor_0.toValue(airframeId_0).concat(_descriptor_1.toValue(issuerPk_0)),
            alignment: _descriptor_0.alignment().concat(_descriptor_1.alignment())
          },
          output: undefined,
          publicTranscript: [],
          privateTranscriptOutputs: []
        };
        const result_0 = this._revokeIssuer_0(context,
                                              partialProofData,
                                              airframeId_0,
                                              issuerPk_0);
        partialProofData.output = { value: [], alignment: [] };
        return { result: result_0, context: context, proofData: partialProofData };
      },
      addEntry: (...args_1) => {
        if (args_1.length !== 7) {
          throw new __compactRuntime.CompactError(`addEntry: expected 7 arguments (as invoked from Typescript), received ${args_1.length}`);
        }
        const contextOrig_0 = args_1[0];
        const airframeId_0 = args_1[1];
        const entryType_0 = args_1[2];
        const dateUtc_0 = args_1[3];
        const tachOrTT_0 = args_1[4];
        const docHash_0 = args_1[5];
        const docRef_0 = args_1[6];
        if (!(typeof(contextOrig_0) === 'object' && contextOrig_0.originalState != undefined && contextOrig_0.transactionContext != undefined)) {
          __compactRuntime.type_error('addEntry',
                                      'argument 1 (as invoked from Typescript)',
                                      'airlog.compact line 104 char 1',
                                      'CircuitContext',
                                      contextOrig_0)
        }
        if (!(airframeId_0.buffer instanceof ArrayBuffer && airframeId_0.BYTES_PER_ELEMENT === 1 && airframeId_0.length === 32)) {
          __compactRuntime.type_error('addEntry',
                                      'argument 1 (argument 2 as invoked from Typescript)',
                                      'airlog.compact line 104 char 1',
                                      'Bytes<32>',
                                      airframeId_0)
        }
        if (!(typeof(entryType_0) === 'number' && entryType_0 >= 0 && entryType_0 <= 6)) {
          __compactRuntime.type_error('addEntry',
                                      'argument 2 (argument 3 as invoked from Typescript)',
                                      'airlog.compact line 104 char 1',
                                      'Enum<EntryType, ANNUAL, HUNDRED_HOUR, AD_COMPLIANCE, REPAIR, MOD_STC, OVERHAUL, OTHER>',
                                      entryType_0)
        }
        if (!(typeof(dateUtc_0) === 'bigint' && dateUtc_0 >= 0n && dateUtc_0 <= 18446744073709551615n)) {
          __compactRuntime.type_error('addEntry',
                                      'argument 3 (argument 4 as invoked from Typescript)',
                                      'airlog.compact line 104 char 1',
                                      'Uint<0..18446744073709551615>',
                                      dateUtc_0)
        }
        if (!(typeof(tachOrTT_0) === 'bigint' && tachOrTT_0 >= 0n && tachOrTT_0 <= 18446744073709551615n)) {
          __compactRuntime.type_error('addEntry',
                                      'argument 4 (argument 5 as invoked from Typescript)',
                                      'airlog.compact line 104 char 1',
                                      'Uint<0..18446744073709551615>',
                                      tachOrTT_0)
        }
        if (!(docHash_0.buffer instanceof ArrayBuffer && docHash_0.BYTES_PER_ELEMENT === 1 && docHash_0.length === 32)) {
          __compactRuntime.type_error('addEntry',
                                      'argument 5 (argument 6 as invoked from Typescript)',
                                      'airlog.compact line 104 char 1',
                                      'Bytes<32>',
                                      docHash_0)
        }
        if (!(docRef_0.buffer instanceof ArrayBuffer && docRef_0.BYTES_PER_ELEMENT === 1 && docRef_0.length === 32)) {
          __compactRuntime.type_error('addEntry',
                                      'argument 6 (argument 7 as invoked from Typescript)',
                                      'airlog.compact line 104 char 1',
                                      'Bytes<32>',
                                      docRef_0)
        }
        const context = { ...contextOrig_0 };
        const partialProofData = {
          input: {
            value: _descriptor_0.toValue(airframeId_0).concat(_descriptor_5.toValue(entryType_0).concat(_descriptor_3.toValue(dateUtc_0).concat(_descriptor_3.toValue(tachOrTT_0).concat(_descriptor_0.toValue(docHash_0).concat(_descriptor_0.toValue(docRef_0)))))),
            alignment: _descriptor_0.alignment().concat(_descriptor_5.alignment().concat(_descriptor_3.alignment().concat(_descriptor_3.alignment().concat(_descriptor_0.alignment().concat(_descriptor_0.alignment())))))
          },
          output: undefined,
          publicTranscript: [],
          privateTranscriptOutputs: []
        };
        const result_0 = this._addEntry_0(context,
                                          partialProofData,
                                          airframeId_0,
                                          entryType_0,
                                          dateUtc_0,
                                          tachOrTT_0,
                                          docHash_0,
                                          docRef_0);
        partialProofData.output = { value: [], alignment: [] };
        return { result: result_0, context: context, proofData: partialProofData };
      },
      transferAirframe: (...args_1) => {
        if (args_1.length !== 3) {
          throw new __compactRuntime.CompactError(`transferAirframe: expected 3 arguments (as invoked from Typescript), received ${args_1.length}`);
        }
        const contextOrig_0 = args_1[0];
        const airframeId_0 = args_1[1];
        const newOwner_0 = args_1[2];
        if (!(typeof(contextOrig_0) === 'object' && contextOrig_0.originalState != undefined && contextOrig_0.transactionContext != undefined)) {
          __compactRuntime.type_error('transferAirframe',
                                      'argument 1 (as invoked from Typescript)',
                                      'airlog.compact line 134 char 1',
                                      'CircuitContext',
                                      contextOrig_0)
        }
        if (!(airframeId_0.buffer instanceof ArrayBuffer && airframeId_0.BYTES_PER_ELEMENT === 1 && airframeId_0.length === 32)) {
          __compactRuntime.type_error('transferAirframe',
                                      'argument 1 (argument 2 as invoked from Typescript)',
                                      'airlog.compact line 134 char 1',
                                      'Bytes<32>',
                                      airframeId_0)
        }
        if (!(typeof(newOwner_0) === 'object' && newOwner_0.bytes.buffer instanceof ArrayBuffer && newOwner_0.bytes.BYTES_PER_ELEMENT === 1 && newOwner_0.bytes.length === 32)) {
          __compactRuntime.type_error('transferAirframe',
                                      'argument 2 (argument 3 as invoked from Typescript)',
                                      'airlog.compact line 134 char 1',
                                      'struct ZswapCoinPublicKey<bytes: Bytes<32>>',
                                      newOwner_0)
        }
        const context = { ...contextOrig_0 };
        const partialProofData = {
          input: {
            value: _descriptor_0.toValue(airframeId_0).concat(_descriptor_1.toValue(newOwner_0)),
            alignment: _descriptor_0.alignment().concat(_descriptor_1.alignment())
          },
          output: undefined,
          publicTranscript: [],
          privateTranscriptOutputs: []
        };
        const result_0 = this._transferAirframe_0(context,
                                                  partialProofData,
                                                  airframeId_0,
                                                  newOwner_0);
        partialProofData.output = { value: [], alignment: [] };
        return { result: result_0, context: context, proofData: partialProofData };
      },
      getNextEntryId: (...args_1) => {
        if (args_1.length !== 2) {
          throw new __compactRuntime.CompactError(`getNextEntryId: expected 2 arguments (as invoked from Typescript), received ${args_1.length}`);
        }
        const contextOrig_0 = args_1[0];
        const airframeId_0 = args_1[1];
        if (!(typeof(contextOrig_0) === 'object' && contextOrig_0.originalState != undefined && contextOrig_0.transactionContext != undefined)) {
          __compactRuntime.type_error('getNextEntryId',
                                      'argument 1 (as invoked from Typescript)',
                                      'airlog.compact line 139 char 1',
                                      'CircuitContext',
                                      contextOrig_0)
        }
        if (!(airframeId_0.buffer instanceof ArrayBuffer && airframeId_0.BYTES_PER_ELEMENT === 1 && airframeId_0.length === 32)) {
          __compactRuntime.type_error('getNextEntryId',
                                      'argument 1 (argument 2 as invoked from Typescript)',
                                      'airlog.compact line 139 char 1',
                                      'Bytes<32>',
                                      airframeId_0)
        }
        const context = { ...contextOrig_0 };
        const partialProofData = {
          input: {
            value: _descriptor_0.toValue(airframeId_0),
            alignment: _descriptor_0.alignment()
          },
          output: undefined,
          publicTranscript: [],
          privateTranscriptOutputs: []
        };
        const result_0 = this._getNextEntryId_0(context,
                                                partialProofData,
                                                airframeId_0);
        partialProofData.output = { value: _descriptor_3.toValue(result_0), alignment: _descriptor_3.alignment() };
        return { result: result_0, context: context, proofData: partialProofData };
      },
      getEntry: (...args_1) => {
        if (args_1.length !== 3) {
          throw new __compactRuntime.CompactError(`getEntry: expected 3 arguments (as invoked from Typescript), received ${args_1.length}`);
        }
        const contextOrig_0 = args_1[0];
        const airframeId_0 = args_1[1];
        const entryId_0 = args_1[2];
        if (!(typeof(contextOrig_0) === 'object' && contextOrig_0.originalState != undefined && contextOrig_0.transactionContext != undefined)) {
          __compactRuntime.type_error('getEntry',
                                      'argument 1 (as invoked from Typescript)',
                                      'airlog.compact line 144 char 1',
                                      'CircuitContext',
                                      contextOrig_0)
        }
        if (!(airframeId_0.buffer instanceof ArrayBuffer && airframeId_0.BYTES_PER_ELEMENT === 1 && airframeId_0.length === 32)) {
          __compactRuntime.type_error('getEntry',
                                      'argument 1 (argument 2 as invoked from Typescript)',
                                      'airlog.compact line 144 char 1',
                                      'Bytes<32>',
                                      airframeId_0)
        }
        if (!(typeof(entryId_0) === 'bigint' && entryId_0 >= 0n && entryId_0 <= 18446744073709551615n)) {
          __compactRuntime.type_error('getEntry',
                                      'argument 2 (argument 3 as invoked from Typescript)',
                                      'airlog.compact line 144 char 1',
                                      'Uint<0..18446744073709551615>',
                                      entryId_0)
        }
        const context = { ...contextOrig_0 };
        const partialProofData = {
          input: {
            value: _descriptor_0.toValue(airframeId_0).concat(_descriptor_3.toValue(entryId_0)),
            alignment: _descriptor_0.alignment().concat(_descriptor_3.alignment())
          },
          output: undefined,
          publicTranscript: [],
          privateTranscriptOutputs: []
        };
        const result_0 = this._getEntry_0(context,
                                          partialProofData,
                                          airframeId_0,
                                          entryId_0);
        partialProofData.output = { value: _descriptor_6.toValue(result_0), alignment: _descriptor_6.alignment() };
        return { result: result_0, context: context, proofData: partialProofData };
      }
    };
    this.impureCircuits = {
      registerAirframe: this.circuits.registerAirframe,
      authorizeIssuer: this.circuits.authorizeIssuer,
      revokeIssuer: this.circuits.revokeIssuer,
      addEntry: this.circuits.addEntry,
      transferAirframe: this.circuits.transferAirframe,
      getNextEntryId: this.circuits.getNextEntryId,
      getEntry: this.circuits.getEntry
    };
  }
  initialState(...args_0) {
    if (args_0.length !== 1) {
      throw new __compactRuntime.CompactError(`Contract state constructor: expected 1 argument (as invoked from Typescript), received ${args_0.length}`);
    }
    const constructorContext_0 = args_0[0];
    if (typeof(constructorContext_0) !== 'object') {
      throw new __compactRuntime.CompactError(`Contract state constructor: expected 'constructorContext' in argument 1 (as invoked from Typescript) to be an object`);
    }
    if (!('initialZswapLocalState' in constructorContext_0)) {
      throw new __compactRuntime.CompactError(`Contract state constructor: expected 'initialZswapLocalState' in argument 1 (as invoked from Typescript)`);
    }
    if (typeof(constructorContext_0.initialZswapLocalState) !== 'object') {
      throw new __compactRuntime.CompactError(`Contract state constructor: expected 'initialZswapLocalState' in argument 1 (as invoked from Typescript) to be an object`);
    }
    const state_0 = new __compactRuntime.ContractState();
    let stateValue_0 = __compactRuntime.StateValue.newArray();
    stateValue_0 = stateValue_0.arrayPush(__compactRuntime.StateValue.newNull());
    stateValue_0 = stateValue_0.arrayPush(__compactRuntime.StateValue.newNull());
    stateValue_0 = stateValue_0.arrayPush(__compactRuntime.StateValue.newNull());
    stateValue_0 = stateValue_0.arrayPush(__compactRuntime.StateValue.newNull());
    state_0.data = stateValue_0;
    state_0.setOperation('registerAirframe', new __compactRuntime.ContractOperation());
    state_0.setOperation('authorizeIssuer', new __compactRuntime.ContractOperation());
    state_0.setOperation('revokeIssuer', new __compactRuntime.ContractOperation());
    state_0.setOperation('addEntry', new __compactRuntime.ContractOperation());
    state_0.setOperation('transferAirframe', new __compactRuntime.ContractOperation());
    state_0.setOperation('getNextEntryId', new __compactRuntime.ContractOperation());
    state_0.setOperation('getEntry', new __compactRuntime.ContractOperation());
    const context = {
      originalState: state_0,
      currentPrivateState: constructorContext_0.initialPrivateState,
      currentZswapLocalState: constructorContext_0.initialZswapLocalState,
      transactionContext: new __compactRuntime.QueryContext(state_0.data, __compactRuntime.dummyContractAddress())
    };
    const partialProofData = {
      input: { value: [], alignment: [] },
      output: undefined,
      publicTranscript: [],
      privateTranscriptOutputs: []
    };
    Contract._query(context,
                    partialProofData,
                    [
                     { push: { storage: false,
                               value: __compactRuntime.StateValue.newCell({ value: _descriptor_10.toValue(0n),
                                                                            alignment: _descriptor_10.alignment() }).encode() } },
                     { push: { storage: true,
                               value: __compactRuntime.StateValue.newMap(
                                        new __compactRuntime.StateMap()
                                      ).encode() } },
                     { ins: { cached: false, n: 1 } }]);
    Contract._query(context,
                    partialProofData,
                    [
                     { push: { storage: false,
                               value: __compactRuntime.StateValue.newCell({ value: _descriptor_10.toValue(1n),
                                                                            alignment: _descriptor_10.alignment() }).encode() } },
                     { push: { storage: true,
                               value: __compactRuntime.StateValue.newMap(
                                        new __compactRuntime.StateMap()
                                      ).encode() } },
                     { ins: { cached: false, n: 1 } }]);
    Contract._query(context,
                    partialProofData,
                    [
                     { push: { storage: false,
                               value: __compactRuntime.StateValue.newCell({ value: _descriptor_10.toValue(2n),
                                                                            alignment: _descriptor_10.alignment() }).encode() } },
                     { push: { storage: true,
                               value: __compactRuntime.StateValue.newMap(
                                        new __compactRuntime.StateMap()
                                      ).encode() } },
                     { ins: { cached: false, n: 1 } }]);
    Contract._query(context,
                    partialProofData,
                    [
                     { push: { storage: false,
                               value: __compactRuntime.StateValue.newCell({ value: _descriptor_10.toValue(3n),
                                                                            alignment: _descriptor_10.alignment() }).encode() } },
                     { push: { storage: true,
                               value: __compactRuntime.StateValue.newMap(
                                        new __compactRuntime.StateMap()
                                      ).encode() } },
                     { ins: { cached: false, n: 1 } }]);
    state_0.data = context.transactionContext.state;
    return {
      currentContractState: state_0,
      currentPrivateState: context.currentPrivateState,
      currentZswapLocalState: context.currentZswapLocalState
    }
  }
  _transientHash_0(value_0) {
    const result_0 = __compactRuntime.transientHash(_descriptor_7, value_0);
    return result_0;
  }
  _transientHash_1(value_0) {
    const result_0 = __compactRuntime.transientHash(_descriptor_8, value_0);
    return result_0;
  }
  _ownPublicKey_0(context, partialProofData) {
    const result_0 = __compactRuntime.ownPublicKey(context);
    partialProofData.privateTranscriptOutputs.push({
      value: _descriptor_1.toValue(result_0),
      alignment: _descriptor_1.alignment()
    });
    return result_0;
  }
  _issuerKey_0(airframeId_0, issuerPk_0) {
    const payload_0 = [airframeId_0, issuerPk_0.bytes];
    return this._transientHash_0(payload_0);
  }
  _entryKey_0(airframeId_0, entryId_0) {
    const payload_0 = [airframeId_0, entryId_0];
    return this._transientHash_1(payload_0);
  }
  _requireOwner_0(context, partialProofData, airframeId_0) {
    const sender_0 = this._ownPublicKey_0(context, partialProofData);
    const owner_0 = _descriptor_1.fromValue(Contract._query(context,
                                                            partialProofData,
                                                            [
                                                             { dup: { n: 0 } },
                                                             { idx: { cached: false,
                                                                      pushPath: false,
                                                                      path: [
                                                                             { tag: 'value',
                                                                               value: { value: _descriptor_10.toValue(0n),
                                                                                        alignment: _descriptor_10.alignment() } }] } },
                                                             { idx: { cached: false,
                                                                      pushPath: false,
                                                                      path: [
                                                                             { tag: 'value',
                                                                               value: { value: _descriptor_0.toValue(airframeId_0),
                                                                                        alignment: _descriptor_0.alignment() } }] } },
                                                             { popeq: { cached: false,
                                                                        result: undefined } }]).value);
    __compactRuntime.assert(this._equal_0(owner_0.bytes, sender_0.bytes),
                            'Not owner');
    return sender_0;
  }
  _isIssuerAuthorized_0(context, partialProofData, airframeId_0, issuerPk_0) {
    const k_0 = this._issuerKey_0(airframeId_0, issuerPk_0);
    return _descriptor_2.fromValue(Contract._query(context,
                                                   partialProofData,
                                                   [
                                                    { dup: { n: 0 } },
                                                    { idx: { cached: false,
                                                             pushPath: false,
                                                             path: [
                                                                    { tag: 'value',
                                                                      value: { value: _descriptor_10.toValue(1n),
                                                                               alignment: _descriptor_10.alignment() } }] } },
                                                    { push: { storage: false,
                                                              value: __compactRuntime.StateValue.newCell({ value: _descriptor_4.toValue(k_0),
                                                                                                           alignment: _descriptor_4.alignment() }).encode() } },
                                                    'member',
                                                    { popeq: { cached: true,
                                                               result: undefined } }]).value)
           &&
           _descriptor_2.fromValue(Contract._query(context,
                                                   partialProofData,
                                                   [
                                                    { dup: { n: 0 } },
                                                    { idx: { cached: false,
                                                             pushPath: false,
                                                             path: [
                                                                    { tag: 'value',
                                                                      value: { value: _descriptor_10.toValue(1n),
                                                                               alignment: _descriptor_10.alignment() } }] } },
                                                    { idx: { cached: false,
                                                             pushPath: false,
                                                             path: [
                                                                    { tag: 'value',
                                                                      value: { value: _descriptor_4.toValue(k_0),
                                                                               alignment: _descriptor_4.alignment() } }] } },
                                                    { popeq: { cached: false,
                                                               result: undefined } }]).value);
  }
  _registerAirframe_0(context, partialProofData, airframeId_0) {
    const sender_0 = this._ownPublicKey_0(context, partialProofData);
    const already_0 = _descriptor_2.fromValue(Contract._query(context,
                                                              partialProofData,
                                                              [
                                                               { dup: { n: 0 } },
                                                               { idx: { cached: false,
                                                                        pushPath: false,
                                                                        path: [
                                                                               { tag: 'value',
                                                                                 value: { value: _descriptor_10.toValue(0n),
                                                                                          alignment: _descriptor_10.alignment() } }] } },
                                                               { push: { storage: false,
                                                                         value: __compactRuntime.StateValue.newCell({ value: _descriptor_0.toValue(airframeId_0),
                                                                                                                      alignment: _descriptor_0.alignment() }).encode() } },
                                                               'member',
                                                               { popeq: { cached: true,
                                                                          result: undefined } }]).value);
    __compactRuntime.assert(!already_0, 'Airframe already registered');
    Contract._query(context,
                    partialProofData,
                    [
                     { idx: { cached: false,
                              pushPath: true,
                              path: [
                                     { tag: 'value',
                                       value: { value: _descriptor_10.toValue(0n),
                                                alignment: _descriptor_10.alignment() } }] } },
                     { push: { storage: false,
                               value: __compactRuntime.StateValue.newCell({ value: _descriptor_0.toValue(airframeId_0),
                                                                            alignment: _descriptor_0.alignment() }).encode() } },
                     { push: { storage: true,
                               value: __compactRuntime.StateValue.newCell({ value: _descriptor_1.toValue(sender_0),
                                                                            alignment: _descriptor_1.alignment() }).encode() } },
                     { ins: { cached: false, n: 1 } },
                     { ins: { cached: true, n: 1 } }]);
    const tmp_0 = 1n;
    Contract._query(context,
                    partialProofData,
                    [
                     { idx: { cached: false,
                              pushPath: true,
                              path: [
                                     { tag: 'value',
                                       value: { value: _descriptor_10.toValue(3n),
                                                alignment: _descriptor_10.alignment() } }] } },
                     { push: { storage: false,
                               value: __compactRuntime.StateValue.newCell({ value: _descriptor_0.toValue(airframeId_0),
                                                                            alignment: _descriptor_0.alignment() }).encode() } },
                     { push: { storage: true,
                               value: __compactRuntime.StateValue.newCell({ value: _descriptor_3.toValue(tmp_0),
                                                                            alignment: _descriptor_3.alignment() }).encode() } },
                     { ins: { cached: false, n: 1 } },
                     { ins: { cached: true, n: 1 } }]);
    return [];
  }
  _authorizeIssuer_0(context, partialProofData, airframeId_0, issuerPk_0) {
    this._requireOwner_0(context, partialProofData, airframeId_0);
    const tmp_0 = this._issuerKey_0(airframeId_0, issuerPk_0);
    Contract._query(context,
                    partialProofData,
                    [
                     { idx: { cached: false,
                              pushPath: true,
                              path: [
                                     { tag: 'value',
                                       value: { value: _descriptor_10.toValue(1n),
                                                alignment: _descriptor_10.alignment() } }] } },
                     { push: { storage: false,
                               value: __compactRuntime.StateValue.newCell({ value: _descriptor_4.toValue(tmp_0),
                                                                            alignment: _descriptor_4.alignment() }).encode() } },
                     { push: { storage: true,
                               value: __compactRuntime.StateValue.newCell({ value: _descriptor_2.toValue(true),
                                                                            alignment: _descriptor_2.alignment() }).encode() } },
                     { ins: { cached: false, n: 1 } },
                     { ins: { cached: true, n: 1 } }]);
    return [];
  }
  _revokeIssuer_0(context, partialProofData, airframeId_0, issuerPk_0) {
    this._requireOwner_0(context, partialProofData, airframeId_0);
    const tmp_0 = this._issuerKey_0(airframeId_0, issuerPk_0);
    Contract._query(context,
                    partialProofData,
                    [
                     { idx: { cached: false,
                              pushPath: true,
                              path: [
                                     { tag: 'value',
                                       value: { value: _descriptor_10.toValue(1n),
                                                alignment: _descriptor_10.alignment() } }] } },
                     { push: { storage: false,
                               value: __compactRuntime.StateValue.newCell({ value: _descriptor_4.toValue(tmp_0),
                                                                            alignment: _descriptor_4.alignment() }).encode() } },
                     { push: { storage: true,
                               value: __compactRuntime.StateValue.newCell({ value: _descriptor_2.toValue(false),
                                                                            alignment: _descriptor_2.alignment() }).encode() } },
                     { ins: { cached: false, n: 1 } },
                     { ins: { cached: true, n: 1 } }]);
    return [];
  }
  _addEntry_0(context,
              partialProofData,
              airframeId_0,
              entryType_0,
              dateUtc_0,
              tachOrTT_0,
              docHash_0,
              docRef_0)
  {
    const sender_0 = this._ownPublicKey_0(context, partialProofData);
    __compactRuntime.assert(_descriptor_2.fromValue(Contract._query(context,
                                                                    partialProofData,
                                                                    [
                                                                     { dup: { n: 0 } },
                                                                     { idx: { cached: false,
                                                                              pushPath: false,
                                                                              path: [
                                                                                     { tag: 'value',
                                                                                       value: { value: _descriptor_10.toValue(0n),
                                                                                                alignment: _descriptor_10.alignment() } }] } },
                                                                     { push: { storage: false,
                                                                               value: __compactRuntime.StateValue.newCell({ value: _descriptor_0.toValue(airframeId_0),
                                                                                                                            alignment: _descriptor_0.alignment() }).encode() } },
                                                                     'member',
                                                                     { popeq: { cached: true,
                                                                                result: undefined } }]).value),
                            'Airframe not registered');
    __compactRuntime.assert(this._isIssuerAuthorized_0(context,
                                                       partialProofData,
                                                       airframeId_0,
                                                       sender_0),
                            'Issuer not authorized');
    const id_0 = _descriptor_3.fromValue(Contract._query(context,
                                                         partialProofData,
                                                         [
                                                          { dup: { n: 0 } },
                                                          { idx: { cached: false,
                                                                   pushPath: false,
                                                                   path: [
                                                                          { tag: 'value',
                                                                            value: { value: _descriptor_10.toValue(3n),
                                                                                     alignment: _descriptor_10.alignment() } }] } },
                                                          { idx: { cached: false,
                                                                   pushPath: false,
                                                                   path: [
                                                                          { tag: 'value',
                                                                            value: { value: _descriptor_0.toValue(airframeId_0),
                                                                                     alignment: _descriptor_0.alignment() } }] } },
                                                          { popeq: { cached: false,
                                                                     result: undefined } }]).value);
    const e_0 = { entryType: entryType_0,
                  dateUtc: dateUtc_0,
                  tachOrTT: tachOrTT_0,
                  issuer: sender_0,
                  docHash: docHash_0,
                  docRef: docRef_0 };
    const k_0 = this._entryKey_0(airframeId_0, id_0);
    Contract._query(context,
                    partialProofData,
                    [
                     { idx: { cached: false,
                              pushPath: true,
                              path: [
                                     { tag: 'value',
                                       value: { value: _descriptor_10.toValue(2n),
                                                alignment: _descriptor_10.alignment() } }] } },
                     { push: { storage: false,
                               value: __compactRuntime.StateValue.newCell({ value: _descriptor_4.toValue(k_0),
                                                                            alignment: _descriptor_4.alignment() }).encode() } },
                     { push: { storage: true,
                               value: __compactRuntime.StateValue.newCell({ value: _descriptor_6.toValue(e_0),
                                                                            alignment: _descriptor_6.alignment() }).encode() } },
                     { ins: { cached: false, n: 1 } },
                     { ins: { cached: true, n: 1 } }]);
    const tmp_0 = ((t1) => {
                    if (t1 > 18446744073709551615n) {
                      throw new __compactRuntime.CompactError('airlog.compact line 131 char 53: cast from unsigned value to smaller unsigned value failed: ' + t1 + ' is greater than 18446744073709551615');
                    }
                    return t1;
                  })(id_0 + 1n);
    Contract._query(context,
                    partialProofData,
                    [
                     { idx: { cached: false,
                              pushPath: true,
                              path: [
                                     { tag: 'value',
                                       value: { value: _descriptor_10.toValue(3n),
                                                alignment: _descriptor_10.alignment() } }] } },
                     { push: { storage: false,
                               value: __compactRuntime.StateValue.newCell({ value: _descriptor_0.toValue(airframeId_0),
                                                                            alignment: _descriptor_0.alignment() }).encode() } },
                     { push: { storage: true,
                               value: __compactRuntime.StateValue.newCell({ value: _descriptor_3.toValue(tmp_0),
                                                                            alignment: _descriptor_3.alignment() }).encode() } },
                     { ins: { cached: false, n: 1 } },
                     { ins: { cached: true, n: 1 } }]);
    return [];
  }
  _transferAirframe_0(context, partialProofData, airframeId_0, newOwner_0) {
    this._requireOwner_0(context, partialProofData, airframeId_0);
    Contract._query(context,
                    partialProofData,
                    [
                     { idx: { cached: false,
                              pushPath: true,
                              path: [
                                     { tag: 'value',
                                       value: { value: _descriptor_10.toValue(0n),
                                                alignment: _descriptor_10.alignment() } }] } },
                     { push: { storage: false,
                               value: __compactRuntime.StateValue.newCell({ value: _descriptor_0.toValue(airframeId_0),
                                                                            alignment: _descriptor_0.alignment() }).encode() } },
                     { push: { storage: true,
                               value: __compactRuntime.StateValue.newCell({ value: _descriptor_1.toValue(newOwner_0),
                                                                            alignment: _descriptor_1.alignment() }).encode() } },
                     { ins: { cached: false, n: 1 } },
                     { ins: { cached: true, n: 1 } }]);
    return [];
  }
  _getNextEntryId_0(context, partialProofData, airframeId_0) {
    __compactRuntime.assert(_descriptor_2.fromValue(Contract._query(context,
                                                                    partialProofData,
                                                                    [
                                                                     { dup: { n: 0 } },
                                                                     { idx: { cached: false,
                                                                              pushPath: false,
                                                                              path: [
                                                                                     { tag: 'value',
                                                                                       value: { value: _descriptor_10.toValue(0n),
                                                                                                alignment: _descriptor_10.alignment() } }] } },
                                                                     { push: { storage: false,
                                                                               value: __compactRuntime.StateValue.newCell({ value: _descriptor_0.toValue(airframeId_0),
                                                                                                                            alignment: _descriptor_0.alignment() }).encode() } },
                                                                     'member',
                                                                     { popeq: { cached: true,
                                                                                result: undefined } }]).value),
                            'Airframe not registered');
    return _descriptor_3.fromValue(Contract._query(context,
                                                   partialProofData,
                                                   [
                                                    { dup: { n: 0 } },
                                                    { idx: { cached: false,
                                                             pushPath: false,
                                                             path: [
                                                                    { tag: 'value',
                                                                      value: { value: _descriptor_10.toValue(3n),
                                                                               alignment: _descriptor_10.alignment() } }] } },
                                                    { idx: { cached: false,
                                                             pushPath: false,
                                                             path: [
                                                                    { tag: 'value',
                                                                      value: { value: _descriptor_0.toValue(airframeId_0),
                                                                               alignment: _descriptor_0.alignment() } }] } },
                                                    { popeq: { cached: false,
                                                               result: undefined } }]).value);
  }
  _getEntry_0(context, partialProofData, airframeId_0, entryId_0) {
    __compactRuntime.assert(_descriptor_2.fromValue(Contract._query(context,
                                                                    partialProofData,
                                                                    [
                                                                     { dup: { n: 0 } },
                                                                     { idx: { cached: false,
                                                                              pushPath: false,
                                                                              path: [
                                                                                     { tag: 'value',
                                                                                       value: { value: _descriptor_10.toValue(0n),
                                                                                                alignment: _descriptor_10.alignment() } }] } },
                                                                     { push: { storage: false,
                                                                               value: __compactRuntime.StateValue.newCell({ value: _descriptor_0.toValue(airframeId_0),
                                                                                                                            alignment: _descriptor_0.alignment() }).encode() } },
                                                                     'member',
                                                                     { popeq: { cached: true,
                                                                                result: undefined } }]).value),
                            'Airframe not registered');
    const k_0 = this._entryKey_0(airframeId_0, entryId_0);
    return _descriptor_6.fromValue(Contract._query(context,
                                                   partialProofData,
                                                   [
                                                    { dup: { n: 0 } },
                                                    { idx: { cached: false,
                                                             pushPath: false,
                                                             path: [
                                                                    { tag: 'value',
                                                                      value: { value: _descriptor_10.toValue(2n),
                                                                               alignment: _descriptor_10.alignment() } }] } },
                                                    { idx: { cached: false,
                                                             pushPath: false,
                                                             path: [
                                                                    { tag: 'value',
                                                                      value: { value: _descriptor_4.toValue(k_0),
                                                                               alignment: _descriptor_4.alignment() } }] } },
                                                    { popeq: { cached: false,
                                                               result: undefined } }]).value);
  }
  _equal_0(x0, y0) {
    if (!x0.every((x, i) => y0[i] === x)) { return false; }
    return true;
  }
  static _query(context, partialProofData, prog) {
    var res;
    try {
      res = context.transactionContext.query(prog, __compactRuntime.CostModel.dummyCostModel());
    } catch (err) {
      throw new __compactRuntime.CompactError(err.toString());
    }
    context.transactionContext = res.context;
    var reads = res.events.filter((e) => e.tag === 'read');
    var i = 0;
    partialProofData.publicTranscript = partialProofData.publicTranscript.concat(prog.map((op) => {
      if(typeof(op) === 'object' && 'popeq' in op) {
        return { popeq: {
          ...op.popeq,
          result: reads[i++].content,
        } };
      } else {
        return op;
      }
    }));
    if(res.events.length == 1 && res.events[0].tag === 'read') {
      return res.events[0].content;
    } else {
      return res.events;
    }
  }
}
function ledger(state) {
  const context = {
    originalState: state,
    transactionContext: new __compactRuntime.QueryContext(state, __compactRuntime.dummyContractAddress())
  };
  const partialProofData = {
    input: { value: [], alignment: [] },
    output: undefined,
    publicTranscript: [],
    privateTranscriptOutputs: []
  };
  return {
    owners: {
      isEmpty(...args_0) {
        if (args_0.length !== 0) {
          throw new __compactRuntime.CompactError(`isEmpty: expected 0 arguments, received ${args_0.length}`);
        }
        return _descriptor_2.fromValue(Contract._query(context,
                                                       partialProofData,
                                                       [
                                                        { dup: { n: 0 } },
                                                        { idx: { cached: false,
                                                                 pushPath: false,
                                                                 path: [
                                                                        { tag: 'value',
                                                                          value: { value: _descriptor_10.toValue(0n),
                                                                                   alignment: _descriptor_10.alignment() } }] } },
                                                        'size',
                                                        { push: { storage: false,
                                                                  value: __compactRuntime.StateValue.newCell({ value: _descriptor_3.toValue(0n),
                                                                                                               alignment: _descriptor_3.alignment() }).encode() } },
                                                        'eq',
                                                        { popeq: { cached: true,
                                                                   result: undefined } }]).value);
      },
      size(...args_0) {
        if (args_0.length !== 0) {
          throw new __compactRuntime.CompactError(`size: expected 0 arguments, received ${args_0.length}`);
        }
        return _descriptor_3.fromValue(Contract._query(context,
                                                       partialProofData,
                                                       [
                                                        { dup: { n: 0 } },
                                                        { idx: { cached: false,
                                                                 pushPath: false,
                                                                 path: [
                                                                        { tag: 'value',
                                                                          value: { value: _descriptor_10.toValue(0n),
                                                                                   alignment: _descriptor_10.alignment() } }] } },
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
          __compactRuntime.type_error('member',
                                      'argument 1',
                                      'airlog.compact line 42 char 1',
                                      'Bytes<32>',
                                      key_0)
        }
        return _descriptor_2.fromValue(Contract._query(context,
                                                       partialProofData,
                                                       [
                                                        { dup: { n: 0 } },
                                                        { idx: { cached: false,
                                                                 pushPath: false,
                                                                 path: [
                                                                        { tag: 'value',
                                                                          value: { value: _descriptor_10.toValue(0n),
                                                                                   alignment: _descriptor_10.alignment() } }] } },
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
          __compactRuntime.type_error('lookup',
                                      'argument 1',
                                      'airlog.compact line 42 char 1',
                                      'Bytes<32>',
                                      key_0)
        }
        return _descriptor_1.fromValue(Contract._query(context,
                                                       partialProofData,
                                                       [
                                                        { dup: { n: 0 } },
                                                        { idx: { cached: false,
                                                                 pushPath: false,
                                                                 path: [
                                                                        { tag: 'value',
                                                                          value: { value: _descriptor_10.toValue(0n),
                                                                                   alignment: _descriptor_10.alignment() } }] } },
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
        const self_0 = state.asArray()[0];
        return self_0.asMap().keys().map(  (key) => {    const value = self_0.asMap().get(key).asCell();    return [      _descriptor_0.fromValue(key.value),      _descriptor_1.fromValue(value.value)    ];  })[Symbol.iterator]();
      }
    },
    issuerAuth: {
      isEmpty(...args_0) {
        if (args_0.length !== 0) {
          throw new __compactRuntime.CompactError(`isEmpty: expected 0 arguments, received ${args_0.length}`);
        }
        return _descriptor_2.fromValue(Contract._query(context,
                                                       partialProofData,
                                                       [
                                                        { dup: { n: 0 } },
                                                        { idx: { cached: false,
                                                                 pushPath: false,
                                                                 path: [
                                                                        { tag: 'value',
                                                                          value: { value: _descriptor_10.toValue(1n),
                                                                                   alignment: _descriptor_10.alignment() } }] } },
                                                        'size',
                                                        { push: { storage: false,
                                                                  value: __compactRuntime.StateValue.newCell({ value: _descriptor_3.toValue(0n),
                                                                                                               alignment: _descriptor_3.alignment() }).encode() } },
                                                        'eq',
                                                        { popeq: { cached: true,
                                                                   result: undefined } }]).value);
      },
      size(...args_0) {
        if (args_0.length !== 0) {
          throw new __compactRuntime.CompactError(`size: expected 0 arguments, received ${args_0.length}`);
        }
        return _descriptor_3.fromValue(Contract._query(context,
                                                       partialProofData,
                                                       [
                                                        { dup: { n: 0 } },
                                                        { idx: { cached: false,
                                                                 pushPath: false,
                                                                 path: [
                                                                        { tag: 'value',
                                                                          value: { value: _descriptor_10.toValue(1n),
                                                                                   alignment: _descriptor_10.alignment() } }] } },
                                                        'size',
                                                        { popeq: { cached: true,
                                                                   result: undefined } }]).value);
      },
      member(...args_0) {
        if (args_0.length !== 1) {
          throw new __compactRuntime.CompactError(`member: expected 1 argument, received ${args_0.length}`);
        }
        const key_0 = args_0[0];
        if (!(typeof(key_0) === 'bigint' && key_0 >= 0 && key_0 <= __compactRuntime.MAX_FIELD)) {
          __compactRuntime.type_error('member',
                                      'argument 1',
                                      'airlog.compact line 45 char 1',
                                      'Field',
                                      key_0)
        }
        return _descriptor_2.fromValue(Contract._query(context,
                                                       partialProofData,
                                                       [
                                                        { dup: { n: 0 } },
                                                        { idx: { cached: false,
                                                                 pushPath: false,
                                                                 path: [
                                                                        { tag: 'value',
                                                                          value: { value: _descriptor_10.toValue(1n),
                                                                                   alignment: _descriptor_10.alignment() } }] } },
                                                        { push: { storage: false,
                                                                  value: __compactRuntime.StateValue.newCell({ value: _descriptor_4.toValue(key_0),
                                                                                                               alignment: _descriptor_4.alignment() }).encode() } },
                                                        'member',
                                                        { popeq: { cached: true,
                                                                   result: undefined } }]).value);
      },
      lookup(...args_0) {
        if (args_0.length !== 1) {
          throw new __compactRuntime.CompactError(`lookup: expected 1 argument, received ${args_0.length}`);
        }
        const key_0 = args_0[0];
        if (!(typeof(key_0) === 'bigint' && key_0 >= 0 && key_0 <= __compactRuntime.MAX_FIELD)) {
          __compactRuntime.type_error('lookup',
                                      'argument 1',
                                      'airlog.compact line 45 char 1',
                                      'Field',
                                      key_0)
        }
        return _descriptor_2.fromValue(Contract._query(context,
                                                       partialProofData,
                                                       [
                                                        { dup: { n: 0 } },
                                                        { idx: { cached: false,
                                                                 pushPath: false,
                                                                 path: [
                                                                        { tag: 'value',
                                                                          value: { value: _descriptor_10.toValue(1n),
                                                                                   alignment: _descriptor_10.alignment() } }] } },
                                                        { idx: { cached: false,
                                                                 pushPath: false,
                                                                 path: [
                                                                        { tag: 'value',
                                                                          value: { value: _descriptor_4.toValue(key_0),
                                                                                   alignment: _descriptor_4.alignment() } }] } },
                                                        { popeq: { cached: false,
                                                                   result: undefined } }]).value);
      },
      [Symbol.iterator](...args_0) {
        if (args_0.length !== 0) {
          throw new __compactRuntime.CompactError(`iter: expected 0 arguments, received ${args_0.length}`);
        }
        const self_0 = state.asArray()[1];
        return self_0.asMap().keys().map(  (key) => {    const value = self_0.asMap().get(key).asCell();    return [      _descriptor_4.fromValue(key.value),      _descriptor_2.fromValue(value.value)    ];  })[Symbol.iterator]();
      }
    },
    entryStore: {
      isEmpty(...args_0) {
        if (args_0.length !== 0) {
          throw new __compactRuntime.CompactError(`isEmpty: expected 0 arguments, received ${args_0.length}`);
        }
        return _descriptor_2.fromValue(Contract._query(context,
                                                       partialProofData,
                                                       [
                                                        { dup: { n: 0 } },
                                                        { idx: { cached: false,
                                                                 pushPath: false,
                                                                 path: [
                                                                        { tag: 'value',
                                                                          value: { value: _descriptor_10.toValue(2n),
                                                                                   alignment: _descriptor_10.alignment() } }] } },
                                                        'size',
                                                        { push: { storage: false,
                                                                  value: __compactRuntime.StateValue.newCell({ value: _descriptor_3.toValue(0n),
                                                                                                               alignment: _descriptor_3.alignment() }).encode() } },
                                                        'eq',
                                                        { popeq: { cached: true,
                                                                   result: undefined } }]).value);
      },
      size(...args_0) {
        if (args_0.length !== 0) {
          throw new __compactRuntime.CompactError(`size: expected 0 arguments, received ${args_0.length}`);
        }
        return _descriptor_3.fromValue(Contract._query(context,
                                                       partialProofData,
                                                       [
                                                        { dup: { n: 0 } },
                                                        { idx: { cached: false,
                                                                 pushPath: false,
                                                                 path: [
                                                                        { tag: 'value',
                                                                          value: { value: _descriptor_10.toValue(2n),
                                                                                   alignment: _descriptor_10.alignment() } }] } },
                                                        'size',
                                                        { popeq: { cached: true,
                                                                   result: undefined } }]).value);
      },
      member(...args_0) {
        if (args_0.length !== 1) {
          throw new __compactRuntime.CompactError(`member: expected 1 argument, received ${args_0.length}`);
        }
        const key_0 = args_0[0];
        if (!(typeof(key_0) === 'bigint' && key_0 >= 0 && key_0 <= __compactRuntime.MAX_FIELD)) {
          __compactRuntime.type_error('member',
                                      'argument 1',
                                      'airlog.compact line 48 char 1',
                                      'Field',
                                      key_0)
        }
        return _descriptor_2.fromValue(Contract._query(context,
                                                       partialProofData,
                                                       [
                                                        { dup: { n: 0 } },
                                                        { idx: { cached: false,
                                                                 pushPath: false,
                                                                 path: [
                                                                        { tag: 'value',
                                                                          value: { value: _descriptor_10.toValue(2n),
                                                                                   alignment: _descriptor_10.alignment() } }] } },
                                                        { push: { storage: false,
                                                                  value: __compactRuntime.StateValue.newCell({ value: _descriptor_4.toValue(key_0),
                                                                                                               alignment: _descriptor_4.alignment() }).encode() } },
                                                        'member',
                                                        { popeq: { cached: true,
                                                                   result: undefined } }]).value);
      },
      lookup(...args_0) {
        if (args_0.length !== 1) {
          throw new __compactRuntime.CompactError(`lookup: expected 1 argument, received ${args_0.length}`);
        }
        const key_0 = args_0[0];
        if (!(typeof(key_0) === 'bigint' && key_0 >= 0 && key_0 <= __compactRuntime.MAX_FIELD)) {
          __compactRuntime.type_error('lookup',
                                      'argument 1',
                                      'airlog.compact line 48 char 1',
                                      'Field',
                                      key_0)
        }
        return _descriptor_6.fromValue(Contract._query(context,
                                                       partialProofData,
                                                       [
                                                        { dup: { n: 0 } },
                                                        { idx: { cached: false,
                                                                 pushPath: false,
                                                                 path: [
                                                                        { tag: 'value',
                                                                          value: { value: _descriptor_10.toValue(2n),
                                                                                   alignment: _descriptor_10.alignment() } }] } },
                                                        { idx: { cached: false,
                                                                 pushPath: false,
                                                                 path: [
                                                                        { tag: 'value',
                                                                          value: { value: _descriptor_4.toValue(key_0),
                                                                                   alignment: _descriptor_4.alignment() } }] } },
                                                        { popeq: { cached: false,
                                                                   result: undefined } }]).value);
      },
      [Symbol.iterator](...args_0) {
        if (args_0.length !== 0) {
          throw new __compactRuntime.CompactError(`iter: expected 0 arguments, received ${args_0.length}`);
        }
        const self_0 = state.asArray()[2];
        return self_0.asMap().keys().map(  (key) => {    const value = self_0.asMap().get(key).asCell();    return [      _descriptor_4.fromValue(key.value),      _descriptor_6.fromValue(value.value)    ];  })[Symbol.iterator]();
      }
    },
    nextEntryId: {
      isEmpty(...args_0) {
        if (args_0.length !== 0) {
          throw new __compactRuntime.CompactError(`isEmpty: expected 0 arguments, received ${args_0.length}`);
        }
        return _descriptor_2.fromValue(Contract._query(context,
                                                       partialProofData,
                                                       [
                                                        { dup: { n: 0 } },
                                                        { idx: { cached: false,
                                                                 pushPath: false,
                                                                 path: [
                                                                        { tag: 'value',
                                                                          value: { value: _descriptor_10.toValue(3n),
                                                                                   alignment: _descriptor_10.alignment() } }] } },
                                                        'size',
                                                        { push: { storage: false,
                                                                  value: __compactRuntime.StateValue.newCell({ value: _descriptor_3.toValue(0n),
                                                                                                               alignment: _descriptor_3.alignment() }).encode() } },
                                                        'eq',
                                                        { popeq: { cached: true,
                                                                   result: undefined } }]).value);
      },
      size(...args_0) {
        if (args_0.length !== 0) {
          throw new __compactRuntime.CompactError(`size: expected 0 arguments, received ${args_0.length}`);
        }
        return _descriptor_3.fromValue(Contract._query(context,
                                                       partialProofData,
                                                       [
                                                        { dup: { n: 0 } },
                                                        { idx: { cached: false,
                                                                 pushPath: false,
                                                                 path: [
                                                                        { tag: 'value',
                                                                          value: { value: _descriptor_10.toValue(3n),
                                                                                   alignment: _descriptor_10.alignment() } }] } },
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
          __compactRuntime.type_error('member',
                                      'argument 1',
                                      'airlog.compact line 51 char 1',
                                      'Bytes<32>',
                                      key_0)
        }
        return _descriptor_2.fromValue(Contract._query(context,
                                                       partialProofData,
                                                       [
                                                        { dup: { n: 0 } },
                                                        { idx: { cached: false,
                                                                 pushPath: false,
                                                                 path: [
                                                                        { tag: 'value',
                                                                          value: { value: _descriptor_10.toValue(3n),
                                                                                   alignment: _descriptor_10.alignment() } }] } },
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
          __compactRuntime.type_error('lookup',
                                      'argument 1',
                                      'airlog.compact line 51 char 1',
                                      'Bytes<32>',
                                      key_0)
        }
        return _descriptor_3.fromValue(Contract._query(context,
                                                       partialProofData,
                                                       [
                                                        { dup: { n: 0 } },
                                                        { idx: { cached: false,
                                                                 pushPath: false,
                                                                 path: [
                                                                        { tag: 'value',
                                                                          value: { value: _descriptor_10.toValue(3n),
                                                                                   alignment: _descriptor_10.alignment() } }] } },
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
        return self_0.asMap().keys().map(  (key) => {    const value = self_0.asMap().get(key).asCell();    return [      _descriptor_0.fromValue(key.value),      _descriptor_3.fromValue(value.value)    ];  })[Symbol.iterator]();
      }
    }
  };
}
const _emptyContext = {
  originalState: new __compactRuntime.ContractState(),
  transactionContext: new __compactRuntime.QueryContext(new __compactRuntime.ContractState().data, __compactRuntime.dummyContractAddress())
};
const _dummyContract = new Contract({ });
const pureCircuits = {};
const contractReferenceLocations = { tag: 'publicLedgerArray', indices: { } };
exports.Contract = Contract;
exports.ledger = ledger;
exports.pureCircuits = pureCircuits;
exports.contractReferenceLocations = contractReferenceLocations;
//# sourceMappingURL=index.cjs.map
