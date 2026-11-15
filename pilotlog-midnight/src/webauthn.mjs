// Off-chain WebAuthn handling for the CFI endorsement circuit:
//   * clientDataJSON profile detection (the circuit accepts exactly one byte layout, "std-v1")
//   * authenticatorData parsing and the flags decomposition the circuit needs
//   * DER ECDSA signature -> raw (r, s); COSE_Key / SPKI -> raw P-256 point
//   * building and pre-flighting circuit arguments
import { createPublicKey, verify as nodeVerify } from 'node:crypto';
import { decodeCbor } from './cbor.mjs';
import { sha256, concat, enc, b64url, fromB64url, bytesToBigBE, bigToBytesBE, equalBytes } from './bytes.mjs';

export const RP_ID = 'pilotlog.digitalaviationpool.com';
export const ORIGIN = 'https://pilotlog.digitalaviationpool.com';
export const P256 = {
  p: 0xffffffff00000001000000000000000000000000ffffffffffffffffffffffffn,
  n: 0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551n,
  b: 0x5ac635d8aa3a93e7b3ebbd55769886bc651d06b0cc53b0f63bce3c3e27d2604bn,
};

const CD_PREFIX = '{"type":"webauthn.get","challenge":"';
export const CD_PREFIX_LEN = CD_PREFIX.length; // 36
export const CHALLENGE_LEN = 43;               // unpadded base64url of 32 bytes
const stdSuffix = (origin) => `","origin":"${origin}","crossOrigin":false}`;

/**
 * Client-data profiles. Only profiles with onChain: true have a circuit; the rest are recognised so
 * the UI can say *why* an assertion cannot be used and what to do (usually: ask again).
 */
export const PROFILES = {
  'std-v1':            { onChain: true,  action: 'submit',  note: 'type, challenge, origin, crossOrigin:false in spec order' },
  'chrome-extra-keys': { onChain: false, action: 'retry',   note: 'Chrome randomly appends other_keys_can_be_added_here; re-prompt (usually std-v1 next time)' },
  'no-crossorigin':    { onChain: false, action: 'unsupported', note: 'older/other authenticators omit crossOrigin; candidate second circuit' },
  'cross-origin':      { onChain: false, action: 'reject',  note: 'crossOrigin:true (iframe); never accepted' },
  'top-origin':        { onChain: false, action: 'reject',  note: 'topOrigin present (cross-origin iframe); never accepted' },
  'non-canonical':     { onChain: false, action: 'unsupported', note: 'valid JSON but different key order/whitespace/escaping' },
  'invalid':           { onChain: false, action: 'reject',  note: 'wrong type, origin or challenge, or not JSON' },
};

/**
 * Classify clientDataJSON bytes. `expectedChallenge` (32 bytes) is the digest the passkey must have signed.
 * Returns { profile, onChain, action, reason?, parsed? }.
 */
export function classifyClientData(cdBytes, { origin = ORIGIN, expectedChallenge } = {}) {
  const res = (profile, reason, parsed) => ({ profile, ...PROFILES[profile], reason, parsed });
  let parsed;
  try { parsed = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(cdBytes)); } catch { return res('invalid', 'not UTF-8 JSON'); }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return res('invalid', 'not an object');
  if (parsed.type !== 'webauthn.get') return res('invalid', `type ${parsed.type}`);
  if (parsed.origin !== origin) return res('invalid', `origin ${parsed.origin}`);
  if (typeof parsed.challenge !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(parsed.challenge)) return res('invalid', 'challenge is not 43-char base64url');
  if (expectedChallenge && parsed.challenge !== b64url(expectedChallenge)) return res('invalid', 'challenge does not match the expected digest');
  if (parsed.crossOrigin === true) return res('cross-origin', 'crossOrigin true', parsed);
  if ('topOrigin' in parsed) return res('top-origin', 'topOrigin present', parsed);
  const known = new Set(['type', 'challenge', 'origin', 'crossOrigin']);
  const extra = Object.keys(parsed).filter((k) => !known.has(k));
  if (extra.length) return res('chrome-extra-keys', `extra keys: ${extra.join(',')}`, parsed);
  if (!('crossOrigin' in parsed)) return res('no-crossorigin', 'crossOrigin absent', parsed);
  const canonical = enc.encode(CD_PREFIX + parsed.challenge + stdSuffix(origin));
  if (!equalBytes(canonical, cdBytes)) return res('non-canonical', 'byte layout differs from template', parsed);
  return res('std-v1', undefined, parsed);
}

/** Split std-v1 clientDataJSON into the circuit's (challenge[43], cdSuffix[74]) inputs. */
export function splitClientData(cdBytes, opts) {
  const c = classifyClientData(cdBytes, opts);
  if (!c.onChain) {
    const err = new Error(`clientDataJSON profile "${c.profile}" is not accepted on-chain (${c.reason}); action: ${c.action}`);
    err.profile = c.profile; err.action = c.action;
    throw err;
  }
  const challenge = cdBytes.slice(CD_PREFIX_LEN, CD_PREFIX_LEN + CHALLENGE_LEN);
  const cdSuffix = cdBytes.slice(CD_PREFIX_LEN + CHALLENGE_LEN);
  if (cdSuffix.length !== 74) throw new Error(`cdSuffix must be 74 bytes for the deployed circuit, got ${cdSuffix.length}`);
  return { challenge, cdSuffix };
}

/** Parse authenticatorData. The circuit takes exactly 37 bytes (no attested credential data / extensions). */
export function parseAuthenticatorData(ad, { rpId = RP_ID } = {}) {
  if (!(ad instanceof Uint8Array) || ad.length < 37) throw new Error('authenticatorData too short');
  const f = ad[32];
  const flags = { up: !!(f & 1), uv: !!(f & 4), be: !!(f & 8), bs: !!(f & 16), at: !!(f & 64), ed: !!(f & 128), byte: f };
  const signCount = new DataView(ad.buffer, ad.byteOffset + 33, 4).getUint32(0);
  const rpIdHash = ad.slice(0, 32);
  const rpIdOk = equalBytes(rpIdHash, sha256(rpId));
  return { rpIdHash, rpIdOk, flags, signCount, length: ad.length };
}

/** flags = 1 + 2*bit1 + 4 + 8*high (UP and UV mandatory) -> circuit hint arguments. */
export function flagsHints(flagsByte) {
  if ((flagsByte & 0x05) !== 0x05) throw new Error('authenticator flags must include UP and UV (user verification is required)');
  return { flagsBit1: BigInt((flagsByte >> 1) & 1), flagsHigh: BigInt(flagsByte >> 3) };
}

// ---- Signatures

/** Strict DER ECDSA-Sig-Value -> { r, s } (bigint), each in [1, n-1]. */
export function derToRawSignature(der) {
  const d = der instanceof Uint8Array ? der : new Uint8Array(der);
  let i = 0;
  const byte = () => { if (i >= d.length) throw new Error('DER: truncated'); return d[i++]; };
  const len = () => {
    const l = byte();
    if (l < 0x80) return l;
    if (l === 0x81) { const v = byte(); if (v < 0x80) throw new Error('DER: non-minimal length'); return v; }
    throw new Error('DER: unsupported length');
  };
  const int = () => {
    if (byte() !== 0x02) throw new Error('DER: expected INTEGER');
    const l = len();
    if (l === 0 || l > 33) throw new Error('DER: bad INTEGER length');
    if (i + l > d.length) throw new Error('DER: truncated');
    const v = d.slice(i, i + l); i += l;
    if (v[0] & 0x80) throw new Error('DER: negative INTEGER');
    if (l > 1 && v[0] === 0 && !(v[1] & 0x80)) throw new Error('DER: non-minimal INTEGER');
    return bytesToBigBE(v);
  };
  if (byte() !== 0x30) throw new Error('DER: expected SEQUENCE');
  const seqLen = len();
  if (i + seqLen !== d.length) throw new Error('DER: length mismatch / trailing bytes');
  const r = int(), s = int();
  if (i !== d.length) throw new Error('DER: trailing bytes in SEQUENCE');
  for (const [k, v] of [['r', r], ['s', s]]) if (v <= 0n || v >= P256.n) throw new Error(`DER: ${k} out of range`);
  return { r, s };
}

/** { r, s } -> DER (what a real authenticator returns). */
export function rawToDerSignature({ r, s }) {
  const int = (v) => { let b = bigToBytesBE(v, 32); let k = 0; while (k < b.length - 1 && b[k] === 0 && !(b[k + 1] & 0x80)) k++; b = b.slice(k); if (b[0] & 0x80) b = concat(Uint8Array.of(0), b); return concat(Uint8Array.of(0x02, b.length), b); };
  const body = concat(int(r), int(s));
  return concat(Uint8Array.of(0x30, body.length), body);
}

/** WebCrypto/P1363 raw r||s (64 bytes) -> { r, s }. */
export const p1363ToRaw = (sig) => ({ r: bytesToBigBE(sig.slice(0, 32)), s: bytesToBigBE(sig.slice(32, 64)) });
export const isHighS = (s) => s > P256.n / 2n;
/** (r, s) and (r, n-s) both verify. The contract accepts both; dedupe is on (entry, CFI) instead. */
export const malleate = ({ r, s }) => ({ r, s: P256.n - s });

// ---- Public keys

export function isOnCurve(x, y) {
  const { p, b } = P256;
  if (x < 0n || x >= p || y < 0n || y >= p) return false;
  const mod = (v) => ((v % p) + p) % p;
  return mod(y * y) === mod(x * x * x - 3n * x + b);
}

/** COSE_Key (EC2, ES256, P-256) as stored at registration -> { x, y } bigints. */
export function coseKeyToPoint(cose) {
  const m = decodeCbor(cose);
  if (!(m instanceof Map)) throw new Error('COSE: not a map');
  if (m.get(1) !== 2) throw new Error('COSE: kty must be EC2 (2)');
  if (m.get(3) !== -7) throw new Error('COSE: alg must be ES256 (-7)');
  if (m.get(-1) !== 1) throw new Error('COSE: crv must be P-256 (1)');
  const xb = m.get(-2), yb = m.get(-3);
  if (!(xb instanceof Uint8Array) || xb.length !== 32 || !(yb instanceof Uint8Array) || yb.length !== 32) throw new Error('COSE: x and y must be 32-byte strings');
  const x = bytesToBigBE(xb), y = bytesToBigBE(yb);
  if (!isOnCurve(x, y)) throw new Error('COSE: point not on P-256');
  return { x, y };
}

/** SPKI DER (AuthenticatorAttestationResponse.getPublicKey()) -> { x, y }. */
export function spkiToPoint(spki) {
  const jwk = createPublicKey({ key: Buffer.from(spki), format: 'der', type: 'spki' }).export({ format: 'jwk' });
  if (jwk.kty !== 'EC' || jwk.crv !== 'P-256') throw new Error('SPKI: not a P-256 key');
  const x = bytesToBigBE(fromB64url(jwk.x)), y = bytesToBigBE(fromB64url(jwk.y));
  if (!isOnCurve(x, y)) throw new Error('SPKI: point not on P-256');
  return { x, y };
}

export const toCircuitPoint = ({ x, y }) => ({ x, y, identity: false });

function pointToSpki({ x, y }) {
  return createPublicKey({ key: { kty: 'EC', crv: 'P-256', x: b64url(bigToBytesBE(x, 32)), y: b64url(bigToBytesBE(y, 32)) }, format: 'jwk' });
}

/** Off-chain pre-flight: does the assertion verify exactly as the circuit will check it? */
export function verifyAssertionOffChain({ point, authenticatorData, clientDataJSON, sig }) {
  const msg = concat(authenticatorData, sha256(clientDataJSON));
  return nodeVerify('sha256', Buffer.from(msg), { key: pointToSpki(point), dsaEncoding: 'der' }, Buffer.from(rawToDerSignature(sig)));
}

/**
 * Turn a browser assertion into circuit arguments (everything but the leading entry/student args).
 * Throws with a specific reason when the assertion cannot be used on-chain.
 *   publicKey: { cose } | { spki } | { x, y }
 *   signature: DER bytes (as returned by navigator.credentials.get)
 *   digest: the 32-byte value the passkey was asked to sign (endorseDigest / revokeDigest)
 */
export function assertionToCircuitArgs({ publicKey, authenticatorData, clientDataJSON, signature, digest, origin = ORIGIN, rpId = RP_ID }) {
  const point = publicKey.cose ? coseKeyToPoint(publicKey.cose) : publicKey.spki ? spkiToPoint(publicKey.spki) : publicKey;
  if (!isOnCurve(point.x, point.y)) throw new Error('public key not on P-256');
  const ad = parseAuthenticatorData(authenticatorData, { rpId });
  if (!ad.rpIdOk) throw new Error('rpIdHash does not match the PilotLog RP ID');
  if (ad.length !== 37) throw new Error('authenticatorData with extensions/attested data is not supported by the circuit (expected 37 bytes)');
  const { flagsBit1, flagsHigh } = flagsHints(ad.flags.byte);
  const { challenge, cdSuffix } = splitClientData(clientDataJSON, { origin, expectedChallenge: digest });
  const sig = derToRawSignature(signature);
  if (!verifyAssertionOffChain({ point, authenticatorData, clientDataJSON, sig })) throw new Error('signature does not verify off-chain');
  return { cfiPubKey: toCircuitPoint(point), authData: authenticatorData, challenge, cdSuffix, flagsBit1, flagsHigh, sig, highS: isHighS(sig.s) };
}
