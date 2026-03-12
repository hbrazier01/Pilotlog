import { createHash } from "node:crypto";

export function sha256Hex(input) {
  return createHash("sha256").update(input).digest("hex");
}
