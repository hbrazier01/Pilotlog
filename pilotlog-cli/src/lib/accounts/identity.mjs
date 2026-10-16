/**
 * Student identity — provider abstraction.
 *
 * A provider turns a proof from the browser into a stable { studentId, walletAddress }.
 *   - midnight-1am  (current): Midnight DApp connector `signData` over a server-issued nonce,
 *                   verified server-side with @midnight-ntwrk/ledger-v8 `verifySignature`, and the
 *                   verifying key is bound to the claimed mn_addr_… address via `addressFromKey`.
 *   - midnight-passport (future): placeholder; not available yet. When Passport ships it implements
 *                   the same `verify()` contract and student data does not move (studentId is derived
 *                   from the canonical wallet address, not from the provider).
 *
 * studentId = "st_" + first 24 hex of sha256(canonical unshielded address). Filesystem- and URL-safe,
 * stable across providers, never derived from client-chosen strings.
 */
import crypto from 'node:crypto';

export const MIDNIGHT_NETWORK = process.env.MIDNIGHT_NETWORK || 'preprod';
const ADDR_RE = /^mn_addr_[a-z0-9]+1[02-9ac-hj-np-z]{20,200}$/;
const HEX_RE = /^[0-9a-f]+$/i;

let _libs = null;
async function libs() {
  if (!_libs) {
    const [ledger, fmt] = await Promise.all([
      import('@midnight-ntwrk/ledger-v8'),
      import('@midnight-ntwrk/wallet-sdk-address-format'),
    ]);
    _libs = { ledger, fmt };
  }
  return _libs;
}

export function studentIdFor(walletAddress) {
  return 'st_' + crypto.createHash('sha256').update(String(walletAddress)).digest('hex').slice(0, 24);
}

export function isValidStudentId(id) {
  return typeof id === 'string' && /^st_[0-9a-f]{24}$/.test(id);
}

/** Shape check only (cheap, sync). Full bech32m decode happens in decodeUnshieldedAddress. */
export function looksLikeWalletAddress(a, network = MIDNIGHT_NETWORK) {
  return typeof a === 'string' && a.length <= 200 && ADDR_RE.test(a) && a.startsWith(`mn_addr_${network}1`);
}

/** Decode a bech32m mn_addr_<network>1… to its 32-byte hex payload, or throw. */
export async function decodeUnshieldedAddress(address, network = MIDNIGHT_NETWORK) {
  if (!looksLikeWalletAddress(address, network)) throw new Error(`address must be a Midnight ${network} unshielded address (mn_addr_${network}1…)`);
  const { fmt } = await libs();
  const parsed = fmt.MidnightBech32m.parse(address);
  const ua = fmt.UnshieldedAddress.codec.decode(network, parsed);
  return Buffer.from(ua.data).toString('hex');
}

/** Bytes the wallet actually signs (DApp connector spec: "midnight_signed_message:<len>:" + data). */
export function signedMessageBytes(message) {
  const data = Buffer.from(String(message), 'utf8');
  return Buffer.concat([Buffer.from(`midnight_signed_message:${data.length}:`, 'utf8'), data]);
}

export function challengeMessage({ address, nonce, issuedAt, domain }) {
  return [
    'PilotLog sign-in',
    `Domain: ${domain}`,
    `Address: ${address}`,
    `Nonce: ${nonce}`,
    `Issued: ${issuedAt}`,
    'Signing proves you control this wallet. It costs nothing and sends no transaction.',
  ].join('\n');
}

/**
 * Verify a DApp-connector Signature { signature, verifyingKey, scheme? } over `message` for `address`.
 * Returns true only if the signature is valid AND the verifying key hashes to the claimed address.
 */
export async function verifyWalletSignature({ address, message, signature }) {
  const sig = String(signature?.signature || '');
  const vk = String(signature?.verifyingKey || '');
  const scheme = signature?.scheme || 'schnorr_bip340';
  if (scheme !== 'schnorr_bip340') throw new Error(`unsupported signature scheme ${scheme}`);
  if (!HEX_RE.test(sig) || sig.length > 512 || !HEX_RE.test(vk) || vk.length > 256) throw new Error('signature and verifyingKey must be hex');
  const expectedHex = await decodeUnshieldedAddress(address);
  const { ledger } = await libs();
  let keyAddr;
  try { keyAddr = ledger.addressFromKey(vk); } catch { throw new Error('invalid verifying key'); }
  if (String(keyAddr).toLowerCase() !== expectedHex.toLowerCase()) throw new Error('verifying key does not belong to this address');
  let ok = false;
  try { ok = ledger.verifySignature(vk, signedMessageBytes(message), sig); } catch { ok = false; }
  if (!ok) throw new Error('signature does not verify');
  return true;
}

export const PROVIDERS = {
  'midnight-1am': {
    id: 'midnight-1am',
    label: 'Midnight wallet (1AM)',
    available: true,
    /** proof: { address, message, signature } — message must be the server-issued challenge. */
    async verify({ address, message, signature }) {
      await verifyWalletSignature({ address, message, signature });
      return { studentId: studentIdFor(address), walletAddress: address, verified: true };
    },
  },
  'midnight-passport': {
    id: 'midnight-passport',
    label: 'Midnight Passport',
    available: false,
    async verify() { throw new Error('Midnight Passport is not available yet'); },
  },
};

export function getProvider(id = 'midnight-1am') {
  const p = PROVIDERS[id];
  if (!p) throw new Error('unknown identity provider');
  if (!p.available) throw new Error(`${p.label} is not available yet`);
  return p;
}
