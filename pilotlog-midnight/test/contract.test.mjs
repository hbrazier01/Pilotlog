// Simulator tests for contract/cfi_endorse.compact (compiled JS in contract/managed, compact-runtime 0.21.0).
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { CfiEndorseSimulator, pureCircuits } from '../src/simulator.mjs';
import { createSoftPasskey } from '../src/softPasskey.mjs';
import { assertionToCircuitArgs, coseKeyToPoint, malleate, isHighS } from '../src/webauthn.mjs';
import { entryHash, studentCommit, cfiRef, endorseDigest, revokeDigest, endorsementKey, adminCommitment, keyIdOf } from '../src/canonical.mjs';
import { toHex } from '../src/bytes.mjs';

const ENV = { PILOTLOG_CFI_MIDNIGHT: '1' };
const rnd = () => new Uint8Array(randomBytes(32));
const rndHex = () => toHex(randomBytes(32));
let n = 0;
const newEntry = () => entryHash({ entryId: `synthetic-${++n}`, entrySalt: rndHex(), date: '2026-11-14', aircraftIdent: 'N123PL', aircraftType: 'DA40', from: 'KAPA', to: 'KAPA', totalTenths: 13, dualReceivedTenths: 13 });
const STUDENT = studentCommit('synthetic-student-1', rndHex());

async function cfi() {
  const pk = await createSoftPasskey();
  const point = coseKeyToPoint(pk.cose);
  return { pk, point, keyId: keyIdOf(point), ref: cfiRef(`synthetic-cfi-${++n}`, rndHex()) };
}
async function sign(sim, who, eh, sc = STUDENT, opts) {
  const digest = endorseDigest(sim.addressBytes, eh, sc);
  return assertionToCircuitArgs({ publicKey: { cose: who.pk.cose }, ...(await who.pk.get(digest, opts)), digest });
}
const failsWith = (re) => (e) => { assert.match(String(e.message), re); return true; };

let adminSk, sim, A, B;
before(async () => {
  adminSk = rnd();
  sim = await CfiEndorseSimulator.create({ adminSecret: adminSk, env: ENV });
  A = await cfi(); B = await cfi();
});

test('off-chain mirrors equal the contract pure circuits byte-for-byte', () => {
  const [a, e, s, k, sk] = [rnd(), rnd(), rnd(), rnd(), rnd()];
  assert.equal(toHex(pureCircuits.endorseDigest(a, e, s)), toHex(endorseDigest(a, e, s)));
  assert.equal(toHex(pureCircuits.revokeDigest(a, k)), toHex(revokeDigest(a, k)));
  assert.equal(toHex(pureCircuits.endorsementKey(e, k)), toHex(endorsementKey(e, k)));
  assert.equal(toHex(pureCircuits.adminCommitment(sk)), toHex(adminCommitment(sk)));
  assert.equal(toHex(pureCircuits.keyIdOf({ ...A.point, identity: false })), toHex(A.keyId));
  assert.equal(toHex(sim.ledger.admin), toHex(adminCommitment(adminSk)));
});

test('admin enrolls CFI keys; non-admin cannot enroll; double enroll rejected', async () => {
  await sim.enrollCfi(A.keyId, A.ref);
  assert.equal(toHex(sim.ledger.cfiKeys.lookup(A.keyId)), toHex(A.ref));
  await assert.rejects(sim.as(rnd()).enrollCfi(B.keyId, B.ref), failsWith(/not the maintenance authority/));
  sim.as(adminSk);
  await assert.rejects(sim.enrollCfi(A.keyId, A.ref), failsWith(/already enrolled/));
  await sim.enrollCfi(B.keyId, B.ref);
  assert.equal(sim.ledger.cfiKeys.size(), 2n);
});

test('enrolled CFI endorses an entry; record binds entry, key, student commitment and seq', async () => {
  const eh = newEntry();
  const seq0 = sim.ledger.seq;
  await sim.endorseEntry(eh, STUDENT, await sign(sim, A, eh));
  const rec = sim.ledger.endorsements.lookup(endorsementKey(eh, A.keyId));
  assert.equal(toHex(rec.entryHash), toHex(eh));
  assert.equal(toHex(rec.keyId), toHex(A.keyId));
  assert.equal(toHex(rec.studentCommit), toHex(STUDENT));
  assert.equal(rec.seq, seq0);
  assert.equal(sim.ledger.seq, seq0 + 1n);
});

test('duplicate (entry, CFI) rejected; a second CFI may co-endorse the same entry', async () => {
  const eh = newEntry();
  await sim.endorseEntry(eh, STUDENT, await sign(sim, A, eh));
  await assert.rejects(sim.endorseEntry(eh, STUDENT, await sign(sim, A, eh)), failsWith(/already endorsed by this CFI/));
  await sim.endorseEntry(eh, STUDENT, await sign(sim, B, eh));
  assert.ok(sim.ledger.endorsements.member(endorsementKey(eh, B.keyId)));
});

test('low-S and high-S both verify, but the entry is recorded only once', async () => {
  const eh = newEntry();
  const a = await sign(sim, A, eh);
  const twin = { ...a, sig: malleate(a.sig) };
  assert.notEqual(isHighS(a.sig.s), isHighS(twin.sig.s));
  const before = sim.ledger.endorsements.size();
  await sim.endorseEntry(eh, STUDENT, twin);  // whichever form is submitted first is accepted
  await assert.rejects(sim.endorseEntry(eh, STUDENT, a), failsWith(/already endorsed/));
  assert.equal(sim.ledger.endorsements.size(), before + 1n);
  // and the other form is accepted on a fresh entry
  const eh2 = newEntry();
  const b = await sign(sim, A, eh2);
  await sim.endorseEntry(eh2, STUDENT, isHighS(b.sig.s) ? b : { ...b, sig: malleate(b.sig) });
});

test('tampered inputs are rejected in-circuit', async () => {
  const eh = newEntry();
  const a = await sign(sim, A, eh);
  const flip = (b, i = 0) => { const c = Uint8Array.from(b); c[i] ^= 1; return c; };
  await assert.rejects(sim.endorseEntry(flip(eh), STUDENT, a), failsWith(/challenge != base64url/));
  await assert.rejects(sim.endorseEntry(eh, flip(STUDENT), a), failsWith(/challenge != base64url/), 'student binding');
  await assert.rejects(sim.endorseEntry(eh, STUDENT, { ...a, sig: { ...a.sig, s: a.sig.s + 1n } }), failsWith(/signature invalid/));
  await assert.rejects(sim.endorseEntry(eh, STUDENT, { ...a, authData: flip(a.authData, 36) }), failsWith(/signature invalid/));
  await assert.rejects(sim.endorseEntry(eh, STUDENT, { ...a, sig: { ...a.sig, r: 0n } }), failsWith(/zero ECDSA r/));
  const cs = Uint8Array.from(a.cdSuffix); cs[cs.length - 6] = 0x74; // ...crossOrigin":true-ish byte change
  await assert.rejects(sim.endorseEntry(eh, STUDENT, { ...a, cdSuffix: cs }), failsWith(/unsupported clientDataJSON/));
  assert.ok(!sim.ledger.endorsements.member(endorsementKey(eh, A.keyId)));
});

test('wrong key: signature by A presented with B\'s key fails; unenrolled key fails', async () => {
  const eh = newEntry();
  const a = await sign(sim, A, eh);
  await assert.rejects(sim.endorseEntry(eh, STUDENT, { ...a, cfiPubKey: { ...B.point, identity: false } }), failsWith(/signature invalid/));
  const C = await cfi();
  await assert.rejects(sim.endorseEntry(eh, STUDENT, await sign(sim, C, eh)), failsWith(/not enrolled/));
});

test('wrong origin and cross-deployment replay are rejected', async () => {
  const eh = newEntry();
  const digest = endorseDigest(sim.addressBytes, eh, STUDENT);
  const evil = await A.pk.get(digest, { origin: 'https://pilotlog.digitalaviationpooI.com' });
  const good = await sign(sim, A, eh);
  const evilSuffix = evil.clientDataJSON.slice(36 + 43);
  assert.equal(evilSuffix.length, 74, 'same-length look-alike origin');
  await assert.rejects(sim.endorseEntry(eh, STUDENT, { ...good, cdSuffix: evilSuffix }), failsWith(/unsupported clientDataJSON/));
  // an assertion made for another deployment (different contract address) does not verify here
  const otherAddr = rnd();
  const dOther = endorseDigest(otherAddr, eh, STUDENT);
  const replay = assertionToCircuitArgs({ publicKey: { cose: A.pk.cose }, ...(await A.pk.get(dOther)), digest: dOther });
  await assert.rejects(sim.endorseEntry(eh, STUDENT, replay), failsWith(/challenge != base64url/));
});

test('admin revoke: later endorsements rejected, earlier ones remain valid (seq ordering), no re-enroll', async () => {
  const R = await cfi();
  await sim.enrollCfi(R.keyId, R.ref);
  const early = newEntry();
  await sim.endorseEntry(early, STUDENT, await sign(sim, R, early));
  await assert.rejects(sim.as(rnd()).revokeCfi(R.keyId), failsWith(/not the maintenance authority/));
  sim.as(adminSk);
  await sim.revokeCfi(R.keyId);
  const revokedAt = sim.ledger.revokedAtSeq.lookup(R.keyId);
  const late = newEntry();
  await assert.rejects(sim.endorseEntry(late, STUDENT, await sign(sim, R, late)), failsWith(/CFI key revoked/));
  const rec = sim.ledger.endorsements.lookup(endorsementKey(early, R.keyId));
  assert.ok(rec.seq < revokedAt, 'pre-revocation endorsement stays valid');
  await assert.rejects(sim.revokeCfi(R.keyId), failsWith(/already revoked/));
  await assert.rejects(sim.enrollCfi(R.keyId, R.ref), failsWith(/cannot be re-enrolled/));
});

test('key rotation: new key enrolled under the same cfiRef keeps working after the old key is revoked', async () => {
  const old = await cfi();
  const fresh = { ...(await cfi()) };
  fresh.ref = old.ref;
  await sim.enrollCfi(old.keyId, old.ref);
  await sim.enrollCfi(fresh.keyId, fresh.ref);
  await sim.revokeCfi(old.keyId);
  const eh = newEntry();
  await sim.endorseEntry(eh, STUDENT, await sign(sim, fresh, eh));
  assert.equal(toHex(sim.ledger.cfiKeys.lookup(fresh.keyId)), toHex(old.ref));
});

test('CFI self-revoke with the passkey; endorsement assertions cannot be reused as revocations', async () => {
  const S = await cfi();
  await sim.enrollCfi(S.keyId, S.ref);
  const eh = newEntry();
  const endorseArgs = await sign(sim, S, eh);
  await assert.rejects(sim.as(rnd()).selfRevoke(endorseArgs), failsWith(/challenge != base64url/));
  const d = revokeDigest(sim.addressBytes, S.keyId);
  const rv = assertionToCircuitArgs({ publicKey: { cose: S.pk.cose }, ...(await S.pk.get(d)), digest: d });
  await assert.rejects(sim.selfRevoke({ ...rv, cfiPubKey: { ...A.point, identity: false } }), failsWith(/challenge != base64url|signature invalid/));
  await sim.selfRevoke(rv); // no admin secret needed (caller is a random non-admin)
  assert.ok(sim.ledger.revokedAtSeq.member(S.keyId));
  await assert.rejects(sim.endorseEntry(eh, STUDENT, endorseArgs), failsWith(/CFI key revoked/));
  await assert.rejects(sim.selfRevoke(rv), failsWith(/already revoked/));
  sim.as(adminSk);
});

test('admin rotation: old secret loses authority, new secret gains it', async () => {
  const sk2 = rnd();
  await sim.rotateAdmin(adminCommitment(sk2));
  const C = await cfi();
  await assert.rejects(sim.as(adminSk).enrollCfi(C.keyId, C.ref), failsWith(/not the maintenance authority/));
  await sim.as(sk2).enrollCfi(C.keyId, C.ref);
  adminSk = sk2;
});

test('public ledger holds hashes only: no public keys, names or raw entries', () => {
  const L = sim.ledger;
  const pubHex = [A.point.x.toString(16), A.point.y.toString(16)];
  for (const [k, rec] of L.endorsements) {
    for (const v of [k, rec.entryHash, rec.keyId, rec.studentCommit]) {
      assert.equal(v.length, 32);
      for (const p of pubHex) assert.ok(!toHex(v).includes(p.slice(0, 16)));
    }
  }
});

test('simulator refuses to start without the flag', async () => {
  await assert.rejects(CfiEndorseSimulator.create({ adminSecret: rnd(), env: {} }), (e) => e.code === 'CFI_MIDNIGHT_DISABLED');
});
