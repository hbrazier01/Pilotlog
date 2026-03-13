import fs from "node:fs";
import path from "node:path";
import { simulateAirlogAnchor } from "../src/services/airlog-contract-local.mjs";

const aircraftJson = JSON.parse(
  fs.readFileSync(path.resolve("data/aircraft.json"), "utf8")
);

const entries = JSON.parse(
  fs.readFileSync(path.resolve("data/entries.json"), "utf8")
);

const aircraft = aircraftJson.aircraft?.[0];

if (!aircraft) {
  throw new Error("No aircraft found in data/aircraft.json");
}

const result = simulateAirlogAnchor({ aircraft, entries });

console.log("Integrity:");
console.log(JSON.stringify(result.integrity, null, 2));

console.log("\nRegister result keys:");
console.log(Object.keys(result.registerResult));

console.log("\nAuthorize result keys:");
console.log(Object.keys(result.authorizeResult));

console.log("\nAdd entry result keys:");
console.log(Object.keys(result.addEntryResult));

console.log("\nAdd entry proofData input length:");
console.log(result.addEntryResult.proofData?.input?.value?.length ?? null);
