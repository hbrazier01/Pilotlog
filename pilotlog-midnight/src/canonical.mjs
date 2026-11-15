// Off-chain canonicalization of a PilotLog entry and the hashes the contract consumes.
// Everything here is deterministic and dependency-free so the same bytes can be rebuilt
// by the browser (for the WebAuthn challenge), the server and an auditor.
import { sha256, concat, fromHex, pad32, enc } from './bytes.mjs';

export const ENTRY_VERSION = 'pilotlog.entry.v1';
export const STUDENT_TAG = 'pilotlog.student.v1';
export const CFI_TAG = 'pilotlog.cfi.v1';

const TENTHS_FIELDS = [
  'totalTenths', 'dualReceivedTenths', 'picTenths', 'soloTenths', 'nightTenths', 'crossCountryTenths',
  'actualInstrumentTenths', 'simInstrumentTenths', 'groundTenths',
];
const COUNT_FIELDS = ['landingsDay', 'landingsNight', 'approaches'];
const ALLOWED = new Set(['entryId', 'entrySalt', 'date', 'aircraftIdent', 'aircraftType', 'from', 'to', 'route', 'remarks', 'maneuvers', ...TENTHS_FIELDS, ...COUNT_FIELDS]);
// Deliberately NOT part of the entry: student/CFI names, certificate numbers, emails. Those are bound
// via studentCommit / cfiRef (salted hashes) so nothing identifying is ever hashed into public state.
const PII_FIELDS = ['studentName', 'studentId', 'studentEmail', 'cfiName', 'cfiCertificate', 'cfiEmail', 'cfiId'];

const nfc = (s) => String(s).normalize('NFC');
const text = (s) => nfc(s).trim().replace(/\s+/g, ' ');
const upperToken = (s) => nfc(s).trim().toUpperCase().replace(/\s+/g, '');

/** Decimal hours (number or string, at most one decimal place) -> integer tenths. */
export function hoursToTenths(h) {
  const s = typeof h === 'number' ? h.toString() : String(h).trim();
  if (!/^\d+(\.\d)?$/.test(s)) throw new RangeError(`hours must have at most one decimal place: ${h}`);
  const [i, f = '0'] = s.split('.');
  return Number(i) * 10 + Number(f);
}

function int(name, v) {
  const n = v === undefined ? 0 : v;
  if (!Number.isSafeInteger(n) || n < 0) throw new RangeError(`${name} must be a non-negative integer`);
  return n;
}

/** Validate and normalize an entry into the fixed v1 schema (every key always present). */
export function normalizeEntryV1(entry) {
  if (!entry || typeof entry !== 'object') throw new TypeError('entry must be an object');
  for (const k of PII_FIELDS) if (k in entry) throw new Error(`PII field "${k}" must not be part of the canonical entry`);
  for (const k of Object.keys(entry)) if (!ALLOWED.has(k)) throw new Error(`unknown entry field "${k}"`);
  const out = {};
  if (typeof entry.entryId !== 'string' || !entry.entryId.trim()) throw new Error('entryId required');
  out.entryId = entry.entryId.trim();
  if (typeof entry.entrySalt !== 'string' || !/^[0-9a-f]{64}$/.test(entry.entrySalt)) throw new Error('entrySalt must be 32 random bytes as lowercase hex');
  out.entrySalt = entry.entrySalt;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(entry.date ?? '') || Number.isNaN(Date.parse(entry.date + 'T00:00:00Z'))) throw new Error('date must be YYYY-MM-DD');
  out.date = entry.date;
  for (const k of ['aircraftIdent', 'aircraftType', 'from', 'to']) {
    if (typeof entry[k] !== 'string' || !entry[k].trim()) throw new Error(`${k} required`);
    out[k] = upperToken(entry[k]);
  }
  out.route = (entry.route ?? []).map(upperToken).filter(Boolean);
  out.maneuvers = [...new Set((entry.maneuvers ?? []).map(text).filter(Boolean))].sort();
  out.remarks = text(entry.remarks ?? '');
  for (const k of TENTHS_FIELDS) out[k] = int(k, entry[k]);
  for (const k of COUNT_FIELDS) out[k] = int(k, entry[k]);
  if (out.totalTenths === 0) throw new Error('totalTenths must be > 0');
  return out;
}

/** RFC 8785 (JCS) subset: objects with sorted keys, arrays, strings, safe integers. No floats, no null. */
export function jcs(v) {
  if (typeof v === 'string') return JSON.stringify(v);
  if (typeof v === 'number') {
    if (!Number.isSafeInteger(v)) throw new TypeError('only safe integers are allowed');
    return String(v);
  }
  if (Array.isArray(v)) return '[' + v.map(jcs).join(',') + ']';
  if (v && typeof v === 'object') {
    return '{' + Object.keys(v).sort().map((k) => JSON.stringify(k) + ':' + jcs(v[k])).join(',') + '}';
  }
  throw new TypeError(`unsupported value in canonical entry: ${v}`);
}

/** Canonical bytes: "pilotlog.entry.v1\n" || JCS(normalized entry). */
export function canonicalEntryBytes(entry) {
  return enc.encode(ENTRY_VERSION + '\n' + jcs(normalizeEntryV1(entry)));
}

/** entryHash = SHA-256(canonical bytes). Goes on-chain; the 32-byte entrySalt makes it unguessable. */
export const entryHash = (entry) => sha256(canonicalEntryBytes(entry));

function saltedCommit(tag, id, saltHex) {
  if (typeof id !== 'string' || !id) throw new Error('id required');
  return sha256(tag + '\n', fromHex(saltHex, 32), nfc(id));
}
/** studentCommit = SHA-256("pilotlog.student.v1\n" || salt(32) || NFC(studentId)). Salt kept off-chain per student. */
export const studentCommit = (studentId, saltHex) => saltedCommit(STUDENT_TAG, studentId, saltHex);
/** cfiRef = SHA-256("pilotlog.cfi.v1\n" || salt(32) || NFC(cfiId)). Same pseudonym across a CFI's key rotations. */
export const cfiRef = (cfiId, saltHex) => saltedCommit(CFI_TAG, cfiId, saltHex);

// ---- Mirrors of the contract's pure circuits (tests assert byte-equality with the compiled contract).
const cat32 = (...xs) => { for (const x of xs) if (x.length !== 32) throw new RangeError('expected 32-byte input'); return concat(...xs); };
export const endorseDigest = (contractAddr, eHash, sCommit) => sha256(cat32(pad32('pilotlog:cfi-endorse:v1'), contractAddr, eHash, sCommit));
export const revokeDigest = (contractAddr, keyId) => sha256(cat32(pad32('pilotlog:cfi-revoke:v1'), contractAddr, keyId));
export const endorsementKey = (eHash, keyId) => sha256(cat32(pad32('pilotlog:cfi-endorsement:v1'), eHash, keyId));
export const adminCommitment = (sk) => sha256(cat32(pad32('pilotlog:cfi-admin:v1'), sk));

/** keyId = SHA-256(LE32(x) || LE32(y)) — matches `secp256r1PointX(pk) as Bytes<32>` (little-endian) in the contract. */
export function keyIdOf({ x, y }) {
  const le = (v) => Uint8Array.from(Buffer.from(v.toString(16).padStart(64, '0'), 'hex').reverse());
  return sha256(le(x), le(y));
}
