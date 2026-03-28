
import fs from "node:fs";
import path from "node:path";
import express from "express";
import { createHash, randomBytes } from "node:crypto";
import { buildIntegrityResult } from "../../src/services/build-integrity-result.mjs";
import { simulateAirlogAnchor } from "../../src/services/airlog-contract-local.mjs";

const PORT = Number(process.env.PORT || 8788);
const DATA_DIR = process.env.PILOTLOG_HOME || process.env.PILOTLOG_DIR || "/data";
const ENTRIES_PATH = path.join(DATA_DIR, "entries.json");
const PROFILE_PATH = path.join(DATA_DIR, "profile.json");
const AIRCRAFT_PATH = path.join(DATA_DIR, "aircraft.json");
const VERIFICATION_PATH = path.join(DATA_DIR, "verification.json");

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

app.get("/", (_req, res) => {
  const asOf = new Date().toISOString();

  const entries = sortNewestFirst(readEntries());
  const totals = computeTotals(entries);
  const recent = entries.slice(0, 10);
  const profile = readProfile();
  const verification = readVerification();
  const aircraftRecords = readAircraft();
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

  if (verification?.anchored) {
    qualityScore += 20;
    strengths.push("Record anchored");
  } else if (logHash) {
    qualityScore += 10;
    strengths.push("Record hashed locally");
  } else {
    gaps.push("No integrity hash");
  }     

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
    <div class="val ${scoreClass(qualityScore)}">${qualityScore} / 100</div>

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
  </div>
</body>
</html>`);
});

app.get("/health", (_req, res) => {
  res.json({ ok: true });
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
    anchored: true,
    anchorTime: new Date().toISOString(),
    anchorTx: null,
    contract: {
      registerAirframe: !!contractResult.registerResult,
      authorizeIssuer: !!contractResult.authorizeResult,
      addEntry: !!contractResult.addEntryResult,
    },
  };

  fs.writeFileSync(VERIFICATION_PATH, JSON.stringify(verification, null, 2));

  res.json({
    message: "Logbook anchored via local AirLog contract execution",
    verification,
  });
});  

app.get("/export/sale-packet", (_req, res) => {
  const entries = readEntries();
  const profile = readProfile();
  const aircraft = readAircraft();
  const verification = readVerification();

  const hash = hashLogbook(entries, profile, aircraft);

  const aircraftSummary = aircraft.map((a) => ({
    ident: a.ident,
    type: a.type,
    annualDue: a.annualDue || null,
    transponderDue: a.transponderDue || null,
    pitotStaticDue: a.pitotStaticDue || null,
    eltBatteryDue: a.eltBatteryDue || null,
    notes: a.notes || ""
  }));

  const totals = computeTotals(entries);

  const packet = {
    generated: new Date().toISOString(),
    packetType: "airlog-sale-packet",
    verification: {
      anchored: verification?.anchored || false,
      anchorHash: verification?.anchorHash || null,
      anchorTime: verification?.anchorTime || null,
      anchorNetwork: verification?.anchorNetwork || null,
      anchorTx: verification?.anchorTx || null,
      currentHash: hash
    },
    aircraftSummary,
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

app.get("/export/sale-packet/html", (_req, res) => {
  const entries = sortNewestFirst(readEntries());
  const profile = readProfile();
  const aircraft = readAircraft();
  const verification = readVerification();

  const totals = computeTotals(entries);
  const hash = hashLogbook(entries, profile, aircraft);

  const aircraftRecord = aircraft[0] || null;

  const qualityScore = Math.min(100, Math.round(
    (entries.length > 0 ? 20 : 0) +
    (profile?.endorsements?.length ? 10 : 0) +
    (profile?.medical?.kind !== "None" ? 10 : 0) +
    (profile?.proficiency?.flightReviewDate ? 10 : 0) +
    (aircraftRecord ? 15 : 0) +
    (verification?.anchored ? 20 : 10)
  ));

  const scoreColor =
    qualityScore >= 85 ? "#6ee7b7" :
    qualityScore >= 60 ? "#fbbf24" :
    "#f87171";

  res.type("html").send(`<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>AirLog Sale Packet</title>
<style>
body { font-family: -apple-system, sans-serif; background:#0b0e1a; color:#e8ecf1; padding:40px; }
.wrap { max-width:900px; margin:auto; }

.section { margin-bottom:30px; padding:20px; border:1px solid #1f2440; border-radius:12px; background:#121624; }
.title { font-size:22px; font-weight:700; margin-bottom:10px; }

.ok { color:#6ee7b7; }
.warn { color:#fbbf24; }
.bad { color:#f87171; }
.muted { color:#9aa3b2; }

.big { font-size:32px; font-weight:800; }

table { width:100%; border-collapse:collapse; margin-top:10px; }
td { padding:6px 0; border-bottom:1px solid #1f2440; }

</style>
</head>
<body>
<div class="wrap">

<div class="section">
  <div class="title">Trust Summary</div>
  <div class="big" style="color:${scoreColor}">
    ${qualityScore} / 100
  </div>
  <div class="muted">
    ${verification?.anchored ? "Anchored on Midnight" : "Not anchored"}
  </div>
  <div class="muted">Hash: ${hash.slice(0,16)}...</div>
</div>

<div class="section">
  <div class="title">Aircraft Snapshot</div>
  ${
    aircraftRecord
      ? `
      <div><b>${aircraftRecord.ident}</b> · ${aircraftRecord.type || ""}</div>
      <div class="muted">Annual: ${aircraftRecord.annualDue || "Not set"}</div>
      <div class="muted">Transponder: ${aircraftRecord.transponderDue || "Not set"}</div>
      `
      : `<div class="warn">No aircraft record</div>`
  }
</div>

<div class="section">
  <div class="title">Logbook Summary</div>
  <table>
    <tr><td>Total Hours</td><td>${totals.total.toFixed(1)}</td></tr>
    <tr><td>PIC</td><td>${totals.pic.toFixed(1)}</td></tr>
    <tr><td>Landings</td><td>${(totals.dayLandings + totals.nightLandings)}</td></tr>
    <tr><td>Entries</td><td>${entries.length}</td></tr>
  </table>
</div>

<div class="section">
  <div class="title">Component Snapshot</div>
  <div class="muted">Engine / Prop tracking coming next</div>
</div>

<div class="section">
  <div class="title">AD Compliance</div>
  <div class="warn">No AD records found</div>
</div>

<div class="section">
  <div class="title">Form 337 / Alterations</div>
  <div class="warn">No 337 records found</div>
</div>

<div class="section">
  <div class="title">Buyer Evidence Index</div>
  <table>
    <tr><td>Flight Logs</td><td>${entries.length}</td></tr>
    <tr><td>Aircraft Records</td><td>${aircraft.length}</td></tr>
    <tr><td>Endorsements</td><td>${profile?.endorsements?.length || 0}</td></tr>
    <tr><td>Anchored</td><td>${verification?.anchored ? "Yes" : "No"}</td></tr>
  </table>
</div>

</div>
</body>
</html>`);
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`pilotlog-read-api listening on :${PORT}`);
  console.log(`Reading entries from: ${ENTRIES_PATH}`);
  console.log(`Reading profile from: ${PROFILE_PATH}`);
  console.log(`Reading aircraft from: ${AIRCRAFT_PATH}`);
  console.log(`Reading verification from: ${VERIFICATION_PATH}`);
});
