// In-process simulator for contract/cfi_endorse.compact using @midnight-ntwrk/compact-runtime 0.21.0.
// No network, no proofs: executes the circuits (all asserts) against an in-memory ledger.
// There are no witnesses: every authority (root key, school admin passkey, CFI passkey) is a signature
// checked in-circuit, so the caller of a circuit (relayer) needs no secret to act on anyone's behalf.
import * as rt from '@midnight-ntwrk/compact-runtime';
import { Contract, ledger, pureCircuits } from '../contract/managed/contract/index.js';
import { assertEnabled } from './flag.mjs';

export { pureCircuits, ledger };

const wa = (a) => [a.cfiPubKey, a.authData, a.challenge, a.cdSuffix, a.flagsBit1, a.flagsHigh, a.sig];

export class CfiEndorseSimulator {
  /** @param {{ rootKeyId: Uint8Array, env?: object }} opts */
  static async create({ rootKeyId, env = process.env }) {
    assertEnabled(env);
    const sim = new CfiEndorseSimulator();
    sim.contract = new Contract({});
    sim.cpk = '00'.repeat(32);
    sim.address = rt.sampleContractAddress();
    const init = await sim.contract.initialState(rt.createConstructorContext({}, sim.cpk), rootKeyId);
    sim.state = init.currentContractState.data;
    return sim;
  }
  /** Contract address as the 32 bytes the circuit sees via kernel.self().bytes. */
  get addressBytes() { return Uint8Array.from(Buffer.from(this.address, 'hex')); }
  get ledger() { return ledger(this.state); }
  async call(circuitId, ...args) {
    const ctx = rt.createCircuitContext({ circuitId, contractAddress: this.address, coinPublicKeyOrZswapState: this.cpk, contractState: this.state, privateState: {} });
    const r = await this.contract.circuits[circuitId](ctx, ...args);
    this.state = r.context.queryContexts[this.address].state;
    return r;
  }
  // root ops: r = { rootPk, sig }
  rootOnboardSchool(schoolId, adminKeyId, r) { return this.call('rootOnboardSchool', schoolId, adminKeyId, r.rootPk, r.sig); }
  rootRevokeSchool(schoolId, r) { return this.call('rootRevokeSchool', schoolId, r.rootPk, r.sig); }
  rootSetSchoolAdmin(schoolId, newAdminKeyId, r) { return this.call('rootSetSchoolAdmin', schoolId, newAdminKeyId, r.rootPk, r.sig); }
  rootSetKey(keyId, active, r) { return this.call('rootSetKey', keyId, active, r.rootPk, r.sig); }
  // school ops: a = assertionToCircuitArgs(...) of the school admin passkey
  schoolEnrollCfi(schoolId, cfiKeyId, cfiRef, a) { return this.call('schoolEnrollCfi', schoolId, cfiKeyId, cfiRef, ...wa(a)); }
  schoolRevokeCfi(schoolId, cfiKeyId, a) { return this.call('schoolRevokeCfi', schoolId, cfiKeyId, ...wa(a)); }
  schoolRotateAdmin(schoolId, newAdminKeyId, a) { return this.call('schoolRotateAdmin', schoolId, newAdminKeyId, ...wa(a)); }
  // CFI ops
  endorseEntry(entryHash, studentCommit, attestHash, a) { return this.call('endorseEntry', entryHash, studentCommit, attestHash, ...wa(a)); }
  selfRevoke(a) { return this.call('selfRevoke', ...wa(a)); }
}
