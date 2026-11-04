/**
 * redact.mjs — strip passport / government ID / certificate numbers from free text before storage.
 * Keeps the last 2 characters so a student can still tell entries apart ("passport #…82").
 * Deliberately over-redacts: any run of 7+ digits (optionally with letters) is treated as an ID.
 */
const keep2 = (s) => `[redacted …${s.slice(-2)}]`;
const RULES = [
  // passport / license / ID / cert # followed by an alphanumeric number
  /\b(?:passport|pp|license|licence|lic|dl|id|cert(?:ificate)?|cfi|ssn)\s*(?:no\.?|num(?:ber)?|#)?\s*[:#]?\s*([A-Z0-9][A-Z0-9-]{5,14})\b/gi,
  // US passport book shape: 1 letter + 8 digits, or 9 digits
  /\b([A-Z]\d{8}|\d{9})\b/g,
  // SSN shape
  /\b(\d{3}-\d{2}-\d{4})\b/g,
  // any long digit run (FAA cert numbers are 7–10 digits, optionally with a CFI suffix)
  /\b(\d{7,12}(?:CFI|ATP|AGI|IGI)?)\b/gi,
];

export function redactIds(text) {
  if (typeof text !== "string" || !text) return { text, redactions: 0 };
  let out = text, n = 0;
  for (const re of RULES) {
    out = out.replace(re, (m, g) => {
      if (!/\d{4,}/.test(g.replace(/-/g, ""))) return m; // need real digits, not words like "license ATP"
      n++;
      return m.replace(g, keep2(g.replace(/-/g, "")));
    });
  }
  return { text: out, redactions: n };
}

/** Redact every string cell value in a row's cells object (remarks is the main target). Mutates a copy. */
export function redactCells(cells) {
  const out = structuredClone(cells || {});
  let total = 0;
  for (const [k, cell] of Object.entries(out)) {
    if (cell && typeof cell.v === "string") {
      const r = redactIds(cell.v);
      if (r.redactions) { cell.v = r.text; cell.redacted = true; total += r.redactions; }
    }
    if (k === "remarks" && cell && typeof cell.cfi_text === "string") cell.cfi_text = redactIds(cell.cfi_text).text;
  }
  return { cells: out, redactions: total };
}
