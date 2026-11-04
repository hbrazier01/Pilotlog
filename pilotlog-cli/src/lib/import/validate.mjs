/**
 * validate.mjs — 61.51-style checks on extracted rows (ported from the IE-4 spike's validate.py) plus
 * page-sum and carry-forward checks. Pure functions, no I/O.
 *
 * Severity: 'error' blocks page confirm; 'warn' needs no action but is shown; 'info' is informational.
 */
import { NUMERIC, TIME_FIELDS } from "./extractors.mjs";

const EPS = 1e-9;
const num = (cell) => {
  const v = cell?.v;
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).trim());
  return Number.isFinite(n) ? n : NaN;
};
const round1 = (x) => Math.round(x * 10) / 10;
export const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * @param rows [{row_index, cells, cfi_signed?}]
 * @param footer {this_page?, forwarded?, to_date?: {field: number}}
 * @returns {issues: [{rule, severity, row?, field?, msg}], sums}
 */
export function validatePage(rows, footer = {}) {
  const issues = [];
  const add = (rule, severity, msg, row = null, field = null) => issues.push({ rule, severity, row, field, msg });
  let prevDate = null;
  for (const r of rows) {
    const c = r.cells || {}, i = r.row_index;
    if (Object.values(c).every((x) => x?.v === null || x?.v === undefined || x?.v === "")) continue; // blank row
    for (const f of NUMERIC) {
      const n = num(c[f]);
      if (Number.isNaN(n)) add("numeric_cell", "error", `${f} is not a number (${JSON.stringify(c[f].v)}); move notes to remarks`, i, f);
      else if (n !== null && n < 0) add("numeric_cell", "error", `${f} is negative`, i, f);
      else if (n !== null && TIME_FIELDS.includes(f) && Math.abs(round1(n) - n) > EPS) add("tenths", "warn", `${f} has more than one decimal`, i, f);
    }
    const [total, dual, pic, xc, sim, sel, night, inst] = ["total", "dual", "pic", "xc", "sim", "sel", "night", "instrument"].map((f) => num(c[f]));
    const ok = (x) => x !== null && !Number.isNaN(x);
    const d = c.date?.v;
    if (!d || !ISO_DATE.test(String(d)) || Number.isNaN(Date.parse(d))) add("date", "error", "date needs a full YYYY-MM-DD (paper logs often omit the year)", i, "date");
    else { if (prevDate && d < prevDate) add("dates_in_order", "warn", `date ${d} is before the previous row (${prevDate})`, i, "date"); prevDate = d; }
    const simOnly = ok(sim) && !ok(total);
    if (ok(sim) && ok(total) && total > 0 && !ok(dual) && !ok(pic)) add("sim_only_no_total", "warn", "simulator time with flight total but no dual/PIC; check the row", i, "total");
    if (simOnly && ok(sel)) add("sim_only_no_sel", "warn", "SEL filled on a simulator-only row", i, "sel");
    if (!simOnly && !ok(total)) add("total_present", "error", "flight row has no total", i, "total");
    if (ok(total)) {
      if (ok(dual) && ok(pic) && dual + pic > total + EPS) add("total_ge_dual_plus_pic", "warn", `dual ${dual} + PIC ${pic} exceeds total ${total}`, i, "total");
      for (const [name, v] of [["dual", dual], ["pic", pic], ["xc", xc], ["night", night], ["instrument", inst]])
        if (ok(v) && v > total + EPS) add(`${name}_le_total`, "error", `${name} ${v} exceeds total ${total}`, i, name);
      if (ok(sel) && Math.abs(sel - total) > EPS) add("sel_eq_total", "warn", `SEL ${sel} ≠ total ${total}`, i, "sel");
    }
    if (ok(dual) && dual > 0 && r.cfi_signed === false) add("cfi_signoff", "warn", "dual row without a visible CFI signature", i);
    for (const [f, cell] of Object.entries(c))
      if (cell?.c === "low" && !cell.reviewed && cell.v !== null && cell.v !== undefined) add("low_confidence", "error", `confirm or fix ${f}${cell.reason ? ` (${cell.reason})` : ""}`, i, f);
  }
  // Column sums (simulator-only rows contribute sim only).
  const sums = {};
  for (const f of NUMERIC) {
    let s = 0;
    for (const r of rows) { const n = num(r.cells?.[f]); if (n !== null && !Number.isNaN(n)) s += n; }
    sums[f] = round1(s);
  }
  const tp = footer.this_page || {}, fw = footer.forwarded || {}, td = footer.to_date || {};
  if (!Object.keys(tp).length && !Object.keys(td).length) add("page_sums", "info", "page totals not filled in on paper; sums not checked");
  for (const f of NUMERIC) {
    if (tp[f] !== undefined && tp[f] !== null && Math.abs(Number(tp[f]) - sums[f]) > 0.05)
      add("page_sums", "warn", `${f}: rows add to ${sums[f]} but "totals this page" says ${tp[f]}`, null, f);
    if (td[f] !== undefined && td[f] !== null && fw[f] !== undefined && fw[f] !== null) {
      const page = tp[f] ?? sums[f];
      if (Math.abs(Number(fw[f]) + Number(page) - Number(td[f])) > 0.05)
        add("carry_forward", "warn", `${f}: forwarded ${fw[f]} + this page ${page} ≠ to date ${td[f]}`, null, f);
    }
  }
  return { issues, sums, blocking: issues.some((x) => x.severity === "error") };
}

/** Cross-page: this page's "amount forwarded" must equal the previous page's "totals to date". */
export function checkCarryAcrossPages(prevFooter, footer) {
  const out = [];
  for (const [f, v] of Object.entries(footer?.forwarded || {})) {
    const prev = prevFooter?.to_date?.[f];
    if (prev !== undefined && prev !== null && Math.abs(Number(prev) - Number(v)) > 0.05)
      out.push({ rule: "carry_forward_pages", severity: "warn", field: f, msg: `${f}: forwarded ${v} ≠ previous page to-date ${prev}` });
  }
  return out;
}
