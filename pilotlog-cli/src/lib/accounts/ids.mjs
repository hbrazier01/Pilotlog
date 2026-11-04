/**
 * ids.mjs — opaque, credential-independent identifiers for accounts v2.
 *
 * A studentId is `st_` + 24 lowercase hex chars (96 random bits from the OS CSPRNG).
 * It is NEVER derived from a wallet address, email, or any other credential, so a
 * student can exist without a wallet and can link/unlink identities later.
 * The shape matches PR #11's `st_<24 hex>` so its isValidStudentId / file paths keep working.
 */
import { randomBytes } from "node:crypto";

export const STUDENT_ID_RE = /^st_[0-9a-f]{24}$/;

export function newStudentId() {
  return `st_${randomBytes(12).toString("hex")}`;
}

export function isValidStudentId(id) {
  return typeof id === "string" && STUDENT_ID_RE.test(id);
}

/** Identity types accepted by the `identities.type` CHECK constraint. */
export const IDENTITY_TYPES = Object.freeze([
  "email",
  "passkey",
  "midnight-1am",
  "midnight-lace",
  "midnight-passport", // FUTURE slot only: no rows until a Passport SDK ships
  "midnight-legacy",   // backfilled from client-trusted /wallet/connect rows; unverified until claimed
]);

/** Wallet-like identity types share one subject namespace (same mn_addr in 1AM or Lace = same identity). */
export const WALLET_IDENTITY_TYPES = Object.freeze(["midnight-1am", "midnight-lace", "midnight-legacy"]);

// Same shape check PR #11 uses (bech32m unshielded address), without network pinning.
const ADDR_RE = /^mn_addr_[a-z0-9]+1[02-9ac-hj-np-z]{20,200}$/;

/** True for a canonical Midnight unshielded address (mn_addr_<network>1…). */
export function isCanonicalWalletAddress(a) {
  return typeof a === "string" && a.length <= 220 && ADDR_RE.test(a);
}

/** Network label from mn_addr_<network>1…, or null. */
export function walletNetwork(a) {
  if (!isCanonicalWalletAddress(a)) return null;
  const hrp = a.slice(0, a.lastIndexOf("1"));
  return hrp.slice("mn_addr_".length) || null;
}
