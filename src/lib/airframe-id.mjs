import { createHash } from "node:crypto";

export function deriveAirframeIdHex(ident) {
  return createHash("sha256")
    .update(String(ident || "").trim().toUpperCase())
    .digest("hex");
}
