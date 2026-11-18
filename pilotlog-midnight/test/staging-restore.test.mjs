// Staging persistence + "Use my existing passkey" recovery (staging/server.mjs, staging/persist.mjs, src/recover.mjs).
// SYNTHETIC passkeys; the chain is a fixture file (CFI_CHAIN_FIXTURE); no network beyond localhost.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createSoftPasskey } from '../src/softPasskey.mjs';
import { CONTRACT_ENV } from '../src/env.mjs';
import { b64url, sha256, toHex, fromB64url } from '../src/bytes.mjs';
import { CERTIFICATION_STATEMENT_V1, keyIdOf } from '../src/canonical.mjs';
import { coseKeyToPoint } from '../src/webauthn.mjs';
import { recoverAssertionKeys, recoverP256 } from '../src/recover.mjs';

const dir = mkdtempSync(join(tmpdir(), 'cfi-restore-'));
const FIXTURE = join(dir, 'chain.json'), STATE = join(dir, 'state.json');
const TOKEN = toHex(randomBytes(24)), SCHOOL = 'cd'.repeat(32);
const PORT = 19000 + Math.floor(Math.random() * 900), BASE = `http://127.0.0.1:${PORT}`;
let srv = null;
after(() => { srv?.kill(); rmSync(dir, { recursive: true, force: true }); });
async function start({ persist }) {
  srv?.kill(); if (srv) await new Promise((r) => srv.once('exit', r));
  const env = { PATH: process.env.PATH, PILOTLOG_CFI_MIDNIGHT: '1', PORT: String(PORT), CFI_CONTRACT_ADDRESS: 'ab'.repeat(32), CFI_SCHOOL_ID: SCHOOL, CFI_WORKER_TOKEN: TOKEN, CFI_CHAIN_FIXTURE: FIXTURE, ...(persist ? { CFI_STATE_FILE: STATE } : {}) };
  srv = spawn(process.execPath, ['staging/server.mjs'], { env, stdio: ['ignore', 'pipe', 'inherit'] });
  await new Promise((res) => srv.stdout.on('data', (d) => { if (String(d).includes('staging on')) res(); }));
}
const call = async (path, body, headers = {}) => {
  const r = await fetch(BASE + path, body ? { method: 'POST', headers: { 'content-type': 'application/json', origin: CONTRACT_ENV.origin, ...headers }, body: JSON.stringify(body) } : { headers });
  return { status: r.status, body: await r.json().catch(() => null) };
};
const worker = (path, body) => call(path, body ?? {}, { authorization: `Bearer ${TOKEN}` });
const credIdOf = new Map();
async function register(pk, name = 'Synthetic Tester') {
  const o = await call('/api/register/options', { cfiName: name, certificateNumber: '7654321', currencyKind: 'RE', currencyDate: '2099-01-01' });
  const cd = new TextEncoder().encode(JSON.stringify({ type: 'webauthn.create', challenge: o.body.publicKey.challenge, origin: CONTRACT_ENV.origin, crossOrigin: false }));
  const ad = new Uint8Array(37); ad.set(sha256(CONTRACT_ENV.rpId)); ad[32] = 0x1d;
  const credentialId = 'cred-' + o.body.cfiId; credIdOf.set(pk, credentialId);
  const r = await call('/api/register/finish', { cfiId: o.body.cfiId, credentialId, clientDataJSON: b64url(cd), authenticatorData: b64url(ad), publicKeySpki: b64url(pk.spki), publicKeyAlgorithm: -7 });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  return r.body;
}
async function enrollOnFakeChain(me, chain) {
  const job = (await worker('/api/worker/claim')).body.job;
  assert.equal(job.payload.keyId, me.keyId);
  await worker('/api/worker/result', { id: job.id, ok: true, txHash: 'aa'.repeat(32) });
  chain.cfiKeys[me.keyId] = { cfiRef: job.payload.cfiRef, schoolId: job.payload.schoolId };
  writeFileSync(FIXTURE, JSON.stringify(chain));
}
async function restoreWith(pk, opts = {}) {
  const o = await call('/api/restore/options', {});
  assert.equal(o.status, 200);
  assert.deepEqual(o.body.publicKey.allowCredentials, [], 'discoverable: no allowCredentials');
  assert.equal(o.body.publicKey.userVerification, 'required');
  const a = await pk.get(fromB64url(o.body.publicKey.challenge), { flags: opts.flags ?? 0x1d });
  return call('/api/restore/finish', { credentialId: credIdOf.get(pk) ?? 'cred-x', authenticatorData: b64url(a.authenticatorData), clientDataJSON: b64url(a.clientDataJSON), signature: b64url(a.signature), cfiName: opts.name ?? 'Synthetic Instructor', certificateNumber: '7654321', currencyDate: '2099-01-01' });
}
async function signOne(me, pk) {
  const e = (await call('/api/entries', { cfiId: me.cfiId })).body;
  const ch = await call('/api/entries/challenge', { cfiId: me.cfiId, entryId: e.id, certify: true, statement: CERTIFICATION_STATEMENT_V1 });
  assert.equal(ch.status, 200, JSON.stringify(ch.body));
  const a = await pk.get(fromB64url(ch.body.publicKey.challenge), { flags: 0x1d });
  return call('/api/entries/sign', { cfiId: me.cfiId, entryId: e.id, credentialId: me.credentialId, authenticatorData: b64url(a.authenticatorData), clientDataJSON: b64url(a.clientDataJSON), signature: b64url(a.signature) });
}

test('P-256 public-key recovery returns the signing key among <= 4 verified candidates', async () => {
  for (let i = 0; i < 8; i++) {
    const pk = await createSoftPasskey(); const pt = coseKeyToPoint(pk.cose);
    const a = await pk.get(randomBytes(32));
    const c = recoverAssertionKeys(a);
    assert.ok(c.length >= 1 && c.length <= 4);
    assert.ok(c.some((q) => q.x === pt.x && q.y === pt.y));
  }
  assert.throws(() => recoverP256(new Uint8Array(1), { r: 0n, s: 1n }));
});

test('state persists across a restart (CFI, credential, entries, jobs, salt)', async () => {
  writeFileSync(FIXTURE, JSON.stringify({ cfiKeys: {} }));
  await start({ persist: true });
  const pk = await createSoftPasskey(); const chain = { cfiKeys: {} };
  const me = await register(pk);
  await enrollOnFakeChain(me, chain);
  const signed = await signOne(me, pk);
  assert.equal(signed.status, 200, JSON.stringify(signed.body));
  await new Promise((r) => setTimeout(r, 600)); // debounce window
  await start({ persist: true }); // restart = sleep/wake proxy
  const again = await call('/api/cfi?id=' + me.cfiId);
  assert.equal(again.status, 200);
  assert.equal(again.body.enrollment.status, 'done');
  const list = (await call('/api/entries?cfiId=' + me.cfiId)).body;
  assert.equal(list.length, 1); assert.equal(list[0].status, 'signed'); assert.equal(list[0].locked, true);
  assert.equal((await call('/api/config')).body.persistence.kind, 'file');
  // the endorse job survived and is still claimable by the worker
  const job = (await worker('/api/worker/claim')).body.job;
  assert.equal(job?.type, 'endorse');
  // signing again still works after restart (salt + credential restored)
  assert.equal((await signOne(again.body, pk)).status, 200);
  // and an existing passkey is recognised as a sign-in (no duplicate profile)
  const si = await restoreWith(pk);
  assert.equal(si.status, 200); assert.equal(si.body.cfiId, me.cfiId);
});

test('server wiped: "Use my existing passkey" restores an on-chain-enrolled CFI without re-registration, then signs', async () => {
  const chain = { cfiKeys: {}, revoked: {} };
  writeFileSync(FIXTURE, JSON.stringify(chain));
  await start({ persist: false });
  const pk = await createSoftPasskey();
  const me = await register(pk);
  await enrollOnFakeChain(me, chain);
  await start({ persist: false }); // memory wiped
  assert.equal((await call('/api/cfi?id=' + me.cfiId)).status, 404);
  // replayed / foreign challenge refused
  const o = await call('/api/restore/options', {});
  const a = await pk.get(fromB64url(o.body.publicKey.challenge), { flags: 0x1d });
  const fin = { credentialId: credIdOf.get(pk), authenticatorData: b64url(a.authenticatorData), clientDataJSON: b64url(a.clientDataJSON), signature: b64url(a.signature) };
  // UV required
  const noUv = await restoreWith(pk, { flags: 0x01 });
  assert.equal(noUv.status, 400);
  const ok = await call('/api/restore/finish', fin);
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  assert.equal(ok.body.keyId, me.keyId, 'recovered the same key that is enrolled on-chain');
  assert.equal(ok.body.enrollment.status, 'done');
  assert.equal(ok.body.restored, true);
  assert.equal(ok.body.passkey.kind, 'synced (backup-eligible)');
  assert.equal((await call('/api/restore/finish', fin)).status, 400, 'restore challenge is single-use');
  const signed = await signOne(ok.body, pk);
  assert.equal(signed.status, 200, JSON.stringify(signed.body));
  assert.equal(signed.body.signature.keyId, me.keyId);
  const job = (await worker('/api/worker/claim')).body.job;
  assert.equal(job.type, 'endorse'); assert.equal(job.payload.keyId, me.keyId);
});

test('restore refuses keys not enrolled on-chain, revoked keys and other schools', async () => {
  const pkNone = await createSoftPasskey(), pkRev = await createSoftPasskey(), pkOther = await createSoftPasskey();
  const kid = (pk) => toHex(keyIdOf(coseKeyToPoint(pk.cose)));
  writeFileSync(FIXTURE, JSON.stringify({ cfiKeys: { [kid(pkRev)]: { cfiRef: '11'.repeat(32), schoolId: SCHOOL }, [kid(pkOther)]: { cfiRef: '11'.repeat(32), schoolId: 'ee'.repeat(32) } }, revoked: { [kid(pkRev)]: '3' } }));
  await start({ persist: false });
  assert.equal((await restoreWith(pkNone)).status, 404);
  assert.equal((await restoreWith(pkRev)).status, 403);
  assert.equal((await restoreWith(pkOther)).status, 403);
  assert.equal((await restoreWith(pkOther, { name: 'Jane Pilot' })).status, 403);
});
