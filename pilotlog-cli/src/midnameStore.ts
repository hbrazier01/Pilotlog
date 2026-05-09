import fs from "node:fs";
import path from "node:path";

export type MidnameIdentity = {
  midname: string;
  resolvedAddress: string;
  resolvedType: "shielded" | "unshielded" | "contract";
  fields: Record<string, string>;
  verificationStatus: "verified" | "resolved_unverified" | "shielded_unverifiable" | "unresolved";
  resolvedAt: string; // ISO timestamp
};

const baseDir = process.env.PILOTLOG_HOME || process.env.PILOTLOG_DIR || path.resolve(process.cwd(), "data");

// Use identity.json — same file as readApi.mjs / web server
const midnameFile = path.join(baseDir, "identity.json");

function ensureDir() {
  if (!fs.existsSync(baseDir)) fs.mkdirSync(baseDir, { recursive: true });
}

export function loadMidnameIdentity(): MidnameIdentity | null {
  ensureDir();
  if (!fs.existsSync(midnameFile)) return null;
  try {
    return JSON.parse(fs.readFileSync(midnameFile, "utf-8")) as MidnameIdentity;
  } catch {
    return null;
  }
}

export function saveMidnameIdentity(identity: MidnameIdentity): void {
  ensureDir();
  fs.writeFileSync(midnameFile, JSON.stringify(identity, null, 2));
}

export function clearMidnameIdentity(): void {
  if (fs.existsSync(midnameFile)) fs.unlinkSync(midnameFile);
}
