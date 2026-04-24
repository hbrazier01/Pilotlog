import fs from "node:fs";
import path from "node:path";

export type PilotPhase =
  | "student_ppl"
  | "ppl_complete"
  | "instrument_training"
  | "instrument_rated"
  | "commercial"
  | "cfi";

export type PilotProfile = {
  pilot: { fullName: string; email?: string; phone?: string };
  pilotPhase?: PilotPhase;
  certificates: { type: string; issued?: string; number?: string }[];
  ratings: { type: string; issued?: string }[];
  medical: {
    kind: "None" | "Medical" | "BasicMed";
    class: "1" | "2" | "3" | null;
    issued: string | null;
    expires: string | null;
    basicMed: { cmecDate: string | null; onlineCourseDate: string | null };
  };
  proficiency: { flightReviewDate: string | null; ipcDate: string | null };
  endorsements: { date: string; text: string }[];
};

const baseDir = process.env.PILOTLOG_HOME
  ? process.env.PILOTLOG_HOME
  : path.join(process.cwd(), ".pilotlog");

const profileFile = path.join(baseDir, "profile.json");

function ensureProfile() {
  if (!fs.existsSync(baseDir)) fs.mkdirSync(baseDir, { recursive: true });
  if (!fs.existsSync(profileFile)) {
    const seed: PilotProfile = {
      pilot: { fullName: "" },
      certificates: [],
      ratings: [],
      medical: {
        kind: "None",
        class: null,
        issued: null,
        expires: null,
        basicMed: { cmecDate: null, onlineCourseDate: null },
      },
      proficiency: { flightReviewDate: null, ipcDate: null },
      endorsements: [],
    };
    fs.writeFileSync(profileFile, JSON.stringify(seed, null, 2));
  }
}

export function loadProfile(): PilotProfile {
  ensureProfile();
  return JSON.parse(fs.readFileSync(profileFile, "utf-8"));
}

export function saveProfile(p: PilotProfile) {
  ensureProfile();
  fs.writeFileSync(profileFile, JSON.stringify(p, null, 2));
}
