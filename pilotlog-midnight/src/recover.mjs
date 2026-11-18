// P-256 ECDSA public-key recovery (SEC 1 v2 §4.1.6), used by the staging "Use my existing passkey" flow: a WebAuthn
// assertion does not carry the public key, but (r, s) over authenticatorData || SHA-256(clientDataJSON) determines at
// most a few candidate keys. Each candidate is then checked with a normal signature verification and against the
// on-chain cfiKeys set (keyIdOf), so a recovered key is only ever trusted when the chain already enrolled it.
import { sha256, concat, bytesToBigBE } from './bytes.mjs';
import { P256, derToRawSignature, isOnCurve, verifyAssertionOffChain } from './webauthn.mjs';

const { p, n, b } = P256;
const G = { x: 0x6b17d1f2e12c4247f8bce6e563a440f277037d812deb33a0f4a13945d898c296n, y: 0x4fe342e2fe1a7f9b8ee7eb4a7c0f9e162bce33576b315ececbb6406837bf51f5n };
const mod = (a, m = p) => ((a % m) + m) % m;
function inv(a, m = p) { // extended Euclid
  let [r0, r1, s0, s1] = [mod(a, m), m, 1n, 0n];
  while (r1) { const q = r0 / r1; [r0, r1] = [r1, r0 - q * r1]; [s0, s1] = [s1, s0 - q * s1]; }
  if (r0 !== 1n) throw new Error('not invertible');
  return mod(s0, m);
}
function powMod(x, e, m = p) { let r = 1n; x = mod(x, m); while (e) { if (e & 1n) r = r * x % m; x = x * x % m; e >>= 1n; } return r; }
// Jacobian coordinates (X, Y, Z), a = -3
const INF = null;
const toJ = (P) => ({ X: P.x, Y: P.y, Z: 1n });
function dbl(P) {
  if (!P || P.Y === 0n) return INF;
  const { X, Y, Z } = P;
  const Z2 = Z * Z % p, M = 3n * (X - Z2) * (X + Z2) % p, Y2 = Y * Y % p, S = 4n * X * Y2 % p;
  const X3 = mod(M * M - 2n * S), Y3 = mod(M * (S - X3) - 8n * Y2 * Y2), Z3 = mod(2n * Y * Z);
  return { X: X3, Y: Y3, Z: Z3 };
}
function add(P, Q) {
  if (!P) return Q; if (!Q) return P;
  const Z1s = P.Z * P.Z % p, Z2s = Q.Z * Q.Z % p;
  const U1 = P.X * Z2s % p, U2 = Q.X * Z1s % p, S1 = P.Y * Z2s * Q.Z % p, S2 = Q.Y * Z1s * P.Z % p;
  if (U1 === U2) return S1 === S2 ? dbl(P) : INF;
  const H = mod(U2 - U1), R = mod(S2 - S1), H2 = H * H % p, H3 = H2 * H % p;
  const X3 = mod(R * R - H3 - 2n * U1 * H2), Y3 = mod(R * (U1 * H2 - X3) - S1 * H3), Z3 = H * P.Z * Q.Z % p;
  return { X: X3, Y: Y3, Z: Z3 };
}
function mul(P, k) { let R = INF, A = toJ(P); for (k = mod(k, n); k; k >>= 1n) { if (k & 1n) R = add(R, A); A = dbl(A); } return R; }
function affine(P) { if (!P) return null; const zi = inv(P.Z), zi2 = zi * zi % p; return { x: P.X * zi2 % p, y: P.Y * zi2 % p * zi % p }; }

/** All P-256 public keys Q for which (r, s) is a valid signature over SHA-256(msg). */
export function recoverP256(msg, { r, s }) {
  if (r <= 0n || r >= n || s <= 0n || s >= n) throw new Error('signature out of range');
  const e = mod(bytesToBigBE(sha256(msg)), n), ri = inv(r, n);
  const out = [];
  for (const x of [r, r + n]) {
    if (x >= p) continue;
    const alpha = mod(x * x * x - 3n * x + b), beta = powMod(alpha, (p + 1n) / 4n);
    if (beta * beta % p !== alpha) continue;
    for (const y of [beta, p - beta]) {
      const Q = affine(add(mul(G, mod(-e * ri, n)), mul({ x, y }, mod(s * ri, n))));
      if (Q && isOnCurve(Q.x, Q.y) && !out.some((o) => o.x === Q.x && o.y === Q.y)) out.push(Q);
    }
  }
  return out;
}

/** Candidates for a WebAuthn assertion (DER signature over authenticatorData || SHA-256(clientDataJSON)), each re-verified. */
export function recoverAssertionKeys({ authenticatorData, clientDataJSON, signature }) {
  const sig = derToRawSignature(signature);
  return recoverP256(concat(authenticatorData, sha256(clientDataJSON)), sig).filter((point) => verifyAssertionOffChain({ point, authenticatorData, clientDataJSON, sig }));
}
