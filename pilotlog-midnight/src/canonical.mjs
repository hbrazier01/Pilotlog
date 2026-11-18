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
export const endorseDigest = (contractAddr, eHash, sCommit, attest) => sha256(cat32(pad32('pilotlog:cfi-endorse:v2'), contractAddr, eHash, sCommit, attest));
export const revokeDigest = (contractAddr, keyId) => sha256(cat32(pad32('pilotlog:cfi-revoke:v1'), contractAddr, keyId));
export const endorsementKey = (eHash, keyId) => sha256(cat32(pad32('pilotlog:cfi-endorsement:v1'), eHash, keyId));
export const rootDigest = (contractAddr, op, a, b) => sha256(cat32(pad32('pilotlog:cfi-root:v1'), contractAddr, op, a, b));
export const schoolDigest = (contractAddr, op, schoolId, a, b) => sha256(cat32(pad32('pilotlog:cfi-school:v1'), contractAddr, op, schoolId, a, b));
export const ZERO32 = new Uint8Array(32);

/** Operation tags (Compact `pad(32, "...")`). Root ops are signed by an offline root key, school ops by a school admin passkey. */
export const ROOT_OPS = Object.freeze({
  onboardSchool: pad32('onboard-school'),    // a = schoolId, b = adminKeyId
  revokeSchool: pad32('revoke-school'),      // a = schoolId, b = 0
  setSchoolAdmin: pad32('set-school-admin'), // a = schoolId, b = newAdminKeyId
  addRootKey: pad32('add-root-key'),         // a = keyId,    b = 0
  removeRootKey: pad32('remove-root-key'),   // a = keyId,    b = 0
});
export const SCHOOL_OPS = Object.freeze({
  enrollCfi: pad32('enroll-cfi'),            // a = cfiKeyId, b = cfiRef
  revokeCfi: pad32('revoke-cfi'),            // a = cfiKeyId, b = 0
  rotateAdmin: pad32('rotate-admin'),        // a = newAdminKeyId, b = 0
});
export const SCHOOL_TAG = 'pilotlog.school.v1';
/** schoolId = SHA-256("pilotlog.school.v1\n" || salt(32) || NFC(schoolId)). Salted pseudonym; no school name on-chain. */
export const schoolRef = (schoolId, saltHex) => saltedCommit(SCHOOL_TAG, schoolId, saltHex);

/**
 * Endorsement validity rule for verifiers (revocation never deletes history). `L` is the contract ledger view.
 * Returns { valid, reason }.
 */
export function endorsementValidity(L, rec) {
  if (!L.cfiKeys.member(rec.keyId)) return { valid: false, reason: 'key never enrolled' };
  const cfi = L.cfiKeys.lookup(rec.keyId);
  if (!equal(cfi.schoolId, rec.schoolId)) return { valid: false, reason: 'school mismatch' };
  if (L.revokedAtSeq.member(rec.keyId) && !(rec.seq < L.revokedAtSeq.lookup(rec.keyId))) return { valid: false, reason: 'after CFI key revocation' };
  if (L.schoolRevokedAtSeq.member(rec.schoolId) && !(rec.seq < L.schoolRevokedAtSeq.lookup(rec.schoolId))) return { valid: false, reason: 'after school revocation' };
  return { valid: true };
}
const equal = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);

/** keyId = SHA-256(LE32(x) || LE32(y)) — matches `secp256r1PointX(pk) as Bytes<32>` (little-endian) in the contract. */
export function keyIdOf({ x, y }) {
  const le = (v) => Uint8Array.from(Buffer.from(v.toString(16).padStart(64, '0'), 'hex').reverse());
  return sha256(le(x), le(y));
}

// ---- Signature block (AC 61-65K) and the attestation the CFI signs together with the entry.
//
// The legally relevant, human-readable signature block is built off-chain and shown to the CFI on the
// review-and-certify screen. It is hashed (salted, never on-chain) and bound into the passkey challenge via
// attestHash, together with a server-random single-use nonce:
//   signatureBlockCommit = SHA-256("pilotlog.sigblock.v1\n" || salt(32) || JCS(block))
//   attestHash           = SHA-256("pilotlog.attest.v1\n"   || serverNonce(32) || signatureBlockCommit)
//   challenge            = endorseDigest(contract, entryHash, studentCommit, attestHash)
export const CERTIFICATION_STATEMENT_V1 =
  'I certify that I have reviewed this logbook entry, that it accurately records the training I gave, and that I am signing it with my own passkey.';
const SIGBLOCK_KEYS = ['certificateNumber', 'certificateType', 'cfiName', 'currencyDate', 'currencyKind', 'entryVersion', 'signedDate', 'statement', 'supersedes'];

/** Validate + normalize an AC 61-65K signature block. `currencyKind` is 'RE' (recent-experience end date) or 'EXP'. */
export function normalizeSignatureBlock(b) {
  for (const k of Object.keys(b)) if (!SIGBLOCK_KEYS.includes(k)) throw new Error(`unknown signature block field "${k}"`);
  const out = {
    cfiName: text(b.cfiName ?? ''), certificateNumber: upperToken(b.certificateNumber ?? ''), certificateType: upperToken(b.certificateType ?? 'CFI'),
    currencyKind: b.currencyKind, currencyDate: b.currencyDate, signedDate: b.signedDate,
    statement: text(b.statement ?? CERTIFICATION_STATEMENT_V1), supersedes: b.supersedes ?? '', entryVersion: b.entryVersion ?? 1,
  };
  if (!Number.isSafeInteger(out.entryVersion) || out.entryVersion < 1) throw new Error('entryVersion must be a positive integer');
  if ((out.entryVersion === 1) !== (out.supersedes === '')) throw new Error('version 1 supersedes nothing; every later version names the entryHash it supersedes');
  if (!out.cfiName) throw new Error('cfiName required');
  if (!/^[0-9A-Z]{4,12}$/.test(out.certificateNumber)) throw new Error('certificateNumber must be 4-12 letters/digits');
  if (!['RE', 'EXP'].includes(out.currencyKind)) throw new Error('currencyKind must be RE or EXP');
  for (const k of ['currencyDate', 'signedDate']) if (!/^\d{4}-\d{2}-\d{2}$/.test(out[k] ?? '') || Number.isNaN(Date.parse(out[k] + 'T00:00:00Z'))) throw new Error(`${k} must be YYYY-MM-DD`);
  if (out.supersedes !== '' && !/^[0-9a-f]{64}$/.test(out.supersedes)) throw new Error('supersedes must be an entryHash (hex) or empty');
  // Signing is blocked once the CFI's recent-experience end date / certificate expiration has passed.
  if (out.signedDate > out.currencyDate) throw new Error(`signing blocked: ${out.currencyKind === 'RE' ? 'recent-experience end' : 'certificate expiration'} date ${out.currencyDate} has passed`);
  return out;
}

/** AC 61-65K style line, e.g. "/s/ 11-17-2026 J. J. Jones 987654321CFI RE 12-31-2026". */
export function signatureBlockLine(block) {
  const b = normalizeSignatureBlock(block);
  const us = (d) => `${d.slice(5, 7)}-${d.slice(8, 10)}-${d.slice(0, 4)}`;
  return `/s/ ${us(b.signedDate)} ${b.cfiName} ${b.certificateNumber}${b.certificateType} ${b.currencyKind} ${us(b.currencyDate)}`;
}

export const signatureBlockCommit = (block, saltHex) =>
  sha256('pilotlog.sigblock.v1\n', fromHex(saltHex, 32), jcs(normalizeSignatureBlock(block)));
export const attestHash = (serverNonce, sigBlockCommit) => {
  if (serverNonce.length !== 32 || sigBlockCommit.length !== 32) throw new RangeError('expected 32-byte nonce and commit');
  return sha256('pilotlog.attest.v1\n', serverNonce, sigBlockCommit);
};
