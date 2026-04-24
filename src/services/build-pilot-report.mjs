/**
 * build-pilot-report.mjs
 * Builds a pilot-centric report from logbook data.
 *
 * This is a separate flow from the aircraft report (build-trust-report.mjs).
 * Aircraft report is preserved for future AirLog development.
 * This report is the primary product for the current pilot-centric UX.
 */

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(dateStr) {
  if (!dateStr) return null;
  const d = new Date(String(dateStr).slice(0, 10));
  if (isNaN(d)) return null;
  return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

function daysUntil(dateStr, asOf) {
  if (!dateStr) return null;
  const due = new Date(String(dateStr).slice(0, 10));
  const base = asOf ? new Date(asOf) : new Date();
  if (isNaN(due) || isNaN(base)) return null;
  return Math.round((due - base) / 86400000);
}

function certStatus(days) {
  if (days === null) return { label: "Unknown", color: "gray" };
  if (days < 0) return { label: "Expired", color: "red" };
  if (days <= 30) return { label: "Expiring Soon", color: "red" };
  if (days <= 90) return { label: "Upcoming", color: "yellow" };
  return { label: "Current", color: "green" };
}

// ─── Sections ─────────────────────────────────────────────────────────────────

function buildPilotIdentity(profile) {
  const pilot = profile?.pilot || {};
  const certs = profile?.certificates || {};
  const ratings = profile?.ratings || [];

  const certList = [];
  if (certs.studentPilot) certList.push("Student Pilot");
  if (certs.privatePilot) certList.push("Private Pilot (PPL)");
  if (certs.instrumentRating) certList.push("Instrument Rating");
  if (certs.commercialPilot) certList.push("Commercial Pilot");
  if (certs.cfi) certList.push("CFI");
  if (ratings.length > 0) certList.push(...ratings);

  return {
    name: pilot.fullName || null,
    email: pilot.email || null,
    phone: pilot.phone || null,
    certificates: certList,
    pilotPhase: profile?.pilotPhase || null,
  };
}

function buildCertificateSnapshot(profile, asOf) {
  const medical = profile?.medical || { kind: "None" };
  const proficiency = profile?.proficiency || {};

  // Medical
  let medStatus = null;
  let medExpiry = null;
  let medDays = null;
  if (medical.kind === "Medical" && medical.expires) {
    medExpiry = medical.expires;
    medDays = daysUntil(medical.expires, asOf);
    medStatus = certStatus(medDays);
  } else if (medical.kind === "BasicMed") {
    medStatus = { label: "BasicMed", color: "green" };
  } else {
    medStatus = { label: "None on file", color: "gray" };
  }

  // Flight Review
  let frExpiry = null;
  let frDays = null;
  let frStatus = null;
  if (proficiency.flightReviewDate) {
    const d = new Date(proficiency.flightReviewDate);
    d.setMonth(d.getMonth() + 24);
    frExpiry = d.toISOString();
    frDays = daysUntil(frExpiry, asOf);
    frStatus = certStatus(frDays);
  } else {
    frStatus = { label: "None on file", color: "gray" };
  }

  // IPC
  let ipcStatus = null;
  if (proficiency.ipcDate) {
    const d = new Date(proficiency.ipcDate);
    d.setMonth(d.getMonth() + 6);
    const ipcDays = daysUntil(d.toISOString(), asOf);
    ipcStatus = certStatus(ipcDays);
    ipcStatus.date = fmt(proficiency.ipcDate);
  }

  return {
    medical: {
      kind: medical.kind,
      class: medical.class || null,
      issued: fmt(medical.issued),
      expires: fmt(medical.expires),
      daysLeft: medDays,
      status: medStatus,
      basicMed: medical.kind === "BasicMed" ? medical.basicMed : null,
    },
    flightReview: {
      lastDate: fmt(proficiency.flightReviewDate),
      expiryDate: fmt(frExpiry),
      daysLeft: frDays,
      status: frStatus,
      complianceWarning: frDays !== null && frDays < 0
        ? "Flight review expired — pilot not current for PIC (FAR 61.56)"
        : frDays !== null && frDays <= 30
        ? "Flight review expiring within 30 days"
        : null,
    },
    ipc: ipcStatus
      ? { lastDate: fmt(proficiency.ipcDate), status: ipcStatus }
      : { lastDate: null, status: { label: "Not on file", color: "gray" } },
    endorsements: (profile?.endorsements || []).map((e) => ({
      date: fmt(e.date),
      text: e.text || null,
      signedBy: e.signedBy || null,
    })),
  };
}

function buildCurrencySummary(entries, asOf) {
  const baseMs = asOf ? new Date(asOf).getTime() : Date.now();
  const cutoff90 = baseMs - 90 * 86400000;

  const last90 = entries.filter((e) => new Date(e.date).getTime() >= cutoff90);
  const dayLandings90 = last90.reduce((s, e) => s + Number(e.dayLandings || 0), 0);
  const nightLandings90 = last90.reduce((s, e) => s + Number(e.nightLandings || 0), 0);

  // IFR — last 6 months
  const cutoff6mo = new Date(asOf || new Date());
  cutoff6mo.setMonth(cutoff6mo.getMonth() - 6);
  const last6mo = entries.filter((e) => new Date(e.date) >= cutoff6mo);
  const approaches6 = last6mo.reduce((s, e) => s + Number(e.approaches || 0), 0);
  const holds6 = last6mo.reduce((s, e) => s + Number(e.holds || 0), 0);

  function landingStatus(count, needed) {
    if (count >= needed) return { label: "Current", color: "green" };
    return { label: `${count}/${needed}`, color: count > 0 ? "yellow" : "red" };
  }

  return {
    passengerDay: {
      label: "Day Passenger Currency",
      count: dayLandings90,
      required: 3,
      window: "90 days",
      status: landingStatus(dayLandings90, 3),
    },
    passengerNight: {
      label: "Night Passenger Currency",
      count: nightLandings90,
      required: 3,
      window: "90 days",
      status: landingStatus(nightLandings90, 3),
    },
    ifr: {
      label: "IFR Currency",
      approaches: approaches6,
      holds: holds6,
      window: "6 months",
      status: approaches6 >= 6 && holds6 >= 1
        ? { label: "Current", color: "green" }
        : { label: approaches6 > 0 ? `${approaches6}/6 approaches` : "Not current", color: approaches6 >= 3 ? "yellow" : "red" },
    },
  };
}

function buildFlightActivitySummary(entries) {
  if (!entries.length) {
    return { totalEntries: 0, totalHours: 0, recentFlights: [] };
  }

  const totalHours = entries.reduce((s, e) => s + Number(e.totalTime || e.total || 0), 0);
  const picHours = entries.reduce((s, e) => s + Number(e.pic || 0), 0);
  const dualReceivedHours = entries.reduce((s, e) => s + Number(e.dualReceived || 0), 0);
  const crossCountryHours = entries.reduce((s, e) => s + Number(e.crossCountry || 0), 0);
  const nightHours = entries.reduce((s, e) => s + Number(e.night || 0), 0);
  const ifrHours =
    entries.reduce((s, e) => s + Number(e.actualInstrument || 0), 0) +
    entries.reduce((s, e) => s + Number(e.simulatedInstrument || 0), 0);

  const sorted = [...entries].sort((a, b) => String(b.date).localeCompare(String(a.date)));
  const recentFlights = sorted.slice(0, 5).map((e) => ({
    date: fmt(e.date),
    route: e.route || (e.from && e.to ? `${e.from} → ${e.to}` : null),
    aircraft: e.aircraft || e.aircraftId || null,
    hours: Number(e.totalTime || e.total || 0).toFixed(1),
    remarks: e.remarks || null,
    anchor: e.anchor || null,
  }));

  // Hours in the last 90 days
  const cutoff90 = Date.now() - 90 * 86400000;
  const last90Hours = entries
    .filter((e) => new Date(e.date).getTime() >= cutoff90)
    .reduce((s, e) => s + Number(e.totalTime || e.total || 0), 0);

  return {
    totalEntries: entries.length,
    totalHours: totalHours.toFixed(1),
    picHours: picHours.toFixed(1),
    dualReceivedHours: dualReceivedHours.toFixed(1),
    crossCountryHours: crossCountryHours.toFixed(1),
    nightHours: nightHours.toFixed(1),
    ifrHours: ifrHours.toFixed(1),
    last90Hours: last90Hours.toFixed(1),
    recentFlights,
  };
}

function buildIntegrityStatus(verification) {
  const anchored = verification?.anchored || false;
  const anchorHash = verification?.anchorHash || null;
  const anchorTime = verification?.anchorTime || null;
  const anchorNetwork = verification?.anchorNetwork || null;
  const anchorTx = verification?.anchorTx || null;

  return {
    anchored,
    anchorHash: anchorHash ? anchorHash.slice(0, 16) + "…" : null,
    anchorTime: fmt(anchorTime),
    anchorNetwork,
    anchorTx,
    status: anchored
      ? { label: "Anchored", color: "green" }
      : { label: "Not anchored", color: "gray" },
  };
}

// ─── Main Export ──────────────────────────────────────────────────────────────

export function buildPilotReport({ profile, entries, aircraft, maintenance, verification }) {
  const asOf = new Date().toISOString();

  return {
    generated: asOf,
    reportType: "airlog-pilot-report",
    pilotIdentity: buildPilotIdentity(profile),
    certificateSnapshot: buildCertificateSnapshot(profile, asOf),
    currencySummary: buildCurrencySummary(entries, asOf),
    flightActivity: buildFlightActivitySummary(entries),
    integrityStatus: buildIntegrityStatus(verification),
  };
}
