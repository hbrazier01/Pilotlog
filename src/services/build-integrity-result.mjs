import { canonicalizeRecords } from "../lib/canonicalize-records.mjs";
import { sha256Hex } from "../lib/hash-records.mjs";
import { deriveAirframeIdHex } from "../lib/airframe-id.mjs";

export function buildIntegrityResult({ aircraft, entries, network = "midnight-preprod" }) {
  const canonical = canonicalizeRecords(aircraft, entries);
  const recordHash = sha256Hex(canonical);
  const airframeId = deriveAirframeIdHex(aircraft.ident);

  return {
    anchored: false,
    anchorHash: recordHash,
    anchorTime: new Date().toISOString(),
    anchorNetwork: network,
    anchorTx: null,
    entries: entries.length,
    aircraftIdent: aircraft.ident,
    airframeId,
  };
}
