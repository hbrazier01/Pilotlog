/**
 * midnameResolver.ts — CLI adapter for @midnames/sdk
 *
 * Resolves a .night domain and returns structured identity data.
 * Uses the official preprod flow via getDefaultProvider (AIR-239).
 * Never throws — all errors return null or an error result.
 * Does not block flight logging on any failure.
 */

import { MidnightBech32m, ShieldedCoinPublicKey } from "@midnight-ntwrk/wallet-sdk-address-format";
import type { MidnameIdentity } from "./midnameStore.js";

const NETWORK_ID = "preprod";

/**
 * Validate a .night domain name per AIR-237 requirements.
 * Returns null if valid, or an error message if invalid.
 */
export function validateMidname(domain: string): string | null {
  if (!domain || typeof domain !== "string") return "Domain is required.";
  if (domain !== domain.toLowerCase()) return "Domain must be lowercase.";
  if (/\s/.test(domain)) return "Domain must not contain spaces.";
  if (/_/.test(domain)) return "Domain must not contain underscores.";
  if (!domain.endsWith(".night")) return "Domain must end in .night";

  const sections = domain.split(".");
  // Last section is "night" (TLD), validate all others
  for (const section of sections) {
    if (section.length === 0) return "Domain must not have empty sections.";
    if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(section) && section !== "night") {
      return `Invalid section "${section}": must match [a-z0-9]([a-z0-9-]*[a-z0-9])?`;
    }
  }

  return null;
}

/**
 * Resolve a midname and return a MidnameIdentity for storage.
 * Compares to walletAddress / coinPublicKey to set verificationStatus.
 *
 * @param walletAddress - bech32 unshielded address (for unshielded midnames)
 * @param coinPublicKey - hex coin public key (for shielded midnames)
 */
export async function resolveMidnameIdentity(
  midname: string,
  walletAddress: string | null,
  coinPublicKey: string | null = null
): Promise<MidnameIdentity | { error: string }> {
  try {
    const { getDefaultProvider, resolveDomain, getDomainFields } = await import("@midnames/sdk");

    const provider = getDefaultProvider(NETWORK_ID);

    const resolveResult = await resolveDomain(midname, { provider });
    if (!resolveResult.success) {
      return { error: `Domain not resolved: ${(resolveResult as any).error ?? "unknown"}` };
    }

    const target = resolveResult.data as { type: string; address: string } | null;
    if (!target || !target.address) {
      return { error: "Domain resolved but has no address target." };
    }

    const resolvedAddress = target.address;
    const rawType = target.type;
    const resolvedType: MidnameIdentity["resolvedType"] =
      rawType === "shielded" ? "shielded"
      : rawType === "contract" ? "contract"
      : "unshielded";

    // Get optional profile fields
    let fields: Record<string, string> = {};
    try {
      const fieldsResult = await getDomainFields(midname, { provider });
      if (fieldsResult.success && fieldsResult.data) {
        const map = fieldsResult.data as Map<string, string>;
        const wanted = ["name", "avatar", "bio", "website", "github", "twitter"];
        for (const key of wanted) {
          const val = map.get(key);
          if (val) fields[key] = val;
        }
      }
    } catch {
      // fields are optional — ignore errors
    }

    // Log both values before comparison for debug visibility
    console.log(`[midname-verify] resolved type=${resolvedType} address=${resolvedAddress}`);
    console.log(`[midname-verify] wallet unshielded=${walletAddress ?? "(none)"} coinPublicKey=${coinPublicKey ? coinPublicKey.slice(0, 16) + "…" : "(none)"}`);

    let verificationStatus: MidnameIdentity["verificationStatus"] = "resolved_unverified";
    if (resolvedType === "shielded" && !coinPublicKey) {
      // Wallet only exposes unshielded address — shielded verification is not possible
      verificationStatus = "shielded_unverifiable";
      console.log(`[midname-verify] shielded midname but no coinPublicKey available — marking shielded_unverifiable`);
    } else if (resolvedType === "shielded" && coinPublicKey) {
      try {
        const parsed = MidnightBech32m.parse(resolvedAddress);
        const cpk = ShieldedCoinPublicKey.codec.decode(NETWORK_ID, parsed);
        const match = cpk.equals(coinPublicKey);
        console.log(`[midname-verify] shielded cpk match=${match}`);
        if (match) verificationStatus = "verified";
      } catch (e) {
        console.log(`[midname-verify] shielded decode failed: ${e}`);
      }
    }
    if (resolvedType === "unshielded" && walletAddress) {
      const normResolved = resolvedAddress.trim().toLowerCase();
      const normWallet = walletAddress.trim().toLowerCase();
      const match = normResolved === normWallet;
      console.log(`[midname-verify] unshielded match=${match}`);
      if (match) verificationStatus = "verified";
    }

    return {
      midname,
      resolvedAddress,
      resolvedType,
      fields,
      verificationStatus,
      resolvedAt: new Date().toISOString(),
    };
  } catch (err: any) {
    return { error: err?.message ?? String(err) };
  }
}

/**
 * Format and print a MidnameIdentity as an identity card to stdout.
 */
export function printMidnameCard(identity: MidnameIdentity): void {
  const badge =
    identity.verificationStatus === "verified"
      ? "[Verified Midname]"
      : identity.verificationStatus === "shielded_unverifiable"
      ? "[Resolved — shielded verification unavailable]"
      : identity.verificationStatus === "resolved_unverified"
      ? "[Resolved — not verified against wallet]"
      : "[Unresolved]";

  console.log("─".repeat(50));
  console.log(`  Midname:  ${identity.midname}  ${badge}`);
  console.log(`  Type:     ${identity.resolvedType}`);
  console.log(`  Address:  ${identity.resolvedAddress}`);

  const { name, avatar, bio, website, github, twitter } = identity.fields;
  if (name) console.log(`  Name:     ${name}`);
  if (bio) console.log(`  Bio:      ${bio}`);
  if (website) console.log(`  Website:  ${website}`);
  if (github) console.log(`  GitHub:   ${github}`);
  if (twitter) console.log(`  Twitter:  ${twitter}`);
  if (avatar) console.log(`  Avatar:   ${avatar}`);

  console.log(`  Resolved: ${identity.resolvedAt}`);
  console.log("─".repeat(50));
}
