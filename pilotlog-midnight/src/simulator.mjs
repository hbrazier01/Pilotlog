// In-process simulator for contract/cfi_endorse.compact using @midnight-ntwrk/compact-runtime 0.21.0.
// No network, no proofs: executes the circuits (all asserts) against an in-memory ledger.
import * as rt from '@midnight-ntwrk/compact-runtime';
import { Contract, ledger, pureCircuits } from '../contract/managed/contract/index.js';
import { assertEnabled } from './flag.mjs';

export { pureCircuits, ledger };

export class CfiEndorseSimulator {
  /** @param {{ adminSecret: Uint8Array, env?: object }} opts */
  static async create({ adminSecret, env = process.env }) {
    assertEnabled(env);
    const sim = new CfiEndorseSimulator();
    sim.callerSecret = adminSecret;
    sim.contract = new Contract({ adminSecret: ({ privateState }) => [privateState, sim.callerSecret] });
    sim.cpk = '00'.repeat(32);
    sim.address = rt.sampleContractAddress();
    const init = await sim.contract.initialState(rt.createConstructorContext({}, sim.cpk), pureCircuits.adminCommitment(adminSecret));
    sim.state = init.currentContractState.data;
    return sim;
  }
  /** Contract address as the 32 bytes the circuit sees via kernel.self().bytes. */
  get addressBytes() { return Uint8Array.from(Buffer.from(this.address, 'hex')); }
  /** Act as a different caller (e.g. a non-admin) for subsequent calls. */
  as(secret) { this.callerSecret = secret; return this; }
  get ledger() { return ledger(this.state); }
  async call(circuitId, ...args) {
    const ctx = rt.createCircuitContext({ circuitId, contractAddress: this.address, coinPublicKeyOrZswapState: this.cpk, contractState: this.state, privateState: {} });
    const r = await this.contract.circuits[circuitId](ctx, ...args);
    this.state = r.context.queryContexts[this.address].state;
    return r;
  }
  enrollCfi(keyId, cfiRef) { return this.call('enrollCfi', keyId, cfiRef); }
  revokeCfi(keyId) { return this.call('revokeCfi', keyId); }
  rotateAdmin(newCommit) { return this.call('rotateAdmin', newCommit); }
  endorseEntry(entryHash, studentCommit, a) {
    return this.call('endorseEntry', entryHash, studentCommit, a.cfiPubKey, a.authData, a.challenge, a.cdSuffix, a.flagsBit1, a.flagsHigh, a.sig);
  }
  selfRevoke(a) {
    return this.call('selfRevoke', a.cfiPubKey, a.authData, a.challenge, a.cdSuffix, a.flagsBit1, a.flagsHigh, a.sig);
  }
}
