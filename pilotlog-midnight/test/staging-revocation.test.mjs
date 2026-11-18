// Staging server: credential facts shown after registration and signing; revocation with reason + timestamp
// (left school, compromised) and per-entry disputes, all preserving signature history. Localhost only; worker faked.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { createSoftPasskey } from '../src/softPasskey.mjs';
import { CONTRACT_ENV } from '../src/env.mjs';
import { b64url, sha256, toHex, fromB64url } from '../src/bytes.mjs';
import { encodeCbor } from '../src/cbor.mjs';
import { CERTIFICATION_STATEMENT_V1 } from '../src/canonical.mjs';

const PORT = 19000 + Math.floor(Math.random() * 1000);
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

async function setup({ flags = 0x1d, attest = true, badAttest = false } = {}) {
  const pk = await createSoftPasskey();
  const o = (await call('/api/register/options', { cfiName: 'Synthetic Tester', certificateNumber: '7654321', currencyKind: 'RE', currencyDate: '2099-01-01' })).body;
  const cd = new TextEncoder().encode(JSON.stringify({ type: 'webauthn.create', challenge: o.publicKey.challenge, origin: CONTRACT_ENV.origin, crossOrigin: false }));
  const ad = new Uint8Array(37); ad.set(sha256(CONTRACT_ENV.rpId)); ad[32] = flags;
  const attAd = badAttest ? Uint8Array.from(ad, (x, i) => (i === 0 ? x ^ 1 : x)) : ad;
  const attestationObject = attest ? b64url(encodeCbor(new Map([['fmt', 'none'], ['attStmt', new Map()], ['authData', attAd]]))) : null;
  const reg = await call('/api/register/finish', { cfiId: o.cfiId, credentialId: 'cred-' + o.cfiId, clientDataJSON: b64url(cd), authenticatorData: b64url(ad), publicKeySpki: b64url(pk.spki), publicKeyAlgorithm: -7, attestationObject });
  if (reg.status !== 200) return { reg };
  const me = reg.body;
  const job = (await worker('/api/worker/claim')).body.job; await worker('/api/worker/result', { id: job.id, ok: true });
  const sign = async () => {
    const e = (await call('/api/entries', { cfiId: me.cfiId })).body;
    const ch = (await call('/api/entries/challenge', { cfiId: me.cfiId, entryId: e.id, certify: true, statement: CERTIFICATION_STATEMENT_V1 })).body;
    const a = await pk.get(fromB64url(ch.publicKey.challenge), { flags });
    const r = await call('/api/entries/sign', { cfiId: me.cfiId, entryId: e.id, credentialId: me.credentialId, authenticatorData: b64url(a.authenticatorData), clientDataJSON: b64url(a.clientDataJSON), signature: b64url(a.signature) });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    while ((await worker('/api/worker/claim')).body.job); // drain the fake queue
    return r.body;
  };
  return { reg, me, sign };
}
const challenge = (me, entryId) => call('/api/entries/challenge', { cfiId: me.cfiId, entryId, certify: true, statement: CERTIFICATION_STATEMENT_V1 });

test('credential facts after registration and after signing (attestation none, flags as reported)', async () => {
  const { me, sign } = await setup({ flags: 0x1d });
  assert.equal(me.credential.credentialId, me.credentialId);
  assert.equal(me.credential.uv, true); assert.equal(me.credential.backupEligible, true); assert.equal(me.credential.backedUp, true);
  assert.equal(me.credential.attestation.format, 'none'); assert.equal(me.credential.attestation.verified, false);
  assert.match(me.credentialNote, /Not established: which physical device/);
  const s = await sign();
  assert.deepEqual(s.signature.credential, { credentialId: me.credentialId, up: true, uv: true, backupEligible: true, backedUp: true, kindAsReported: 'synced (backup-eligible, as reported)' });
  assert.equal((await setup({ badAttest: true })).reg.status, 400, 'attestationObject must match the authenticatorData');
  assert.equal((await setup({ attest: false })).me.credential.attestation.format, 'not provided');
});

test('(i) left school: reason + time recorded, signing blocked, earlier signature kept in good standing', async () => {
  const { me, sign } = await setup();
  const s = await sign();
  assert.equal((await call('/api/cfi/revoke', { cfiId: me.cfiId, reason: 'nope' })).status, 400);
  const rv = await call('/api/cfi/revoke', { cfiId: me.cfiId, reason: 'left-school', note: 'moved to another school' });
  assert.equal(rv.status, 200); assert.equal(rv.body.revocation.reason, 'left-school'); assert.match(rv.body.revocation.revokedAt, /Z$/);
  assert.deepEqual(rv.body.history.map((h) => h.event), ['registered', 'revoked']);
  assert.equal((await call('/api/cfi/revoke', { cfiId: me.cfiId, reason: 'left-school' })).status, 409);
  const old = (await call('/api/entry?id=' + s.id)).body;
  assert.equal(old.status, 'signed'); assert.equal(old.locked, true); assert.ok(old.signature, 'signature history kept');
  assert.equal(old.standing.standing, 'good'); assert.match(old.standing.notes[0], /left the school/);
  const e2 = (await call('/api/entries', { cfiId: me.cfiId })).body;
  const blocked = await challenge(me, e2.id);
  assert.equal(blocked.status, 403); assert.match(blocked.body.error, /revoked \(left-school\)/);
});

test('(ii) compromised: signatures at/after the suspected time are flagged for review; signing blocked', async () => {
  const { me, sign } = await setup();
  const s = await sign();
  const from = new Date(Date.parse(s.signature.signedAt) - 1000).toISOString();
  const rv = await call('/api/cfi/revoke', { cfiId: me.cfiId, reason: 'credential-compromised', suspectedFrom: from });
  assert.equal(rv.status, 200, JSON.stringify(rv.body)); assert.equal(rv.body.revocation.suspectedFrom, from);
  const old = (await call('/api/verify?id=' + s.id)).body;
  assert.equal(old.status, 'signed', 'cryptographic validity is unchanged'); assert.equal(old.standing.standing, 'review');
  const html = await (await fetch(`${BASE}/verify/${s.entryHash}`)).text();
  assert.match(html, /signature valid for this exact version/); assert.match(html, /standing: review/);
});

test('(iii) disputed signature: one entry flagged, CFI stays active and can sign other entries', async () => {
  const { me, sign } = await setup();
  const s = await sign();
  const unsigned = (await call('/api/entries', { cfiId: me.cfiId })).body;
  assert.equal((await call('/api/entries/dispute', { cfiId: me.cfiId, entryId: unsigned.id, note: 'x' })).status, 409, 'nothing to dispute');
  const d = await call('/api/entries/dispute', { cfiId: me.cfiId, entryId: s.id, note: 'student disputes the times' });
  assert.equal(d.status, 200); assert.equal(d.body.standing.standing, 'disputed'); assert.equal(d.body.dispute.reason, 'disputed-signature');
  assert.equal(d.body.locked, true); assert.equal(d.body.status, 'signed'); assert.ok(d.body.signature);
  assert.equal((await call('/api/entries/dispute', { cfiId: me.cfiId, entryId: s.id })).status, 409);
  assert.equal((await call('/api/cfi?id=' + me.cfiId)).body.revocation, null, 'a dispute does not revoke the CFI');
  assert.equal((await sign()).status, 'signed', 'the CFI can still sign other entries');
});
