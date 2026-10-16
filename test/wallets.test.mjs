import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import * as L from '@midnight-ntwrk/ledger-v8';
import { UnshieldedAddress } from '@midnight-ntwrk/wallet-sdk-address-format';
import { PROVIDERS, getProvider, studentIdFor, signedMessageBytes } from '../pilotlog-cli/src/lib/accounts/identity.mjs';
import { createStudentStore } from '../pilotlog-cli/src/lib/accounts/studentStore.mjs';
import { registerAuthRoutes, attachStudent } from '../pilotlog-cli/src/lib/accounts/authRoutes.mjs';
import { detectWallets, isSupportedApiVersion, SUPPORTED_WALLETS } from '../public/js/wallets.js';

process.env.NODE_ENV = 'test';
function keyPair() {
  const sk = L.sampleSigningKey();
  const vk = L.signatureVerifyingKey(sk);
  const address = UnshieldedAddress.codec.encode('preprod', new UnshieldedAddress(Buffer.from(L.addressFromKey(vk), 'hex'))).asString();
  return { address, vk, signData: (m) => ({ data: m, signature: L.signData(sk, signedMessageBytes(m)), verifyingKey: vk }) };
}
const fakeWallet = (rdns, name) => ({ rdns, name, icon: '', apiVersion: '4.0.1', connect: async () => ({}) });

test('discovery: Lace by rdns under a random UUID key, 1AM by fixed key; only detected wallets listed', () => {
  assert.deepEqual(detectWallets(undefined), []);
  assert.deepEqual(detectWallets({}), []);
  const both = detectWallets({ '6f1c2e0a-0b4e-4c5e-9f7b-1a2b3c4d5e6f': fakeWallet('io.lace.wallet', 'Lace'), '1am': fakeWallet('com.midnight.1am', '1AM') });
  assert.deepEqual(both.map((w) => w.provider), ['midnight-1am', 'midnight-lace']);
  assert.deepEqual(detectWallets({ x: fakeWallet('io.lace.wallet', 'Lace') }).map((w) => w.provider), ['midnight-lace']);
  assert.deepEqual(detectWallets({ mnLace: { connect: async () => ({}) } }).map((w) => w.provider), ['midnight-lace']); // legacy alias
  assert.deepEqual(detectWallets({ '1am': { connect: async () => ({}) } }).map((w) => w.provider), ['midnight-1am']);
  // unknown wallets and non-connectors are not offered
  assert.deepEqual(detectWallets({ u: fakeWallet('com.evil.wallet', 'Lace'), mnLace: { name: 'no connect' } }), []);
  // a wallet claiming a different name but Lace rdns is still labelled from our list, not its own name
  assert.equal(detectWallets({ u: fakeWallet('io.lace.wallet', '<img onerror=x>') })[0].label, 'Lace');
  assert.equal(isSupportedApiVersion('4.0.1'), true);
  assert.equal(isSupportedApiVersion('3.0.0'), false);
  assert.deepEqual(SUPPORTED_WALLETS.map((w) => w.provider).sort(), Object.values(PROVIDERS).filter((p) => p.kind === 'wallet').map((p) => p.id).sort());
});

test('providers: Lace is available and uses the same verification as 1AM', async () => {
  const lace = getProvider('midnight-lace');
  assert.equal(lace.verify, getProvider('midnight-1am').verify);
  const a = keyPair(), b = keyPair();
  const out = await lace.verify({ address: a.address, message: 'm', signature: a.signData('m') });
  assert.equal(out.studentId, studentIdFor(a.address));
  await assert.rejects(lace.verify({ address: a.address, message: 'm', signature: b.signData('m') }), /does not belong/);
  await assert.rejects(lace.verify({ address: a.address, message: 'm', signature: undefined }));
  assert.throws(() => getProvider('midnight-passport'), /not available yet/);
  assert.throws(() => getProvider('lace-unverified'), /unknown/);
});

test('HTTP: same address signs in via 1AM then Lace -> same student; Lace cannot bypass signing', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pl-wal-'));
  const app = express(); app.use(express.json()); app.use(attachStudent());
  registerAuthRoutes(app, { store: createStudentStore({ dataDir: dir }), dataDir: dir });
  const server = await new Promise((r) => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (url, body, cookie) => {
    const r = await fetch(base + url, { method: body ? 'POST' : 'GET', headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, body: body ? JSON.stringify(body) : undefined });
    return { status: r.status, json: await r.json(), cookie: (r.headers.get('set-cookie') || '').split(';')[0] };
  };
  try {
    const w = keyPair();
    const ids = [];
    for (const provider of ['midnight-1am', 'midnight-lace']) {
      const ch = await call('/api/auth/challenge', { address: w.address });
      const v = await call('/api/auth/verify', { address: w.address, nonce: ch.json.nonce, signature: w.signData(ch.json.message), provider });
      assert.equal(v.status, 200, JSON.stringify(v.json));
      const s = await call('/api/auth/session', null, v.cookie);
      assert.equal(s.json.student.provider, provider);
      assert.equal(s.json.student.verified, true);
      ids.push(s.json.student.id);
    }
    assert.equal(ids[0], ids[1]);
    assert.equal(ids[0], studentIdFor(w.address));
    // Lace with a bad signature is rejected
    const ch = await call('/api/auth/challenge', { address: w.address });
    assert.equal((await call('/api/auth/verify', { address: w.address, nonce: ch.json.nonce, signature: keyPair().signData(ch.json.message), provider: 'midnight-lace' })).status, 401);
    // unverified fallback stays off for Lace too
    delete process.env.ALLOW_UNVERIFIED_WALLET_LOGIN;
    assert.equal((await call('/api/auth/connect', { address: w.address, provider: 'midnight-lace' })).status, 403);
    // session lists Lace for the picker
    const s = await call('/api/auth/session');
    assert.ok(s.json.providers.some((p) => p.id === 'midnight-lace' && p.available && p.rdns.includes('io.lace.wallet')));
    assert.equal(s.json.unverifiedFallback, false);
  } finally { server.close(); }
});
