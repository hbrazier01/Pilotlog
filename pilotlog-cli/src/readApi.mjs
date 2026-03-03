import fs from "node:fs";
import path from "node:path";
import express from "express";

const PORT = Number(process.env.PORT || 8788);
const DATA_DIR = process.env.PILOTLOG_HOME || process.env.PILOTLOG_DIR || "/data";
const ENTRIES_PATH = path.join(DATA_DIR, "entries.json");

fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(ENTRIES_PATH)) fs.writeFileSync(ENTRIES_PATH, "[]");

function readEntries() {
  try {
    const raw = fs.readFileSync(ENTRIES_PATH, "utf-8");
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

// NOTE: simplified cutoff (we can refine to “6 calendar months” rule later)
function monthsAgoIso(asOfIso, months) {
  const d = new Date(asOfIso);
  const cut = new Date(d);
  cut.setMonth(cut.getMonth() - months);
  return cut.toISOString();
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

const app = express();

app.get("/", (_req, res) => {
  const entries = sortNewestFirst(readEntries());
  const totals = computeTotals(entries);
  const recent = entries.slice(0, 10);

  const fmt = (n) => Number(n || 0).toFixed(1);
  const landings =
    Number(totals.dayLandings || 0) + Number(totals.nightLandings || 0);
  const inst =
    Number(totals.actualInstrument || 0) +
    Number(totals.simulatedInstrument || 0);

  res.type("html").send(`<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>PilotLog</title>
  <style>
    body { font-family: -apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial,sans-serif; background:#0b0d12; color:#fff; margin:0; }
    .wrap { max-width: 980px; margin: 0 auto; padding: 32px 20px; }
    .top { display:flex; justify-content:space-between; align-items:flex-end; gap:16px; flex-wrap:wrap; }
    .big { font-size: 56px; font-weight: 800; letter-spacing: -1px; }
    .sub { color:#b6b9c6; margin-top: 6px; }
    .grid { display:grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-top: 18px; }
    .card { background:#121624; border:1px solid #222843; border-radius: 14px; padding: 14px; }
    .label { color:#b6b9c6; font-size: 12px; text-transform: uppercase; letter-spacing: .08em; }
    .val { font-size: 22px; font-weight: 700; margin-top: 6px; }
    .table { margin-top: 18px; background:#121624; border:1px solid #222843; border-radius: 14px; overflow:hidden; }
    table { width:100%; border-collapse: collapse; }
    th, td { padding: 10px 12px; border-bottom: 1px solid #1f2440; text-align:left; font-size:14px; }
    th { background:#0f1320; color:#b6b9c6; font-weight:700; }
    tr:last-child td { border-bottom:none; }
    .muted { color:#b6b9c6; }
    @media (max-width: 720px) { .grid { grid-template-columns: 1fr; } .big{ font-size:42px; } }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="top">
      <div>
        <div class="big">${fmt(totals.total)} hrs</div>
        <div class="sub">PIC ${fmt(totals.pic)} · Dual ${fmt(totals.dual)} · XC ${fmt(totals.xc)} · Night ${fmt(totals.night)}</div>
      </div>
      <div class="muted">PilotLog</div>
    </div>

    <div class="grid">
      <div class="card"><div class="label">Instrument</div><div class="val">${fmt(inst)} hrs</div></div>
      <div class="card"><div class="label">Landings</div><div class="val">${landings}</div></div>
      <div class="card"><div class="label">Approaches / Holds / Intercepts</div><div class="val">${Number(totals.approaches||0)} / ${Number(totals.holds||0)} / ${Number(totals.intercepts||0)}</div></div>
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
              <td>${String(e.date||"").slice(0,10)}</td>
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

app.get("/totals", (_req, res) => {
  const entries = readEntries();
  res.json({ totals: computeTotals(entries) });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`pilotlog-read-api listening on :${PORT}`);
  console.log(`Reading entries from: ${ENTRIES_PATH}`);
});
