import fs from "node:fs";
import path from "node:path";

export type Instructor = {
  id: string;
  name: string;
  certNumber?: string;
  midname?: string;
  verificationCount: number;
  reputationScore: number;
  addedAt: string;
};

const baseDir =
  process.env.PILOTLOG_HOME ||
  process.env.PILOTLOG_DIR ||
  path.resolve(process.cwd(), "data");
const instructorsFile = path.join(baseDir, "instructors.json");

function ensureStore() {
  if (!fs.existsSync(baseDir)) {
    fs.mkdirSync(baseDir, { recursive: true });
  }
  if (!fs.existsSync(instructorsFile)) {
    fs.writeFileSync(instructorsFile, JSON.stringify([]));
  }
}

export function loadInstructors(): Instructor[] {
  ensureStore();
  const raw = fs.readFileSync(instructorsFile, "utf-8");
  return JSON.parse(raw);
}

export function saveInstructors(instructors: Instructor[]) {
  ensureStore();
  fs.writeFileSync(instructorsFile, JSON.stringify(instructors, null, 2));
}
