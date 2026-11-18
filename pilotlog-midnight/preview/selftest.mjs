// Out-of-band self-test of the staging fee wallet + prover (does NOT touch the staging job queue):
// enrolls a fresh SYNTHETIC CFI key into the staging demo school and endorses one synthetic entry on Preview,
// printing the full (cause-chain) error on failure. Same env as worker.mjs (no CFI_STAGING_URL needed).
import { readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { connect, pub, recycleProver } from './lib.mjs';
import { schoolDigest, schoolRef, cfiRef, endorseDigest, entryHash, studentCommit, attestHash, signatureBlockCommit, keyIdOf, SCHOOL_OPS } from '../src/canonical.mjs';
import { assertionToCircuitArgs, coseKeyToPoint } from '../src/webauthn.mjs';
import { createSoftPasskey } from '../src/softPasskey.mjs';
import { fromHex, toHex } from '../src/bytes.mjs';

const STATE = new URL('./.state-v2/', import.meta.url);
const R = JSON.parse(readFileSync(new URL('results.json', STATE), 'utf8'));
const S = JSON.parse(readFileSync(new URL('synthetic-secrets.json', STATE), 'utf8'));
const log = (...a) => console.log(new Date().toISOString(), ...a);
const causeChain = (e) => { const out = []; for (let c = e, i = 0; c && i < 6; c = c.cause, i++) out.push(`${c.name ?? c._tag ?? 'Error'}: ${String(c.message ?? c).split('\n').slice(0, 3).join(' / ').slice(0, 400)}`); return out.join('\n   <- '); };
const addr = R.steps.deploy.contractAddress, addrBytes = fromHex(addr, 32);
const schoolId = schoolRef('synthetic-school-A (staging demo)', S.saltA);
const admin = await createSoftPasskey({ privateJwk: S.adminA });
const cfi = await createSoftPasskey();
const keyId = keyIdOf(coseKeyToPoint(cfi.cose)), ref = cfiRef('synthetic-selftest-' + toHex(randomBytes(4)), S.cfiSalt);
const wa = (a) => [a.cfiPubKey, a.authData, a.challenge, a.cdSuffix, a.flagsBit1, a.flagsHigh, a.sig];
const M = await connect({ stateDir: STATE, log });
const deployed = await M.find(addr);
const step = async (name, fn) => {
  await recycleProver(log); await M.wallet.waitForSyncedState();
  const t = Date.now(); M.timing.cur = {};
  try { const p = pub((await fn()).public); log(name, 'OK', p.txHash, p.status, 'prove', M.timing.cur.proveMs, 'ms total', Date.now() - t, 'ms; DUST', await M.dust()); return p; }
  catch (e) { log(name, 'FAILED\n   ' + causeChain(e)); process.exit(1); }
};
await step('selftest enroll', async () => {
  const d = schoolDigest(addrBytes, SCHOOL_OPS.enrollCfi, schoolId, keyId, ref);
  return deployed.callTx.schoolEnrollCfi(schoolId, keyId, ref, ...wa(assertionToCircuitArgs({ publicKey: { cose: admin.cose }, ...(await admin.get(d)), digest: d })));
});
await step('selftest endorse', async () => {
  const eh = entryHash({ entryId: 'selftest-' + toHex(randomBytes(4)), entrySalt: toHex(randomBytes(32)), date: '2026-11-17', aircraftIdent: 'N123PL', aircraftType: 'DA40', from: 'KAPA', to: 'KAPA', totalTenths: 10, dualReceivedTenths: 10, landingsDay: 1, remarks: 'SYNTHETIC selftest' });
  const sc = studentCommit('synthetic-selftest-student', S.studentSalt);
  const att = attestHash(new Uint8Array(randomBytes(32)), signatureBlockCommit({ cfiName: 'Synthetic Selftest', certificateNumber: '1234567', currencyKind: 'RE', currencyDate: '2027-01-31', signedDate: '2026-11-17' }, toHex(randomBytes(32))));
  const d = endorseDigest(addrBytes, eh, sc, att);
  return deployed.callTx.endorseEntry(eh, sc, att, ...wa(assertionToCircuitArgs({ publicKey: { cose: cfi.cose }, ...(await cfi.get(d)), digest: d })));
});
log('selftest passed');
process.exit(0);
