/**
 * midnamesClient.js — Isolated @midnames/sdk adapter for PilotLog
 *
 * Spike: AIR-215
 *
 * Purpose:
 *   Resolve a Midname display for a connected 1AM wallet address.
 *   Safe UI: never blocks wallet connection on failure.
 *
 * SDK capabilities (v2.0.0):
 *   - resolveDomain(name) → DomainTarget (address/type)
 *   - resolveDefault(name) → string | DomainTarget
 *   - getDomainInfo(name) → { id, owner, ownerAddress, target, targetLocked }
 *   - getDomainFields(name) → Map<string, string>
 *   - getDomainProfile(name) → { fullDomain, info, fields, settings }
 *   - getDefaultProvider(networkId) — supports "preprod" and "mainnet"
 *
 * LIMITATION: No reverse resolve (address → midname) in SDK.
 *   Approach used: user provides their midname; we verify it resolves
 *   to their connected wallet address, then display it.
 *
 * Networks: "preprod" (preprod.midnight.network) | "mainnet"
 *   PilotLog runs on preprod — matches NETWORK_REGISTRY entry.
 */

import {
  resolveDomain,
  getDomainInfo,
  getDefaultProvider,
} from "@midnames/sdk";

const NETWORK_ID = "preprod";

/**
 * Verify a midname belongs to the connected wallet address.
 *
 * @param {string} midname - e.g. "pilot.night"
 * @param {string} walletAddress - bech32 unshielded address of connected wallet
 * @returns {Promise<string|null>} - the midname if verified, null otherwise
 */
export async function resolveWalletMidname(midname, walletAddress) {
  if (!midname || !walletAddress) return null;

  try {
    const provider = getDefaultProvider(NETWORK_ID);
    const result = await resolveDomain(midname, { provider });

    if (!result.success) return null;

    const target = result.value;
    // Check if the resolved address matches the connected wallet
    if (
      target &&
      (target.type === "unshielded" || target.type === "shielded") &&
      target.address === walletAddress
    ) {
      return midname;
    }

    return null;
  } catch {
    // Never block wallet connection on midname errors
    return null;
  }
}

/**
 * Get domain info for a midname (for display/debugging).
 *
 * @param {string} midname - e.g. "pilot.night"
 * @returns {Promise<object|null>}
 */
export async function getMidnameInfo(midname) {
  if (!midname) return null;

  try {
    const provider = getDefaultProvider(NETWORK_ID);
    const result = await getDomainInfo(midname, { provider });
    if (!result.success) return null;
    return result.value;
  } catch {
    return null;
  }
}

/**
 * Format wallet address for display: truncate middle.
 *
 * @param {string} address
 * @returns {string}
 */
export function truncateAddress(address) {
  if (!address || address.length <= 16) return address || "";
  return `${address.slice(0, 8)}…${address.slice(-6)}`;
}

/**
 * Resolve display label for wallet header.
 * Returns midname if verified, else truncated address.
 *
 * @param {string} walletAddress
 * @param {string|null} userMidname - user-supplied midname to verify
 * @returns {Promise<string>}
 */
export async function getWalletDisplayLabel(walletAddress, userMidname = null) {
  if (userMidname) {
    const verified = await resolveWalletMidname(userMidname, walletAddress);
    if (verified) return verified;
  }
  return truncateAddress(walletAddress);
}
