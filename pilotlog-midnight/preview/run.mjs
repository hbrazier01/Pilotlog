// Midnight PREVIEW TESTNET key-flow run of the layered-admin contract with SYNTHETIC keys and data.
//   deploy (synthetic ROOT key) -> root onboards school A (staging demo school) and school B
//   -> each school enrolls a CFI -> A's CFI endorses -> cross-school revoke attempt (must fail)
//   -> school-admin attempting a root op (must fail) -> school A enrolls + revokes a 2nd CFI -> its endorse fails
//   -> root revokes school B -> B's CFI endorse fails -> A's CFI still endorses (isolation) -> read back.
//
// Requirements (all local; nothing touches PilotLog production):
//   PILOTLOG_CFI_MIDNIGHT=1, CFI_MIDNIGHT_SEED_FILE=<throwaway Preview wallet seed> (NEVER printed)
//   a local proof server 9.0.0 on PROOF_SERVER (default http://127.0.0.1:6300)
//   full compile output in ../contract/managed (keys gitignored)
// Resumable: progress + SYNTHETIC keys live in preview/.state-v2/ (gitignored, 0600).
import { existsSync, readFileSync, writeFileSync, chmodSync, mkdirSync } from 'node:fs';
import { randomBytes, createPrivateKey } from 'node:crypto';
import { connect, pub, sleep, recycleProver } from './lib.mjs';
import { entryHash, studentCommit, cfiRef, schoolRef, endorseDigest, schoolDigest, endorsementKey, keyIdOf, attestHash, signatureBlockCommit, ROOT_OPS, SCHOOL_OPS, ZERO32 } from '../src/canonical.mjs';
import { assertionToCircuitArgs, coseKeyToPoint } from '../src/webauthn.mjs';
import { createSoftPasskey } from '../src/softPasskey.mjs';
import { createSyntheticRootKey, synthRootArgs } from '../src/rootKey.mjs';
import { CONTRACT_ENV } from '../src/env.mjs';
import { toHex, fromHex, sha256 } from '../src/bytes.mjs';

const STATE = new URL('./.state-v2/', import.meta.url);
mkdirSync(STATE, { recursive: true, mode: 0o700 });
const RES = new URL('results.json', STATE), SECRETS = new URL('synthetic-secrets.json', STATE);
const R = existsSync(RES) ? JSON.parse(readFileSync(RES, 'utf8')) : { network: 'preview', rpId: CONTRACT_ENV.rpId, origin: CONTRACT_ENV.origin, steps: {} };
const save = () => writeFileSync(RES, JSON.stringify(R, (k, v) => (typeof v === 'bigint' ? v.toString() : v), 2));
if (!existsSync(SECRETS)) {
  const jwk = async () => (await createSoftPasskey()).exportPrivateJwk();
  const root = createSyntheticRootKey();
  writeFileSync(SECRETS, JSON.stringify({
    note: 'SYNTHETIC test-only keys for a Midnight Preview run. Not real people, schools or certificates.',
    rootPem: root.privateKey.export({ type: 'pkcs8', format: 'pem' }),
    adminA: await jwk(), adminB: await jwk(), cfiA1: await jwk(), cfiA2: await jwk(), cfiB1: await jwk(),
    saltA: toHex(randomBytes(32)), saltB: toHex(randomBytes(32)), cfiSalt: toHex(randomBytes(32)), studentSalt: toHex(randomBytes(32)),
  }));
  chmodSync(SECRETS, 0o600);
}
const S = JSON.parse(readFileSync(SECRETS, 'utf8'));
const root = createSyntheticRootKey(createPrivateKey(S.rootPem));
const holder = async (jwk, label) => { const pk = await createSoftPasskey({ privateJwk: jwk }); const point = coseKeyToPoint(pk.cose); return { pk, point, keyId: keyIdOf(point), ref: cfiRef(label, S.cfiSalt) }; };
const schoolA = { id: schoolRef('synthetic-school-A (staging demo)', S.saltA), admin: await holder(S.adminA, 'admin-a') };
const schoolB = { id: schoolRef('synthetic-school-B', S.saltB), admin: await holder(S.adminB, 'admin-b') };
const A1 = await holder(S.cfiA1, 'synthetic-cfi-A1'), A2 = await holder(S.cfiA2, 'synthetic-cfi-A2'), B1 = await holder(S.cfiB1, 'synthetic-cfi-B1');

const T0 = Date.now();
const log = (...a) => console.log(`[+${((Date.now() - T0) / 1000).toFixed(0)}s]`, ...a);
const M = await connect({ stateDir: STATE, log });

async function step(name, fn, { expectReject = false } = {}) {
  if (R.steps[name]?.done) { log('skip', name); return R.steps[name]; }
  await sleep(10_000); await recycleProver(log); await M.wallet.waitForSyncedState();
  const cur = M.timing.cur = { dustBefore: await M.dust(), expect: expectReject ? 'rejected' : 'accepted' }; const t = Date.now();
  try { Object.assign(cur, await fn()); if (expectReject) cur.UNEXPECTED = 'accepted'; } catch (e) {
    Object.assign(cur, { rejected: true, where: cur.proveMs === undefined ? 'local circuit execution (before proving/submission)' : 'after proving', error: String(e?.message ?? e).split('\n')[0].slice(0, 300) });
    if (!expectReject) cur.UNEXPECTED = 'rejected';
  }
  Object.assign(cur, { totalMs: Date.now() - t, dustAfter: await M.dust(), done: true });
  M.timing.cur = null;
  R.steps[name] = cur; save(); log(name, cur); return cur;
}

let deployed;
if (!R.steps.deploy?.contractAddress) {
  await step('deploy', async () => {
    deployed = await M.deploy([root.keyId]);
    return { contractAddress: deployed.deployTxData.public.contractAddress, ...pub(deployed.deployTxData.public) };
  });
  if (!R.steps.deploy.contractAddress) throw new Error('deploy failed: ' + R.steps.deploy.error);
} else deployed = await M.find(R.steps.deploy.contractAddress);
const addr = R.steps.deploy.contractAddress, addrBytes = fromHex(addr, 32);
R.schoolA = toHex(schoolA.id); R.schoolB = toHex(schoolB.id); R.rootKeyId = toHex(root.keyId); save();
log('contract', addr);

const call = deployed.callTx;
const wa = (a) => [a.cfiPubKey, a.authData, a.challenge, a.cdSuffix, a.flagsBit1, a.flagsHigh, a.sig];
const asrt = async (who, d) => assertionToCircuitArgs({ publicKey: { cose: who.pk.cose }, ...(await who.pk.get(d)), digest: d });
const sArgs = (school, op, sid, a, b = ZERO32) => asrt(school.admin, schoolDigest(addrBytes, op, sid, a, b));
const rArgs = (op, a, b) => synthRootArgs(root, addrBytes, op, a, b);
const sc = studentCommit('synthetic-student-preview', S.studentSalt);
const entry = (id) => entryHash({ entryId: id, entrySalt: toHex(sha256(fromHex(S.studentSalt), id)), date: '2026-11-17', aircraftIdent: 'N123PL', aircraftType: 'DA40', from: 'KAPA', to: 'KAPA', totalTenths: 13, dualReceivedTenths: 13, landingsDay: 3, remarks: 'SYNTHETIC Preview test entry' });
const block = { cfiName: 'Synthetic Instructor A1', certificateNumber: '1234567', currencyKind: 'RE', currencyDate: '2027-01-31', signedDate: '2026-11-17' };
async function endorseArgs(who, eh) {
  const att = attestHash(new Uint8Array(randomBytes(32)), signatureBlockCommit(block, toHex(randomBytes(32))));
  return [eh, sc, att, ...wa(await asrt(who, endorseDigest(addrBytes, eh, sc, att)))];
}
const onboard = (s) => async () => { const r = rArgs(ROOT_OPS.onboardSchool, s.id, s.admin.keyId); return pub((await call.rootOnboardSchool(s.id, s.admin.keyId, r.rootPk, r.sig)).public); };
const enroll = (s, c) => async () => pub((await call.schoolEnrollCfi(s.id, c.keyId, c.ref, ...wa(await sArgs(s, SCHOOL_OPS.enrollCfi, s.id, c.keyId, c.ref)))).public);
const E1 = entry('synthetic-preview-v2-1'), E2 = entry('synthetic-preview-v2-2'), E3 = entry('synthetic-preview-v2-3'), E4 = entry('synthetic-preview-v2-4');

await step('rootOnboardSchoolA', onboard(schoolA));
await step('rootOnboardSchoolB', onboard(schoolB));
await step('schoolA_enrollCfiA1', enroll(schoolA, A1));
await step('schoolB_enrollCfiB1', enroll(schoolB, B1));
await step('endorseA1_valid', async () => ({ entryHash: toHex(E1), ...pub((await call.endorseEntry(...(await endorseArgs(A1, E1)))).public) }));
await step('endorseA1_tampered', async () => { const a = await endorseArgs(A1, E2); const t = Uint8Array.from(a[0]); t[0] ^= 1; a[0] = t; return pub((await call.endorseEntry(...a)).public); }, { expectReject: true });
await step('crossSchool_B_revokes_A1', async () => pub((await call.schoolRevokeCfi(schoolB.id, A1.keyId, ...wa(await sArgs(schoolB, SCHOOL_OPS.revokeCfi, schoolB.id, A1.keyId)))).public), { expectReject: true });
await step('rootOnly_schoolAdminRevokesSchoolB', async () => pub((await call.rootRevokeSchool(schoolB.id, { ...schoolA.admin.point, identity: false }, { r: 1n, s: 1n })).public), { expectReject: true });
await step('schoolA_enrollCfiA2', enroll(schoolA, A2));
await step('schoolA_revokeCfiA2', async () => pub((await call.schoolRevokeCfi(schoolA.id, A2.keyId, ...wa(await sArgs(schoolA, SCHOOL_OPS.revokeCfi, schoolA.id, A2.keyId)))).public));
await step('endorseA2_afterCfiRevoke', async () => pub((await call.endorseEntry(...(await endorseArgs(A2, E2)))).public), { expectReject: true });
await step('rootRevokeSchoolB', async () => { const r = rArgs(ROOT_OPS.revokeSchool, schoolB.id, ZERO32); return pub((await call.rootRevokeSchool(schoolB.id, r.rootPk, r.sig)).public); });
await step('endorseB1_afterSchoolRevoke', async () => pub((await call.endorseEntry(...(await endorseArgs(B1, E3)))).public), { expectReject: true });
await step('endorseA1_afterOtherSchoolRevoked', async () => ({ entryHash: toHex(E4), ...pub((await call.endorseEntry(...(await endorseArgs(A1, E4)))).public) }));

await sleep(10_000);
const L = await M.readLedger(addr);
const has = (m, k) => m.member(k);
R.readBack = {
  rootKeys: String(L.rootKeys.size()), schools: String(L.schools.size()), schoolsRevoked: String(L.schoolRevokedAtSeq.size()),
  cfiKeys: String(L.cfiKeys.size()), cfiRevoked: String(L.revokedAtSeq.size()), endorsements: String(L.endorsements.size()), seq: String(L.seq),
  E1recorded: has(L.endorsements, endorsementKey(E1, A1.keyId)), E4recorded: has(L.endorsements, endorsementKey(E4, A1.keyId)),
  E2recorded: has(L.endorsements, endorsementKey(E2, A2.keyId)), E3recorded: has(L.endorsements, endorsementKey(E3, B1.keyId)),
  A1school: has(L.cfiKeys, A1.keyId) ? toHex(L.cfiKeys.lookup(A1.keyId).schoolId) : null,
  schoolBRevokedAtSeq: has(L.schoolRevokedAtSeq, schoolB.id) ? String(L.schoolRevokedAtSeq.lookup(schoolB.id)) : null,
};
R.nodePeakRssMB = Math.round(process.resourceUsage().maxRSS / 1024); R.totalMs = Date.now() - T0; save();
log('readBack', R.readBack);
await M.wallet.stop(); process.exit(0);
