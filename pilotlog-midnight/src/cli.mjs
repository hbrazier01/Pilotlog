#!/usr/bin/env node
// DEV-ONLY CLI for the isolated CFI-on-Midnight module. Refuses to run unless PILOTLOG_CFI_MIDNIGHT=1.
//   PILOTLOG_CFI_MIDNIGHT=1 node src/cli.mjs demo                 # simulator walk-through, synthetic data
//   PILOTLOG_CFI_MIDNIGHT=1 node src/cli.mjs entry-hash entry.json # canonical bytes + entryHash
//   PILOTLOG_CFI_MIDNIGHT=1 node src/cli.mjs classify <clientDataJSON as base64url>
//   PILOTLOG_CFI_MIDNIGHT=1 node src/cli.mjs root-digest <op> <contract> <a> [b] [out.bin]   # offline key ceremony
//   PILOTLOG_CFI_MIDNIGHT=1 node src/cli.mjs root-verify <root-public.pem> <digest.bin> <sig.der>
import { readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { isEnabled, FLAG } from './flag.mjs';
import { canonicalEntryBytes, entryHash, studentCommit, cfiRef, schoolRef, endorseDigest, schoolDigest, rootDigest, keyIdOf, attestHash, signatureBlockCommit, signatureBlockLine, ROOT_OPS, SCHOOL_OPS, ZERO32 } from './canonical.mjs';
import { classifyClientData, assertionToCircuitArgs, coseKeyToPoint } from './webauthn.mjs';
import { toHex, fromHex, fromB64url } from './bytes.mjs';

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
  const { createSyntheticRootKey, synthRootArgs } = await import('./rootKey.mjs');
  const root = createSyntheticRootKey(); // SYNTHETIC
  const sim = await CfiEndorseSimulator.create({ rootKeyId: root.keyId });
  const holder = async () => { const pk = await createSoftPasskey(); const point = coseKeyToPoint(pk.cose); return { pk, keyId: keyIdOf(point) }; };
  const asrt = async (h, d) => assertionToCircuitArgs({ publicKey: { cose: h.pk.cose }, ...(await h.pk.get(d)), digest: d });
  const admin = await holder(), cfi = await holder();
  const school = schoolRef('synthetic-school-1', rnd());
  await sim.rootOnboardSchool(school, admin.keyId, synthRootArgs(root, sim.addressBytes, ROOT_OPS.onboardSchool, school, admin.keyId));
  const ref = cfiRef('synthetic-cfi-1', rnd());
  await sim.schoolEnrollCfi(school, cfi.keyId, ref, await asrt(admin, schoolDigest(sim.addressBytes, SCHOOL_OPS.enrollCfi, school, cfi.keyId, ref)));
  const entry = { entryId: 'synthetic-0001', entrySalt: rnd(), date: '2026-11-17', aircraftIdent: 'N123PL', aircraftType: 'DA40', from: 'KAPA', to: 'KAPA', totalTenths: 13, dualReceivedTenths: 13, landingsDay: 3, remarks: 'Synthetic: pattern work' };
  const block = { cfiName: 'Synthetic Instructor', certificateNumber: '1234567', currencyKind: 'RE', currencyDate: '2027-01-31', signedDate: '2026-11-17' };
  const eh = entryHash(entry), sc = studentCommit('synthetic-student-1', rnd());
  const att = attestHash(randomBytes(32), signatureBlockCommit(block, rnd()));
  const a = await asrt(cfi, endorseDigest(sim.addressBytes, eh, sc, att));
  await sim.endorseEntry(eh, sc, att, a);
  const steps = { schoolOnboarded: true, cfiEnrolled: true, endorsed: true, signatureBlock: signatureBlockLine(block) };
  try { await sim.endorseEntry(eh, sc, att, a); steps.duplicate = 'ACCEPTED (bug)'; } catch (e) { steps.duplicate = `rejected: ${e.message.split('\n')[0]}`; }
  await sim.rootRevokeSchool(school, synthRootArgs(root, sim.addressBytes, ROOT_OPS.revokeSchool, school, ZERO32));
  const e2 = { ...entry, entryId: 'synthetic-0002', entrySalt: rnd() }; const eh2 = entryHash(e2);
  try { await sim.endorseEntry(eh2, sc, att, await asrt(cfi, endorseDigest(sim.addressBytes, eh2, sc, att))); steps.afterSchoolRevoke = 'ACCEPTED (bug)'; } catch (e) { steps.afterSchoolRevoke = `rejected: ${e.message.split('\n')[0]}`; }
  const L = sim.ledger;
  console.log(JSON.stringify({ steps, ledger: { schools: String(L.schools.size()), cfiKeys: String(L.cfiKeys.size()), endorsements: String(L.endorsements.size()), seq: String(L.seq) } }, null, 2));
} else if (cmd === 'root-digest') {
  // OFFLINE ceremony helper: compute the 32 bytes the root key signs. Never needs a private key.
  //   root-digest <onboardSchool|revokeSchool|setSchoolAdmin|addRootKey|removeRootKey> <contractAddrHex> <aHex> [bHex] [out.bin]
  const [op, addr, a, b = '00'.repeat(32), out = 'digest.bin'] = process.argv.slice(3);
  if (!ROOT_OPS[op]) throw new Error(`unknown root op ${op}; one of ${Object.keys(ROOT_OPS).join(', ')}`);
  const d = rootDigest(fromHex(addr, 32), ROOT_OPS[op], fromHex(a, 32), fromHex(b, 32));
  writeFileSync(out, d);
  console.log(JSON.stringify({ op, contract: addr, a, b, digest: toHex(d), wrote: out, sign: `openssl dgst -sha256 -sign root.pem -out sig.der ${out}` }, null, 2));
} else if (cmd === 'root-verify') {
  //   root-verify <root-public.pem> <digest.bin> <sig.der>   -> keyId + pre-flight; what the relayer will submit
  const { rootPublicKey, rootSignatureArgs } = await import('./rootKey.mjs');
  const [pem, dg, sig] = process.argv.slice(3);
  const { point, keyId } = rootPublicKey(readFileSync(pem));
  rootSignatureArgs({ point, digest: new Uint8Array(readFileSync(dg)), signatureDer: new Uint8Array(readFileSync(sig)) });
  console.log(JSON.stringify({ rootKeyId: toHex(keyId), signature: 'valid for this digest' }, null, 2));
} else {
  console.error('usage: cli.mjs demo | entry-hash <entry.json> | classify <clientDataJSON-b64url> | root-digest <op> <contract> <a> [b] [out] | root-verify <pub.pem> <digest.bin> <sig.der>');
  process.exit(1);
}
