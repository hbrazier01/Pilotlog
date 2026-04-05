/**
 * Readiness Engine
 *
 * Pure computation module — no I/O, no HTTP, no side effects.
 * Accepts raw data (entries, profile, aircraft, maintenance) and returns
 * structured domain objects for the readiness assistant.
 *
 * Entry point: computeReadiness(profile, entries, aircraft, maintenance, asOf)
 */

// ─── Pilot Phase Config ───────────────────────────────────────────────────────

export const PILOT_PHASES = {
  student_ppl:         { label: "Student Pilot",      domains: ["trainingProgress", "requiredHours", "soloReadiness", "instructorRequiredItems"] },
  ppl_complete:        { label: "Private Pilot",       domains: ["passengerCurrency", "nightCurrency", "pilotReadiness", "aircraftReadiness"] },
  instrument_training: { label: "Instrument Training", domains: ["pilotReadiness", "ifrProgress", "aircraftReadiness"] },
  instrument_rated:    { label: "Instrument Rated",    domains: ["ifrCurrency", "ifrProficiency", "passengerCurrency", "pilotReadiness", "aircraftReadiness"] },
  commercial:          { label: "Commercial Pilot",    domains: ["passengerCurrency", "nightCurrency", "ifrCurrency", "pilotReadiness", "aircraftReadiness"] },
  cfi:                 { label: "CFI / Working Pilot", domains: ["passengerCurrency", "nightCurrency", "ifrCurrency", "pilotReadiness", "aircraftReadiness"] },
};

// ─── Date Helpers ─────────────────────────────────────────────────────────────

function formatDateShort(dateIso) {
  if (!dateIso) return "Not set";
  const d = new Date(dateIso);
  if (Number.isNaN(d.getTime())) return "Not set";
  return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

function isFuture(asOfIso, dateIso) {
  if (!dateIso) return false;
  return new Date(dateIso).getTime() >= new Date(asOfIso).getTime();
}

function daysUntil(asOfIso, dateIso) {
  if (!dateIso) return null;
  const asOf = new Date(asOfIso).getTime();
  const due = new Date(dateIso).getTime();
  if (Number.isNaN(asOf) || Number.isNaN(due)) return null;
  return Math.ceil((due - asOf) / (24 * 60 * 60 * 1000));
}

// ─── Domain Compute Functions ─────────────────────────────────────────────────

export function computePassengerCurrencyDomain(entries, asOf) {
  const cutoffMs = new Date(asOf).getTime() - 90 * 24 * 60 * 60 * 1000;
  const last90 = entries.filter(e => new Date(e.date).getTime() >= cutoffMs);
  const dayCount = last90.reduce((s, e) => s + Number(e.dayLandings || 0), 0);
  const needed = Math.max(0, 3 - dayCount);

  const dayLandingTimes = [];
  for (const e of last90) {
    const n = Number(e.dayLandings || 0);
    for (let i = 0; i < n; i++) dayLandingTimes.push(new Date(e.date).getTime());
  }
  dayLandingTimes.sort((a, b) => a - b);
  let daysLeft = null;
  let expiryDate = null;
  if (dayLandingTimes.length >= 3) {
    const oldest3 = dayLandingTimes[dayLandingTimes.length - 3];
    const expiry = oldest3 + 90 * 86400000;
    daysLeft = Math.ceil((expiry - new Date(asOf).getTime()) / 86400000);
    expiryDate = formatDateShort(new Date(expiry).toISOString());
  }

  if (dayCount >= 3 && daysLeft > 14) {
    return { status: "current", problem: null, nextAction: null, flightPlan: null, effort: null, priority: null };
  }
  if (dayCount >= 3 && daysLeft <= 14) {
    const n = needed === 0 ? 3 : needed;
    return {
      status: "needs_attention",
      problem: `Passenger currency expires in ${daysLeft} day${daysLeft === 1 ? '' : 's'} (${expiryDate}).`,
      nextAction: `Fly ${n} touch-and-go landings before ${expiryDate}.`,
      flightPlan: "1 local flight at your home airport.",
      effort: "~0.5 hours",
      priority: "important",
      title: `Log ${n} touch-and-go landing${n === 1 ? '' : 's'} this week`,
      why: `Passenger currency expires in ${daysLeft} day${daysLeft === 1 ? '' : 's'} — act before ${expiryDate}.`,
      outcome: `+${n} landing${n === 1 ? '' : 's'} → passenger currency stays active`,
      ctaType: "log",
      ctaLabel: "Log Flight →"
    };
  }
  return {
    status: "not_current",
    problem: "You do not have enough recent landings to carry passengers.",
    nextAction: `Fly ${needed} touch-and-go landing${needed === 1 ? '' : 's'}.`,
    flightPlan: "1 local flight at your home airport.",
    effort: "~0.5 hours",
    priority: "critical",
    title: `Fly ${needed} touch-and-go landing${needed === 1 ? '' : 's'} to restore currency`,
    why: "You need recent landings to carry passengers — currency lapsed.",
    outcome: `Complete ${needed} landing${needed === 1 ? '' : 's'} → passengers allowed again`,
    ctaType: "log",
    ctaLabel: "Log Flight →"
  };
}

export function computeNightCurrencyDomain(entries, asOf) {
  const cutoffMs = new Date(asOf).getTime() - 90 * 24 * 60 * 60 * 1000;
  const last90 = entries.filter(e => new Date(e.date).getTime() >= cutoffMs);
  const nightCount = last90.reduce((s, e) => s + Number(e.nightLandings || 0), 0);
  const needed = Math.max(0, 3 - nightCount);

  const nightLandingTimes = [];
  for (const e of last90) {
    const n = Number(e.nightLandings || 0);
    for (let i = 0; i < n; i++) nightLandingTimes.push(new Date(e.date).getTime());
  }
  nightLandingTimes.sort((a, b) => a - b);
  let daysLeft = null;
  let expiryDate = null;
  if (nightLandingTimes.length >= 3) {
    const oldest3 = nightLandingTimes[nightLandingTimes.length - 3];
    const expiry = oldest3 + 90 * 86400000;
    daysLeft = Math.ceil((expiry - new Date(asOf).getTime()) / 86400000);
    expiryDate = formatDateShort(new Date(expiry).toISOString());
  }

  if (nightCount >= 3 && daysLeft > 14) {
    return { status: "current", problem: null, nextAction: null, flightPlan: null, effort: null, priority: null };
  }
  if (nightCount >= 3 && daysLeft <= 14) {
    return {
      status: "needs_attention",
      problem: `Night passenger currency expires in ${daysLeft} day${daysLeft === 1 ? '' : 's'} (${expiryDate}).`,
      nextAction: `Fly 3 full-stop night landings before ${expiryDate}.`,
      flightPlan: "1 local night flight at your home airport.",
      effort: "~0.5–1.0 hours",
      priority: "important",
      title: "Log 3 night landings before currency lapses",
      why: `Night passenger currency expires in ${daysLeft} day${daysLeft === 1 ? '' : 's'} (${expiryDate}).`,
      outcome: "+3 night landings → night passenger currency restored",
      ctaType: "plan",
      ctaLabel: "Plan Night Flight →"
    };
  }
  return {
    status: "not_current",
    problem: "You do not have enough recent night landings to carry passengers at night.",
    nextAction: `Fly ${needed} full-stop night landing${needed === 1 ? '' : 's'} in the pattern.`,
    flightPlan: "1 local night flight at your home airport.",
    effort: "~0.5–1.0 hours",
    priority: "critical",
    title: `Fly ${needed} night landing${needed === 1 ? '' : 's'} to restore night currency`,
    why: "Night passenger currency lapsed — you cannot carry passengers after dark.",
    outcome: `Complete ${needed} night landing${needed === 1 ? '' : 's'} → night passenger privileges restored`,
    ctaType: "plan",
    ctaLabel: "Plan Night Flight →"
  };
}

export function computeIfrCurrencyDomain(entries, asOf) {
  const asOfDate = new Date(asOf);
  const cutoff6mo = new Date(asOf);
  cutoff6mo.setMonth(cutoff6mo.getMonth() - 6);
  const cutoff12mo = new Date(asOf);
  cutoff12mo.setMonth(cutoff12mo.getMonth() - 12);

  const last6mo = entries.filter(e => { const d = new Date(e.date); return d >= cutoff6mo && d <= asOfDate; });
  const last12mo = entries.filter(e => { const d = new Date(e.date); return d >= cutoff12mo && d <= asOfDate; });

  const approaches6 = last6mo.reduce((s, e) => s + Number(e.approaches || 0), 0);
  const holds6 = last6mo.reduce((s, e) => s + Number(e.holds || 0), 0);
  const intercepts6 = last6mo.reduce((s, e) => s + Number(e.intercepts || 0), 0);
  const current = approaches6 >= 6 && holds6 >= 1 && intercepts6 >= 1;

  if (current) {
    return { status: "current", problem: null, nextAction: null, flightPlan: null, effort: null, priority: null };
  }

  const approaches12 = last12mo.reduce((s, e) => s + Number(e.approaches || 0), 0);
  const holds12 = last12mo.reduce((s, e) => s + Number(e.holds || 0), 0);
  const intercepts12 = last12mo.reduce((s, e) => s + Number(e.intercepts || 0), 0);
  const wasCurrent = approaches12 >= 6 && holds12 >= 1 && intercepts12 >= 1;

  const graceEndDate = new Date(asOf);
  graceEndDate.setMonth(graceEndDate.getMonth() + 6);

  const missing = [];
  if (approaches6 < 6) missing.push(`${6 - approaches6} more approach${6 - approaches6 === 1 ? '' : 'es'}`);
  if (holds6 < 1) missing.push("1 hold");
  if (intercepts6 < 1) missing.push("1 intercept");

  if (wasCurrent) {
    const graceStr = formatDateShort(graceEndDate.toISOString());
    return {
      status: "not_current",
      problem: `Instrument currency expired. Grace period ends ${graceStr}.`,
      nextAction: `Log 6 approaches + hold + intercept before ${graceStr}, or schedule an IPC.`,
      flightPlan: "1–2 IFR training flights with approaches.",
      effort: "2–3 hours",
      priority: "critical",
      title: "Log 2 approaches this week",
      why: `IFR currency lapsed — grace period ends ${graceStr}. Delaying leads to a full IPC.`,
      outcome: "Stay IFR-ready and avoid a $300–500 checkride",
      ctaType: "plan",
      ctaLabel: "Plan IFR Session →"
    };
  }

  if (approaches6 === 0 && holds6 === 0 && intercepts6 === 0) {
    return {
      status: "not_current",
      problem: "Instrument currency expired and grace period lapsed. An IPC is required.",
      nextAction: "Schedule an Instrument Proficiency Check with a CFII.",
      flightPlan: "1 flight with CFII (~2 hours).",
      effort: "~2 hours + ~$300–500",
      priority: "critical",
      title: "Book an IPC with a CFII",
      why: "IFR grace period expired — an IPC is required before flying IFR again.",
      outcome: "Complete IPC → full IFR privileges restored",
      ctaType: "schedule",
      ctaLabel: "Schedule Appointment →"
    };
  }

  return {
    status: "needs_attention",
    problem: `Instrument currency expires soon. Still need: ${missing.join(', ')}.`,
    nextAction: `Log ${missing.join(', ')} before the 6-month window closes.`,
    flightPlan: "1 IFR training flight with approaches.",
    effort: "1–2 hours",
    priority: "important",
    title: `Log ${missing[0]} this week`,
    why: `IFR currency at risk — still need ${missing.join(', ')} before the window closes.`,
    outcome: "Complete requirements → IFR currency maintained",
    ctaType: "plan",
    ctaLabel: "Plan IFR Session →"
  };
}

export function computePilotReadinessDomain(profile, asOf) {
  const flightReviewDate = profile?.proficiency?.flightReviewDate ?? null;
  const medical = profile?.medical ?? { kind: "None" };

  const frExpiry = flightReviewDate ? (() => {
    const d = new Date(flightReviewDate);
    d.setMonth(d.getMonth() + 24);
    return d.toISOString();
  })() : null;
  const frCurrent = frExpiry ? isFuture(asOf, frExpiry) : false;
  const frDaysLeft = frExpiry ? daysUntil(asOf, frExpiry) : null;

  let medCurrent = false;
  let medExpiry = null;
  let medDaysLeft = null;
  if (medical.kind === "Medical" && medical.expires) {
    medCurrent = isFuture(asOf, medical.expires);
    medExpiry = medical.expires;
    medDaysLeft = daysUntil(asOf, medical.expires);
  } else if (medical.kind === "BasicMed") {
    medCurrent = !!medical?.basicMed?.cmecDate && !!medical?.basicMed?.onlineCourseDate;
  }

  const pilotCurrent = frCurrent && medCurrent;

  if (pilotCurrent) {
    const frExpiring = frDaysLeft !== null && frDaysLeft <= 60;
    const medExpiring = medDaysLeft !== null && medDaysLeft <= 60;
    if (frExpiring) {
      return {
        status: "needs_attention",
        problem: `Flight review expires in ${frDaysLeft} day${frDaysLeft === 1 ? '' : 's'} (${formatDateShort(frExpiry)}).`,
        nextAction: "Schedule a flight review with a CFI.",
        flightPlan: "1 flight with CFI (~1 hour ground + 1 hour flight).",
        effort: "~2 hours + ~$200–400",
        priority: "important",
        title: "Book a flight review with a CFI",
        why: `Flight review expires in ${frDaysLeft} day${frDaysLeft === 1 ? '' : 's'} — after that you cannot act as PIC.`,
        outcome: "Complete review → PIC privileges extended 2 years",
        ctaType: "schedule",
        ctaLabel: "Schedule Appointment →"
      };
    }
    if (medExpiring) {
      return {
        status: "needs_attention",
        problem: `Medical certificate expires in ${medDaysLeft} day${medDaysLeft === 1 ? '' : 's'} (${formatDateShort(medExpiry)}).`,
        nextAction: "Schedule an AME appointment.",
        flightPlan: "No flight required.",
        effort: "1 call",
        priority: "important",
        title: "Schedule your AME appointment",
        why: `Medical expires in ${medDaysLeft} day${medDaysLeft === 1 ? '' : 's'} — lapse grounds you immediately.`,
        outcome: "Renew medical → stay current and legal to fly",
        ctaType: "schedule",
        ctaLabel: "Schedule Appointment →"
      };
    }
    return { status: "current", problem: null, nextAction: null, flightPlan: null, effort: null, priority: null };
  }

  if (!frCurrent && !medCurrent) {
    return {
      status: "not_current",
      problem: `${flightReviewDate ? `Flight review expired ${formatDateShort(frExpiry)}.` : "No flight review on file."} Medical also not current.`,
      nextAction: "Schedule flight review with CFI and an AME appointment.",
      flightPlan: "1 flight with CFI after medical is obtained.",
      effort: "~2 hours + ~$200–400",
      priority: "critical",
      title: "Restore PIC privileges — two items at risk",
      why: "Flight review and medical are both lapsed. You cannot act as PIC.",
      outcome: "Resolve both → fully legal to fly as PIC again",
      ctaType: "schedule",
      ctaLabel: "Schedule Appointment →"
    };
  }
  if (!frCurrent) {
    return {
      status: "not_current",
      problem: flightReviewDate ? `Flight review expired ${formatDateShort(frExpiry)}. You cannot act as PIC.` : "No flight review on file. You cannot act as PIC.",
      nextAction: "Schedule a flight review with a CFI immediately.",
      flightPlan: "1 flight with CFI.",
      effort: "~2 hours + ~$200–400",
      priority: "critical",
      title: "Schedule a flight review with a CFI",
      why: flightReviewDate ? `Flight review expired ${formatDateShort(frExpiry)} — you cannot act as PIC.` : "No flight review on file — you cannot act as PIC.",
      outcome: "Complete flight review → PIC privileges restored for 2 years",
      ctaType: "schedule",
      ctaLabel: "Schedule Appointment →"
    };
  }
  return {
    status: "not_current",
    problem: `Medical expired ${formatDateShort(medExpiry)}. You cannot act as PIC.`,
    nextAction: "Schedule an AME appointment immediately.",
    flightPlan: "No flight required.",
    effort: "1 appointment",
    priority: "critical",
    title: "Schedule your AME appointment",
    why: `Medical expired ${formatDateShort(medExpiry)} — you cannot act as PIC until renewed.`,
    outcome: "Renew medical → fully legal to fly as PIC again",
    ctaType: "schedule",
    ctaLabel: "Schedule Appointment →"
  };
}

export function computeAircraftReadinessDomain(aircraft, maintenance, asOf) {
  const ac = Array.isArray(aircraft) ? aircraft[0] : null;
  if (!ac) {
    return {
      status: "not_current",
      problem: "No aircraft record found.",
      nextAction: "Add an aircraft to enable readiness checks.",
      flightPlan: "No flight required.",
      effort: "1 data entry",
      priority: "critical",
      title: "Add your aircraft to complete readiness checks",
      why: "No aircraft on record — airworthiness cannot be verified without it.",
      outcome: "Aircraft added → full readiness checks enabled",
      ctaType: "record",
      ctaLabel: "View Aircraft Record →"
    };
  }

  const checks = [
    { label: "Annual inspection", due: ac.annualDue },
    { label: "Transponder check", due: ac.transponderDue },
    { label: "Pitot-static check", due: ac.pitotStaticDue },
    { label: "ELT battery", due: ac.eltBatteryDue }
  ];

  const expired = checks.filter(c => c.due && !isFuture(asOf, c.due));
  const expiringSoon = checks.filter(c => c.due && isFuture(asOf, c.due) && daysUntil(asOf, c.due) <= 30);

  if (expired.length > 0) {
    const first = expired[0];
    return {
      status: "not_current",
      problem: `Aircraft is NOT airworthy. Overdue: ${expired.map(c => `${c.label} (${formatDateShort(c.due)})`).join(', ')}.`,
      nextAction: `Schedule ${first.label} with an A&P/IA immediately.`,
      flightPlan: "No flight required.",
      effort: "1–3 days in shop",
      priority: "critical",
      title: `Get ${first.label} completed`,
      why: `Aircraft is not airworthy — ${first.label} is overdue. Flight is not permitted.`,
      outcome: "Inspection complete → airworthiness restored",
      ctaType: "record",
      ctaLabel: "View Aircraft Record →"
    };
  }
  if (expiringSoon.length > 0) {
    const first = expiringSoon[0];
    const d = daysUntil(asOf, first.due);
    return {
      status: "needs_attention",
      problem: `${first.label} due in ${d} day${d === 1 ? '' : 's'} (${formatDateShort(first.due)}).`,
      nextAction: `Schedule ${first.label} (can combine with annual if applicable).`,
      flightPlan: "No flight required.",
      effort: "1 call",
      priority: "important",
      title: `Schedule ${first.label} soon`,
      why: `${first.label} due in ${d} day${d === 1 ? '' : 's'} — missing it grounds the aircraft.`,
      outcome: "Schedule now → avoid grounding, keep aircraft airworthy",
      ctaType: "record",
      ctaLabel: "View Aircraft Record →"
    };
  }
  return { status: "current", problem: null, nextAction: null, flightPlan: null, effort: null, priority: null };
}

// ─── Student PPL Domains ──────────────────────────────────────────────────────

const PPL_MIN_HOURS = 40;

export function computeTrainingProgressDomain(entries, asOf) {
  const total = entries.reduce((s, e) => s + Number(e.totalTime || 0), 0);
  const pct = Math.min(100, Math.round((total / PPL_MIN_HOURS) * 100));
  if (total >= PPL_MIN_HOURS) {
    return { status: "current", problem: null, nextAction: null, flightPlan: null, effort: null, priority: null };
  }
  const remaining = Math.max(0, PPL_MIN_HOURS - total).toFixed(1);
  return {
    status: "needs_attention",
    problem: `${total.toFixed(1)} of ${PPL_MIN_HOURS} required hours logged (${pct}% complete).`,
    nextAction: `Log ${remaining} more hours to meet the FAA minimum.`,
    flightPlan: "Continue regular training flights with your instructor.",
    effort: `${remaining} hours remaining`,
    priority: "important",
    title: `${remaining}h to go — keep building hours`,
    why: `FAA requires ${PPL_MIN_HOURS} hours for PPL. You have ${total.toFixed(1)}h logged.`,
    outcome: `Complete ${remaining}h → meet FAA minimum flight time`,
    ctaType: "log",
    ctaLabel: "Log Flight →"
  };
}

export function computeRequiredHoursDomain(entries, asOf) {
  const dual = entries.reduce((s, e) => s + Number(e.dualReceived || 0), 0);
  const solo = entries.reduce((s, e) => s + Number(e.solo || 0), 0);
  const xc = entries.reduce((s, e) => s + Number(e.crossCountry || 0), 0);
  const night = entries.reduce((s, e) => s + Number(e.nightLandings || 0) > 0 ? Number(e.totalTime || 0) : 0, 0);

  const needs = [];
  if (dual < 20) needs.push(`${(20 - dual).toFixed(1)}h dual instruction`);
  if (solo < 10) needs.push(`${(10 - solo).toFixed(1)}h solo`);
  if (xc < 3) needs.push(`${(3 - xc).toFixed(1)}h cross-country`);

  if (needs.length === 0) {
    return { status: "current", problem: null, nextAction: null, flightPlan: null, effort: null, priority: null };
  }
  return {
    status: "needs_attention",
    problem: `Still need: ${needs.join(', ')}.`,
    nextAction: `Work with your instructor on: ${needs[0]}.`,
    flightPlan: "Schedule your next training flight to target the highest need.",
    effort: needs[0],
    priority: "important",
    title: `Work toward: ${needs[0]}`,
    why: `FAA requires specific hour categories for PPL. Missing: ${needs.join(', ')}.`,
    outcome: "Complete all category requirements → eligible for checkride",
    ctaType: "log",
    ctaLabel: "Log Flight →"
  };
}

export function computeSoloReadinessDomain(entries, asOf) {
  const total = entries.reduce((s, e) => s + Number(e.totalTime || 0), 0);
  const landings = entries.reduce((s, e) => s + Number(e.dayLandings || 0), 0);

  if (total >= 15 && landings >= 10) {
    return { status: "current", problem: null, nextAction: null, flightPlan: null, effort: null, priority: null };
  }
  const needsHours = total < 15;
  const needsLandings = landings < 10;
  const msg = [
    needsHours ? `${(15 - total).toFixed(1)}h more flight time` : null,
    needsLandings ? `${10 - landings} more landings` : null
  ].filter(Boolean).join(', ');
  return {
    status: "needs_attention",
    problem: `Pre-solo requirements not yet met. Need: ${msg}.`,
    nextAction: `Work with instructor: focus on ${needsLandings ? 'pattern work and landings' : 'building flight time'}.`,
    flightPlan: "Pattern work and local area flights.",
    effort: msg,
    priority: "important",
    title: `Build toward solo: ${msg}`,
    why: "Your instructor will sign you off for solo once pre-solo requirements are met.",
    outcome: "Meet requirements → instructor solo endorsement",
    ctaType: "log",
    ctaLabel: "Log Flight →"
  };
}

export function computeInstructorRequiredItemsDomain(profile, asOf) {
  const medCurrent = (() => {
    const medical = profile?.medical ?? { kind: "None" };
    if (medical.kind === "Medical" && medical.expires) return isFuture(asOf, medical.expires);
    if (medical.kind === "BasicMed") return !!medical?.basicMed?.cmecDate;
    return false;
  })();
  const studentCert = profile?.certificates?.studentPilot ?? false;

  const missing = [];
  if (!studentCert) missing.push("student pilot certificate");
  if (!medCurrent) missing.push("valid medical certificate");

  if (missing.length === 0) {
    return { status: "current", problem: null, nextAction: null, flightPlan: null, effort: null, priority: null };
  }
  return {
    status: "not_current",
    problem: `Missing required item${missing.length > 1 ? 's' : ''}: ${missing.join(', ')}.`,
    nextAction: `Obtain ${missing[0]} before solo flight.`,
    flightPlan: "No flight required — administrative.",
    effort: "1 appointment",
    priority: "critical",
    title: `Get ${missing[0]}`,
    why: `You cannot solo without: ${missing.join(', ')}.`,
    outcome: "Documents obtained → solo flight permitted",
    ctaType: "schedule",
    ctaLabel: "Schedule Appointment →"
  };
}

// ─── IFR Progress Domain (instrument_training phase) ─────────────────────────

export function computeIfrProgressDomain(entries, asOf) {
  const asOfDate = new Date(asOf);
  const cutoff6mo = new Date(asOf);
  cutoff6mo.setMonth(cutoff6mo.getMonth() - 6);
  const recent = entries.filter(e => { const d = new Date(e.date); return d >= cutoff6mo && d <= asOfDate; });

  const approaches = recent.reduce((s, e) => s + Number(e.approaches || 0), 0);
  const simTime = entries.reduce((s, e) => s + Number(e.simulatedInstrument || 0), 0);
  const actualTime = entries.reduce((s, e) => s + Number(e.actualInstrument || 0), 0);
  const total = simTime + actualTime;

  if (approaches >= 4 && total >= 15) {
    return { status: "current", problem: null, nextAction: null, flightPlan: null, effort: null, priority: null };
  }
  const needs = [];
  if (approaches < 4) needs.push(`${4 - approaches} more approaches (last 6mo)`);
  if (total < 15) needs.push(`${(15 - total).toFixed(1)}h instrument time`);
  return {
    status: "needs_attention",
    problem: `IFR training in progress. Need: ${needs.join(', ')}.`,
    nextAction: `Focus on: ${needs[0]}.`,
    flightPlan: "1–2 IFR training flights with CFII.",
    effort: needs[0],
    priority: "important",
    title: `IFR training: ${needs[0]}`,
    why: `Building IFR proficiency — need ${needs.join(', ')} to progress.`,
    outcome: "Complete training → eligible for instrument rating",
    ctaType: "log",
    ctaLabel: "Log IFR Flight →"
  };
}

// ─── IFR Proficiency Domain (instrument_rated phase) ─────────────────────────

export function computeIfrProficiencyDomain(entries, asOf) {
  const cutoff90 = new Date(asOf);
  cutoff90.setDate(cutoff90.getDate() - 90);
  const recent = entries.filter(e => new Date(e.date) >= cutoff90);
  const approaches = recent.reduce((s, e) => s + Number(e.approaches || 0), 0);

  if (approaches >= 3) {
    return { status: "current", problem: null, nextAction: null, flightPlan: null, effort: null, priority: null };
  }
  const needed = 3 - approaches;
  return {
    status: approaches === 0 ? "not_current" : "needs_attention",
    problem: `IFR proficiency low — only ${approaches} approach${approaches === 1 ? '' : 'es'} in last 90 days.`,
    nextAction: `Fly ${needed} IFR approach${needed === 1 ? '' : 'es'} to stay sharp.`,
    flightPlan: "1 IFR training flight with approaches.",
    effort: "1–2 hours",
    priority: approaches === 0 ? "critical" : "important",
    title: `Log ${needed} IFR approach${needed === 1 ? '' : 'es'} this week`,
    why: `Proficiency drops without regular approaches. ${needed} needed in next 90-day window.`,
    outcome: `${needed} approach${needed === 1 ? '' : 'es'} → IFR proficiency maintained`,
    ctaType: "log",
    ctaLabel: "Log IFR Flight →"
  };
}

// ─── Summary Builder ──────────────────────────────────────────────────────────

export function buildReadinessSummary(domains) {
  const PRIORITY_RANK = { critical: 0, important: 1, optional: 2 };
  const nonCurrent = Object.values(domains).filter(d => d.status !== "current" && d.priority);
  if (nonCurrent.length === 0) return "You are good to fly.";
  nonCurrent.sort((a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]);
  if (nonCurrent.length === 1) return nonCurrent[0].nextAction || "1 item needs attention.";
  return `${nonCurrent.length} items need attention. Next: ${nonCurrent[0].nextAction || 'see details.'}`;
}

// ─── Main Entry Point ─────────────────────────────────────────────────────────

/**
 * computeReadiness(profile, entries, aircraft, maintenance, asOf)
 *
 * Returns { phase, label, asOf, summary, domains }
 * Domains are filtered to only those visible for the pilot's phase.
 */
export function computeReadiness(profile, entries, aircraft, maintenance, asOf) {
  const totalTime = entries.reduce((s, e) => s + Number(e.totalTime || 0), 0);

  // Safe default: never infer an advanced phase from missing/incomplete data
  let phaseKey = profile?.pilotPhase || "student_ppl";

  // Guard: pilot with < 40 hours cannot be instrument-rated or commercial
  if (totalTime < 40 && !["student_ppl"].includes(phaseKey)) {
    phaseKey = "student_ppl";
  }

  const phaseConfig = PILOT_PHASES[phaseKey] || PILOT_PHASES["student_ppl"];

  console.log({ pilotPhase: phaseKey, totalTime });

  const allDomains = {
    passengerCurrency:       computePassengerCurrencyDomain(entries, asOf),
    nightCurrency:           computeNightCurrencyDomain(entries, asOf),
    ifrCurrency:             computeIfrCurrencyDomain(entries, asOf),
    ifrProgress:             computeIfrProgressDomain(entries, asOf),
    ifrProficiency:          computeIfrProficiencyDomain(entries, asOf),
    pilotReadiness:          computePilotReadinessDomain(profile, asOf),
    aircraftReadiness:       computeAircraftReadinessDomain(aircraft, maintenance, asOf),
    trainingProgress:        computeTrainingProgressDomain(entries, asOf),
    requiredHours:           computeRequiredHoursDomain(entries, asOf),
    soloReadiness:           computeSoloReadinessDomain(entries, asOf),
    instructorRequiredItems: computeInstructorRequiredItemsDomain(profile, asOf),
  };

  const domains = {};
  for (const key of phaseConfig.domains) {
    domains[key] = allDomains[key];
  }

  return {
    asOf,
    phase: phaseKey,
    label: phaseConfig.label,
    summary: buildReadinessSummary(domains),
    domains,
  };
}
