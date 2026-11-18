// Staging app (staging/server.mjs) end-to-end with a SYNTHETIC passkey: FAA stub, registration (UV required),
// review-and-certify, single-use server nonce, RE-date block, entry locking, superseding correction,
// BE/BS recording, worker queue + auth. No network beyond localhost; no chain (the worker is faked).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { createSoftPasskey } from '../src/softPasskey.mjs';
import { CONTRACT_ENV } from '../src/env.mjs';
import { b64url, sha256, toHex, fromB64url } from '../src/bytes.mjs';
import { CERTIFICATION_STATEMENT_V1 } from '../src/canonical.mjs';

const PORT = 18000 + Math.floor(Math.random() * 1000);
const BASE = `http://127.0.0.1:${PORT}`;
const TOKEN = toHex(randomBytes(24));
let srv;
const call = async (path, body, headers = {}) => {
  const r = await fetch(BASE + path, body ? { method: 'POST', headers: { 'content-type': 'application/json', origin: CONTRACT_ENV.origin, ...headers }, body: JSON.stringify(body) } : { headers });
  return { status: r.status, body: await r.json().catch(() => null) };
};
const worker = (path, body) => call(path, body ?? {}, { authorization: `Bearer ${TOKEN}` });

before(async () => {
  srv = spawn(process.execPath, ['staging/server.mjs'], { env: { PATH: process.env.PATH, PILOTLOG_CFI_MIDNIGHT: '1', PORT: String(PORT), CFI_CONTRACT_ADDRESS: 'ab'.repeat(32), CFI_SCHOOL_ID: 'cd'.repeat(32), CFI_WORKER_TOKEN: TOKEN }, stdio: ['ignore', 'pipe', 'inherit'] });
  await new Promise((res) => srv.stdout.on('data', (d) => { if (String(d).includes('staging on')) res(); }));
});
after(() => srv.kill());

async function register(pk, { name = 'Synthetic Tester', cert = '7654321', re = '2099-01-01', flags = 0x05 } = {}) {
  const o = await call('/api/register/options', { cfiName: name, certificateNumber: cert, currencyKind: 'RE', currencyDate: re });
  if (o.status !== 200) return o;
  assert.equal(o.body.publicKey.authenticatorSelection.userVerification, 'required');
  assert.equal(o.body.publicKey.rp.id, CONTRACT_ENV.rpId);
  const cd = new TextEncoder().encode(JSON.stringify({ type: 'webauthn.create', challenge: o.body.publicKey.challenge, origin: CONTRACT_ENV.origin, crossOrigin: false }));
  const ad = new Uint8Array(37); ad.set(sha256(CONTRACT_ENV.rpId)); ad[32] = flags;
  return call('/api/register/finish', { cfiId: o.body.cfiId, credentialId: 'cred-' + o.body.cfiId, clientDataJSON: b64url(cd), authenticatorData: b64url(ad), publicKeySpki: b64url(pk.spki), publicKeyAlgorithm: -7 });
}

test('FAA lookup stub refuses non-synthetic names and "not found" numbers; UV is required at registration', async () => {
  const pk = await createSoftPasskey();
  assert.equal((await register(pk, { name: 'Jane Pilot' })).status, 422);
  assert.equal((await register(pk, { cert: '0001234' })).status, 422);
  assert.equal((await register(pk, { flags: 0x01 })).status, 400);
});

test('full flow: register (synced passkey recorded) -> enroll job -> review/certify -> sign -> locked -> correction', async () => {
  const pk = await createSoftPasskey();
  const reg = await register(pk, { flags: 0x1d }); // UP+UV+BE+BS: synced passkey
  assert.equal(reg.status, 200, JSON.stringify(reg.body));
  const me = reg.body;
  assert.equal(me.passkey.kind, 'synced (backup-eligible)');
  assert.equal(me.faa.status, 'match');
  // worker auth
  assert.equal((await call('/api/worker/claim', {}, { authorization: 'Bearer nope' })).status, 401);
  const e = (await call('/api/entries', { cfiId: me.cfiId })).body;
  // signing refused until the enrollment is on-chain
  assert.equal((await call('/api/entries/challenge', { cfiId: me.cfiId, entryId: e.id, certify: true, statement: CERTIFICATION_STATEMENT_V1 })).status, 409);
  const job = (await worker('/api/worker/claim')).body.job;
  assert.equal(job.type, 'enroll');
  assert.equal(job.payload.keyId, me.keyId);
  await worker('/api/worker/result', { id: job.id, ok: true, txHash: 'aa'.repeat(32) });
  // review-and-certify is mandatory
  assert.equal((await call('/api/entries/challenge', { cfiId: me.cfiId, entryId: e.id, certify: false })).status, 400);
  const ch = (await call('/api/entries/challenge', { cfiId: me.cfiId, entryId: e.id, certify: true, statement: CERTIFICATION_STATEMENT_V1 })).body;
  assert.equal(ch.publicKey.userVerification, 'required');
  assert.match(ch.signatureBlock, /^\/s\/ \d\d-\d\d-\d{4} Synthetic Tester 7654321CFI RE 01-01-2099$/);
  // a second challenge replaces the first (server nonce is single-use and fresh each time)
  const ch2 = (await call('/api/entries/challenge', { cfiId: me.cfiId, entryId: e.id, certify: true, statement: CERTIFICATION_STATEMENT_V1 })).body;
  assert.notEqual(ch2.publicKey.challenge, ch.publicKey.challenge, 'challenge is server-random per attempt');
  const stale = await pk.get(fromB64url(ch.publicKey.challenge));
  const asSign = (a) => ({ cfiId: me.cfiId, entryId: e.id, credentialId: me.credentialId, authenticatorData: b64url(a.authenticatorData), clientDataJSON: b64url(a.clientDataJSON), signature: b64url(a.signature) });
  assert.equal((await call('/api/entries/sign', asSign(stale))).status, 422, 'assertion over a superseded challenge is refused');
  const ch3 = (await call('/api/entries/challenge', { cfiId: me.cfiId, entryId: e.id, certify: true, statement: CERTIFICATION_STATEMENT_V1 })).body;
  const good = await pk.get(fromB64url(ch3.publicKey.challenge), { flags: 0x1d });
  const signed = await call('/api/entries/sign', asSign(good));
  assert.equal(signed.status, 200, JSON.stringify(signed.body));
  assert.equal(signed.body.locked, true);
  assert.equal(signed.body.status, 'signed');
  assert.equal(signed.body.signature.flags.uv, true);
  assert.equal(signed.body.signature.passkeyKind, 'synced (backup-eligible)');
  assert.equal((await call('/api/entries/sign', asSign(good))).status, 400, 'nonce is single-use');
  assert.equal((await call('/api/entries/challenge', { cfiId: me.cfiId, entryId: e.id, certify: true, statement: CERTIFICATION_STATEMENT_V1 })).status, 409, 'locked');
  const ej = (await worker('/api/worker/claim')).body.job;
  assert.equal(ej.type, 'endorse');
  assert.equal(ej.payload.entryHash, e.entryHash);
  // correction = new superseding entry; the original stays locked
  const corr = (await call('/api/entries', { cfiId: me.cfiId, supersedes: e.id })).body;
  assert.equal(corr.supersedes, e.entryHash);
  assert.notEqual(corr.entryHash, e.entryHash);
  const orig = (await call('/api/entry?id=' + e.id)).body;
  assert.equal(orig.locked, true); assert.equal(orig.supersededBy, corr.id);
  assert.equal(orig.status, 'superseded'); assert.equal(orig.version, 1);
  assert.equal(corr.version, 2); assert.equal(corr.status, 'unsigned'); assert.equal(corr.lineageId, e.lineageId);
  assert.match(corr.signatureBlockPreview, /CFI RE/);
  assert.equal((await call('/api/verify?id=' + e.id)).body.status, 'superseded');
  assert.equal((await call('/api/entries', { cfiId: me.cfiId, supersedes: corr.id })).status, 409, 'unsigned entries are not corrected by supersession');
  // printable record with QR
  const html = await (await fetch(`${BASE}/print/${e.id}`)).text();
  assert.match(html, /<svg/); assert.match(html, /Superseded/); assert.match(html, /This readable entry is the record/); assert.match(html, /Prototype — not an FAA endorsement/);
  // RE date passed -> signing blocked
  await call('/api/cfi/currency', { cfiId: me.cfiId, currencyDate: '2020-01-01' });
  const blocked = await call('/api/entries/challenge', { cfiId: me.cfiId, entryId: corr.id, certify: true, statement: CERTIFICATION_STATEMENT_V1 });
  assert.equal(blocked.status, 403); assert.match(blocked.body.error, /recent-experience end date 2020-01-01 has passed/);
});

test('POSTs from another origin are refused; no UV at signing is refused', async () => {
  const r = await fetch(BASE + '/api/entries', { method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://evil.example' }, body: '{}' });
  assert.equal(r.status, 403);
  const pk = await createSoftPasskey();
  const me = (await register(pk)).body;
  const job = (await worker('/api/worker/claim')).body.job; await worker('/api/worker/result', { id: job.id, ok: true });
  const e = (await call('/api/entries', { cfiId: me.cfiId })).body;
  const ch = (await call('/api/entries/challenge', { cfiId: me.cfiId, entryId: e.id, certify: true, statement: CERTIFICATION_STATEMENT_V1 })).body;
  const a = await pk.get(fromB64url(ch.publicKey.challenge), { flags: 0x01 });
  const res = await call('/api/entries/sign', { cfiId: me.cfiId, entryId: e.id, credentialId: me.credentialId, authenticatorData: b64url(a.authenticatorData), clientDataJSON: b64url(a.clientDataJSON), signature: b64url(a.signature) });
  assert.equal(res.status, 422); assert.match(res.body.error, /UV/);
});
