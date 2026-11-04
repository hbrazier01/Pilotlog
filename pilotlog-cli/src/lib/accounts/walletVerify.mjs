/**
 * walletVerify.mjs — Midnight wallet signature verification, ported from PR #11 (981fc87, identity.mjs).
 *
 * Kept from PR #11 unchanged in substance: DApp connector `signData` over a server-issued message, verified
 * with @midnight-ntwrk/ledger-v8 (8.0.3, same pin as main) `verifySignature`, with the verifying key bound to
 * the claimed mn_addr_… via `addressFromKey`. 1AM and Lace go through the exact same check.
 * Dropped: studentIdFor(address) — accounts v2 student ids are random (ids.mjs) and wallets are identities.
 * Changed: the signed message now carries the intent (login | link) and, for link, the student id.
 */
export const WALLET_PROVIDERS = Object.freeze({
  "midnight-1am": { label: "1AM", rdns: ["com.midnight.1am"] },
  "midnight-lace": { label: "Lace", rdns: ["io.lace.wallet"] },
});
const HEX_RE = /^[0-9a-f]+$/i;
const ADDR_RE = /^mn_addr_[a-z0-9]+1[02-9ac-hj-np-z]{20,200}$/;

export const midnightNetwork = (env = process.env) => String(env.MIDNIGHT_NETWORK || "preprod").trim();

let _libs = null;
async function libs() {
  if (!_libs) {
    const [ledger, fmt] = await Promise.all([
      import("@midnight-ntwrk/ledger-v8"), import("@midnight-ntwrk/wallet-sdk-address-format")]);
    _libs = { ledger, fmt };
  }
  return _libs;
}

export function looksLikeWalletAddress(a, network) {
  return typeof a === "string" && a.length <= 220 && ADDR_RE.test(a) && a.startsWith(`mn_addr_${network}1`);
}

/** Decode mn_addr_<network>1… to its 32-byte hex payload, or throw. */
export async function decodeUnshieldedAddress(address, network) {
  if (!looksLikeWalletAddress(address, network)) throw new Error(`address must be a Midnight ${network} unshielded address`);
  const { fmt } = await libs();
  const ua = fmt.UnshieldedAddress.codec.decode(network, fmt.MidnightBech32m.parse(address));
  return Buffer.from(ua.data).toString("hex");
}

/** Bytes the wallet signs (DApp connector spec: "midnight_signed_message:<len>:" + data). */
export function signedMessageBytes(message) {
  const data = Buffer.from(String(message), "utf8");
  return Buffer.concat([Buffer.from(`midnight_signed_message:${data.length}:`, "utf8"), data]);
}

export function challengeMessage({ intent, address, nonce, issuedAt, domain, studentId = null }) {
  return [
    intent === "link" ? "PilotLog: link this wallet to your account" : "PilotLog sign-in",
    `Domain: ${domain}`,
    `Intent: ${intent}`,
    ...(studentId ? [`Account: ${studentId}`] : []),
    `Address: ${address}`,
    `Nonce: ${nonce}`,
    `Issued: ${issuedAt}`,
    "Signing proves you control this wallet. It costs nothing and sends no transaction.",
  ].join("\n");
}

/** Throws unless `signature` is valid over `message` AND its verifying key hashes to `address`. */
export async function verifyWalletSignature({ address, message, signature, network }) {
  const sig = String(signature?.signature || "");
  const vk = String(signature?.verifyingKey || "");
  const scheme = signature?.scheme || "schnorr_bip340";
  if (scheme !== "schnorr_bip340") throw new Error("unsupported signature scheme");
  if (!HEX_RE.test(sig) || sig.length > 512 || !HEX_RE.test(vk) || vk.length > 256) throw new Error("signature and verifyingKey must be hex");
  const expectedHex = await decodeUnshieldedAddress(address, network);
  const { ledger } = await libs();
  let keyAddr;
  try { keyAddr = ledger.addressFromKey(vk); } catch { throw new Error("invalid verifying key"); }
  if (String(keyAddr).toLowerCase() !== expectedHex.toLowerCase()) throw new Error("verifying key does not belong to this address");
  let ok = false;
  try { ok = ledger.verifySignature(vk, signedMessageBytes(message), sig); } catch { ok = false; }
  if (!ok) throw new Error("signature does not verify");
  return true;
}
