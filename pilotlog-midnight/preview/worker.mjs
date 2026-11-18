// STAGING prover/relayer, run on the box (never on Railway): pulls jobs from the staging app over HTTPS
// (outbound only), proves with the LOCAL proof server, pays DUST from the throwaway Preview wallet, reports tx hashes.
//   PILOTLOG_CFI_MIDNIGHT=1 CFI_MIDNIGHT_SEED_FILE=... CFI_STAGING_URL=https://cfi-passkey-staging-staging.up.railway.app \
//   CFI_WORKER_TOKEN_FILE=... node worker.mjs
// Uses the contract deployed by run.mjs (.state-v2/results.json) and the SYNTHETIC school-A admin passkey from
// .state-v2/synthetic-secrets.json to approve enrollments into the staging demo school.
import { readFileSync, writeFileSync } from 'node:fs';
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
  const r = await fetch(BASE + path, { method: 'POST', headers: { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' }, body: JSON.stringify(body ?? {}), signal: AbortSignal.timeout(20_000) });
  if (!r.ok) throw new Error(`${path} -> ${r.status}`);
  return r.json();
};
// Liveness for preview/worker-watchdog.sh: { at, busyUntil } (ms). The watchdog restarts the worker when
// now > max(at + 60 s, busyUntil), i.e. no successful claim for 60 s outside a bounded job or startup window.
const HEARTBEAT = process.env.CFI_WORKER_HEARTBEAT ?? '/tmp/cfi-worker.heartbeat';
const beat = (busyMs = 0) => { try { writeFileSync(HEARTBEAT, JSON.stringify({ at: Date.now(), busyUntil: Date.now() + busyMs, pid: process.pid })); } catch { /* best effort */ } };
beat(5 * 60_000); // wallet sync can take minutes at startup
const within = (p, ms, what) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(`${what} timed out after ${ms / 1000} s`)), ms))]);
// Walk the error's cause chain (providers redact the top-level message; the cause carries the real reason).
const causeChain = (e) => { const out = []; for (let c = e, i = 0; c && i < 5; c = c.cause, i++) out.push(`${c.name ?? c._tag ?? 'Error'}: ${String(c.message ?? c).split('\n')[0].slice(0, 240)}`); return out.join(' <- '); };
// Wallet/RPC failures leave the in-process wallet stale (its sync stream dies silently). Fail fast and let the
// watchdog start a fresh process, which resyncs from scratch.
const FATAL = /balanceTx|Wallet\.Sync|WebSocket|timed out|disconnected|submitTx|ECONNRESET/i;
// The worker always recycles the local proof server between proofs: without it the proof server grows past the
// 3.8 GB kill switch and is killed mid-proof (seen 2026-11-17 18:04 MST when the worker ran without this env).
process.env.PROOF_SERVER_RECYCLE ??= '1';
// The wallet SDK reports a broken sync stream only by printing 'Wallet.Sync' errors; the process then keeps a
// stale wallet (balanceTx rejected, waitForSyncedState hangs). Treat that as fatal: exit and let the watchdog resync.
let walletBroken = false;
for (const k of ['log', 'error', 'warn']) { const orig = console[k].bind(console); console[k] = (...a) => { if (!walletBroken && a.some((x) => /Wallet\.Sync/.test(String(x?._tag ?? x)))) { walletBroken = true; orig(new Date().toISOString(), 'WALLET SYNC ERROR detected: this process will exit before claiming more jobs'); } orig(...a); }; }
const M = await connect({ stateDir: STATE, log });
const deployed = await M.find(addr);
const wa = (a) => [a.cfiPubKey, a.authData, a.challenge, a.cdSuffix, a.flagsBit1, a.flagsHigh, a.sig];
// Preflight: prove the fee wallet and prover work IN THIS PROCESS before touching any real job, by enrolling a
// fresh synthetic key into the staging demo school (≈1 min, a fraction of a DUST).
if (process.env.CFI_WORKER_PREFLIGHT !== '0') {
  beat(5 * 60_000);
  try {
    await recycleProver(log);
    await within(M.wallet.waitForSyncedState(), 90_000, 'wallet sync');
    const k = await createSoftPasskey(); const kid = keyIdOf(coseKeyToPoint(k.cose)); const ref = cfiRef('synthetic-worker-preflight-' + Date.now(), S.cfiSalt);
    const d = schoolDigest(addrBytes, SCHOOL_OPS.enrollCfi, schoolA, kid, ref);
    const a = assertionToCircuitArgs({ publicKey: { cose: admin.cose }, ...(await admin.get(d)), digest: d });
    const p = pub((await within(deployed.callTx.schoolEnrollCfi(schoolA, kid, ref, ...wa(a)), 180_000, 'preflight enroll tx')).public);
    log('preflight OK (synthetic enroll)', p.txHash, p.status);
  } catch (e) { log('preflight FAILED | cause:', causeChain(e)); process.exit(3); }
  if (walletBroken) { log('preflight: wallet sync errors seen; exiting'); process.exit(3); }
}
log('worker ready; contract', addr);

const DUST_LAG = /DustTreesNotAtBlock|No Dust spend can be dated/;
async function runJob(job) {
  await recycleProver(log);
  await within(M.wallet.waitForSyncedState(), 90_000, 'wallet sync');
  let r;

  if (job.type === 'enroll') {
    const { schoolId, keyId, cfiRef: ref } = job.payload;
    if (schoolId !== R.schoolA) throw new Error('only the staging demo school is served by this worker');
    const d = schoolDigest(addrBytes, SCHOOL_OPS.enrollCfi, fromHex(schoolId, 32), fromHex(keyId, 32), fromHex(ref, 32));
    const a = assertionToCircuitArgs({ publicKey: { cose: admin.cose }, ...(await admin.get(d)), digest: d });
    r = await within(deployed.callTx.schoolEnrollCfi(fromHex(schoolId, 32), fromHex(keyId, 32), fromHex(ref, 32), ...wa(a)), 180_000, 'enroll tx');
  } else if (job.type === 'endorse') {
    r = await within(deployed.callTx.endorseEntry(...fromJson(job.payload.args)), 180_000, 'endorse tx');
  } else throw new Error('unknown job type');
  return r;
}
for (;;) {
  if (walletBroken) { log('wallet sync errors seen; exiting before the next claim'); process.exit(3); }
  let job;
  try { job = (await api('/api/worker/claim')).job; beat(job ? 6 * 60_000 : 0); } catch (e) { log('claim failed', e.message); await sleep(10_000); continue; }
  if (!job) { await sleep(3_000); continue; }
  const t = Date.now(); M.timing.cur = {};
  try {
    // DustTreesNotAtBlock ("No Dust spend can be dated yet"): the wallet's Dust trees lag the chain tip right after
    // a previous tx, so fee balancing can't date a DUST spend. Not the job's fault: give the dust sync time to catch
    // up and retry once in-process (nothing was submitted). Bounded so a job finishes well inside the server's 10-min reclaim.
    let r;
    for (let attempt = 1; ; attempt++) {
      try { r = await runJob(job); break; } catch (e) {
        if (attempt >= 2 || !DUST_LAG.test(causeChain(e))) throw e;
        log(job.type, job.id.slice(0, 8), 'dust trees behind the chain tip; waiting 20 s, then retrying once in-process');
        beat(6 * 60_000); await sleep(20_000); walletBroken = false;
      }
    }
    const p = pub(r.public);
    log(job.type, job.id.slice(0, 8), 'ok', p.txHash, 'prove', M.timing.cur.proveMs, 'ms total', Date.now() - t, 'ms; DUST', await M.dust());
    await api('/api/worker/result', { id: job.id, ok: true, ...p, proveMs: M.timing.cur.proveMs });
  } catch (e) {
    const msg = String(e?.message ?? e).split('\n')[0].slice(0, 300);
    const chain = causeChain(e);
    log(job.type, job.id.slice(0, 8), 'FAILED', msg, '| cause:', chain);
    // Infrastructure failures (wallet, RPC, prover, timeouts) are NOT the job's fault: don't report them (that would
    // burn the job's attempts); exit instead. The server requeues an unreported claim after 10 min (no attempt cap).
    if (FATAL.test(chain) || walletBroken) { log('infra failure: NOT reporting; exiting so the watchdog restarts with a fresh sync; job will be requeued by the server'); process.exit(3); }
    await api('/api/worker/result', { id: job.id, ok: false, error: msg, retryable: !/failed assert/.test(msg) }).catch(() => {});
  } finally { M.timing.cur = null; }
}
