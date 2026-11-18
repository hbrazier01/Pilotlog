// SYNTHETIC passkey for tests and the Preview demo: produces exactly what a browser +
// platform authenticator returns from navigator.credentials.get() (DER signature, COSE key).
import { webcrypto as wc } from 'node:crypto';
import { encodeCbor } from './cbor.mjs';
import { sha256, b64url, concat, enc } from './bytes.mjs';
import { RP_ID, ORIGIN, rawToDerSignature, p1363ToRaw } from './webauthn.mjs';

/** @param {{ privateJwk?: object }} [opts] reuse a previously exported synthetic key (Preview runs are resumable). */
export async function createSoftPasskey({ privateJwk } = {}) {
  const alg = { name: 'ECDSA', namedCurve: 'P-256' };
  const kp = privateJwk
    ? { privateKey: await wc.subtle.importKey('jwk', privateJwk, alg, true, ['sign']),
        publicKey: await wc.subtle.importKey('jwk', { kty: 'EC', crv: 'P-256', x: privateJwk.x, y: privateJwk.y }, alg, true, ['verify']) }
    : await wc.subtle.generateKey(alg, true, ['sign', 'verify']);
  const raw = new Uint8Array(await wc.subtle.exportKey('raw', kp.publicKey));
  const spki = new Uint8Array(await wc.subtle.exportKey('spki', kp.publicKey));
  const cose = encodeCbor(new Map([[1, 2], [3, -7], [-1, 1], [-2, raw.slice(1, 33)], [-3, raw.slice(33, 65)]]));
  let signCount = 0;
  return {
    cose, spki,
    exportPrivateJwk: () => wc.subtle.exportKey('jwk', kp.privateKey),
    /**
     * Sign `challenge` (32 bytes). Options let tests produce the client-data variants seen in the wild.
     * variant: 'std' | 'chrome-extra' | 'no-crossorigin' | 'cross-origin' | 'top-origin' | 'reordered'
     */
    async get(challenge, { variant = 'std', origin = ORIGIN, rpId = RP_ID, flags = 0x05, extraAuthData } = {}) {
      const c = b64url(challenge);
      const json = {
        std: `{"type":"webauthn.get","challenge":"${c}","origin":"${origin}","crossOrigin":false}`,
        'chrome-extra': `{"type":"webauthn.get","challenge":"${c}","origin":"${origin}","crossOrigin":false,"other_keys_can_be_added_here":"do not compare clientDataJSON against a template. See https://goo.gl/yabPex"}`,
        'no-crossorigin': `{"type":"webauthn.get","challenge":"${c}","origin":"${origin}"}`,
        'cross-origin': `{"type":"webauthn.get","challenge":"${c}","origin":"${origin}","crossOrigin":true}`,
        'top-origin': `{"type":"webauthn.get","challenge":"${c}","origin":"${origin}","crossOrigin":false,"topOrigin":"https://evil.example"}`,
        reordered: `{"challenge":"${c}","type":"webauthn.get","origin":"${origin}","crossOrigin":false}`,
      }[variant];
      const clientDataJSON = enc.encode(json);
      let authenticatorData = new Uint8Array(37);
      authenticatorData.set(sha256(rpId), 0);
      authenticatorData[32] = flags;
      new DataView(authenticatorData.buffer).setUint32(33, ++signCount);
      if (extraAuthData) authenticatorData = concat(authenticatorData, extraAuthData);
      const p1363 = new Uint8Array(await wc.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, kp.privateKey, concat(authenticatorData, sha256(clientDataJSON))));
      return { authenticatorData, clientDataJSON, signature: rawToDerSignature(p1363ToRaw(p1363)) };
    },
  };
}
