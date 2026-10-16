import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import * as L from '@midnight-ntwrk/ledger-v8';
import { UnshieldedAddress } from '@midnight-ntwrk/wallet-sdk-address-format';
import {
  studentIdFor, isValidStudentId, looksLikeWalletAddress, decodeUnshieldedAddress, signedMessageBytes,
  verifyWalletSignature, getProvider,
} from '../pilotlog-cli/src/lib/accounts/identity.mjs';
import { encodeSession, decodeSession, createNonceStore, parseCookies, sessionCookie } from '../pilotlog-cli/src/lib/accounts/session.mjs';
import { createStudentStore } from '../pilotlog-cli/src/lib/accounts/studentStore.mjs';
import { createStudentData, sanitizeRadioAttempt } from '../pilotlog-cli/src/lib/accounts/studentData.mjs';
import { migrateLegacyData } from '../pilotlog-cli/src/lib/accounts/legacyMigration.mjs';
import { registerAuthRoutes, attachStudent, requireStudent, sameOriginWrites, shortAddress } from '../pilotlog-cli/src/lib/accounts/authRoutes.mjs';
import { registerCockpitRoutes } from '../pilotlog-cli/src/cockpitRoutes.mjs';
import { registerCheckrideRoutes } from '../pilotlog-cli/src/checkrideRoutes.mjs';
import { renderNav, renderAccountChip } from '../pilotlog-cli/src/lib/cockpit/chrome.mjs';

process.env.NODE_ENV = 'test';
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'pl-acct-'));
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** A test wallet that behaves like the DApp connector's signData (prefix + schnorr). */
function testWallet() {
  const sk = L.sampleSigningKey();
  const vk = L.signatureVerifyingKey(sk);
  const address = UnshieldedAddress.codec.encode('preprod', new UnshieldedAddress(Buffer.from(L.addressFromKey(vk), 'hex'))).asString();
  return { address, vk, signData: (message) => ({ data: message, signature: L.signData(sk, signedMessageBytes(message)), verifyingKey: vk }) };
}

test('identity: studentId is stable, hashed, and path-safe', () => {
  const w = testWallet();
  assert.equal(studentIdFor(w.address), studentIdFor(w.address));
  assert.ok(isValidStudentId(studentIdFor(w.address)));
  for (const bad of ['../x', 'st_../../etc', 'st_ABC', '', null, 'st_' + 'a'.repeat(25)]) assert.equal(isValidStudentId(bad), false);
  assert.ok(looksLikeWalletAddress(w.address));
  assert.equal(looksLikeWalletAddress('mn_shield-cpk_preprod1abc'), false);
  assert.equal(looksLikeWalletAddress(w.address.replace('preprod', 'mainnet')), false);
});

test('identity: wallet signature verifies only for the right message, key and address', async () => {
  const a = testWallet(), b = testWallet();
  const msg = 'PilotLog sign-in\nNonce: abc';
  assert.equal(await verifyWalletSignature({ address: a.address, message: msg, signature: a.signData(msg) }), true);
  await assert.rejects(verifyWalletSignature({ address: a.address, message: msg + 'x', signature: a.signData(msg) }), /does not verify/);
  await assert.rejects(verifyWalletSignature({ address: a.address, message: msg, signature: b.signData(msg) }), /does not belong/);
  await assert.rejects(verifyWalletSignature({ address: a.address, message: msg, signature: { ...a.signData(msg), scheme: 'ecdsa' } }), /scheme/);
  await assert.rejects(verifyWalletSignature({ address: a.address, message: msg, signature: { signature: 'zz', verifyingKey: a.vk } }), /hex/);
  await assert.rejects(decodeUnshieldedAddress(a.address.slice(0, -1) + (a.address.endsWith('q') ? 'p' : 'q')));
  assert.throws(() => getProvider('midnight-passport'), /not available yet/);
});

test('session: signed cookie round-trips; tampering, wrong secret and expiry are rejected', () => {
  const secret = 'x'.repeat(40);
  const sid = studentIdFor('mn_addr_preprod1test');
  const tok = encodeSession({ sid, wa: 'mn_addr_preprod1test', prov: 'midnight-1am', ver: true }, { secret });
  assert.equal(decodeSession(tok, { secret }).sid, sid);
  const [d, s] = tok.split('.');
  const forged = Buffer.from(JSON.stringify({ v: 1, sid: studentIdFor('other'), wa: 'other', exp: 9e9 })).toString('base64url');
  assert.equal(decodeSession(`${forged}.${s}`, { secret }), null);
  assert.equal(decodeSession(`${d}.${s.slice(0, -2)}aa`, { secret }), null);
  assert.equal(decodeSession(tok, { secret: 'y'.repeat(40) }), null);
  assert.equal(decodeSession(tok, { secret, now: Date.now() + 31 * 864e5 }), null);
  assert.deepEqual(parseCookies('a=1; pl_session=abc.def'), { a: '1', pl_session: 'abc.def' });
  const c = sessionCookie('t', { secure: false, get: () => 'http' });
  assert.match(c, /HttpOnly/); assert.match(c, /SameSite=Lax/);
});

test('nonce store: single use and expires', () => {
  const n = createNonceStore({ ttlMs: 1000 });
  const a = n.issue({ address: 'x' }, 0);
  assert.equal(n.take(a, 10).address, 'x');
  assert.equal(n.take(a, 10), null);
  const b = n.issue({ address: 'y' }, 0);
  assert.equal(n.take(b, 5000), null);
});

test('student store (file): isolated per student, rejects bad ids/kinds, usage ledger + cap', async () => {
  const dir = tmp();
  const store = createStudentStore({ dataDir: dir });
  const A = studentIdFor('a'), B = studentIdFor('b');
  await store.put(A, 'settings', { homeAirport: 'KAPA' });
  assert.deepEqual(await store.get(A, 'settings'), { homeAirport: 'KAPA' });
  assert.equal(await store.get(B, 'settings'), null);
  assert.ok(fs.existsSync(path.join(dir, 'students', A, 'settings.json')));
  await assert.rejects(store.get('../../etc', 'settings'), /invalid student id/);
  await assert.rejects(store.put(A, '../passwd', {}), /unknown doc kind/);
  await store.recordUsage(A, { inputTokens: 1000, outputTokens: 200, usd: 0.6 }, new Date('2026-10-05'));
  const u = await store.recordUsage(A, { inputTokens: 10, outputTokens: 5, usd: 0.5 }, new Date('2026-10-20'));
  assert.equal(u.requests, 2);
  const s = await store.usage(A, { month: '2026-10', capUsd: 1 });
  assert.equal(s.inputTokens, 1010); assert.ok(Math.abs(s.usd - 1.1) < 1e-9); assert.equal(s.overCap, true); assert.equal(s.remainingUsd, 0);
  assert.equal((await store.usage(B, { month: '2026-10' })).usd, 0);
  await assert.rejects(store.recordUsage(A, { usd: -1 }), /invalid/);
});

test('student store (pg): every query is parameterised by student_id', async () => {
  const calls = [];
  const pool = { query: async (sql, params) => { calls.push({ sql, params }); return { rows: sql.startsWith('SELECT doc') ? [{ doc: { ok: 1 } }] : [{ input_tokens: 1, output_tokens: 2, usd_micros: 3, requests: 1 }] }; } };
  const store = createStudentStore({ pool });
  const A = studentIdFor('a');
  await store.ensureStudent(A, { walletAddress: 'a', provider: 'midnight-1am' });
  await store.put(A, 'tracks', { x: 1 });
  assert.deepEqual(await store.get(A, 'tracks'), { ok: 1 });
  await store.recordUsage(A, { inputTokens: 1 });
  assert.equal(store.backend, 'pg');
  for (const c of calls) { assert.equal(c.params[0], A); assert.doesNotMatch(c.sql, /\$\{/); }
});

test('legacy migration: owner only, copies missing kinds, idempotent, never overwrites or deletes', async () => {
  const dir = tmp();
  fs.writeFileSync(path.join(dir, 'settings.json'), JSON.stringify({ homeAirport: 'KAPA', aircraftType: 'da40' }));
  fs.writeFileSync(path.join(dir, 'checkride.json'), JSON.stringify({ testDate: '2026-12-01' }));
  fs.writeFileSync(path.join(dir, 'tracks.json'), JSON.stringify({ e1: { id: 't1' } }));
  fs.writeFileSync(path.join(dir, 'entries.json'), '[]');
  const store = createStudentStore({ dataDir: dir });
  const owner = 'mn_addr_preprod1owner', sid = studentIdFor(owner);
  assert.equal((await migrateLegacyData({ dataDir: dir, store, studentId: studentIdFor('x'), walletAddress: 'x', ownerWallet: owner })).ran, false);
  assert.equal((await migrateLegacyData({ dataDir: dir, store, studentId: sid, walletAddress: owner, ownerWallet: null })).ran, false);
  await store.put(sid, 'tracks', { mine: { id: 'keep' } });
  const r = await migrateLegacyData({ dataDir: dir, store, studentId: sid, walletAddress: owner, ownerWallet: owner });
  assert.deepEqual(r.copied.sort(), ['checkride', 'settings']);
  assert.deepEqual(await store.get(sid, 'tracks'), { mine: { id: 'keep' } });
  assert.equal((await store.get(sid, 'settings')).homeAirport, 'KAPA');
  assert.equal((await migrateLegacyData({ dataDir: dir, store, studentId: sid, walletAddress: owner, ownerWallet: owner })).reason, 'already migrated');
  for (const f of ['settings.json', 'checkride.json', 'tracks.json', 'entries.json']) assert.ok(fs.existsSync(path.join(dir, f)), f);
});

test('radio attempt validation', () => {
  assert.equal(sanitizeRadioAttempt({ scenario: 'ground_taxi', score: 87.4, airport: 'kapa' }, ['ground_taxi']).score, 87);
  assert.throws(() => sanitizeRadioAttempt({ scenario: '<script>', score: 1 }), /scenario/);
  assert.throws(() => sanitizeRadioAttempt({ scenario: 'zzz', score: 1 }, ['ground_taxi']), /unknown/);
  assert.throws(() => sanitizeRadioAttempt({ scenario: 'ground_taxi', score: 101 }), /score/);
});

test('nav chip: connect / short address + sign out / none on legacy pages', () => {
  assert.equal(renderAccountChip(esc, undefined), '');
  assert.match(renderAccountChip(esc, { signedIn: false }), /Connect wallet/);
  const on = renderAccountChip(esc, { signedIn: true, verified: true, shortAddress: 'mn_addr_prepr…abcd' });
  assert.match(on, /mn_addr_prepr…abcd/); assert.match(on, /Sign out/);
  assert.match(renderNav(esc, { active: 'dashboard', demo: true, user: { name: 'X', initials: 'X', account: { signedIn: false } } }), /SAMPLE<\/b> data/);
  assert.doesNotMatch(renderNav(esc, { active: 'dashboard', demo: true }), /acct/);
  assert.equal(shortAddress('mn_addr_preprod1abcdefghijklmnop'), 'abcde…lmnop');
});

// ── HTTP: real sign-in flow, per-student authorization ─────────────────────────
async function startApp(dir) {
  const app = express();
  app.use(express.json({ limit: '6mb' }));
  const store = createStudentStore({ dataDir: dir });
  const data = createStudentData(store);
  app.use(attachStudent());
  app.use(['/api/auth', '/api/cockpit', '/api/checkride'], sameOriginWrites());
  registerAuthRoutes(app, { store, dataDir: dir });
  registerCheckrideRoutes(app, { escapeHtml: esc, data, requireStudent });
  registerCockpitRoutes(app, { dataDir: dir, escapeHtml: esc, data, requireStudent });
  const server = await new Promise((r) => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (method, url, { body, cookie, headers = {} } = {}) => {
    const r = await fetch(base + url, { method, headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}), ...headers }, body: body ? JSON.stringify(body) : undefined });
    const text = await r.text();
    let json = null; try { json = JSON.parse(text); } catch { /* html */ }
    return { status: r.status, json, setCookie: r.headers.get('set-cookie') };
  };
  const signIn = async (w) => {
    const ch = await call('POST', '/api/auth/challenge', { body: { address: w.address } });
    assert.equal(ch.status, 200);
    const v = await call('POST', '/api/auth/verify', { body: { address: w.address, nonce: ch.json.nonce, signature: w.signData(ch.json.message) } });
    assert.equal(v.status, 200, JSON.stringify(v.json));
    return { cookie: v.setCookie.split(';')[0], ch, student: v.json.student };
  };
  return { server, call, signIn, store, store_dir: dir };
}

test('HTTP: student A cannot read or write student B; signed out is SAMPLE + read-only', async () => {
  const dir = tmp();
  const { server, call, signIn } = await startApp(dir);
  try {
    const A = testWallet(), B = testWallet();
    const a = await signIn(A), b = await signIn(B);
    assert.notEqual(a.student.id, b.student.id);
    assert.equal(a.student.verified, true);

    // signed out: sample data, writes refused
    const so = await call('GET', '/api/cockpit/settings');
    assert.equal(so.json.demo, true); assert.equal(so.json.settings.sample, true);
    assert.equal((await call('PUT', '/api/cockpit/settings', { body: { homeAirport: 'KBJC' } })).status, 401);
    assert.equal((await call('POST', '/api/cockpit/entries', { body: { date: '2026-10-01', totalTime: 1 } })).status, 401);
    assert.equal((await call('GET', '/api/cockpit/usage')).status, 401);
    assert.equal((await call('GET', '/api/checkride')).json.demo, true);

    // A writes
    assert.equal((await call('PUT', '/api/cockpit/settings', { cookie: a.cookie, body: { homeAirport: 'KAPA', aircraftType: 'da40' } })).status, 200);
    const e = await call('POST', '/api/cockpit/entries', { cookie: a.cookie, body: { date: '2026-10-01', totalTime: 1.3, from: 'KAPA' } });
    assert.equal(e.status, 201);
    const gpx = '<gpx><trk><trkseg>' + Array.from({ length: 30 }, (_, i) => `<trkpt lat="39.57${i}" lon="-104.84${i}"><ele>${1800 + i * 5}</ele><time>2026-10-01T15:${String(i).padStart(2, '0')}:00Z</time></trkpt>`).join('') + '</trkseg></trk></gpx>';
    assert.equal((await call('POST', `/api/cockpit/tracks/${e.json.id}`, { cookie: a.cookie, body: { text: gpx, filename: 'a.gpx' } })).status, 201);
    assert.equal((await call('PUT', '/api/checkride/test-date', { cookie: a.cookie, body: { testDate: '2026-12-15' } })).status, 200);
    assert.equal((await call('POST', '/api/cockpit/radio/attempts', { cookie: a.cookie, body: { scenario: 'ground_taxi', score: 90 } })).status, 201);

    // B sees none of it
    assert.equal((await call('GET', '/api/cockpit/settings', { cookie: b.cookie })).json.settings.homeAirport, '');
    assert.deepEqual((await call('GET', '/api/cockpit/entries', { cookie: b.cookie })).json.entries, []);
    assert.equal((await call('GET', `/api/cockpit/tracks/${e.json.id}`, { cookie: b.cookie })).status, 404);
    assert.equal((await call('GET', '/api/checkride', { cookie: b.cookie })).json.testDate ?? null, null);
    assert.deepEqual((await call('GET', '/api/cockpit/radio/attempts', { cookie: b.cookie })).json.attempts, []);
    // ...and cannot modify A's records by id
    assert.equal((await call('PUT', `/api/cockpit/entries/${e.json.id}`, { cookie: b.cookie, body: { totalTime: 9 } })).status, 404);
    assert.equal((await call('DELETE', `/api/cockpit/entries/${e.json.id}`, { cookie: b.cookie })).status, 404);
    assert.equal((await call('PUT', `/api/checkride/flights/${e.json.id}`, { cookie: b.cookie, body: { xcDistanceNm: 60 } })).status, 400);

    // A still sees own data
    assert.equal((await call('GET', '/api/cockpit/settings', { cookie: a.cookie })).json.settings.homeAirport, 'KAPA');
    assert.equal((await call('GET', '/api/cockpit/entries', { cookie: a.cookie })).json.entries.length, 1);
    assert.equal((await call('GET', `/api/cockpit/tracks/${e.json.id}`, { cookie: a.cookie })).status, 200);
    assert.equal((await call('GET', '/api/checkride', { cookie: a.cookie })).json.testDate, '2026-12-15');
    assert.equal((await call('GET', '/api/cockpit/usage', { cookie: a.cookie })).json.usd, 0);

    // validation still applies when signed in
    assert.equal((await call('PUT', '/api/cockpit/settings', { cookie: a.cookie, body: { scheduling: { provider: 'other', url: 'javascript:alert(1)' } } })).status, 400);
    assert.equal((await call('POST', '/api/cockpit/entries', { cookie: a.cookie, body: { date: 'nope', totalTime: 1 } })).status, 400);
    assert.equal((await call('POST', '/api/cockpit/tracks/..%2F..%2Fx', { cookie: a.cookie, body: { text: gpx } })).status, 400);

    // files really are separate on disk
    assert.ok(fs.existsSync(path.join(dir, 'students', a.student.id, 'entries.json')));
    assert.equal(fs.existsSync(path.join(dir, 'students', b.student.id, 'entries.json')), false);
    assert.equal(fs.existsSync(path.join(dir, 'settings.json')), false, 'no shared settings.json written');
  } finally { server.close(); }
});

test('HTTP: sign-in rejects replayed nonce, wrong key, forged cookie, cross-origin writes, unverified fallback off', async () => {
  const { server, call, signIn } = await startApp(tmp());
  try {
    const A = testWallet(), B = testWallet();
    const ch = await call('POST', '/api/auth/challenge', { body: { address: A.address } });
    // B's key signing A's challenge
    assert.equal((await call('POST', '/api/auth/verify', { body: { address: A.address, nonce: ch.json.nonce, signature: B.signData(ch.json.message) } })).status, 401);
    // nonce was consumed by the failed attempt
    assert.equal((await call('POST', '/api/auth/verify', { body: { address: A.address, nonce: ch.json.nonce, signature: A.signData(ch.json.message) } })).status, 400);
    // challenge for A, claim B
    const ch2 = await call('POST', '/api/auth/challenge', { body: { address: A.address } });
    assert.equal((await call('POST', '/api/auth/verify', { body: { address: B.address, nonce: ch2.json.nonce, signature: B.signData(ch2.json.message) } })).status, 400);
    assert.equal((await call('POST', '/api/auth/challenge', { body: { address: 'mn_shield-cpk_preprod1zz' } })).status, 400);
    // unverified fallback disabled by default
    assert.equal((await call('POST', '/api/auth/connect', { body: { address: A.address } })).status, 403);
    // forged cookie
    const forged = 'pl_session=' + Buffer.from(JSON.stringify({ v: 1, sid: studentIdFor(A.address), wa: A.address, exp: 9e9 })).toString('base64url') + '.AAAA';
    assert.equal((await call('GET', '/api/auth/session', { cookie: forged })).json.signedIn, false);
    // cross-origin write blocked even with a valid session
    const a = await signIn(A);
    assert.equal((await call('PUT', '/api/cockpit/settings', { cookie: a.cookie, headers: { origin: 'https://evil.example' }, body: { homeAirport: 'KBJC' } })).status, 403);
    assert.equal((await call('GET', '/api/auth/session', { cookie: a.cookie })).json.student.walletAddress, A.address);
    const out = await call('POST', '/api/auth/signout', { cookie: a.cookie });
    assert.match(out.setCookie, /Max-Age=0/);
  } finally { server.close(); }
});
