// Off-chain verification of a SIGNED entry record: the readable entry + signature block + the stored WebAuthn
// assertion. This is the primary check (the chain is supplemental tamper evidence). Used by the staging app's
// status/verify endpoints and by tests. Prototype only.
//
// Record shape (what PilotLog stores per entry version):
//   { raw, entryHash, version, supersedes, studentCommit, contract,
//     signature?: { block, signatureBlockSalt, serverNonce, keyId, publicKeySpki, assertion: { authenticatorData, clientDataJSON, signature } } }
import { entryHash, endorseDigest, attestHash, signatureBlockCommit, normalizeSignatureBlock, keyIdOf } from './canonical.mjs';
import { assertionToCircuitArgs, spkiToPoint } from './webauthn.mjs';
import { toHex, fromHex, fromB64url } from './bytes.mjs';

/**
 * Status of one entry version:
 *   unsigned    no signature yet (editable)
 *   signed      signature verifies for exactly this content + version (locked)
 *   superseded  signature verifies for this (older) version; a newer version exists (the old signature stays valid
 *               for the old version only)
 *   invalid     content, version, nonce, signature block or assertion do not match (tampered / replayed / wrong version)
 */
export function verifyRecord(rec, { supersededBy = null } = {}) {
  if (!rec.signature) return { status: 'unsigned' };
  const bad = (reason) => ({ status: 'invalid', reason });
  const s = rec.signature;
  const eh = toHex(entryHash(rec.raw));
  if (eh !== rec.entryHash) return bad('entry content changed after signing (hash mismatch)');
  let block;
  try { block = normalizeSignatureBlock({ ...s.block, signedDate: s.block.signedDate, currencyDate: s.block.currencyDate }); } catch (e) { return bad(`signature block: ${e.message}`); }
  if (block.entryVersion !== rec.version) return bad(`signature is for version ${block.entryVersion}, record is version ${rec.version}`);
  if (block.supersedes !== (rec.supersedes ?? '')) return bad('signature names a different superseded entry');
  const point = spkiToPoint(fromB64url(s.publicKeySpki));
  if (toHex(keyIdOf(point)) !== s.keyId) return bad('key id mismatch');
  const att = attestHash(fromHex(s.serverNonce, 32), signatureBlockCommit(block, s.signatureBlockSalt));
  const digest = endorseDigest(fromHex(rec.contract, 32), fromHex(eh, 32), fromHex(rec.studentCommit, 32), att);
  try {
    assertionToCircuitArgs({ publicKey: point, authenticatorData: fromB64url(s.assertion.authenticatorData), clientDataJSON: fromB64url(s.assertion.clientDataJSON), signature: fromB64url(s.assertion.signature), digest });
  } catch (e) { return bad(`assertion does not cover this entry version / challenge: ${e.message}`); }
  return supersededBy ? { status: 'superseded', supersededBy } : { status: 'signed' };
}
