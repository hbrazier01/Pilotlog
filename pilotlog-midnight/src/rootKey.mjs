// ROOT key helpers. In production the root key is generated and used OFFLINE by Holland (see the key-ceremony
// runbook in docs/design/cfi-passkey-signing.md §3.4); PilotLog servers and agents only ever see the PUBLIC key
// and signatures over specific operation digests. This module is used by tests and the Preview run with
// SYNTHETIC root keys, and by the `root-digest` / `root-verify` CLI commands an operator can run offline.
//
// Signature scheme: ECDSA P-256 over SHA-256(digest32), i.e. exactly what
//   openssl dgst -sha256 -sign root.pem -out sig.der digest.bin
//   yubico-piv-tool -a verify-pin -a sign -s 9c -A ECCP256 -H SHA256 -i digest.bin -o sig.der
// produce for the 32-byte file digest.bin. Low-S and high-S are both accepted (replays are harmless, see contract).
import { generateKeyPairSync, createPublicKey, sign as nodeSign, verify as nodeVerify } from 'node:crypto';
import { derToRawSignature, spkiToPoint, pointToSpki, toCircuitPoint } from './webauthn.mjs';
import { keyIdOf, rootDigest } from './canonical.mjs';

/** SYNTHETIC root key for tests / Preview only. Returns { privateKey (KeyObject), point, keyId }. */
export function createSyntheticRootKey(privatePem) {
  let privateKey, publicKey;
  if (privatePem) { privateKey = privatePem; publicKey = createPublicKey(privatePem); }
  else ({ privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' }));
  const point = spkiToPoint(new Uint8Array(publicKey.export({ type: 'spki', format: 'der' })));
  return { privateKey, publicKey, point, keyId: keyIdOf(point) };
}

/** Root public key (PEM/SPKI, what Holland exports from the ceremony) -> { point, keyId }. */
export function rootPublicKey(pem) {
  const spki = new Uint8Array(createPublicKey(pem).export({ type: 'spki', format: 'der' }));
  const point = spkiToPoint(spki);
  return { point, keyId: keyIdOf(point) };
}

/** Sign a root digest the way the offline tools do (DER ECDSA over SHA-256(digest)). Tests/Preview only. */
export const signRootDigestDer = (privateKey, digest) => new Uint8Array(nodeSign('sha256', Buffer.from(digest), { key: privateKey, dsaEncoding: 'der' }));

/** Pre-flight + circuit args for a root operation: { rootPk, sig } (throws if the signature does not verify). */
export function rootSignatureArgs({ point, digest, signatureDer }) {
  const ok = nodeVerify('sha256', Buffer.from(digest), { key: pointToSpki(point), dsaEncoding: 'der' }, Buffer.from(signatureDer));
  if (!ok) throw new Error('root signature does not verify over this operation digest');
  return { rootPk: toCircuitPoint(point), sig: derToRawSignature(signatureDer) };
}

/** Convenience for tests/Preview: digest + sign + args in one go with a SYNTHETIC key. */
export function synthRootArgs(root, contractAddr, op, a, b) {
  const digest = rootDigest(contractAddr, op, a, b);
  return rootSignatureArgs({ point: root.point, digest, signatureDer: signRootDigestDer(root.privateKey, digest) });
}
