import { createHash } from 'node:crypto';

export const enc = new TextEncoder();
export const sha256 = (...parts) => {
  const h = createHash('sha256');
  for (const p of parts) h.update(typeof p === 'string' ? enc.encode(p) : p);
  return new Uint8Array(h.digest());
};
export const concat = (...parts) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
};
export const toHex = (b) => Buffer.from(b).toString('hex');
export function fromHex(h, len) {
  if (typeof h !== 'string' || !/^([0-9a-fA-F]{2})*$/.test(h)) throw new TypeError('expected hex string');
  const b = new Uint8Array(Buffer.from(h, 'hex'));
  if (len !== undefined && b.length !== len) throw new RangeError(`expected ${len} bytes, got ${b.length}`);
  return b;
}
export const b64url = (b) => Buffer.from(b).toString('base64url');
export const fromB64url = (s) => new Uint8Array(Buffer.from(s, 'base64url'));
export const bytesToBigBE = (b) => (b.length ? BigInt('0x' + toHex(b)) : 0n);
export function bigToBytesBE(n, len) {
  const h = n.toString(16).padStart(len * 2, '0');
  if (h.length > len * 2) throw new RangeError('integer too large');
  return fromHex(h);
}
// Compact `pad(32, "str")`: UTF-8 bytes, right-padded with zeros.
export function pad32(s) {
  const b = enc.encode(s);
  if (b.length > 32) throw new RangeError('pad32: string too long');
  const out = new Uint8Array(32);
  out.set(b);
  return out;
}
export const equalBytes = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);
