import fs from "node:fs";
import path from "node:path";

export type AttestationType =
  | "flight_verified"
  | "solo_ready"
  | "endorsement_received"
  | "milestone_verified";

export type AttestationStatus = "pending" | "verified" | "rejected";

export type Attestation = {
  id: string;
  type: AttestationType;
  pilotId: string;
  instructorId: string;
  flightId: string;
  createdAt: string;
  status: AttestationStatus;
  remarks?: string;
  verifiedAt?: string;
};

const baseDir =
  process.env.PILOTLOG_HOME ||
  process.env.PILOTLOG_DIR ||
  path.resolve(process.cwd(), "data");
const attestationsFile = path.join(baseDir, "attestations.json");

function ensureStore() {
  if (!fs.existsSync(baseDir)) {
    fs.mkdirSync(baseDir, { recursive: true });
  }
  if (!fs.existsSync(attestationsFile)) {
    fs.writeFileSync(attestationsFile, JSON.stringify([]));
  }
}

export function loadAttestations(): Attestation[] {
  ensureStore();
  const raw = fs.readFileSync(attestationsFile, "utf-8");
  return JSON.parse(raw);
}

export function saveAttestations(attestations: Attestation[]) {
  ensureStore();
  fs.writeFileSync(attestationsFile, JSON.stringify(attestations, null, 2));
}
