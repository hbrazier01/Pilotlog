/**
 * airlog-anchor-service.mjs
 *
 * High-level service for AirLog v2 private-record anchoring.
 *
 * Exposes:
 *   anchorRecord(aircraft, entries)   → anchor logbook hash on Midnight
 *   verifyRecord(recordId, recordHash) → compare stored hash vs local hash
 *   grantAccess(recordId, viewerId)    → grant viewer access (stub, on-chain TODO)
 *   revokeAccess(recordId, viewerId)   → revoke access (stub, on-chain TODO)
 *
 * This service is the integration point between:
 *   - The off-chain canonical hash (src/lib/canonicalize-entry.mjs)
 *   - The on-chain Midnight contract (airlog-anchor.compact)
 *   - Local persistence (data/verification.json, data/entries.json)
 */

import fs from "node:fs";
import path from "node:path";
import { canonicalizeLogbook, buildAnchorPayload } from "../lib/canonicalize-entry.mjs";
import { anchorOnMidnight } from "./airlog-anchor-midnight.mjs";

const DATA_DIR = path.resolve(process.cwd(), "data");
const VERIFICATION_PATH = path.join(DATA_DIR, "verification.json");

function loadVerification() {
  if (!fs.existsSync(VERIFICATION_PATH)) return {};
  return JSON.parse(fs.readFileSync(VERIFICATION_PATH, "utf8"));
}

function saveVerification(data) {
  fs.writeFileSync(VERIFICATION_PATH, JSON.stringify(data, null, 2));
}

/**
 * Anchor a logbook's hash on Midnight.
 *
 * Payload shape sent to anchorRecord():
 * {
 *   recordId:   "<64-char hex>",  // SHA-256("logbook:<airframeId>")
 *   recordType: "FLIGHT_ENTRY",
 *   recordHash: "<64-char hex>",  // SHA-256 of canonical JSON
 *   createdAt:  1234567890,       // Unix seconds
 * }
 *
 * Only this payload goes on-chain. The full logbook stays off-chain.
 */
export async function anchorRecord(aircraft, entries) {
  const logbook = canonicalizeLogbook(aircraft, entries);
  const anchorPayload = buildAnchorPayload(logbook);
  const totalHours = entries.reduce((s, e) => s + Number(e.total || 0), 0);

  const result = await anchorOnMidnight({
    anchorHash: anchorPayload.recordHash,
    airframeId: logbook.airframeId,
    hours: totalHours,
  });

  // Persist anchor reference locally
  const verification = loadVerification();
  verification.recordId = anchorPayload.recordId;
  verification.airframeId = logbook.airframeId;
  verification.recordHash = anchorPayload.recordHash;
  verification.recordType = anchorPayload.recordType;
  verification.anchoredAt = result.anchoredAt || new Date().toISOString();
  verification.anchored = result.anchored || false;
  verification.anchorId = result.anchorId || null;
  verification.network = result.network || "midnight-preprod";
  verification.pending = result.pending || false;
  saveVerification(verification);

  return {
    anchorPayload,
    anchorResult: result,
    verification,
  };
}

/**
 * Verify a record: compare on-chain stored hash vs locally computed hash.
 *
 * Returns { verified: true } if hashes match.
 * Returns { verified: false, reason } if they don't.
 */
export function verifyRecord(aircraft, entries) {
  const logbook = canonicalizeLogbook(aircraft, entries);
  const verification = loadVerification();

  if (!verification.recordHash) {
    return { verified: false, reason: "No anchor found for this record" };
  }

  const match = logbook.recordHash === verification.recordHash;
  return {
    verified: match,
    localHash: logbook.recordHash,
    anchoredHash: verification.recordHash,
    anchoredAt: verification.anchoredAt,
    anchorId: verification.anchorId,
    reason: match ? null : "Record hash does not match anchored hash — record may have been modified",
  };
}

/**
 * Grant access to a viewer for a specific record.
 * Stub: persists grant locally. On-chain call (grantAccess circuit) TODO after contract recompile.
 *
 * @param {string} recordId - hex record ID
 * @param {string} viewerId - viewer's public key or identifier
 * @param {"READ"|"VERIFY"} accessLevel
 */
export function grantAccess(recordId, viewerId, accessLevel = "VERIFY") {
  const verification = loadVerification();
  if (!verification.grants) verification.grants = [];

  const existing = verification.grants.find(
    (g) => g.recordId === recordId && g.viewerId === viewerId
  );
  if (existing) {
    existing.active = true;
    existing.accessLevel = accessLevel;
  } else {
    verification.grants.push({
      grantId: `${recordId}:${viewerId}`,
      recordId,
      viewerId,
      accessLevel,
      grantedAt: new Date().toISOString(),
      active: true,
    });
  }
  saveVerification(verification);
  return { granted: true, recordId, viewerId, accessLevel };
}

/**
 * Revoke access for a viewer.
 * Stub: updates local grant. On-chain call (revokeAccess circuit) TODO after contract recompile.
 */
export function revokeAccess(recordId, viewerId) {
  const verification = loadVerification();
  if (!verification.grants) return { revoked: false, reason: "No grants found" };

  const grant = verification.grants.find(
    (g) => g.recordId === recordId && g.viewerId === viewerId && g.active
  );
  if (!grant) return { revoked: false, reason: "Active grant not found" };

  grant.active = false;
  grant.revokedAt = new Date().toISOString();
  saveVerification(verification);
  return { revoked: true, recordId, viewerId };
}
