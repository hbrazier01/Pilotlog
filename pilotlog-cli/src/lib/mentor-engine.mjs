/**
 * mentor-engine.mjs
 *
 * Smart Aviation Mentor System — pure computation, no I/O.
 *
 * Entry point: computeMentorInsights(profile, entries, attestations, progression, readiness, asOf)
 *
 * Returns:
 *   - insights[]        (MentorInsight objects, priority-ordered)
 *   - trends[]          (detected trend objects)
 *   - reinforcements[]  (positive reinforcement messages)
 *   - summary           (string — top mentor message for dashboard)
 */

// ─── Categories ───────────────────────────────────────────────────────────────

export const MENTOR_CATEGORIES = {
  training_focus:           "Training Focus",
  readiness_alert:          "Readiness Alert",
  currency_alert:           "Currency Alert",
  milestone_opportunity:    "Milestone Opportunity",
  instructor_recommendation:"Instructor Recommendation",
  confidence_building:      "Confidence Building",
  progression_gap:          "Progression Gap",
  proficiency_maintenance:  "Proficiency Maintenance",
};

// ─── Priority Ordering ────────────────────────────────────────────────────────

const PRIORITY_ORDER = { critical: 0, important: 1, recommended: 2, optional: 3, milestone: 4 };

// ─── Helpers ──────────────────────────────────────────────────────────────────

function num(v) { return Number(v) || 0; }

function hoursInWindow(entries, asOf, days) {
  const cutoff = new Date(asOf).getTime() - days * 86400000;
  return entries
    .filter(e => new Date(e.date).getTime() >= cutoff)
    .reduce((s, e) => s + num(e.totalTime || e.total), 0);
}

function flightCountInWindow(entries, asOf, days) {
  const cutoff = new Date(asOf).getTime() - days * 86400000;
  return entries.filter(e => new Date(e.date).getTime() >= cutoff).length;
}

function nightLandingsInWindow(entries, asOf, days) {
  const cutoff = new Date(asOf).getTime() - days * 86400000;
  return entries
    .filter(e => new Date(e.date).getTime() >= cutoff)
    .reduce((s, e) => s + num(e.nightLandings), 0);
}

function xcHoursInWindow(entries, asOf, days) {
  const cutoff = new Date(asOf).getTime() - days * 86400000;
  return entries
    .filter(e => new Date(e.date).getTime() >= cutoff)
    .reduce((s, e) => s + num(e.crossCountry || e.xc), 0);
}

function instrumentApproachesInWindow(entries, asOf, days) {
  const cutoff = new Date(asOf).getTime() - days * 86400000;
  return entries
    .filter(e => new Date(e.date).getTime() >= cutoff)
    .reduce((s, e) => s + num(e.approaches), 0);
}

function dualReceivedInWindow(entries, asOf, days) {
  const cutoff = new Date(asOf).getTime() - days * 86400000;
  return entries
    .filter(e => new Date(e.date).getTime() >= cutoff)
    .reduce((s, e) => s + num(e.dualReceived || e.dual), 0);
}

function daysSinceLastFlight(entries, asOf) {
  if (!entries.length) return null;
  const sorted = [...entries].sort((a, b) => String(b.date).localeCompare(String(a.date)));
  const last = new Date(sorted[0].date).getTime();
  return Math.round((new Date(asOf).getTime() - last) / 86400000);
}

function totalHours(entries) {
  return entries.reduce((s, e) => s + num(e.totalTime || e.total), 0);
}

function xcHours(entries) {
  return entries.reduce((s, e) => s + num(e.crossCountry || e.xc), 0);
}

function nightHours(entries) {
  return entries.reduce((s, e) => s + num(e.night), 0);
}

function soloHours(entries) {
  return entries.reduce((s, e) => s + num(e.solo), 0);
}

function instrumentHours(entries) {
  return entries.reduce((s, e) => s + num(e.actualInstrument) + num(e.simulatedInstrument), 0);
}

function insight(id, category, priority, headline, body, action = null) {
  return { id, category, priority, headline, body, action };
}

// ─── Trend Detection ──────────────────────────────────────────────────────────

export function detectTrends(entries, asOf) {
  const trends = [];

  const now30  = hoursInWindow(entries, asOf, 30);
  const prev30 = hoursInWindow(entries, asOf, 60) - now30;
  const now60  = hoursInWindow(entries, asOf, 60);
  const prev60 = hoursInWindow(entries, asOf, 120) - now60;

  const flights30  = flightCountInWindow(entries, asOf, 30);
  const flights60  = flightCountInWindow(entries, asOf, 60) - flights30;

  const sinceLastFlight = daysSinceLastFlight(entries, asOf);
  const nightLandings45 = nightLandingsInWindow(entries, asOf, 45);
  const nightLandings90 = nightLandingsInWindow(entries, asOf, 90);
  const xc30 = xcHoursInWindow(entries, asOf, 30);
  const xc90 = xcHoursInWindow(entries, asOf, 90);
  const instr30 = instrumentApproachesInWindow(entries, asOf, 30);
  const instr60 = instrumentApproachesInWindow(entries, asOf, 60);
  const dual30  = dualReceivedInWindow(entries, asOf, 30);

  // Stalled progression
  if (sinceLastFlight !== null && sinceLastFlight > 21 && entries.length > 0) {
    trends.push({
      id: "stalled_progression",
      type: "warning",
      headline: "Flight activity has slowed",
      body: `No flights logged in the last ${sinceLastFlight} days. Consistency is key to progression.`,
    });
  }

  // Declining currency
  if (nightLandings90 > 0 && nightLandings45 === 0) {
    trends.push({
      id: "declining_night_currency",
      type: "warning",
      headline: "Night currency activity has slowed",
      body: `Night activity has been absent over the last 45 days.`,
    });
  }

  // Accelerating instrument progression
  if (instr30 > 0 && instr30 >= instr60 - instr30) {
    trends.push({
      id: "accelerating_instrument",
      type: "positive",
      headline: "Instrument progression accelerating",
      body: `Recent instrument approach activity is trending upward — strong IFR development.`,
    });
  }

  // Strong XC consistency
  if (xc30 > 0 && xc90 >= 3) {
    trends.push({
      id: "strong_xc_consistency",
      type: "positive",
      headline: "Strong cross-country consistency detected",
      body: `Regular cross-country activity is building solid navigation experience.`,
    });
  }

  // Strong overall training pace
  if (flights30 >= 4 && dual30 >= 2) {
    trends.push({
      id: "strong_training_pace",
      type: "positive",
      headline: "Strong pattern of training progression",
      body: `${flights30} flights in the last 30 days, including dual instruction — excellent pace.`,
    });
  }

  // Hour building momentum
  if (now30 > prev30 * 1.3 && now30 >= 3) {
    trends.push({
      id: "accelerating_hours",
      type: "positive",
      headline: "Flight hours accelerating",
      body: `You are flying more this month than last — great momentum.`,
    });
  }

  return trends;
}

// ─── Positive Reinforcement Layer ─────────────────────────────────────────────

export function buildReinforcements(entries, progressionState, milestones, asOf) {
  const reinforcements = [];
  const total = totalHours(entries);
  const xc = xcHours(entries);
  const night = nightHours(entries);
  const instr = instrumentHours(entries);
  const flights30 = flightCountInWindow(entries, asOf, 30);
  const xc30 = xcHoursInWindow(entries, asOf, 30);

  const completedCount = milestones.filter(m => m.status === "completed").length;

  // Consistency rewards
  if (flights30 >= 6) {
    reinforcements.push("Exceptional flying frequency this month — your consistency will show in your skills.");
  } else if (flights30 >= 3) {
    reinforcements.push("Good flight frequency this month. Regular time in the cockpit builds lasting proficiency.");
  }

  // XC consistency
  if (xc30 >= 2) {
    reinforcements.push("Excellent cross-country consistency recently. Navigation experience is compounding.");
  }

  // Instrument building
  if (instr >= 10 && instr < 40) {
    reinforcements.push(`${instr.toFixed(1)}h instrument time logged — your scan and panel work are developing well.`);
  }

  // Night proficiency
  if (night >= 5) {
    reinforcements.push("Night proficiency is building. Flying after dark demands a higher standard — well done.");
  }

  // Milestone momentum
  if (completedCount >= 3) {
    reinforcements.push(`${completedCount} milestones achieved — each one represents real aviation skill.`);
  }

  // Phase-specific encouragement
  if (progressionState === "solo_complete") {
    reinforcements.push("First solo is behind you — the hardest psychological barrier in flight training. Keep building.");
  } else if (progressionState === "checkride_ready") {
    reinforcements.push("You have met the FAA hour requirements. The checkride is now about preparation and confidence.");
  } else if (progressionState === "instrument_rated") {
    reinforcements.push("Instrument rating earned — you are now a more capable and safer pilot in any condition.");
  }

  return reinforcements;
}

// ─── Core Mentor Insight Engine ───────────────────────────────────────────────

export function buildMentorInsights(profile, entries, attestations, progression, asOf) {
  const insights = [];
  const total = totalHours(entries);
  const xc = xcHours(entries);
  const night = nightHours(entries);
  const solo = soloHours(entries);
  const instr = instrumentHours(entries);
  const progressionState = progression?.progressionState || "discovery";

  const asOfMs = new Date(asOf).getTime();

  const last90 = entries.filter(e => new Date(e.date).getTime() >= asOfMs - 90 * 86400000);
  const last6mo = entries.filter(e => {
    const d = new Date(asOf); d.setMonth(d.getMonth() - 6);
    return new Date(e.date) >= d;
  });

  const dayLandings90   = last90.reduce((s, e) => s + num(e.dayLandings), 0);
  const nightLandings90 = last90.reduce((s, e) => s + num(e.nightLandings), 0);
  const approaches6     = last6mo.reduce((s, e) => s + num(e.approaches), 0);
  const holds6          = last6mo.reduce((s, e) => s + num(e.holds), 0);

  const sinceLastFlight = daysSinceLastFlight(entries, asOf);

  // ── Currency Alerts ──────────────────────────────────────────────────────────

  if (night > 0 && nightLandings90 === 0) {
    insights.push(insight(
      "night_currency_lapsed",
      "currency_alert",
      "critical",
      "Night passenger currency lapsed",
      "No night landings in the last 90 days. You cannot carry passengers after dark until currency is restored.",
      "Fly 3 full-stop night landings to restore night passenger privileges."
    ));
  } else if (nightLandings90 > 0 && nightLandings90 < 3) {
    insights.push(insight(
      "night_currency_declining",
      "currency_alert",
      "important",
      "Night currency activity has slowed over the last 90 days",
      `${nightLandings90} of 3 required night landings in the past 90 days.`,
      `Log ${3 - nightLandings90} more night landing${3 - nightLandings90 !== 1 ? "s" : ""} before the window closes.`
    ));
  }

  if (dayLandings90 > 0 && dayLandings90 < 3) {
    insights.push(insight(
      "day_currency_at_risk",
      "currency_alert",
      "important",
      "Day passenger currency approaching lapse",
      `${dayLandings90} of 3 required landings in the last 90 days.`,
      `Log ${3 - dayLandings90} more landing${3 - dayLandings90 !== 1 ? "s" : ""} to stay current.`
    ));
  }

  if (approaches6 > 0 && approaches6 < 6) {
    insights.push(insight(
      "ifr_currency_at_risk",
      "currency_alert",
      "important",
      "Instrument currency at risk",
      `${approaches6} of 6 required approaches in the last 6 months.`,
      `Log ${6 - approaches6} more approach${6 - approaches6 !== 1 ? "es" : ""} to maintain IFR currency.`
    ));
  }

  // Medical expiry
  const medical = profile?.medical;
  if (medical?.kind === "Medical" && medical?.expires) {
    const daysLeft = Math.ceil((new Date(medical.expires) - new Date(asOf)) / 86400000);
    if (daysLeft <= 60 && daysLeft > 0) {
      insights.push(insight(
        "medical_expiring",
        "readiness_alert",
        daysLeft <= 30 ? "critical" : "important",
        `Medical certificate expires in ${daysLeft} day${daysLeft !== 1 ? "s" : ""}`,
        `Your Class ${medical.class} medical is due ${medical.expires}. A lapse grounds you immediately.`,
        "Schedule an AME appointment before it lapses."
      ));
    } else if (daysLeft <= 0) {
      insights.push(insight(
        "medical_expired",
        "readiness_alert",
        "critical",
        "Medical certificate has expired",
        "You cannot act as PIC. An expired medical grounds you immediately.",
        "Schedule an AME appointment today."
      ));
    }
  }

  // Flight review
  const frDate = profile?.proficiency?.flightReviewDate;
  if (frDate) {
    const frExpiry = new Date(frDate);
    frExpiry.setMonth(frExpiry.getMonth() + 24);
    const frDays = Math.ceil((frExpiry - new Date(asOf)) / 86400000);
    if (frDays <= 60 && frDays > 0) {
      insights.push(insight(
        "flight_review_expiring",
        "readiness_alert",
        frDays <= 30 ? "critical" : "important",
        `Flight review expires in ${frDays} day${frDays !== 1 ? "s" : ""}`,
        `Your biennial flight review is due soon. After expiry, you cannot act as PIC.`,
        "Schedule a flight review with a CFI."
      ));
    }
  }

  // ── Training Focus ───────────────────────────────────────────────────────────

  if (["student_pilot", "solo_ready"].includes(progressionState)) {
    if (total >= 10 && solo === 0) {
      insights.push(insight(
        "approaching_solo_readiness",
        "training_focus",
        "recommended",
        "You are approaching solo readiness",
        `${total.toFixed(1)}h logged — pattern consistency and landing accuracy are the focus now.`,
        "Discuss solo endorsement readiness with your instructor at your next lesson."
      ));
    }
  }

  if (["solo_complete", "student_pilot"].includes(progressionState) && xc < 3) {
    insights.push(insight(
      "xc_development_lagging",
      "progression_gap",
      "recommended",
      "XC development is behind expected PPL progression",
      `${xc.toFixed(1)}h cross-country logged — PPL requires 3h minimum, with specific solo XC requirements.`,
      "Plan your next cross-country training flight with your instructor."
    ));
  }

  if (progressionState === "xc_ready") {
    insights.push(insight(
      "solo_xc_milestone_ready",
      "milestone_opportunity",
      "milestone",
      "Solo cross-country flight is your next major milestone",
      `You have ${xc.toFixed(1)}h XC time and your solo endorsement. A solo XC is within reach.`,
      "Confirm solo XC endorsement with your instructor and plan your route."
    ));
  }

  if (progressionState === "checkride_ready") {
    insights.push(insight(
      "checkride_prep_approaching",
      "milestone_opportunity",
      "milestone",
      "Recent training suggests checkride prep may be approaching",
      `All FAA hour minimums are met (${total.toFixed(1)}h total). The checkride is now about ACS preparation.`,
      "Review the Private Pilot ACS standards and schedule oral prep with your instructor."
    ));
  }

  // ── Instrument Track ─────────────────────────────────────────────────────────

  if (progressionState === "instrument_training") {
    if (approaches6 < 4) {
      insights.push(insight(
        "instrument_scan_proficiency",
        "proficiency_maintenance",
        "recommended",
        "Instrument scan proficiency may benefit from additional approaches",
        `${approaches6} approaches in the last 6 months — consistent approach practice sharpens scan technique.`,
        "Schedule a simulated IFR session with your CFII focused on approaches."
      ));
    }
    if (instr < 40) {
      insights.push(insight(
        "instrument_hours_building",
        "training_focus",
        "recommended",
        "Instrument training in progress — stay consistent",
        `${instr.toFixed(1)}h instrument time logged — FAA requires 40h for the rating.`,
        `${Math.ceil((40 - instr) / 2)} more IFR sessions will keep you on pace.`
      ));
    }
  }

  if (progressionState === "instrument_rated" && approaches6 < 3) {
    insights.push(insight(
      "instrument_proficiency_maintenance",
      "proficiency_maintenance",
      "recommended",
      "Instrument proficiency may need attention",
      `${approaches6} approaches in the last 6 months. Regular approaches preserve the precision you trained for.`,
      "Schedule an IFR flight or CFII session to stay sharp."
    ));
  }

  // ── Instructor Recommendation ────────────────────────────────────────────────

  if (sinceLastFlight !== null && sinceLastFlight > 30 && entries.length > 0) {
    insights.push(insight(
      "extended_gap_dual_recommended",
      "instructor_recommendation",
      "recommended",
      "An instructor flight may be beneficial after an extended break",
      `${sinceLastFlight} days since your last logged flight. A dual review helps re-establish currency and comfort.`,
      "Consider booking a dual flight before flying solo or with passengers."
    ));
  }

  if (total >= 38 && total < 40) {
    insights.push(insight(
      "ppl_minimum_hours_close",
      "milestone_opportunity",
      "milestone",
      `${(40 - total).toFixed(1)}h from PPL minimum flight time`,
      `You are ${(40 - total).toFixed(1)}h away from the 40-hour FAA minimum — a major threshold.`,
      "Schedule your next flight to close the gap."
    ));
  }

  if (total >= 90 && total < 100) {
    insights.push(insight(
      "approaching_100_hours",
      "milestone_opportunity",
      "milestone",
      "Approaching the 100-hour milestone",
      `${total.toFixed(1)}h logged — the 100-hour mark is a meaningful achievement in any pilot's logbook.`,
      `${(100 - total).toFixed(1)}h to go — keep it up.`
    ));
  }

  // ── Confidence Building ──────────────────────────────────────────────────────

  const recentFlight = sinceLastFlight !== null && sinceLastFlight <= 7;
  const flightCount = entries.length;

  if (progressionState === "solo_complete" && solo >= 2) {
    insights.push(insight(
      "solo_consistency_building",
      "confidence_building",
      "optional",
      "Solo flight confidence building well",
      `${solo.toFixed(1)}h solo time — each solo builds independent decision-making skills.`,
      "Focus on precision and situational awareness on every solo flight."
    ));
  }

  if (flightCount >= 50 && recentFlight) {
    insights.push(insight(
      "experienced_active_pilot",
      "confidence_building",
      "optional",
      "Consistent airwork across an experienced logbook",
      `${flightCount} flights logged and actively flying — this experience compounds with every hour.`,
      null
    ));
  }

  // Sort by priority
  insights.sort((a, b) => (PRIORITY_ORDER[a.priority] ?? 3) - (PRIORITY_ORDER[b.priority] ?? 3));

  return insights;
}

// ─── Mentor Summary ───────────────────────────────────────────────────────────

export function buildMentorSummary(insights, trends, reinforcements, progressionState) {
  // Lead with highest-priority insight
  const top = insights.find(i => i.priority === "critical") ||
              insights.find(i => i.priority === "important") ||
              insights.find(i => i.priority === "milestone");

  if (top) return top.headline;

  // Lead with positive trend if no alerts
  const positiveTrend = trends.find(t => t.type === "positive");
  if (positiveTrend) return positiveTrend.headline;

  // Lead with reinforcement
  if (reinforcements.length) return reinforcements[0];

  // Fallback by phase
  const phaseMessages = {
    discovery:           "Log your first flight to begin your aviation journey.",
    student_pilot:       "Stay consistent with your training — every flight builds toward your certificate.",
    solo_ready:          "You are approaching solo readiness. Keep focusing on pattern work.",
    solo_complete:       "First solo is behind you. Build on that confidence.",
    xc_ready:            "Cross-country flying is your next frontier. Plan your route.",
    checkride_ready:     "All hour minimums are met. Focus your preparation on the ACS.",
    private_pilot:       "You are a certificated pilot. Stay current and keep flying.",
    instrument_training: "IFR training takes discipline. Consistent approaches build the scan.",
    instrument_ready:    "Instrument checkride prep is the priority now.",
    instrument_rated:    "Instrument rating in hand — maintain currency and proficiency.",
    commercial_track:    "Building hours and precision toward commercial standards.",
    cfi_track:           "Teaching aviation is the most thorough way to master it.",
  };
  return phaseMessages[progressionState] || "Keep flying. Every flight matters.";
}

// ─── Main Entry Point ─────────────────────────────────────────────────────────

/**
 * computeMentorInsights(profile, entries, attestations, progression, asOf)
 *
 * Returns:
 *   { insights, trends, reinforcements, summary }
 */
export function computeMentorInsights(profile, entries, attestations, progression, asOf) {
  if (!asOf) asOf = new Date().toISOString();

  const milestones = progression?.milestones || [];
  const progressionState = progression?.progressionState || "discovery";

  const insights      = buildMentorInsights(profile, entries, attestations, progression, asOf);
  const trends        = detectTrends(entries, asOf);
  const reinforcements = buildReinforcements(entries, progressionState, milestones, asOf);
  const summary       = buildMentorSummary(insights, trends, reinforcements, progressionState);

  return { insights, trends, reinforcements, summary };
}
