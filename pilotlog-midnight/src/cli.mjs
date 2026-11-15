#!/usr/bin/env node
// DEV-ONLY CLI for the isolated CFI-on-Midnight module. Refuses to run unless PILOTLOG_CFI_MIDNIGHT=1.
//   PILOTLOG_CFI_MIDNIGHT=1 node src/cli.mjs demo                 # simulator walk-through, synthetic data
//   PILOTLOG_CFI_MIDNIGHT=1 node src/cli.mjs entry-hash entry.json # canonical bytes + entryHash
//   PILOTLOG_CFI_MIDNIGHT=1 node src/cli.mjs classify <clientDataJSON as base64url>
import { readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { isEnabled, FLAG } from './flag.mjs';
import { canonicalEntryBytes, entryHash, studentCommit, cfiRef, endorseDigest, keyIdOf } from './canonical.mjs';
import { classifyClientData, assertionToCircuitArgs, coseKeyToPoint } from './webauthn.mjs';
import { toHex, fromB64url } from './bytes.mjs';

if (!isEnabled()) {
  console.error(`${FLAG} is not set to 1; CFI Midnight signing is disabled (default). Nothing was run.`);
  process.exit(2);
}
const [cmd, arg] = process.argv.slice(2);
const rnd = () => toHex(randomBytes(32));

if (cmd === 'entry-hash') {
  const entry = JSON.parse(readFileSync(arg, 'utf8'));
  console.log(JSON.stringify({ canonical: new TextDecoder().decode(canonicalEntryBytes(entry)), entryHash: toHex(entryHash(entry)) }, null, 2));
} else if (cmd === 'classify') {
  const { reason, profile, onChain, action } = classifyClientData(fromB64url(arg));
  console.log(JSON.stringify({ profile, onChain, action, reason }, null, 2));
} else if (cmd === 'demo') {
  const { CfiEndorseSimulator } = await import('./simulator.mjs');
  const { createSoftPasskey } = await import('./softPasskey.mjs');
  const adminSecret = randomBytes(32);
  const sim = await CfiEndorseSimulator.create({ adminSecret });
  const pk = await createSoftPasskey();
  const point = coseKeyToPoint(pk.cose);
  const keyId = keyIdOf(point);
  await sim.enrollCfi(keyId, cfiRef('synthetic-cfi-1', rnd()));
  const entry = { entryId: 'synthetic-0001', entrySalt: rnd(), date: '2026-11-14', aircraftIdent: 'N123PL', aircraftType: 'DA40', from: 'KAPA', to: 'KAPA', totalTenths: 13, dualReceivedTenths: 13, landingsDay: 3, remarks: 'Synthetic: pattern work' };
  const eh = entryHash(entry), sc = studentCommit('synthetic-student-1', rnd());
  const digest = endorseDigest(sim.addressBytes, eh, sc);
  const a = assertionToCircuitArgs({ publicKey: { cose: pk.cose }, ...(await pk.get(digest)), digest });
  await sim.endorseEntry(eh, sc, a);
  const steps = { enrolled: true, endorsed: true };
  try { await sim.endorseEntry(eh, sc, a); steps.duplicate = 'ACCEPTED (bug)'; } catch (e) { steps.duplicate = `rejected: ${e.message.split('\n')[0]}`; }
  await sim.revokeCfi(keyId);
  const e2 = { ...entry, entryId: 'synthetic-0002', entrySalt: rnd() }; const eh2 = entryHash(e2);
  const d2 = endorseDigest(sim.addressBytes, eh2, sc);
  try { await sim.endorseEntry(eh2, sc, assertionToCircuitArgs({ publicKey: { cose: pk.cose }, ...(await pk.get(d2)), digest: d2 })); steps.afterRevoke = 'ACCEPTED (bug)'; } catch (e) { steps.afterRevoke = `rejected: ${e.message.split('\n')[0]}`; }
  const L = sim.ledger;
  console.log(JSON.stringify({ steps, ledger: { cfiKeys: String(L.cfiKeys.size()), revoked: String(L.revokedAtSeq.size()), endorsements: String(L.endorsements.size()), seq: String(L.seq) } }, null, 2));
} else {
  console.error('usage: cli.mjs demo | entry-hash <entry.json> | classify <clientDataJSON-b64url>');
  process.exit(1);
}
