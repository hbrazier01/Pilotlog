import { CONTRACT_ENV } from '../src/env.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import {
  derToRawSignature, rawToDerSignature, isHighS, malleate, P256, coseKeyToPoint, spkiToPoint, isOnCurve,
  classifyClientData, splitClientData, parseAuthenticatorData, flagsHints, assertionToCircuitArgs, verifyAssertionOffChain,
} from '../src/webauthn.mjs';
import { encodeCbor, decodeCbor } from '../src/cbor.mjs';
import { createSoftPasskey } from '../src/softPasskey.mjs';
import { fromHex, enc } from '../src/bytes.mjs';

const digest = () => new Uint8Array(randomBytes(32));

test('DER <-> raw (r, s) round-trips, including high-bit and short integers', () => {
  const cases = [
    { r: 1n, s: 2n },
    { r: 0x80n, s: 0x7fn },
    { r: P256.n - 1n, s: (1n << 255n) + 5n },
    { r: 0x00ffn, s: 0x0100n },
  ];
  for (const c of cases) assert.deepEqual(derToRawSignature(rawToDerSignature(c)), c);
  // a 0x80-leading 32-byte integer must gain a 0x00 pad byte (33 bytes)
  const der = rawToDerSignature({ r: 1n << 255n, s: 1n });
  assert.equal(der[3], 33);
});

test('strict DER: rejects non-minimal, negative, trailing, wrong tags, out-of-range', () => {
  const good = rawToDerSignature({ r: 5n, s: 6n }); // 30 06 02 01 05 02 01 06
  assert.throws(() => derToRawSignature(fromHex('3007020200050201' + '06')), /non-minimal/);
  assert.throws(() => derToRawSignature(fromHex('300602018502' + '0106')), /negative/);
  assert.throws(() => derToRawSignature(Uint8Array.from([...good, 0])), /length mismatch|trailing/);
  assert.throws(() => derToRawSignature(fromHex('310602010502' + '0106')), /SEQUENCE/);
  assert.throws(() => derToRawSignature(fromHex('300602010002' + '0106')), /r out of range/);
  assert.throws(() => derToRawSignature(rawToDerSignature({ r: 5n, s: P256.n })), /s out of range/);
  assert.throws(() => derToRawSignature(fromHex('3006020105')), /length mismatch|truncated/);
});

test('high-S detection and malleation', () => {
  assert.equal(isHighS(1n), false);
  assert.equal(isHighS(P256.n - 1n), true);
  const m = malleate({ r: 7n, s: 9n });
  assert.equal(m.s, P256.n - 9n);
  assert.equal(malleate(m).s, 9n);
});

test('COSE_Key -> P-256 point matches SPKI; strict COSE validation', async () => {
  const pk = await createSoftPasskey();
  const a = coseKeyToPoint(pk.cose), b = spkiToPoint(pk.spki);
  assert.deepEqual(a, b);
  assert.ok(isOnCurve(a.x, a.y));
  const m = decodeCbor(pk.cose);
  const mut = (k, v) => encodeCbor(new Map([...m].map(([kk, vv]) => [kk, kk === k ? v : vv])));
  assert.throws(() => coseKeyToPoint(mut(3, -8)), /ES256/);       // EdDSA
  assert.throws(() => coseKeyToPoint(mut(-1, 8)), /P-256/);       // secp256k1 crv id
  assert.throws(() => coseKeyToPoint(mut(1, 1)), /EC2/);          // OKP
  const badY = Uint8Array.from(m.get(-3)); badY[31] ^= 1;
  assert.throws(() => coseKeyToPoint(mut(-3, badY)), /not on P-256/);
  assert.throws(() => coseKeyToPoint(mut(-2, new Uint8Array(31))), /32-byte/);
  assert.throws(() => decodeCbor(Uint8Array.from([...pk.cose, 0])), /trailing/);
});

test('client-data variants are classified; only std-v1 is accepted on-chain', async () => {
  const pk = await createSoftPasskey();
  const d = digest();
  const expect = { std: 'std-v1', 'chrome-extra': 'chrome-extra-keys', 'no-crossorigin': 'no-crossorigin', 'cross-origin': 'cross-origin', 'top-origin': 'top-origin', reordered: 'non-canonical' };
  for (const [variant, profile] of Object.entries(expect)) {
    const { clientDataJSON } = await pk.get(d, { variant });
    const c = classifyClientData(clientDataJSON, { expectedChallenge: d });
    assert.equal(c.profile, profile, variant);
    assert.equal(c.onChain, profile === 'std-v1', variant);
  }
  assert.equal(classifyClientData((await pk.get(d, { variant: 'chrome-extra' })).clientDataJSON).action, 'retry');
  assert.equal(classifyClientData((await pk.get(d, { origin: 'https://pilotlog.digitalaviationpooI.com' })).clientDataJSON).profile, 'invalid');
  assert.equal(classifyClientData((await pk.get(d)).clientDataJSON, { expectedChallenge: digest() }).profile, 'invalid');
  assert.equal(classifyClientData(enc.encode('{"type":"webauthn.create","challenge":"x","origin":"y"}')).profile, 'invalid');
  assert.equal(classifyClientData(enc.encode('not json')).profile, 'invalid');
});

test('splitClientData yields the 43-byte challenge and the per-origin suffix the compiled circuit expects', async () => {
  const pk = await createSoftPasskey();
  const d = digest();
  const { clientDataJSON } = await pk.get(d);
  const { challenge, cdSuffix } = splitClientData(clientDataJSON, { expectedChallenge: d });
  assert.equal(challenge.length, 43);
  assert.equal(cdSuffix.length, CONTRACT_ENV.cdSuffixLen);
  assert.equal(Buffer.from(cdSuffix).toString(), `","origin":"${CONTRACT_ENV.origin}","crossOrigin":false}`);
  assert.equal(Buffer.from(challenge).toString(), Buffer.from(d).toString('base64url'));
  await assert.rejects(async () => splitClientData((await pk.get(d, { variant: 'chrome-extra' })).clientDataJSON), (e) => e.action === 'retry');
});

test('authenticatorData parsing and UP/UV flag hints', async () => {
  const pk = await createSoftPasskey();
  const { authenticatorData } = await pk.get(digest(), { flags: 0x1d });
  const ad = parseAuthenticatorData(authenticatorData);
  assert.equal(ad.rpIdOk, true);
  assert.deepEqual([ad.flags.up, ad.flags.uv, ad.flags.be, ad.flags.bs], [true, true, true, true]);
  assert.equal(ad.signCount, 1);
  assert.deepEqual(flagsHints(0x1d), { flagsBit1: 0n, flagsHigh: 3n });
  assert.deepEqual(flagsHints(0x05), { flagsBit1: 0n, flagsHigh: 0n });
  assert.throws(() => flagsHints(0x01), /UV/);
  assert.equal(parseAuthenticatorData(authenticatorData, { rpId: 'example.com' }).rpIdOk, false);
});

test('assertionToCircuitArgs: happy path from DER + COSE, and every rejection reason', async () => {
  const pk = await createSoftPasskey();
  const d = digest();
  const a = await pk.get(d);
  const args = assertionToCircuitArgs({ publicKey: { cose: pk.cose }, ...a, digest: d });
  assert.deepEqual(args.cfiPubKey, { ...coseKeyToPoint(pk.cose), identity: false });
  assert.equal(args.authData.length, 37);
  assert.ok(verifyAssertionOffChain({ point: args.cfiPubKey, authenticatorData: a.authenticatorData, clientDataJSON: a.clientDataJSON, sig: args.sig }));
  assert.ok(verifyAssertionOffChain({ point: args.cfiPubKey, authenticatorData: a.authenticatorData, clientDataJSON: a.clientDataJSON, sig: malleate(args.sig) }), 'high-S twin also verifies');
  // same via SPKI
  assert.deepEqual(assertionToCircuitArgs({ publicKey: { spki: pk.spki }, ...a, digest: d }).cfiPubKey, args.cfiPubKey);

  const other = await createSoftPasskey();
  const tryArgs = (x) => () => assertionToCircuitArgs({ publicKey: { cose: pk.cose }, ...x, digest: d });
  assert.throws(() => assertionToCircuitArgs({ publicKey: { cose: other.cose }, ...a, digest: d }), /does not verify/);
  assert.throws(() => assertionToCircuitArgs({ publicKey: { cose: pk.cose }, ...a, digest: digest() }), /not accepted on-chain/);
  assert.throws(tryArgs(await pk.get(d, { flags: 0x01 })), /UV/);
  assert.throws(tryArgs(await pk.get(d, { rpId: 'evil.example' })), /rpIdHash/);
  assert.throws(tryArgs(await pk.get(d, { flags: 0x85, extraAuthData: Uint8Array.of(0xa0) })), /37 bytes/);
  assert.throws(tryArgs(await pk.get(d, { variant: 'cross-origin' })), /cross-origin/);
  assert.throws(tryArgs(await pk.get(d, { variant: 'top-origin' })), /top-origin/);
});
