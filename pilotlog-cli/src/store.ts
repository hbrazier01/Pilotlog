import fs from "node:fs";
import path from "node:path";

export type FlightEntry = {
  id: string;
  date: string; // ISO
  aircraftType: string;
  aircraftIdent: string;
  from: string;
  to: string;
  total: number;
  pic: number;
  dual: number;
  xc: number;
  night: number;
  actualInstrument: number;
  simulatedInstrument: number;

  // IFR currency fields
  approaches: number;
  holds: number;
  intercepts: number;

  dayLandings: number;
  nightLandings: number;
  remarks?: string;
};

const baseDir = process.env.PILOTLOG_HOME
  ? process.env.PILOTLOG_HOME
  : path.join(process.cwd(), ".pilotlog");
const entriesFile = path.join(baseDir, "entries.json");

function ensureStore() {
  if (!fs.existsSync(baseDir)) {
    fs.mkdirSync(baseDir);
  }
  if (!fs.existsSync(entriesFile)) {
    fs.writeFileSync(entriesFile, JSON.stringify([]));
  }
}

export function loadEntries(): FlightEntry[] {
  ensureStore();
  const raw = fs.readFileSync(entriesFile, "utf-8");
  return JSON.parse(raw);
}

export function saveEntries(entries: FlightEntry[]) {
  ensureStore();
  fs.writeFileSync(entriesFile, JSON.stringify(entries, null, 2));
}
