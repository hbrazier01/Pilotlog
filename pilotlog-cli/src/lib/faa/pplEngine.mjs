/**
 * pplEngine.mjs
 *
 * Complete FAA Private Pilot License Engine — 14 CFR Part 61 ASEL
 *
 * Single authoritative source for all PPL progression logic.
 * Pure computation — no I/O, no side effects.
 *
 * Entry point: computePplEngine(entries, options)
 *
 * Returns:
 *   {
 *     phase, phaseLabel, phaseDescription,
 *     progressPercent,
 *     requirements,   — all Part 61 §61.109(a) requirements
 *     stats,          — normalized flight statistics
 *     soloEligibility,
 *     checkrideReadiness,
 *     milestones,
 *     deficiencies,
 *     completed,
 *     insights,
 *     guidanceCards,
 *     recommendations,
 *   }
 */

// ─── Part 61 §61.109(a) ASEL Thresholds ──────────────────────────────────────

export const PPL_THRESHOLDS = {
  totalTime:              40,  // §61.109(a) total flight time
  dualReceived:           20,  // §61.109(a)(1) dual instruction
  soloTime:               10,  // §61.109(a)(2) solo flight time
  dualXC:                  3,  // §61.109(a)(1)(i) dual cross-country
  nightHours:              3,  // §61.109(a)(1)(ii) night flight time
  nightLandings:          10,  // §61.109(a)(1)(ii)(A) night full-stop landings
  nightXCHours:            1,  // §61.109(a)(1)(ii)(B) one night XC ≥100 NM (proxy: any night XC > 0)
  simulatedInstrument:     3,  // §61.109(a)(1)(iii) simulated instrument
  dualPrepMonths:          3,  // §61.109(a)(1)(iv) 3h dual in preceding 2 calendar months
  soloXC:                  5,  // §61.109(a)(2)(ii) solo cross-country
  longSoloXC:              1,  // §61.109(a)(2)(ii) one long solo XC ≥150 NM w/ full-stop at ≥3 points
  soloControlledAirport:   3,  // §61.109(a)(2)(i) 3 solo T/Os and landings at controlled airport
  recentTrainingMonths:    2,  // prep window in calendar months
};

// Requirement weights for overall progress (reflect relative difficulty)
const WEIGHTS = {
  totalTime:             20,
  dualReceived:          18,
  soloTime:              12,
  dualXC:                 8,
  nightHours:             7,
  nightLandings:          5,
  nightXCHours:           4,
  simulatedInstrument:    7,
  dualPrepMonths:         3,
  soloXC:                 9,
  longSoloXC:             4,
  soloControlledAirport:  3,
};

// ─── Training Phases ──────────────────────────────────────────────────────────
//
// Ordered from earliest to most advanced.

export const PPL_PHASES = {
  no_flights: {
    label: 'No Flights Yet',
    description: 'Ready to begin flight training. Log your first lesson to start your journey.',
    order: 0,
  },
  discovery: {
    label: 'Discovery Flight',
    description: 'You have taken your first flight. Continue with scheduled lessons to build momentum.',
    order: 1,
  },
  foundation_training: {
    label: 'Foundation Training',
    description: 'Building fundamental aircraft control and airmanship with your instructor.',
    order: 2,
  },
  dual_training: {
    label: 'Dual Training',
    description: 'Actively building dual instruction toward solo endorsement. Focus on landing consistency.',
    order: 3,
  },
  pre_solo: {
    label: 'Pre-Solo Preparation',
    description: 'Approaching solo endorsement. Your instructor is evaluating your readiness to fly alone.',
    order: 4,
  },
  solo_phase: {
    label: 'Solo Phase',
    description: 'First solo complete. Building solo confidence and pattern proficiency.',
    order: 5,
  },
  cross_country_phase: {
    label: 'Cross-Country Phase',
    description: 'Solo complete. Building cross-country navigation experience toward PPL minimums.',
    order: 6,
  },
  night_training: {
    label: 'Night Training',
    description: 'Building night flight experience and completing night currency requirements.',
    order: 7,
  },
  checkride_preparation: {
    label: 'Checkride Preparation',
    description: 'Most requirements are met. Polishing skills and completing final training toward the practical test.',
    order: 8,
  },
  checkride_eligible: {
    label: 'Checkride Eligible',
    description: 'All FAA Part 61 ASEL minimums met. Schedule your practical test with a DPE.',
    order: 9,
  },
  ppl_complete: {
    label: 'Private Pilot',
    description: 'Private Pilot certificate earned.',
    order: 10,
  },
  inactive_training: {
    label: 'Training Inactive',
    description: 'No recent training activity. Resume lessons to maintain and build on your progress.',
    order: 1,  // displayed early since it overlays other phases
  },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function num(v) { return Number(v) || 0; }

function sum(entries, ...fields) {
  return entries.reduce((s, e) => {
    for (const f of fields) s += num(e[f]);
    return s;
  }, 0);
}

function within(entries, calendarMonths, asOf) {
  const ref = new Date(asOf);
  const cutoff = new Date(asOf);
  cutoff.setMonth(cutoff.getMonth() - calendarMonths);
  return entries.filter(e => {
    const d = new Date(e.date);
    return d >= cutoff && d <= ref;
  });
}

function daysSince(dateStr, asOf) {
  if (!dateStr) return Infinity;
  return Math.round((new Date(asOf) - new Date(dateStr)) / 86400000);
}

// ─── Stats Aggregation ────────────────────────────────────────────────────────

export function aggregateStats(entries, asOf) {
  const effectiveAsOf = asOf || new Date().toISOString();

  // totalTime: entries may use 'total' or 'totalTime'
  const totalTime         = sum(entries, 'total', 'totalTime');
  const pic               = sum(entries, 'pic');
  const dualReceived      = sum(entries, 'dual', 'dualReceived');
  const soloTime          = sum(entries, 'solo');
  const nightHours        = sum(entries, 'night');
  const nightLandings     = sum(entries, 'nightLandings');
  const dayLandings       = sum(entries, 'dayLandings');
  const simulatedInstrument = sum(entries, 'simulatedInstrument');
  const actualInstrument  = sum(entries, 'actualInstrument');
  const approaches        = sum(entries, 'approaches');
  const holds             = sum(entries, 'holds');

  // Cross-country: xc or crossCountry field
  const xcTotal = sum(entries, 'xc', 'crossCountry');

  // Dual XC: entries where dualReceived > 0 and xc > 0
  const dualXCActual = entries.reduce((s, e) => {
    if (num(e.dual || e.dualReceived) > 0 && num(e.xc || e.crossCountry) > 0) {
      return s + num(e.xc || e.crossCountry);
    }
    return s;
  }, 0);

  // Solo XC: explicit soloXC field OR entries with solo > 0 and xc > 0
  const soloXCExplicit = sum(entries, 'soloXC');
  const soloXCActual = soloXCExplicit > 0 ? soloXCExplicit : entries.reduce((s, e) => {
    if (num(e.solo) > 0 && num(e.xc || e.crossCountry) > 0) {
      return s + num(e.xc || e.crossCountry);
    }
    return s;
  }, 0);

  // Night XC: entries with night > 0 and xc > 0 (proxy for ≥100 NM night XC requirement)
  const nightXCHours = entries.reduce((s, e) => {
    if (num(e.night) > 0 && num(e.xc || e.crossCountry) > 0) {
      return s + num(e.xc || e.crossCountry);
    }
    return s;
  }, 0);

  // Long solo XC: explicit longSoloXC flag or derived from soloXC >= 1 that is plausibly long
  // Pilots should mark a solo XC entry with longXC: true when it meets the ≥150 NM requirement.
  // We also check remarks for common keywords.
  const hasLongSoloXC = entries.some(e => {
    if (e.longXC === true || e.longXC === 'true') return true;
    const r = (e.remarks || '').toLowerCase();
    return num(e.solo) > 0 && (r.includes('long xc') || r.includes('150') || r.includes('long solo'));
  });

  // Solo at controlled airport: explicit soloControlledAirport count or remarks-based
  const soloControlledAirportExplicit = sum(entries, 'soloControlledAirport', 'soloCtl');
  const soloControlledAirport = soloControlledAirportExplicit > 0
    ? soloControlledAirportExplicit
    : (() => {
      // Approximate: count solo entries whose to/from includes a tower-controlled airport keyword
      // This is a rough heuristic — pilots should log explicitly
      let count = 0;
      for (const e of entries) {
        if (num(e.solo) > 0) {
          const remarks = (e.remarks || '').toLowerCase();
          if (remarks.includes('towered') || remarks.includes('class c') || remarks.includes('class b') || remarks.includes('controlled')) {
            count += num(e.dayLandings || 0) + num(e.nightLandings || 0);
          }
        }
      }
      return count;
    })();

  // Dual prep: 3h dual instruction in preceding 2 calendar months
  const recentDual = within(entries, PPL_THRESHOLDS.recentTrainingMonths, effectiveAsOf);
  const dualPrepHours = sum(recentDual, 'dual', 'dualReceived');

  // Recent activity
  const sortedDates = entries
    .map(e => e.date)
    .filter(Boolean)
    .sort((a, b) => String(b).localeCompare(String(a)));
  const lastFlightDate = sortedDates[0] || null;
  const daysSinceLastFlight = lastFlightDate ? daysSince(lastFlightDate, effectiveAsOf) : null;

  // Total landings
  const totalLandings = Math.round(dayLandings + nightLandings);

  return {
    totalTime:              parseFloat(totalTime.toFixed(1)),
    pic:                    parseFloat(pic.toFixed(1)),
    dualReceived:           parseFloat(dualReceived.toFixed(1)),
    soloTime:               parseFloat(soloTime.toFixed(1)),
    xcTotal:                parseFloat(xcTotal.toFixed(1)),
    dualXC:                 parseFloat(dualXCActual.toFixed(1)),
    soloXC:                 parseFloat(soloXCActual.toFixed(1)),
    nightHours:             parseFloat(nightHours.toFixed(1)),
    nightLandings:          Math.round(nightLandings),
    nightXCHours:           parseFloat(nightXCHours.toFixed(1)),
    hasLongSoloXC,
    soloControlledAirport:  Math.round(soloControlledAirport),
    simulatedInstrument:    parseFloat(simulatedInstrument.toFixed(1)),
    actualInstrument:       parseFloat(actualInstrument.toFixed(1)),
    dualPrepHours:          parseFloat(dualPrepHours.toFixed(1)),
    dayLandings:            Math.round(dayLandings),
    totalLandings,
    approaches:             Math.round(approaches),
    holds:                  Math.round(holds),
    lastFlightDate,
    daysSinceLastFlight,
    totalFlights:           entries.length,
  };
}

// ─── Requirement Evaluation ───────────────────────────────────────────────────

function req(key, label, regulation, required, actual, unit = 'hours', note = null) {
  const met = actual >= required;
  const deficit = met ? 0 : unit === 'landings'
    ? Math.ceil(required - actual)
    : parseFloat((required - actual).toFixed(1));
  const pct = Math.min(100, Math.round((actual / required) * 100));
  return { key, label, regulation, required, unit, actual, met, deficit, pct, note };
}

function reqFlag(key, label, regulation, met, actualLabel, note = null) {
  return {
    key, label, regulation,
    required: 1, unit: 'event',
    actual: met ? 1 : 0,
    met,
    deficit: met ? 0 : 1,
    pct: met ? 100 : 0,
    actualLabel,
    note,
  };
}

export function evaluateRequirements(stats, thresholds) {
  const t = { ...PPL_THRESHOLDS, ...thresholds };

  return {
    totalTime: req(
      'totalTime', 'Total Flight Time', '14 CFR §61.109(a)',
      t.totalTime, stats.totalTime
    ),
    dualReceived: req(
      'dualReceived', 'Dual Instruction Received', '14 CFR §61.109(a)(1)',
      t.dualReceived, stats.dualReceived
    ),
    soloTime: req(
      'soloTime', 'Solo Flight Time', '14 CFR §61.109(a)(2)',
      t.soloTime, stats.soloTime
    ),
    dualXC: req(
      'dualXC', 'Dual Cross-Country', '14 CFR §61.109(a)(1)(i)',
      t.dualXC, stats.dualXC
    ),
    nightHours: req(
      'nightHours', 'Night Flight Time', '14 CFR §61.109(a)(1)(ii)',
      t.nightHours, stats.nightHours
    ),
    nightLandings: req(
      'nightLandings', 'Night Full-Stop Landings', '14 CFR §61.109(a)(1)(ii)(A)',
      t.nightLandings, stats.nightLandings, 'landings'
    ),
    nightXCHours: reqFlag(
      'nightXCHours', 'Night Cross-Country (≥100 NM)', '14 CFR §61.109(a)(1)(ii)(B)',
      stats.nightXCHours >= t.nightXCHours,
      stats.nightXCHours > 0 ? `${stats.nightXCHours}h night XC logged` : 'None logged',
      'One night XC flight of at least 100 NM total distance required. Log with night > 0 and xc > 0.'
    ),
    simulatedInstrument: req(
      'simulatedInstrument', 'Simulated Instrument Training', '14 CFR §61.109(a)(1)(iii)',
      t.simulatedInstrument, stats.simulatedInstrument
    ),
    dualPrepMonths: req(
      'dualPrepMonths', 'Dual Prep (2 Calendar Months)', '14 CFR §61.109(a)(1)(iv)',
      t.dualPrepMonths, stats.dualPrepHours,
      'hours',
      'Required: 3h dual instruction within 2 calendar months preceding practical test.'
    ),
    soloXC: req(
      'soloXC', 'Solo Cross-Country', '14 CFR §61.109(a)(2)(ii)',
      t.soloXC, stats.soloXC
    ),
    longSoloXC: reqFlag(
      'longSoloXC', 'Long Solo XC (≥150 NM, 3 airports)', '14 CFR §61.109(a)(2)(ii)',
      stats.hasLongSoloXC,
      stats.hasLongSoloXC ? 'Long solo XC logged' : 'Not yet completed',
      'One solo XC of ≥150 NM with full-stop landings at 3 different airports. Mark entry with longXC: true or add "long XC" to remarks.'
    ),
    soloControlledAirport: req(
      'soloControlledAirport', 'Solo T/Os & Landings (Controlled Airport)', '14 CFR §61.109(a)(2)(i)',
      t.soloControlledAirport, stats.soloControlledAirport, 'landings',
      'Required: 3 solo T/Os and full-stop landings at a towered airport. Log solo entries with remarks "towered" or "class c/b".'
    ),
  };
}

// ─── Phase Computation ────────────────────────────────────────────────────────

export function computePhase(stats, requirements, hasPpl) {
  if (hasPpl) return 'ppl_complete';

  const allMet = Object.values(requirements).every(r => r.met);
  if (allMet) return 'checkride_eligible';

  // Inactive check: no flights in 90+ days (but has some history)
  if (stats.totalFlights > 0 && stats.daysSinceLastFlight !== null && stats.daysSinceLastFlight > 90) {
    return 'inactive_training';
  }

  // Checkride prep: all big-hour requirements close (within 5h or 5 landings of met)
  const bigReqs = ['totalTime', 'dualReceived', 'soloTime', 'nightHours', 'nightLandings', 'simulatedInstrument', 'soloXC'];
  const allBigClose = bigReqs.every(k => {
    const r = requirements[k];
    return r && (r.met || r.deficit <= 5);
  });
  if (allBigClose && stats.soloTime > 0) return 'checkride_preparation';

  // Night training: night flights started
  if (stats.nightHours > 0 || stats.nightLandings > 0) return 'night_training';

  // Cross-country phase: solo done and XC started
  if (stats.soloTime > 0 && (stats.soloXC > 0 || stats.dualXC > 0 || stats.xcTotal > 0)) return 'cross_country_phase';

  // Solo phase: first solo done, XC not yet started
  if (stats.soloTime > 0) return 'solo_phase';

  // Pre-solo: substantial dual training, no solo yet
  if (stats.dualReceived >= 10 || stats.totalTime >= 14) return 'pre_solo';

  // Dual training: actively in dual lessons
  if (stats.dualReceived >= 3 || stats.totalTime >= 5) return 'dual_training';

  // Foundation: early dual lessons
  if (stats.totalTime >= 1) return 'foundation_training';

  // Discovery: first entry logged
  if (stats.totalFlights > 0) return 'discovery';

  return 'no_flights';
}

// ─── Progress Percent ─────────────────────────────────────────────────────────

export function computeProgressPercent(requirements) {
  const totalWeight = Object.values(WEIGHTS).reduce((s, w) => s + w, 0);
  let weighted = 0;
  for (const [key, weight] of Object.entries(WEIGHTS)) {
    const r = requirements[key];
    if (r) weighted += (r.pct / 100) * weight;
  }
  return Math.round((weighted / totalWeight) * 100);
}

// ─── Solo Eligibility ─────────────────────────────────────────────────────────

export function computeSoloEligibility(stats, profile) {
  const indicators = [];
  let score = 0;

  // Dual hours
  if (stats.dualReceived >= 15) {
    indicators.push({ met: true,  text: `${stats.dualReceived}h dual — strong foundation` });
    score += 30;
  } else if (stats.dualReceived >= 10) {
    indicators.push({ met: true,  text: `${stats.dualReceived}h dual — building toward endorsement` });
    score += 20;
  } else {
    indicators.push({ met: false, text: `${stats.dualReceived}h dual — need ~15h before solo is typical` });
  }

  // Landing repetition
  if (stats.dayLandings >= 15) {
    indicators.push({ met: true,  text: `${stats.dayLandings} day landings — consistent pattern work` });
    score += 25;
  } else if (stats.dayLandings >= 8) {
    indicators.push({ met: true,  text: `${stats.dayLandings} day landings — building pattern proficiency` });
    score += 15;
  } else {
    indicators.push({ met: false, text: `${stats.dayLandings} day landings — need more traffic pattern repetition` });
  }

  // Total time
  if (stats.totalTime >= 15) {
    indicators.push({ met: true,  text: `${stats.totalTime}h total — typical solo range` });
    score += 20;
  } else if (stats.totalTime >= 10) {
    indicators.push({ met: true,  text: `${stats.totalTime}h total — approaching typical solo range` });
    score += 10;
  } else {
    indicators.push({ met: false, text: `${stats.totalTime}h total — most students solo between 12–20h` });
  }

  // Recent training (active lessons)
  if (stats.daysSinceLastFlight !== null && stats.daysSinceLastFlight <= 14) {
    indicators.push({ met: true,  text: `Last flight ${stats.daysSinceLastFlight} days ago — training is current` });
    score += 15;
  } else if (stats.daysSinceLastFlight !== null && stats.daysSinceLastFlight <= 30) {
    indicators.push({ met: true,  text: `Last flight ${stats.daysSinceLastFlight} days ago — maintain momentum` });
    score += 8;
  } else if (stats.daysSinceLastFlight !== null) {
    indicators.push({ met: false, text: `Last flight ${stats.daysSinceLastFlight} days ago — resume training to stay sharp` });
  }

  // Endorsements from profile
  const hasPreSoloKnowledge = (profile?.endorsements || []).some(e =>
    (e.text || '').toLowerCase().includes('knowledge') && (e.text || '').toLowerCase().includes('solo')
  );
  const hasPreSoloFlight = (profile?.endorsements || []).some(e =>
    (e.text || '').toLowerCase().includes('solo') && !(e.text || '').toLowerCase().includes('xc')
  );

  if (hasPreSoloFlight) {
    indicators.push({ met: true,  text: 'Pre-solo flight endorsement on file' });
    score += 10;
  } else {
    indicators.push({ met: false, text: 'Pre-solo flight endorsement from instructor required (§61.87)' });
  }

  const eligibilityScore = Math.min(100, score);
  let status;
  if (stats.soloTime > 0) {
    status = 'completed';
  } else if (eligibilityScore >= 70) {
    status = 'close';
  } else if (eligibilityScore >= 30) {
    status = 'building';
  } else {
    status = 'early';
  }

  return {
    status,
    score: eligibilityScore,
    hasCompletedSolo: stats.soloTime > 0,
    indicators,
    summary: stats.soloTime > 0
      ? `First solo logged — ${stats.soloTime}h solo time in logbook.`
      : eligibilityScore >= 70
      ? 'Approaching solo eligibility. Discuss solo endorsement with your instructor.'
      : `Building toward solo. Focus on landing consistency and dual training hours.`,
  };
}

// ─── Checkride Readiness ──────────────────────────────────────────────────────

export function computeCheckrideReadiness(stats, requirements, phase) {
  const checks = [];
  let totalWeight = 0;
  let metWeight = 0;

  function chk(key, weight, met, label, detail) {
    totalWeight += weight;
    if (met) metWeight += weight;
    checks.push({ key, met, label, detail });
  }

  // Core hour requirements
  const r = requirements;
  chk('totalTime',     20, r.totalTime.met,           'Total Time',             `${stats.totalTime}h / ${r.totalTime.required}h`);
  chk('dualReceived',  15, r.dualReceived.met,         'Dual Received',          `${stats.dualReceived}h / ${r.dualReceived.required}h`);
  chk('soloTime',      12, r.soloTime.met,             'Solo Time',              `${stats.soloTime}h / ${r.soloTime.required}h`);
  chk('nightHours',     8, r.nightHours.met,           'Night Hours',            `${stats.nightHours}h / ${r.nightHours.required}h`);
  chk('nightLandings',  6, r.nightLandings.met,        'Night Landings',         `${stats.nightLandings} / ${r.nightLandings.required}`);
  chk('nightXC',        5, r.nightXCHours.met,         'Night Cross-Country',    r.nightXCHours.actualLabel || 'See requirement');
  chk('simInstrument',  8, r.simulatedInstrument.met,  'Simulated Instrument',   `${stats.simulatedInstrument}h / ${r.simulatedInstrument.required}h`);
  chk('dualXC',         7, r.dualXC.met,               'Dual Cross-Country',     `${stats.dualXC}h / ${r.dualXC.required}h`);
  chk('soloXC',         9, r.soloXC.met,               'Solo Cross-Country',     `${stats.soloXC}h / ${r.soloXC.required}h`);
  chk('longSoloXC',     5, r.longSoloXC.met,           'Long Solo XC',           stats.hasLongSoloXC ? 'Completed' : 'Not logged');
  chk('soloCtlApt',     3, r.soloControlledAirport.met, 'Solo at Controlled Apt', `${stats.soloControlledAirport} / ${r.soloControlledAirport.required}`);
  chk('dualPrep',       2, r.dualPrepMonths.met,       'Dual Prep (2 months)',   `${stats.dualPrepHours}h recent dual`);

  const score = totalWeight > 0 ? Math.round((metWeight / totalWeight) * 100) : 0;

  const staleWarning = stats.daysSinceLastFlight !== null && stats.daysSinceLastFlight > 60
    ? `No flight activity in ${stats.daysSinceLastFlight} days — dual prep requirement (3h/2 months) may not be met.`
    : null;

  const deficiencies = checks
    .filter(c => !c.met)
    .map(c => `${c.label}: ${c.detail}`);

  return {
    score,
    status: score === 100 ? 'eligible' : score >= 75 ? 'close' : score >= 40 ? 'building' : 'early',
    checks,
    deficiencies,
    staleWarning,
    summary: score === 100
      ? 'All Part 61 ASEL minimums met. Schedule your practical test.'
      : score >= 75
      ? `${deficiencies.length} requirement${deficiencies.length !== 1 ? 's' : ''} remaining before checkride eligibility.`
      : `${deficiencies.length} requirements outstanding. Continue training to reach checkride minimums.`,
  };
}

// ─── Milestone Engine ─────────────────────────────────────────────────────────

export function computeMilestones(stats, requirements, profile, phase) {
  function ms(key, icon, label, status, detail) {
    return { key, icon, label, status, detail };
  }

  const hasPpl = (profile?.certificates || []).some(c =>
    (c.type || '').toLowerCase().includes('private')
  );

  const hasSoloEndorsement = (profile?.endorsements || []).some(e =>
    (e.text || '').toLowerCase().includes('solo')
  );

  // Derive status
  const firstSoloStatus = stats.soloTime > 0 ? 'completed'
    : hasSoloEndorsement ? 'in_progress'
    : stats.dualReceived >= 10 ? 'in_progress'
    : 'upcoming';

  return [
    ms('first_flight',       '✈️',  'First Flight Logged',
      stats.totalFlights > 0 ? 'completed' : 'upcoming',
      stats.totalFlights > 0 ? `${stats.totalFlights} flight${stats.totalFlights !== 1 ? 's' : ''} logged` : 'Log your first flight to begin'
    ),
    ms('dual_training_started', '🎓', 'Dual Training Started',
      stats.dualReceived >= 1 ? 'completed' : 'upcoming',
      stats.dualReceived >= 1 ? `${stats.dualReceived}h dual instruction` : 'Begin lessons with a CFI'
    ),
    ms('first_solo',         '⭐',  'First Solo Flight',
      stats.soloTime > 0 ? 'completed' : firstSoloStatus,
      stats.soloTime > 0 ? `${stats.soloTime}h solo time logged`
        : hasSoloEndorsement ? 'Endorsed — fly your first solo!'
        : stats.dualReceived >= 10 ? `${stats.dualReceived}h dual — instructor evaluating readiness`
        : `${stats.totalTime}h total — building toward solo endorsement`
    ),
    ms('first_xc',           '🗺️',  'First Cross-Country',
      stats.xcTotal > 0 ? 'completed' : stats.soloTime > 0 ? 'in_progress' : 'upcoming',
      stats.xcTotal > 0 ? `${stats.xcTotal}h cross-country logged` : 'XC training begins after solo'
    ),
    ms('first_night_flight', '🌙',  'First Night Flight',
      stats.nightHours > 0 ? 'completed' : 'upcoming',
      stats.nightHours > 0 ? `${stats.nightHours}h night time` : 'Night training typically after solo'
    ),
    ms('night_reqs_met',     '🌟',  'Night Requirements Met',
      (requirements.nightHours.met && requirements.nightLandings.met && requirements.nightXCHours.met)
        ? 'completed' : stats.nightHours > 0 ? 'in_progress' : 'upcoming',
      requirements.nightHours.met && requirements.nightLandings.met && requirements.nightXCHours.met
        ? `3h night, 10 night landings, night XC — all complete`
        : `${stats.nightHours}h / 3h night, ${stats.nightLandings} / 10 landings`
    ),
    ms('long_solo_xc',       '🛫',  'Long Solo XC (≥150 NM)',
      stats.hasLongSoloXC ? 'completed' : stats.soloXC > 0 ? 'in_progress' : 'upcoming',
      stats.hasLongSoloXC ? 'Long solo cross-country complete (§61.109(a)(2)(ii))'
        : stats.soloXC > 0 ? `${stats.soloXC}h solo XC — plan the long XC flight`
        : 'Complete after solo with XC endorsement'
    ),
    ms('hour_minimums_met',  '⏱️',  'FAA Hour Minimums Met',
      requirements.totalTime.met && requirements.dualReceived.met && requirements.soloTime.met
        ? 'completed' : stats.totalTime >= 30 ? 'in_progress' : 'upcoming',
      requirements.totalTime.met ? `${stats.totalTime}h total — 40h requirement satisfied`
        : `${stats.totalTime}h / 40h total`
    ),
    ms('checkride_eligible', '🏆',  'Checkride Eligible',
      phase === 'checkride_eligible' || phase === 'ppl_complete' ? 'completed'
        : phase === 'checkride_preparation' ? 'in_progress' : 'upcoming',
      phase === 'checkride_eligible' || phase === 'ppl_complete'
        ? 'All Part 61 ASEL minimums met'
        : phase === 'checkride_preparation'
        ? 'Most requirements met — final polish phase'
        : 'All Part 61 requirements must be satisfied'
    ),
    ms('ppl_earned',         '🎖️',  'Private Pilot Certificate',
      hasPpl ? 'completed' : phase === 'checkride_eligible' ? 'in_progress' : 'upcoming',
      hasPpl ? 'PPL certificate earned'
        : phase === 'checkride_eligible' ? 'Schedule checkride with a DPE'
        : 'Complete training and checkride to earn PPL'
    ),
  ];
}

// ─── Deficiencies + Completed ─────────────────────────────────────────────────

export function buildDeficiencies(requirements) {
  return Object.values(requirements)
    .filter(r => !r.met)
    .map(r => {
      if (r.unit === 'event') {
        return `${r.label} — not yet completed (${r.regulation})${r.note ? '. ' + r.note : ''}`;
      }
      const u = r.unit === 'landings' ? ` more landing${r.deficit !== 1 ? 's' : ''}` : 'h more';
      return `Need ${r.deficit}${u} of ${r.label} (${r.regulation})`;
    });
}

export function buildCompleted(requirements) {
  return Object.values(requirements)
    .filter(r => r.met)
    .map(r => {
      if (r.unit === 'event') return `${r.label} — complete (${r.actualLabel || 'met'}) ✓`;
      const u = r.unit === 'landings' ? ' landings' : 'h';
      return `${r.label} — ${r.actual}${u} ✓`;
    });
}

// ─── Guidance Cards ───────────────────────────────────────────────────────────

function phaseSummaryCard(stats, phase, requirements) {
  const configs = {
    no_flights: {
      icon: '✈️',
      title: 'Begin Your Training',
      body: 'Log your first lesson to start your Private Pilot journey. The FAA requires 40 total hours including 20 hours of dual instruction.',
      whyItMatters: 'Every PPL begins with a single entry. Your logbook is the legal record that the FAA examiner will review at your practical test.',
      action: 'Schedule your introductory flight lesson',
    },
    discovery: {
      icon: '✈️',
      title: 'Discovery Flight Complete',
      body: `You have ${stats.totalTime}h logged. Your next goal is to establish a regular lesson schedule.`,
      whyItMatters: 'Frequency matters more than length. Consistent lessons build muscle memory faster than occasional long sessions.',
      action: 'Schedule 2 lessons per week to build momentum',
    },
    foundation_training: {
      icon: '🎓',
      title: 'Foundation Training',
      body: `You have ${stats.totalTime}h total with ${stats.dualReceived}h dual instruction. Focus on the four fundamentals: straight-and-level, climbs, turns, and descents.`,
      whyItMatters: 'The FAA requires 40 total hours. Your foundation phase builds the motor skills and habit patterns your examiner will evaluate.',
      action: 'Ask your instructor which fundamentals to focus on in your next lesson',
    },
    dual_training: {
      icon: '🎓',
      title: 'Dual Training Underway',
      body: `You have ${stats.dualReceived}h dual. Your instructor is evaluating your consistency in the traffic pattern and emergency procedures before authorizing solo.`,
      whyItMatters: 'Solo authorization requires your instructor to be satisfied with your traffic pattern, stall recovery, and emergency procedures. Every landing counts.',
      action: 'Focus on making every landing repeatable — ask for feedback after each circuit',
    },
    pre_solo: {
      icon: '🛫',
      title: 'Pre-Solo Preparation',
      body: `You have ${stats.totalTime}h total and ${stats.dualReceived}h dual. Solo is approaching. Your instructor will authorize your first solo when they are satisfied with your readiness.`,
      whyItMatters: 'The FAA requires a pre-solo knowledge test and flight endorsement (§61.87). First solo is the defining moment of student pilot training.',
      action: 'Ask your instructor specifically: "What do I need to demonstrate before solo?"',
    },
    solo_phase: {
      icon: '⭐',
      title: 'Solo Phase',
      body: `First solo complete — ${stats.soloTime}h solo time logged. Continue building solo proficiency and pattern confidence.`,
      whyItMatters: 'You need 10 total solo hours (§61.109(a)(2)). This phase builds the independent judgment that separates student pilots from pilots.',
      action: 'Schedule dedicated solo pattern work to build confidence and consistency',
    },
    cross_country_phase: {
      icon: '🗺️',
      title: 'Cross-Country Phase',
      body: `Solo complete. You have ${stats.soloXC}h of 5h required solo XC and ${stats.dualXC}h of 3h required dual XC.`,
      whyItMatters: 'XC training develops flight planning, navigation, weather evaluation, and fuel planning — exactly what your examiner will test on the checkride.',
      action: 'Plan your next cross-country flight. Coordinate solo XC endorsement with your instructor.',
    },
    night_training: {
      icon: '🌙',
      title: 'Night Training',
      body: `${stats.nightHours}h of 3h required night time. ${stats.nightLandings} of 10 required night landings.`,
      whyItMatters: 'Night requirements (§61.109(a)(1)(ii)) include 3h night, 10 full-stop night landings, and one night XC ≥100 NM. These expand your certificate privileges.',
      action: 'Schedule dedicated night training sessions with your instructor',
    },
    checkride_preparation: {
      icon: '📋',
      title: 'Checkride Preparation',
      body: `Most Part 61 ASEL minimums are nearly met. You are in the final phase before checkride eligibility.`,
      whyItMatters: 'Your examiner will test all ACS areas. Use this phase to polish weak areas, complete any remaining requirements, and build checkride confidence.',
      action: 'Review remaining deficiencies with your instructor and schedule a mock checkride',
    },
    checkride_eligible: {
      icon: '🏆',
      title: 'Checkride Eligible',
      body: 'All FAA Part 61 ASEL hour minimums are met. You are authorized to schedule your practical test with a Designated Pilot Examiner.',
      whyItMatters: "You have satisfied all 14 CFR §61.109(a) requirements. Your final steps are obtaining your instructor's endorsement, passing the knowledge test (if not done), and scheduling your DPE.",
      action: 'Contact your instructor for checkride endorsement and schedule with a local DPE',
    },
    ppl_complete: {
      icon: '🎖️',
      title: 'Private Pilot Certificate Earned',
      body: 'Congratulations. You hold a Private Pilot certificate. Keep your logbook current and maintain FAA currency requirements.',
      whyItMatters: 'Your PPL is a license to learn. Maintain flight review currency (§61.56), medical currency, and 3-landing recency (§61.57) to remain current for passengers.',
      action: 'Log your flights and stay current — consider instrument training as your next step',
    },
    inactive_training: {
      icon: '⚠️',
      title: 'Training Inactive',
      body: `No flights logged in ${stats.daysSinceLastFlight} days. Skills deteriorate without practice — early training requires consistent repetition.`,
      whyItMatters: 'A training gap of 2+ weeks significantly impacts muscle memory in the pattern. Early student pilots benefit most from 2+ flights per week.',
      action: 'Resume lessons as soon as possible — brief your instructor on any skills you feel uncertain about',
    },
  };

  const cfg = configs[phase] || configs.foundation_training;
  return {
    id: 'phase_summary',
    type: 'phase_summary',
    icon: cfg.icon,
    title: cfg.title,
    body: cfg.body,
    whyItMatters: cfg.whyItMatters,
    action: cfg.action,
    actionHref: '/',
    priority: 'high',
  };
}

// Requirement cards: per-requirement guidance for unmet requirements
const REQ_CARD_CONFIG = {
  totalTime: {
    icon: '⏱️', title: 'Build Total Time',
    whyItMatters: '40 total hours are required (§61.109(a)). Total time reflects your overall aviation exposure.',
    action: 'Schedule regular lessons — 2 per week accelerates progress',
  },
  dualReceived: {
    icon: '🎓', title: 'Dual Instruction',
    whyItMatters: '20 hours of dual instruction required (§61.109(a)(1)). Your instructor teaches the techniques your examiner will directly evaluate.',
    action: 'Book your next dual lesson',
  },
  soloTime: {
    icon: '🛩️', title: 'Solo Time',
    whyItMatters: '10 hours solo required (§61.109(a)(2)). Solo time builds the independent judgment that defines pilot-in-command.',
    action: 'Work with your instructor toward your solo endorsement',
  },
  dualXC: {
    icon: '📍', title: 'Dual Cross-Country',
    whyItMatters: '3 hours dual XC required (§61.109(a)(1)(i)). This develops flight planning and navigation skills tested on the checkride.',
    action: 'Schedule a cross-country flight with your instructor',
  },
  nightHours: {
    icon: '🌙', title: 'Night Flight Time',
    whyItMatters: '3 hours night flight required (§61.109(a)(1)(ii)). Night flying develops spatial awareness and expands your certificate privileges.',
    action: 'Schedule a night training session with your instructor',
  },
  nightLandings: {
    icon: '🌙', title: 'Night Full-Stop Landings',
    whyItMatters: '10 full-stop night landings required (§61.109(a)(1)(ii)(A)). Night landings build the depth perception and approach technique for safe night operations.',
    action: 'Practice night landings during your next night flight',
  },
  nightXCHours: {
    icon: '🌙', title: 'Night Cross-Country',
    whyItMatters: 'One night XC of ≥100 NM required (§61.109(a)(1)(ii)(B)). Log night entries with XC time to satisfy this requirement.',
    action: 'Plan a night cross-country flight ≥100 NM with your instructor',
  },
  simulatedInstrument: {
    icon: '🎛️', title: 'Simulated Instrument Training',
    whyItMatters: '3 hours simulated instrument required (§61.109(a)(1)(iii)). Hood time teaches you to trust instruments and survive inadvertent IMC.',
    action: 'Request hood time in your next dual lesson',
  },
  dualPrepMonths: {
    icon: '📅', title: 'Dual Prep (2 Calendar Months)',
    whyItMatters: '3 hours dual instruction within 2 calendar months of your practical test required (§61.109(a)(1)(iv)). This ensures your skills are current before the examiner.',
    action: 'Schedule 3h of dual instruction within 60 days before your checkride',
  },
  soloXC: {
    icon: '🗺️', title: 'Solo Cross-Country',
    whyItMatters: '5 hours solo XC required including one long XC of ≥150 NM (§61.109(a)(2)(ii)). This is your proof of independent navigation capability.',
    action: 'Obtain your solo XC endorsement and plan your first solo XC route',
  },
  longSoloXC: {
    icon: '🛫', title: 'Long Solo XC (≥150 NM)',
    whyItMatters: 'One solo XC of ≥150 NM with full-stop landings at ≥3 different points required (§61.109(a)(2)(ii)). This validates your cross-country navigation skills.',
    action: 'Plan and fly a solo XC of ≥150 NM. Mark the entry with remarks "long XC" to track it.',
  },
  soloControlledAirport: {
    icon: '🏙️', title: 'Solo at Controlled Airport',
    whyItMatters: '3 solo T/Os and full-stop landings at a towered airport required (§61.109(a)(2)(i)). Operating at a controlled airport tests radio communication and ATC compliance.',
    action: 'Plan a solo flight to a towered airport. Add "towered" or "class c" to the entry remarks.',
  },
};

// Which requirements to show cards for, based on phase
function phaseRequirementKeys(phase) {
  switch (phase) {
    case 'no_flights':
    case 'discovery':
    case 'foundation_training':  return ['totalTime', 'dualReceived'];
    case 'dual_training':         return ['totalTime', 'dualReceived', 'soloTime'];
    case 'pre_solo':              return ['soloTime', 'dualReceived', 'totalTime'];
    case 'solo_phase':            return ['soloTime', 'soloXC', 'totalTime', 'dualReceived'];
    case 'cross_country_phase':   return ['soloXC', 'longSoloXC', 'dualXC', 'nightHours', 'nightLandings', 'totalTime'];
    case 'night_training':        return ['nightHours', 'nightLandings', 'nightXCHours', 'simulatedInstrument', 'soloXC', 'longSoloXC'];
    case 'checkride_preparation': return Object.keys(REQ_CARD_CONFIG);
    case 'checkride_eligible':    return [];
    case 'ppl_complete':          return [];
    default:                      return ['totalTime', 'dualReceived'];
  }
}

export function buildGuidanceCards(stats, requirements, phase, profile) {
  const cards = [];

  // 1. Phase summary card
  cards.push(phaseSummaryCard(stats, phase, requirements));

  // 2. Missing profile
  const profileName = profile && ((profile.pilot && profile.pilot.fullName) || profile.name);
  if (!profileName && phase !== 'no_flights') {
    cards.push({
      id: 'profile_missing',
      type: 'missing_profile',
      icon: '👤',
      title: 'Pilot Profile Incomplete',
      body: 'Your profile has no name or certificate information.',
      whyItMatters: 'Your profile stores certificates, medical, and endorsements — required for the Aircraft Record Report and verified progression.',
      action: 'Add your pilot profile',
      actionHref: '/profile',
      priority: 'medium',
    });
  }

  // 3. Landings missing
  if (stats.totalTime > 0 && stats.totalLandings === 0) {
    cards.push({
      id: 'landings_not_logged',
      type: 'next_step',
      icon: '🛬',
      title: 'Landings Not Logged',
      body: 'You have flight time but no landings recorded. Landing counts drive PPL requirements and currency.',
      whyItMatters: 'Night landings (10 required), day currency (3 in 90 days), and solo controlled airport all require landing counts.',
      action: 'Edit your existing flights to add day and night landing counts',
      actionHref: '/',
      priority: 'medium',
    });
  }

  // 4. Phase-appropriate requirement cards
  const keys = phaseRequirementKeys(phase);
  for (const key of keys) {
    const r = requirements[key];
    if (!r || r.met) continue;
    const cfg = REQ_CARD_CONFIG[key];
    if (!cfg) continue;

    let body;
    if (r.unit === 'event') {
      body = `${r.actualLabel || 'Not completed'} — ${r.note || 'See requirement.'}`;
    } else {
      const u = r.unit === 'landings' ? ' landings' : 'h';
      const du = r.unit === 'landings' ? ` more landing${r.deficit !== 1 ? 's' : ''}` : 'h more';
      body = `${r.actual}${u} of ${r.required}${u} required — ${r.deficit}${du} remaining (${r.regulation}).`;
    }

    cards.push({
      id: key,
      type: 'faa_requirement',
      icon: cfg.icon,
      title: cfg.title,
      body,
      whyItMatters: cfg.whyItMatters,
      action: cfg.action,
      actionHref: '/',
      priority: 'medium',
      current: r.actual,
      required: r.required,
      unit: r.unit,
    });
  }

  return cards;
}

// ─── Readiness Scoring ────────────────────────────────────────────────────────

export function computeReadiness(stats, requirements) {
  function score(numerator, denominator) {
    return Math.min(100, Math.round((numerator / denominator) * 100));
  }

  // Solo readiness: based on dual hours, landing count, total time
  const soloScore = score(
    Math.min(stats.dualReceived, 20) * 1.5 +
    Math.min(stats.dayLandings, 20) * 0.5 +
    Math.min(stats.totalTime, 20),
    20 * 1.5 + 20 * 0.5 + 20
  );

  // XC readiness: solo complete, XC started, dual XC
  const xcScore = score(
    (stats.soloTime > 0 ? 30 : 0) +
    Math.min(stats.xcTotal, 5) * 6 +
    Math.min(stats.dualXC, 3) * 4,
    30 + 30 + 12
  );

  // Checkride readiness: mirror computeCheckrideReadiness score
  const metCount = Object.values(requirements).filter(r => r.met).length;
  const totalCount = Object.values(requirements).length;
  const checkrideScore = score(metCount, totalCount);

  function status(s) {
    if (s >= 100) return 'ready';
    if (s >= 70) return 'close';
    if (s > 0) return 'building';
    return 'not_started';
  }

  return {
    soloReadiness: {
      label: 'Solo Readiness',
      score: soloScore,
      status: stats.soloTime > 0 ? 'completed' : status(soloScore),
      detail: stats.soloTime > 0
        ? `Solo complete — ${stats.soloTime}h solo time`
        : `${stats.dualReceived}h dual, ${stats.dayLandings} day landings`,
    },
    xcReadiness: {
      label: 'Cross-Country Readiness',
      score: xcScore,
      status: requirements.soloXC?.met ? 'completed' : status(xcScore),
      detail: stats.soloXC > 0
        ? `${stats.soloXC}h solo XC (5h required)`
        : stats.xcTotal > 0
        ? `${stats.xcTotal}h total XC — solo XC not started`
        : 'Solo required before XC',
    },
    checkrideReadiness: {
      label: 'Checkride Readiness',
      score: checkrideScore,
      status: checkrideScore === 100 ? 'completed' : status(checkrideScore),
      detail: `${metCount} of ${totalCount} Part 61 requirements met`,
    },
  };
}

// ─── Recommendations ──────────────────────────────────────────────────────────

export function buildRecommendations(stats, requirements, phase) {
  const recs = [];

  if (phase === 'no_flights') {
    recs.push('Log your first flight to begin your Private Pilot progression.');
    return recs;
  }

  if (phase === 'inactive_training') {
    recs.push(`Training has been inactive for ${stats.daysSinceLastFlight} days. Resume lessons to maintain progress.`);
    return recs;
  }

  if (phase === 'checkride_eligible') {
    recs.push('All Part 61 ASEL minimums are met — schedule your practical test with a DPE.');
    return recs;
  }

  if (phase === 'ppl_complete') {
    recs.push('PPL earned. Maintain currency and consider your next rating or endorsement.');
    return recs;
  }

  // Unmet requirement-based recommendations (top 3 by weight)
  const unmet = Object.entries(requirements)
    .filter(([, r]) => !r.met)
    .sort(([a], [b]) => (WEIGHTS[b] || 0) - (WEIGHTS[a] || 0))
    .slice(0, 3);

  for (const [key, r] of unmet) {
    if (r.unit === 'event') {
      recs.push(`${r.label} not yet completed — ${r.note || 'coordinate with your instructor.'}`);
    } else {
      const u = r.unit === 'landings' ? ` more landing${r.deficit !== 1 ? 's' : ''}` : 'h more';
      recs.push(`Need ${r.deficit}${u} of ${r.label} (${r.regulation}).`);
    }
  }

  if (recs.length === 0) {
    recs.push(`You have ${stats.totalTime}h logged. Every flight builds your skills — keep the momentum.`);
  }

  return recs;
}

// ─── Main Entry Point ─────────────────────────────────────────────────────────

/**
 * computePplEngine(entries, options)
 *
 * @param {Array}  entries   — raw logbook entry objects
 * @param {Object} options
 *   @param {string} [options.asOf]       — ISO date string (defaults to now)
 *   @param {Object} [options.thresholds] — override Part 61 minimums
 *   @param {Object} [options.profile]    — pilot profile
 *
 * @returns {PplEngineResult}
 */
export function computePplEngine(entries, { asOf, thresholds, profile } = {}) {
  const effectiveAsOf = asOf || new Date().toISOString();
  const effectiveThresholds = { ...PPL_THRESHOLDS, ...thresholds };

  const hasPpl = (profile?.certificates || []).some(c =>
    (c.type || '').toLowerCase().includes('private')
  );

  const stats        = aggregateStats(entries, effectiveAsOf);
  const requirements = evaluateRequirements(stats, effectiveThresholds);
  const phase        = computePhase(stats, requirements, hasPpl);
  const phaseConfig  = PPL_PHASES[phase] || PPL_PHASES.foundation_training;
  const progressPercent = computeProgressPercent(requirements);
  const deficiencies = buildDeficiencies(requirements);
  const completed    = buildCompleted(requirements);
  const milestones   = computeMilestones(stats, requirements, profile, phase);
  const soloEligibility = computeSoloEligibility(stats, profile);
  const checkrideReadiness = computeCheckrideReadiness(stats, requirements, phase);
  const readiness    = computeReadiness(stats, requirements);
  const guidanceCards = buildGuidanceCards(stats, requirements, phase, profile);
  const recommendations = buildRecommendations(stats, requirements, phase);
  const insights     = deficiencies.slice(0, 3);

  return {
    asOf:             effectiveAsOf,
    certificate:      'PPL-ASEL',
    regulation:       '14 CFR Part 61',
    phase,
    phaseLabel:       phaseConfig.label,
    phaseDescription: phaseConfig.description,
    progressPercent,
    stats,
    requirements,
    deficiencies,
    completed,
    milestones,
    soloEligibility,
    checkrideReadiness,
    readiness,
    guidanceCards,
    recommendations,
    insights,
  };
}

// ─── Backward-compatible adapter ──────────────────────────────────────────────
//
// computePplPart61Progress() wraps computePplEngine() and returns the legacy
// shape expected by existing views and routes. This allows drop-in replacement
// of the old pplPart61.mjs engine without touching view code.

const PHASE_TO_PROGRESSION_STATE = {
  no_flights:            'student_pilot',
  discovery:             'student_pilot',
  foundation_training:   'student_pilot',
  dual_training:         'student_pilot',
  pre_solo:              'solo_ready',
  solo_phase:            'solo_complete',
  cross_country_phase:   'xc_ready',
  night_training:        'xc_ready',
  checkride_preparation: 'checkride_ready',
  checkride_eligible:    'checkride_ready',
  ppl_complete:          'private_pilot',
  inactive_training:     'student_pilot',
};

export function computePplPart61Progress(entries, { asOf, thresholds, profile } = {}) {
  const eng = computePplEngine(entries, { asOf, thresholds, profile });
  const progressionState = PHASE_TO_PROGRESSION_STATE[eng.phase] || 'student_pilot';

  // Build view-compatible readiness map (key-indexed flat object)
  const readinessMap = {};
  for (const [key, r] of Object.entries(eng.requirements)) {
    const status = r.met ? 'completed' : r.pct >= 75 ? 'close' : r.pct >= 25 ? 'in_progress' : 'not_started';
    const u = r.unit === 'landings' ? ' landings' : (r.unit === 'event' ? '' : 'h');
    readinessMap[key] = {
      key,
      label: r.label,
      score: r.pct,
      status,
      detail: r.met
        ? `${r.actual}${u} — requirement met ✓`
        : r.unit === 'event'
        ? (r.note || r.label + ' not completed')
        : `${r.actual}${u} of ${r.required}${u} required`,
    };
  }

  // View stats
  const viewStats = {
    totalHours:          eng.stats.totalTime,
    picHours:            eng.stats.pic,
    xcHours:             parseFloat((eng.stats.dualXC + eng.stats.soloXC).toFixed(1)),
    nightHours:          eng.stats.nightHours,
    dualReceived:        eng.stats.dualReceived,
    soloHours:           eng.stats.soloTime,
    instrumentHours:     parseFloat((eng.stats.simulatedInstrument + eng.stats.actualInstrument).toFixed(1)),
    totalDayLandings:    eng.stats.dayLandings,
    totalNightLandings:  eng.stats.nightLandings,
    totalFlights:        eng.stats.totalFlights,
  };

  const completedMilestones = eng.milestones.filter(m => m.status === 'completed').length;
  const progressPct = Math.round((completedMilestones / eng.milestones.length) * 100);

  return {
    asOf:             eng.asOf,
    phase:            eng.phase,
    progressPercent:  eng.progressPercent,
    requirements:     eng.requirements,
    deficiencies:     eng.deficiencies,
    completed:        eng.completed,
    endorsements:     {}, // placeholder — not removed for backward compat
    // View-compatible
    progressionState,
    label:            eng.phaseLabel,
    description:      eng.phaseDescription,
    progressPct,
    stats:            viewStats,
    readiness:        readinessMap,
    milestones:       eng.milestones,
    guidanceCards:    eng.guidanceCards,
    recommendations:  eng.recommendations,
  };
}

// Also export aggregateFlightStats as alias for backward compat
export { aggregateStats as aggregateFlightStats };

// Export DEFAULT_PPL_THRESHOLDS for backward compat
export { PPL_THRESHOLDS as DEFAULT_PPL_THRESHOLDS };

// computePplRequirements — backward compat alias
export function computePplRequirements(entries, options) {
  const eng = computePplEngine(entries, options);
  return {
    asOf:            eng.asOf,
    certificate:     eng.certificate,
    regulation:      eng.regulation,
    phase:           eng.phase,
    progressPercent: eng.progressPercent,
    stats:           eng.stats,
    requirements:    eng.requirements,
    deficiencies:    eng.deficiencies,
    completed:       eng.completed,
    endorsements:    {},
  };
}
