// STAGING prover/relayer, run on the box (never on Railway): pulls jobs from the staging app over HTTPS
// (outbound only), proves with the LOCAL proof server, pays DUST from the throwaway Preview wallet, reports tx hashes.
//   PILOTLOG_CFI_MIDNIGHT=1 CFI_MIDNIGHT_SEED_FILE=... CFI_STAGING_URL=https://cfi-passkey-staging-staging.up.railway.app \
//   CFI_WORKER_TOKEN_FILE=... node worker.mjs
// Uses the contract deployed by run.mjs (.state-v2/results.json) and the SYNTHETIC school-A admin passkey from
// .state-v2/synthetic-secrets.json to approve enrollments into the staging demo school.
import { readFileSync } from 'node:fs';
import { connect, pub, sleep, fromJson, recycleProver } from './lib.mjs';
import { schoolDigest, keyIdOf, cfiRef, schoolRef, SCHOOL_OPS } from '../src/canonical.mjs';
import { assertionToCircuitArgs, coseKeyToPoint } from '../src/webauthn.mjs';
import { createSoftPasskey } from '../src/softPasskey.mjs';
import { fromHex, toHex } from '../src/bytes.mjs';

const STATE = new URL('./.state-v2/', import.meta.url);
const R = JSON.parse(readFileSync(new URL('results.json', STATE), 'utf8'));
const S = JSON.parse(readFileSync(new URL('synthetic-secrets.json', STATE), 'utf8'));
const BASE = process.env.CFI_STAGING_URL;
const TOKEN = readFileSync(process.env.CFI_WORKER_TOKEN_FILE, 'utf8').trim();
if (!BASE?.startsWith('https://')) throw new Error('CFI_STAGING_URL must be https');
const addr = R.steps.deploy.contractAddress, addrBytes = fromHex(addr, 32);
const admin = await createSoftPasskey({ privateJwk: S.adminA });
const schoolA = schoolRef('synthetic-school-A (staging demo)', S.saltA);
if (toHex(schoolA) !== R.schoolA) throw new Error('school A id mismatch');

const log = (...a) => console.log(new Date().toISOString(), ...a);
const api = async (path, body) => {
  const r = await fetch(BASE + path, { method: 'POST', headers: { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' }, body: JSON.stringify(body ?? {}) });
  if (!r.ok) throw new Error(`${path} -> ${r.status}`);
  return r.json();
};
const M = await connect({ stateDir: STATE, log });
const deployed = await M.find(addr);
const wa = (a) => [a.cfiPubKey, a.authData, a.challenge, a.cdSuffix, a.flagsBit1, a.flagsHigh, a.sig];
log('worker ready; contract', addr);

for (;;) {
  let job;
  try { job = (await api('/api/worker/claim')).job; } catch (e) { log('claim failed', e.message); await sleep(10_000); continue; }
  if (!job) { await sleep(3_000); continue; }
  const t = Date.now(); M.timing.cur = {};
  try {
    await recycleProver(log);
    await M.wallet.waitForSyncedState();
    let r;
    if (job.type === 'enroll') {
      const { schoolId, keyId, cfiRef: ref } = job.payload;
      if (schoolId !== R.schoolA) throw new Error('only the staging demo school is served by this worker');
      const d = schoolDigest(addrBytes, SCHOOL_OPS.enrollCfi, fromHex(schoolId, 32), fromHex(keyId, 32), fromHex(ref, 32));
      const a = assertionToCircuitArgs({ publicKey: { cose: admin.cose }, ...(await admin.get(d)), digest: d });
      r = await deployed.callTx.schoolEnrollCfi(fromHex(schoolId, 32), fromHex(keyId, 32), fromHex(ref, 32), ...wa(a));
    } else if (job.type === 'endorse') {
      r = await deployed.callTx.endorseEntry(...fromJson(job.payload.args));
    } else throw new Error('unknown job type');
    const p = pub(r.public);
    log(job.type, job.id.slice(0, 8), 'ok', p.txHash, 'prove', M.timing.cur.proveMs, 'ms total', Date.now() - t, 'ms; DUST', await M.dust());
    await api('/api/worker/result', { id: job.id, ok: true, ...p, proveMs: M.timing.cur.proveMs });
  } catch (e) {
    const msg = String(e?.message ?? e).split('\n')[0].slice(0, 300);
    log(job.type, job.id.slice(0, 8), 'FAILED', msg);
    await api('/api/worker/result', { id: job.id, ok: false, error: msg, retryable: !/failed assert/.test(msg) }).catch(() => {});
  } finally { M.timing.cur = null; }
}
