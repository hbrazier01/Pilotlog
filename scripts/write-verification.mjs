import fs from "node:fs";
import path from "node:path";
import { buildIntegrityResult } from "../src/services/build-integrity-result.mjs";

const aircraftPath = path.resolve("data/aircraft.json");
const entriesPath = path.resolve("data/entries.json");
const verificationPath = path.resolve("data/verification.json");

const aircraftJson = JSON.parse(fs.readFileSync(aircraftPath, "utf8"));
const entries = JSON.parse(fs.readFileSync(entriesPath, "utf8"));

const aircraft = aircraftJson.aircraft?.[0];

if (!aircraft) {
  throw new Error("No aircraft found in data/aircraft.json");
}

const result = buildIntegrityResult({
  aircraft,
  entries,
});

fs.writeFileSync(verificationPath, JSON.stringify(result, null, 2) + "\n");
console.log(`Wrote ${verificationPath}`);
console.log(result);
