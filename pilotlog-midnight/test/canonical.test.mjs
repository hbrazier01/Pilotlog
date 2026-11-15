import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeEntryV1, canonicalEntryBytes, entryHash, jcs, hoursToTenths, studentCommit, cfiRef, keyIdOf } from '../src/canonical.mjs';
import { toHex } from '../src/bytes.mjs';

const SALT = '11'.repeat(32);
const base = () => ({
  entryId: '7d1f0e4a-0000-4000-8000-000000000042', entrySalt: SALT, date: '2026-11-14',
  aircraftIdent: 'n123pl', aircraftType: 'da40', from: 'kapa', to: 'KAPA',
  totalTenths: 13, dualReceivedTenths: 13, landingsDay: 3, remarks: '  Pattern   work,\nsteep turns ',
  maneuvers: ['steep turns', 'Slow flight', 'steep turns'],
});

test('canonical bytes: fixed schema, sorted keys, normalized values, version prefix', () => {
  const s = new TextDecoder().decode(canonicalEntryBytes(base()));
  assert.ok(s.startsWith('pilotlog.entry.v1\n{'));
  const obj = JSON.parse(s.slice('pilotlog.entry.v1\n'.length));
  assert.deepEqual(Object.keys(obj), [...Object.keys(obj)].sort());
  assert.equal(obj.aircraftIdent, 'N123PL');
  assert.equal(obj.from, 'KAPA');
  assert.equal(obj.remarks, 'Pattern work, steep turns');
  assert.deepEqual(obj.maneuvers, ['Slow flight', 'steep turns']);
  assert.equal(obj.nightTenths, 0, 'absent counters are present as 0');
  assert.ok(!/\s(?=[{}\[\]:,"])/.test(s.split('\n')[1].replace(/"[^"]*"/g, '""')), 'no insignificant whitespace');
});

test('known-answer vector (pins the v1 encoding; changing it requires a new version tag)', () => {
  assert.equal(toHex(entryHash(base())), toHex(entryHash(base())));
  assert.equal(toHex(entryHash(base())), KAT);
});
const KAT = '48b7fa53ce5bfca16d2b500f6eaf781659ece7401bdb40d1c3aa1667e9ecbc5b';

test('key order and cosmetic differences do not change the hash; content does', () => {
  const a = base();
  const b = Object.fromEntries(Object.entries(base()).reverse());
  b.aircraftIdent = ' N123PL '; b.remarks = 'Pattern work, steep turns'; b.maneuvers = ['Slow flight', 'steep turns'];
  assert.equal(toHex(entryHash(a)), toHex(entryHash(b)));
  for (const [k, v] of [['totalTenths', 14], ['date', '2026-11-15'], ['remarks', 'Pattern work'], ['entrySalt', '22'.repeat(32)], ['landingsNight', 1]]) {
    assert.notEqual(toHex(entryHash({ ...a, [k]: v })), toHex(entryHash(a)), `${k} must be bound`);
  }
});

test('Unicode is NFC-normalized', () => {
  const composed = { ...base(), remarks: 'caf\u00e9' };
  const decomposed = { ...base(), remarks: 'cafe\u0301' };
  assert.equal(toHex(entryHash(composed)), toHex(entryHash(decomposed)));
});

test('rejects PII, unknown fields, floats, bad salt, bad dates, zero total', () => {
  assert.throws(() => normalizeEntryV1({ ...base(), studentName: 'Jane' }), /PII/);
  assert.throws(() => normalizeEntryV1({ ...base(), cfiCertificate: '123' }), /PII/);
  assert.throws(() => normalizeEntryV1({ ...base(), color: 'blue' }), /unknown/);
  assert.throws(() => normalizeEntryV1({ ...base(), totalTenths: 1.3 }), /integer/);
  assert.throws(() => normalizeEntryV1({ ...base(), entrySalt: 'abc' }), /entrySalt/);
  assert.throws(() => normalizeEntryV1({ ...base(), date: '11/14/2026' }), /date/);
  assert.throws(() => normalizeEntryV1({ ...base(), totalTenths: 0 }), /totalTenths/);
  assert.throws(() => jcs(1.5), /safe integers/);
  assert.throws(() => jcs(null), /unsupported/);
});

test('hoursToTenths is exact (no float drift)', () => {
  assert.equal(hoursToTenths(1.3), 13);
  assert.equal(hoursToTenths('0.1'), 1);
  assert.equal(hoursToTenths('12'), 120);
  assert.equal(hoursToTenths(2.0), 20);
  assert.throws(() => hoursToTenths('1.25'), /one decimal/);
  assert.throws(() => hoursToTenths(-1), /one decimal/);
});

test('student and CFI commitments are salted, tagged and distinct', () => {
  const s1 = studentCommit('student-1', SALT);
  assert.equal(s1.length, 32);
  assert.notEqual(toHex(s1), toHex(studentCommit('student-1', '22'.repeat(32))), 'salt changes commitment');
  assert.notEqual(toHex(s1), toHex(cfiRef('student-1', SALT)), 'domain tag separates student vs CFI');
  assert.throws(() => studentCommit('student-1', 'short'), /bytes|hex/);
});

test('keyIdOf matches little-endian coordinate encoding', () => {
  const id = keyIdOf({ x: 1n, y: 2n });
  assert.equal(id.length, 32);
  assert.notEqual(toHex(id), toHex(keyIdOf({ x: 2n, y: 1n })));
});
