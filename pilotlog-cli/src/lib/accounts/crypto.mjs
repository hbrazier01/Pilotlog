/** crypto.mjs — small helpers shared by sessions/challenges/audit (accounts v2). */
import { randomBytes, createHash } from "node:crypto";

/** 32 random bytes as base64url (256 bits). Used for session tokens and challenge nonces. */
export function randomToken(bytes = 32) {
  return randomBytes(bytes).toString("base64url");
}

/** sha256 hex. Tokens and nonces are only ever stored as this hash. */
export function sha256Hex(s) {
  return createHash("sha256").update(String(s)).digest("hex");
}

/** Token shape check before hashing/looking up (base64url, 43 chars for 32 bytes). */
export function looksLikeToken(t) {
  return typeof t === "string" && /^[A-Za-z0-9_-]{43}$/.test(t);
}
