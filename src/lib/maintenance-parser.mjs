import { randomUUID } from "node:crypto";

/**
 * Canonical maintenance record shape.
 *
 * @typedef {Object} MaintenanceRecord
 * @property {string} id          - UUID
 * @property {string|null} date   - ISO date string (YYYY-MM-DD) or null
 * @property {number|null} tach_time  - tachometer hours at time of work
 * @property {number|null} hobbs_time - Hobbs hours at time of work
 * @property {string|null} action     - e.g. "Replaced", "Inspected", "Repaired"
 * @property {string|null} component  - e.g. "oil filter", "left magneto"
 * @property {string|null} description - full work description
 * @property {string|null} signer     - A&P or IA name / cert number
 * @property {number} confidence_score - 0.0–1.0 parse confidence
 * @property {string[]} missing_fields - fields that could not be parsed
 * @property {string} source_line     - raw input line
 */

// ── helpers ──────────────────────────────────────────────────────────────────

const DATE_RE = /\b(\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{2,4})\b/;
const TACH_RE = /tach(?:ometer)?[\s:]+([0-9]+(?:\.[0-9]+)?)/i;
const HOBBS_RE = /hobbs[\s:]+([0-9]+(?:\.[0-9]+)?)/i;
const SIGNER_RE =
  /(?:signed?|a&p|ia|mechanic|certified by|inspected by)[:\s]+([A-Z][A-Za-z\s,\.]+(?:#\s*[\w-]+)?)/i;

const ACTION_KEYWORDS = [
  "replaced",
  "replace",
  "installed",
  "install",
  "removed",
  "remove",
  "repaired",
  "repair",
  "inspected",
  "inspect",
  "overhauled",
  "overhaul",
  "lubricated",
  "lubricate",
  "adjusted",
  "adjust",
  "tested",
  "test",
  "performed",
  "perform",
  "completed",
  "complete",
  "changed",
  "change",
  "cleaned",
  "clean",
  "serviced",
  "service",
  "calibrated",
  "calibrate",
];

function parseDate(line) {
  const m = line.match(DATE_RE);
  if (!m) return null;
  const raw = m[1];
  if (raw.includes("-")) return raw; // already ISO
  // convert M/D/YYYY or M/D/YY
  const parts = raw.split("/");
  const year =
    parts[2].length === 2 ? `20${parts[2]}` : parts[2];
  const month = parts[0].padStart(2, "0");
  const day = parts[1].padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseAction(line) {
  const lower = line.toLowerCase();
  let best = null; // { kw, index }
  for (const kw of ACTION_KEYWORDS) {
    // Match only whole words
    const re = new RegExp(`\\b${kw}\\b`);
    const m = lower.match(re);
    if (m && (best === null || m.index < best.index)) {
      best = { kw, index: m.index };
    }
  }
  if (!best) return null;
  return best.kw.charAt(0).toUpperCase() + best.kw.slice(1);
}

function parseComponent(line, action) {
  if (!action) return null;
  // Strip date, tach, hobbs, signer noise then grab text after action keyword
  let stripped = line
    .replace(DATE_RE, "")
    .replace(TACH_RE, "")
    .replace(HOBBS_RE, "")
    .replace(SIGNER_RE, "");

  const actionRe = new RegExp(`\\b${action}\\b`, "i");
  const actionMatch = stripped.match(actionRe);
  if (!actionMatch) return null;

  // Take text after the action keyword
  const after = stripped.slice(actionMatch.index + actionMatch[0].length).trim();
  // Remove trailing punctuation / conjunctions
  const component = after
    .split(/[,;.]|and\s+signed|per\s+logbook/i)[0]
    .trim();
  return component.length > 0 ? component : null;
}

// ── main export ───────────────────────────────────────────────────────────────

/**
 * Parse a single raw maintenance log line into a MaintenanceRecord.
 * @param {string} line
 * @returns {MaintenanceRecord}
 */
export function parseLine(line) {
  const source_line = line.trim();
  const missing_fields = [];

  const date = parseDate(source_line);
  if (!date) missing_fields.push("date");

  const tachMatch = source_line.match(TACH_RE);
  const tach_time = tachMatch ? parseFloat(tachMatch[1]) : null;

  const hobbsMatch = source_line.match(HOBBS_RE);
  const hobbs_time = hobbsMatch ? parseFloat(hobbsMatch[1]) : null;

  if (!tach_time && !hobbs_time) missing_fields.push("tach_time");

  const action = parseAction(source_line);
  if (!action) missing_fields.push("action");

  const component = parseComponent(source_line, action);
  if (!component) missing_fields.push("component");

  const signerMatch = source_line.match(SIGNER_RE);
  const signer = signerMatch ? signerMatch[1].trim() : null;
  if (!signer) missing_fields.push("signer");

  // Description is the full line minus obvious metadata noise
  const description = source_line
    .replace(DATE_RE, "")
    .replace(TACH_RE, "")
    .replace(HOBBS_RE, "")
    .replace(SIGNER_RE, "")
    .replace(/\s{2,}/g, " ")
    .trim() || null;

  // Confidence: 1.0 minus 0.15 per missing critical field (date, action, component, signer)
  const criticalMissing = missing_fields.filter((f) =>
    ["date", "action", "component", "signer"].includes(f)
  ).length;
  const confidence_score = Math.max(0, parseFloat((1.0 - criticalMissing * 0.2).toFixed(2)));

  return {
    id: randomUUID(),
    date,
    tach_time,
    hobbs_time,
    action,
    component,
    description,
    signer,
    confidence_score,
    missing_fields,
    source_line,
  };
}

/**
 * Parse an array of raw maintenance log lines into MaintenanceRecords.
 * Blank lines are skipped.
 * @param {string[]} lines
 * @returns {MaintenanceRecord[]}
 */
export function parseLines(lines) {
  return lines
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .map(parseLine);
}
