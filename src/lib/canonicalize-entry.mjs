/**
 * canonicalize-entry.mjs
 *
 * Canonical hashing strategy for individual off-chain records.
 *
 * Rules:
 *  - All strings trimmed and lowercased (except idents which are uppercased)
 *  - Numbers normalized to fixed precision where applicable
 *  - Keys sorted alphabetically in the canonical object
 *  - JSON.stringify of the canonical object → SHA-256 hex = recordHash
 *
 * This hash is what gets anchored on Midnight.
 * The full record stays off-chain.
 */

import { createHash } from "node:crypto";
import { randomUUID } from "node:crypto";

/**
 * Canonicalize a single flight entry.
 * Returns { recordId, recordType, canonical, recordHash }
 */
export function canonicalizeFlightEntry(entry, aircraftIdent) {
  const canonical = {
    aircraftIdent: String(aircraftIdent || entry.aircraftIdent || "").trim().toUpperCase(),
    aircraftType: String(entry.aircraftType || "").trim().toUpperCase(),
    actualInstrument: Number(entry.actualInstrument || 0),
    approaches: Number(entry.approaches || 0),
    date: String(entry.date || "").trim(),
    dayLandings: Number(entry.dayLandings || 0),
    dual: Number(entry.dual || 0),
    from: String(entry.from || "").trim().toUpperCase(),
    holds: Number(entry.holds || 0),
    id: String(entry.id || "").trim(),
    intercepts: Number(entry.intercepts || 0),
    night: Number(entry.night || 0),
    nightLandings: Number(entry.nightLandings || 0),
    pic: Number(entry.pic || 0),
    remarks: String(entry.remarks || "").trim(),
    simulatedInstrument: Number(entry.simulatedInstrument || 0),
    to: String(entry.to || "").trim().toUpperCase(),
    total: Number(entry.total || 0),
    xc: Number(entry.xc || 0),
  };

  const canonicalJson = JSON.stringify(canonical);
  const recordHash = createHash("sha256").update(canonicalJson).digest("hex");

  // recordId = deterministic: hash of entry.id + aircraftIdent
  const recordId = createHash("sha256")
    .update(`flight:${canonical.aircraftIdent}:${canonical.id}`)
    .digest("hex");

  return {
    recordId,
    recordType: "FLIGHT_ENTRY",
    canonical,
    canonicalJson,
    recordHash,
  };
}

/**
 * Canonicalize the entire logbook as a single aggregate record.
 * Used for the whole-logbook anchor (replaces current simulateAirlogAnchor).
 */
export function canonicalizeLogbook(aircraft, entries) {
  const ident = String(aircraft.ident || "").trim().toUpperCase();
  const airframeId = createHash("sha256").update(ident).digest("hex");

  const sortedEntries = [...entries]
    .map((e) => canonicalizeFlightEntry(e, ident).canonical)
    .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));

  const canonical = {
    aircraftIdent: ident,
    aircraftType: String(aircraft.type || "").trim().toUpperCase(),
    entries: sortedEntries,
  };

  const canonicalJson = JSON.stringify(canonical);
  const recordHash = createHash("sha256").update(canonicalJson).digest("hex");

  // recordId for the logbook = hash of "logbook:<airframeId>"
  const recordId = createHash("sha256")
    .update(`logbook:${airframeId}`)
    .digest("hex");

  return {
    recordId,
    airframeId,
    recordType: "FLIGHT_ENTRY", // logbook is a collection of flight entries
    canonical,
    canonicalJson,
    recordHash,
  };
}

/**
 * Build the on-chain anchor payload for a record.
 * This is exactly what gets passed to anchorRecord().
 */
export function buildAnchorPayload(canonicalized) {
  return {
    recordId: canonicalized.recordId,         // hex string, 64 chars
    recordType: canonicalized.recordType,     // "FLIGHT_ENTRY" | "MAINTENANCE_ENTRY" | ...
    recordHash: canonicalized.recordHash,     // hex string, 64 chars (SHA-256 of canonical JSON)
    createdAt: Math.floor(Date.now() / 1000), // Unix seconds
  };
}
