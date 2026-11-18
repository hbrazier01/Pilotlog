// Simulator tests for contract/cfi_endorse.compact (compiled JS in contract/managed, compact-runtime 0.21.0).
// Layered registry: ROOT (offline P-256) -> SCHOOL (admin passkey) -> CFI (passkey). All keys are SYNTHETIC.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { CfiEndorseSimulator, pureCircuits } from '../src/simulator.mjs';
import { createSoftPasskey } from '../src/softPasskey.mjs';
import { assertionToCircuitArgs, coseKeyToPoint, malleate, isHighS, ORIGIN } from '../src/webauthn.mjs';
import {
  entryHash, studentCommit, cfiRef, schoolRef, endorseDigest, revokeDigest, rootDigest, schoolDigest, endorsementKey, keyIdOf,
  attestHash, signatureBlockCommit, endorsementValidity, ROOT_OPS, SCHOOL_OPS, ZERO32,
} from '../src/canonical.mjs';
import { createSyntheticRootKey, synthRootArgs, rootSignatureArgs, signRootDigestDer } from '../src/rootKey.mjs';
import { toHex } from '../src/bytes.mjs';

const ENV = { PILOTLOG_CFI_MIDNIGHT: '1' };
const rnd = () => new Uint8Array(randomBytes(32));
const rndHex = () => toHex(randomBytes(32));
let n = 0;
const newEntry = () => entryHash({ entryId: `synthetic-${++n}`, entrySalt: rndHex(), date: '2026-11-14', aircraftIdent: 'N123PL', aircraftType: 'DA40', from: 'KAPA', to: 'KAPA', totalTenths: 13, dualReceivedTenths: 13 });
const STUDENT = studentCommit('synthetic-student-1', rndHex());
const BLOCK = { cfiName: 'Synthetic Instructor', certificateNumber: '1234567', currencyKind: 'RE', currencyDate: '2027-01-31', signedDate: '2026-11-17' };
const newAttest = () => attestHash(rnd(), signatureBlockCommit(BLOCK, rndHex()));

async function passkeyHolder(label) {
  const pk = await createSoftPasskey();
  const point = coseKeyToPoint(pk.cose);
  return { pk, point, keyId: keyIdOf(point), ref: cfiRef(`synthetic-${label}-${++n}`, rndHex()) };
}
const args = async (who, digest, opts) => assertionToCircuitArgs({ publicKey: { cose: who.pk.cose }, ...(await who.pk.get(digest, opts)), digest });
async function sign(sim, who, eh, { sc = STUDENT, attest = newAttest(), opts } = {}) {
  const a = await args(who, endorseDigest(sim.addressBytes, eh, sc, attest), opts);
  return { a, attest };
}
const endorse = async (sim, who, eh, o = {}) => { const { a, attest } = await sign(sim, who, eh, o); return sim.endorseEntry(eh, o.sc ?? STUDENT, attest, a); };
const schoolArgs = (sim, admin, op, schoolId, a, b = ZERO32) => args(admin, schoolDigest(sim.addressBytes, op, schoolId, a, b));
const enroll = async (sim, school, cfi) => sim.schoolEnrollCfi(school.id, cfi.keyId, cfi.ref, await schoolArgs(sim, school.admin, SCHOOL_OPS.enrollCfi, school.id, cfi.keyId, cfi.ref));
const revokeCfi = async (sim, school, cfi, schoolId = school.id) => sim.schoolRevokeCfi(schoolId, cfi.keyId, await schoolArgs(sim, school.admin, SCHOOL_OPS.revokeCfi, schoolId, cfi.keyId));
const failsWith = (re) => (e) => { assert.match(String(e.message), re); return true; };

let root, sim, SA, SB, A, B;
async function onboard(label) {
  const school = { id: schoolRef(`synthetic-school-${label}`, rndHex()), admin: await passkeyHolder(`${label}-admin`) };
  await sim.rootOnboardSchool(school.id, school.admin.keyId, synthRootArgs(root, sim.addressBytes, ROOT_OPS.onboardSchool, school.id, school.admin.keyId));
  return school;
}
before(async () => {
  root = createSyntheticRootKey();
  sim = await CfiEndorseSimulator.create({ rootKeyId: root.keyId, env: ENV });
  SA = await onboard('A'); SB = await onboard('B');
  A = await passkeyHolder('cfi-a'); B = await passkeyHolder('cfi-b');
});

test('off-chain mirrors equal the contract pure circuits byte-for-byte', () => {
  const [a, e, s, k, t, u] = [rnd(), rnd(), rnd(), rnd(), rnd(), rnd()];
  assert.equal(toHex(pureCircuits.endorseDigest(a, e, s, t)), toHex(endorseDigest(a, e, s, t)));
  assert.equal(toHex(pureCircuits.revokeDigest(a, k)), toHex(revokeDigest(a, k)));
  assert.equal(toHex(pureCircuits.endorsementKey(e, k)), toHex(endorsementKey(e, k)));
  assert.equal(toHex(pureCircuits.rootDigest(a, ROOT_OPS.onboardSchool, s, k)), toHex(rootDigest(a, ROOT_OPS.onboardSchool, s, k)));
  assert.equal(toHex(pureCircuits.schoolDigest(a, SCHOOL_OPS.enrollCfi, s, k, u)), toHex(schoolDigest(a, SCHOOL_OPS.enrollCfi, s, k, u)));
  assert.equal(toHex(pureCircuits.keyIdOf({ ...A.point, identity: false })), toHex(A.keyId));
  assert.ok(sim.ledger.rootKeys.member(root.keyId));
});

// ---- Root

test('root onboards schools; a non-root key, a forged or mis-bound root signature, and duplicates are rejected', async () => {
  assert.equal(toHex(sim.ledger.schools.lookup(SA.id)), toHex(SA.admin.keyId));
  assert.equal(toHex(sim.ledger.adminKeySchool.lookup(SB.admin.keyId)), toHex(SB.id));
  const X = { id: rnd(), admin: await passkeyHolder('x-admin') };
  const notRoot = createSyntheticRootKey();
  await assert.rejects(sim.rootOnboardSchool(X.id, X.admin.keyId, synthRootArgs(notRoot, sim.addressBytes, ROOT_OPS.onboardSchool, X.id, X.admin.keyId)), failsWith(/not a root key/));
  // a genuine root signature for a DIFFERENT admin key cannot be repurposed
  const r = synthRootArgs(root, sim.addressBytes, ROOT_OPS.onboardSchool, X.id, rnd());
  await assert.rejects(sim.rootOnboardSchool(X.id, X.admin.keyId, r), failsWith(/root signature invalid/));
  // ... nor used for another operation, nor for another deployment
  const rev = synthRootArgs(root, sim.addressBytes, ROOT_OPS.revokeSchool, SA.id, ZERO32);
  await assert.rejects(sim.rootOnboardSchool(SA.id, ZERO32, rev), failsWith(/root signature invalid/));
  await assert.rejects(sim.rootRevokeSchool(SA.id, synthRootArgs(root, rnd(), ROOT_OPS.revokeSchool, SA.id, ZERO32)), failsWith(/root signature invalid/));
  await assert.rejects(sim.rootOnboardSchool(SA.id, X.admin.keyId, synthRootArgs(root, sim.addressBytes, ROOT_OPS.onboardSchool, SA.id, X.admin.keyId)), failsWith(/already onboarded/));
  await assert.rejects(sim.rootOnboardSchool(X.id, SA.admin.keyId, synthRootArgs(root, sim.addressBytes, ROOT_OPS.onboardSchool, X.id, SA.admin.keyId)), failsWith(/already serves a school/));
});

test('root signatures: DER from offline tools pre-flight; zero r/s rejected in-circuit', async () => {
  const X = rnd(), K = rnd();
  const d = rootDigest(sim.addressBytes, ROOT_OPS.onboardSchool, X, K);
  assert.throws(() => rootSignatureArgs({ point: root.point, digest: rnd(), signatureDer: signRootDigestDer(root.privateKey, d) }), /does not verify/);
  const ok = rootSignatureArgs({ point: root.point, digest: d, signatureDer: signRootDigestDer(root.privateKey, d) });
  await assert.rejects(sim.rootOnboardSchool(X, K, { ...ok, sig: { ...ok.sig, r: 0n } }), failsWith(/zero ECDSA r/));
});

test('root-only operations: a school admin passkey cannot onboard/revoke schools or manage root keys', async () => {
  // the school admin is not a root key; even a raw ECDSA signature by the admin's P-256 key is refused
  const fakeRoot = { rootPk: { ...SA.admin.point, identity: false }, sig: { r: 1n, s: 1n } };
  await assert.rejects(sim.rootRevokeSchool(SB.id, fakeRoot), failsWith(/not a root key/));
  await assert.rejects(sim.rootOnboardSchool(rnd(), rnd(), fakeRoot), failsWith(/not a root key/));
  await assert.rejects(sim.rootSetKey(SA.admin.keyId, true, fakeRoot), failsWith(/not a root key/));
  await assert.rejects(sim.rootSetSchoolAdmin(SB.id, SA.admin.keyId, fakeRoot), failsWith(/not a root key/));
});

test('root key rotation: add backup, primary removed by backup, removed key powerless and never re-addable, last key kept', async () => {
  const r2 = await (async () => { const s = await CfiEndorseSimulator.create({ rootKeyId: root.keyId, env: ENV }); return s; })();
  const backup = createSyntheticRootKey();
  await r2.rootSetKey(backup.keyId, true, synthRootArgs(root, r2.addressBytes, ROOT_OPS.addRootKey, backup.keyId, ZERO32));
  assert.equal(r2.ledger.rootKeys.size(), 2n);
  // the backup removes the (lost) primary
  await r2.rootSetKey(root.keyId, false, synthRootArgs(backup, r2.addressBytes, ROOT_OPS.removeRootKey, root.keyId, ZERO32));
  assert.ok(!r2.ledger.rootKeys.member(root.keyId) && r2.ledger.retiredRootKeys.member(root.keyId));
  await assert.rejects(r2.rootOnboardSchool(rnd(), rnd(), synthRootArgs(root, r2.addressBytes, ROOT_OPS.onboardSchool, ZERO32, ZERO32)), failsWith(/not a root key/));
  await assert.rejects(r2.rootSetKey(root.keyId, true, synthRootArgs(backup, r2.addressBytes, ROOT_OPS.addRootKey, root.keyId, ZERO32)), failsWith(/cannot be re-added/));
  await assert.rejects(r2.rootSetKey(backup.keyId, false, synthRootArgs(backup, r2.addressBytes, ROOT_OPS.removeRootKey, backup.keyId, ZERO32)), failsWith(/last root key/));
  // an add signature cannot be used as a remove signature
  const third = createSyntheticRootKey();
  const addSig = synthRootArgs(backup, r2.addressBytes, ROOT_OPS.addRootKey, third.keyId, ZERO32);
  await assert.rejects(r2.rootSetKey(third.keyId, false, addSig), failsWith(/root signature invalid/));
  await r2.rootSetKey(third.keyId, true, addSig);
  await assert.rejects(r2.rootSetKey(third.keyId, true, addSig), failsWith(/already a root key/), 'replay of the same root signature is harmless');
});

// ---- Schools

test('school admins enroll their own CFIs; double enroll and a key in two schools are rejected', async () => {
  await enroll(sim, SA, A);
  await enroll(sim, SB, B);
  assert.equal(toHex(sim.ledger.cfiKeys.lookup(A.keyId).schoolId), toHex(SA.id));
  assert.equal(toHex(sim.ledger.cfiKeys.lookup(A.keyId).cfiRef), toHex(A.ref));
  await assert.rejects(enroll(sim, SA, A), failsWith(/already enrolled/));
  await assert.rejects(enroll(sim, SB, A), failsWith(/already enrolled/));
});

test('cross-school isolation: school B cannot enroll into, or revoke a CFI of, school A', async () => {
  const C = await passkeyHolder('cfi-c');
  // B's admin signs an enrollment naming school A
  await assert.rejects(sim.schoolEnrollCfi(SA.id, C.keyId, C.ref, await schoolArgs(sim, SB.admin, SCHOOL_OPS.enrollCfi, SA.id, C.keyId, C.ref)), failsWith(/not this school's admin/));
  // B's admin tries to revoke A's CFI under school A, then under its own school id
  await assert.rejects(revokeCfi(sim, SB, A, SA.id), failsWith(/not this school's admin/));
  await assert.rejects(revokeCfi(sim, SB, A), failsWith(/CFI belongs to another school/));
  // an enrollment signature by A's admin cannot be replayed for a different key or ref
  const a = await schoolArgs(sim, SA.admin, SCHOOL_OPS.enrollCfi, SA.id, C.keyId, C.ref);
  await assert.rejects(sim.schoolEnrollCfi(SA.id, rnd(), C.ref, a), failsWith(/challenge != base64url/));
  await assert.rejects(sim.schoolEnrollCfi(SA.id, C.keyId, rnd(), a), failsWith(/challenge != base64url/));
  // ... or as a revocation
  await assert.rejects(sim.schoolRevokeCfi(SA.id, C.keyId, a), failsWith(/challenge != base64url/));
  assert.ok(!sim.ledger.cfiKeys.member(C.keyId));
});

// ---- Endorsements

test('enrolled CFI endorses; record binds entry, key, school, student and seq; attestation (nonce + signature block) bound', async () => {
  const eh = newEntry();
  const seq0 = sim.ledger.seq;
  const { a, attest } = await sign(sim, A, eh);
  await assert.rejects(sim.endorseEntry(eh, STUDENT, newAttest(), a), failsWith(/challenge != base64url/), 'different server nonce / signature block');
  await sim.endorseEntry(eh, STUDENT, attest, a);
  const rec = sim.ledger.endorsements.lookup(endorsementKey(eh, A.keyId));
  assert.equal(toHex(rec.entryHash), toHex(eh));
  assert.equal(toHex(rec.keyId), toHex(A.keyId));
  assert.equal(toHex(rec.schoolId), toHex(SA.id));
  assert.equal(toHex(rec.studentCommit), toHex(STUDENT));
  assert.equal(rec.seq, seq0);
  assert.equal(sim.ledger.seq, seq0 + 1n);
  assert.deepEqual(endorsementValidity(sim.ledger, rec), { valid: true });
});

test('duplicate (entry, CFI) rejected even with a fresh nonce; a CFI of another school may co-endorse', async () => {
  const eh = newEntry();
  await endorse(sim, A, eh);
  await assert.rejects(endorse(sim, A, eh), failsWith(/already endorsed by this CFI/));
  await endorse(sim, B, eh);
  assert.ok(sim.ledger.endorsements.member(endorsementKey(eh, B.keyId)));
});

test('low-S and high-S both verify, but the entry is recorded only once', async () => {
  const eh = newEntry();
  const { a, attest } = await sign(sim, A, eh);
  const twin = { ...a, sig: malleate(a.sig) };
  assert.notEqual(isHighS(a.sig.s), isHighS(twin.sig.s));
  const before = sim.ledger.endorsements.size();
  await sim.endorseEntry(eh, STUDENT, attest, twin);
  await assert.rejects(sim.endorseEntry(eh, STUDENT, attest, a), failsWith(/already endorsed/));
  assert.equal(sim.ledger.endorsements.size(), before + 1n);
});

test('tampered inputs are rejected in-circuit', async () => {
  const eh = newEntry();
  const { a, attest } = await sign(sim, A, eh);
  const flip = (b, i = 0) => { const c = Uint8Array.from(b); c[i] ^= 1; return c; };
  await assert.rejects(sim.endorseEntry(flip(eh), STUDENT, attest, a), failsWith(/challenge != base64url/));
  await assert.rejects(sim.endorseEntry(eh, flip(STUDENT), attest, a), failsWith(/challenge != base64url/), 'student binding');
  await assert.rejects(sim.endorseEntry(eh, STUDENT, flip(attest), a), failsWith(/challenge != base64url/), 'nonce/signature-block binding');
  await assert.rejects(sim.endorseEntry(eh, STUDENT, attest, { ...a, sig: { ...a.sig, s: a.sig.s + 1n } }), failsWith(/signature invalid/));
  await assert.rejects(sim.endorseEntry(eh, STUDENT, attest, { ...a, authData: flip(a.authData, 36) }), failsWith(/signature invalid/));
  await assert.rejects(sim.endorseEntry(eh, STUDENT, attest, { ...a, sig: { ...a.sig, r: 0n } }), failsWith(/zero ECDSA r/));
  const cs = Uint8Array.from(a.cdSuffix); cs[cs.length - 6] = 0x74;
  await assert.rejects(sim.endorseEntry(eh, STUDENT, attest, { ...a, cdSuffix: cs }), failsWith(/unsupported clientDataJSON/));
  // UV is mandatory: an assertion without user verification cannot even be turned into circuit args, and a forged flags byte fails
  await assert.rejects(sign(sim, A, eh, { opts: { flags: 0x01 } }), /UV/);
  await assert.rejects(sim.endorseEntry(eh, STUDENT, attest, { ...a, flagsBit1: 0n, flagsHigh: 0n, authData: (() => { const d = Uint8Array.from(a.authData); d[32] = 0x01; return d; })() }), failsWith(/UP and UV|signature invalid/));
  assert.ok(!sim.ledger.endorsements.member(endorsementKey(eh, A.keyId)));
});

test('synced (BE/BS) and device-bound passkeys both verify; flags reach the circuit unchanged', async () => {
  for (const flags of [0x05, 0x0d, 0x1d]) {
    const eh = newEntry();
    const { a, attest } = await sign(sim, A, eh, { opts: { flags } });
    assert.equal(a.authData[32], flags);
    await sim.endorseEntry(eh, STUDENT, attest, a);
  }
});

test('wrong key, unenrolled key, wrong origin and cross-deployment replay are rejected', async () => {
  const eh = newEntry();
  const { a, attest } = await sign(sim, A, eh);
  await assert.rejects(sim.endorseEntry(eh, STUDENT, attest, { ...a, cfiPubKey: { ...B.point, identity: false } }), failsWith(/signature invalid/));
  const C = await passkeyHolder('cfi-unenrolled');
  await assert.rejects(endorse(sim, C, eh), failsWith(/not enrolled/));
  const look = ORIGIN.replace('l', 'I');
  assert.equal(look.length, ORIGIN.length);
  const evil = await A.pk.get(endorseDigest(sim.addressBytes, eh, STUDENT, attest), { origin: look });
  await assert.rejects(sim.endorseEntry(eh, STUDENT, attest, { ...a, cdSuffix: evil.clientDataJSON.slice(36 + 43) }), failsWith(/unsupported clientDataJSON/));
  const dOther = endorseDigest(rnd(), eh, STUDENT, attest);
  await assert.rejects(sim.endorseEntry(eh, STUDENT, attest, await args(A, dOther)), failsWith(/challenge != base64url/));
});

// ---- Revocation

test('school revokes its CFI: later endorsements rejected, earlier ones stay valid (seq), no re-enroll', async () => {
  const R = await passkeyHolder('cfi-r');
  await enroll(sim, SA, R);
  const early = newEntry();
  await endorse(sim, R, early);
  await revokeCfi(sim, SA, R);
  const late = newEntry();
  await assert.rejects(endorse(sim, R, late), failsWith(/CFI key revoked/));
  const rec = sim.ledger.endorsements.lookup(endorsementKey(early, R.keyId));
  assert.ok(rec.seq < sim.ledger.revokedAtSeq.lookup(R.keyId));
  assert.deepEqual(endorsementValidity(sim.ledger, rec), { valid: true });
  await assert.rejects(revokeCfi(sim, SA, R), failsWith(/already revoked/));
  await assert.rejects(enroll(sim, SA, R), failsWith(/cannot be re-enrolled/));
});

test('CFI self-revoke with the passkey; endorsement assertions cannot be reused as revocations', async () => {
  const S = await passkeyHolder('cfi-s');
  await enroll(sim, SB, S);
  const eh = newEntry();
  const { a, attest } = await sign(sim, S, eh);
  await assert.rejects(sim.selfRevoke(a), failsWith(/challenge != base64url/));
  const rv = await args(S, revokeDigest(sim.addressBytes, S.keyId));
  await sim.selfRevoke(rv);
  await assert.rejects(sim.endorseEntry(eh, STUDENT, attest, a), failsWith(/CFI key revoked/));
  await assert.rejects(sim.selfRevoke(rv), failsWith(/already revoked/));
});

test('school admin rotation (self-service and by root); retired admin keys are powerless and never reusable', async () => {
  const S3 = await onboard('C');
  const next = await passkeyHolder('c-admin-2');
  await sim.schoolRotateAdmin(S3.id, next.keyId, await schoolArgs(sim, S3.admin, SCHOOL_OPS.rotateAdmin, S3.id, next.keyId));
  const D = await passkeyHolder('cfi-d');
  await assert.rejects(enroll(sim, S3, D), failsWith(/not this school's admin/), 'old admin key retired');
  const S3b = { id: S3.id, admin: next };
  await enroll(sim, S3b, D);
  // root replaces a lost admin device; the replaced key is retired
  const third = await passkeyHolder('c-admin-3');
  await sim.rootSetSchoolAdmin(S3.id, third.keyId, synthRootArgs(root, sim.addressBytes, ROOT_OPS.setSchoolAdmin, S3.id, third.keyId));
  assert.ok(sim.ledger.retiredAdminKeys.member(next.keyId));
  await assert.rejects(sim.rootSetSchoolAdmin(S3.id, S3.admin.keyId, synthRootArgs(root, sim.addressBytes, ROOT_OPS.setSchoolAdmin, S3.id, S3.admin.keyId)), failsWith(/retired admin keys/));
  await assert.rejects(revokeCfi(sim, S3b, D), failsWith(/not this school's admin/));
  await revokeCfi(sim, { id: S3.id, admin: third }, D);
});

test('root revokes school A: A frozen, A history before revocation stays valid, school B and its CFIs unaffected', async () => {
  const eh0 = newEntry();
  await endorse(sim, A, eh0);
  const recA = sim.ledger.endorsements.lookup(endorsementKey(eh0, A.keyId));
  const r = synthRootArgs(root, sim.addressBytes, ROOT_OPS.revokeSchool, SA.id, ZERO32);
  await sim.rootRevokeSchool(SA.id, r);
  const at = sim.ledger.schoolRevokedAtSeq.lookup(SA.id);
  assert.ok(recA.seq < at);
  assert.deepEqual(endorsementValidity(sim.ledger, recA), { valid: true }, 'pre-revocation endorsements remain valid');
  // A's CFIs can no longer endorse; A's admin can no longer enroll or revoke
  await assert.rejects(endorse(sim, A, newEntry()), failsWith(/school revoked/));
  const E = await passkeyHolder('cfi-e');
  await assert.rejects(enroll(sim, SA, E), failsWith(/school revoked/));
  await assert.rejects(revokeCfi(sim, SA, A), failsWith(/school revoked/));
  // replaying the revocation, or re-onboarding the revoked id, fails
  await assert.rejects(sim.rootRevokeSchool(SA.id, r), failsWith(/already revoked/));
  await assert.rejects(sim.rootOnboardSchool(SA.id, E.keyId, synthRootArgs(root, sim.addressBytes, ROOT_OPS.onboardSchool, SA.id, E.keyId)), failsWith(/already onboarded|cannot be reused/));
  // school B is untouched
  const eh1 = newEntry();
  await endorse(sim, B, eh1);
  const F = await passkeyHolder('cfi-f');
  await enroll(sim, SB, F);
  const recB = sim.ledger.endorsements.lookup(endorsementKey(eh1, B.keyId));
  assert.deepEqual(endorsementValidity(sim.ledger, recB), { valid: true });
  // a CFI of the revoked school can still self-revoke (harmless, lets them retire the key)
  await sim.selfRevoke(await args(A, revokeDigest(sim.addressBytes, A.keyId)));
});

test('public ledger holds hashes only: no public keys, names, nonces or raw entries', () => {
  const L = sim.ledger;
  const pubHex = [A.point.x.toString(16), A.point.y.toString(16)];
  for (const [k, rec] of L.endorsements) {
    assert.deepEqual(Object.keys(rec).sort(), ['entryHash', 'keyId', 'schoolId', 'seq', 'studentCommit']);
    for (const v of [k, rec.entryHash, rec.keyId, rec.schoolId, rec.studentCommit]) {
      assert.equal(v.length, 32);
      for (const p of pubHex) assert.ok(!toHex(v).includes(p.slice(0, 16)));
    }
  }
});

test('simulator refuses to start without the flag', async () => {
  await assert.rejects(CfiEndorseSimulator.create({ rootKeyId: rnd(), env: {} }), (e) => e.code === 'CFI_MIDNIGHT_DISABLED');
});
