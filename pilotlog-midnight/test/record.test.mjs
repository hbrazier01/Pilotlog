// Off-chain record verification (src/record.mjs): tampered content, replayed signature / challenge,
// wrong version, old signature on a new version, and superseded status. SYNTHETIC data.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { createSoftPasskey } from '../src/softPasskey.mjs';
import { verifyRecord } from '../src/record.mjs';
import { entryHash, studentCommit, endorseDigest, attestHash, signatureBlockCommit, normalizeSignatureBlock, keyIdOf } from '../src/canonical.mjs';
import { coseKeyToPoint } from '../src/webauthn.mjs';
import { toHex, fromHex, b64url } from '../src/bytes.mjs';

const CONTRACT = toHex(randomBytes(32));
const SC = toHex(studentCommit('synthetic-student', toHex(randomBytes(32))));
const pk = await createSoftPasskey();
const keyId = toHex(keyIdOf(coseKeyToPoint(pk.cose)));
const raw = (over = {}) => ({ entryId: 'e-' + toHex(randomBytes(4)), entrySalt: toHex(randomBytes(32)), date: '2026-11-17', aircraftIdent: 'N123PL', aircraftType: 'DA40', from: 'KAPA', to: 'KAPA', totalTenths: 13, dualReceivedTenths: 13, remarks: 'SYNTHETIC', ...over });

async function signed(r, { version = 1, supersedes = '', nonce = randomBytes(32) } = {}) {
  const block = normalizeSignatureBlock({ cfiName: 'Synthetic Instructor', certificateNumber: '1234567', currencyKind: 'RE', currencyDate: '2027-01-31', signedDate: '2026-11-17', entryVersion: version, supersedes });
  const salt = toHex(randomBytes(32));
  const eh = toHex(entryHash(r));
  const digest = endorseDigest(fromHex(CONTRACT, 32), fromHex(eh, 32), fromHex(SC, 32), attestHash(nonce, signatureBlockCommit(block, salt)));
  const a = await pk.get(digest);
  return { raw: r, entryHash: eh, version, supersedes, studentCommit: SC, contract: CONTRACT,
    signature: { block, signatureBlockSalt: salt, serverNonce: toHex(nonce), keyId, publicKeySpki: b64url(pk.spki),
      assertion: { authenticatorData: b64url(a.authenticatorData), clientDataJSON: b64url(a.clientDataJSON), signature: b64url(a.signature) } } };
}

test('unsigned and signed', async () => {
  assert.deepEqual(verifyRecord({ raw: raw(), version: 1 }), { status: 'unsigned' });
  assert.deepEqual(verifyRecord(await signed(raw())), { status: 'signed' });
});

test('tampered entry content after signing is invalid', async () => {
  const rec = await signed(raw());
  rec.raw = { ...rec.raw, totalTenths: 15 };
  assert.match(verifyRecord(rec).reason, /content changed/);
  const rec2 = await signed(raw());
  rec2.raw = { ...rec2.raw, totalTenths: 15 }; rec2.entryHash = toHex(entryHash(rec2.raw)); // attacker also updates the stored hash
  assert.equal(verifyRecord(rec2).status, 'invalid');
  assert.match(verifyRecord(rec2).reason, /assertion does not cover/);
});

test('old signature on a new version is invalid; the old version stays signed and shows superseded', async () => {
  const v1 = await signed(raw());
  const v2raw = raw({ totalTenths: 14 });
  const v2 = { raw: v2raw, entryHash: toHex(entryHash(v2raw)), version: 2, supersedes: v1.entryHash, studentCommit: SC, contract: CONTRACT, signature: v1.signature };
  assert.equal(verifyRecord(v2).status, 'invalid');
  assert.deepEqual(verifyRecord({ ...v2, signature: undefined }), { status: 'unsigned' }, 'new version needs a new signature');
  const v2s = await signed(v2raw, { version: 2, supersedes: v1.entryHash });
  assert.deepEqual(verifyRecord(v2s), { status: 'signed' });
  assert.deepEqual(verifyRecord(v1, { supersededBy: 'v2' }), { status: 'superseded', supersededBy: 'v2' });
});

test('wrong version number or wrong supersedes link is invalid', async () => {
  const v1 = await signed(raw());
  const r2 = raw();
  const v2 = await signed(r2, { version: 2, supersedes: v1.entryHash });
  assert.match(verifyRecord({ ...v2, version: 3 }).reason, /version 2, record is version 3/);
  assert.match(verifyRecord({ ...v2, supersedes: 'ab'.repeat(32) }).reason, /different superseded entry/);
  // forging the stored block to claim another version breaks the signature
  const forged = structuredClone(v2); forged.version = 3; forged.signature.block = { ...forged.signature.block, entryVersion: 3 };
  assert.match(verifyRecord(forged).reason, /assertion does not cover/);
});

test('replayed challenge: an assertion made for another server nonce, entry or deployment does not verify', async () => {
  const a = await signed(raw());
  const b = await signed(raw());
  assert.equal(verifyRecord({ ...a, signature: { ...a.signature, assertion: b.signature.assertion } }).status, 'invalid', 'signature replayed onto another entry');
  assert.equal(verifyRecord({ ...a, signature: { ...a.signature, serverNonce: toHex(randomBytes(32)) } }).status, 'invalid', 'different nonce');
  assert.equal(verifyRecord({ ...a, contract: toHex(randomBytes(32)) }).status, 'invalid', 'other deployment');
});
