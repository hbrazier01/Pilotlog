/**
 * pplPart61.mjs
 *
 * FAA Part 61 ASEL Private Pilot Requirements Engine.
 *
 * Pure computation — no I/O, no side effects.
 *
 * Entry point: computePplRequirements(entries, options)
 *
 * Returns:
 *   {
 *     phase:           "foundation" | "pre_solo" | "solo_ready" | "xc_phase" | "checkride_ready",
 *     progressPercent: number (0–100, weighted across all requirements),
 *     requirements:    Record<string, RequirementResult>,
 *     deficiencies:    string[],
 *     completed:       string[],
 *     endorsements:    EndorsementPlaceholders,
 *   }
 *
 * Extensible via the `thresholds` option — pass custom values to support
 * Part 141, instrument, commercial, or accelerated programs in the future.
 */

// ─── Default Part 61 ASEL Thresholds ─────────────────────────────────────────

export const DEFAULT_PPL_THRESHOLDS = {
  totalTime:         40,   // §61.109(a) — total flight time
  dualReceived:      20,   // §61.109(a)(1) — dual instruction
  soloTime:          10,   // §61.109(a)(2) — solo flight time
  dualXC:             3,   // §61.109(a)(1)(i) — dual cross-country
  soloXC:             5,   // §61.109(a)(2)(ii) — solo cross-country
  nightHours:         3,   // §61.109(a)(1)(ii) — night flight time
  nightLandings:     10,   // §61.109(a)(1)(ii)(A) — night full-stop landings
  simulatedInstrument: 3,  // §61.109(a)(1)(iii) — instrument flight training
  recentTrainingMonths: 2, // §61.109(a) — training within preceding 2 calendar months
};

// Requirement weights for overall progress calculation.
// Weights reflect relative difficulty / hour volume.
const REQUIREMENT_WEIGHTS = {
  totalTime:           25,
  dualReceived:        20,
  soloTime:            15,
  dualXC:               8,
  soloXC:              10,
  nightHours:           8,
  nightLandings:        6,
  simulatedInstrument:  8,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function num(v) { return Number(v) || 0; }

function sumField(entries, ...fields) {
  return entries.reduce((s, e) => {
    for (const f of fields) s += num(e[f]);
    return s;
  }, 0);
}

function withinCalendarMonths(entries, months, asOf) {
  const asOfDate = new Date(asOf);
  const cutoff = new Date(asOf);
  cutoff.setMonth(cutoff.getMonth() - months);
  return entries.filter(e => {
    const d = new Date(e.date);
    return d >= cutoff && d <= asOfDate;
  });
}

// ─── Aggregate flight stats from raw entries ──────────────────────────────────

export function aggregateFlightStats(entries, asOf) {
  const totalTime          = sumField(entries, 'totalTime', 'total');
  const dualReceived       = sumField(entries, 'dualReceived', 'dual');
  const soloTime           = sumField(entries, 'solo');
  const dualXC             = sumField(entries, 'crossCountry', 'xc');  // dual XC approximated from total XC while dual
  const soloXC             = sumField(entries, 'soloXC');              // explicit solo XC field if tracked
  const nightHours         = sumField(entries, 'night');
  const nightLandings      = sumField(entries, 'nightLandings');
  const simulatedInstrument = sumField(entries, 'simulatedInstrument');
  const actualInstrument   = sumField(entries, 'actualInstrument');
  const totalLandings      = sumField(entries, 'dayLandings') + nightLandings;

  // Dual XC: approximate from cross-country time logged while receiving dual
  // (logbook entries with dualReceived > 0 and crossCountry > 0)
  const dualXCActual = entries.reduce((s, e) => {
    if (num(e.dualReceived || e.dual) > 0 && num(e.crossCountry || e.xc) > 0) {
      return s + num(e.crossCountry || e.xc);
    }
    return s;
  }, 0);

  // Solo XC: if entries track soloXC explicitly use that, otherwise approximate
  // from entries where solo > 0 and crossCountry > 0
  const soloXCActual = soloXC > 0 ? soloXC : entries.reduce((s, e) => {
    if (num(e.solo) > 0 && num(e.crossCountry || e.xc) > 0) {
      return s + num(e.crossCountry || e.xc);
    }
    return s;
  }, 0);

  // Recent training: entries in last 2 calendar months
  const recentEntries = asOf ? withinCalendarMonths(entries, 2, asOf) : entries;
  const recentTrainingHours = sumField(recentEntries, 'dualReceived', 'dual');

  return {
    totalTime:            parseFloat(totalTime.toFixed(1)),
    dualReceived:         parseFloat(dualReceived.toFixed(1)),
    soloTime:             parseFloat(soloTime.toFixed(1)),
    dualXC:               parseFloat(dualXCActual.toFixed(1)),
    soloXC:               parseFloat(soloXCActual.toFixed(1)),
    nightHours:           parseFloat(nightHours.toFixed(1)),
    nightLandings:        Math.round(nightLandings),
    simulatedInstrument:  parseFloat(simulatedInstrument.toFixed(1)),
    actualInstrument:     parseFloat(actualInstrument.toFixed(1)),
    totalLandings:        Math.round(totalLandings),
    recentTrainingHours:  parseFloat(recentTrainingHours.toFixed(1)),
  };
}

// ─── Evaluate each requirement against thresholds ────────────────────────────

/**
 * RequirementResult:
 * {
 *   key:        string,
 *   label:      string,
 *   regulation: string,  (FAR citation)
 *   required:   number,
 *   unit:       "hours" | "landings",
 *   actual:     number,
 *   met:        boolean,
 *   deficit:    number,  (0 if met)
 *   pct:        number,  (0–100)
 * }
 */
export function evaluateRequirements(stats, thresholds) {
  const t = { ...DEFAULT_PPL_THRESHOLDS, ...thresholds };

  function req(key, label, regulation, required, actual, unit = 'hours') {
    const met = actual >= required;
    const deficit = met ? 0 : parseFloat((required - actual).toFixed(1));
    const pct = Math.min(100, Math.round((actual / required) * 100));
    return { key, label, regulation, required, unit, actual, met, deficit, pct };
  }

  return {
    totalTime: req(
      'totalTime',
      'Total Flight Time',
      '14 CFR §61.109(a)',
      t.totalTime,
      stats.totalTime
    ),
    dualReceived: req(
      'dualReceived',
      'Dual Instruction Received',
      '14 CFR §61.109(a)(1)',
      t.dualReceived,
      stats.dualReceived
    ),
    soloTime: req(
      'soloTime',
      'Solo Flight Time',
      '14 CFR §61.109(a)(2)',
      t.soloTime,
      stats.soloTime
    ),
    dualXC: req(
      'dualXC',
      'Dual Cross-Country',
      '14 CFR §61.109(a)(1)(i)',
      t.dualXC,
      stats.dualXC
    ),
    soloXC: req(
      'soloXC',
      'Solo Cross-Country',
      '14 CFR §61.109(a)(2)(ii)',
      t.soloXC,
      stats.soloXC
    ),
    nightHours: req(
      'nightHours',
      'Night Flight Time',
      '14 CFR §61.109(a)(1)(ii)',
      t.nightHours,
      stats.nightHours
    ),
    nightLandings: req(
      'nightLandings',
      'Night Full-Stop Landings',
      '14 CFR §61.109(a)(1)(ii)(A)',
      t.nightLandings,
      stats.nightLandings,
      'landings'
    ),
    simulatedInstrument: req(
      'simulatedInstrument',
      'Simulated Instrument Training',
      '14 CFR §61.109(a)(1)(iii)',
      t.simulatedInstrument,
      stats.simulatedInstrument
    ),
  };
}

// ─── Determine readiness phase ────────────────────────────────────────────────

/**
 * Five progressive phases based on training stage, not just hours.
 *
 * foundation     — minimal flight time, working on basic skills
 * pre_solo       — approaching solo readiness (dual training well underway)
 * solo_ready     — pre-solo minimums approaching, endorsement expected soon
 * xc_phase       — first solo done, building toward solo XC and checkride mins
 * checkride_ready — all Part 61 ASEL minimums met
 */
export function computePhase(stats, requirements, thresholds) {
  const t = { ...DEFAULT_PPL_THRESHOLDS, ...thresholds };

  // All required minimums met → checkride eligible
  const allMet = Object.values(requirements).every(r => r.met);
  if (allMet) return 'checkride_ready';

  // XC phase: solo done, building toward minimums
  if (stats.soloTime >= 1 || stats.totalTime >= 15) {
    // Solo XC started or all core solo hours building
    if (stats.dualXC >= t.dualXC || stats.totalTime >= 25) return 'xc_phase';
  }

  // Solo ready: enough dual time that solo endorsement is approaching
  if (stats.dualReceived >= 10 || stats.totalTime >= 12) return 'solo_ready';

  // Pre-solo: actively in dual training
  if (stats.totalTime >= 3 || stats.dualReceived >= 2) return 'pre_solo';

  // Foundation: early stage, few hours
  return 'foundation';
}

// ─── Compute weighted progress percent ───────────────────────────────────────

export function computeProgressPercent(requirements) {
  const totalWeight = Object.values(REQUIREMENT_WEIGHTS).reduce((s, w) => s + w, 0);
  let weighted = 0;
  for (const [key, weight] of Object.entries(REQUIREMENT_WEIGHTS)) {
    const req = requirements[key];
    if (req) weighted += (req.pct / 100) * weight;
  }
  return Math.round((weighted / totalWeight) * 100);
}

// ─── Build human-readable deficiencies and completed lists ───────────────────

export function buildDeficiencies(requirements) {
  const deficiencies = [];
  for (const r of Object.values(requirements)) {
    if (!r.met) {
      const unit = r.unit === 'landings'
        ? `${r.deficit} more landing${r.deficit !== 1 ? 's' : ''}`
        : `${r.deficit}h more`;
      deficiencies.push(`Need ${unit} of ${r.label} (${r.regulation})`);
    }
  }
  return deficiencies;
}

export function buildCompleted(requirements) {
  return Object.values(requirements)
    .filter(r => r.met)
    .map(r => `${r.label} — ${r.actual}${r.unit === 'landings' ? ' landings' : 'h'} ✓`);
}

// ─── Endorsement placeholder structure ───────────────────────────────────────
//
// Not yet implemented. Placeholder architecture for future extension.
// When implemented, these will gate phase advancement and checkride eligibility.

export function buildEndorsementPlaceholders(stats) {
  return {
    preSoloKnowledgeTest: {
      key: 'preSoloKnowledgeTest',
      label: 'Pre-Solo Knowledge Test',
      regulation: '14 CFR §61.87(b)',
      required: true,
      obtained: false,       // TODO: derive from profile.endorsements
      placeholder: true,
    },
    preSoloEndorsement: {
      key: 'preSoloEndorsement',
      label: 'Pre-Solo Flight Endorsement',
      regulation: '14 CFR §61.87(c)–(n)',
      required: true,
      obtained: false,       // TODO: derive from profile.endorsements
      placeholder: true,
    },
    soloXCEndorsement: {
      key: 'soloXCEndorsement',
      label: 'Solo Cross-Country Endorsement',
      regulation: '14 CFR §61.93(c)',
      required: true,
      obtained: false,       // TODO: derive from profile.endorsements
      placeholder: true,
    },
    checkridEndorsement: {
      key: 'checkrideEndorsement',
      label: 'Checkride (Practical Test) Endorsement',
      regulation: '14 CFR §61.39 / §61.107',
      required: true,
      obtained: false,       // TODO: derive from profile.endorsements
      placeholder: true,
    },
  };
}

// ─── Main Entry Point ─────────────────────────────────────────────────────────

/**
 * computePplRequirements(entries, options)
 *
 * @param {Array}  entries   — raw logbook entry objects
 * @param {Object} options
 *   @param {string} [options.asOf]       — ISO date string (defaults to now)
 *   @param {Object} [options.thresholds] — override default Part 61 minimums
 *
 * @returns {PplRequirementsResult}
 */
export function computePplRequirements(entries, { asOf, thresholds } = {}) {
  const effectiveAsOf = asOf || new Date().toISOString();
  const effectiveThresholds = { ...DEFAULT_PPL_THRESHOLDS, ...thresholds };

  const stats        = aggregateFlightStats(entries, effectiveAsOf);
  const requirements = evaluateRequirements(stats, effectiveThresholds);
  const phase        = computePhase(stats, requirements, effectiveThresholds);
  const progressPercent = computeProgressPercent(requirements);
  const deficiencies = buildDeficiencies(requirements);
  const completed    = buildCompleted(requirements);
  const endorsements = buildEndorsementPlaceholders(stats);

  return {
    asOf: effectiveAsOf,
    certificate: 'PPL-ASEL',
    regulation: '14 CFR Part 61',
    phase,
    progressPercent,
    stats,
    requirements,
    deficiencies,
    completed,
    endorsements,
  };
}

// ─── View-compatible adapter ───────────────────────────────────────────────────
//
// computePplPart61Progress() wraps computePplRequirements() and returns the
// shape expected by buildPilotState(), /progression, and all view routes.
// This is the single authoritative source for all progression UI.

const PHASE_CONFIG = {
  foundation:       { progressionState: 'student_pilot',   label: 'Foundation Training',   description: 'Building fundamental flight skills with an instructor.' },
  pre_solo:         { progressionState: 'student_pilot',   label: 'Pre-Solo Training',     description: 'Working toward solo endorsement — dual training underway.' },
  solo_ready:       { progressionState: 'solo_ready',      label: 'Pre-Solo',              description: 'Approaching solo endorsement. Coordinate with your instructor.' },
  xc_phase:         { progressionState: 'xc_ready',        label: 'Cross-Country Phase',   description: 'Solo complete. Building toward XC and checkride minimums.' },
  checkride_ready:  { progressionState: 'checkride_ready', label: 'Checkride Ready',       description: 'All Part 61 ASEL minimums met. Schedule your practical test.' },
};

function buildViewStats(faaStats, entries) {
  const picHours = entries.reduce((s, e) => s + Number(e.pic || 0), 0);
  const dayLandings = entries.reduce((s, e) => s + Number(e.dayLandings || 0), 0);
  return {
    totalHours:        faaStats.totalTime,
    picHours:          parseFloat(picHours.toFixed(1)),
    xcHours:           parseFloat((faaStats.dualXC + faaStats.soloXC).toFixed(1)),
    nightHours:        faaStats.nightHours,
    dualReceived:      faaStats.dualReceived,
    soloHours:         faaStats.soloTime,
    instrumentHours:   parseFloat((faaStats.simulatedInstrument + faaStats.actualInstrument).toFixed(1)),
    totalDayLandings:  Math.round(dayLandings),
    totalNightLandings: faaStats.nightLandings,
    totalFlights:      entries.length,
  };
}

// Keys excluded from the visible readiness scores panel (requirement engine still tracks them)
const VIEW_READINESS_HIDDEN = new Set(['dualXC']);

function buildViewReadiness(requirements) {
  const readiness = {};
  for (const [key, r] of Object.entries(requirements)) {
    if (VIEW_READINESS_HIDDEN.has(key)) continue;
    const status = r.met ? 'completed' : r.pct >= 75 ? 'close' : r.pct >= 25 ? 'in_progress' : 'not_started';
    readiness[key] = {
      key,
      label:  r.label,
      score:  r.pct,
      status,
      detail: r.met
        ? `${r.actual}${r.unit === 'landings' ? ' landings' : 'h'} — requirement met ✓`
        : `${r.actual}${r.unit === 'landings' ? ' landings' : 'h'} of ${r.required}${r.unit === 'landings' ? ' landings' : 'h'} required (need ${r.deficit} more)`,
    };
  }
  return readiness;
}

function buildViewMilestones(stats, phase) {
  const milestones = [
    {
      key:    'first_flight',
      icon:   '✈️',
      label:  'First Flight Logged',
      status: stats.totalTime > 0 ? 'completed' : 'not_started',
      detail: stats.totalTime > 0 ? `${stats.totalTime}h total time logged` : 'Log your first flight to begin',
    },
    {
      key:    'dual_progress',
      icon:   '🎓',
      label:  'Dual Training Underway',
      status: stats.dualReceived >= 5 ? 'completed' : stats.dualReceived > 0 ? 'in_progress' : 'not_started',
      detail: `${stats.dualReceived}h dual received (20h required for PPL)`,
    },
    {
      key:    'pre_solo_eligible',
      icon:   '🛫',
      label:  'Pre-Solo Eligible',
      status: (phase === 'solo_ready' || phase === 'xc_phase' || phase === 'checkride_ready') ? 'completed'
            : stats.dualReceived >= 5 ? 'in_progress' : 'not_started',
      detail: 'Requires ~10h dual and instructor sign-off',
    },
    {
      key:    'first_solo',
      icon:   '⭐',
      label:  'First Solo',
      status: stats.soloTime > 0 ? 'completed' : 'not_started',
      detail: stats.soloTime > 0 ? `${stats.soloTime}h solo time logged` : 'Complete pre-solo requirements with your instructor',
    },
    {
      key:    'solo_xc',
      icon:   '🌐',
      label:  'Solo Cross-Country',
      status: stats.soloXC >= 5 ? 'completed' : stats.soloXC > 0 ? 'in_progress' : 'not_started',
      detail: `${stats.soloXC}h of 5h required solo XC (§61.109(a)(2)(ii))`,
    },
    {
      key:    'night_training',
      icon:   '🌙',
      label:  'Night Training',
      status: stats.nightHours >= 3 ? 'completed' : stats.nightHours > 0 ? 'in_progress' : 'not_started',
      detail: `${stats.nightHours}h of 3h required night time (§61.109(a)(1)(ii))`,
    },
    {
      key:    'instrument_training',
      icon:   '🎛️',
      label:  'Instrument Training',
      status: stats.simulatedInstrument >= 3 ? 'completed' : stats.simulatedInstrument > 0 ? 'in_progress' : 'not_started',
      detail: `${stats.simulatedInstrument}h of 3h required simulated instrument (§61.109(a)(1)(iii))`,
    },
    {
      key:    'checkride_eligible',
      icon:   '🏆',
      label:  'Checkride Eligible',
      status: phase === 'checkride_ready' ? 'completed' : 'not_started',
      detail: 'All Part 61 ASEL minimums met — practical test authorized',
    },
  ];
  return milestones;
}

function buildViewGuidanceCards(deficiencies, phase) {
  if (deficiencies.length === 0) {
    return [{
      icon: '✅',
      title: 'All Minimums Met',
      body: 'You have satisfied all FAA Part 61 ASEL requirements. Schedule your practical test.',
      action: 'Contact your CFII to obtain checkride endorsement',
      priority: 'high',
    }];
  }
  return deficiencies.slice(0, 4).map(d => ({
    icon: '📋',
    title: 'FAA Requirement',
    body: d,
    action: 'Log flights to satisfy this requirement',
    priority: 'medium',
  }));
}

/**
 * computePplPart61Progress(entries, options)
 *
 * Single authoritative source for all progression UI.
 * Returns shape compatible with buildPilotState() and all view routes.
 */
export function computePplPart61Progress(entries, { asOf, thresholds } = {}) {
  const faa = computePplRequirements(entries, { asOf, thresholds });
  const cfg = PHASE_CONFIG[faa.phase] || PHASE_CONFIG.foundation;

  const viewStats    = buildViewStats(faa.stats, entries);
  const readiness    = buildViewReadiness(faa.requirements);
  const milestones   = buildViewMilestones(faa.stats, faa.phase);
  const guidanceCards = buildViewGuidanceCards(faa.deficiencies, faa.phase);
  const recommendations = faa.deficiencies.slice(0, 3);

  const completedMilestones = milestones.filter(m => m.status === 'completed').length;
  const progressPct = Math.round((completedMilestones / milestones.length) * 100);

  return {
    asOf:             faa.asOf,
    // FAA engine fields (raw)
    phase:            faa.phase,
    progressPercent:  faa.progressPercent,
    requirements:     faa.requirements,
    deficiencies:     faa.deficiencies,
    completed:        faa.completed,
    endorsements:     faa.endorsements,
    // View-compatible fields
    progressionState: cfg.progressionState,
    label:            cfg.label,
    description:      cfg.description,
    progressPct,
    stats:            viewStats,
    readiness,
    milestones,
    guidanceCards,
    recommendations,
  };
}
