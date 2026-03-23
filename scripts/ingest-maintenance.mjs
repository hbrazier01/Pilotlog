/**
 * ingest-maintenance.mjs
 *
 * Parses sample raw maintenance log lines and writes canonical records to
 * data/records/sample.json.
 *
 * Usage: node scripts/ingest-maintenance.mjs
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseLines } from "../src/lib/maintenance-parser.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outputDir = path.join(__dirname, "..", "data", "records");
const outputFile = path.join(outputDir, "sample.json");

// Sample raw maintenance log lines representative of a GA aircraft logbook.
const RAW_LINES = [
  "2026-01-10 Tach: 1234.5 Replaced oil filter and engine oil (6 qt AeroShell 15W-50). Signed A&P John Smith #A12345",
  "2026-02-14 Tach: 1278.2 Inspected left magneto timing, adjusted to 25 deg BTDC. IA: Mary Johnson #IA9876",
  "03/15/2026 Hobbs: 2102.0 Performed 100-hour inspection per FAR 91.409. Certified by Bob Williams A&P #BW4321",
  "2026-03-20 Tach 1312.7 Replaced left brake pads, tested braking. Signed Mike Torres #MT0011",
  "4/1/2026 Hobbs: 2150.6 Lubricated control cables and pulleys per service manual. A&P: Sara Lee",
  "Annual inspection completed. Airworthy. IA Karen Davis #KD7755",
  "Replaced pitot tube heat element 2026-04-10 tach 1350.0 signed J. Brown A&P",
  "Repaired cowling fastener – cracked nutplate replaced. Tach: 1401.3 2026-05-02 A&P Tom White #TW2233",
  "Cleaned fuel injectors, flow-tested all six. 05/20/2026 Tach 1428.0 mechanic: Luis Ortega",
  "Overhauled vacuum pump at tach 1502.5 on 2026-06-01. Signed by certified mechanic Anna Reyes IA #AR8800",
];

function main() {
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const records = parseLines(RAW_LINES);

  fs.writeFileSync(outputFile, JSON.stringify(records, null, 2));

  console.log(`Wrote ${records.length} maintenance records to ${outputFile}`);
  records.forEach((r, i) => {
    const status = r.confidence_score >= 0.8 ? "OK" : r.confidence_score >= 0.5 ? "PARTIAL" : "LOW";
    console.log(
      `  [${i + 1}] ${status} (${r.confidence_score}) — ${r.date ?? "no-date"} | ${r.action ?? "?"} | ${r.component ?? "?"}`
    );
  });
}

main();
