// Three different events, three different treatments (PROTOTYPE, off-chain in staging). Signature history is never
// deleted or rewritten: a revocation or dispute adds a dated record with a reason, and each existing signature gets a
// "standing" derived from that record. Cryptographic validity (src/record.mjs) is reported separately and unchanged.
//   (i)   left-school            : the CFI leaves; earlier signatures stay in good standing; new signing is blocked.
//   (ii)  credential-compromised : new signing is blocked; signatures from the suspected-compromise time onwards are
//                                  flagged "review" (not silently invalidated); earlier ones stay in good standing.
//   (iii) disputed-signature     : one entry's signature is challenged; the CFI is NOT revoked; that signature is
//                                  flagged "disputed" until resolved; the entry stays locked.

export const REVOCATION_REASONS = Object.freeze({
  'left-school': 'CFI left the school (administrative; no suspicion about past signatures)',
  'credential-compromised': 'passkey or account reported lost, stolen or compromised',
});
export const DISPUTE_REASON = 'disputed-signature';
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;
const cleanNote = (s) => String(s ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, 200);

/** Build a revocation record. `suspectedFrom` (compromise only) defaults to the revocation time. */
export function makeRevocation({ reason, note = '', suspectedFrom = null, now = new Date() }) {
  if (!Object.hasOwn(REVOCATION_REASONS, reason)) throw new Error(`reason must be one of: ${Object.keys(REVOCATION_REASONS).join(', ')}`);
  const revokedAt = now.toISOString();
  const r = { reason, revokedAt, note: cleanNote(note) };
  if (reason === 'credential-compromised') {
    const from = suspectedFrom ?? revokedAt;
    if (!ISO.test(from) || from > revokedAt) throw new Error('suspectedFrom must be an ISO UTC time not after the revocation');
    r.suspectedFrom = from;
  } else if (suspectedFrom) throw new Error('suspectedFrom only applies to credential-compromised');
  return r;
}

export function makeDispute({ note = '', raisedBy = 'synthetic tester', now = new Date() }) {
  return { reason: DISPUTE_REASON, raisedAt: now.toISOString(), note: cleanNote(note), raisedBy: cleanNote(raisedBy), resolution: null };
}

/**
 * Standing of one existing signature given the CFI's revocation (if any) and the entry's dispute (if any).
 * Returns { standing: 'good' | 'review' | 'disputed', notes: string[] }. Never changes the stored signature.
 */
export function signatureStanding(signature, revocation = null, dispute = null) {
  if (!signature) return { standing: null, notes: [] };
  const notes = []; let standing = 'good';
  if (revocation) {
    if (revocation.reason === 'left-school') {
      notes.push(`CFI left the school at ${revocation.revokedAt}; this signature was made earlier and keeps its standing`);
    } else if (revocation.reason === 'credential-compromised') {
      if (signature.signedAt >= revocation.suspectedFrom) { standing = 'review'; notes.push(`signed at or after the suspected compromise (${revocation.suspectedFrom}); needs review by the school`); }
      else notes.push(`credential reported compromised at ${revocation.revokedAt} (suspected from ${revocation.suspectedFrom}); this signature is earlier`);
    }
  }
  if (dispute && !dispute.resolution) { standing = 'disputed'; notes.push(`signature disputed at ${dispute.raisedAt}${dispute.note ? `: ${dispute.note}` : ''}; history kept, entry stays locked`); }
  return { standing, notes };
}
