// CFI passkey signing — REAL-DEVICE STAGING app (synthetic data, Midnight PREVIEW testnet only).
//
// What runs where:
//   * this server (Railway, pilotlog-staging project, smallest footprint, no database): WebAuthn ceremonies,
//     FAA-lookup STUB, review-and-certify flow, server nonces, off-chain signature pre-flight, entry locking,
//     job queue, printable record + verification QR.
//   * the prover/relayer (staging/worker on the box): pulls jobs over HTTPS (outbound only), proves with a local
//     proof server and pays DUST from the throwaway Preview wallet. The wallet seed never leaves the box.
//
// Env (all staging-only): PILOTLOG_CFI_MIDNIGHT=1 (required), PORT, CFI_CONTRACT_ADDRESS, CFI_SCHOOL_ID,
// CFI_WORKER_TOKEN (synthetic shared secret for the worker endpoints; never logged).
// RP ID and origin come from the compiled contract (contract/managed/env.json); a mismatch with the
// public URL is refused at boot.
import http from 'node:http';
import { readFileSync } from 'node:fs';
import { registrationFacts, assertionFacts, CREDENTIAL_FACTS_NOTE } from '../src/credential.mjs';
import { REVOCATION_REASONS, makeRevocation, makeDispute, signatureStanding } from '../src/revocation.mjs';
import { randomBytes, randomUUID, timingSafeEqual, createHash } from 'node:crypto';
import QRCode from 'qrcode';
import { assertEnabled } from '../src/flag.mjs';
import { CONTRACT_ENV } from '../src/env.mjs';
import { spkiToPoint, assertionToCircuitArgs, parseAuthenticatorData, toCircuitPoint } from '../src/webauthn.mjs';
import {
  entryHash, studentCommit, cfiRef, keyIdOf, endorseDigest, attestHash, signatureBlockCommit, signatureBlockLine,
  normalizeSignatureBlock, canonicalEntryBytes, CERTIFICATION_STATEMENT_V1,
} from '../src/canonical.mjs';
import { toHex, fromHex, b64url, fromB64url, sha256 } from '../src/bytes.mjs';
import { verifyRecord } from '../src/record.mjs';

assertEnabled();
const { rpId: RP_ID, origin: ORIGIN } = CONTRACT_ENV;
const PORT = Number(process.env.PORT ?? 8080);
const CONTRACT = process.env.CFI_CONTRACT_ADDRESS ?? '';
const SCHOOL_ID = process.env.CFI_SCHOOL_ID ?? '';
const WORKER_TOKEN = process.env.CFI_WORKER_TOKEN ?? '';
const EXPLORER = (tx) => `https://explorer.preview.midnight.network/transactions/${tx}`;
if (process.env.RAILWAY_PUBLIC_DOMAIN && process.env.RAILWAY_PUBLIC_DOMAIN !== RP_ID) {
  console.error(`RP ID ${RP_ID} (compiled) != public domain ${process.env.RAILWAY_PUBLIC_DOMAIN}; recompile for this environment`); process.exit(1);
}
const SERVER_SALT = randomBytes(32).toString('hex'); // per-boot salts for synthetic student / CFI pseudonyms
const INDEX = readFileSync(new URL('./public/index.html', import.meta.url), 'utf8');

// ---------- in-memory state (staging: synthetic, lost on restart by design) ----------
const regs = new Map();     // challenge(b64url) -> { cfiId, exp }
const cfis = new Map();     // cfiId -> CFI record
const entries = new Map();  // entryId -> entry record
const nonces = new Map();   // entryId -> pending signing challenge
const jobs = new Map();     // jobId -> job
let workerSeen = 0;
const limits = { enroll: { n: 0, max: 40 }, endorse: { n: 0, max: 120 }, day: new Date().toISOString().slice(0, 10) };
function budget(kind) {
  const d = new Date().toISOString().slice(0, 10);
  if (d !== limits.day) { limits.day = d; limits.enroll.n = 0; limits.endorse.n = 0; }
  if (limits[kind].n >= limits[kind].max) throw httpError(429, `staging daily ${kind} cap reached (${limits[kind].max}); try tomorrow`);
  limits[kind].n++;
}
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Denver' }).format(new Date()); // YYYY-MM-DD
const httpError = (status, message, extra) => Object.assign(new Error(message), { status, extra });

// ---------- FAA Airmen Inquiry: STUB (no live FAA calls in staging) ----------
// Production design: match name + certificate number against https://amsrvs.registry.faa.gov/airmeninquiry/,
// plus photo-ID, store a PilotLog-signed binding; see docs §3.5. Here: deterministic synthetic answers.
function faaLookupStub({ cfiName, certificateNumber }) {
  if (/^0+/.test(certificateNumber)) return { status: 'not-found', source: 'STUB (synthetic registry)', note: 'certificate numbers starting with 0 simulate "no match"' };
  if (!/synthetic|test|demo/i.test(cfiName)) return { status: 'name-mismatch', source: 'STUB (synthetic registry)', note: 'staging only accepts names containing "Synthetic", "Test" or "Demo" so no real person is enrolled' };
  return { status: 'match', source: 'STUB (synthetic registry)', checkedAt: new Date().toISOString() };
}

// ---------- synthetic entries ----------
const AIRCRAFT = [['N123PL', 'DA40'], ['N456PL', 'C172'], ['N789PL', 'PA28']];
const ROUTES = [['KAPA', 'KAPA', []], ['KAPA', 'KFNL', ['KBJC']], ['KAPA', 'KCOS', []]];
function makeEntry(cfi, base) {
  const id = randomUUID();
  const [ident, type] = base?.raw ? [base.raw.aircraftIdent, base.raw.aircraftType] : AIRCRAFT[Math.floor(Math.random() * AIRCRAFT.length)];
  const [from, to, route] = base?.raw ? [base.raw.from, base.raw.to, base.raw.route] : ROUTES[Math.floor(Math.random() * ROUTES.length)];
  const total = base?.raw ? base.raw.totalTenths + 1 : 10 + Math.floor(Math.random() * 15);
  const raw = {
    entryId: id, entrySalt: randomBytes(32).toString('hex'), date: today(), aircraftIdent: ident, aircraftType: type, from, to, route,
    totalTenths: total, dualReceivedTenths: total, landingsDay: 1 + Math.floor(Math.random() * 4), maneuvers: ['Steep turns', 'Slow flight', 'Power-off stalls'],
    remarks: base ? `SYNTHETIC correction of entry ${base.id.slice(0, 8)}: total time corrected` : 'SYNTHETIC staging entry. Not a real flight.',
  };
  const studentId = `synthetic-student-${cfi.cfiId.slice(0, 8)}`;
  const e = {
    id, raw, entryHash: toHex(entryHash(raw)), canonical: new TextDecoder().decode(canonicalEntryBytes(raw)),
    studentLabel: 'Synthetic Student', studentCommit: toHex(studentCommit(studentId, SERVER_SALT)), cfiId: cfi.cfiId,
    supersedes: base ? base.entryHash : '', supersedesId: base?.id ?? null, supersededBy: null, locked: false, createdAt: new Date().toISOString(),
    lineageId: base?.lineageId ?? id, version: base ? base.version + 1 : 1,
  };
  entries.set(id, e);
  return e;
}
const sigBlockFor = (cfi, e) => ({ cfiName: cfi.cfiName, certificateNumber: cfi.certificateNumber, certificateType: 'CFI', currencyKind: cfi.currencyKind, currencyDate: cfi.currencyDate, signedDate: today(), statement: CERTIFICATION_STATEMENT_V1, supersedes: e.supersedes, entryVersion: e.version });

function publicEntry(e) {
  const cfi = cfis.get(e.cfiId);
  const job = e.jobId ? jobs.get(e.jobId) : null;
  const v = verifyRecord(recordOf(e), { supersededBy: e.supersededBy });
  return {
    id: e.id, lineageId: e.lineageId, version: e.version, status: v.status, statusReason: v.reason ?? null, entryHash: e.entryHash, raw: e.raw, student: e.studentLabel, locked: e.locked, supersedes: e.supersedes, supersedesId: e.supersedesId,
    supersededBy: e.supersededBy, signature: e.signature ?? null, dispute: e.dispute ?? null,
    standing: signatureStanding(e.signature, cfi?.revocation ?? null, e.dispute ?? null),
    signatureBlockPreview: e.signature?.line ?? (cfi ? safeLine(sigBlockFor(cfi, e)) : null), statement: CERTIFICATION_STATEMENT_V1,
    chain: job ? { status: job.status, txHash: job.result?.txHash ?? null, explorer: job.result?.txHash ? EXPLORER(job.result.txHash) : null, error: job.result?.error ?? null, proveMs: job.result?.proveMs ?? null } : null,
  };
}
function recordOf(e) {
  const s = e.signature;
  return { raw: e.raw, entryHash: e.entryHash, version: e.version, supersedes: e.supersedes, studentCommit: e.studentCommit, contract: CONTRACT,
    signature: s && { block: s.block, signatureBlockSalt: s.signatureBlockSalt, serverNonce: s.serverNonce, keyId: s.keyId, publicKeySpki: s.publicKeySpki, assertion: s.assertion } };
}
function safeLine(b) { try { return signatureBlockLine(b); } catch (err) { return `(blocked: ${err.message})`; } }

// ---------- jobs (pulled by the box worker) ----------
function enqueue(type, payload) { const j = { id: randomUUID(), type, payload, status: 'queued', createdAt: Date.now(), attempts: 0 }; jobs.set(j.id, j); return j; }
const bigify = (v) => JSON.stringify(v, (k, x) => (typeof x === 'bigint' ? { $big: x.toString() } : x instanceof Uint8Array ? { $hex: toHex(x) } : x));

// ---------- HTTP ----------
async function body(req) {
  let n = 0; const chunks = [];
  for await (const c of req) { n += c.length; if (n > 64 * 1024) throw httpError(413, 'body too large'); chunks.push(c); }
  if (!chunks.length) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw httpError(400, 'invalid JSON'); }
}
const send = (res, status, obj, headers = {}) => { res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers }); res.end(JSON.stringify(obj)); };
const SEC = {
  'strict-transport-security': 'max-age=31536000', 'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer',
  'content-security-policy': "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'",
  'x-frame-options': 'DENY', 'permissions-policy': 'publickey-credentials-get=(self), publickey-credentials-create=(self)',
};
function workerAuth(req) {
  const h = req.headers.authorization ?? '';
  const got = Buffer.from(h.startsWith('Bearer ') ? h.slice(7) : '');
  const want = Buffer.from(WORKER_TOKEN);
  if (!WORKER_TOKEN || got.length !== want.length || !timingSafeEqual(got, want)) throw httpError(401, 'worker auth required');
  workerSeen = Date.now();
}
const need = (cond, status, msg) => { if (!cond) throw httpError(status, msg); };
const getCfi = (id) => { const c = cfis.get(String(id ?? '')); need(c, 404, 'unknown CFI on this staging server (it restarts with empty memory: set up again)'); return c; };
const getEntry = (id) => { const e = entries.get(String(id ?? '')); need(e, 404, 'unknown entry'); return e; };

const routes = {
  'GET /healthz': () => ({ ok: true }),
  'GET /api/config': () => ({
    rpId: RP_ID, origin: ORIGIN, network: 'Midnight Preview testnet', contract: CONTRACT, schoolId: SCHOOL_ID,
    explorer: CONTRACT ? `https://explorer.preview.midnight.network/contracts/${CONTRACT}` : null,
    prover: { online: Date.now() - workerSeen < 30_000, lastSeenSecondsAgo: workerSeen ? Math.round((Date.now() - workerSeen) / 1000) : null },
    queue: [...jobs.values()].filter((j) => j.status === 'queued' || j.status === 'proving').length, synthetic: true,
  }),

  // 1. CFI setup: FAA stub + currency date, then passkey registration (UV required, ES256, platform authenticator)
  'POST /api/register/options': async (req) => {
    const b = await body(req);
    const block = normalizeSignatureBlock({ cfiName: b.cfiName, certificateNumber: b.certificateNumber, currencyKind: b.currencyKind ?? 'RE', currencyDate: b.currencyDate, signedDate: '1970-01-01' });
    const faa = faaLookupStub(block);
    if (faa.status !== 'match') throw httpError(422, `FAA Airmen Inquiry (stub): ${faa.status}. ${faa.note}`, { faa });
    const cfiId = randomUUID();
    const challenge = b64url(randomBytes(32));
    regs.set(challenge, { cfiId, block, faa, exp: Date.now() + 5 * 60_000 });
    return {
      cfiId, faa,
      publicKey: {
        challenge, rp: { id: RP_ID, name: 'PilotLog CFI signing (STAGING)' },
        user: { id: b64url(sha256(cfiId)), name: `${block.cfiName} (staging)`, displayName: `${block.cfiName} (staging)` },
        pubKeyCredParams: [{ type: 'public-key', alg: -7 }], timeout: 120_000, attestation: 'none',
        authenticatorSelection: { authenticatorAttachment: 'platform', residentKey: 'preferred', userVerification: 'required' },
      },
    };
  },
  'POST /api/register/finish': async (req) => {
    const b = await body(req);
    const cd = JSON.parse(new TextDecoder().decode(fromB64url(String(b.clientDataJSON ?? ''))));
    const pend = regs.get(cd.challenge); regs.delete(cd.challenge);
    need(pend && pend.exp > Date.now() && pend.cfiId === b.cfiId, 400, 'registration challenge unknown or expired; start again');
    need(cd.type === 'webauthn.create' && cd.origin === ORIGIN && cd.crossOrigin !== true, 400, 'clientDataJSON type/origin mismatch');
    const ad = parseAuthenticatorData(fromB64url(String(b.authenticatorData ?? '')), { rpId: RP_ID });
    need(ad.rpIdOk, 400, 'rpIdHash mismatch');
    need(ad.flags.up && ad.flags.uv, 400, 'user verification (Face ID / Touch ID / fingerprint / device PIN) is required');
    need(b.publicKeyAlgorithm === -7, 400, 'only ES256 (P-256) passkeys are supported');
    const point = spkiToPoint(fromB64url(String(b.publicKeySpki ?? '')));
    const keyId = toHex(keyIdOf(point));
    need(![...cfis.values()].some((c) => c.keyId === keyId), 409, 'this passkey is already set up');
    budget('enroll');
    let credential;
    try { credential = registrationFacts({ credentialId: b.credentialId, authenticatorData: fromB64url(String(b.authenticatorData ?? '')), attestationObject: b.attestationObject ? fromB64url(String(b.attestationObject)) : null, transports: b.transports }); }
    catch (err) { throw httpError(400, err.message); }
    const cfi = {
      credential, revocation: null, history: [{ at: new Date().toISOString(), event: 'registered' }],
      cfiId: pend.cfiId, ...pend.block, faa: pend.faa, credentialId: String(b.credentialId), spki: String(b.publicKeySpki), keyId,
      cfiRef: toHex(cfiRef(pend.cfiId, SERVER_SALT)), passkey: { backupEligible: ad.flags.be, backedUp: ad.flags.bs, kind: ad.flags.be ? 'synced (backup-eligible)' : 'device-bound', transports: b.transports ?? [] },
      userAgent: String(req.headers['user-agent'] ?? '').slice(0, 200), createdAt: new Date().toISOString(),
    };
    cfis.set(cfi.cfiId, cfi);
    cfi.enrollJobId = enqueue('enroll', { schoolId: SCHOOL_ID, keyId, cfiRef: cfi.cfiRef }).id;
    return publicCfi(cfi);
  },
  'GET /api/cfi': (req, url) => publicCfi(getCfi(url.searchParams.get('id'))),
  // staging-only: move the RE / expiration date to test the "signing blocked after RE date" rule
  'POST /api/cfi/currency': async (req) => {
    const b = await body(req); const cfi = getCfi(b.cfiId);
    need(/^\d{4}-\d{2}-\d{2}$/.test(b.currencyDate ?? ''), 400, 'currencyDate must be YYYY-MM-DD');
    cfi.currencyDate = b.currencyDate; return publicCfi(cfi);
  },

  // 2. Entries: create (or correct = superseding entry), review-and-certify, sign
  'POST /api/entries': async (req) => {
    const b = await body(req); const cfi = getCfi(b.cfiId);
    let base = null;
    if (b.supersedes) { base = getEntry(b.supersedes); need(base.locked, 409, 'only signed (locked) entries are corrected by a superseding entry; edit unsigned entries directly'); need(!base.supersededBy, 409, 'entry already superseded'); }
    const e = makeEntry(cfi, base);
    if (base) base.supersededBy = e.id;
    return publicEntry(e);
  },
  'GET /api/entries': (req, url) => { const cfiId = url.searchParams.get('cfiId'); return [...entries.values()].filter((e) => e.cfiId === cfiId).map(publicEntry).reverse(); },
  'GET /api/entry': (req, url) => publicEntry(getEntry(url.searchParams.get('id'))),
  // Off-chain re-verification of the stored signature against the stored readable entry (primary check).
  'GET /api/verify': (req, url) => { const e = getEntry(url.searchParams.get('id')); const p = publicEntry(e); return { id: e.id, version: e.version, entryHash: e.entryHash, status: p.status, reason: p.statusReason, standing: p.standing, dispute: p.dispute, chain: p.chain }; },
  'POST /api/entries/challenge': async (req) => {
    const b = await body(req); const e = getEntry(b.entryId); const cfi = getCfi(b.cfiId);
    need(e.cfiId === cfi.cfiId, 403, 'entry belongs to another CFI');
    need(!e.locked, 409, 'entry is signed and locked; make a correction instead');
    need(!cfi.revocation, 403, cfi.revocation ? `this passkey was revoked (${cfi.revocation.reason}) at ${cfi.revocation.revokedAt}; signing is blocked, earlier signatures are kept` : '');
    need(b.certify === true && b.statement === CERTIFICATION_STATEMENT_V1, 400, 'review the entry and tick the certification statement first');
    const enr = jobs.get(cfi.enrollJobId);
    need(enr?.status === 'done', 409, `your passkey is not enrolled on-chain yet (status: ${enr?.status ?? 'unknown'}); wait for the school enrollment to finish`);
    let block;
    try { block = normalizeSignatureBlock(sigBlockFor(cfi, e)); } catch (err) { throw httpError(403, err.message); } // RE/expiration date passed -> blocked
    const nonce = randomBytes(32), salt = randomBytes(32).toString('hex');
    const sbc = signatureBlockCommit(block, salt), att = attestHash(nonce, sbc);
    const digest = endorseDigest(fromHex(CONTRACT, 32), fromHex(e.entryHash, 32), fromHex(e.studentCommit, 32), att);
    nonces.set(e.id, { nonce: toHex(nonce), salt, block, attest: toHex(att), digest: toHex(digest), exp: Date.now() + 3 * 60_000, cfiId: cfi.cfiId });
    return {
      signatureBlock: signatureBlockLine(block),
      publicKey: { challenge: b64url(digest), rpId: RP_ID, timeout: 120_000, userVerification: 'required', allowCredentials: [{ type: 'public-key', id: cfi.credentialId }] },
    };
  },
  'POST /api/entries/sign': async (req) => {
    const b = await body(req); const e = getEntry(b.entryId); const cfi = getCfi(b.cfiId);
    const n = nonces.get(e.id); nonces.delete(e.id); // single use
    need(n && n.exp > Date.now() && n.cfiId === cfi.cfiId, 400, 'signing challenge unknown, used or expired; review and certify again');
    need(!e.locked, 409, 'entry already signed');
    need(!cfi.revocation, 403, 'this passkey was revoked; signing is blocked');
    need(String(b.credentialId) === cfi.credentialId, 400, 'unexpected credential');
    let a;
    try {
      a = assertionToCircuitArgs({
        publicKey: spkiToPoint(fromB64url(cfi.spki)), authenticatorData: fromB64url(String(b.authenticatorData)), clientDataJSON: fromB64url(String(b.clientDataJSON)),
        signature: fromB64url(String(b.signature)), digest: fromHex(n.digest, 32),
      });
    } catch (err) { throw httpError(422, `assertion not usable on-chain: ${err.message}`, { action: err.action ?? 'retry' }); }
    const ad = parseAuthenticatorData(a.authData, { rpId: RP_ID });
    budget('endorse');
    e.locked = true;
    e.signature = {
      line: signatureBlockLine(n.block), block: n.block, signedAt: new Date().toISOString(), serverNonce: n.nonce, signatureBlockSalt: n.salt, attestHash: n.attest, challenge: n.digest,
      keyId: cfi.keyId, publicKeySpki: cfi.spki, flags: { up: ad.flags.up, uv: ad.flags.uv, backupEligible: ad.flags.be, backedUp: ad.flags.bs }, credential: assertionFacts({ credentialId: b.credentialId, authenticatorData: a.authData }), passkeyKind: ad.flags.be ? 'synced (backup-eligible)' : 'device-bound',
      assertion: { authenticatorData: b.authenticatorData, clientDataJSON: b.clientDataJSON, signature: b.signature }, highS: a.highS,
    };
    const job = enqueue('endorse', { args: bigify([fromHex(e.entryHash, 32), fromHex(e.studentCommit, 32), fromHex(n.attest, 32), a.cfiPubKey, a.authData, a.challenge, a.cdSuffix, a.flagsBit1, a.flagsHigh, a.sig]), entryHash: e.entryHash, keyId: cfi.keyId });
    e.jobId = job.id;
    return publicEntry(e);
  },

  // 2b. Revocation and disputes (staging: off-chain records with reason + UTC timestamp; history is never deleted).
  // In staging the tester plays the school admin. On-chain schoolRevokeCfi / dispute marking is PROPOSED (docs §3.7).
  'POST /api/cfi/revoke': async (req) => {
    const b = await body(req); const cfi = getCfi(b.cfiId);
    need(!cfi.revocation, 409, `already revoked (${cfi.revocation?.reason}) at ${cfi.revocation?.revokedAt}`);
    try { cfi.revocation = makeRevocation({ reason: b.reason, note: b.note, suspectedFrom: b.suspectedFrom || null }); } catch (err) { throw httpError(400, err.message); }
    nonces.forEach((n, k) => { if (n.cfiId === cfi.cfiId) nonces.delete(k); }); // pending challenges die with the credential
    cfi.history.push({ at: cfi.revocation.revokedAt, event: 'revoked', reason: cfi.revocation.reason });
    return publicCfi(cfi);
  },
  'POST /api/entries/dispute': async (req) => {
    const b = await body(req); const e = getEntry(b.entryId); const cfi = getCfi(b.cfiId);
    need(e.cfiId === cfi.cfiId, 403, 'entry belongs to another CFI');
    need(e.signature, 409, 'only a signed entry can have its signature disputed');
    need(!e.dispute, 409, 'signature already disputed');
    e.dispute = makeDispute({ note: b.note });
    return publicEntry(e);
  },
  'GET /api/revocation-reasons': () => ({ reasons: REVOCATION_REASONS, dispute: 'disputed-signature (per entry; does not revoke the CFI)' }),

  // 3. Worker (box prover/relayer)
  'POST /api/worker/claim': (req) => {
    workerAuth(req);
    for (const j of jobs.values()) if (j.status === 'proving' && Date.now() - j.claimedAt > 10 * 60_000) j.status = 'queued'; // reclaim stuck jobs
    const j = [...jobs.values()].filter((x) => x.status === 'queued').sort((x, y) => (x.type === 'enroll' ? 0 : 1) - (y.type === 'enroll' ? 0 : 1) || x.createdAt - y.createdAt)[0];
    if (!j) return { job: null };
    j.status = 'proving'; j.claimedAt = Date.now(); j.attempts++;
    return { job: { id: j.id, type: j.type, payload: j.payload } };
  },
  'POST /api/worker/result': async (req) => {
    workerAuth(req);
    const b = await body(req); const j = jobs.get(String(b.id)); need(j, 404, 'unknown job');
    j.status = b.ok ? 'done' : (j.attempts < 2 && b.retryable ? 'queued' : 'failed');
    j.result = { txHash: b.txHash ?? null, txId: b.txId ?? null, blockHeight: b.blockHeight ?? null, proveMs: b.proveMs ?? null, error: b.error ? String(b.error).slice(0, 300) : null };
    return { ok: true };
  },
  'POST /api/worker/heartbeat': (req) => { workerAuth(req); return { ok: true }; },
};

function publicCfi(c) {
  const j = jobs.get(c.enrollJobId);
  return {
    cfiId: c.cfiId, cfiName: c.cfiName, certificateNumber: c.certificateNumber, currencyKind: c.currencyKind, currencyDate: c.currencyDate,
    signingBlocked: today() > c.currencyDate || !!c.revocation, faa: c.faa, passkey: c.passkey, keyId: c.keyId, credentialId: c.credentialId,
    credential: c.credential, credentialNote: CREDENTIAL_FACTS_NOTE, revocation: c.revocation, history: c.history,
    enrollment: j ? { status: j.status, txHash: j.result?.txHash ?? null, explorer: j.result?.txHash ? EXPLORER(j.result.txHash) : null, error: j.result?.error ?? null, proveMs: j.result?.proveMs ?? null } : null,
  };
}

// Printable record (browser "Save as PDF") with a verification QR. The readable entry is the legal record.
async function printable(e, verifyUrl) {
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const qr = await QRCode.toString(verifyUrl, { type: 'svg', margin: 1, width: 160 });
  const p = publicEntry(e); const r = e.raw;
  const rows = [['Date', r.date], ['Aircraft', `${r.aircraftIdent} (${r.aircraftType})`], ['Route', [r.from, ...(r.route ?? []), r.to].join(' → ')], ['Total / dual received', `${(r.totalTenths / 10).toFixed(1)} h / ${(r.dualReceivedTenths / 10).toFixed(1)} h`], ['Day landings', r.landingsDay], ['Maneuvers', (r.maneuvers ?? []).join(', ')], ['Remarks', r.remarks], ['Student', p.student]];
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>PilotLog entry ${esc(e.id.slice(0, 8))} (STAGING)</title>
<style>body{font:14px/1.45 -apple-system,system-ui,sans-serif;max-width:720px;margin:24px auto;padding:0 16px;color:#111}h1{font-size:20px}table{border-collapse:collapse;width:100%}td{border-bottom:1px solid #ddd;padding:6px 4px;vertical-align:top}td:first-child{color:#555;width:38%}.sig{font-family:ui-monospace,Menlo,monospace;background:#f5f5f5;padding:10px;border-radius:6px;margin:12px 0}.banner{background:#fff3cd;padding:8px;border-radius:6px}.qr{float:right;margin-left:12px}.small{font-size:12px;color:#555;word-break:break-all}@media print{.noprint{display:none}}</style></head><body>
<div class="banner"><b>Prototype — not an FAA endorsement.</b> STAGING · SYNTHETIC DATA · Midnight Preview testnet · not a real logbook record.</div>
<div class="qr">${qr}</div><h1>Logbook entry · version ${e.version} · ${esc(p.status)}</h1>
<table>${rows.map(([k, v]) => `<tr><td>${esc(k)}</td><td>${esc(v)}</td></tr>`).join('')}</table>
${e.supersedes ? `<p><b>Correction.</b> Supersedes entry hash <span class="small">${esc(e.supersedes)}</span></p>` : ''}${e.supersededBy ? `<p><b>Superseded</b> by a later correction (entry ${esc(e.supersededBy.slice(0, 8))}).</p>` : ''}
<p><b>Instructor certification:</b> ${esc(p.statement)}</p>
<div class="sig">${esc(p.signature ? p.signature.line : 'NOT SIGNED')}</div>
${p.signature ? `<p class="small">Signed at ${esc(p.signature.signedAt)}; entry locked on signing. Credential ${esc(p.signature.credential?.credentialId ?? '')} · UV=${p.signature.flags.uv ? 1 : 0} · BE=${p.signature.flags.backupEligible ? 1 : 0} · BS=${p.signature.flags.backedUp ? 1 : 0} (authenticator-reported; does not identify a physical device).</p>` : ''}
<p><b>Verification (re-checked now from the stored entry and passkey assertion):</b> ${p.status === 'signed' || p.status === 'superseded' ? '✓ signature valid for this exact version' : esc(p.status)}${p.statusReason ? ` (${esc(p.statusReason)})` : ''}${p.standing?.standing && p.standing.standing !== 'good' ? ` · <b>standing: ${esc(p.standing.standing)}</b>` : ''}</p>
${(p.standing?.notes ?? []).map((n) => `<p class="small">${esc(n)}</p>`).join('')}
<p class="small">Entry hash (SHA-256, canonical v1): ${esc(e.entryHash)}<br>On-chain tamper evidence (supplemental only): ${p.chain?.txHash ? `Midnight Preview tx ${esc(p.chain.txHash)}` : esc(p.chain?.status ?? 'not submitted')}<br>Contract ${esc(CONTRACT)}<br>Verify: ${esc(verifyUrl)}</p>
<p class="small">This readable entry is the record. The blockchain check only shows the entry has not changed since it was signed; the record does not depend on it.</p>
<p class="noprint"><button onclick="print()">Print / Save as PDF</button> <a href="/">Back</a></p></body></html>`;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, ORIGIN);
  try {
    if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', ...SEC }); return res.end(INDEX); }
    const pm = url.pathname.match(/^\/(print|verify)\/([0-9a-f-]{36}|[0-9a-f]{64})$/);
    if (req.method === 'GET' && pm) {
      const e = pm[2].length === 64 ? [...entries.values()].find((x) => x.entryHash === pm[2]) : entries.get(pm[2]);
      if (!e) { res.writeHead(404, { 'content-type': 'text/plain', ...SEC }); return res.end('Unknown entry on this staging server (memory is cleared on restart).'); }
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', ...SEC });
      return res.end(await printable(e, `${ORIGIN}/verify/${e.entryHash}`));
    }
    const h = routes[`${req.method} ${url.pathname}`];
    if (!h) return send(res, 404, { error: 'not found' }, SEC);
    if (req.method === 'POST' && !url.pathname.startsWith('/api/worker/') && req.headers.origin !== ORIGIN) return send(res, 403, { error: 'bad origin' }, SEC);
    send(res, 200, await h(req, url), SEC);
  } catch (err) {
    const status = err.status ?? 500;
    if (status === 500) console.error('error', req.method, url.pathname, err.message);
    send(res, status, { error: err.message, ...(err.extra ?? {}) }, SEC);
  }
});
server.listen(PORT, () => console.log(`cfi-passkey staging on :${PORT} rpId=${RP_ID} contract=${CONTRACT || '(unset)'} school=${SCHOOL_ID ? SCHOOL_ID.slice(0, 8) + '…' : '(unset)'}`));
