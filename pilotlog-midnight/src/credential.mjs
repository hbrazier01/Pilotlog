// What PilotLog can actually establish about a passkey credential from a WebAuthn response, and nothing more.
// PROTOTYPE. These are authenticator-REPORTED values. With attestation "none" (what staging requests) nothing
// about the authenticator's make, model or hardware is verified, and nothing identifies a specific physical device.
import { decodeCbor } from './cbor.mjs';
import { toHex, equalBytes } from './bytes.mjs';

export const CREDENTIAL_FACTS_NOTE = [
  'Established: the browser returned this credential ID and public key for this site (RP ID), and the authenticator',
  'reported user presence (UP) and user verification (UV: a biometric or device PIN/passcode was checked locally).',
  'BE (backup-eligible) and BS (backed up) are flags the authenticator reports about itself; they are not verified.',
  'Attestation "none" means no attestation statement: the authenticator make/model is not verified.',
  'Not established: which physical device holds the key, whether the key is hardware-bound, or who made the gesture.',
].join(' ');

const flagsOf = (f) => ({ up: !!(f & 1), uv: !!(f & 4), backupEligible: !!(f & 8), backedUp: !!(f & 16), attestedData: !!(f & 64) });

/** Parse the optional attestationObject; it must carry the same authenticatorData the client sent separately. */
export function attestationSummary(attestationObject, authenticatorData) {
  if (!attestationObject) return { format: 'not provided', statementPresent: false, verified: false };
  const m = decodeCbor(attestationObject);
  if (!(m instanceof Map) || typeof m.get('fmt') !== 'string' || !(m.get('authData') instanceof Uint8Array)) throw new Error('attestationObject is malformed');
  if (authenticatorData && !equalBytes(m.get('authData'), authenticatorData)) throw new Error('attestationObject.authData does not match authenticatorData');
  const st = m.get('attStmt');
  return { format: m.get('fmt'), statementPresent: st instanceof Map && st.size > 0, verified: false };
}

/** Facts at registration: credential ID, UP/UV/BE/BS, AAGUID if present, attestation format (never verified here). */
export function registrationFacts({ credentialId, authenticatorData, attestationObject = null, transports = [] }) {
  const ad = authenticatorData;
  const f = flagsOf(ad[32]);
  const aaguid = f.attestedData && ad.length >= 53 ? toHex(ad.slice(37, 53)) : null;
  return {
    credentialId: String(credentialId), up: f.up, uv: f.uv, backupEligible: f.backupEligible, backedUp: f.backedUp,
    aaguid, aaguidDisclosed: !!aaguid && /[^0]/.test(aaguid),
    attestation: attestationSummary(attestationObject, ad),
    transports: Array.isArray(transports) ? transports.map(String).slice(0, 8) : [],
    kindAsReported: f.backupEligible ? 'synced (backup-eligible, as reported)' : 'device-bound (as reported)',
  };
}

/** Facts at each signature: the same flags, read from that assertion's authenticatorData. */
export function assertionFacts({ credentialId, authenticatorData }) {
  const f = flagsOf(authenticatorData[32]);
  return { credentialId: String(credentialId), up: f.up, uv: f.uv, backupEligible: f.backupEligible, backedUp: f.backedUp,
    kindAsReported: f.backupEligible ? 'synced (backup-eligible, as reported)' : 'device-bound (as reported)' };
}
