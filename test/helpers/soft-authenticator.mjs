/**
 * soft-authenticator.mjs — minimal software WebAuthn authenticator for tests (no network, no browser).
 * ES256 (P-256) key pair, attestation format 'none', discoverable credential, configurable counter.
 */
import { generateKeyPairSync, createHash, sign, randomBytes } from 'node:crypto';

const sha256 = (b) => createHash('sha256').update(b).digest();
const b64u = (b) => Buffer.from(b).toString('base64url');

// ── Tiny CBOR encoder (uint, negint, bytes, text, map) — enough for attestationObject + COSE key ──
function head(major, n) {
  if (n < 24) return Buffer.from([(major << 5) | n]);
  if (n < 256) return Buffer.from([(major << 5) | 24, n]);
  if (n < 65536) { const b = Buffer.alloc(3); b[0] = (major << 5) | 25; b.writeUInt16BE(n, 1); return b; }
  const b = Buffer.alloc(5); b[0] = (major << 5) | 26; b.writeUInt32BE(n, 1); return b;
}
export function cbor(v) {
  if (typeof v === 'number') return v >= 0 ? head(0, v) : head(1, -1 - v);
  if (typeof v === 'string') { const s = Buffer.from(v, 'utf8'); return Buffer.concat([head(3, s.length), s]); }
  if (Buffer.isBuffer(v) || v instanceof Uint8Array) return Buffer.concat([head(2, v.length), Buffer.from(v)]);
  if (v instanceof Map) return Buffer.concat([head(5, v.size), ...[...v].flatMap(([k, x]) => [cbor(k), cbor(x)])]);
  throw new Error('cbor: unsupported ' + typeof v);
}

export function createSoftAuthenticator({ aaguid = Buffer.alloc(16), backupEligible = false } = {}) {
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const jwk = publicKey.export({ format: 'jwk' });
  const credId = randomBytes(32);
  const cose = cbor(new Map([[1, 2], [3, -7], [-1, 1], [-2, Buffer.from(jwk.x, 'base64url')], [-3, Buffer.from(jwk.y, 'base64url')]]));
  const flagBits = (extra) => 0x01 | 0x04 | (backupEligible ? 0x08 | 0x10 : 0) | extra; // UP | UV | BE+BS
  const counterBuf = (n) => { const b = Buffer.alloc(4); b.writeUInt32BE(n >>> 0); return b; };
  let userHandle = null;
  const a = {
    id: b64u(credId), counter: 0,
    /** navigator.credentials.create() equivalent. Overrides: origin, rpId, challenge. */
    create(options, { origin, rpId = options.rp.id, challenge = options.challenge } = {}) {
      userHandle = options.user.id;
      const clientDataJSON = Buffer.from(JSON.stringify({ type: 'webauthn.create', challenge, origin, crossOrigin: false }));
      const authData = Buffer.concat([sha256(rpId), Buffer.from([flagBits(0x40)]), counterBuf(a.counter), Buffer.from(aaguid),
        Buffer.from([credId.length >> 8, credId.length & 0xff]), credId, cose]);
      const attestationObject = cbor(new Map([['fmt', 'none'], ['attStmt', new Map()], ['authData', authData]]));
      return { id: a.id, rawId: a.id, type: 'public-key', clientExtensionResults: {}, authenticatorAttachment: 'platform',
        response: { clientDataJSON: b64u(clientDataJSON), attestationObject: b64u(attestationObject), transports: ['internal', 'hybrid'] } };
    },
    /** navigator.credentials.get() equivalent. Increments counter unless `counter` is forced. */
    get(options, { origin, rpId = options.rpId, challenge = options.challenge, counter } = {}) {
      a.counter = counter ?? a.counter + 1;
      const clientDataJSON = Buffer.from(JSON.stringify({ type: 'webauthn.get', challenge, origin, crossOrigin: false }));
      const authData = Buffer.concat([sha256(rpId), Buffer.from([flagBits(0)]), counterBuf(a.counter)]);
      const signature = sign('sha256', Buffer.concat([authData, sha256(clientDataJSON)]), privateKey); // DER ECDSA
      return { id: a.id, rawId: a.id, type: 'public-key', clientExtensionResults: {}, authenticatorAttachment: 'platform',
        response: { clientDataJSON: b64u(clientDataJSON), authenticatorData: b64u(authData), signature: b64u(signature),
          userHandle: userHandle ?? undefined } };
    },
  };
  return a;
}
