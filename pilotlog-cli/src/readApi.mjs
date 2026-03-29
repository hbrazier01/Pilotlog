
import fs from "node:fs";
import path from "node:path";
import express from "express";
import { createHash, randomBytes } from "node:crypto";
import { buildIntegrityResult } from "../../src/services/build-integrity-result.mjs";
import { simulateAirlogAnchor } from "../../src/services/airlog-contract-local.mjs";
import { buildTrustReport } from "../../src/services/build-trust-report.mjs";

const PORT = Number(process.env.PORT || 8788);
const DATA_DIR = process.env.PILOTLOG_HOME || process.env.PILOTLOG_DIR || "/data";
const ENTRIES_PATH = path.join(DATA_DIR, "entries.json");
const PROFILE_PATH = path.join(DATA_DIR, "profile.json");
const AIRCRAFT_PATH = path.join(DATA_DIR, "aircraft.json");
const VERIFICATION_PATH = path.join(DATA_DIR, "verification.json");
const MAINTENANCE_PATH = path.join(DATA_DIR, "maintenance.json");

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

function readProfile() {
  try {
    const raw = fs.readFileSync(PROFILE_PATH, "utf-8");
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
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
      acc.total += Number(e.total || 0);
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

app.get("/health", (_req, res) => {
  res.status(200).send("OK");
});

app.get("/", (_req, res) => {
  const asOf = new Date().toISOString();

  const entries = sortNewestFirst(readEntries());
  const totals = computeTotals(entries);
  const recent = entries.slice(0, 10);
  const profile = readProfile();
  const verification = readVerification();
  const aircraftRecords = readAircraft();
  const maintenanceRecords = readMaintenance().sort((a, b) => String(b.date).localeCompare(String(a.date)));
  const logHash = verification?.anchorHash || hashLogbook(entries, profile, aircraftRecords);

  const last90 = entries.filter((e) => withinDays(e.date, asOf, 90));
  const land90 = sumLandings(last90);

  const cutoff6mo = monthsAgoIso(asOf, 6);
  const last6mo = entries.filter(
    (e) => String(e.date) >= cutoff6mo && String(e.date) <= asOf
  );
  const ifr = sumIfr(last6mo);

  const ifrCurrent =
    ifr.approaches >= 6 && ifr.holds >= 1 && ifr.intercepts >= 1;

  const ifrApproachesNeeded = Math.max(0, 6 - ifr.approaches);
  const ifrHoldsNeeded = Math.max(0, 1 - ifr.holds);
  const ifrInterceptsNeeded = Math.max(0, 1 - ifr.intercepts);

  let nextApproachExpiry = null;
  if (ifr.approaches > 0) {
    const oldest = last6mo[last6mo.length - 1];
    nextApproachExpiry = addMonths(oldest.date, 6);
  }

  const passengerDayNeeded = Math.max(0, 3 - land90.day);
  const passengerNightNeeded = Math.max(0, 3 - land90.night);

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

  const pilotName = profile?.pilot?.fullName || "Pilot not set";
  const endorsementCount = Array.isArray(profile?.endorsements)
    ? profile.endorsements.length
    : 0;

  const medicalLabel =
    medical.kind === "Medical"
      ? `Class ${medical.class || "?"}`
      : medical.kind === "BasicMed"
        ? "BasicMed"
        : "None";

  const aircraftStats = {};

  for (const e of entries) {
    const ident = e.aircraftIdent || "Unknown";

    if (!aircraftStats[ident]) {
      aircraftStats[ident] = {
        flights: 0,
        hours: 0,
        lastFlight: e.date,
      };
    }

    aircraftStats[ident].flights += 1;
    aircraftStats[ident].hours += Number(e.total || 0);

    if (new Date(e.date) > new Date(aircraftStats[ident].lastFlight)) {
      aircraftStats[ident].lastFlight = e.date;
    }
  }

  const aircraft = Object.entries(aircraftStats)[0] || null;

  const activeAircraftIdent = aircraft?.[0] || null;
  const activeAircraftRecord =
    aircraftRecords.find((a) => a.ident === activeAircraftIdent) || null;

  const annualDue = activeAircraftRecord?.annualDue || null;
  const transponderDue = activeAircraftRecord?.transponderDue || null;
  const pitotStaticDue = activeAircraftRecord?.pitotStaticDue || null;
  const eltBatteryDue = activeAircraftRecord?.eltBatteryDue || null;

  const lastDayLandingDate = latestDate(entries, (e) => e.dayLandings);
  const passengerDayDue = lastDayLandingDate ? addDays(lastDayLandingDate, 90) : null;

  const flightReviewDue = flightReviewDate ? addMonths(flightReviewDate, 24) : null;

  const maintenanceAlerts = [];

  const pushAlert = (label, dueDate) => {
    const d = daysUntil(asOf, dueDate);
    if (d === null) return;
    if (d < 0) {
      maintenanceAlerts.push(`${label} overdue`);
    } else if (d <= 90) {
      maintenanceAlerts.push(`${label} due in ${d} day${d === 1 ? "" : "s"}`);
    }
  };

  pushAlert("Annual", annualDue);
  pushAlert("Transponder", transponderDue);
  pushAlert("Pitot Static", pitotStaticDue);
  pushAlert("ELT Battery", eltBatteryDue);

  let medicalDue = null;
  if (medical.kind === "Medical") {
    medicalDue = medical.expires || null;
  } else if (medical.kind === "BasicMed") {
    medicalDue = medical.basicMed?.onlineCourseDate
      ? addMonths(medical.basicMed.onlineCourseDate, 24)
      : null;
  }

  let qualityScore = 0;

  const strengths = [];
  const gaps = [];

  if (entries.length >= 1) {
    qualityScore += 20;
    strengths.push("Flight records present");
  } else {
    gaps.push("No flight records");
  }

  if ((profile?.endorsements?.length || 0) > 0) {
    qualityScore += 10;
    strengths.push("Endorsements recorded");
  } else {
    gaps.push("No endorsements recorded");
  }

  if (profile?.medical?.kind && profile.medical.kind !== "None") {
    qualityScore += 10;
    strengths.push("Medical recorded");
  } else {
    gaps.push("Medical not recorded");
  }

  if (profile?.proficiency?.flightReviewDate) {
    qualityScore += 10;
    strengths.push("Flight review recorded");
  } else {
    gaps.push("Flight review missing");
  }

  if (activeAircraftRecord) {
    qualityScore += 15;
    strengths.push("Aircraft record present");
  } else {
    gaps.push("Aircraft record missing");
  }

  if (annualDue || transponderDue || pitotStaticDue || eltBatteryDue) {
    qualityScore += 15;
    strengths.push("Maintenance due dates recorded");
  } else {
    gaps.push("Maintenance dates missing");
  }

  if (maintenanceRecords.length > 0) {
    qualityScore += 10;
    strengths.push("Maintenance history recorded");
  } else {
    gaps.push("No maintenance history");
  }

  if (verification?.anchored) {
    qualityScore += 20;
    strengths.push("Record anchored");
  } else if (logHash) {
    qualityScore += 10;
    strengths.push("Record hashed locally");
  } else {
    gaps.push("No integrity hash");
  }     

  // ── Aircraft Record Value Layer ───────────────────────────────────────────────
  const resaleScore = qualityScore; // out of 110
  const resaleReadiness =
    resaleScore >= 85 ? "High" : resaleScore >= 55 ? "Medium" : "Low";

  const resaleExplanation =
    resaleReadiness === "High"
      ? [
          "This aircraft's records are complete and verifiable.",
          "→ Likely to pass pre-buy without delays",
          "→ Reduces buyer uncertainty",
          "→ Supports stronger resale pricing",
        ]
      : resaleReadiness === "Medium"
        ? [
            "This aircraft has solid records with some gaps.",
            "→ May require additional documentation at pre-buy",
            "→ Minor delays possible during buyer review",
            "→ Closing gaps will improve resale pricing",
          ]
        : [
            "This aircraft's records have significant gaps.",
            "→ Pre-buy may surface documentation issues",
            "→ Buyer may request a price discount",
            "→ Strengthening records will improve resale value",
          ];

  const resaleColor =
    resaleReadiness === "High"
      ? "#6ee7b7"
      : resaleReadiness === "Medium"
        ? "#fbbf24"
        : "#f87171";

  const fmt = (n) => Number(n || 0).toFixed(1);
  const landings =
    Number(totals.dayLandings || 0) + Number(totals.nightLandings || 0);
  const inst =
    Number(totals.actualInstrument || 0) +
    Number(totals.simulatedInstrument || 0);

  const badge = (ok) =>
    ok
      ? '<span class="ok">Current</span>'
      : '<span class="warn">Needs attention</span>';

  res.type("html").send(`<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>PilotLog</title>
  <style>
  body { font-family: -apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial,sans-serif; background:#0b0f18; color:#fff; margin:0; }
  .wrap { max-width: 1080px; margin: 0 auto; padding: 32px 20px; }
  .top { display:flex; justify-content:space-between; align-items:flex-end; gap:16px; flex-wrap:wrap; }
  .big { font-size: 56px; font-weight: 800; letter-spacing: -1px; }
  .sub { color:#b6b9c6; margin-top: 6px; }
  .header-left {display:flex; flex-direction: column;gap: 6px; }

  .grid {
    display:grid;
    grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
    gap: 12px;
    margin-top: 18px;
  }

  .card { background:#121624; border:1px solid #222843; border-radius: 14px; padding: 14px; }
  .label { color:#b6b9c6; font-size: 12px; text-transform: uppercase; letter-spacing: .08em; }
  .val { font-size: 22px; font-weight: 700; margin-top: 6px; }
  .small { color:#b6b9c6; font-size: 14px; margin-top: 8px; line-height: 1.5; }

  .table { margin-top: 18px; background:#121624; border:1px solid #222843; border-radius: 14px; overflow:hidden; }
  table { width:100%; border-collapse: collapse; }
  th, td { padding: 10px 12px; border-bottom: 1px solid #1f2440; text-align:left; font-size:14px; }
  th { background:#0f1320; color:#b6b9c6; font-weight:700; }
  tr:last-child td { border-bottom:none; }

  .muted { color:#b6b9c6; }
  .ok { color:#6ee7b7; font-weight:700; }
  .warn { color:#fbbf24; font-weight:700; }
  .bad { color:#f87171; font-weight:700; }

  @media (max-width: 820px) {
    .big { font-size: 42px; }
  }
</style>   
</head>
<body>
  <div class="wrap">
    <div class="top">
      <div>
        <div>
  <div class="big">${fmt(totals.total)} hrs</div>
  <div class="sub">
    ${pilotName} · PIC ${fmt(totals.pic)} · Dual ${fmt(totals.dual)} · XC ${fmt(totals.xc)} · Night ${fmt(totals.night)}
   </div>
  </div>

  <div class="muted">
          PilotLog ·
          <a href="/export/summary/download" style="color:#9aa3ff;text-decoration:none;">
            Download Summary
          </a>
          ·
          <a href="/export/sale-packet" style="color:#9aa3ff;text-decoration:none;">
            Download Sale Packet
          </a>
          ·
          <a href="/export/sale-packet/html" style="color:#9aa3ff;text-decoration:none;">
            View Sale Packet (HTML)
          </a>
          ·
          <a href="/export/trust-report/html" style="color:#9aa3ff;text-decoration:none;">
            View Trust Report
          </a>
          ·
          <a href="/export/trust-report" style="color:#9aa3ff;text-decoration:none;">
            Download Trust Report (JSON)
          </a>
          ·
          <a href="/verify/hash/${logHash}" style="color:#9aa3ff;text-decoration:none;">
            Verify Current Hash
          </a>
        </div>
      </div>
     </div>

    <div class="grid">
      <div class="card">
        <div class="label">Instrument</div>
        <div class="val">${fmt(inst)} hrs</div>
      </div>
      <div class="card">
        <div class="label">Landings</div>
        <div class="val">${landings}</div>
      </div>
      <div class="card">
        <div class="label">Approaches / Holds / Intercepts</div>
        <div class="val">${Number(totals.approaches || 0)} / ${Number(totals.holds || 0)} / ${Number(totals.intercepts || 0)}</div>
      </div>
    </div>

    <div class="grid">
      <div class="card">
        <div class="label">Pilot Profile</div>
        <div class="small">
          Name: <span class="muted">${pilotName}</span><br />
          Medical: <span class="muted">${medicalLabel}</span><br />
          Endorsements: <span class="muted">${endorsementCount}</span><br />
          IPC Date: <span class="muted">${profile?.proficiency?.ipcDate || "Not set"}</span> 
        </div>
      </div>

      <div class="card">
        <div class="label">Currency Status</div>
        <div class="small">
          Passenger Day: ${badge(land90.day >= 3)}<br />
          Passenger Night: ${badge(land90.night >= 3)}<br />
          IFR: ${badge(ifrCurrent)}
        </div>
      </div>

      <div class="card">
        <div class="label">Compliance Status</div>
        <div class="small">
          Medical: ${badge(medicalCurrent)}<br />
          Medical Type: <span class="muted">${medical.kind || "None"}</span><br />
          Flight Review: ${badge(flightReviewCurrent)}<br />
          Flight Review Date: <span class="muted">${flightReviewDate || "Not set"}</span>
        </div>
      </div>

    <div class="card">
      <div class="label">Next Due</div>
      <div class="small">
        Passenger Day:
        <span class="${dueClass(asOf, passengerDayDue)}">${dueLabel(asOf, passengerDayDue)}</span><br />
        Flight Review:
        <span class="${dueClass(asOf, flightReviewDue)}">${dueLabel(asOf, flightReviewDue)}</span><br />
        Medical:
        <span class="${dueClass(asOf, medicalDue)}">${dueLabel(asOf, medicalDue)}</span>
      </div>
    </div>

    <div class="card">
      <div class="label">Aircraft</div>
      <div class="small">
        Ident: <span class="muted">${aircraft?.[0] || "—"}</span><br />
        Flights: <span class="muted">${aircraft?.[1]?.flights || 0}</span><br />
        Hours: <span class="muted">${fmt(aircraft?.[1]?.hours || 0)} hrs</span><br />
        Last Flight: <span class="muted">${formatDateShort(aircraft?.[1]?.lastFlight)}</span>
      </div>
    </div>

    <div class="card">
      <div class="label">Passenger Currency Progress</div>
      <div class="small">
        Day Landings:
        <span class="muted">${land90.day} / 3</span>
        ${passengerDayNeeded > 0 ? `<span class="warn">(${passengerDayNeeded} needed)</span>` : `<span class="ok">✓</span>`}
        <br />

        Night Landings:
        <span class="muted">${land90.night} / 3</span>
        ${passengerNightNeeded > 0 ? `<span class="warn">(${passengerNightNeeded} needed)</span>` : `<span class="ok">✓</span>`}
      </div>
    </div>

    <div class="card">
      <div class="label">IFR Progress</div>
      <div class="small">
        Approaches:
        <span class="muted">${ifr.approaches} / 6</span>
        ${ifrApproachesNeeded > 0 ? `<span class="warn">(${ifrApproachesNeeded} needed)</span>` : `<span class="ok">✓</span>`}
        <br />

        Holds:
        <span class="muted">${ifr.holds} / 1</span>
        ${ifrHoldsNeeded > 0 ? `<span class="warn">(${ifrHoldsNeeded} needed)</span>` : `<span class="ok">✓</span>`}
        <br />

        Intercepts:
        <span class="muted">${ifr.intercepts} / 1</span>
        ${ifrInterceptsNeeded > 0 ? `<span class="warn">(${ifrInterceptsNeeded} needed)</span>` : `<span class="ok">✓</span>`}
      </div>
    </div>

    <div class="card">
      <div class="label">IFR Window</div>
      <div class="small">
        Approaches Logged: <span class="muted">${ifr.approaches}</span><br />
        Holds Logged: <span class="muted">${ifr.holds}</span><br />
        Intercepts Logged: <span class="muted">${ifr.intercepts}</span><br />
        Oldest Expires: <span class="muted">${nextApproachExpiry ? formatDateShort(nextApproachExpiry) : "No approaches logged"}</span>
      </div>
    </div>

  <div class="card">
    <div class="label">Aircraft Maintenance</div>
    <div class="small">
      Annual:
      <span class="${dueClass(asOf, annualDue)}">${dueLabel(asOf, annualDue)}</span><br />

      Transponder:
      <span class="${dueClass(asOf, transponderDue)}">${dueLabel(asOf, transponderDue)}</span><br />

      Pitot Static:
      <span class="${dueClass(asOf, pitotStaticDue)}">${dueLabel(asOf, pitotStaticDue)}</span><br />

      ELT Battery:
      <span class="${dueClass(asOf, eltBatteryDue)}">${dueLabel(asOf, eltBatteryDue)}</span>
    </div>
  </div>

  <div class="card">
    <div class="label">Maintenance Alerts</div>
    <div class="small">
      ${
        maintenanceAlerts.length > 0
          ? maintenanceAlerts.map((a) => `<span class="warn">${a}</span>`).join("<br />")
          : '<span class="ok">No upcoming maintenance alerts</span>'
      }
    </div>
  </div>

  <div class="card">
    <div class="label">Record Integrity</div>
    <div class="small">
      SHA256: <span class="muted">${logHash.slice(0,16)}...</span><br />
      Entries: <span class="muted">${entries.length}</span><br />

      Status:
      ${
        verification?.anchored
          ? '<span class="ok">Anchored</span>'
          : '<span class="warn">Ready to anchor</span>'
      }

      ${verification?.anchorNetwork ? `<br />Network: ${verification.anchorNetwork}` : ""}
      ${verification?.anchorTime ? `<br />Time: ${formatDateShort(verification.anchorTime)}` : ""}
    </div>
  </div>

  <div class="card">
    <div class="label">Record Quality</div>
    <div class="val ${scoreClass(qualityScore)}">${qualityScore} / 110</div>

    <div class="small">
      <div class="muted" style="margin-top:6px;">Strengths</div>
      ${strengths.map((s) => `<div class="ok">✓ ${s}</div>`).join("")}

      ${
        gaps.length
          ? `<div class="muted" style="margin-top:10px;">Gaps</div>
             ${gaps.map((g) => `<div class="warn">⚠ ${g}</div>`).join("")}`
          : ""
      }
    </div>
  </div>
</div>

  <div class="card" style="margin-top:18px; border-color:#2a3060;">
    <div style="display:flex; align-items:center; gap:16px; flex-wrap:wrap;">
      <div>
        <div class="label">Aircraft Record Value</div>
        <div style="display:flex; align-items:baseline; gap:10px; margin-top:6px;">
          <span style="font-size:28px; font-weight:800; color:${resaleColor};">${resaleReadiness}</span>
          <span class="muted" style="font-size:13px;">Resale Readiness</span>
        </div>
      </div>
      <div style="margin-left:auto; text-align:right;">
        <div class="label">Record Quality Score</div>
        <div style="font-size:22px; font-weight:700; margin-top:4px; color:${resaleColor};">${qualityScore} / 110</div>
      </div>
    </div>
    <div class="small" style="margin-top:12px; line-height:1.8; color:#d1d5db;">
      ${resaleExplanation.map((line, i) => i === 0 ? `<span style="color:#fff; font-weight:600;">${line}</span>` : `<span class="muted">${line}</span>`).join("<br />")}
    </div>
  </div>

    <div class="table">
      <table>
        <thead>
          <tr>
            <th>Date</th>
            <th>Aircraft</th>
            <th>Route</th>
            <th>Total</th>
            <th>PIC</th>
            <th class="muted">Remarks</th>
          </tr>
        </thead>
        <tbody>
          ${recent.map(e => `
            <tr>
              <td>${String(e.date || "").slice(0, 10)}</td>
              <td>${e.aircraftIdent || ""} <span class="muted">(${e.aircraftType || ""})</span></td>
              <td>${e.from || ""} → ${e.to || ""}</td>
              <td>${e.total ?? ""}</td>
              <td>${e.pic ?? ""}</td>
              <td class="muted">${(e.remarks || "").replaceAll("<","&lt;").replaceAll(">","&gt;")}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>

    ${maintenanceRecords.length > 0 ? `
    <div class="table" style="margin-top:24px;">
      <div class="label" style="padding:12px 0 8px;">Maintenance History</div>
      <table>
        <thead>
          <tr>
            <th>Date</th>
            <th>Category</th>
            <th>Description</th>
            <th>Performed By</th>
            <th>Airframe Hrs</th>
            <th class="muted">RTS</th>
          </tr>
        </thead>
        <tbody>
          ${maintenanceRecords.map(m => `
            <tr>
              <td>${String(m.date || "").slice(0, 10)}</td>
              <td>${(m.category || "").replace(/-/g, " ")}</td>
              <td>${(m.description || "").replaceAll("<","&lt;").replaceAll(">","&gt;")}</td>
              <td>${(m.performedBy || "").replaceAll("<","&lt;").replaceAll(">","&gt;")}</td>
              <td>${m.totalAirframeHours ?? ""}</td>
              <td>${m.returnToService ? '<span class="ok">Yes</span>' : '<span class="warn">No</span>'}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
    ` : ""}
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

app.post("/verify/anchor", (_req, res) => {
  const entries = readEntries();
  const aircraftList = readAircraft();
  const aircraft = aircraftList[0];

  if (!aircraft) {
    return res.status(400).json({
      message: "No aircraft found to anchor",
    });
  }

  const contractResult = simulateAirlogAnchor({
    aircraft,
    entries,
  });

  const verification = {
    ...contractResult.integrity,
    anchored: contractResult.runtimeAvailable,
    anchorTime: new Date().toISOString(),
    anchorTx: null,
    runtimeAvailable: contractResult.runtimeAvailable,
    contract: contractResult.runtimeAvailable
      ? {
          registerAirframe: !!contractResult.registerResult,
          authorizeIssuer: !!contractResult.authorizeResult,
          addEntry: !!contractResult.addEntryResult,
        }
      : "runtime unavailable",
  };

  fs.writeFileSync(VERIFICATION_PATH, JSON.stringify(verification, null, 2));

  res.json({
    message: contractResult.runtimeAvailable
      ? "Logbook anchored via local AirLog contract execution"
      : "Logbook integrity computed — Midnight runtime unavailable (degraded mode)",
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

  // 3. Components without TSOH/SMOH data
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

  const packet = {
    generated: new Date().toISOString(),
    packetType: "airlog-sale-packet",
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

  // Record quality score
  const qualityFactors = [];
  let qualityScore = 0;
  if (maintenance.length > 0) { qualityScore += 25; qualityFactors.push({ label: "Maintenance records present", points: 25, pass: true }); }
  else { qualityFactors.push({ label: "Maintenance records present", points: 0, pass: false }); }
  if (aircraft.length > 0 && primaryAircraft.annualDue) { qualityScore += 20; qualityFactors.push({ label: "Annual inspection date on file", points: 20, pass: true }); }
  else { qualityFactors.push({ label: "Annual inspection date on file", points: 0, pass: false }); }
  if (entries.length > 0) { qualityScore += 20; qualityFactors.push({ label: "Flight log entries present", points: 20, pass: true }); }
  else { qualityFactors.push({ label: "Flight log entries present", points: 0, pass: false }); }
  if (anchored) { qualityScore += 25; qualityFactors.push({ label: "Records anchored on-chain", points: 25, pass: true }); }
  else { qualityFactors.push({ label: "Records anchored on-chain", points: 0, pass: false }); }
  if (profile?.pilot?.fullName) { qualityScore += 10; qualityFactors.push({ label: "Pilot profile complete", points: 10, pass: true }); }
  else { qualityFactors.push({ label: "Pilot profile complete", points: 0, pass: false }); }

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
      <td>${f.pass ? f.points : 0} / ${f.points > 0 ? f.points : "25"}</td>
    </tr>`
  ).join("\n");

  // AD compliance rows
  const adEntries = maintenance.filter((m) => m.category === "ad-compliance" || (m.adCompliance && m.adCompliance.length > 0));
  const adRows = adEntries.map((m) => {
    const ads = m.adCompliance && m.adCompliance.length > 0
      ? m.adCompliance.map((ad) => `
        <tr>
          <td>${ad.adNumber || "—"}</td>
          <td>${ad.title || m.description || "—"}</td>
          <td>${m.date ? String(m.date).slice(0, 10) : "—"}</td>
          <td>${m.mechanic || m.performedBy || "—"}</td>
          <td>${ad.nextDue ? fmt(ad.nextDue) : "—"}</td>
        </tr>`).join("")
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
  // Find last service date for engine/prop from maintenance
  function lastServiceDate(keyword) {
    const matches = maintenance
      .filter((m) => (m.components || []).some((c) => (c.name || "").toLowerCase().includes(keyword)) ||
        (m.description || "").toLowerCase().includes(keyword))
      .map((m) => m.date ? new Date(String(m.date).slice(0, 10)) : null)
      .filter(Boolean)
      .sort((a, b) => b - a);
    return matches.length > 0 ? matches[0].toISOString().slice(0, 10) : null;
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
  const trustColor = gaps.length === 0 ? "#22c55e" : highGaps > 0 ? "#ef4444" : "#f59e0b";
  const trustLabel = gaps.length === 0 ? "Clean" : highGaps > 0 ? "Issues Found" : "Review Recommended";

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
    </div>
  </div>

  <!-- TRUST SUMMARY + BUYER EVIDENCE INDEX -->
  <div class="grid-2">
    <section>
      <div class="section-title">Trust Summary</div>
      <div class="section-body">
        <div style="display:flex;align-items:center;gap:14px;margin-bottom:16px;">
          <div style="width:14px;height:14px;border-radius:50%;background:${trustColor};flex-shrink:0;"></div>
          <div>
            <div style="font-size:16px;font-weight:700;color:${trustColor};">${trustLabel}</div>
            <div style="font-size:11px;color:#718096;margin-top:2px;">
              ${gaps.length === 0 ? "No record gaps or flags detected" : `${gaps.length} issue${gaps.length > 1 ? "s" : ""} — ${highGaps > 0 ? highGaps + " high" : ""}${highGaps > 0 && medGaps > 0 ? ", " : ""}${medGaps > 0 ? medGaps + " medium" : ""}`}
            </div>
          </div>
        </div>
        <table class="kv-table">
          <tr><td style="color:#718096;">Integrity</td><td>${integrityStatus}</td></tr>
          <tr><td style="color:#718096;">Hash</td><td>${hashMatchBadge}</td></tr>
          <tr><td style="color:#718096;">Quality Score</td><td><strong>${qualityScore}/100</strong></td></tr>
          <tr><td style="color:#718096;">Maintenance Records</td><td>${maintenance.length}</td></tr>
          <tr><td style="color:#718096;">Log Entries</td><td>${entries.length}</td></tr>
        </table>
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
        ? '<div style="padding:20px;color:#a0aec0;text-align:center;">No AD compliance records on file.</div>'
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
        ? '<div style="padding:20px;color:#a0aec0;text-align:center;">No major alterations on file.</div>'
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
          <div style="font-size:11px;color:#718096;margin-top:2px;">Last service: ${lastServiceDate("engine") || "—"}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Propeller</div>
          <div style="font-size:13px;font-weight:600;color:#1a1a2e;margin-top:6px;">${pa.propType || "—"}</div>
          <div style="font-size:11px;color:#718096;margin-top:2px;">S/N: ${pa.propSerial || "—"}</div>
          <div style="font-size:11px;color:#718096;margin-top:2px;">Last service: ${lastServiceDate("prop") || "—"}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Avionics</div>
          ${(pa.avionics || []).length > 0
            ? (pa.avionics || []).map((av) => `<div style="font-size:12px;color:#2d3748;margin-top:4px;">${av}</div>`).join("")
            : '<div style="font-size:12px;color:#a0aec0;margin-top:6px;">Not recorded</div>'}
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
          <div style="font-size:11px;color:#718096;margin-top:8px;font-weight:600;">Current Record Hash</div>
          <div class="hash-display">${currentHash}</div>
          ${anchorHash && anchorHash !== currentHash ? `<div style="font-size:11px;color:#718096;margin-top:8px;font-weight:600;">Anchored Hash</div><div class="hash-display">${anchorHash}</div>` : ""}
        </div>
      </div>
    </section>
    <section>
      <div class="section-title">Record Quality Score</div>
      <div class="section-body">
        <div class="score-display">${qualityScore}<span style="font-size:20px;color:#a0aec0;">/100</span></div>
        <div class="score-label">${qualityScore >= 80 ? "Excellent" : qualityScore >= 60 ? "Good" : qualityScore >= 40 ? "Fair" : "Incomplete"}</div>
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
  Generated ${generatedFormatted}
</div>

</body>
</html>`;

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(html);
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

app.listen(PORT, "0.0.0.0", () => {
  console.log(`pilotlog-read-api listening on :${PORT}`);
  console.log(`Reading entries from: ${ENTRIES_PATH}`);
  console.log(`Reading profile from: ${PROFILE_PATH}`);
  console.log(`Reading aircraft from: ${AIRCRAFT_PATH}`);
  console.log(`Reading verification from: ${VERIFICATION_PATH}`);
});
