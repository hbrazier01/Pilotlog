// Revocation reasons, disputes and credential facts (pure helpers). PROTOTYPE.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRevocation, makeDispute, signatureStanding, REVOCATION_REASONS } from '../src/revocation.mjs';
import { registrationFacts, assertionFacts, attestationSummary } from '../src/credential.mjs';
import { encodeCbor } from '../src/cbor.mjs';

const at = (s) => new Date(s);
const sig = (signedAt) => ({ signedAt });

test('revocation requires a known reason and records a UTC timestamp; notes are cleaned and capped', () => {
  assert.deepEqual(Object.keys(REVOCATION_REASONS), ['left-school', 'credential-compromised']);
  assert.throws(() => makeRevocation({ reason: 'whatever' }), /reason must be one of/);
  assert.throws(() => makeRevocation({ reason: 'disputed-signature' }), /reason must be one of/, 'a dispute is not a revocation');
  const r = makeRevocation({ reason: 'left-school', note: 'moved\nschools' + 'x'.repeat(300), now: at('2026-11-17T20:00:00Z') });
  assert.equal(r.revokedAt, '2026-11-17T20:00:00.000Z');
  assert.equal(r.note.includes('\n'), false); assert.equal(r.note.length, 200);
  assert.throws(() => makeRevocation({ reason: 'left-school', suspectedFrom: '2026-11-17T19:00:00Z' }), /only applies/);
});

test('(i) left school: earlier signatures keep good standing, with a dated note', () => {
  const r = makeRevocation({ reason: 'left-school', now: at('2026-11-17T20:00:00Z') });
  const s = signatureStanding(sig('2026-11-17T18:00:00.000Z'), r);
  assert.equal(s.standing, 'good'); assert.match(s.notes[0], /left the school at 2026-11-17T20:00:00.000Z/);
});

test('(ii) compromised: signatures from the suspected time onwards need review; earlier ones keep standing', () => {
  assert.throws(() => makeRevocation({ reason: 'credential-compromised', suspectedFrom: '2026-11-18T00:00:00Z', now: at('2026-11-17T20:00:00Z') }), /not after/);
  const r = makeRevocation({ reason: 'credential-compromised', suspectedFrom: '2026-11-17T12:00:00Z', now: at('2026-11-17T20:00:00Z') });
  assert.equal(signatureStanding(sig('2026-11-17T13:00:00.000Z'), r).standing, 'review');
  const early = signatureStanding(sig('2026-11-17T11:00:00.000Z'), r);
  assert.equal(early.standing, 'good'); assert.match(early.notes[0], /reported compromised/);
  const dflt = makeRevocation({ reason: 'credential-compromised', now: at('2026-11-17T20:00:00Z') });
  assert.equal(dflt.suspectedFrom, dflt.revokedAt, 'defaults to the revocation time');
});

test('(iii) disputed signature: flagged disputed, CFI not revoked, history kept; unsigned entries have no standing', () => {
  const d = makeDispute({ note: 'student says lesson did not happen', now: at('2026-11-17T21:00:00Z') });
  const s = signatureStanding(sig('2026-11-17T18:00:00.000Z'), null, d);
  assert.equal(s.standing, 'disputed'); assert.match(s.notes[0], /disputed at 2026-11-17T21:00:00.000Z: student says/);
  assert.equal(signatureStanding(sig('2026-11-17T18:00:00.000Z'), null, { ...d, resolution: 'upheld' }).standing, 'good');
  assert.deepEqual(signatureStanding(null, null, d), { standing: null, notes: [] });
});

test('credential facts: ID, UV/BE/BS, attestation "none", AAGUID only if disclosed; nothing claims device identity', () => {
  const ad = new Uint8Array(37 + 16 + 2); ad[32] = 0x1d | 0x40; // UP UV BE BS AT, zero AAGUID
  const att = encodeCbor(new Map([['fmt', 'none'], ['attStmt', new Map()], ['authData', ad]]));
  const f = registrationFacts({ credentialId: 'cred-1', authenticatorData: ad, attestationObject: att, transports: ['internal', 'hybrid'] });
  assert.equal(f.credentialId, 'cred-1'); assert.equal(f.uv, true); assert.equal(f.backupEligible, true); assert.equal(f.backedUp, true);
  assert.deepEqual(f.attestation, { format: 'none', statementPresent: false, verified: false });
  assert.equal(f.aaguidDisclosed, false); assert.match(f.kindAsReported, /as reported/);
  assert.deepEqual(registrationFacts({ credentialId: 'c', authenticatorData: ad }).attestation, { format: 'not provided', statementPresent: false, verified: false });
  const other = Uint8Array.from(ad); other[0] ^= 1;
  assert.throws(() => attestationSummary(att, other), /does not match/);
  assert.throws(() => attestationSummary(encodeCbor(new Map([['x', 1]])), ad), /malformed/);
  const a = new Uint8Array(37); a[32] = 0x05;
  assert.deepEqual(assertionFacts({ credentialId: 'c', authenticatorData: a }), { credentialId: 'c', up: true, uv: true, backupEligible: false, backedUp: false, kindAsReported: 'device-bound (as reported)' });
});
