
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
import { createHash, randomBytes } from "node:crypto";
import { buildIntegrityResult } from "../../src/services/build-integrity-result.mjs";
import { anchorOnMidnight } from "../../src/services/airlog-anchor-midnight.mjs";
import { canonicalizeFlightEntry } from "../../src/lib/canonicalize-entry.mjs";
import { buildTrustReport } from "../../src/services/build-trust-report.mjs";
import { buildPilotReport } from "../../src/services/build-pilot-report.mjs";
import { computeReadiness, PILOT_PHASES } from "./lib/readiness.mjs";

const PORT = Number(process.env.PORT || 8788);
const DATA_DIR = process.env.PILOTLOG_HOME || process.env.PILOTLOG_DIR || path.resolve(process.cwd(), "data");
const ENTRIES_PATH = path.join(DATA_DIR, "entries.json");
const PROFILE_PATH = path.join(DATA_DIR, "profile.json");
const AIRCRAFT_PATH = path.join(DATA_DIR, "aircraft.json");
const VERIFICATION_PATH = path.join(DATA_DIR, "verification.json");
const MAINTENANCE_PATH = path.join(DATA_DIR, "maintenance.json");
const WALLET_PATH = path.join(DATA_DIR, "wallet.json");

fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(ENTRIES_PATH)) fs.writeFileSync(ENTRIES_PATH, "[]");
if (!fs.existsSync(PROFILE_PATH)) {
  fs.writeFileSync(
    PROFILE_PATH,
    JSON.stringify(
      {
        pilot: { fullName: "", email: "", phone: "" },
        certificates: [],
        ratings: [],
        medical: {
          kind: "None",
          class: null,
          issued: null,
          expires: null,
          basicMed: { cmecDate: null, onlineCourseDate: null }
        },
        proficiency: { flightReviewDate: null, ipcDate: null },
        endorsements: []
      },
      null,
      2
    )
  );
}

if (!fs.existsSync(AIRCRAFT_PATH)) {
  fs.writeFileSync(
    AIRCRAFT_PATH,
    JSON.stringify({ aircraft: [] }, null, 2)
  );
}

if (!fs.existsSync(VERIFICATION_PATH)) {
  fs.writeFileSync(
    VERIFICATION_PATH,
    JSON.stringify(
      {
        anchored: false,
        anchorHash: null,
        anchorTime: null,
        anchorNetwork: "midnight-preview",
        anchorTx: null,
        entries: 0,
        aircraftIdent: null,
        airframeId: null
      },
      null,
      2
    )
  );
}

function readEntries() {
  try {
    const raw = fs.readFileSync(ENTRIES_PATH, "utf-8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function readWalletSession() {
  try {
    if (!fs.existsSync(WALLET_PATH)) return null;
    const raw = fs.readFileSync(WALLET_PATH, "utf-8");
    const parsed = JSON.parse(raw);
    return parsed && parsed.address ? parsed : null;
  } catch {
    return null;
  }
}

function saveWalletSession(session) {
  fs.writeFileSync(WALLET_PATH, JSON.stringify(session, null, 2));
}

// --- Shared wallet nav helpers ---

function truncateWalletAddress(address) {
  if (!address || address.length < 16) return address || "Connected";
  return address.slice(0, 8) + "…" + address.slice(-6);
}

// Returns the wallet nav anchor HTML (SSR). id="wallet-nav-link" is updated by JS after load.
function walletNavHtml(session) {
  if (session && session.address) {
    const short = truncateWalletAddress(session.address);
    return `<a href="/wallet" id="wallet-nav-link" style="color:#22c55e;" title="${session.address}">&#9679; ${short}</a>`;
  }
  return `<a href="/wallet" id="wallet-nav-link">Wallet</a>`;
}

// Inline script injected into every main page — refreshes wallet nav from server session.
const walletStatusScript = `
<script>
(function() {
  fetch('/wallet/status').then(r => r.json()).then(data => {
    const el = document.getElementById('wallet-nav-link');
    if (!el) return;
    if (data.connected && data.session && data.session.address) {
      const addr = data.session.address;
      const short = addr.length > 16 ? addr.slice(0, 8) + '\\u2026' + addr.slice(-6) : addr;
      el.textContent = '\\u25CF ' + short;
      el.style.color = '#22c55e';
      el.title = addr;
    } else {
      el.textContent = 'Connect Wallet';
      el.style.color = '';
      el.title = '';
    }
  }).catch(() => {});
})();
</script>`;

// ---- end wallet nav helpers ----

function updateEntryAnchorFields(entryId, fields) {
  try {
    const entries = readEntries();
    const idx = entries.findIndex((e) => e.id === entryId);
    if (idx === -1) return;
    entries[idx] = { ...entries[idx], ...fields };
    fs.writeFileSync(ENTRIES_PATH, JSON.stringify(entries, null, 2));
  } catch (err) {
    console.error("[anchor] failed to update entry anchor fields:", err.message);
  }
}

async function anchorEntryInBackground(entryId, aircraftId) {
  try {
    const entries = readEntries();
    const entry = entries.find((e) => e.id === entryId);
    if (!entry) return;
    // Use pre-computed canonical hash stored at save time
    const recordHash = entry.anchorHash;
    if (!recordHash) return;
    const aircraftList = readAircraft();
    const aircraft = aircraftList.find((a) => a.ident === aircraftId || a.id === aircraftId) || aircraftList[0];
    const airframeId = aircraft
      ? createHash("sha256").update(String(aircraft.ident || aircraftId).toUpperCase()).digest("hex")
      : createHash("sha256").update(String(aircraftId).toUpperCase()).digest("hex");
    const result = await anchorOnMidnight({
      anchorHash: recordHash,
      airframeId,
      hours: Number(entry.totalTime || entry.total || 0),
    });
    if (result.anchored) {
      const anchoredAt = result.anchoredAt || new Date().toISOString();
      updateEntryAnchorFields(entryId, {
        anchorStatus: "anchored",
        anchored: true,
        anchoredAt,
        anchorTx: result.anchorId || null,
        anchorHash: recordHash,
        anchor: {
          hash: recordHash,
          walletAddress: entry.anchor?.walletAddress || null,
          anchoredAt,
          status: "anchored",
        },
      });
    } else {
      updateEntryAnchorFields(entryId, {
        anchorStatus: "anchor_failed",
        anchored: false,
        anchorHash: recordHash,
        anchor: {
          hash: recordHash,
          walletAddress: entry.anchor?.walletAddress || null,
          anchoredAt: entry.anchor?.anchoredAt || new Date().toISOString(),
          status: "anchor_failed",
        },
      });
    }
  } catch (err) {
    console.error("[anchor] background anchor error:", err.message);
    updateEntryAnchorFields(entryId, { anchorStatus: "anchor_failed", anchored: false });
  }
}

function readProfile() {
  try {
    const raw = fs.readFileSync(PROFILE_PATH, "utf-8");
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function saveProfile(profile) {
  fs.writeFileSync(PROFILE_PATH, JSON.stringify(profile, null, 2));
}

function readAircraft() {
  try {
    const raw = fs.readFileSync(AIRCRAFT_PATH, "utf-8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed?.aircraft) ? parsed.aircraft : [];
  } catch {
    return [];
  }
}

function readVerification() {
  try {
    const raw = fs.readFileSync(VERIFICATION_PATH, "utf-8");
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function readMaintenance() {
  try {
    const raw = fs.readFileSync(MAINTENANCE_PATH, "utf-8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function sortNewestFirst(entries) {
  return entries.sort((a, b) => String(b.date).localeCompare(String(a.date)));
}

function computeTotals(entries) {
  return entries.reduce(
    (acc, e) => {
      acc.total += Number(e.totalTime || e.total || 0);
      acc.pic += Number(e.pic || 0);
      acc.dual += Number(e.dual || 0);
      acc.xc += Number(e.xc || 0);
      acc.night += Number(e.night || 0);
      acc.actualInstrument += Number(e.actualInstrument || 0);
      acc.simulatedInstrument += Number(e.simulatedInstrument || 0);

      acc.approaches += Number(e.approaches || 0);
      acc.holds += Number(e.holds || 0);
      acc.intercepts += Number(e.intercepts || 0);

      acc.dayLandings += Number(e.dayLandings || 0);
      acc.nightLandings += Number(e.nightLandings || 0);
      return acc;
    },
    {
      total: 0,
      pic: 0,
      dual: 0,
      xc: 0,
      night: 0,
      actualInstrument: 0,
      simulatedInstrument: 0,

      approaches: 0,
      holds: 0,
      intercepts: 0,

      dayLandings: 0,
      nightLandings: 0,
    }
  );
}

function withinDays(dateIso, asOfIso, days) {
  const d = new Date(dateIso).getTime();
  const asOf = new Date(asOfIso).getTime();
  const diffMs = asOf - d;
  return diffMs >= 0 && diffMs <= days * 24 * 60 * 60 * 1000;
}

function monthsAgoIso(asOfIso, months) {
  const d = new Date(asOfIso);
  const cut = new Date(d);
  cut.setMonth(cut.getMonth() - months);
  return cut.toISOString();
}

// NOTE: simplified cutoff (we can refine to “6 calendar months” rule later)
function addMonths(dateIso, months) {
  const d = new Date(dateIso);
  const x = new Date(d);
  x.setMonth(x.getMonth() + months);
  return x.toISOString();
}

function isWithinMonths(asOfIso, dateIso, months) {
  if (!dateIso) return false;
  const start = new Date(dateIso).getTime();
  const end = new Date(addMonths(dateIso, months)).getTime();
  const asOf = new Date(asOfIso).getTime();
  return asOf >= start && asOf <= end;
}

function isFuture(asOfIso, dateIso) {
  if (!dateIso) return false;
  return new Date(dateIso).getTime() >= new Date(asOfIso).getTime();
}

function sumLandings(entries) {
  return entries.reduce(
    (acc, e) => {
      acc.day += Number(e.dayLandings || 0);
      acc.night += Number(e.nightLandings || 0);
      return acc;
    },
    { day: 0, night: 0 }
  );
}

function sumIfr(entries) {
  return entries.reduce(
    (acc, e) => {
      acc.approaches += Number(e.approaches || 0);
      acc.holds += Number(e.holds || 0);
      acc.intercepts += Number(e.intercepts || 0);
      return acc;
    },
    { approaches: 0, holds: 0, intercepts: 0 }
  );
}

function formatDateShort(dateIso) {
  if (!dateIso) return "Not set";
  const d = new Date(dateIso);
  if (Number.isNaN(d.getTime())) return "Not set";
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function addDays(dateIso, days) {
  const d = new Date(dateIso);
  const x = new Date(d);
  x.setDate(x.getDate() + days);
  return x.toISOString();
}

function latestDate(entries, getter) {
  let latest = null;
  for (const e of entries) {
    const value = Number(getter(e) || 0);
    if (value > 0) {
      if (!latest || String(e.date) > String(latest)) latest = e.date;
    }
  }
  return latest;
}

function daysUntil(asOfIso, dateIso) {
  if (!dateIso) return null;
  const asOf = new Date(asOfIso).getTime();
  const due = new Date(dateIso).getTime();
  if (Number.isNaN(asOf) || Number.isNaN(due)) return null;
  return Math.ceil((due - asOf) / (24 * 60 * 60 * 1000));
}

function dueClass(asOfIso, dateIso) {
  const d = daysUntil(asOfIso, dateIso);
  if (d === null) return "muted";
  if (d < 0) return "bad";
  if (d <= 30) return "warn";
  return "ok";
}

function dueLabel(asOfIso, dateIso) {
  const d = daysUntil(asOfIso, dateIso);
  if (d === null) return "Not set";
  if (d < 0) return `${formatDateShort(dateIso)} · overdue`;
  if (d === 0) return `${formatDateShort(dateIso)} · due today`;
  return `${formatDateShort(dateIso)} · ${d} day${d === 1 ? "" : "s"} left`;
}

function hashLogbook(entries, profile, aircraft) {
  const payload = {
    entries,
    profile,
    aircraft
  };

  const json = JSON.stringify(payload, Object.keys(payload).sort());
  return createHash("sha256").update(json).digest("hex");
}

function scoreClass(score) {
  if (score >= 85) return "ok";
  if (score >= 60) return "warn";
  return "bad";
}

const app = express();
app.use(express.json());

app.get("/health", (_req, res) => {
  res.status(200).send("OK");
});

// Compute passenger currency for a given landing type over 90 days.
// Returns { status: 'green'|'yellow'|'red', count, daysUntilExpiry, message, action }
function computePassengerCurrency(entries, type /* 'day' | 'night' */, asOf) {
  const cutoff = new Date(asOf);
  cutoff.setDate(cutoff.getDate() - 90);
  const cutoffMs = cutoff.getTime();
  const asOfMs = new Date(asOf).getTime();

  const field = type === 'day' ? 'dayLandings' : 'nightLandings';

  // Collect individual landing events sorted oldest-first within 90-day window
  const landingDates = [];
  for (const e of entries) {
    const d = new Date(e.date);
    if (!isNaN(d) && d.getTime() >= cutoffMs) {
      const n = Number(e[field] || 0);
      for (let i = 0; i < n; i++) landingDates.push(d.getTime());
    }
  }
  landingDates.sort((a, b) => a - b);

  const count = landingDates.length;
  const label = type === 'day' ? 'day' : 'night';

  if (count >= 3) {
    // Current — find when oldest of last-3 will age out of 90-day window
    const oldest3 = landingDates[landingDates.length - 3];
    const expiryMs = oldest3 + 90 * 24 * 60 * 60 * 1000;
    const daysLeft = Math.ceil((expiryMs - asOfMs) / (24 * 60 * 60 * 1000));
    return {
      status: 'green',
      count,
      daysUntilExpiry: daysLeft,
      message: `You're current to carry passengers during the ${label}.`,
      action: `Currency valid for ${daysLeft} more day${daysLeft === 1 ? '' : 's'}.`,
    };
  }

  const needed = 3 - count;

  if (count === 0) {
    return {
      status: 'red',
      count,
      daysUntilExpiry: 0,
      message: `You are not current. You need ${needed} ${label} landing${needed === 1 ? '' : 's'} to carry passengers.`,
      action: `Complete ${needed} landing${needed === 1 ? '' : 's'} to restore currency.`,
    };
  }

  // Has some landings — find when the most recent will age out
  const newestMs = landingDates[landingDates.length - 1];
  const expiryMs = newestMs + 90 * 24 * 60 * 60 * 1000;
  const daysLeft = Math.ceil((expiryMs - asOfMs) / (24 * 60 * 60 * 1000));

  if (daysLeft > 0 && daysLeft <= 14) {
    return {
      status: 'yellow',
      count,
      daysUntilExpiry: daysLeft,
      message: `You need ${needed} more ${label} landing${needed === 1 ? '' : 's'} in the next ${daysLeft} day${daysLeft === 1 ? '' : 's'} to stay current.`,
      action: `Act soon — currency window closing.`,
    };
  }

  if (daysLeft <= 0) {
    return {
      status: 'red',
      count,
      daysUntilExpiry: 0,
      message: `You are not current. You need ${needed} more ${label} landing${needed === 1 ? '' : 's'} to carry passengers.`,
      action: `Complete ${needed} landing${needed === 1 ? '' : 's'} to restore currency.`,
    };
  }

  // > 14 days left but < 3 landings (edge case: they have some but need more, not urgent yet)
  return {
    status: 'yellow',
    count,
    daysUntilExpiry: daysLeft,
    message: `You need ${needed} more ${label} landing${needed === 1 ? '' : 's'} to be current.`,
    action: `${daysLeft} day${daysLeft === 1 ? '' : 's'} until existing landings expire.`,
  };
}

app.get("/", (_req, res) => {
  const entries = sortNewestFirst(readEntries());
  const totals = computeTotals(entries);
  const recent = entries.slice(0, 10);
  const profile = readProfile();
  const walletSession = readWalletSession();

  const pilotName = profile?.pilot?.fullName || "Pilot";

  const fmt = (n) => Number(n || 0).toFixed(1);
  const totalFlights = entries.length;
  const lastFlightDate = entries[0]?.date ? String(entries[0].date).slice(0, 10) : "—";
  const landings = Number(totals.dayLandings || 0) + Number(totals.nightLandings || 0);

  // Aircraft summary from entries
  const aircraftStats = {};
  for (const e of entries) {
    const ident = e.aircraftIdent || e.aircraftId || "Unknown";
    if (!aircraftStats[ident]) {
      aircraftStats[ident] = { flights: 0, hours: 0, lastFlight: e.date, type: e.aircraftType || "" };
    }
    aircraftStats[ident].flights += 1;
    aircraftStats[ident].hours += Number(e.totalTime || e.total || 0);
    if (String(e.date) > String(aircraftStats[ident].lastFlight)) {
      aircraftStats[ident].lastFlight = e.date;
    }
  }
  const sortedAircraft = Object.entries(aircraftStats)
    .sort((a, b) => String(b[1].lastFlight).localeCompare(String(a[1].lastFlight)));
  const lastUsedAircraft = sortedAircraft.length > 0 ? sortedAircraft[0][0] : "";
  const aircraftRows = sortedAircraft
    .map(([ident, s]) => `
      <tr>
        <td>${ident}</td>
        <td class="muted">${s.type}</td>
        <td>${s.flights}</td>
        <td>${fmt(s.hours)} hrs</td>
        <td class="muted">${String(s.lastFlight || "").slice(0, 10)}</td>
      </tr>
    `).join("");

  res.type("html").send(`<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>PilotLog</title>
  <style>
  body { font-family: -apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial,sans-serif; background:#0b0f18; color:#fff; margin:0; }
  .wrap { max-width: 1080px; margin: 0 auto; padding: 32px 20px; }
  .topbar { display:flex; justify-content:space-between; align-items:center; margin-bottom:28px; flex-wrap:wrap; gap:12px; }
  .brand { font-size:20px; font-weight:800; letter-spacing:-0.5px; }
  .nav a { color:#9aa3ff; text-decoration:none; font-size:14px; margin-left:16px; }
  .nav a:hover { color:#fff; }
  .hero { margin-bottom:24px; }
  .big { font-size:56px; font-weight:800; letter-spacing:-1px; }
  .sub { color:#b6b9c6; margin-top:6px; font-size:15px; }
  .grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(200px,1fr)); gap:12px; margin-top:20px; }
  .card { background:#121624; border:1px solid #222843; border-radius:14px; padding:16px; }
  .label { color:#b6b9c6; font-size:12px; text-transform:uppercase; letter-spacing:.08em; }
  .val { font-size:28px; font-weight:700; margin-top:8px; }
  .table { margin-top:24px; background:#121624; border:1px solid #222843; border-radius:14px; overflow:hidden; }
  .table-title { padding:14px 16px 0; font-size:13px; font-weight:700; color:#b6b9c6; text-transform:uppercase; letter-spacing:.06em; }
  table { width:100%; border-collapse:collapse; }
  th, td { padding:10px 14px; border-bottom:1px solid #1f2440; text-align:left; font-size:14px; }
  th { background:#0f1320; color:#b6b9c6; font-weight:700; }
  tr:last-child td { border-bottom:none; }
  .muted { color:#b6b9c6; }
  .btn { display:inline-block; padding:10px 20px; background:#1a3a8f; color:#fff; border-radius:8px; font-size:14px; font-weight:700; text-decoration:none; }
  .btn:hover { background:#1e46b0; }
  .btn-outline { background:transparent; border:1px solid #222843; color:#9aa3ff; }
  .actions { display:flex; gap:12px; margin-top:20px; flex-wrap:wrap; align-items:center; }
  .log-form { display:none; background:#121624; border:1px solid #222843; border-radius:14px; padding:20px; margin-top:16px; }
  .log-form.open { display:block; }
  .log-form h3 { margin:0 0 16px; font-size:15px; font-weight:700; }
  .form-row { display:flex; gap:12px; flex-wrap:wrap; margin-bottom:12px; }
  .form-field { display:flex; flex-direction:column; gap:4px; flex:1; min-width:120px; }
  .form-field label { font-size:11px; color:#b6b9c6; text-transform:uppercase; letter-spacing:.06em; }
  .form-field input { background:#0b0f18; border:1px solid #222843; border-radius:6px; padding:8px 10px; color:#fff; font-size:14px; width:100%; box-sizing:border-box; }
  .form-field input:focus { outline:none; border-color:#1a3a8f; }
  .form-actions { display:flex; gap:10px; margin-top:4px; }
  .btn-sm { padding:8px 16px; font-size:13px; }
  .btn-cancel { background:transparent; border:1px solid #222843; color:#b6b9c6; border-radius:8px; padding:8px 16px; font-size:13px; cursor:pointer; }
  .btn-cancel:hover { color:#fff; }
  .toast { display:none; position:fixed; bottom:24px; right:24px; background:#1a3a8f; color:#fff; padding:12px 20px; border-radius:10px; font-size:14px; font-weight:600; z-index:999; }
  .toast.show { display:block; }
  .assistant-section { margin-top:20px; }
  .readiness-chip { display:inline-flex; align-items:center; gap:8px; padding:8px 16px; border-radius:999px; font-size:13px; font-weight:700; margin-bottom:14px; }
  .currency-cards { display:grid; grid-template-columns:repeat(auto-fit,minmax(240px,1fr)); gap:12px; }
  .currency-card { background:#121624; border:1px solid #222843; border-radius:14px; padding:16px; }
  .currency-card-header { display:flex; align-items:center; gap:8px; margin-bottom:8px; }
  .currency-dot { width:10px; height:10px; border-radius:50%; flex-shrink:0; }
  .currency-type { font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:.08em; color:#b6b9c6; }
  .currency-status-label { font-size:13px; font-weight:700; }
  .currency-message { font-size:13px; color:#b6b9c6; margin-top:4px; line-height:1.5; }
  .currency-action { font-size:12px; color:#9aa3ff; margin-top:6px; }
  .section-title { font-size:12px; font-weight:700; text-transform:uppercase; letter-spacing:.08em; color:#b6b9c6; margin-bottom:10px; }
  @media(max-width:820px) { .big { font-size:40px; } }
  /* Today Card */
  #today-card { background:#0d1220; border:1px solid #1e2a48; border-radius:16px; padding:18px 20px; margin-bottom:14px; }
  .today-card-header { display:flex; align-items:center; gap:8px; margin-bottom:12px; }
  .phase-badge { font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:.08em; background:#1a2240; color:#9aa3ff; padding:3px 10px; border-radius:999px; }
  .urgency-badge { font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:.08em; padding:3px 10px; border-radius:999px; margin-left:auto; }
  .urgency-badge.critical { background:#2a0a0a; color:#ef4444; }
  .urgency-badge.important { background:#1c1203; color:#f59e0b; }
  .urgency-badge.optional { background:#0f1235; color:#6366f1; }
  .urgency-badge.none { background:#1a1f30; color:#b6b9c6; }
  .today-headline { font-size:16px; font-weight:700; color:#fff; margin-bottom:4px; line-height:1.4; }
  .today-reason { font-size:13px; color:#b6b9c6; line-height:1.5; margin-bottom:10px; }
  .today-meta { display:flex; gap:16px; margin-bottom:12px; flex-wrap:wrap; }
  .today-meta-item { font-size:11px; color:#6b7280; }
  .today-meta-item span { color:#9aa3ff; font-weight:600; }
  .today-footer { display:flex; gap:8px; flex-wrap:wrap; }
  .secondary-chip { font-size:12px; background:#111827; border:1px solid #222843; color:#6b7280; border-radius:8px; padding:6px 12px; }
  .today-outcome { font-size:12px; color:#22c55e; font-weight:600; margin-bottom:4px; margin-top:-4px; }
  .today-cta { display:inline-block; margin-top:12px; padding:9px 20px; background:#1a3a8f; color:#fff; border:none; border-radius:8px; font-size:13px; font-weight:700; cursor:pointer; text-decoration:none; }
  .today-cta:hover { background:#1e46b0; }
  .journey-blocker { font-size:11px; color:#6b7280; text-align:center; margin-top:-8px; margin-bottom:10px; }
  .today-changed { font-size:12px; color:#22c55e; font-weight:600; margin-bottom:6px; }
  /* De-emphasize readiness lanes */
  .currency-cards { opacity:0.75; }
  /* Journey Strip */
  #journey-strip { display:flex; align-items:center; gap:0; margin-bottom:14px; }
  .journey-step { display:flex; flex-direction:column; align-items:center; flex:1; position:relative; }
  .journey-step-dot { width:10px; height:10px; border-radius:50%; border:2px solid #222843; background:#0b0f18; flex-shrink:0; z-index:1; }
  .journey-step.complete .journey-step-dot { background:#22c55e; border-color:#22c55e; }
  .journey-step.active .journey-step-dot { background:#9aa3ff; border-color:#9aa3ff; box-shadow:0 0 0 3px rgba(154,163,255,.2); }
  .journey-step.upcoming .journey-step-dot { background:#0b0f18; border-color:#374151; }
  .journey-step-label { font-size:10px; font-weight:600; text-transform:uppercase; letter-spacing:.06em; margin-top:5px; text-align:center; }
  .journey-step.complete .journey-step-label { color:#22c55e; }
  .journey-step.active .journey-step-label { color:#9aa3ff; }
  .journey-step.upcoming .journey-step-label { color:#374151; }
  .journey-connector { flex:1; height:1px; background:#222843; align-self:center; margin-bottom:16px; }
  .journey-connector.complete { background:#22c55e; }
  </style>
</head>
<body>
<div class="wrap">
  <div class="topbar">
    <div class="brand">PilotLog</div>
    <div class="nav">
      ${walletNavHtml(walletSession)}
      <a href="/pilot-report">Pilot Report →</a>
    </div>
  </div>

  <div class="hero">
    <div class="big">${fmt(totals.total)} hrs</div>
    <div class="sub">${pilotName} · PIC ${fmt(totals.pic)} · XC ${fmt(totals.xc)} · Night ${fmt(totals.night)}</div>
  </div>

  <div class="grid">
    <div class="card">
      <div class="label">Total Flights</div>
      <div class="val">${totalFlights}</div>
    </div>
    <div class="card">
      <div class="label">Total Time</div>
      <div class="val">${fmt(totals.total)} hrs</div>
    </div>
    <div class="card">
      <div class="label">Last Flight</div>
      <div class="val" style="font-size:20px;margin-top:10px;">${lastFlightDate}</div>
    </div>
    <div class="card">
      <div class="label">Landings</div>
      <div class="val">${landings}</div>
    </div>
  </div>

  <div class="assistant-section">
    <div class="section-title">Flight Readiness</div>
    <div id="readiness-chip" class="readiness-chip" style="background:#1a1f30;color:#b6b9c6;">
      <span id="readiness-dot" style="width:8px;height:8px;border-radius:50%;background:#b6b9c6;display:inline-block;"></span>
      <span id="readiness-label">Loading…</span>
    </div>
    <div id="today-card" style="display:none;"></div>
    <div id="journey-strip" style="display:none;"></div>
    <div id="journey-blocker" class="journey-blocker" style="display:none;"></div>
    <div class="currency-cards" id="readiness-cards">
      <div class="currency-card" style="color:#b6b9c6;font-size:13px;">Checking readiness…</div>
    </div>
  </div>

  <div id="wallet-home-bar" style="display:flex;align-items:center;gap:12px;padding:12px 16px;background:#0d1220;border:1px solid #1e2a48;border-radius:12px;margin-bottom:16px;font-size:13px;">
    <span id="wallet-home-dot" style="width:8px;height:8px;border-radius:50%;background:#374151;flex-shrink:0;"></span>
    <span id="wallet-home-label" style="font-weight:600;color:#b6b9c6;">Checking wallet…</span>
    <span id="wallet-home-addr" style="color:#6b7280;flex:1;"></span>
    <button id="wallet-home-btn" onclick="connectWalletHome()" style="padding:6px 14px;background:#1a3a8f;color:#fff;border:none;border-radius:6px;font-size:12px;font-weight:700;cursor:pointer;display:none;">Connect Wallet</button>
    <a href="/wallet" style="font-size:12px;color:#6b7280;text-decoration:none;">Details →</a>
  </div>

  <div class="actions">
    <button class="btn btn-outline" id="openLogBtn" onclick="toggleForm()">+ Log Flight</button>
    <a href="/pilot-report" class="btn">View Pilot Report →</a>
  </div>

  <div class="log-form" id="logForm">
    <h3>Log a Flight</h3>
    <form id="flightForm" onsubmit="submitFlight(event)">
      <div class="form-row">
        <div class="form-field">
          <label>Aircraft ID</label>
          <input type="text" name="aircraftId" placeholder="e.g. N123AB" required />
        </div>
        <div class="form-field">
          <label>Date</label>
          <input type="date" name="date" value="${new Date().toISOString().slice(0,10)}" required />
        </div>
        <div class="form-field">
          <label>Total Time (hrs)</label>
          <input type="number" name="totalTime" placeholder="1.5" min="0" step="0.1" required />
        </div>
        <div class="form-field">
          <label>Day Landings</label>
          <input type="number" name="dayLandings" placeholder="1" min="0" step="1" value="0" />
        </div>
        <div class="form-field">
          <label>Night Landings</label>
          <input type="number" name="nightLandings" placeholder="0" min="0" step="1" value="0" />
        </div>
      </div>
      <div class="form-row">
        <div class="form-field">
          <label>From</label>
          <input type="text" name="from" placeholder="KAPA" maxlength="10" />
        </div>
        <div class="form-field">
          <label>To</label>
          <input type="text" name="to" placeholder="KADS" maxlength="10" />
        </div>
        <div class="form-field" style="flex:2;min-width:200px;">
          <label>Remarks</label>
          <input type="text" name="remarks" placeholder="Optional notes" />
        </div>
      </div>
      <div class="form-actions">
        <button type="submit" class="btn btn-sm">Save Flight</button>
        <button type="button" class="btn-cancel" onclick="toggleForm()">Cancel</button>
      </div>
    </form>
  </div>

  <div class="toast" id="toast"></div>

  <script>
    const lastUsedAircraft = ${JSON.stringify(lastUsedAircraft)};

    // Wallet home bar — shows connection status and connect button
    (async function initWalletHomeBar() {
      const dot = document.getElementById('wallet-home-dot');
      const label = document.getElementById('wallet-home-label');
      const addrEl = document.getElementById('wallet-home-addr');
      const btn = document.getElementById('wallet-home-btn');
      try {
        const data = await fetch('/wallet/status').then(r => r.json());
        if (data.connected && data.session?.address) {
          const addr = data.session.address;
          const short = addr.length > 16 ? addr.slice(0,8) + '\\u2026' + addr.slice(-6) : addr;
          dot.style.background = '#22c55e';
          label.textContent = 'Wallet Connected';
          label.style.color = '#22c55e';
          addrEl.textContent = short;
          btn.style.display = 'none';
        } else {
          dot.style.background = '#ef4444';
          label.textContent = 'Wallet required to save flights';
          label.style.color = '#f59e0b';
          btn.style.display = 'inline-block';
        }
      } catch (_) {
        dot.style.background = '#374151';
        label.textContent = 'Wallet status unknown';
        btn.style.display = 'inline-block';
      }
    })();

    async function connectWalletHome() {
      const btn = document.getElementById('wallet-home-btn');
      btn.textContent = 'Connecting…';
      btn.disabled = true;
      const wallet = window.midnight?.['1am'];
      if (!wallet || typeof wallet.connect !== 'function') {
        alert('1AM wallet extension not found. Install the Midnight 1AM extension to continue.');
        btn.textContent = 'Connect Wallet';
        btn.disabled = false;
        return;
      }
      try {
        const api = await wallet.connect('preview');
        if (!api) throw new Error('Connection rejected');
        const state = await api.state().catch(() => ({}));
        const addr = state?.shieldedAddress || null;
        if (addr) {
          await fetch('/wallet/connect', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ address: addr }),
          });
          location.reload();
        } else {
          throw new Error('No address returned');
        }
      } catch (err) {
        btn.textContent = 'Connect Wallet';
        btn.disabled = false;
        alert('Wallet connection failed: ' + err.message);
      }
    }

    // Phase-aware readiness assistant
    (async function loadReadiness() {
      const DOMAIN_LABELS = {
        passengerCurrency:       'Passenger Currency',
        nightCurrency:           'Night Currency',
        ifrCurrency:             'IFR Currency',
        ifrProgress:             'IFR Training Progress',
        ifrProficiency:          'IFR Proficiency',
        pilotReadiness:          'Pilot Readiness',
        aircraftReadiness:       'Aircraft Readiness',
        trainingProgress:        'Training Progress',
        requiredHours:           'Required Hours',
        soloReadiness:           'Solo Readiness',
        instructorRequiredItems: 'Required Documents',
      };
      const COLOR = { current: '#22c55e', needs_attention: '#f59e0b', not_current: '#ef4444' };
      const BG = { current: '#052e16', needs_attention: '#1c1203', not_current: '#1c0505' };
      const CHIP_LABEL = { current: 'Good to Fly', needs_attention: 'Needs Attention', not_current: 'Not Current' };
      const STATUS_LABEL = { current: 'Current', needs_attention: 'Attention', not_current: 'Not Current' };
      const PRIORITY_COLOR = { critical: '#ef4444', important: '#f59e0b', optional: '#6366f1' };
      const rank = { not_current: 0, needs_attention: 1, current: 2 };

      // Phase config — keys match backend PILOT_PHASES exactly
      const PHASE_CONFIG = {
        student_ppl: {
          label: 'Student Pilot',
          coreDomains: ['instructorRequiredItems', 'soloReadiness'],
          ctaDomain: 'instructorRequiredItems',
          visibleDomains: (domains) => ['trainingProgress', 'requiredHours', 'soloReadiness', 'instructorRequiredItems'].filter(k => domains[k]),
          journeySteps: ['Foundation', 'Solo Ready', 'Checkride'],
        },
        ppl_complete: {
          label: 'Private Pilot',
          coreDomains: ['passengerCurrency', 'nightCurrency'],
          ctaDomain: 'passengerCurrency',
          visibleDomains: (domains) => ['passengerCurrency', 'nightCurrency', 'pilotReadiness', 'aircraftReadiness'].filter(k => domains[k]),
          journeySteps: ['Legal Currency', 'Proficiency', 'Confidence'],
        },
        instrument_training: {
          label: 'Instrument Training',
          coreDomains: ['ifrProgress', 'pilotReadiness'],
          ctaDomain: 'ifrProgress',
          visibleDomains: (domains) => ['pilotReadiness', 'ifrProgress', 'aircraftReadiness'].filter(k => domains[k]),
          journeySteps: ['VFR Current', 'IFR Approaches', 'IFR Rating'],
        },
        instrument_rated: {
          label: 'Instrument Rated',
          coreDomains: ['ifrCurrency', 'ifrProficiency'],
          ctaDomain: 'ifrCurrency',
          visibleDomains: (domains) => ['ifrCurrency', 'ifrProficiency', 'passengerCurrency', 'pilotReadiness', 'aircraftReadiness'].filter(k => domains[k]),
          journeySteps: ['VFR Baseline', 'IFR Currency', 'IFR Proficiency'],
        },
        commercial: {
          label: 'Commercial Pilot',
          coreDomains: ['passengerCurrency', 'ifrCurrency'],
          ctaDomain: 'passengerCurrency',
          visibleDomains: (domains) => ['passengerCurrency', 'ifrCurrency', 'nightCurrency', 'pilotReadiness', 'aircraftReadiness'].filter(k => domains[k]),
          journeySteps: ['Currency', 'Proficiency', 'Operations'],
        },
        cfi: {
          label: 'CFI',
          coreDomains: ['passengerCurrency', 'pilotReadiness'],
          ctaDomain: 'passengerCurrency',
          visibleDomains: (domains) => ['passengerCurrency', 'ifrCurrency', 'nightCurrency', 'pilotReadiness', 'aircraftReadiness'].filter(k => domains[k]),
          journeySteps: ['Current', 'Proficient', 'Ready to Teach'],
        },
      };
      // Fallback for legacy or unknown phase keys
      PHASE_CONFIG['student'] = PHASE_CONFIG['student_ppl'];
      PHASE_CONFIG['private_pilot'] = PHASE_CONFIG['ppl_complete'];
      const MAINTENANCE_FALLBACKS = ['Review upcoming proficiency dates', 'Log your next planned practice flight'];

      function scoreCandidate(key, domain, phase) {
        const statusW = { not_current: 3, needs_attention: 2, current: 0 };
        const priorityW = { critical: 3, important: 2, optional: 1 };
        const coreDomains = PHASE_CONFIG[phase]?.coreDomains || [];
        const phaseMultiplier = coreDomains.includes(key) ? 1.2 : 1.0;
        const s = (statusW[domain.status] || 0) + (priorityW[domain.priority] || 0);
        return s * phaseMultiplier;
      }

      try {
        const res = await fetch('/assistant/readiness');
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const data = await res.json();
        const domains = data.domains || {};
        const phase = data.phase || 'ppl_complete';
        const phaseConf = PHASE_CONFIG[phase] || PHASE_CONFIG.ppl_complete;

        // Determine visible domains for this phase (max 4)
        const phaseVisibleKeys = phaseConf.visibleDomains(domains).filter(k => domains[k]).slice(0, 4);

        // Find worst status among all phase-visible domains (for chip)
        let worst = 'current';
        for (const key of phaseVisibleKeys) {
          const s = domains[key]?.status;
          if (s && rank[s] < rank[worst]) worst = s;
        }

        // Update chip
        const chip = document.getElementById('readiness-chip');
        chip.style.background = BG[worst];
        chip.style.color = COLOR[worst];
        document.getElementById('readiness-dot').style.background = COLOR[worst];
        document.getElementById('readiness-label').textContent = data.summary || CHIP_LABEL[worst];

        // Filter out "current" domains — only show actionable items
        // Exception: if ALL are current, visibleKeys stays empty and allZero triggers the all-current state
        const visibleKeys = phaseVisibleKeys.filter(k => domains[k]?.status !== 'current');

        // Score and rank candidates
        const scored = visibleKeys
          .map(key => ({ key, domain: domains[key], score: scoreCandidate(key, domains[key], phase) }))
          .sort((a, b) => b.score - a.score || a.key.localeCompare(b.key));

        const allZero = visibleKeys.length === 0 || scored.every(c => c.score === 0);

        // Post-action feedback
        const justLogged = sessionStorage.getItem('airlog_just_logged');
        sessionStorage.removeItem('airlog_just_logged');
        const changedBanner = justLogged ? \`<div class="today-changed">✓ Flight logged. Readiness updated.</div>\` : '';

        // CTA helpers
        function buildCta(pd) {
          const ctaType = pd.ctaType || 'record';
          const ctaLabel = pd.ctaLabel || 'View Pilot Report →';
          if (ctaType === 'log') {
            return \`<button class="today-cta" onclick="openLogForm()">\${ctaLabel}</button>\`;
          }
          if (ctaType === 'plan') {
            return \`<button class="today-cta" onclick="openLogForm()">\${ctaLabel}</button>\`;
          }
          return \`<a class="today-cta" href="/pilot-report">\${ctaLabel}</a>\`;
        }

        // Today Card
        const todayEl = document.getElementById('today-card');
        todayEl.style.display = 'block';
        if (allZero) {
          todayEl.innerHTML = \`
            \${changedBanner}
            <div class="today-card-header">
              <span class="phase-badge">\${phaseConf.label}</span>
              <span class="urgency-badge none">All Current</span>
            </div>
            <div class="today-headline" style="color:#22c55e;">You are current. Keep momentum this week.</div>
            <div class="today-footer">
              \${MAINTENANCE_FALLBACKS.map(a => \`<span class="secondary-chip">\${a}</span>\`).join('')}
            </div>
            <button class="today-cta" onclick="openLogForm()">Log a Flight →</button>\`;
        } else {
          const primary = scored[0];
          const pd = primary.domain;
          const secondaryCandidates = scored.slice(1, 3);
          while (secondaryCandidates.length < 2) {
            secondaryCandidates.push({ key: null, domain: { title: MAINTENANCE_FALLBACKS[secondaryCandidates.length] } });
          }
          const urgencyClass = pd.priority || 'none';
          const outcomeRow = pd.outcome
            ? \`<div class="today-outcome">\${pd.outcome}</div>\`
            : '';
          todayEl.innerHTML = \`
            \${changedBanner}
            <div class="today-card-header">
              <span class="phase-badge">\${phaseConf.label}</span>
              \${pd.priority ? \`<span class="urgency-badge \${urgencyClass}">\${pd.priority}</span>\` : ''}
            </div>
            <div class="today-headline">\${(pd.title || pd.nextAction || '').slice(0,80)}</div>
            <div class="today-reason">\${(pd.why || pd.problem || '').slice(0,160)}</div>
            \${outcomeRow}
            \${buildCta(pd)}
            <div class="today-footer" style="margin-top:10px;">
              \${secondaryCandidates.map(c => \`<span class="secondary-chip">\${(c.domain.title || c.domain.nextAction || '').slice(0,52)}</span>\`).join('')}
            </div>\`;
        }

        // Journey Strip
        const journeyEl = document.getElementById('journey-strip');
        journeyEl.style.display = 'flex';
        const steps = phaseConf.journeySteps;
        // Active step: not_current → 0, needs_attention → 1, current → 2
        const activeIdx = worst === 'not_current' ? 0 : worst === 'needs_attention' ? 1 : 2;
        journeyEl.innerHTML = steps.map((label, i) => {
          const state = i < activeIdx ? 'complete' : i === activeIdx ? 'active' : 'upcoming';
          const connector = i < steps.length - 1
            ? \`<div class="journey-connector\${i < activeIdx ? ' complete' : ''}"></div>\`
            : '';
          return \`<div class="journey-step \${state}">
            <div class="journey-step-dot"></div>
            <div class="journey-step-label">\${label.slice(0,22)}</div>
          </div>\${connector}\`;
        }).join('');

        // Journey blocker line
        const blockerEl = document.getElementById('journey-blocker');
        if (!allZero) {
          const blockers = scored.filter(c => c.score > 0).map(c => DOMAIN_LABELS[c.key] || c.key);
          blockerEl.textContent = blockers.length ? 'Blocked by: ' + blockers.join(' · ') : '';
          blockerEl.style.display = blockers.length ? 'block' : 'none';
        } else {
          blockerEl.style.display = 'none';
        }

        // Readiness Lanes (max 4, priority sorted)
        const container = document.getElementById('readiness-cards');
        const laneHtml = visibleKeys.map(key => {
          const d = domains[key];
          if (!d) return '';
          const color = COLOR[d.status] || '#b6b9c6';
          const isCurrent = d.status === 'current';
          const showPriority = !isCurrent && d.priority;
          const priorityBadge = showPriority
            ? \`<span style="font-size:10px;font-weight:700;text-transform:uppercase;color:\${PRIORITY_COLOR[d.priority] || '#b6b9c6'};margin-left:auto;">\${d.priority}</span>\`
            : '';
          return \`<div class="currency-card">
            <div class="currency-card-header">
              <span class="currency-dot" style="background:\${color};"></span>
              <span class="currency-type">\${DOMAIN_LABELS[key] || key}</span>
              <span class="currency-status-label" style="color:\${color};">\${STATUS_LABEL[d.status] || d.status}</span>
              \${priorityBadge}
            </div>
            \${isCurrent ? '' : \`<div class="currency-message">\${(d.problem || '').slice(0,120)}</div>
            <div class="currency-action">→ \${(d.nextAction || '').slice(0,72)}</div>
            \${d.flightPlan ? \`<div style="font-size:11px;color:#b6b9c6;margin-top:4px;">Plan: \${d.flightPlan}\${d.effort ? \` · \${d.effort}\` : ''}</div>\` : ''}\`}
          </div>\`;
        }).join('');
        container.innerHTML = laneHtml || '<div class="currency-card" style="color:#22c55e;font-size:13px;">All domains current.</div>';

      } catch (err) {
        document.getElementById('readiness-label').textContent = 'Unavailable';
        document.getElementById('readiness-cards').innerHTML =
          '<div class="currency-card" style="color:#ef4444;font-size:13px;">Could not load readiness data.</div>';
      }
    })();

    function toggleForm() {
      const form = document.getElementById('logForm');
      const btn = document.getElementById('openLogBtn');
      const open = form.classList.toggle('open');
      btn.textContent = open ? '✕ Cancel' : '+ Log Flight';
      if (open) form.querySelector('input[name="aircraftId"]').focus();
    }
    function openLogForm() {
      const form = document.getElementById('logForm');
      if (!form.classList.contains('open')) {
        form.classList.add('open');
        document.getElementById('openLogBtn').textContent = '✕ Cancel';
      }
      if (lastUsedAircraft) {
        const acInput = form.querySelector('input[name="aircraftId"]');
        if (!acInput.value) acInput.value = lastUsedAircraft;
      }
      form.scrollIntoView({ behavior: 'smooth', block: 'start' });
      form.querySelector('input[name="totalTime"]').focus();
    }
    async function submitFlight(e) {
      e.preventDefault();
      const btn = e.target.querySelector('button[type="submit"]');
      const origBtnText = btn.textContent;

      // 1. Require wallet session before doing anything
      let walletStatus = null;
      try {
        walletStatus = await fetch('/wallet/status').then(r => r.json());
      } catch (_) {}
      if (!walletStatus?.connected) {
        showToast('Wallet required to save flight · Connect wallet to continue', true);
        return;
      }

      // 2. Require 1AM extension
      const walletExt = window.midnight?.['1am'];
      if (!walletExt || typeof walletExt.connect !== 'function') {
        showToast('Wallet extension unavailable · Reconnect wallet to continue', true);
        return;
      }

      // 3. Build flight payload
      const fd = new FormData(e.target);
      const body = {
        aircraftId: fd.get('aircraftId').toUpperCase().trim(),
        date: fd.get('date'),
        totalTime: parseFloat(fd.get('totalTime')) || 0,
        dayLandings: parseInt(fd.get('dayLandings')) || 0,
        nightLandings: parseInt(fd.get('nightLandings')) || 0,
        from: (fd.get('from') || '').toUpperCase().trim(),
        to: (fd.get('to') || '').toUpperCase().trim(),
        remarks: (fd.get('remarks') || '').trim(),
      };

      // 4. Show "Saving to chain..."
      btn.textContent = 'Saving to chain...';
      btn.disabled = true;

      let txHash = null;
      let walletAddress = walletStatus?.session?.address || null;

      // ── BLOCK 1: wallet connect ───────────────────────────────────────────
      let connectedAPI, walletConfig;
      try {
        console.log('[tx-debug] step: wallet detected');
        // 5. Connect wallet
        connectedAPI = await walletExt.connect('preview');
        if (!connectedAPI) throw new Error('wallet.connect() returned null — wallet rejected connection');
        console.log('[tx-debug] step: wallet connected', connectedAPI);
        console.log('[tx-debug] connectedAPI type:', typeof connectedAPI);
        console.log('[tx-debug] connectedAPI keys:', connectedAPI ? Object.keys(connectedAPI) : 'null');
        console.log('[tx-debug] connectedAPI.getProvingProvider:', connectedAPI?.getProvingProvider);
        console.log('[tx-debug] connectedAPI.getShieldedAddresses:', connectedAPI?.getShieldedAddresses);
        console.log('[tx-debug] connectedAPI.balanceUnsealedTransaction:', connectedAPI?.balanceUnsealedTransaction);
        console.log('[tx-debug] connectedAPI.submitTransaction:', connectedAPI?.submitTransaction);

        // 7. Get wallet config (networkId, indexer, prover URIs)
        walletConfig = await connectedAPI.getConfiguration();
        console.log('[tx-debug] step: config loaded', walletConfig);
      } catch (err) {
        btn.textContent = origBtnText;
        btn.disabled = false;
        console.error('[tx-debug] wallet connect block failed', err.message, err.stack);
        console.error('[1AM] wallet tx error:', err.message);
        showToast('Failed to save flight · Retry or reconnect wallet', true);
        return;
      }

      // ── BLOCK 2: canonical hash ───────────────────────────────────────────
      let anchorHash;
      try {
        // 8. Build canonical hash of flight data (deterministic, sorted keys)
        const sortedEntries = Object.entries(body).sort(([a],[b]) => a.localeCompare(b));
        const canonical = JSON.stringify(Object.fromEntries(sortedEntries));
        const hashBuf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical));
        anchorHash = Array.from(new Uint8Array(hashBuf)).map(b => b.toString(16).padStart(2,'0')).join('');
        console.log('[tx-debug] step: anchor hash computed', anchorHash);
      } catch (err) {
        btn.textContent = origBtnText;
        btn.disabled = false;
        console.error('[tx-debug] hash block failed', err.message, err.stack);
        console.error('[1AM] wallet tx error:', err.message);
        showToast('Failed to save flight · Retry or reconnect wallet', true);
        return;
      }

      // ── BLOCK 3: SDK import + config + providers ──────────────────────────
      let setNetworkId, CostModel, Transaction, CompiledContract, submitCallTx, httpClientProofProvider;
      let proofProvider, walletProvider, midnightProvider;
      try {
        console.log('[tx-debug] step: providers start');
        // 9. Execute transaction via 1AM wallet (browser-only, no server involvement).
        //    Import from local pre-built bundle — avoids CDN bare-specifier errors for
        //    @midnight-ntwrk/compact-runtime (WASM) which CDN cannot inline properly.
        ({ setNetworkId, CostModel, Transaction, CompiledContract, submitCallTx, httpClientProofProvider } =
          await import('/js/midnight-sdk.js'));

        setNetworkId(walletConfig.networkId);

        // ZK config provider: fetch prover key, verifier key, and IR from static assets.
        const zkConfigProvider = {
          async get(circuitId) {
            const proverUrl = \`/contract/compiled/airlog/keys/\${circuitId}.prover\`;
            const verifierUrl = \`/contract/compiled/airlog/keys/\${circuitId}.verifier\`;
            const zkirUrl = \`/contract/compiled/airlog/zkir/\${circuitId}.bzkir\`;

            console.log('[tx-debug] zkConfigProvider.get circuitId:', circuitId);
            console.log('[tx-debug] fetch prover:', proverUrl);
            let proverRes;
            try {
              proverRes = await fetch(proverUrl);
              console.log('[tx-debug] prover response:', proverRes.status, proverRes.ok);
            } catch (e) {
              console.error('[tx-debug] FETCH FAILED prover:', proverUrl, e.message);
              throw e;
            }

            console.log('[tx-debug] fetch verifier:', verifierUrl);
            let verifierRes;
            try {
              verifierRes = await fetch(verifierUrl);
              console.log('[tx-debug] verifier response:', verifierRes.status, verifierRes.ok);
            } catch (e) {
              console.error('[tx-debug] FETCH FAILED verifier:', verifierUrl, e.message);
              throw e;
            }

            console.log('[tx-debug] fetch zkir:', zkirUrl);
            let zkirRes;
            try {
              zkirRes = await fetch(zkirUrl);
              console.log('[tx-debug] zkir response:', zkirRes.status, zkirRes.ok);
            } catch (e) {
              console.error('[tx-debug] FETCH FAILED zkir:', zkirUrl, e.message);
              throw e;
            }

            if (!proverRes.ok) throw new Error(\`ZK prover key not found: \${circuitId} (status \${proverRes.status})\`);
            if (!verifierRes.ok) throw new Error(\`ZK verifier key not found: \${circuitId} (status \${verifierRes.status})\`);
            if (!zkirRes.ok) throw new Error(\`ZK IR not found: \${circuitId} (status \${zkirRes.status})\`);
            const [proverKey, verifierKey, zkir] = await Promise.all([
              proverRes.arrayBuffer().then(b => new Uint8Array(b)),
              verifierRes.arrayBuffer().then(b => new Uint8Array(b)),
              zkirRes.arrayBuffer().then(b => new Uint8Array(b)),
            ]);
            console.log('[tx-debug] zk assets loaded ok:', circuitId, { proverKey: proverKey.length, verifierKey: verifierKey.length, zkir: zkir.length });
            return { circuitId, proverKey, verifierKey, zkir };
          },
        };

        // Use ProofStation directly — no wallet-based proving.
        const proverServerUri = walletConfig.proverServerUri || 'https://proof-server.testnet-02.midnight.network';
        console.log('[tx-debug] ProofStation URI:', proverServerUri);
        console.log('[tx-debug] walletConfig.proverServerUri (raw):', walletConfig.proverServerUri);
        console.log('[tx-debug] constructing httpClientProofProvider with URL:', new URL(proverServerUri).href);
        proofProvider = httpClientProofProvider(new URL(proverServerUri), zkConfigProvider);

        const shielded = await connectedAPI.getShieldedAddresses();
        walletAddress = shielded.shieldedCoinPublicKey || walletAddress;

        walletProvider = {
          getCoinPublicKey: () => shielded.shieldedCoinPublicKey,
          getEncryptionPublicKey: () => shielded.shieldedEncryptionPublicKey,
          async balanceTx(tx) {
            const hex = tx.serialize().toString('hex');
            const result = await connectedAPI.balanceUnsealedTransaction(hex);
            return Transaction.deserialize(
              'signature', 'proof', 'binding',
              new Uint8Array(result.tx.match(/.{2}/g).map(b => parseInt(b, 16)))
            );
          },
        };

        midnightProvider = {
          async submitTx(tx) {
            const hex = tx.serialize().toString('hex');
            await connectedAPI.submitTransaction(hex);
            return tx.identifiers()[0];
          },
        };

        console.log('[tx-debug] step: providers built');
      } catch (err) {
        btn.textContent = origBtnText;
        btn.disabled = false;
        console.error('[tx-debug] provider setup block failed', err.message, err.stack);
        console.error('[1AM] wallet tx error:', err.message);
        showToast('Failed to save flight · Retry or reconnect wallet', true);
        return;
      }

      // ── BLOCK 4: compiled contract construction ───────────────────────────
      let compiledContract;
      try {
        console.log('[tx-debug] step: compiled contract start');
        // Load contract class and build a proper CompiledContract via 1AM SDK pattern.
        // DApp builds tx → wallet proves → wallet balances → wallet submits.
        // Contract bundle has compact-runtime + WASM inlined (no bare specifiers).
        const { Contract } = await import('/contract/compiled/airlog/index.browser.js');
        compiledContract = CompiledContract
          .make('AirLog', Contract)
          .pipe(
            CompiledContract.withVacantWitnesses,
            CompiledContract.withCompiledFileAssets('/contract/compiled/airlog')
          );
        console.log('[tx-debug] step: compiled contract built', compiledContract);
      } catch (err) {
        btn.textContent = origBtnText;
        btn.disabled = false;
        console.error('[tx-debug] compiled contract block failed', err.message, err.stack);
        console.error('[1AM] wallet tx error:', err.message);
        showToast('Failed to save flight · Retry or reconnect wallet', true);
        return;
      }

      // ── BLOCK 5: submitCallTx ─────────────────────────────────────────────
      try {
        const deploymentRes = await fetch('/deployment.json').then(r => r.ok ? r.json() : null);
        const contractAddress = deploymentRes?.contractAddress || null;
        if (!contractAddress) throw new Error('Contract not deployed — contractAddress missing from deployment.json');

        console.log('[tx-debug] tx built');
        console.log('[tx-debug] tx submitted', { contractAddress, circuitId: 'addEntry', anchorHash });
        const result = await submitCallTx(
          { proofProvider, walletProvider, midnightProvider },
          { compiledContract, contractAddress, circuitId: 'addEntry', args: [anchorHash] }
        );

        if (!result?.public?.txHash) throw new Error('No transaction hash returned from 1AM wallet');
        txHash = result.public.txHash;
        console.log('[tx-debug] tx hash:', txHash);

      } catch (err) {
        btn.textContent = origBtnText;
        btn.disabled = false;
        console.error('[tx-debug] submitCallTx block failed', err.message, err.stack);
        console.error('[1AM] wallet tx error:', err.message);
        showToast('Failed to save flight · Retry or reconnect wallet', true);
        return;
      }

      // 10. Only save entry after successful tx
      const res = await fetch('/entries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...body, txHash, walletAddress }),
      });

      btn.textContent = origBtnText;
      btn.disabled = false;

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        showToast('Failed to save flight · ' + (err.error || res.status), true);
        return;
      }

      e.target.reset();
      e.target.querySelector('input[name="date"]').value = new Date().toISOString().slice(0,10);
      toggleForm();
      showToast('Flight saved and verified');
      sessionStorage.setItem('airlog_just_logged', '1');
      setTimeout(() => location.reload(), 600);
    }
    function showToast(msg, isError) {
      const t = document.getElementById('toast');
      t.textContent = msg;
      t.style.background = isError ? '#7f1d1d' : '#1a3a8f';
      t.classList.add('show');
      setTimeout(() => t.classList.remove('show'), isError ? 4000 : 2500);
    }
  </script>

  ${walletStatusScript}

  ${aircraftRows ? `
  <div class="table">
    <div class="table-title">Aircraft</div>
    <table>
      <thead><tr><th>Ident</th><th>Type</th><th>Flights</th><th>Hours</th><th>Last Flight</th></tr></thead>
      <tbody>${aircraftRows}</tbody>
    </table>
  </div>
  ` : ""}

  <div class="table">
    <div class="table-title">Recent Flights</div>
    <table>
      <thead>
        <tr>
          <th>Date</th><th>Aircraft</th><th>Route</th><th>Total</th><th>PIC</th><th class="muted">Remarks</th><th>Status</th>
        </tr>
      </thead>
      <tbody>
        ${recent.map(e => {
          const anchorObj = e.anchor || null;
          const status = anchorObj?.status || e.anchorStatus || (e.anchored ? "anchored" : null);
          const statusBadge = status === "anchored"
            ? '<span style="color:#22c55e;font-size:11px;font-weight:600;">&#x2713; Saved to chain</span>'
            : status === "anchor_failed"
            ? '<span style="color:#ef4444;font-size:11px;font-weight:600;">&#x2717; Failed</span>'
            : (status === "pending_anchor" || status === "anchored_pending")
            ? '<span style="color:#f59e0b;font-size:11px;font-weight:600;">&#x29D7; Verified</span>'
            : '<span style="color:#718096;font-size:11px;">—</span>';
          return `
          <tr>
            <td>${String(e.date || "").slice(0, 10)}</td>
            <td>${e.aircraftIdent || e.aircraftId || ""} <span class="muted">${e.aircraftType ? `(${e.aircraftType})` : ""}</span></td>
            <td>${e.from || ""} → ${e.to || ""}</td>
            <td>${e.totalTime ?? e.total ?? ""}</td>
            <td>${e.pic ?? ""}</td>
            <td class="muted">${(e.remarks || "").replaceAll("<","&lt;").replaceAll(">","&gt;")}</td>
            <td>${statusBadge}</td>
          </tr>`;
        }).join("")}
        ${recent.length === 0 ? '<tr><td colspan="7" class="muted">No flights logged yet.</td></tr>' : ""}
      </tbody>
    </table>
  </div>
</div>
</body>
</html>`);
});

app.get("/maintenance", (_req, res) => {
  const records = readMaintenance();
  res.json(records);
});

app.get("/entries", (_req, res) => {
  const entries = sortNewestFirst(readEntries());
  res.json({ count: entries.length, entries });
});

app.post("/entries", (req, res) => {
  const { date, aircraftId, totalTime, dayLandings, nightLandings, from, to, remarks, txHash, walletAddress: bodyWalletAddress } = req.body || {};
  if (!aircraftId) {
    return res.status(400).json({ error: "aircraftId is required" });
  }
  // Wallet-first: require txHash — flight is only saved after successful on-chain transaction
  if (!txHash) {
    return res.status(400).json({ error: "Wallet required to save flight — no transaction hash provided" });
  }
  const walletSession = readWalletSession();
  const walletAddress = bodyWalletAddress || walletSession?.address || null;
  const entryId = randomBytes(8).toString("hex");
  const entryBase = {
    id: entryId,
    date: date || new Date().toISOString().slice(0, 10),
    aircraftId: String(aircraftId).toUpperCase().trim(),
    totalTime: Number(totalTime) || 0,
    dayLandings: Number(dayLandings) || 0,
    nightLandings: Number(nightLandings) || 0,
    from: from ? String(from).toUpperCase().trim() : "",
    to: to ? String(to).toUpperCase().trim() : "",
    remarks: remarks ? String(remarks).trim() : "",
  };
  // Compute canonical hash at save time — deterministic, sorted-key SHA-256
  const { recordId, recordHash, canonical } = canonicalizeFlightEntry(
    { ...entryBase, total: entryBase.totalTime },
    entryBase.aircraftId
  );
  const anchoredAt = new Date().toISOString();
  const entry = {
    ...entryBase,
    recordId,
    createdAt: anchoredAt,
    anchored: true,
    anchorStatus: "anchored",
    anchoredAt,
    anchorTx: txHash,
    anchorHash: recordHash,
    canonicalPayload: canonical,
    anchor: {
      hash: recordHash,
      walletAddress,
      txHash,
      anchoredAt,
      status: "anchored",
    },
  };
  const entries = readEntries();
  entries.push(entry);
  fs.writeFileSync(ENTRIES_PATH, JSON.stringify(entries, null, 2));
  res.status(201).json(entry);
});

// /entries/chain-submit is REMOVED — transactions are executed browser-side via 1AM wallet

// POST /entries/:id/anchor — trigger or re-trigger background anchor for a specific entry
app.post("/entries/:id/anchor", (req, res) => {
  const { id } = req.params;
  const entries = readEntries();
  const entry = entries.find((e) => e.id === id);
  if (!entry) return res.status(404).json({ error: "entry not found" });
  const currentStatus = entry.anchor?.status || entry.anchorStatus;
  if (currentStatus === "anchored") return res.json({ status: "anchored", message: "already anchored" });
  // Re-trigger background anchor
  setImmediate(() => anchorEntryInBackground(entry.id, entry.aircraftId));
  res.json({ status: "anchored_pending", entryId: id });
});

app.get("/dashboard", (_req, res) => {
  const entries = readEntries();
  // Pilot totals
  const totalTime = entries.reduce((s, e) => s + Number(e.totalTime || e.total || 0), 0);
  const totalFlights = entries.length;
  const lastFlightDate = entries.reduce((latest, e) => {
    const d = String(e.date || "");
    return d > latest ? d : latest;
  }, "");
  // Aircraft profiles computed from entries
  const aircraftMap = {};
  for (const e of entries) {
    const id = e.aircraftId || e.aircraftIdent || null;
    if (!id) continue;
    if (!aircraftMap[id]) aircraftMap[id] = { aircraftId: id, totalTime: 0, totalFlights: 0, lastFlown: "" };
    aircraftMap[id].totalTime += Number(e.totalTime || e.total || 0);
    aircraftMap[id].totalFlights += 1;
    const d = String(e.date || "");
    if (d > aircraftMap[id].lastFlown) aircraftMap[id].lastFlown = d;
  }
  res.json({
    pilot: { totalTime: Math.round(totalTime * 10) / 10, totalFlights, lastFlightDate },
    aircraft: Object.values(aircraftMap).map(a => ({ ...a, totalTime: Math.round(a.totalTime * 10) / 10 })),
  });
});

app.get("/recent", (req, res) => {
  const limit = Math.max(1, Math.min(100, Number(req.query.limit || 10)));
  const entries = sortNewestFirst(readEntries());
  res.json({
    count: entries.length,
    limit,
    entries: entries.slice(0, limit),
  });
});

app.get("/currency", (req, res) => {
  const asOf = String(req.query.asOf || new Date().toISOString());
  const entries = readEntries();

  // Passenger currency: 90 days
  const last90 = entries.filter((e) => withinDays(e.date, asOf, 90));
  const land90 = sumLandings(last90);

  // IFR currency: last 6 months (simplified cutoff)
  const cutoff6mo = monthsAgoIso(asOf, 6);
  const last6mo = entries.filter(
    (e) => String(e.date) >= cutoff6mo && String(e.date) <= asOf
  );
  const ifr = sumIfr(last6mo);

  const ifrCurrent =
    ifr.approaches >= 6 && ifr.holds >= 1 && ifr.intercepts >= 1;

  res.json({
    asOf,
    passengerCurrency: {
      windowDays: 90,
      dayLandingsLast90: land90.day,
      nightLandingsLast90: land90.night,
      dayCurrent: land90.day >= 3,
      nightCurrent: land90.night >= 3,
    },
    ifrCurrency: {
      windowMonths: 6,
      cutoff: cutoff6mo,
      approachesLast6Months: ifr.approaches,
      holdsLast6Months: ifr.holds,
      interceptsLast6Months: ifr.intercepts,
      current: ifrCurrent,
      rule:
        ">=6 approaches, >=1 hold, >=1 intercept/tracking in last 6 months (simplified cutoff).",
    },
  });
});

// NEW: audit-friendly details for UI
app.get("/currency/details", (req, res) => {
  const asOf = String(req.query.asOf || new Date().toISOString());
  const entries = readEntries();

  // Passenger currency: 90 days
  const last90 = entries
    .filter((e) => withinDays(e.date, asOf, 90))
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));

  const land90 = sumLandings(last90);

  // IFR currency: last 6 months (simplified cutoff)
  const cutoff6mo = monthsAgoIso(asOf, 6);
  const last6mo = entries
    .filter((e) => String(e.date) >= cutoff6mo && String(e.date) <= asOf)
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));

  const ifr = sumIfr(last6mo);

  const ifrCurrent =
    ifr.approaches >= 6 && ifr.holds >= 1 && ifr.intercepts >= 1;

  res.json({
    asOf,
    passengerWindow: {
      windowDays: 90,
      dayLandingsLast90: land90.day,
      nightLandingsLast90: land90.night,
      dayCurrent: land90.day >= 3,
      nightCurrent: land90.night >= 3,
      entries: last90,
    },
    ifrWindow: {
      windowMonths: 6,
      cutoff: cutoff6mo,
      approachesLast6Months: ifr.approaches,
      holdsLast6Months: ifr.holds,
      interceptsLast6Months: ifr.intercepts,
      current: ifrCurrent,
      rule:
        ">=6 approaches, >=1 hold, >=1 intercept/tracking in last 6 months (simplified cutoff).",
      entries: last6mo,
    },
  });
});

app.get("/profile", (_req, res) => {
  const profile = readProfile();
  if (!profile) return res.status(500).json({ error: "Failed to read profile.json" });
  res.json(profile);
});

app.get("/profile/summary", (req, res) => {
  const asOf = String(req.query.asOf || new Date().toISOString());

  const profile = readProfile();
  if (!profile) return res.status(500).json({ error: "Failed to read profile.json" });

  const entries = readEntries();

  const last90 = entries.filter((e) => withinDays(e.date, asOf, 90));
  const land90 = sumLandings(last90);

  const cutoff6mo = monthsAgoIso(asOf, 6);
  const last6mo = entries.filter(
    (e) => String(e.date) >= cutoff6mo && String(e.date) <= asOf
  );
  const ifr = sumIfr(last6mo);

  const ifrCurrent =
    ifr.approaches >= 6 && ifr.holds >= 1 && ifr.intercepts >= 1;

  const flightReviewDate = profile?.proficiency?.flightReviewDate ?? null;
  const flightReviewCurrent = isWithinMonths(asOf, flightReviewDate, 24);

  const medical = profile?.medical ?? { kind: "None" };
  let medicalCurrent = false;

  if (medical.kind === "Medical") {
    medicalCurrent = isFuture(asOf, medical.expires);
  } else if (medical.kind === "BasicMed") {
    const cmecOk = !!medical?.basicMed?.cmecDate;
    const courseOk = !!medical?.basicMed?.onlineCourseDate;
    medicalCurrent = cmecOk && courseOk;
  }

  res.json({
    asOf,
    pilot: profile?.pilot ?? {},
    medical: {
      kind: medical.kind,
      class: medical.class ?? null,
      issued: medical.issued ?? null,
      expires: medical.expires ?? null,
      basicMed: medical.basicMed ?? null,
      current: medicalCurrent
    },
    proficiency: {
      flightReviewDate,
      flightReviewCurrent,
      ipcDate: profile?.proficiency?.ipcDate ?? null
    },
    passengerCurrency: {
      windowDays: 90,
      dayLandingsLast90: land90.day,
      nightLandingsLast90: land90.night,
      dayCurrent: land90.day >= 3,
      nightCurrent: land90.night >= 3
    },
    ifrCurrency: {
      windowMonths: 6,
      cutoff: cutoff6mo,
      approachesLast6Months: ifr.approaches,
      holdsLast6Months: ifr.holds,
      interceptsLast6Months: ifr.intercepts,
      current: ifrCurrent,
      rule: ">=6 approaches, >=1 hold, >=1 intercept/tracking in last 6 months (simplified cutoff)."
    }
  });
});

app.get("/totals", (_req, res) => {
  const entries = readEntries();
  res.json({ totals: computeTotals(entries) });
});

app.get("/export", (_req, res) => {
  const entries = readEntries();
  const profile = readProfile();
  const aircraft = readAircraft();
  const verification = readVerification();

  const payload = {
    entries,
    profile,
    aircraft
  };

  const hash = hashLogbook(entries, profile, aircraft);

  res.json({
    generated: new Date().toISOString(),
    hash,
    verification,
    payload
  });
});

app.get("/export/summary", (_req, res) => {
  const entries = readEntries();
  const profile = readProfile();
  const aircraft = readAircraft();
  const verification = readVerification();

  const hash = hashLogbook(entries, profile, aircraft);

  res.json({
    generated: new Date().toISOString(),
    hash,
    verification,
    counts: {
      entries: entries.length,
      aircraft: aircraft.length,
      endorsements: profile?.endorsements?.length || 0
    },
    pilot: {
      fullName: profile?.pilot?.fullName || "",
      medicalKind: profile?.medical?.kind || "None",
      medicalClass: profile?.medical?.class || null,
      flightReviewDate: profile?.proficiency?.flightReviewDate || null
    },
    aircraftSummary: aircraft.map((a) => ({
      ident: a.ident,
      type: a.type,
      annualDue: a.annualDue || null,
      transponderDue: a.transponderDue || null,
      pitotStaticDue: a.pitotStaticDue || null,
      eltBatteryDue: a.eltBatteryDue || null
    }))
  });
});

app.get("/export/summary/download", (_req, res) => {
  const entries = readEntries();
  const profile = readProfile();
  const aircraft = readAircraft();
  const verification = readVerification();

  const hash = hashLogbook(entries, profile, aircraft);

  const payload = {
    generated: new Date().toISOString(),
    hash,
    verification,
    counts: {
      entries: entries.length,
      aircraft: aircraft.length,
      endorsements: profile?.endorsements?.length || 0
    },
    pilot: {
      fullName: profile?.pilot?.fullName || "",
      medicalKind: profile?.medical?.kind || "None",
      medicalClass: profile?.medical?.class || null,
      flightReviewDate: profile?.proficiency?.flightReviewDate || null
    },
    aircraftSummary: aircraft.map((a) => ({
      ident: a.ident,
      type: a.type,
      annualDue: a.annualDue || null,
      transponderDue: a.transponderDue || null,
      pitotStaticDue: a.pitotStaticDue || null,
      eltBatteryDue: a.eltBatteryDue || null
    }))
  };

  res.setHeader("Content-Type", "application/json");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="airlog-summary-${new Date().toISOString().slice(0,10)}.json"`
  );
  res.send(JSON.stringify(payload, null, 2));
});

app.post("/verify/anchor", async (_req, res) => {
  const entries = readEntries();
  const aircraftList = readAircraft();
  const aircraft = aircraftList[0];

  if (!aircraft) {
    return res.status(400).json({
      message: "No aircraft found to anchor",
    });
  }

  const integrity = buildIntegrityResult({ aircraft, entries });
  const totalHours = entries.reduce((s, e) => s + Number(e.total || 0), 0);

  const anchorResult = await anchorOnMidnight({
    anchorHash: integrity.anchorHash,
    airframeId: integrity.airframeId,
    hours: totalHours,
  });

  const verification = {
    ...integrity,
    anchored: anchorResult.anchored === true,
    anchorTime: anchorResult.anchoredAt || new Date().toISOString(),
    anchorTx: anchorResult.anchorId || null,
    anchorNetwork: anchorResult.network || "midnight-local",
    runtimeAvailable: anchorResult.anchored === true,
    contract: anchorResult.anchored
      ? { contractAddress: anchorResult.contractAddress, anchorId: anchorResult.anchorId }
      : anchorResult.pending
        ? "pending"
        : "unavailable",
  };

  fs.writeFileSync(VERIFICATION_PATH, JSON.stringify(verification, null, 2));

  res.json({
    message: anchorResult.anchored
      ? "Logbook anchored on Midnight local network"
      : `Anchor pending — ${anchorResult.error || "network unavailable"}`,
    verification,
  });
});  

function computeGaps(aircraft, maintenance) {
  const gaps = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // 1. Maintenance chronology gaps > 12 months
  const dated = maintenance
    .filter((m) => m.date)
    .map((m) => ({ date: new Date(String(m.date).slice(0, 10)), entry: m }))
    .filter((x) => !isNaN(x.date))
    .sort((a, b) => a.date - b.date);

  for (let i = 1; i < dated.length; i++) {
    const prev = dated[i - 1];
    const curr = dated[i];
    const daysDiff = Math.round((curr.date - prev.date) / 86400000);
    if (daysDiff > 365) {
      gaps.push({
        type: "maintenance_gap",
        description: `No maintenance recorded for ${Math.round(daysDiff / 30)} months (${String(prev.date.toISOString()).slice(0, 10)} to ${String(curr.date.toISOString()).slice(0, 10)})`,
        severity: daysDiff > 730 ? "high" : "medium",
        dateRange: {
          start: String(prev.date.toISOString()).slice(0, 10),
          end: String(curr.date.toISOString()).slice(0, 10),
        },
      });
    }
  }

  // Check gap from last maintenance to today
  if (dated.length > 0) {
    const lastDate = dated[dated.length - 1].date;
    const daysSinceLast = Math.round((today - lastDate) / 86400000);
    if (daysSinceLast > 365) {
      gaps.push({
        type: "maintenance_gap",
        description: `No maintenance recorded in the last ${Math.round(daysSinceLast / 30)} months (last entry: ${String(lastDate.toISOString()).slice(0, 10)})`,
        severity: daysSinceLast > 730 ? "high" : "medium",
        dateRange: {
          start: String(lastDate.toISOString()).slice(0, 10),
          end: today.toISOString().slice(0, 10),
        },
      });
    }
  }

  // 2. Missing annual inspection in last 12 months
  for (const a of aircraft) {
    if (!a.annualDue) {
      gaps.push({
        type: "missing_inspection",
        description: `No annual inspection date recorded for ${a.ident || "aircraft"}`,
        severity: "high",
      });
    } else {
      const annualDate = new Date(String(a.annualDue).slice(0, 10));
      const daysUntilAnnual = Math.round((annualDate - today) / 86400000);
      if (daysUntilAnnual < 0) {
        gaps.push({
          type: "missing_inspection",
          description: `Annual inspection overdue for ${a.ident || "aircraft"} (was due ${String(a.annualDue).slice(0, 10)})`,
          severity: "high",
        });
      }
    }
  }

  // 3. Overdue recurring AD compliance
  for (const m of maintenance) {
    for (const ad of (m.adCompliance || [])) {
      if (ad.nextDue) {
        const nextDueDate = new Date(String(ad.nextDue).slice(0, 10));
        if (nextDueDate < today) {
          const daysOverdue = Math.round((today - nextDueDate) / 86400000);
          gaps.push({
            type: "ad_compliance_overdue",
            description: `AD ${ad.adNumber || "unknown"} (${ad.description || m.description || "recurring"}) overdue by ${daysOverdue} days — next due was ${String(ad.nextDue).slice(0, 10)}`,
            severity: "high",
          });
        }
      }
    }
  }

  // 4. Components without TSOH/SMOH data
  const majorComponents = ["engine", "propeller", "prop"];
  const componentsCovered = new Set();
  for (const m of maintenance) {
    for (const c of m.components || []) {
      const name = (c.name || "").toLowerCase();
      for (const comp of majorComponents) {
        if (name.includes(comp)) componentsCovered.add(comp);
      }
    }
  }
  for (const a of aircraft) {
    if (!a.engineTimeSMOH && !a.engineSerial) {
      gaps.push({
        type: "missing_tsoh",
        description: `Engine time since major overhaul (SMOH) not recorded for ${a.ident || "aircraft"}`,
        severity: "medium",
        component: "engine",
      });
    }
    const propCovered = componentsCovered.has("propeller") || componentsCovered.has("prop") || a.propSerial;
    if (!propCovered) {
      gaps.push({
        type: "missing_tsoh",
        description: `Propeller service history not recorded for ${a.ident || "aircraft"}`,
        severity: "medium",
        component: "propeller",
      });
    }
  }

  // 5. Serial number consistency — detect engine/prop serial mismatches between
  //    aircraft.json master record and component entries in maintenance records.
  //    A mismatch may indicate an undisclosed engine/prop swap or a data error.
  for (const a of aircraft) {
    const engineSerial = (a.engineSerial || "").trim().toUpperCase();
    const propSerial = (a.propSerial || "").trim().toUpperCase();

    const engineSerialsInMaintenance = new Set();
    const propSerialsInMaintenance = new Set();

    for (const m of maintenance) {
      for (const c of m.components || []) {
        const name = (c.name || "").toLowerCase();
        const sn = (c.serialNumber || "").trim().toUpperCase();
        if (!sn) continue;
        if (name.includes("engine")) engineSerialsInMaintenance.add(sn);
        if (name.includes("prop")) propSerialsInMaintenance.add(sn);
      }
    }

    if (engineSerial && engineSerialsInMaintenance.size > 0 && !engineSerialsInMaintenance.has(engineSerial)) {
      gaps.push({
        type: "serial_mismatch",
        description: `Engine serial number mismatch: aircraft record shows ${a.engineSerial}, but maintenance records reference ${[...engineSerialsInMaintenance].join(", ")}. Possible undisclosed engine swap.`,
        severity: "high",
        component: "engine",
      });
    }

    if (propSerial && propSerialsInMaintenance.size > 0 && !propSerialsInMaintenance.has(propSerial)) {
      gaps.push({
        type: "serial_mismatch",
        description: `Propeller serial number mismatch: aircraft record shows ${a.propSerial}, but maintenance records reference ${[...propSerialsInMaintenance].join(", ")}. Possible undisclosed prop swap.`,
        severity: "high",
        component: "propeller",
      });
    }

    // Also flag if maintenance components reference multiple different engine/prop serials
    if (engineSerialsInMaintenance.size > 1) {
      gaps.push({
        type: "serial_mismatch",
        description: `Multiple engine serial numbers found across maintenance records (${[...engineSerialsInMaintenance].join(", ")}). Verify engine history with IA logbook.`,
        severity: "high",
        component: "engine",
      });
    }

    if (propSerialsInMaintenance.size > 1) {
      gaps.push({
        type: "serial_mismatch",
        description: `Multiple propeller serial numbers found across maintenance records (${[...propSerialsInMaintenance].join(", ")}). Verify prop history.`,
        severity: "medium",
        component: "propeller",
      });
    }
  }

  return gaps;
}

app.get("/export/sale-packet", (_req, res) => {
  const entries = readEntries();
  const profile = readProfile();
  const aircraft = readAircraft();
  const verification = readVerification();
  const maintenance = readMaintenance();

  const hash = hashLogbook(entries, profile, aircraft);

  const aircraftSummary = aircraft.map((a) => ({
    ident: a.ident,
    make: a.make || null,
    model: a.model || null,
    year: a.year || a.manufactureYear || null,
    type: a.type,
    engineTimeSMOH: a.engineTimeSMOH || null,
    avionics: a.avionics || [],
    annualDue: a.annualDue || null,
    transponderDue: a.transponderDue || null,
    pitotStaticDue: a.pitotStaticDue || null,
    eltBatteryDue: a.eltBatteryDue || null,
    notes: a.notes || ""
  }));

  const totals = computeTotals(entries);

  const maintenanceSummary = maintenance.map((m) => ({
    id: m.id,
    date: m.date,
    category: m.category,
    description: m.description,
    performedBy: m.performedBy,
    mechanic: m.mechanic,
    totalAirframeHours: m.totalAirframeHours || null,
    returnToService: m.returnToService || false,
    components: (m.components || []).map((c) => ({
      name: c.name,
      partNumber: c.partNumber || null,
      action: c.action,
      condition: c.condition
    })),
    adCompliance: m.adCompliance || [],
    documents: m.documents || []
  }));

  const gaps = computeGaps(aircraft, maintenance);

  // Build trust basis for JSON packet
  const adEntriesForPacket = maintenance.filter((m) => m.category === "ad-compliance" || (m.adCompliance && m.adCompliance.length > 0));
  const primaryA = aircraft[0] || {};
  const tbVerified = [];
  const tbAssumed = [];
  const tbMissing = [];
  if (maintenance.length > 0) tbVerified.push(`${maintenance.length} maintenance record${maintenance.length > 1 ? "s" : ""} on file`);
  if (primaryA.annualDue) tbVerified.push(`Annual inspection on file — due ${primaryA.annualDue}`);
  if (entries.length > 0) tbVerified.push(`${entries.length} flight log entries recorded`);
  if (adEntriesForPacket.length > 0) tbVerified.push(`${adEntriesForPacket.length} AD compliance records present`);
  if (primaryA.serialNumber) tbVerified.push("Aircraft serial number on file");
  if (primaryA.engineSerial) tbVerified.push("Engine serial number on file");
  tbAssumed.push("Flight hours are pilot-reported and not independently audited");
  tbAssumed.push("Aircraft specifications provided by the seller");
  if (maintenance.length > 0) tbAssumed.push("Maintenance entries reflect mechanic records — work quality not inspected by AirLog");
  if (!primaryA.annualDue) tbMissing.push("Annual inspection date not recorded");
  if (adEntriesForPacket.length === 0) tbMissing.push("No AD compliance records — compliance status cannot be confirmed");
  for (const g of gaps) {
    if (g.severity === "high" && g.description) tbMissing.push(g.description);
  }

  const packet = {
    generated: new Date().toISOString(),
    packetType: "airlog-sale-packet",
    trustBasis: { verified: tbVerified, assumed: tbAssumed, missing: tbMissing },
    gaps,
    verification: {
      anchored: verification?.anchored || false,
      anchorHash: verification?.anchorHash || null,
      anchorTime: verification?.anchorTime || null,
      anchorNetwork: verification?.anchorNetwork || null,
      anchorTx: verification?.anchorTx || null,
      currentHash: hash
    },
    aircraftSummary,
    maintenanceSummary,
    logbookSummary: {
      entries: entries.length,
      totalHours: totals.total,
      picHours: totals.pic,
      landings: Number(totals.dayLandings || 0) + Number(totals.nightLandings || 0),
      instrumentTime:
        Number(totals.actualInstrument || 0) +
        Number(totals.simulatedInstrument || 0)
    },
    pilotSummary: {
      fullName: profile?.pilot?.fullName || "",
      medicalKind: profile?.medical?.kind || "None",
      medicalClass: profile?.medical?.class || null,
      flightReviewDate: profile?.proficiency?.flightReviewDate || null,
      endorsements: profile?.endorsements?.length || 0
    }
  };

  res.setHeader("Content-Type", "application/json");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="airlog-sale-packet-${new Date().toISOString().slice(0,10)}.json"`
  );
  res.send(JSON.stringify(packet, null, 2));
});

app.get("/export/sale-packet/html", (_req, res) => {
  const entries = readEntries();
  const profile = readProfile();
  const aircraft = readAircraft();
  const verification = readVerification();
  const maintenance = readMaintenance();

  const hash = hashLogbook(entries, profile, aircraft);
  const totals = computeTotals(entries);
  const generatedDate = new Date().toISOString();
  const generatedFormatted = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

  const primaryAircraft = aircraft[0] || {};
  const anchored = verification?.anchored || false;
  const currentHash = hash;
  const anchorHash = verification?.anchorHash || null;
  const hashMatch = anchorHash && anchorHash === currentHash;
  const gaps = computeGaps(aircraft, maintenance);

  // Record quality score — weighted by documentation completeness, not blockchain status
  // On-chain anchoring is shown as a verification badge separately
  const qualityFactors = [];
  let qualityScore = 0;
  const adEntriesForScore = maintenance.filter((m) => m.category === "ad-compliance" || (m.adCompliance && m.adCompliance.length > 0));
  if (maintenance.length > 0) { qualityScore += 30; qualityFactors.push({ label: "Maintenance records present", points: 30, pass: true }); }
  else { qualityFactors.push({ label: "Maintenance records present", points: 30, pass: false }); }
  if (aircraft.length > 0 && primaryAircraft.annualDue) { qualityScore += 25; qualityFactors.push({ label: "Annual inspection date on file", points: 25, pass: true }); }
  else { qualityFactors.push({ label: "Annual inspection date on file", points: 25, pass: false }); }
  if (adEntriesForScore.length > 0) { qualityScore += 20; qualityFactors.push({ label: "AD compliance records present", points: 20, pass: true }); }
  else { qualityFactors.push({ label: "AD compliance records present", points: 20, pass: false }); }
  if (entries.length > 0) { qualityScore += 15; qualityFactors.push({ label: "Flight log entries present", points: 15, pass: true }); }
  else { qualityFactors.push({ label: "Flight log entries present", points: 15, pass: false }); }
  if (profile?.pilot?.fullName) { qualityScore += 10; qualityFactors.push({ label: "Pilot profile complete", points: 10, pass: true }); }
  else { qualityFactors.push({ label: "Pilot profile complete", points: 10, pass: false }); }

  const totalLandings = Number(totals.dayLandings || 0) + Number(totals.nightLandings || 0);
  const instrumentTime = Number(totals.actualInstrument || 0) + Number(totals.simulatedInstrument || 0);

  function fmt(val) { return val ? String(val).slice(0, 10) : "—"; }
  function fmtNum(val) { return Number(val || 0).toFixed(1); }

  const maintenanceRows = maintenance.map((m) => {
    const date = m.date ? String(m.date).slice(0, 10) : "—";
    const cat = (m.category || "").replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase());
    const rts = m.returnToService ? "✓" : "—";
    const components = m.components || [];
    const compDetail = components.length > 0
      ? `<tr class="comp-row"><td colspan="6"><div class="comp-detail"><strong>Components Serviced:</strong> ` +
        components.map(c => {
          const parts = [c.name];
          if (c.partNumber) parts.push(`P/N: ${c.partNumber}`);
          if (c.serialNumber) parts.push(`S/N: ${c.serialNumber}`);
          if (c.action) parts.push(`Action: ${c.action}`);
          return parts.join(" · ");
        }).join(" &nbsp;|&nbsp; ") + `</div></td></tr>`
      : "";
    const extraDetail = (m.remarks || m.tach != null || m.hobbs != null)
      ? `<tr class="comp-row"><td colspan="6"><div class="comp-detail">` +
        [m.tach != null ? `Tach: ${m.tach}` : null,
         m.hobbs != null ? `Hobbs: ${m.hobbs}` : null,
         m.remarks ? `Remarks: ${m.remarks}` : null
        ].filter(Boolean).join(" &nbsp;·&nbsp; ") +
        `</div></td></tr>`
      : "";
    return `<tr>
      <td>${date}</td>
      <td><span class="badge">${cat}</span></td>
      <td>${m.description || "—"}</td>
      <td>${m.mechanic || m.performedBy || "—"}</td>
      <td>${m.totalAirframeHours != null ? fmtNum(m.totalAirframeHours) + " hrs" : "—"}</td>
      <td class="rts ${m.returnToService ? "rts-yes" : "rts-no"}">${rts}</td>
    </tr>${compDetail}${extraDetail}`;
  }).join("\n");

  const qualityRows = qualityFactors.map((f) =>
    `<tr>
      <td>${f.pass ? "✓" : "✗"}</td>
      <td>${f.label}</td>
      <td>${f.pass ? f.points : 0} / ${f.points}</td>
    </tr>`
  ).join("\n");

  // AD compliance rows
  const adEntries = maintenance.filter((m) => m.category === "ad-compliance" || (m.adCompliance && m.adCompliance.length > 0));
  const now = new Date();
  const adRows = adEntries.map((m) => {
    const ads = m.adCompliance && m.adCompliance.length > 0
      ? m.adCompliance.map((ad) => {
          let nextDueCell = "—";
          if (ad.nextDue) {
            const nextDueDate = new Date(ad.nextDue);
            const overdue = nextDueDate < now;
            const daysOut = Math.round((nextDueDate - now) / (1000 * 60 * 60 * 24));
            const dueSoon = !overdue && daysOut <= 60;
            const statusBadge = overdue
              ? `<span style="display:inline-block;background:#fee2e2;color:#b91c1c;font-size:10px;font-weight:700;padding:2px 7px;border-radius:10px;margin-left:6px;">OVERDUE</span>`
              : dueSoon
              ? `<span style="display:inline-block;background:#fef3c7;color:#92400e;font-size:10px;font-weight:700;padding:2px 7px;border-radius:10px;margin-left:6px;">DUE SOON</span>`
              : "";
            nextDueCell = `<span style="color:${overdue ? "#b91c1c" : "#2d3748"};font-weight:${overdue ? "700" : "400"};">${fmt(ad.nextDue)}</span>${statusBadge}`;
          }
          return `<tr>
            <td>${ad.adNumber || "—"}</td>
            <td>${ad.description || ad.title || m.description || "—"}</td>
            <td>${m.date ? String(m.date).slice(0, 10) : "—"}</td>
            <td>${m.mechanic || m.performedBy || "—"}</td>
            <td>${nextDueCell}</td>
          </tr>`;
        }).join("")
      : `<tr>
          <td>—</td>
          <td>${m.description || "—"}</td>
          <td>${m.date ? String(m.date).slice(0, 10) : "—"}</td>
          <td>${m.mechanic || m.performedBy || "—"}</td>
          <td>—</td>
        </tr>`;
    return ads;
  }).join("");

  // 337 / Major alteration rows
  const alterationEntries = maintenance.filter((m) =>
    m.category === "major-alteration" || m.category === "337" || (m.description || "").toLowerCase().includes("337")
  );
  const alterationRows = alterationEntries.map((m) => {
    const docs = (m.documents || []).join(", ") || "—";
    return `<tr>
      <td>${m.date ? String(m.date).slice(0, 10) : "—"}</td>
      <td>${m.description || "—"}</td>
      <td>${m.mechanic || m.performedBy || "—"}</td>
      <td>${docs}</td>
    </tr>`;
  }).join("");

  // Component snapshot: engine, prop, avionics
  const pa = primaryAircraft;
  // Find last service record for a keyword — returns { date, mechanic, condition }
  function lastServiceRecord(keyword) {
    const matches = maintenance
      .filter((m) => (m.components || []).some((c) => (c.name || "").toLowerCase().includes(keyword)) ||
        (m.description || "").toLowerCase().includes(keyword))
      .sort((a, b) => new Date(b.date) - new Date(a.date));
    if (matches.length === 0) return null;
    const rec = matches[0];
    const comp = (rec.components || []).find((c) => (c.name || "").toLowerCase().includes(keyword));
    return {
      date: rec.date ? String(rec.date).slice(0, 10) : null,
      mechanic: rec.mechanic || rec.performedBy || null,
      condition: comp?.condition || null,
    };
  }
  function lastServiceDate(keyword) {
    const r = lastServiceRecord(keyword);
    return r ? r.date : null;
  }

  // Buyer evidence index
  const adCount = adEntries.length;
  const docCount = maintenance.reduce((n, m) => n + (m.documents || []).length, 0);
  const hasAnnual = !!(pa.annualDue);
  const evidenceItems = [
    { label: "Flight log entries", value: entries.length > 0 ? `${entries.length} entries` : "None", pass: entries.length > 0 },
    { label: "Maintenance records", value: maintenance.length > 0 ? `${maintenance.length} records` : "None", pass: maintenance.length > 0 },
    { label: "Annual inspection on file", value: hasAnnual ? fmt(pa.annualDue) : "Not recorded", pass: hasAnnual },
    { label: "AD compliance records", value: adCount > 0 ? `${adCount} records` : "None", pass: adCount > 0 },
    { label: "Referenced documents", value: docCount > 0 ? `${docCount} files` : "None", pass: docCount > 0 },
    { label: "Pilot profile", value: profile?.pilot?.fullName ? profile.pilot.fullName : "Incomplete", pass: !!(profile?.pilot?.fullName) },
    { label: "On-chain anchor", value: anchored ? `Yes — ${verification.anchorNetwork || "network"}` : "Not yet anchored", pass: anchored },
  ];

  const evidenceRows = evidenceItems.map((ei) =>
    `<tr>
      <td style="color:${ei.pass ? "#22c55e" : "#ef4444"};font-weight:700;width:24px;">${ei.pass ? "✓" : "✗"}</td>
      <td style="color:#4a5568;">${ei.label}</td>
      <td style="font-weight:600;color:${ei.pass ? "#2d3748" : "#ef4444"};">${ei.value}</td>
    </tr>`
  ).join("");

  // Trust summary
  const highGaps = gaps.filter((g) => g.severity === "high").length;
  const medGaps = gaps.filter((g) => g.severity === "medium").length;
  const trustColor = qualityScore >= 80 ? "#22c55e" : qualityScore >= 55 ? "#f59e0b" : "#ef4444";
  const trustLabel = qualityScore >= 80 ? "Strong" : qualityScore >= 55 ? "Moderate" : "Weak";
  const trustExplanation = qualityScore >= 80
    ? "Records are well-documented with maintenance history, compliance dates, and flight log entries present."
    : qualityScore >= 55
    ? "Core records are present but some documentation gaps were identified. A pre-buy inspection is recommended."
    : "Significant documentation gaps exist. Independent verification is strongly recommended before purchase.";

  // Logbook continuity
  const sortedEntries = [...entries].sort((a, b) => new Date(a.date) - new Date(b.date));
  const firstEntryDate = sortedEntries.length > 0 ? String(sortedEntries[0].date).slice(0, 10) : null;
  const lastEntryDate = sortedEntries.length > 0 ? String(sortedEntries[sortedEntries.length - 1].date).slice(0, 10) : null;

  // Buyer summary plain language
  const buyerSummaryStatus = anchored
    ? "Records have been cryptographically hashed."
    : "Records have not yet been anchored to an external verification network.";
  const buyerSummaryGaps = highGaps > 0
    ? `${highGaps} high-severity record gap${highGaps > 1 ? "s" : ""} ${highGaps > 1 ? "were" : "was"} identified and should be reviewed prior to purchase.`
    : gaps.length > 0
    ? `${gaps.length} record item${gaps.length > 1 ? "s" : ""} flagged for review.`
    : "No record gaps or flags were detected.";

  // Trust Basis — what is verified, assumed, and missing
  const trustBasis = { verified: [], assumed: [], missing: [] };
  if (maintenance.length > 0) trustBasis.verified.push(`${maintenance.length} maintenance record${maintenance.length > 1 ? "s" : ""} on file`);
  if (primaryAircraft.annualDue) trustBasis.verified.push(`Annual inspection on file — due ${fmt(primaryAircraft.annualDue)}`);
  if (entries.length > 0) trustBasis.verified.push(`${entries.length} flight log entr${entries.length > 1 ? "ies" : "y"} recorded`);
  if (adEntries.length > 0) trustBasis.verified.push(`${adEntries.length} AD compliance record${adEntries.length > 1 ? "s" : ""} present`);
  if (primaryAircraft.serialNumber) trustBasis.verified.push("Aircraft serial number on file");
  if (primaryAircraft.engineSerial) trustBasis.verified.push("Engine serial number on file");
  if (currentHash) trustBasis.verified.push(`Record set produces a consistent hash (${currentHash.slice(0, 8)}…)`);

  trustBasis.assumed.push("Flight hours are pilot-reported and not independently audited");
  trustBasis.assumed.push("Aircraft specifications provided by the seller");
  if (maintenance.length > 0) trustBasis.assumed.push("Maintenance entries reflect mechanic records — work quality not inspected by AirLog");
  if (!anchored) trustBasis.assumed.push("Record hash is locally computed — not externally anchored or time-stamped");

  if (!primaryAircraft.annualDue) trustBasis.missing.push("Annual inspection date not recorded");
  if (adEntries.length === 0) trustBasis.missing.push("No AD compliance records — compliance status cannot be confirmed");
  if (!primaryAircraft.engineSerial) trustBasis.missing.push("Engine serial number not recorded");
  if (!primaryAircraft.serialNumber) trustBasis.missing.push("Aircraft serial number not recorded");
  for (const g of gaps) {
    if (g.severity === "high" && g.description) trustBasis.missing.push(g.description);
  }

  const aircraftRows = aircraft.map((a) => `
    <tr><td>Registration</td><td>${a.ident || "—"}</td></tr>
    <tr><td>Type</td><td>${a.type || "—"}</td></tr>
    <tr><td>Serial Number</td><td>${a.serialNumber || "—"}</td></tr>
    <tr><td>Manufacture Year</td><td>${a.manufactureYear || "—"}</td></tr>
    <tr><td>Total Time in Service</td><td>${a.totalTimeInService != null ? fmtNum(a.totalTimeInService) + " hrs" : "—"}</td></tr>
    <tr><td>Registration Date</td><td>${fmt(a.registrationDate)}</td></tr>
    <tr><td>Engine Type</td><td>${a.engineType || "—"}</td></tr>
    <tr><td>Engine Serial</td><td>${a.engineSerial || "—"}</td></tr>
    <tr><td>Propeller Type</td><td>${a.propType || "—"}</td></tr>
    <tr><td>Propeller Serial</td><td>${a.propSerial || "—"}</td></tr>
    <tr><td>Annual Due</td><td>${fmt(a.annualDue)}</td></tr>
    <tr><td>Transponder Due</td><td>${fmt(a.transponderDue)}</td></tr>
    <tr><td>Pitot-Static Due</td><td>${fmt(a.pitotStaticDue)}</td></tr>
    <tr><td>ELT Battery Due</td><td>${fmt(a.eltBatteryDue)}</td></tr>
  `).join("\n");

  // Compliance calendar: pull due dates from aircraft + recurring AD nextDue from maintenance
  const today = new Date();
  today.setHours(0,0,0,0);
  function daysUntil(dateStr) {
    if (!dateStr) return null;
    const d = new Date(String(dateStr).slice(0, 10));
    if (isNaN(d)) return null;
    return Math.round((d - today) / 86400000);
  }
  function complianceColor(days) {
    if (days === null) return "";
    if (days < 0) return "badge-red";
    if (days <= 30) return "badge-red";
    if (days <= 90) return "badge-yellow";
    return "badge-green";
  }
  function complianceStatus(days) {
    if (days === null) return "Unknown";
    if (days < 0) return "OVERDUE";
    if (days <= 30) return "Due Soon";
    if (days <= 90) return "Upcoming";
    return "Current";
  }

  const complianceItems = [];
  if (primaryAircraft.annualDue) complianceItems.push({ item: "Annual Inspection", due: primaryAircraft.annualDue });
  if (primaryAircraft.transponderDue) complianceItems.push({ item: "Transponder Check", due: primaryAircraft.transponderDue });
  if (primaryAircraft.pitotStaticDue) complianceItems.push({ item: "Pitot-Static Check", due: primaryAircraft.pitotStaticDue });
  if (primaryAircraft.eltBatteryDue) complianceItems.push({ item: "ELT Battery", due: primaryAircraft.eltBatteryDue });

  // Pull AD nextDue from maintenance records
  for (const m of maintenance) {
    for (const ad of (m.adCompliance || [])) {
      if (ad.nextDue) {
        complianceItems.push({ item: `AD ${ad.adNumber || ""}${ad.title ? " — " + ad.title : ""}`, due: ad.nextDue });
      }
    }
  }

  const complianceRows = complianceItems.map((ci) => {
    const days = daysUntil(ci.due);
    const colorClass = complianceColor(days);
    const status = complianceStatus(days);
    return `<tr>
      <td>${ci.item}</td>
      <td>${fmt(ci.due)}</td>
      <td>${days !== null ? (days < 0 ? `${Math.abs(days)} days ago` : `${days} days`) : "—"}</td>
      <td><span class="badge ${colorClass}">${status}</span></td>
    </tr>`;
  }).join("\n");

  const integrityStatus = anchored
    ? `<span class="badge badge-green">Anchored — ${verification.anchorNetwork || "network"}</span>`
    : `<span class="badge badge-yellow">Not Yet Anchored</span>`;

  const hashMatchBadge = hashMatch
    ? `<span class="badge badge-green">Hash Match ✓</span>`
    : `<span class="badge badge-yellow">Hash Drift Detected</span>`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>AirLog Sale Packet — ${primaryAircraft.ident || "Aircraft"}</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: "Helvetica Neue", Helvetica, Arial, sans-serif;
      font-size: 13px;
      color: #1a1a2e;
      background: #f5f7fa;
      line-height: 1.5;
    }
    @media print {
      body { background: #fff; font-size: 11px; }
      .no-print { display: none !important; }
      section { break-inside: avoid; }
      .page-break { page-break-after: always; }
    }
    .container { max-width: 960px; margin: 0 auto; padding: 24px 20px 48px; }

    /* HEADER */
    .header {
      background: linear-gradient(135deg, #0d1b4b 0%, #1a3a8f 100%);
      color: #fff;
      padding: 32px 36px;
      border-radius: 8px;
      margin-bottom: 28px;
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
    }
    .header-brand { font-size: 22px; font-weight: 700; letter-spacing: 0.04em; }
    .header-brand span { color: #7aa7ff; }
    .header-sub { font-size: 12px; color: #b0c4ff; margin-top: 4px; }
    .header-ident { text-align: right; }
    .header-ident .ident { font-size: 36px; font-weight: 800; letter-spacing: 0.06em; color: #fff; }
    .header-ident .type { font-size: 14px; color: #b0c4ff; margin-top: 2px; }
    .header-ident .gendate { font-size: 11px; color: #8099cc; margin-top: 6px; }

    /* SECTION */
    section {
      background: #fff;
      border-radius: 8px;
      border: 1px solid #e2e8f0;
      margin-bottom: 20px;
      overflow: hidden;
    }
    .section-title {
      background: #f8fafc;
      border-bottom: 1px solid #e2e8f0;
      padding: 12px 20px;
      font-size: 12px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: #4a5568;
    }
    .section-body { padding: 20px; }

    /* GRID */
    .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
    .grid-3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }
    .stat-card {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 6px;
      padding: 14px 16px;
    }
    .stat-label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.07em; color: #718096; font-weight: 600; }
    .stat-value { font-size: 22px; font-weight: 700; color: #1a1a2e; margin-top: 4px; }
    .stat-unit { font-size: 11px; color: #a0aec0; font-weight: 400; }

    /* KV TABLE */
    .kv-table { width: 100%; border-collapse: collapse; }
    .kv-table tr { border-bottom: 1px solid #f0f4f8; }
    .kv-table tr:last-child { border-bottom: none; }
    .kv-table td { padding: 8px 0; vertical-align: top; }
    .kv-table td:first-child { color: #718096; font-weight: 500; width: 42%; font-size: 12px; }
    .kv-table td:last-child { color: #1a1a2e; font-weight: 600; }

    /* DATA TABLE */
    .data-table { width: 100%; border-collapse: collapse; }
    .data-table th {
      background: #f8fafc;
      text-align: left;
      padding: 9px 12px;
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: #4a5568;
      border-bottom: 2px solid #e2e8f0;
    }
    .data-table td {
      padding: 9px 12px;
      border-bottom: 1px solid #f0f4f8;
      vertical-align: top;
      color: #2d3748;
      font-size: 12px;
    }
    .data-table tr:last-child td { border-bottom: none; }
    .data-table tr:hover td { background: #fafbff; }

    /* BADGES */
    .badge {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 12px;
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      background: #e8edf8;
      color: #3a5199;
    }
    .badge-green { background: #d4edda; color: #1a6630; }
    .badge-yellow { background: #fff3cd; color: #856404; }
    .badge-red { background: #f8d7da; color: #721c24; }

    .rts-yes { color: #1a6630; font-weight: 700; }
    .rts-no { color: #a0aec0; }

    /* COMPONENT DETAIL ROW */
    .comp-row td { padding: 0 12px 8px; border-bottom: none; background: #fafbff; }
    .comp-detail { font-size: 11px; color: #4a5568; background: #f0f4ff; border-radius: 4px; padding: 6px 10px; border-left: 3px solid #b0c4ff; }

    /* INTEGRITY BLOCK */
    .integrity-block {
      background: #f0f4ff;
      border: 1px solid #c3d0f5;
      border-radius: 6px;
      padding: 16px 20px;
    }
    .hash-display {
      font-family: "SFMono-Regular", Consolas, monospace;
      font-size: 11px;
      color: #2d3748;
      word-break: break-all;
      background: #fff;
      border: 1px solid #d6e0f5;
      border-radius: 4px;
      padding: 8px 12px;
      margin-top: 8px;
    }

    /* QUALITY SCORE */
    .score-display { font-size: 48px; font-weight: 800; color: #1a3a8f; line-height: 1; }
    .score-label { font-size: 12px; color: #718096; margin-top: 4px; }
    .score-bar { height: 8px; background: #e2e8f0; border-radius: 4px; margin: 12px 0; overflow: hidden; }
    .score-fill { height: 100%; background: linear-gradient(90deg, #1a3a8f, #4a7adf); border-radius: 4px; transition: width 0.3s; }

    /* GAPS */
    .gap-item { display: flex; align-items: flex-start; gap: 10px; padding: 10px 0; border-bottom: 1px solid #f0f4f8; }
    .gap-item:last-child { border-bottom: none; }
    .gap-dot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; margin-top: 3px; }
    .gap-dot-high { background: #ef4444; }
    .gap-dot-medium { background: #f59e0b; }
    .gap-text { font-size: 12px; color: #2d3748; }
    .gap-type { font-size: 10px; text-transform: uppercase; letter-spacing: 0.06em; color: #a0aec0; margin-top: 2px; }
    .gap-none { color: #22c55e; font-size: 12px; font-weight: 600; display: flex; align-items: center; gap: 8px; }

    /* FOOTER */
    .footer {
      text-align: center;
      margin-top: 32px;
      padding-top: 20px;
      border-top: 1px solid #e2e8f0;
      font-size: 11px;
      color: #a0aec0;
    }
    .footer strong { color: #4a5568; }
  </style>
</head>
<body>
<div class="container">

  <!-- HEADER -->
  <div class="header">
    <div>
      <div class="header-brand">Air<span>Log</span></div>
      <div class="header-sub">Aircraft Records &amp; Sale Packet</div>
      <div style="margin-top:12px;">${integrityStatus}</div>
    </div>
    <div class="header-ident">
      <div class="ident">${primaryAircraft.ident || "—"}</div>
      <div class="type">${primaryAircraft.type || "—"}</div>
      <div class="gendate">Generated ${generatedFormatted}</div>
      <div style="margin-top:10px;">
        <a href="/export/sale-packet/pdf" style="display:inline-block;padding:7px 16px;background:#1a3a6e;color:#fff;border-radius:6px;font-size:12px;font-weight:700;text-decoration:none;letter-spacing:0.03em;" download>⬇ Download PDF</a>
      </div>
    </div>
  </div>

  <!-- BUYER SUMMARY -->
  <section style="border-left: 4px solid ${trustColor};">
    <div class="section-title" style="background:#fafbff;">Buyer Summary</div>
    <div class="section-body">
      <div style="display:flex;align-items:center;gap:16px;margin-bottom:14px;">
        <div style="font-size:32px;font-weight:800;color:${trustColor};line-height:1;">${trustLabel}</div>
        <div style="font-size:13px;color:#2d3748;line-height:1.6;max-width:640px;">
          ${trustExplanation}
        </div>
      </div>
      <div style="font-size:13px;color:#4a5568;line-height:1.8;">
        This record package covers <strong>${primaryAircraft.type || "the aircraft"}</strong>
        (${primaryAircraft.ident || "—"}), serial number <strong>${primaryAircraft.serialNumber || "—"}</strong>.
        The logbook contains <strong>${entries.length} entr${entries.length === 1 ? "y" : "ies"}</strong>
        ${firstEntryDate && lastEntryDate ? `spanning <strong>${firstEntryDate}</strong> to <strong>${lastEntryDate}</strong>` : ""}.
        ${buyerSummaryStatus}
        ${buyerSummaryGaps}
      </div>
    </div>
  </section>

  <!-- TRUST SUMMARY + BUYER EVIDENCE INDEX -->
  <div class="grid-2">
    <section>
      <div class="section-title">Trust Summary</div>
      <div class="section-body">
        <div style="display:flex;align-items:center;gap:14px;margin-bottom:12px;">
          <div style="width:14px;height:14px;border-radius:50%;background:${trustColor};flex-shrink:0;"></div>
          <div>
            <div style="font-size:16px;font-weight:700;color:${trustColor};">${trustLabel} — ${qualityScore}/100</div>
            <div style="font-size:11px;color:#718096;margin-top:2px;">${trustExplanation}</div>
          </div>
        </div>
        <table class="kv-table">
          <tr><td style="color:#718096;">Integrity</td><td>${integrityStatus}</td></tr>
          <tr><td style="color:#718096;">Hash</td><td>${hashMatchBadge}</td></tr>
          <tr><td style="color:#718096;">Quality Score</td><td><strong>${qualityScore}/100</strong></td></tr>
          <tr><td style="color:#718096;">Maintenance Records</td><td>${maintenance.length}</td></tr>
          <tr><td style="color:#718096;">Log Entries</td><td>${entries.length}</td></tr>
        </table>
        <div style="margin-top:12px;">
          <a href="/verify/airworthy/html" style="display:inline-block;padding:7px 14px;background:#1a3a8f;color:#fff;border-radius:6px;font-size:12px;font-weight:600;text-decoration:none;">
            View Airworthiness Check →
          </a>
        </div>
      </div>
    </section>
    <section>
      <div class="section-title">Buyer Evidence Index</div>
      <div class="section-body" style="padding:0;">
        <table class="data-table">
          <tbody>${evidenceRows}</tbody>
        </table>
      </div>
    </section>
  </div>

  <!-- TRUST BASIS -->
  <section>
    <div class="section-title">Trust Basis</div>
    <div class="section-body">
      <p style="font-size:12px;color:#718096;margin-bottom:14px;line-height:1.6;">
        This section explains what AirLog can confirm, what it takes as given, and what it cannot verify.
        It is intended to help buyers make informed decisions — not to substitute for a pre-buy inspection.
      </p>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px;">
        <div>
          <div style="font-size:11px;font-weight:700;color:#22c55e;letter-spacing:0.05em;margin-bottom:8px;text-transform:uppercase;">✓ Verified</div>
          ${trustBasis.verified.length > 0
            ? trustBasis.verified.map(v => `<div style="font-size:12px;color:#2d3748;padding:4px 0;border-bottom:1px solid #f0f2f5;">${v}</div>`).join("")
            : `<div style="font-size:12px;color:#a0aec0;">No items verified</div>`}
        </div>
        <div>
          <div style="font-size:11px;font-weight:700;color:#f59e0b;letter-spacing:0.05em;margin-bottom:8px;text-transform:uppercase;">~ Assumed</div>
          ${trustBasis.assumed.map(a => `<div style="font-size:12px;color:#4a5568;padding:4px 0;border-bottom:1px solid #f0f2f5;">${a}</div>`).join("")}
        </div>
        <div>
          <div style="font-size:11px;font-weight:700;color:#ef4444;letter-spacing:0.05em;margin-bottom:8px;text-transform:uppercase;">✗ Missing / Unverifiable</div>
          ${trustBasis.missing.length > 0
            ? trustBasis.missing.map(m => `<div style="font-size:12px;color:#ef4444;padding:4px 0;border-bottom:1px solid #f0f2f5;">${m}</div>`).join("")
            : `<div style="font-size:12px;color:#22c55e;">No known gaps</div>`}
        </div>
      </div>
    </div>
  </section>

  <!-- RECORD GAPS & FLAGS -->
  <section>
    <div class="section-title">Record Gaps &amp; Flags</div>
    <div class="section-body">
      ${gaps.length === 0
        ? `<div class="gap-none"><span style="font-size:16px;">✓</span> No gaps detected — records appear complete</div>`
        : gaps.map((g) => `
        <div class="gap-item">
          <div class="gap-dot gap-dot-${g.severity}"></div>
          <div>
            <div class="gap-text">${g.description}</div>
            <div class="gap-type">${g.type.replace(/_/g, " ")}${g.severity === "high" ? " · high severity" : " · medium severity"}</div>
          </div>
        </div>`).join("")}
    </div>
  </section>

  <!-- LOGBOOK SUMMARY -->
  <section>
    <div class="section-title">Logbook Summary</div>
    <div class="section-body">
      <div style="display:flex;gap:24px;margin-bottom:16px;padding-bottom:16px;border-bottom:1px solid #e2e8f0;flex-wrap:wrap;">
        <div><span style="font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:#718096;font-weight:600;">First Entry</span><div style="font-size:14px;font-weight:700;color:#1a1a2e;margin-top:3px;">${firstEntryDate || "—"}</div></div>
        <div><span style="font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:#718096;font-weight:600;">Last Entry</span><div style="font-size:14px;font-weight:700;color:#1a1a2e;margin-top:3px;">${lastEntryDate || "—"}</div></div>
        <div><span style="font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:#718096;font-weight:600;">Total Entries</span><div style="font-size:14px;font-weight:700;color:#1a1a2e;margin-top:3px;">${entries.length}</div></div>
      </div>
      <div class="grid-3">
        <div class="stat-card">
          <div class="stat-label">Total Hours</div>
          <div class="stat-value">${fmtNum(totals.total)} <span class="stat-unit">hrs</span></div>
        </div>
        <div class="stat-card">
          <div class="stat-label">PIC Hours</div>
          <div class="stat-value">${fmtNum(totals.pic)} <span class="stat-unit">hrs</span></div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Total Landings</div>
          <div class="stat-value">${totalLandings}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Instrument Time</div>
          <div class="stat-value">${fmtNum(instrumentTime)} <span class="stat-unit">hrs</span></div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Night Hours</div>
          <div class="stat-value">${fmtNum(totals.night)} <span class="stat-unit">hrs</span></div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Log Entries</div>
          <div class="stat-value">${entries.length}</div>
        </div>
      </div>
    </div>
  </section>

  <!-- AIRCRAFT + PILOT GRID -->
  <div class="grid-2">
    <section>
      <div class="section-title">Aircraft Summary</div>
      <div class="section-body">
        <table class="kv-table">
          ${aircraftRows}
        </table>
      </div>
    </section>
    <section>
      <div class="section-title">Pilot / Owner Summary</div>
      <div class="section-body">
        <table class="kv-table">
          <tr><td>Full Name</td><td>${profile?.pilot?.fullName || "—"}</td></tr>
          <tr><td>Medical</td><td>${profile?.medical?.kind || "None"}${profile?.medical?.class ? " Class " + profile.medical.class : ""}</td></tr>
          <tr><td>Medical Expires</td><td>${fmt(profile?.medical?.expires)}</td></tr>
          <tr><td>Flight Review</td><td>${fmt(profile?.proficiency?.flightReviewDate)}</td></tr>
          <tr><td>IPC Date</td><td>${fmt(profile?.proficiency?.ipcDate)}</td></tr>
          <tr><td>Endorsements</td><td>${profile?.endorsements?.length || 0}</td></tr>
        </table>
      </div>
    </section>
  </div>

  <!-- COMPLIANCE CALENDAR -->
  <section>
    <div class="section-title">Upcoming Compliance &amp; Inspections</div>
    <div class="section-body" style="padding:0;">
      ${complianceItems.length === 0
        ? '<div style="padding:20px;color:#a0aec0;text-align:center;">No compliance dates on file.</div>'
        : `<table class="data-table">
          <thead>
            <tr>
              <th>Item</th>
              <th>Due Date</th>
              <th>Days Until Due</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            ${complianceRows}
          </tbody>
        </table>`}
    </div>
  </section>

  <!-- AD COMPLIANCE -->
  <section>
    <div class="section-title">AD Compliance</div>
    <div class="section-body" style="padding:0;">
      ${adEntries.length === 0
        ? '<div style="padding:20px 24px;color:#4a5568;font-size:13px;line-height:1.7;border-left:3px solid #e2e8f0;margin:16px;border-radius:2px;">No airworthiness directive compliance records are included in this package. The absence of records in this system does not confirm compliance status. Buyers should verify AD compliance independently through the aircraft maintenance logbooks and with a qualified A&amp;P mechanic or IA prior to purchase.</div>'
        : `<table class="data-table">
          <thead><tr><th>AD Number</th><th>Description</th><th>Date Complied</th><th>Mechanic</th><th>Next Due</th></tr></thead>
          <tbody>${adRows}</tbody>
        </table>`}
    </div>
  </section>

  <!-- 337 / MAJOR ALTERATIONS -->
  <section>
    <div class="section-title">337 / Major Alterations</div>
    <div class="section-body" style="padding:0;">
      ${alterationEntries.length === 0
        ? '<div style="padding:20px 24px;color:#4a5568;font-size:13px;line-height:1.7;border-left:3px solid #e2e8f0;margin:16px;border-radius:2px;">No FAA Form 337 or major alteration records are included in this package. This does not confirm that no alterations have been performed. Buyers should review all aircraft logbooks and FAA records directly to verify the modification history of this aircraft.</div>'
        : `<table class="data-table">
          <thead><tr><th>Date</th><th>Description</th><th>Performed By</th><th>Documents</th></tr></thead>
          <tbody>${alterationRows}</tbody>
        </table>`}
    </div>
  </section>

  <!-- COMPONENT SNAPSHOT -->
  <section>
    <div class="section-title">Component Snapshot</div>
    <div class="section-body">
      <div class="grid-3">
        <div class="stat-card">
          <div class="stat-label">Engine</div>
          <div style="font-size:13px;font-weight:600;color:#1a1a2e;margin-top:6px;">${pa.engineType || "—"}</div>
          <div style="font-size:11px;color:#718096;margin-top:2px;">S/N: ${pa.engineSerial || "—"}</div>
          <div style="font-size:11px;color:#718096;margin-top:2px;">SMOH: ${pa.engineTimeSMOH != null ? fmtNum(pa.engineTimeSMOH) + " hrs" : "Not recorded"}</div>
          ${(() => { const r = lastServiceRecord("engine"); return r ? `
          <div style="font-size:11px;color:#718096;margin-top:2px;">Last service: ${r.date}</div>
          ${r.condition ? `<div style="font-size:11px;color:#718096;margin-top:2px;">Condition: <span style="color:${r.condition === "serviceable" ? "#22c55e" : "#ef4444"};font-weight:600;">${r.condition}</span></div>` : ""}
          ${r.mechanic ? `<div style="font-size:11px;color:#718096;margin-top:2px;">Signed off: ${r.mechanic}</div>` : ""}
          ` : '<div style="font-size:11px;color:#a0aec0;margin-top:2px;">No service records</div>'; })()}
        </div>
        <div class="stat-card">
          <div class="stat-label">Propeller</div>
          <div style="font-size:13px;font-weight:600;color:#1a1a2e;margin-top:6px;">${pa.propType || "—"}</div>
          <div style="font-size:11px;color:#718096;margin-top:2px;">S/N: ${pa.propSerial || "—"}</div>
          ${(() => { const r = lastServiceRecord("prop"); return r ? `
          <div style="font-size:11px;color:#718096;margin-top:2px;">Last service: ${r.date}</div>
          ${r.condition ? `<div style="font-size:11px;color:#718096;margin-top:2px;">Condition: <span style="color:${r.condition === "serviceable" ? "#22c55e" : "#ef4444"};font-weight:600;">${r.condition}</span></div>` : ""}
          ${r.mechanic ? `<div style="font-size:11px;color:#718096;margin-top:2px;">Signed off: ${r.mechanic}</div>` : ""}
          ` : '<div style="font-size:11px;color:#a0aec0;margin-top:2px;">No service records</div>'; })()}
        </div>
        <div class="stat-card">
          <div class="stat-label">Avionics</div>
          ${(pa.avionics || []).map((av) => {
            const r = lastServiceRecord(av.toLowerCase().split(" ").slice(0, 2).join(" "));
            return `<div style="font-size:12px;color:#2d3748;margin-top:6px;font-weight:600;">${av}</div>
            ${r ? `<div style="font-size:11px;color:#718096;">Last tested: ${r.date}</div>
            ${r.condition ? `<div style="font-size:11px;color:#718096;">Condition: <span style="color:${r.condition === "serviceable" ? "#22c55e" : "#ef4444"};font-weight:600;">${r.condition}</span></div>` : ""}` : ""}`;
          }).join("") || '<div style="font-size:12px;color:#a0aec0;margin-top:6px;">Not recorded</div>'}
        </div>
      </div>
    </div>
  </section>

  <!-- MAINTENANCE HISTORY -->
  <section>
    <div class="section-title">Maintenance History (${maintenance.length} records)</div>
    <div class="section-body" style="padding:0;">
      ${maintenance.length === 0
        ? '<div style="padding:20px;color:#a0aec0;text-align:center;">No maintenance records on file.</div>'
        : `<table class="data-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Category</th>
              <th>Description</th>
              <th>Mechanic</th>
              <th>Airframe Hrs</th>
              <th>RTS</th>
            </tr>
          </thead>
          <tbody>
            ${maintenanceRows}
          </tbody>
        </table>`}
    </div>
  </section>

  <!-- INTEGRITY + QUALITY GRID -->
  <div class="grid-2">
    <section>
      <div class="section-title">Record Integrity</div>
      <div class="section-body">
        <div class="integrity-block">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
            <span style="font-weight:600;font-size:12px;">Status</span>
            ${integrityStatus}
          </div>
          ${anchorHash ? `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
            <span style="font-weight:600;font-size:12px;">Hash Match</span>
            ${hashMatchBadge}
          </div>` : ""}
          ${verification?.anchorTime ? `<div style="font-size:11px;color:#718096;margin-bottom:6px;">Anchored: ${String(verification.anchorTime).slice(0,10)}</div>` : ""}
          ${verification?.anchorNetwork ? `<div style="font-size:11px;color:#718096;margin-bottom:6px;">Network: ${verification.anchorNetwork}</div>` : ""}
          <div style="font-size:11px;color:#718096;margin-top:12px;line-height:1.6;border-left:3px solid #e2e8f0;padding-left:10px;">
            This record set hashes to the value below. Any change to the underlying records — even a single character — will produce a different hash. You can use this to confirm you are reviewing unmodified records.
          </div>
          <div style="font-size:11px;color:#718096;margin-top:8px;font-weight:600;">Current Record Hash</div>
          <div class="hash-display">${currentHash}</div>
          ${anchorHash && anchorHash !== currentHash ? `<div style="font-size:11px;color:#718096;margin-top:8px;font-weight:600;">Anchored Hash</div><div class="hash-display">${anchorHash}</div>` : ""}
        </div>
      </div>
    </section>
    <section>
      <div class="section-title">Record Completeness Score</div>
      <div class="section-body">
        <div class="score-display">${qualityScore}<span style="font-size:20px;color:#a0aec0;">/100</span></div>
        <div class="score-label">${qualityScore >= 90 ? "Excellent" : qualityScore >= 70 ? "Good" : qualityScore >= 45 ? "Fair" : "Incomplete"}</div>
        <div class="score-bar"><div class="score-fill" style="width:${qualityScore}%;"></div></div>
        <table class="data-table" style="margin-top:8px;">
          <thead><tr><th></th><th>Factor</th><th>Points</th></tr></thead>
          <tbody>${qualityRows}</tbody>
        </table>
      </div>
    </section>
  </div>

</div>

<!-- FOOTER -->
<div class="footer">
  <strong>Verified by AirLog</strong> &mdash;
  Record Hash: <code style="font-size:10px;">${currentHash.slice(0, 16)}…</code> &mdash;
  Generated ${generatedFormatted} &mdash;
  <a href="/verify/airworthy/html" style="color:#9aa3ff;text-decoration:none;">Airworthiness Check</a>
</div>

</body>
</html>`;

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(html);
});

app.get("/export/sale-packet/pdf", async (_req, res) => {
  let browser;
  try {
    const { default: puppeteer } = await import("puppeteer");
    browser = await puppeteer.launch({ args: ["--no-sandbox", "--disable-setuid-sandbox"] });
    const page = await browser.newPage();
    await page.goto(`http://127.0.0.1:${PORT}/export/sale-packet/html`, { waitUntil: "networkidle0", timeout: 15000 });
    const pdf = await page.pdf({
      format: "Letter",
      printBackground: true,
      margin: { top: "0.5in", bottom: "0.5in", left: "0.5in", right: "0.5in" }
    });
    await browser.close();
    const entries = readEntries();
    const aircraft = readAircraft();
    const reg = (aircraft[0]?.registration || "aircraft").replace(/[^A-Z0-9]/gi, "");
    const date = new Date().toISOString().slice(0, 10);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="AirLog-SalePacket-${reg}-${date}.pdf"`);
    res.send(pdf);
  } catch (err) {
    if (browser) await browser.close().catch(() => {});
    res.status(500).json({ error: "PDF generation failed", detail: err.message });
  }
});

app.get("/verify/hash/:hash", (_req, res) => {
  const verification = readVerification();
  const submitted = _req.params.hash;

  if (!verification?.anchorHash) {
    return res.json({
      verified: false,
      reason: "No anchored record found"
    });
  }

  const match = verification.anchorHash === submitted;

  res.json({
    verified: match,
    submittedHash: submitted,
    anchoredHash: verification.anchorHash,
    anchorNetwork: verification.anchorNetwork,
    anchorTime: verification.anchorTime,
    anchorTx: verification.anchorTx
  });
});

// ── Public Anchor Verification ───────────────────────────────────────────────
function renderVerifyHtml(body) {
  const anchored = body.anchored === true;
  const integrityOk = body.integrity === "valid";
  const statusColor = anchored && integrityOk ? "#22c55e" : anchored && !integrityOk ? "#ef4444" : "#f59e0b";
  const statusIcon = anchored && integrityOk ? "✓" : anchored && !integrityOk ? "✗" : "—";
  const statusLabel = anchored && integrityOk ? "Anchored" : anchored && !integrityOk ? "Hash Mismatch" : "Not Anchored";
  const integrityLabel = integrityOk ? "✓ Valid" : body.integrity === "hash_mismatch" ? "✗ Hash mismatch — records changed after anchoring" : "—";
  const timestampStr = body.timestamp ? String(body.timestamp).slice(0, 19).replace("T", " ") + " UTC" : "—";
  const network = body.network || "midnight-local";
  const tx = body.tx || "—";
  const hash = body.hash || "—";
  const reason = body.reason || null;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>AirLog — Blockchain Verification</title>
<style>
  body { margin: 0; background: #0f172a; color: #e2e8f0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; padding: 40px 20px; }
  .container { max-width: 560px; margin: 0 auto; }
  .header { margin-bottom: 32px; }
  .header h1 { font-size: 20px; font-weight: 700; color: #f8fafc; margin: 0 0 4px; }
  .header p { font-size: 13px; color: #64748b; margin: 0; }
  .card { background: #1e293b; border-radius: 10px; padding: 24px; margin-bottom: 16px; }
  .status-badge { display: inline-flex; align-items: center; gap: 8px; padding: 8px 16px; border-radius: 20px; font-size: 14px; font-weight: 700; background: ${anchored && integrityOk ? "#14532d" : anchored && !integrityOk ? "#7f1d1d" : "#422006"}; color: ${statusColor}; margin-bottom: 20px; }
  .row { display: flex; flex-direction: column; margin-bottom: 14px; }
  .row:last-child { margin-bottom: 0; }
  .lbl { font-size: 10px; letter-spacing: 0.08em; text-transform: uppercase; color: #64748b; margin-bottom: 4px; }
  .val { font-size: 12px; color: #cbd5e1; word-break: break-all; font-family: ui-monospace, monospace; }
  .val.ok { color: #22c55e; font-family: inherit; font-size: 13px; }
  .val.fail { color: #ef4444; font-family: inherit; font-size: 13px; }
  .back { display: inline-block; margin-top: 24px; font-size: 12px; color: #6366f1; text-decoration: none; }
  .back:hover { text-decoration: underline; }
</style>
</head>
<body>
<div class="container">
  <div class="header">
    <h1>AirLog · Blockchain Verification</h1>
    <p>Independent confirmation of the Midnight network anchor for this aircraft record report.</p>
  </div>
  <div class="card">
    <div class="status-badge">${statusIcon} ${statusLabel}</div>
    ${reason ? `<div class="row"><div class="lbl">Note</div><div class="val">${reason}</div></div>` : ""}
    <div class="row"><div class="lbl">Transaction ID</div><div class="val">${tx}</div></div>
    <div class="row"><div class="lbl">Anchored</div><div class="val ${anchored ? "ok" : "fail"}">${anchored ? "✓ Yes" : "✗ No"}</div></div>
    <div class="row"><div class="lbl">Integrity</div><div class="val ${integrityOk ? "ok" : "fail"}">${integrityLabel}</div></div>
    <div class="row"><div class="lbl">Timestamp</div><div class="val">${timestampStr}</div></div>
    <div class="row"><div class="lbl">Network</div><div class="val">${network}</div></div>
    ${anchored ? `<div class="row"><div class="lbl">Anchored Hash</div><div class="val">${hash}</div></div>` : ""}
  </div>
  <a href="/report" class="back">← Back to Record Report</a>
  <span style="font-size:11px;color:#334155;margin-left:16px;"><a href="?format=json" style="color:#334155;">View raw JSON</a></span>
</div>
</body>
</html>`;
}

function verifyAnchorTx(tx) {
  const verification = readVerification();
  const entries = readEntries();
  const aircraftList = readAircraft();
  const aircraft = aircraftList[0];

  if (!tx) {
    return { status: 200, body: { anchored: false, integrity: "invalid", reason: "No anchor transaction on record" } };
  }

  if (!verification?.anchorTx || !verification?.anchored) {
    return {
      status: 200,
      body: { tx, anchored: false, integrity: "invalid" },
    };
  }

  if (verification.anchorTx !== tx) {
    return {
      status: 200,
      body: { tx, anchored: false, integrity: "invalid" },
    };
  }

  // Compute current hash for comparison
  let currentHash = null;
  try {
    if (aircraft) {
      currentHash = buildIntegrityResult({ aircraft, entries }).anchorHash;
    }
  } catch {}

  const hashMatch = currentHash && verification.anchorHash
    ? currentHash === verification.anchorHash
    : null;

  return {
    status: 200,
    body: {
      tx,
      anchored: true,
      hash: verification.anchorHash,
      timestamp: verification.anchorTime || null,
      integrity: hashMatch === false ? "hash_mismatch" : "valid",
      network: verification.anchorNetwork || "midnight-local",
    },
  };
}

// ── Airworthiness Verification ───────────────────────────────────────────────
app.get("/verify/airworthy", (_req, res) => {
  const aircraft = readAircraft();
  const maintenance = readMaintenance();
  const entries = readEntries();

  const pa = aircraft[0] || {};
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  function daysUntil(dateStr) {
    if (!dateStr) return null;
    const d = new Date(String(dateStr).slice(0, 10));
    if (isNaN(d)) return null;
    return Math.round((d - today) / 86400000);
  }

  const basis = [];
  const missing = [];
  let pass = true;

  // Annual inspection
  if (pa.annualDue) {
    const days = daysUntil(pa.annualDue);
    if (days !== null && days >= 0) {
      basis.push(`Annual inspection current — due ${String(pa.annualDue).slice(0, 10)} (${days} days)`);
    } else if (days !== null && days < 0) {
      pass = false;
      missing.push(`Annual inspection overdue by ${Math.abs(days)} days (due ${String(pa.annualDue).slice(0, 10)})`);
    }
  } else {
    pass = false;
    missing.push("Annual inspection date not recorded — currency cannot be confirmed");
  }

  // Flight records present
  if (entries.length > 0) {
    basis.push(`${entries.length} flight log entr${entries.length > 1 ? "ies" : "y"} on file`);
  } else {
    missing.push("No flight log entries — total time unverifiable");
  }

  // Maintenance history
  if (maintenance.length > 0) {
    basis.push(`${maintenance.length} maintenance record${maintenance.length > 1 ? "s" : ""} on file`);
  } else {
    missing.push("No maintenance records — service history unverifiable");
  }

  // AD compliance
  const adEntries = maintenance.filter((m) => m.category === "ad-compliance" || (m.adCompliance && m.adCompliance.length > 0));
  if (adEntries.length > 0) {
    basis.push(`${adEntries.length} AD compliance record${adEntries.length > 1 ? "s" : ""} present`);
  } else {
    missing.push("No AD compliance records — airworthiness directive status unverifiable");
  }

  // Transponder check
  if (pa.transponderDue) {
    const days = daysUntil(pa.transponderDue);
    if (days !== null && days >= 0) {
      basis.push(`Transponder check current — due ${String(pa.transponderDue).slice(0, 10)}`);
    } else if (days !== null && days < 0) {
      missing.push(`Transponder check overdue by ${Math.abs(days)} days`);
    }
  } else {
    missing.push("Transponder check date not recorded");
  }

  res.json({
    pass,
    result: pass ? "PASS" : "FAIL",
    disclaimer: "This is a record-based assessment only. It does not constitute a legal airworthiness determination. A qualified A&P mechanic or IA must inspect the aircraft prior to purchase.",
    basis,
    missing,
    generated: new Date().toISOString()
  });
});

// ── Airworthiness Check (HTML) ───────────────────────────────────────────────
app.get("/verify/airworthy/html", (_req, res) => {
  const aircraft = readAircraft();
  const maintenance = readMaintenance();
  const entries = readEntries();

  const pa = aircraft[0] || {};
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  function daysUntil(dateStr) {
    if (!dateStr) return null;
    const d = new Date(String(dateStr).slice(0, 10));
    if (isNaN(d)) return null;
    return Math.round((d - today) / 86400000);
  }

  const checks = [];
  let overallPass = true;

  // Annual inspection
  if (pa.annualDue) {
    const days = daysUntil(pa.annualDue);
    if (days !== null && days >= 0) {
      checks.push({ label: "Annual Inspection", status: "pass", detail: `Current — due ${String(pa.annualDue).slice(0, 10)} (${days} days remaining)` });
    } else {
      overallPass = false;
      checks.push({ label: "Annual Inspection", status: "fail", detail: `Overdue by ${Math.abs(days)} days (was due ${String(pa.annualDue).slice(0, 10)})` });
    }
  } else {
    overallPass = false;
    checks.push({ label: "Annual Inspection", status: "unknown", detail: "Due date not recorded — currency cannot be confirmed" });
  }

  // Transponder check
  if (pa.transponderDue) {
    const days = daysUntil(pa.transponderDue);
    if (days !== null && days >= 0) {
      checks.push({ label: "Transponder / ADS-B Check", status: "pass", detail: `Current — due ${String(pa.transponderDue).slice(0, 10)}` });
    } else {
      overallPass = false;
      checks.push({ label: "Transponder / ADS-B Check", status: "fail", detail: `Overdue by ${Math.abs(days)} days` });
    }
  } else {
    overallPass = false;
    checks.push({ label: "Transponder / ADS-B Check", status: "unknown", detail: "Check date not recorded — cannot confirm currency" });
  }

  // Pitot-static check
  if (pa.pitotStaticDue) {
    const days = daysUntil(pa.pitotStaticDue);
    if (days !== null && days >= 0) {
      checks.push({ label: "Pitot-Static Check", status: "pass", detail: `Current — due ${String(pa.pitotStaticDue).slice(0, 10)}` });
    } else {
      overallPass = false;
      checks.push({ label: "Pitot-Static Check", status: "fail", detail: `Overdue by ${Math.abs(days)} days` });
    }
  } else {
    overallPass = false;
    checks.push({ label: "Pitot-Static Check", status: "unknown", detail: "Check date not recorded — cannot confirm currency" });
  }

  // ELT battery
  if (pa.eltBatteryDue) {
    const days = daysUntil(pa.eltBatteryDue);
    if (days !== null && days >= 0) {
      checks.push({ label: "ELT Battery", status: "pass", detail: `Current — due ${String(pa.eltBatteryDue).slice(0, 10)}` });
    } else {
      overallPass = false;
      checks.push({ label: "ELT Battery", status: "fail", detail: `Expired ${Math.abs(days)} days ago` });
    }
  } else {
    overallPass = false;
    checks.push({ label: "ELT Battery", status: "unknown", detail: "Expiry date not recorded — cannot confirm currency" });
  }

  // Maintenance history
  if (maintenance.length > 0) {
    checks.push({ label: "Maintenance Records", status: "pass", detail: `${maintenance.length} record${maintenance.length > 1 ? "s" : ""} on file` });
  } else {
    overallPass = false;
    checks.push({ label: "Maintenance Records", status: "fail", detail: "No maintenance records — service history unverifiable" });
  }

  // AD compliance
  const adEntries = maintenance.filter((m) => m.category === "ad-compliance" || (m.adCompliance && m.adCompliance.length > 0));
  if (adEntries.length > 0) {
    checks.push({ label: "AD Compliance Records", status: "pass", detail: `${adEntries.length} airworthiness directive record${adEntries.length > 1 ? "s" : ""} present` });
  } else {
    overallPass = false;
    checks.push({ label: "AD Compliance Records", status: "unknown", detail: "No AD records in this system — verify independently with logbooks and an A&P/IA" });
  }

  // Flight log
  if (entries.length > 0) {
    checks.push({ label: "Flight Log Entries", status: "pass", detail: `${entries.length} entries on file` });
  } else {
    overallPass = false;
    checks.push({ label: "Flight Log Entries", status: "unknown", detail: "No flight log entries — total time unverifiable" });
  }

  const passCount = checks.filter(c => c.status === "pass").length;
  const failCount = checks.filter(c => c.status === "fail").length;
  const unknownCount = checks.filter(c => c.status === "unknown").length;

  const generatedFormatted = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

  function statusIcon(s) {
    if (s === "pass") return "✓";
    if (s === "fail") return "✗";
    return "?";
  }
  function statusColor(s) {
    if (s === "pass") return "#22c55e";
    if (s === "fail") return "#ef4444";
    return "#f59e0b";
  }
  function statusBg(s) {
    if (s === "pass") return "#14532d";
    if (s === "fail") return "#7f1d1d";
    return "#78350f";
  }

  const checkRows = checks.map(c => `
    <div class="check-row">
      <div class="check-icon" style="background:${statusBg(c.status)};color:${statusColor(c.status)};">${statusIcon(c.status)}</div>
      <div class="check-body">
        <div class="check-label">${c.label}</div>
        <div class="check-detail">${c.detail}</div>
      </div>
    </div>`).join("\n");

  const resultBg = overallPass ? "#14532d" : "#7f1d1d";
  const resultColor = overallPass ? "#86efac" : "#fca5a5";
  const resultText = overallPass ? "PASS" : "FAIL";
  const resultDesc = overallPass
    ? "All compliance items on record are current. No missing or overdue items."
    : failCount > 0
      ? `${failCount} item${failCount !== 1 ? "s" : ""} failed. Review required before purchase.`
      : `${unknownCount} item${unknownCount !== 1 ? "s" : ""} could not be confirmed from available records. Independent verification required.`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Airworthiness Check — ${pa.ident || "Aircraft"}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{background:#0f1117;color:#e2e8f0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;padding:32px 24px;line-height:1.6}
  .container{max-width:700px;margin:0 auto}
  .header{margin-bottom:28px}
  h1{font-size:26px;font-weight:700;margin-bottom:4px}
  .subtitle{font-size:14px;color:#64748b}
  .result-banner{padding:16px 22px;border-radius:10px;margin-bottom:28px;display:flex;align-items:center;gap:16px;background:${resultBg}}
  .result-badge{font-size:28px;font-weight:800;color:${resultColor}}
  .result-text{font-size:15px;color:${resultColor};font-weight:500}
  .result-sub{font-size:13px;color:${resultColor};opacity:.8;margin-top:2px}
  .summary-row{display:flex;gap:16px;margin-bottom:24px;flex-wrap:wrap}
  .summary-pill{padding:6px 16px;border-radius:20px;font-size:13px;font-weight:600}
  .checks{display:flex;flex-direction:column;gap:10px;margin-bottom:28px}
  .check-row{display:flex;align-items:flex-start;gap:14px;background:#141920;border:1px solid #1e293b;border-radius:8px;padding:14px 16px}
  .check-icon{width:32px;height:32px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:16px;font-weight:700;flex-shrink:0}
  .check-label{font-size:15px;font-weight:600;color:#e2e8f0}
  .check-detail{font-size:13px;color:#94a3b8;margin-top:2px}
  .disclaimer{background:#141920;border:1px solid #334155;border-radius:8px;padding:16px 18px;font-size:13px;color:#64748b;line-height:1.7}
  .disclaimer strong{color:#94a3b8}
  .footer{margin-top:32px;text-align:center;font-size:12px;color:#475569}
  .back-link{margin-bottom:20px;font-size:13px}
  .back-link a{color:#9aa3ff;text-decoration:none}
</style>
</head>
<body>
<div class="container">
  <div class="back-link">
    <a href="/">← Back to Dashboard</a>
    &nbsp;&nbsp;·&nbsp;&nbsp;
    <a href="/export/sale-packet/html">View Full Sale Packet</a>
    &nbsp;&nbsp;·&nbsp;&nbsp;
    <a href="/export/sale-packet/pdf" download>⬇ Download PDF</a>
  </div>
  <div class="header">
    <h1>Airworthiness Check</h1>
    <div class="subtitle">${pa.ident || "Aircraft"} &nbsp;·&nbsp; ${pa.make || ""} ${pa.model || ""} &nbsp;·&nbsp; Generated ${generatedFormatted}</div>
  </div>

  <div class="result-banner">
    <div class="result-badge">${resultText}</div>
    <div>
      <div class="result-text">${resultDesc}</div>
      <div class="result-sub">Record-based assessment only — not a legal airworthiness determination</div>
    </div>
  </div>

  <div class="summary-row">
    <div class="summary-pill" style="background:#14532d;color:#86efac;">${passCount} Passed</div>
    ${failCount > 0 ? `<div class="summary-pill" style="background:#7f1d1d;color:#fca5a5;">${failCount} Failed</div>` : ""}
    ${unknownCount > 0 ? `<div class="summary-pill" style="background:#78350f;color:#fde68a;">${unknownCount} Unknown</div>` : ""}
  </div>

  <div class="checks">${checkRows}</div>

  <div class="disclaimer">
    <strong>Important:</strong> This is a record-based assessment derived from data entered into AirLog. It does not constitute a legal determination of airworthiness under 14 CFR Part 91. A qualified A&amp;P mechanic or IA must physically inspect the aircraft and review all maintenance logbooks prior to purchase. The absence of a record in this system does not confirm compliance — it may simply mean the record has not been entered.
  </div>

  <div class="footer">Generated by AirLog &nbsp;·&nbsp; ${new Date().toISOString()}</div>
</div>
</body>
</html>`;

  res.setHeader("Content-Type", "text/html");
  res.send(html);
});

app.get("/verify", (req, res) => {
  // If no tx param, use the stored anchorTx from verification.json for self-contained verification
  const tx = req.query.tx || readVerification()?.anchorTx || null;
  const result = verifyAnchorTx(tx);
  if (req.query.format === "json") {
    return res.status(result.status).json(result.body);
  }
  res.status(result.status).setHeader("Content-Type", "text/html; charset=utf-8").send(renderVerifyHtml(result.body));
});

app.get("/verify/:tx", (req, res) => {
  const result = verifyAnchorTx(req.params.tx);
  if (req.query.format === "json") {
    return res.status(result.status).json(result.body);
  }
  res.status(result.status).setHeader("Content-Type", "text/html; charset=utf-8").send(renderVerifyHtml(result.body));
});

// ── Trust Report (JSON) ──────────────────────────────────────────────────────
app.get("/export/trust-report", (_req, res) => {
  const entries = readEntries();
  const aircraft = readAircraft();
  const verification = readVerification();
  const maintenance = readMaintenance();
  const hash = hashLogbook(entries, readProfile(), aircraft);

  const report = buildTrustReport({
    aircraft,
    entries,
    maintenance,
    verification: { ...verification, currentHash: hash },
  });

  res.setHeader("Content-Type", "application/json");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="airlog-trust-report-${new Date().toISOString().slice(0,10)}.json"`
  );
  res.send(JSON.stringify(report, null, 2));
});

// ── Trust Report (HTML) ──────────────────────────────────────────────────────
app.get("/export/trust-report/html", (_req, res) => {
  const entries = readEntries();
  const profile = readProfile();
  const aircraft = readAircraft();
  const verification = readVerification();
  const maintenance = readMaintenance();
  const hash = hashLogbook(entries, profile, aircraft);

  const report = buildTrustReport({
    aircraft,
    entries,
    maintenance,
    verification: { ...verification, currentHash: hash },
  });

  const {
    trustScore, riskLevel, riskFlags, provenance,
    complianceCalendar, maintenanceChronology, integrityVerification, logbookSnapshot
  } = report;

  const generatedFormatted = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

  function scoreColor(score) {
    if (score >= 80) return "#22c55e";
    if (score >= 50) return "#f59e0b";
    return "#ef4444";
  }

  function riskBadgeStyle(severity) {
    if (severity === "critical") return "background:#7f1d1d;color:#fca5a5;";
    if (severity === "high")     return "background:#7c2d12;color:#fdba74;";
    if (severity === "medium")   return "background:#78350f;color:#fde68a;";
    return "background:#1e3a5f;color:#93c5fd;";
  }

  function compColor(c) {
    if (c === "red")    return "#ef4444";
    if (c === "yellow") return "#f59e0b";
    if (c === "green")  return "#22c55e";
    return "#6b7280";
  }

  const riskFlagRows = riskFlags.length > 0
    ? riskFlags.map(f => `<tr>
        <td><span style="padding:2px 8px;border-radius:4px;font-size:12px;${riskBadgeStyle(f.severity)}">${f.severity.toUpperCase()}</span></td>
        <td style="font-family:monospace;font-size:12px;color:#94a3b8;">${f.code}</td>
        <td>${f.detail}</td>
      </tr>`).join("\n")
    : `<tr><td colspan="3" style="color:#22c55e;text-align:center;">No risk flags — records look clean.</td></tr>`;

  const compRows = complianceCalendar.map(c => `<tr>
    <td>${c.label}</td>
    <td>${c.dueDate || "—"}</td>
    <td>${c.daysUntilDue !== null ? c.daysUntilDue + " days" : "—"}</td>
    <td><span style="color:${compColor(c.color)};font-weight:600;">${c.status.replace(/_/g," ").toUpperCase()}</span></td>
  </tr>`).join("\n");

  const chronoRows = maintenanceChronology.map(m => {
    const gapBadge = m.gapDaysFromPrevious !== null
      ? `<span style="color:${m.gapDaysFromPrevious > 365 ? "#ef4444" : "#94a3b8"};font-size:11px;">(+${m.gapDaysFromPrevious}d gap)</span>`
      : "";
    const cat = (m.category || "").replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase());
    const rts = m.returnToService
      ? `<span style="color:#22c55e;">✓ RTS</span>`
      : `<span style="color:#ef4444;">✗ No RTS</span>`;
    return `<tr>
      <td>${m.date} ${gapBadge}</td>
      <td><span class="badge">${cat}</span></td>
      <td>${m.description || "—"}</td>
      <td>${m.mechanic || m.performedBy || "—"}</td>
      <td>${m.totalAirframeHours != null ? Number(m.totalAirframeHours).toFixed(1) + " hrs" : "—"}</td>
      <td>${rts}</td>
    </tr>`;
  }).join("\n");

  const hashLine = integrityVerification.anchored
    ? (integrityVerification.hashMatch
        ? `<span style="color:#22c55e;">✓ Hash verified — records unchanged since anchoring</span>`
        : `<span style="color:#ef4444;">✗ Hash mismatch — records may have changed since anchoring</span>`)
    : `<span style="color:#f59e0b;">⚠ Records not anchored — integrity cannot be independently verified</span>`;

  const provenanceRows = provenance ? `
    <tr><td>Registration</td><td>${provenance.ident || "—"}</td></tr>
    <tr><td>Type</td><td>${provenance.type || "—"}</td></tr>
    <tr><td>Serial Number</td><td>${provenance.serialNumber || "—"}</td></tr>
    <tr><td>Manufacture Year</td><td>${provenance.manufactureYear || "—"}</td></tr>
    <tr><td>Total Time in Service</td><td>${provenance.totalTimeInService != null ? Number(provenance.totalTimeInService).toFixed(1) + " hrs" : "—"}</td></tr>
    <tr><td>Registration Date</td><td>${provenance.registrationDate ? String(provenance.registrationDate).slice(0,10) : "—"}</td></tr>
    <tr><td>Engine Type</td><td>${provenance.engineType || "—"}</td></tr>
    <tr><td>Engine Serial</td><td>${provenance.engineSerial || "—"}</td></tr>
    <tr><td>Propeller Type</td><td>${provenance.propType || "—"}</td></tr>
    <tr><td>Propeller Serial</td><td>${provenance.propSerial || "—"}</td></tr>
  ` : `<tr><td colspan="2">No aircraft data</td></tr>`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>AirLog Trust Report — ${provenance?.ident || "Aircraft"}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{background:#0f1117;color:#e2e8f0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;padding:32px 24px;line-height:1.6}
  .container{max-width:900px;margin:0 auto}
  h1{font-size:28px;font-weight:700;margin-bottom:4px}
  h2{font-size:18px;font-weight:600;color:#94a3b8;margin:32px 0 12px;text-transform:uppercase;letter-spacing:.08em}
  .subtitle{color:#64748b;font-size:14px;margin-bottom:32px}
  .score-ring{display:inline-flex;flex-direction:column;align-items:center;justify-content:center;width:120px;height:120px;border-radius:50%;border:6px solid ${scoreColor(trustScore)};margin-bottom:8px}
  .score-num{font-size:40px;font-weight:800;color:${scoreColor(trustScore)}}
  .score-label{font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:.1em}
  .risk-banner{padding:12px 18px;border-radius:8px;margin-bottom:32px;font-weight:600;font-size:15px;background:${riskLevel === "high" ? "#7f1d1d" : riskLevel === "medium" ? "#78350f" : "#14532d"};color:${riskLevel === "high" ? "#fca5a5" : riskLevel === "medium" ? "#fde68a" : "#86efac"}}
  .header-row{display:flex;align-items:center;gap:32px;margin-bottom:24px}
  table{width:100%;border-collapse:collapse;font-size:14px;margin-bottom:16px}
  th{text-align:left;padding:8px 12px;background:#1e293b;color:#94a3b8;font-size:12px;text-transform:uppercase;letter-spacing:.06em;border-bottom:1px solid #334155}
  td{padding:8px 12px;border-bottom:1px solid #1e293b;vertical-align:top}
  tr:last-child td{border-bottom:none}
  .badge{background:#1e3a5f;color:#93c5fd;padding:2px 8px;border-radius:4px;font-size:12px;white-space:nowrap}
  .section{background:#141920;border:1px solid #1e293b;border-radius:10px;padding:20px;margin-bottom:24px}
  .integrity-box{background:#0d1520;border:1px solid #334155;border-radius:8px;padding:14px 18px;font-size:13px;color:#94a3b8;margin-top:8px}
  .integrity-box code{font-family:monospace;font-size:11px;word-break:break-all;color:#64748b;display:block;margin-top:4px}
  .footer{margin-top:40px;text-align:center;font-size:12px;color:#475569}
</style>
</head>
<body>
<div class="container">
  <div class="header-row">
    <div>
      <div class="score-ring"><span class="score-num">${trustScore}</span><span class="score-label">Trust Score</span></div>
    </div>
    <div>
      <h1>AirLog Trust Report</h1>
      <div class="subtitle">Aircraft: ${provenance?.ident || "—"} &nbsp;·&nbsp; Generated ${generatedFormatted}</div>
      <div class="risk-banner">Overall Risk: ${riskLevel.toUpperCase()} &nbsp;·&nbsp; ${riskFlags.length} flag${riskFlags.length !== 1 ? "s" : ""} found</div>
    </div>
  </div>

  <div class="section">
    <h2>Aircraft Provenance</h2>
    <table><tbody>${provenanceRows}</tbody></table>
  </div>

  <div class="section">
    <h2>Integrity Verification</h2>
    <div class="integrity-box">
      ${hashLine}
      <code>Anchor Hash: ${integrityVerification.anchorHash || "—"}<br>Current Hash: ${integrityVerification.currentHash || "—"}<br>Network: ${integrityVerification.anchorNetwork || "—"} &nbsp;·&nbsp; Anchored: ${integrityVerification.anchorTime ? String(integrityVerification.anchorTime).slice(0,10) : "—"}</code>
    </div>
  </div>

  <div class="section">
    <h2>Risk Indicators</h2>
    <table>
      <thead><tr><th>Severity</th><th>Code</th><th>Detail</th></tr></thead>
      <tbody>${riskFlagRows}</tbody>
    </table>
  </div>

  <div class="section">
    <h2>Compliance Calendar</h2>
    <table>
      <thead><tr><th>Item</th><th>Due Date</th><th>Days Until Due</th><th>Status</th></tr></thead>
      <tbody>${compRows}</tbody>
    </table>
  </div>

  <div class="section">
    <h2>Maintenance Chronology</h2>
    <table>
      <thead><tr><th>Date</th><th>Category</th><th>Description</th><th>Mechanic / Shop</th><th>Airframe Hrs</th><th>RTS</th></tr></thead>
      <tbody>${chronoRows || `<tr><td colspan="6" style="color:#64748b;text-align:center;">No maintenance records.</td></tr>`}</tbody>
    </table>
  </div>

  <div class="section">
    <h2>Logbook Snapshot</h2>
    <table><tbody>
      <tr><td>Total Flight Entries</td><td>${logbookSnapshot.totalEntries}</td></tr>
      <tr><td>Total Flight Hours</td><td>${Number(logbookSnapshot.totalHours).toFixed(1)}</td></tr>
    </tbody></table>
  </div>

  <div class="footer">Generated by AirLog &nbsp;·&nbsp; ${new Date().toISOString()}</div>
</div>
</body>
</html>`;

  res.setHeader("Content-Type", "text/html");
  res.send(html);

});

// ─── Aircraft Record Report (unified product) ────────────────────────────────
app.get("/report", (_req, res) => {
  const entries = readEntries();
  const profile = readProfile();
  const aircraft = readAircraft();
  const verification = readVerification();
  const maintenance = readMaintenance();

  // Use canonical hash (same algorithm as the contract) so anchor comparison is consistent
  const hash = aircraft[0]
    ? buildIntegrityResult({ aircraft: aircraft[0], entries }).anchorHash
    : hashLogbook(entries, profile, aircraft);

  // Auto-anchor: trigger in background if records changed since last anchor.
  // The report renders immediately with stored verification; anchor result persists for next load.
  let liveVerification = verification;
  const existingAnchorHash = verification?.anchorHash || null;
  if (aircraft[0] && (!existingAnchorHash || existingAnchorHash !== hash)) {
    // Update stored hash immediately so UI shows "Pending verification…"
    const pendingVerification = {
      ...(verification || {}),
      anchorHash: hash,
      airframeId: buildIntegrityResult({ aircraft: aircraft[0], entries }).airframeId,
      aircraftIdent: aircraft[0]?.ident || null,
      entries: entries.length,
      anchored: false,
      anchorTime: null,
      anchorTx: null,
      anchorNetwork: "midnight-local",
      runtimeAvailable: false,
      contract: "pending",
    };
    try { fs.writeFileSync(VERIFICATION_PATH, JSON.stringify(pendingVerification, null, 2)); } catch {}
    liveVerification = pendingVerification;

    // Fire real anchor in background — result persists to disk when done
    const totalHours = entries.reduce((s, e) => s + Number(e.total || 0), 0);
    const bgAirframeId = pendingVerification.airframeId;
    const bgHash = hash;
    anchorOnMidnight({ anchorHash: bgHash, airframeId: bgAirframeId, hours: totalHours })
      .then((anchorResult) => {
        const updated = {
          ...pendingVerification,
          anchored: anchorResult.anchored === true,
          anchorTime: anchorResult.anchoredAt || null,
          anchorTx: anchorResult.anchorId || null,
          anchorNetwork: anchorResult.network || "midnight-local",
          runtimeAvailable: anchorResult.anchored === true,
          contract: anchorResult.anchored
            ? { contractAddress: anchorResult.contractAddress, anchorId: anchorResult.anchorId }
            : anchorResult.pending ? "pending" : "unavailable",
        };
        try { fs.writeFileSync(VERIFICATION_PATH, JSON.stringify(updated, null, 2)); } catch {}
      })
      .catch(() => {});
  }

  const totals = computeTotals(entries);
  const generatedFormatted = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  const primaryAircraft = aircraft[0] || {};
  const anchored = liveVerification?.anchored || false;
  const anchorHash = liveVerification?.anchorHash || null;
  const hashMatch = anchorHash && anchorHash === hash;
  const gaps = computeGaps(aircraft, maintenance);
  const adEntries = maintenance.filter((m) => m.category === "ad-compliance" || (m.adCompliance && m.adCompliance.length > 0));

  function fmt(val) { return val ? String(val).slice(0, 10) : "—"; }
  function fmtNum(val) { return Number(val || 0).toFixed(1); }

  const today = new Date(); today.setHours(0,0,0,0);
  function daysUntil(dateStr) {
    if (!dateStr) return null;
    const d = new Date(String(dateStr).slice(0, 10));
    if (isNaN(d)) return null;
    return Math.round((d - today) / 86400000);
  }
  function complianceBadge(days) {
    if (days === null) return ["badge-gray", "Unknown"];
    if (days < 0) return ["badge-red", "Overdue"];
    if (days <= 30) return ["badge-red", "Due Soon"];
    if (days <= 90) return ["badge-yellow", "Upcoming"];
    return ["badge-green", "Current"];
  }

  // Compliance checks (airworthiness)
  const complianceChecks = [];
  function addCheck(label, dueDate, note) {
    const days = daysUntil(dueDate);
    const [cls, status] = complianceBadge(days);
    const detail = dueDate ? `Due ${fmt(dueDate)}${days !== null ? (days < 0 ? ` — ${Math.abs(days)} days overdue` : ` — ${days} days`) : ""}` : "No date on file";
    complianceChecks.push({ label, cls, status, detail, note: note || null });
  }
  addCheck("Annual Inspection", primaryAircraft.annualDue);
  addCheck("Transponder / ADS-B Check", primaryAircraft.transponderDue);
  addCheck("Pitot-Static Check", primaryAircraft.pitotStaticDue);
  addCheck("ELT Battery", primaryAircraft.eltBatteryDue);

  const overallPass = complianceChecks.every((c) => c.status === "Current");
  const overallFail = complianceChecks.some((c) => c.status === "Overdue");
  const overallUnknown = complianceChecks.some((c) => c.status === "Unknown");
  const verdictClass = overallFail ? "badge-red" : overallUnknown ? "badge-yellow" : "badge-green";
  const verdictLabel = overallFail
    ? "Records show unresolved airworthiness items"
    : overallUnknown
      ? "Records are incomplete for a full airworthiness call"
      : "Records support airworthiness";
  const verdictSubcopy = overallFail
    ? "At least one required inspection or equipment check is overdue in the records on file."
    : overallUnknown
      ? "Some required due dates are missing in the records, so a full determination is not possible yet."
      : "Inspection and equipment due dates on file are currently in date.";

  const complianceRows = complianceChecks.map((c) =>
    `<tr>
      <td>${c.label}</td>
      <td>${c.detail}</td>
      <td><span class="badge ${c.cls}">${c.status}</span></td>
    </tr>`
  ).join("\n");

  // Maintenance timeline
  const sortedMaint = [...maintenance].sort((a, b) => String(b.date).localeCompare(String(a.date)));
  const maintenanceRows = sortedMaint.map((m) => {
    const cat = (m.category || "").replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase());
    return `<tr>
      <td>${fmt(m.date)}</td>
      <td><span class="badge badge-gray">${cat || "—"}</span></td>
      <td>${m.description || "—"}</td>
      <td>${m.mechanic || m.performedBy || "—"}</td>
      <td>${m.totalAirframeHours != null ? fmtNum(m.totalAirframeHours) + " hrs" : "—"}</td>
      <td class="${m.returnToService ? "rts-yes" : "rts-no"}">${m.returnToService ? "✓" : "—"}</td>
    </tr>`;
  }).join("\n");

  // Verification summary (trust basis)
  const tbVerified = [];
  const tbAssumed = [];
  const tbMissing = [];
  if (maintenance.length > 0) tbVerified.push(`${maintenance.length} maintenance record${maintenance.length > 1 ? "s" : ""} on file`);
  if (primaryAircraft.annualDue) tbVerified.push(`Annual inspection on file — due ${fmt(primaryAircraft.annualDue)}`);
  if (entries.length > 0) tbVerified.push(`${entries.length} flight log entr${entries.length > 1 ? "ies" : "y"} recorded`);
  if (adEntries.length > 0) tbVerified.push(`${adEntries.length} AD compliance record${adEntries.length > 1 ? "s" : ""} present`);
  if (primaryAircraft.serialNumber) tbVerified.push("Aircraft serial number on file");
  if (primaryAircraft.engineSerial) tbVerified.push("Engine serial number on file");
  if (hash) tbVerified.push(`Record hash computed (${hash.slice(0,8)}…)`);
  tbAssumed.push("Flight hours are owner-reported and not independently audited");
  tbAssumed.push("Aircraft specifications are seller-provided");
  if (maintenance.length > 0) tbAssumed.push("Maintenance entries reflect logged mechanic records; workmanship itself is not inspected by AirLog");
  if (!anchored) tbAssumed.push("Record hash is generated locally and not yet externally anchored");
  if (!primaryAircraft.annualDue) tbMissing.push("Annual inspection date not recorded");
  if (adEntries.length === 0) tbMissing.push("No AD compliance records — compliance status cannot be confirmed");
  if (!primaryAircraft.engineSerial) tbMissing.push("Engine serial number not recorded");
  if (!primaryAircraft.serialNumber) tbMissing.push("Aircraft serial number not recorded");
  for (const g of gaps) { if (g.severity === "high" && g.description) tbMissing.push(g.description); }

  function listItems(arr, cls) {
    if (!arr.length) return `<li style="color:#6b7280;">None</li>`;
    return arr.map((s) => `<li class="${cls}">${s}</li>`).join("\n");
  }

  // Missing items / gaps
  const gapRows = gaps.length === 0
    ? `<p style="color:#22c55e;font-weight:600;padding:12px 20px;">No record gaps detected.</p>`
    : gaps.map((g) => {
        const color = g.severity === "high" ? "#ef4444" : g.severity === "medium" ? "#f59e0b" : "#6b7280";
        return `<tr>
          <td style="color:${color};font-weight:700;text-transform:uppercase;font-size:11px;">${g.severity || "low"}</td>
          <td>${g.description || "—"}</td>
        </tr>`;
      }).join("\n");

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Aircraft History & Pre-Buy Summary — ${primaryAircraft.ident || "Aircraft"}</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: "Helvetica Neue", Helvetica, Arial, sans-serif; font-size: 13px; color: #1a1a2e; background: #f5f7fa; line-height: 1.5; }
    @media print { body { background: #fff; font-size: 11px; } .no-print { display: none !important; } section { break-inside: avoid; } }
    .container { max-width: 960px; margin: 0 auto; padding: 24px 20px 48px; }
    .header { background: linear-gradient(135deg, #0d1b4b 0%, #1a3a8f 100%); color: #fff; padding: 32px 36px; border-radius: 8px; margin-bottom: 28px; display: flex; justify-content: space-between; align-items: flex-start; }
    .header-brand { font-size: 22px; font-weight: 700; letter-spacing: 0.04em; }
    .header-brand span { color: #7aa7ff; }
    .header-sub { font-size: 12px; color: #b0c4ff; margin-top: 4px; }
    .header-ident { text-align: right; }
    .header-ident .ident { font-size: 36px; font-weight: 800; letter-spacing: 0.06em; }
    .header-ident .type { font-size: 14px; color: #b0c4ff; margin-top: 2px; }
    .header-ident .gendate { font-size: 11px; color: #8099cc; margin-top: 6px; }
    section { background: #fff; border-radius: 8px; border: 1px solid #e2e8f0; margin-bottom: 20px; overflow: hidden; }
    .section-title { background: #f8fafc; border-bottom: 1px solid #e2e8f0; padding: 12px 20px; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: #4a5568; }
    .section-body { padding: 16px 20px; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; }
    th { background: #f8fafc; color: #4a5568; font-weight: 600; text-align: left; padding: 8px 10px; border-bottom: 1px solid #e2e8f0; font-size: 11px; text-transform: uppercase; letter-spacing: 0.04em; }
    td { padding: 8px 10px; border-bottom: 1px solid #f1f5f9; vertical-align: top; }
    tr:last-child td { border-bottom: none; }
    .badge { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 700; text-transform: uppercase; }
    .badge-green { background: #dcfce7; color: #166534; }
    .badge-red { background: #fee2e2; color: #991b1b; }
    .badge-yellow { background: #fef9c3; color: #854d0e; }
    .badge-gray { background: #f1f5f9; color: #475569; }
    .verdict { display: flex; align-items: center; gap: 12px; padding: 16px 20px; }
    .verdict-label { font-size: 20px; font-weight: 800; line-height: 1.3; }
    .verdict-sub { font-size: 13px; color: #6b7280; }
    .buyer-impact { margin: 0 20px 14px; border: 1px solid #e2e8f0; border-radius: 8px; background: #f8fafc; padding: 12px 14px; }
    .buyer-impact-title { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: #475569; margin-bottom: 6px; }
    .buyer-impact ul { margin: 0; padding-left: 18px; color: #334155; font-size: 12px; }
    .buyer-impact li { margin: 3px 0; }
    .rts-yes { color: #22c55e; font-weight: 700; }
    .rts-no { color: #94a3b8; }
    .two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; padding: 16px 20px; }
    .kv td:first-child { color: #6b7280; width: 52%; font-size: 12px; }
    .kv td:last-child { font-weight: 600; font-size: 12px; }
    ul.trust-list { list-style: none; padding: 0; margin: 0; }
    ul.trust-list li { padding: 4px 0; font-size: 12px; }
    li.ok::before { content: "✓ "; color: #22c55e; font-weight: 700; }
    li.assumed::before { content: "~ "; color: #f59e0b; font-weight: 700; }
    li.missing::before { content: "✗ "; color: #ef4444; font-weight: 700; }
    .tamper-seal { background: #0f1117; color: #e2e8f0; border-radius: 8px; padding: 20px; font-family: monospace; font-size: 12px; line-height: 1.8; }
    .tamper-seal .label { color: #64748b; font-size: 10px; text-transform: uppercase; letter-spacing: 0.08em; }
    .tamper-seal .value { color: #7aa7ff; word-break: break-all; }
    .disclaimer { font-size: 10px; color: #94a3b8; padding: 10px 20px; border-top: 1px dashed #e2e8f0; background: #fcfdff; }
    .back-link { display: inline-block; margin-bottom: 16px; font-size: 13px; color: #1a3a8f; text-decoration: none; }
    .back-link:hover { text-decoration: underline; }
    .print-btn { display: inline-block; padding: 8px 18px; background: #1a3a8f; color: #fff; border-radius: 8px; font-size: 13px; font-weight: 700; text-decoration: none; cursor: pointer; border: none; }
    .print-btn:hover { background: #0d1b4b; }
  </style>
</head>
<body>
<div class="container">

  <div class="no-print" style="margin-bottom:12px;display:flex;justify-content:space-between;align-items:center;">
    <a href="/" class="back-link">← Dashboard</a>
    <button class="print-btn" onclick="window.print()">Print / Save PDF</button>
  </div>

  <div class="header">
    <div>
      <div class="header-brand">Air<span>Log</span></div>
      <div class="header-sub">Aircraft History &amp; Pre-Buy Summary</div>
    </div>
    <div class="header-ident">
      <div class="ident">${primaryAircraft.ident || "—"}</div>
      <div class="type">${primaryAircraft.type || "—"}</div>
      <div class="gendate">Generated ${generatedFormatted}</div>
    </div>
  </div>

  <!-- 1. Compliance Status -->
  <section>
    <div class="section-title">Compliance Status</div>
    <div class="verdict">
      <div class="verdict-label"><span class="badge ${verdictClass}" style="font-size:14px;padding:6px 12px;text-transform:none;">${verdictLabel}</span></div>
      <div class="verdict-sub">${verdictSubcopy}<br><em>Record-based screening only; confirm condition with a qualified A&amp;P pre-buy inspection.</em></div>
    </div>
    <div class="buyer-impact">
      <div class="buyer-impact-title">Buyer Impact</div>
      <ul>
        <li><strong>Pre-buy process:</strong> ${overallFail ? "Expect additional inspection findings and corrective actions before close." : overallUnknown ? "Expect a smoother process once missing dates and records are provided." : "Records suggest a smoother pre-buy process with fewer compliance surprises."}</li>
        <li><strong>Documentation risk:</strong> ${tbMissing.length > 0 ? "Some required records are missing; unresolved documentation may delay underwriting or escrow." : "No major documentation gaps are flagged in this report."}</li>
        <li><strong>Resale position:</strong> ${overallFail || tbMissing.length > 0 ? "Open record issues can reduce buyer confidence and negotiating leverage." : "Complete and current records generally support stronger resale confidence."}</li>
      </ul>
    </div>
    <table>
      <thead><tr><th>Item</th><th>Due Date</th><th>Status</th></tr></thead>
      <tbody>${complianceRows}</tbody>
    </table>
  </section>

  <!-- 2. Aircraft Summary -->
  <section>
    <div class="section-title">Aircraft Summary</div>
    <div class="two-col">
      <table class="kv">
        <tbody>
          <tr><td>Registration</td><td>${primaryAircraft.ident || "—"}</td></tr>
          <tr><td>Make / Model</td><td>${[primaryAircraft.make, primaryAircraft.model].filter(Boolean).join(" ") || primaryAircraft.type || "—"}</td></tr>
          <tr><td>Year</td><td>${primaryAircraft.manufactureYear || primaryAircraft.year || "—"}</td></tr>
          <tr><td>Serial Number</td><td>${primaryAircraft.serialNumber || "—"}</td></tr>
          <tr><td>Total Time in Service</td><td>${primaryAircraft.totalTimeInService != null ? fmtNum(primaryAircraft.totalTimeInService) + " hrs" : "—"}</td></tr>
        </tbody>
      </table>
      <table class="kv">
        <tbody>
          <tr><td>Engine Type</td><td>${primaryAircraft.engineType || "—"}</td></tr>
          <tr><td>Engine Serial</td><td>${primaryAircraft.engineSerial || "—"}</td></tr>
          <tr><td>Engine SMOH</td><td>${primaryAircraft.engineTimeSMOH != null ? fmtNum(primaryAircraft.engineTimeSMOH) + " hrs" : "—"}</td></tr>
          <tr><td>Propeller Type</td><td>${primaryAircraft.propType || "—"}</td></tr>
          <tr><td>Propeller Serial</td><td>${primaryAircraft.propSerial || "—"}</td></tr>
        </tbody>
      </table>
    </div>
    <div style="padding:0 20px 16px;">
      <table class="kv" style="max-width:480px;">
        <tbody>
          <tr><td>Flight Log Entries</td><td>${entries.length}</td></tr>
          <tr><td>Total Flight Hours</td><td>${fmtNum(totals.total)} hrs</td></tr>
          <tr><td>PIC Hours</td><td>${fmtNum(totals.pic)} hrs</td></tr>
          <tr><td>Pilot on File</td><td>${profile?.pilot?.fullName || "—"}</td></tr>
        </tbody>
      </table>
    </div>
  </section>

  <!-- 3. Maintenance Timeline -->
  <section>
    <div class="section-title">Maintenance Timeline</div>
    ${maintenance.length === 0
      ? `<p style="padding:16px 20px;color:#6b7280;">No maintenance records on file.</p>`
      : `<table>
          <thead><tr><th>Date</th><th>Category</th><th>Description</th><th>Mechanic</th><th>Airframe Hrs</th><th>RTS</th></tr></thead>
          <tbody>${maintenanceRows}</tbody>
        </table>`}
  </section>

  <!-- 4. Verification Summary -->
  <section>
    <div class="section-title">Verification Summary</div>
    <div class="two-col">
      <div>
        <div style="font-size:11px;font-weight:700;text-transform:uppercase;color:#4a5568;margin-bottom:8px;">Verified</div>
        <ul class="trust-list">${listItems(tbVerified, "ok")}</ul>
      </div>
      <div>
        <div style="font-size:11px;font-weight:700;text-transform:uppercase;color:#4a5568;margin-bottom:8px;">Reported, Not Independently Verified</div>
        <ul class="trust-list">${listItems(tbAssumed, "assumed")}</ul>
      </div>
    </div>
  </section>

  <!-- 5. Missing Items -->
  <section>
    <div class="section-title">Missing Items &amp; Gaps</div>
    ${gaps.length === 0
      ? gapRows
      : `<table>
          <thead><tr><th>Severity</th><th>Description</th></tr></thead>
          <tbody>${gapRows}</tbody>
        </table>`}
    ${tbMissing.length > 0
      ? `<div style="padding:12px 20px;border-top:1px solid #f1f5f9;">
          <div style="font-size:11px;font-weight:700;text-transform:uppercase;color:#4a5568;margin-bottom:8px;">Not Recorded</div>
          <ul class="trust-list">${listItems(tbMissing, "missing")}</ul>
        </div>`
      : ""}
  </section>

  <!-- 6. Tamper Seal -->
  <section>
    <div class="section-title">Tamper Seal</div>
    <div style="padding:16px 20px;">
      <div class="tamper-seal">
        <div style="margin-bottom:10px;">
          <span class="label">Verification Status</span><br>
          <span class="value" style="font-size:14px;color:${anchored && hashMatch ? "#22c55e" : anchored && !hashMatch ? "#ef4444" : "#94a3b8"};">
            ${anchored && hashMatch ? "Anchored on Midnight ✓" : anchored && !hashMatch ? "Verification failed — records changed since anchor" : "Pending verification…"}
          </span>
        </div>
        <div style="margin-top:14px;display:flex;gap:10px;flex-wrap:wrap;align-items:center;">
          <a href="/verify/hash/${hash}" style="display:inline-block;padding:8px 16px;background:#1e3a5f;color:#93c5fd;border-radius:6px;font-size:12px;font-weight:600;text-decoration:none;">Verify Report</a>
          ${anchored && liveVerification?.anchorTx ? `<a href="/verify/${liveVerification.anchorTx}" target="_blank" style="display:inline-block;padding:8px 16px;background:#312e81;color:#a5b4fc;border-radius:6px;font-size:12px;font-weight:600;text-decoration:none;">Verify on Blockchain ↗</a>` : ""}
        </div>
        <p style="margin-top:8px;font-size:11px;color:#64748b;">Verify internally or confirm independently on the Midnight network.</p>
        <details style="margin-top:12px;">
          <summary style="cursor:pointer;font-size:11px;color:#64748b;letter-spacing:0.05em;text-transform:uppercase;user-select:none;">View verification details</summary>
          <div style="margin-top:10px;">
            <div><span class="label">Report Hash</span></div>
            <div><span class="value">${hash || "—"}</span></div>
            ${anchored && liveVerification?.anchorTx ? `<div style="margin-top:8px;"><span class="label">Anchor ID</span></div>
            <div><span class="value">${liveVerification.anchorTx}</span></div>` : ""}
            ${anchored && liveVerification?.anchorTime ? `<div style="margin-top:8px;"><span class="label">Anchored At</span></div>
            <div><span class="value">${String(liveVerification.anchorTime).slice(0, 19).replace("T", " ")} UTC</span></div>` : ""}
            ${hashMatch ? `<div style="margin-top:8px;"><span class="label">Integrity</span></div>
            <div><span class="value" style="color:#22c55e;">✓ Records match anchored hash</span></div>` : anchorHash ? `<div style="margin-top:8px;"><span class="label">Integrity</span></div>
            <div><span class="value" style="color:#ef4444;">Records have changed since last anchor</span></div>` : ""}
          </div>
        </details>
      </div>
      <p style="margin-top:12px;font-size:11px;color:#9ca3af;">
        This report is independently verified. Any change to the underlying records produces a different fingerprint.
      </p>
    </div>
    <p class="disclaimer">This report was generated by AirLog and reflects data entered by the aircraft owner or operator. AirLog does not independently verify the accuracy of maintenance records, flight hours, or compliance dates. This report is not a substitute for a pre-purchase inspection by a qualified A&amp;P mechanic or IA.</p>
  </section>

</div>
</body>
</html>`;

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(html);
});

// ─── Readiness API ────────────────────────────────────────────────────────────
// Logic lives in src/lib/readiness.mjs — computeReadiness() is the entry point.

app.get("/assistant/readiness", (req, res) => {
  const asOf = String(req.query.asOf || new Date().toISOString());
  const result = computeReadiness(
    readProfile(),
    readEntries(),
    readAircraft(),
    readMaintenance(),
    asOf
  );
  res.json(result);
});

app.patch("/profile/phase", (req, res) => {
  const { pilotPhase } = req.body || {};
  if (!pilotPhase || !PILOT_PHASES[pilotPhase]) {
    return res.status(400).json({ error: "Invalid pilotPhase. Valid values: " + Object.keys(PILOT_PHASES).join(", ") });
  }
  const profile = readProfile();
  profile.pilotPhase = pilotPhase;
  saveProfile(profile);
  res.json({ ok: true, pilotPhase, label: PILOT_PHASES[pilotPhase].label });
});

// ── Wallet State (server-side session) ───────────────────────────────────────

// POST /wallet/connect — browser posts connected wallet address here
app.post("/wallet/connect", (req, res) => {
  const { address, coinPublicKey } = req.body || {};
  if (!address) return res.status(400).json({ error: "address required" });
  const session = { address, coinPublicKey: coinPublicKey || null, connectedAt: new Date().toISOString() };
  saveWalletSession(session);
  res.json({ ok: true, session });
});

// POST /wallet/disconnect — clear wallet session
app.post("/wallet/disconnect", (_req, res) => {
  if (fs.existsSync(WALLET_PATH)) fs.unlinkSync(WALLET_PATH);
  res.json({ ok: true });
});

// GET /wallet/status — current wallet session
app.get("/wallet/status", (_req, res) => {
  const session = readWalletSession();
  res.json({ connected: !!session, session: session || null });
});

// GET /wallet — wallet connect UI
app.get("/wallet", (_req, res) => {
  const session = readWalletSession();
  const verification = readVerification();
  res.type("html").send(`<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Wallet — PilotLog</title>
  <style>
  body { font-family: -apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial,sans-serif; background:#0b0f18; color:#fff; margin:0; }
  .wrap { max-width:680px; margin:0 auto; padding:32px 20px; }
  .topbar { display:flex; justify-content:space-between; align-items:center; margin-bottom:28px; }
  .brand { font-size:20px; font-weight:800; letter-spacing:-0.5px; }
  .nav a { color:#9aa3ff; text-decoration:none; font-size:14px; margin-left:16px; }
  .nav a:hover { color:#fff; }
  h1 { font-size:28px; font-weight:800; letter-spacing:-0.5px; margin:0 0 6px; }
  .sub { color:#b6b9c6; font-size:14px; margin-bottom:28px; }
  .card { background:#121624; border:1px solid #222843; border-radius:14px; padding:24px; margin-bottom:16px; }
  .card-title { font-size:12px; font-weight:700; text-transform:uppercase; letter-spacing:.08em; color:#b6b9c6; margin-bottom:14px; }
  .status-row { display:flex; align-items:center; gap:10px; margin-bottom:14px; }
  .dot { width:10px; height:10px; border-radius:50%; flex-shrink:0; }
  .dot.connected { background:#22c55e; }
  .dot.disconnected { background:#6b7280; }
  .dot.detecting { background:#f59e0b; animation:pulse 1s infinite; }
  @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.4} }
  .status-label { font-size:15px; font-weight:700; }
  .address { font-family:monospace; font-size:13px; color:#9aa3ff; word-break:break-all; background:#0b0f18; border:1px solid #222843; border-radius:8px; padding:10px 12px; margin-bottom:14px; }
  .btn { display:inline-block; padding:11px 24px; background:#1a3a8f; color:#fff; border:none; border-radius:8px; font-size:14px; font-weight:700; cursor:pointer; text-decoration:none; transition:background .15s; }
  .btn:hover { background:#1e46b0; }
  .btn:disabled { background:#1a2240; color:#6b7280; cursor:not-allowed; }
  .btn-outline { background:transparent; border:1px solid #222843; color:#9aa3ff; }
  .btn-outline:hover { background:#121624; }
  .btn-danger { background:#7f1d1d; color:#fca5a5; }
  .btn-danger:hover { background:#991b1b; }
  .btn-green { background:#14532d; color:#86efac; }
  .btn-green:hover { background:#166534; }
  .actions { display:flex; gap:10px; flex-wrap:wrap; margin-top:14px; }
  .note { font-size:13px; color:#6b7280; margin-top:10px; line-height:1.5; }
  .tx-result { background:#0b1a0f; border:1px solid #14532d; border-radius:8px; padding:12px; font-size:13px; color:#86efac; margin-top:12px; display:none; word-break:break-all; }
  .tx-result.show { display:block; }
  .not-found { background:#1c0a03; border:1px solid #7c2d12; border-radius:8px; padding:12px; font-size:13px; color:#fdba74; margin-top:12px; display:none; }
  .not-found.show { display:block; }
  .info-row { display:flex; justify-content:space-between; font-size:13px; padding:5px 0; border-bottom:1px solid #1a2040; }
  .info-row:last-child { border-bottom:none; }
  .info-label { color:#6b7280; }
  .info-val { color:#e5e7eb; font-family:monospace; }
  .spinner { display:inline-block; width:14px; height:14px; border:2px solid #1a3a8f; border-top-color:#9aa3ff; border-radius:50%; animation:spin .7s linear infinite; vertical-align:middle; margin-right:6px; }
  @keyframes spin { to { transform:rotate(360deg); } }
  </style>
</head>
<body>
<div class="wrap">
  <div class="topbar">
    <div class="brand">PilotLog</div>
    <div class="nav">
      <a href="/">← Home</a>
      <a href="/export/sale-packet/html">Sale Packet</a>
      <span id="wallet-nav-link" style="font-size:14px;margin-left:16px;color:#b6b9c6;">Checking wallet…</span>
    </div>
  </div>
  ${walletStatusScript}

  <h1>Wallet</h1>
  <div class="sub">${session ? 'Session Active · Ready to Verify' : 'Reconnect wallet to finalize verification'}</div>

  <!-- Primary session card — driven by server session -->
  <div class="card" id="wallet-card">
    <div class="card-title">Wallet Connection</div>
    <div class="status-row">
      <div class="dot ${session ? 'connected' : 'detecting'}" id="status-dot"></div>
      <div class="status-label" id="status-label">${session ? 'Wallet Connected' : 'No Wallet Session'}</div>
    </div>
    ${session ? `<div id="address-box" class="address">${session.address}</div>` : `<div id="address-box" class="address" style="display:none"></div>`}
    <!-- Extension note — only shown when no session or extension missing after connect attempt -->
    <div class="not-found" id="not-found-box"></div>
    <div class="actions" id="wallet-actions">
      ${session
        ? `<button class="btn btn-danger" id="btn-connect" onclick="disconnectWallet()">Disconnect</button>`
        : `<button class="btn" id="btn-connect" disabled><span class="spinner" id="connect-spinner"></span><span id="btn-label">Detecting…</span></button>`
      }
    </div>
    <div class="note" id="wallet-note">${session ? 'Session Active · Connected ' + new Date(session.connectedAt || Date.now()).toLocaleString() : 'Connect 1AM wallet to link your identity to flight records.'}</div>
  </div>

  <!-- Session details card — shown when server session exists -->
  <div class="card" id="session-card" style="${session ? 'display:block' : 'display:none'}">
    <div class="card-title">Session</div>
    <div class="info-row"><span class="info-label">Address</span><span class="info-val" id="session-address">${session ? session.address : '—'}</span></div>
    <div class="info-row"><span class="info-label">Connected At</span><span class="info-val" id="session-connected">${session ? new Date(session.connectedAt || Date.now()).toLocaleString() : '—'}</span></div>
    ${verification && verification.anchored ? `<div class="info-row"><span class="info-label">Anchor Tx</span><span class="info-val">${verification.anchorTx || '—'}</span></div>` : ''}
  </div>

  <!-- Extension status — secondary debug info -->
  <div class="card" id="ext-card" style="display:none">
    <div class="card-title">Extension Status</div>
    <div class="info-row"><span class="info-label">1AM Extension</span><span class="info-val" id="ext-status">Checking…</span></div>
    <div id="ext-connect-actions" style="margin-top:12px;display:none">
      <button class="btn" id="btn-ext-connect" onclick="connectWallet()">Connect Extension</button>
    </div>
  </div>

  <!-- Network card -->
  <div class="card" id="network-card" style="display:none">
    <div class="card-title">Network</div>
    <div class="info-row"><span class="info-label">Network</span><span class="info-val" id="net-name">Midnight PreProd</span></div>
    <div class="info-row"><span class="info-label">Address</span><span class="info-val" id="net-address">—</span></div>
    <div class="info-row"><span class="info-label">tNight Balance</span><span class="info-val" id="net-balance">—</span></div>
  </div>

  <!-- Test transaction card -->
  <div class="card" id="tx-card" style="display:none">
    <div class="card-title">Test Transaction</div>
    <p style="font-size:14px;color:#b6b9c6;margin:0 0 14px;">
      Confirm wallet integration by signing a <code>registerAirframe</code> transaction on Midnight PreProd.
      Proving is handled remotely by the 1AM Proof Station — no local proof server required.
    </p>
    <div class="actions">
      <button class="btn btn-green" id="btn-tx" onclick="signTestTx()">Sign Test Transaction</button>
    </div>
    <div class="tx-result" id="tx-result"></div>
  </div>
</div>

<script>
// ── 1AM Wallet — Midnight DApp Connector API ─────────────────────────────────
// Server session is source of truth for connected state.
// Extension detection is secondary — needed only for signing new transactions.

const NETWORK_ID = 'preview';
const SERVER_SESSION_EXISTS = ${session ? 'true' : 'false'};

let connectedApi = null;   // ConnectedAPI (from wallet.connect())

// ── Secondary: extension detection ────────────────────────────────────────────
// Only updates the extension status card, does NOT override primary connection state.

function setBtnLabel(text) {
  const el = document.getElementById('btn-label');
  if (el) el.textContent = text;
}

async function detectProvider() {
  const extCard = document.getElementById('ext-card');
  const extStatus = document.getElementById('ext-status');
  const extConnectActions = document.getElementById('ext-connect-actions');

  // Poll up to 3s — extension injects after page load
  for (let i = 0; i < 6; i++) {
    const wallet = window.midnight?.['1am'];
    if (wallet) {
      console.log('[wallet] 1AM extension detected');
      if (extStatus) extStatus.textContent = 'Detected — ready to connect';
      if (extCard) extCard.style.display = 'block';
      // If no server session, show connect option in extension card
      if (!SERVER_SESSION_EXISTS && extConnectActions) {
        extConnectActions.style.display = 'block';
      }
      // If no server session, also enable the primary connect button
      if (!SERVER_SESSION_EXISTS) {
        const btnConnect = document.getElementById('btn-connect');
        const spinner = document.getElementById('connect-spinner');
        if (spinner) spinner.style.display = 'none';
        setBtnLabel('Connect Wallet');
        if (btnConnect) { btnConnect.disabled = false; btnConnect.onclick = connectWallet; }
      }
      return;
    }
    await new Promise(r => setTimeout(r, 500));
  }

  // Extension not found
  console.log('[wallet] 1AM extension not detected');
  if (SERVER_SESSION_EXISTS) {
    // Session exists — show as secondary warning only
    const notFound = document.getElementById('not-found-box');
    if (notFound) {
      notFound.innerHTML = '<strong>Extension not currently detected.</strong> Reconnect wallet to finalize verification and sign new transactions.';
      notFound.classList.add('show');
    }
  } else {
    // No session — show primary error
    const dot = document.getElementById('status-dot');
    const label = document.getElementById('status-label');
    const btnConnect = document.getElementById('btn-connect');
    const spinner = document.getElementById('connect-spinner');
    const notFound = document.getElementById('not-found-box');
    if (dot) { dot.className = 'dot disconnected'; dot.style.background = '#ef4444'; }
    if (label) label.textContent = 'No Midnight wallet detected';
    if (spinner) spinner.style.display = 'none';
    setBtnLabel('Retry');
    if (btnConnect) { btnConnect.disabled = false; btnConnect.onclick = () => location.reload(); }
    if (notFound) {
      notFound.innerHTML = '<strong>1AM wallet not detected.</strong><br>Install the Midnight Lace extension and reload this page.<br><a href="https://midnight.network" target="_blank" style="color:#fdba74">midnight.network →</a>';
      notFound.classList.add('show');
    }
  }
}

// ── Connect flow ──────────────────────────────────────────────────────────────

async function connectWallet() {
  console.log('[wallet] connectWallet triggered');
  const dot = document.getElementById('status-dot');
  const label = document.getElementById('status-label');
  const btnConnect = document.getElementById('btn-connect');
  const spinner = document.getElementById('connect-spinner');
  const addressBox = document.getElementById('address-box');
  const walletNote = document.getElementById('wallet-note');

  if (btnConnect) btnConnect.disabled = true;
  if (spinner) spinner.style.display = 'inline-block';
  if (label) label.textContent = 'Connecting...';

  try {
    // Documented 1AM API: window.midnight['1am'].connect(networkId)
    const wallet = window.midnight?.['1am'];
    console.log('[wallet] window.midnight[1am]:', wallet);
    console.log('[wallet] window.midnight[1am] keys:', Object.keys(wallet || {}));
    console.log('[wallet] connect exists:', typeof (wallet?.connect));
    console.log('[wallet] networkId:', NETWORK_ID);

    if (!wallet) throw new Error('1AM wallet not installed — install the 1AM extension and reload');
    if (typeof wallet.connect !== 'function') {
      throw new Error('1AM detected, but connect(networkId) is unavailable. Keys: [' + Object.keys(wallet).join(', ') + ']');
    }

    // Connect using documented API
    connectedApi = await wallet.connect(NETWORK_ID);
    if (!connectedApi) throw new Error('wallet.connect() returned null — wallet rejected connection');
    console.log('[wallet] connect() succeeded');
    console.log('[wallet] connectedAPI keys:', Object.keys(connectedApi || {}));

    // Get wallet address — prefer shielded (Zswap), fall back to unshielded
    const addresses = await connectedApi.getShieldedAddresses();
    console.log('[wallet] addresses:', addresses);
    const shieldedAddress = addresses?.shieldedAddress;
    console.log('[wallet] shieldedAddress:', shieldedAddress);
    const walletAddress = shieldedAddress || 'No shielded address returned';
    console.log('[wallet] address:', walletAddress);

    // Persist address to localStorage for client-side session display
    if (shieldedAddress) {
      localStorage.setItem('pilotlog:address', shieldedAddress);
      localStorage.setItem('pilotlog:lastConnected', new Date().toISOString());
    }

    // Get wallet-configured network endpoints
    const config = await connectedApi.getConfiguration().catch(() => ({}));
    console.log('[wallet] networkId:', config.networkId);

    // Update UI
    if (dot) dot.className = 'dot connected';
    if (label) label.textContent = 'Wallet Connected';
    if (addressBox) { addressBox.textContent = walletAddress; addressBox.style.display = 'block'; }
    if (spinner) spinner.style.display = 'none';
    setBtnLabel('Disconnect');
    if (btnConnect) {
      btnConnect.disabled = false;
      btnConnect.onclick = disconnectWallet;
      btnConnect.className = 'btn btn-danger';
    }

    // Show network card
    const networkCard = document.getElementById('network-card');
    if (networkCard) networkCard.style.display = 'block';
    const netName = document.getElementById('net-name');
    if (netName) netName.textContent = config.networkId || NETWORK_ID;
    const netAddress = document.getElementById('net-address');
    if (netAddress) netAddress.textContent = walletAddress;
    const netBalance = document.getElementById('net-balance');
    if (netBalance) netBalance.textContent = '—';

    // Show test tx card
    const txCard = document.getElementById('tx-card');
    if (txCard) txCard.style.display = 'block';
    if (walletNote) walletNote.textContent = 'Session Active · Network: ' + (config.networkId || NETWORK_ID);

    // Update session card immediately (no reload needed)
    if (shieldedAddress) {
      const card = document.getElementById('session-card');
      if (card) {
        document.getElementById('session-address').textContent = shieldedAddress;
        document.getElementById('session-connected').textContent = new Date().toLocaleString();
        card.style.display = 'block';
      }
    }

    // Persist to server session
    await fetch('/wallet/connect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ address: walletAddress })
    });
    console.log('[wallet] connection success');

  } catch (err) {
    console.error('[wallet] connect error:', err);
    if (dot) { dot.className = 'dot disconnected'; dot.style.background = '#ef4444'; }
    if (label) label.textContent = 'Connection failed';
    if (spinner) spinner.style.display = 'none';
    if (btnConnect) { btnConnect.disabled = false; btnConnect.onclick = connectWallet; }
    setBtnLabel('Retry');
    if (walletNote) walletNote.textContent = 'Error: ' + (err.message || String(err));
  }
}

async function disconnectWallet() {
  connectedApi = null;
  localStorage.removeItem('pilotlog:address');
  localStorage.removeItem('pilotlog:lastConnected');
  await fetch('/wallet/disconnect', { method: 'POST' });
  location.reload();
}

// ── Test transaction ──────────────────────────────────────────────────────────

async function signTestTx() {
  const btn = document.getElementById('btn-tx');
  const result = document.getElementById('tx-result');
  btn.disabled = true;
  btn.textContent = 'Signing...';
  result.style.cssText = '';
  result.className = 'tx-result';

  try {
    if (!connectedApi) throw new Error('Wallet not connected');

    // Confirm wallet API is live and read address
    const addresses = await connectedApi.getShieldedAddresses();
    console.log('[wallet] addresses:', addresses);
    const shieldedAddress = addresses?.shieldedAddress;
    console.log('[wallet] shieldedAddress:', shieldedAddress);
    const walletAddress = shieldedAddress || 'No shielded address returned';

    // Get wallet-preferred indexer/prover config
    const config = await connectedApi.getConfiguration().catch(() => ({}));

    // Trigger server-side anchor, passing wallet config so server can use
    // the wallet's preferred endpoints if desired
    const resp = await fetch('/verify/anchor', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        walletAddress: walletAddress,
        indexerUri: config.indexerUri,
        proverServerUri: config.proverServerUri
      })
    });
    const data = await resp.json();

    result.textContent =
      'OK Test passed\\n' +
      'Wallet:  ' + walletAddress + '\\n' +
      'Network: ' + (config.networkId || NETWORK_ID) + '\\n' +
      (data.txId ? 'Anchor tx: ' + data.txId : 'Response: ' + JSON.stringify(data, null, 2));
    result.className = 'tx-result show';
    btn.textContent = 'Done';

  } catch (err) {
    result.textContent = 'Error: ' + (err.message || String(err));
    result.className = 'tx-result show';
    result.style.background = '#1c0a03';
    result.style.borderColor = '#7c2d12';
    result.style.color = '#fdba74';
    btn.disabled = false;
    btn.textContent = 'Retry';
  }
}

// Boot — session state is SSR'd; only run extension detection (secondary)
detectProvider();
</script>
</body>
</html>`);
});

// ─── Pilot Report (JSON) ──────────────────────────────────────────────────────
app.get("/pilot-report/json", (_req, res) => {
  const entries = readEntries();
  const profile = readProfile();
  const aircraft = readAircraft();
  const maintenance = readMaintenance();
  const verification = readVerification();
  const report = buildPilotReport({ profile, entries, aircraft, maintenance, verification });
  res.json(report);
});

// ─── Pilot Report (HTML) ──────────────────────────────────────────────────────
app.get("/pilot-report", (_req, res) => {
  const entries = readEntries();
  const profile = readProfile();
  const aircraft = readAircraft();
  const maintenance = readMaintenance();
  const verification = readVerification();
  const report = buildPilotReport({ profile, entries, aircraft, maintenance, verification });

  const r = report;
  const id = r.pilotIdentity;
  const cert = r.certificateSnapshot;
  const currency = r.currencySummary;
  const activity = r.flightActivity;
  const integrity = r.integrityStatus;
  const generatedFormatted = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

  function badge(color, label) {
    const map = { green: "badge-green", red: "badge-red", yellow: "badge-yellow", gray: "badge-gray" };
    return `<span class="badge ${map[color] || "badge-gray"}">${label}</span>`;
  }

  function row(label, value, extra) {
    return `<tr><td>${label}</td><td>${value || "—"}${extra ? ` <span style="color:#6b7280;font-size:11px;">${extra}</span>` : ""}</td></tr>`;
  }

  // Certificate / ratings block
  const certListHtml = id.certificates.length
    ? id.certificates.map(c => `<li>${c}</li>`).join("")
    : "<li style='color:#6b7280;'>None on file</li>";

  // Medical block
  const med = cert.medical;
  const medBadge = badge(med.status.color, med.status.label);
  const medRows = [
    row("Type", med.kind),
    row("Class", med.class),
    row("Issued", med.issued),
    row("Expires", med.expires, med.daysLeft !== null ? `(${med.daysLeft > 0 ? med.daysLeft + " days left" : Math.abs(med.daysLeft) + " days ago"})` : ""),
    row("Status", medBadge),
  ].join("");

  // Flight review
  const fr = cert.flightReview;
  const frBadge = badge(fr.status.color, fr.status.label);
  const frRows = [
    row("Last Review", fr.lastDate),
    row("Expires", fr.expiryDate, fr.daysLeft !== null ? `(${fr.daysLeft > 0 ? fr.daysLeft + " days left" : Math.abs(fr.daysLeft) + " days ago"})` : ""),
    row("Status", frBadge),
  ].join("");

  // Currency rows
  const currencies = [
    currency.passengerDay,
    currency.passengerNight,
    currency.ifr,
  ];
  const currencyRows = currencies.map(c => {
    const detail = c.approaches !== undefined
      ? `${c.approaches} approaches, ${c.holds} holds (${c.window})`
      : `${c.count}/${c.required} landings (${c.window})`;
    return `<tr><td>${c.label}</td><td>${detail}</td><td>${badge(c.status.color, c.status.label)}</td></tr>`;
  }).join("");

  // Activity rows
  const activityRows = [
    row("Total Entries", activity.totalEntries),
    row("Total Hours", activity.totalHours + " hrs"),
    row("PIC Hours", activity.picHours + " hrs"),
    row("Dual Received", activity.dualReceivedHours + " hrs"),
    row("Cross-Country", activity.crossCountryHours + " hrs"),
    row("Night", activity.nightHours + " hrs"),
    row("IFR (sim + actual)", activity.ifrHours + " hrs"),
    row("Last 90 Days", activity.last90Hours + " hrs"),
  ].join("");

  // Recent flights
  const recentRows = activity.recentFlights.length
    ? activity.recentFlights.map(f =>
        `<tr><td>${f.date || "—"}</td><td>${f.route || "—"}</td><td>${f.aircraft || "—"}</td><td>${f.hours} hrs</td><td>${f.remarks || "—"}</td></tr>`
      ).join("")
    : `<tr><td colspan="5" style="color:#6b7280;">No flights logged yet.</td></tr>`;

  // Integrity
  const intBadge = badge(integrity.status.color, integrity.status.label);

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Pilot Report — ${id.name || "Pilot"}</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: "Helvetica Neue", Helvetica, Arial, sans-serif; font-size: 13px; color: #1a1a2e; background: #f5f7fa; line-height: 1.5; }
    @media print { body { background: #fff; font-size: 11px; } .no-print { display: none !important; } section { break-inside: avoid; } }
    .container { max-width: 960px; margin: 0 auto; padding: 24px 20px 48px; }
    .header { background: linear-gradient(135deg, #0d1b4b 0%, #1a3a8f 100%); color: #fff; padding: 32px 36px; border-radius: 8px; margin-bottom: 28px; display: flex; justify-content: space-between; align-items: flex-start; }
    .header-brand { font-size: 22px; font-weight: 700; letter-spacing: 0.04em; }
    .header-brand span { color: #7aa7ff; }
    .header-sub { font-size: 12px; color: #b0c4ff; margin-top: 4px; }
    .header-ident .name { font-size: 28px; font-weight: 800; letter-spacing: 0.02em; text-align: right; }
    .header-ident .gendate { font-size: 11px; color: #8099cc; margin-top: 6px; text-align: right; }
    section { background: #fff; border-radius: 8px; border: 1px solid #e2e8f0; margin-bottom: 20px; overflow: hidden; }
    .section-title { background: #f8fafc; border-bottom: 1px solid #e2e8f0; padding: 12px 20px; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: #4a5568; }
    .section-body { padding: 16px 20px; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; }
    th { background: #f8fafc; color: #4a5568; font-weight: 600; text-align: left; padding: 8px 10px; border-bottom: 1px solid #e2e8f0; font-size: 11px; text-transform: uppercase; letter-spacing: 0.04em; }
    td { padding: 8px 10px; border-bottom: 1px solid #f1f5f9; vertical-align: top; }
    tr:last-child td { border-bottom: none; }
    .badge { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 700; text-transform: uppercase; }
    .badge-green { background: #dcfce7; color: #166534; }
    .badge-red { background: #fee2e2; color: #991b1b; }
    .badge-yellow { background: #fef9c3; color: #854d0e; }
    .badge-gray { background: #f1f5f9; color: #475569; }
    ul.cert-list { list-style: none; padding: 0; margin: 0; }
    ul.cert-list li { padding: 5px 0; border-bottom: 1px solid #f1f5f9; font-size: 13px; }
    ul.cert-list li:last-child { border-bottom: none; }
    .two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
    @media (max-width: 640px) { .two-col { grid-template-columns: 1fr; } .header { flex-direction: column; gap: 12px; } .header-ident .name { text-align: left; } .header-ident .gendate { text-align: left; } }
    .no-print-actions { display: flex; gap: 12px; margin-bottom: 20px; }
    .btn { display: inline-block; padding: 9px 18px; background: #1a3a8f; color: #fff; border: none; border-radius: 6px; font-size: 13px; font-weight: 600; cursor: pointer; text-decoration: none; }
    .btn:hover { background: #1e46b0; }
    .btn-outline { background: transparent; border: 1px solid #cbd5e1; color: #1a3a8f; }
    .btn-outline:hover { background: #f8fafc; }
    .integrity-row { display: flex; gap: 24px; flex-wrap: wrap; }
    .integrity-item { flex: 1; min-width: 180px; }
    .integrity-label { font-size: 11px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.04em; margin-bottom: 4px; }
    .integrity-val { font-size: 13px; font-weight: 600; font-family: monospace; }
  </style>
</head>
<body>
<div class="container">
  <div class="header">
    <div>
      <div class="header-brand">Air<span>Log</span></div>
      <div class="header-sub">Pilot Report</div>
    </div>
    <div class="header-ident">
      <div class="name">${id.name || "Pilot"}</div>
      <div class="gendate">Generated ${generatedFormatted}</div>
    </div>
  </div>

  <div class="no-print no-print-actions">
    <a href="/" class="btn btn-outline">← Dashboard</a>
    <a href="/pilot-report/json" class="btn btn-outline">View JSON</a>
    <button class="btn" onclick="window.print()">Print / PDF</button>
    <a href="/wallet" id="wallet-nav-link" style="margin-left:auto;font-size:13px;color:#b6b9c6;text-decoration:none;align-self:center;">Wallet</a>
  </div>
  ${walletStatusScript}

  <!-- Pilot Identity -->
  <section>
    <div class="section-title">Pilot Identity</div>
    <div class="section-body">
      <table>
        <tbody>
          ${row("Full Name", id.name)}
          ${row("Email", id.email)}
          ${row("Phone", id.phone)}
          ${row("Pilot Phase", id.pilotPhase)}
        </tbody>
      </table>
    </div>
  </section>

  <!-- Certificates & Ratings -->
  <section>
    <div class="section-title">Certificates &amp; Ratings</div>
    <div class="section-body">
      <ul class="cert-list">${certListHtml}</ul>
    </div>
  </section>

  <!-- Medical & Flight Review -->
  <div class="two-col">
    <section>
      <div class="section-title">Medical Certificate</div>
      <div class="section-body">
        <table><tbody>${medRows}</tbody></table>
      </div>
    </section>
    <section>
      <div class="section-title">Flight Review</div>
      <div class="section-body">
        <table><tbody>${frRows}</tbody></table>
      </div>
    </section>
  </div>

  <!-- Currency -->
  <section>
    <div class="section-title">Currency &amp; Readiness</div>
    <div class="section-body">
      <table>
        <thead><tr><th>Item</th><th>Detail</th><th>Status</th></tr></thead>
        <tbody>${currencyRows}</tbody>
      </table>
    </div>
  </section>

  <!-- Flight Activity -->
  <section>
    <div class="section-title">Flight Activity Summary</div>
    <div class="section-body">
      <table><tbody>${activityRows}</tbody></table>
    </div>
  </section>

  <!-- Recent Flights -->
  <section>
    <div class="section-title">Recent Flight History</div>
    <div class="section-body">
      <table>
        <thead><tr><th>Date</th><th>Route</th><th>Aircraft</th><th>Hours</th><th>Remarks</th></tr></thead>
        <tbody>${recentRows}</tbody>
      </table>
    </div>
  </section>

  <!-- Integrity -->
  <section>
    <div class="section-title">Verification &amp; Integrity</div>
    <div class="section-body">
      <div class="integrity-row">
        <div class="integrity-item">
          <div class="integrity-label">Status</div>
          <div class="integrity-val">${intBadge}</div>
        </div>
        <div class="integrity-item">
          <div class="integrity-label">Record Hash</div>
          <div class="integrity-val">${integrity.anchorHash || "—"}</div>
        </div>
        <div class="integrity-item">
          <div class="integrity-label">Anchored</div>
          <div class="integrity-val">${integrity.anchorTime || "—"}</div>
        </div>
        <div class="integrity-item">
          <div class="integrity-label">Network</div>
          <div class="integrity-val">${integrity.anchorNetwork || "—"}</div>
        </div>
      </div>
    </div>
  </section>

</div>
</body>
</html>`;

  res.type("html").send(html);
});

// Serve Midnight browser SDK bundle (pre-built, avoids CDN bare-specifier errors)
const midnightSdkDir = path.resolve(process.cwd(), "public/js");
if (fs.existsSync(midnightSdkDir)) {
  app.use("/js", express.static(midnightSdkDir));
  const sdkBundle = path.resolve(midnightSdkDir, "midnight-sdk.js");
  if (fs.existsSync(sdkBundle)) {
    console.log("[sdk] Midnight browser SDK bundle ready:", sdkBundle);
  } else {
    console.warn("[sdk] midnight-sdk.js NOT FOUND — run: npm run build:midnight-sdk");
  }
}

// Serve deployment.json and compiled contract artifacts for browser-side 1AM wallet tx
// Resolve from actual runtime root (fixes PKG_ROOT mismatch)
const deploymentJsonPath = path.resolve(process.cwd(), "deployment.json");
if (fs.existsSync(deploymentJsonPath)) {
  app.get("/deployment.json", (_req, res) => res.sendFile(deploymentJsonPath));
}

const compiledContractDir = path.resolve(
  process.cwd(),
  "compact/contracts/airlog/src/managed/airlog/contract"
);

if (fs.existsSync(compiledContractDir)) {
  console.log("[contract] serving compiled contract from:", compiledContractDir);
  app.use("/contract/compiled/airlog", express.static(compiledContractDir));
  const browserBundle = path.resolve(compiledContractDir, "index.browser.js");
  if (fs.existsSync(browserBundle)) {
    console.log("[contract] browser bundle ready:", browserBundle);
  } else {
    console.warn("[contract] browser bundle NOT FOUND — run: npm run build:contract-bundle");
  }
} else {
  console.error("[contract] compiled contract dir NOT FOUND:", compiledContractDir);
}

const keysDir = path.resolve(
  process.cwd(),
  "compact/contracts/airlog/src/managed/airlog/keys"
);

if (fs.existsSync(keysDir)) {
  app.use("/contract/compiled/airlog/keys", express.static(keysDir));
}

const zkirDir = path.resolve(
  process.cwd(),
  "compact/contracts/airlog/src/managed/airlog/zkir"
);

if (fs.existsSync(zkirDir)) {
  app.use("/contract/compiled/airlog/zkir", express.static(zkirDir));
}

app.listen(PORT, "0.0.0.0", () => {
  console.log(`pilotlog-read-api listening on :${PORT}`);
  console.log(`Reading entries from: ${ENTRIES_PATH}`);
  console.log(`Reading profile from: ${PROFILE_PATH}`);
  console.log(`Reading aircraft from: ${AIRCRAFT_PATH}`);
  console.log(`Reading verification from: ${VERIFICATION_PATH}`);
});
