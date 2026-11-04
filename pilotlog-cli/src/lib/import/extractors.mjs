/**
 * extractors.mjs — pluggable page extractors. v1 has NO model or provider extractors and needs no keys.
 * Interface: { name, async extract({ page, image }) → { rows: [{ row_index, cells }] } }
 *   cells: { <field>: { v: string|number|null, c: 'high'|'med'|'low', reason?: string } }; empty cell → v:null.
 * - manual:  returns blank rows; the student types values in the review UI (every cell starts 'low' + unreviewed).
 * - fixture: returns canned rows keyed by image sha256 (tests and demos only, synthetic data).
 * A future vision extractor must be self-hosted or zero-retention (see FINDINGS.md); it is NOT part of v1.
 */
export const FIELDS = Object.freeze(["date", "aircraft_type", "aircraft_ident", "from", "to", "remarks", "takeoffs", "landings",
  "sel", "sim", "xc", "dual", "pic", "night", "instrument", "total"]);
export const NUMERIC = Object.freeze(["takeoffs", "landings", "sel", "sim", "xc", "dual", "pic", "night", "instrument", "total"]);
export const TIME_FIELDS = Object.freeze(["sel", "sim", "xc", "dual", "pic", "night", "instrument", "total"]);

export function createManualExtractor({ rowsPerPage = 13 } = {}) {
  return { name: "manual", async extract() {
    return { rows: Array.from({ length: rowsPerPage }, (_, i) => ({ row_index: i,
      cells: Object.fromEntries(FIELDS.map((f) => [f, { v: null, c: "low", reason: "manual entry" }])) })) };
  } };
}

export function createFixtureExtractor(fixtures = {}) {
  return { name: "fixture", async extract({ page }) {
    const f = fixtures[page.image_sha256];
    if (!f) throw new Error("no fixture for this image");
    return structuredClone(f);
  } };
}

export function selectExtractor(env = process.env, { fixtures } = {}) {
  const kind = String(env.PILOTLOG_IMPORT_EXTRACTOR || "manual").trim();
  if (kind === "manual") return createManualExtractor();
  if (kind === "fixture") {
    if (String(env.NODE_ENV).toLowerCase() === "production") throw new Error("fixture extractor is not allowed in production");
    return createFixtureExtractor(fixtures);
  }
  throw new Error(`extractor ${kind} is not available in v1`);
}
