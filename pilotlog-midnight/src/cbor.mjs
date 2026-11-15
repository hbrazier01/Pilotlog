// Minimal, strict CBOR (RFC 8949) for COSE_Key decoding: unsigned/negative ints, byte/text strings,
// arrays and maps with definite lengths. Indefinite lengths, tags and floats are rejected.
export function decodeCbor(bytes) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let i = 0;
  const need = (n) => { if (i + n > b.length) throw new Error('CBOR: truncated'); };
  function arg(info) {
    if (info < 24) return info;
    const n = { 24: 1, 25: 2, 26: 4, 27: 8 }[info];
    if (!n) throw new Error('CBOR: unsupported length encoding');
    need(n);
    let v = 0n;
    for (let k = 0; k < n; k++) v = (v << 8n) | BigInt(b[i++]);
    if (v > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('CBOR: integer too large');
    return Number(v);
  }
  function item(depth) {
    if (depth > 8) throw new Error('CBOR: nesting too deep');
    need(1);
    const ib = b[i++], major = ib >> 5, info = ib & 31;
    switch (major) {
      case 0: return arg(info);
      case 1: return -1 - arg(info);
      case 2: { const n = arg(info); need(n); const v = b.slice(i, i + n); i += n; return v; }
      case 3: { const n = arg(info); need(n); const v = new TextDecoder('utf-8', { fatal: true }).decode(b.slice(i, i + n)); i += n; return v; }
      case 4: { const n = arg(info); const a = []; for (let k = 0; k < n; k++) a.push(item(depth + 1)); return a; }
      case 5: {
        const n = arg(info); const m = new Map();
        for (let k = 0; k < n; k++) { const key = item(depth + 1); if (m.has(key)) throw new Error('CBOR: duplicate map key'); m.set(key, item(depth + 1)); }
        return m;
      }
      default: throw new Error(`CBOR: unsupported major type ${major}`);
    }
  }
  const v = item(0);
  if (i !== b.length) throw new Error('CBOR: trailing bytes');
  return v;
}

/** Encoder (used by tests to build COSE keys the way authenticators do). */
export function encodeCbor(v) {
  const out = [];
  const head = (major, n) => {
    if (n < 24) out.push((major << 5) | n);
    else if (n < 256) out.push((major << 5) | 24, n);
    else if (n < 65536) out.push((major << 5) | 25, n >> 8, n & 255);
    else throw new Error('encodeCbor: too long');
  };
  const enc = (x) => {
    if (typeof x === 'number') { if (x >= 0) head(0, x); else head(1, -1 - x); }
    else if (x instanceof Uint8Array) { head(2, x.length); out.push(...x); }
    else if (typeof x === 'string') { const t = new TextEncoder().encode(x); head(3, t.length); out.push(...t); }
    else if (Array.isArray(x)) { head(4, x.length); x.forEach(enc); }
    else if (x instanceof Map) { head(5, x.size); for (const [k, val] of x) { enc(k); enc(val); } }
    else throw new Error('encodeCbor: unsupported');
  };
  enc(v);
  return new Uint8Array(out);
}
