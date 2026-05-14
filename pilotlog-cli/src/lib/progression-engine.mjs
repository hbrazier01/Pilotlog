/**
 * pilot-progression-engine.mjs
 *
 * Central Pilot Progression Engine — pure computation, no I/O.
 *
 * Entry point: computeProgression(profile, entries, attestations, asOf)
 *
 * Returns:
 *   - progressionState   (canonical pilot stage)
 *   - milestones         (completed / in_progress / upcoming)
 *   - readiness          (Solo, XC, Checkride, Instrument, Currency)
 *   - guidanceCards      (contextual action cards)
 *   - recommendations    (natural language motivational prompts)
 *   - faaRequirements    (FAA Part 61 ASEL requirements engine output)
 */

import { computePplRequirements, computePplPart61Progress } from './faa/pplPart61.mjs';

// ─── Progression States ────────────────────────────────────────────────────────

export const PROGRESSION_STATES = {
  discovery:           { label: "Discovery",             order: 0,  description: "Exploring aviation for the first time." },
  student_pilot:       { label: "Student Pilot",         order: 1,  description: "Actively training toward first solo." },
  solo_ready:          { label: "Pre-Solo",               order: 2,  description: "Approaching solo endorsement — coordinate with your instructor." },
  solo_complete:       { label: "Solo Complete",         order: 3,  description: "First solo completed — continuing toward PPL." },
  xc_ready:            { label: "Cross-Country Ready",   order: 4,  description: "Eligible for supervised cross-country flights." },
  checkride_ready:     { label: "Checkride Ready",       order: 5,  description: "PPL minimums met — approaching checkride." },
  private_pilot:       { label: "Private Pilot",         order: 6,  description: "PPL certificate held." },
  instrument_training: { label: "Instrument Training",   order: 7,  description: "Building toward instrument rating." },
  instrument_ready:    { label: "Instrument Ready",      order: 8,  description: "IFR minimums approaching — checkride soon." },
  instrument_rated:    { label: "Instrument Rated",      order: 9,  description: "Instrument rating held." },
  commercial_track:    { label: "Commercial Track",      order: 10, description: "Building hours toward CPL." },
  cfi_track:           { label: "CFI Track",             order: 11, description: "Pursuing Certified Flight Instructor certificate." },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function num(v) { return Number(v) || 0; }

function totalHours(entries) {
  return entries.reduce((s, e) => s + num(e.totalTime || e.total), 0);
}

function picHours(entries) {
  return entries.reduce((s, e) => s + num(e.pic), 0);
}

function xcHours(entries) {
  return entries.reduce((s, e) => s + num(e.crossCountry || e.xc), 0);
}

function nightHours(entries) {
  return entries.reduce((s, e) => s + num(e.night), 0);
}

function dualReceived(entries) {
  return entries.reduce((s, e) => s + num(e.dualReceived || e.dual), 0);
}

function soloHours(entries) {
  return entries.reduce((s, e) => s + num(e.solo), 0);
}

function totalDayLandings(entries) {
  return entries.reduce((s, e) => s + num(e.dayLandings), 0);
}

function totalNightLandings(entries) {
  return entries.reduce((s, e) => s + num(e.nightLandings), 0);
}

function instrumentHours(entries) {
  return entries.reduce((s, e) => s + num(e.actualInstrument) + num(e.simulatedInstrument), 0);
}

function approachCount(entries, windowMs, asOf) {
  const cutoff = new Date(asOf).getTime() - windowMs;
  return entries
    .filter(e => new Date(e.date).getTime() >= cutoff)
    .reduce((s, e) => s + num(e.approaches), 0);
}

function hasCert(profile, type) {
  if (!profile) return false;
  // Support both object and array formats
  if (profile.certificates) {
    if (Array.isArray(profile.certificates)) {
      return profile.certificates.some(c => {
        const t = (c.type || '').toLowerCase();
        return t.includes(type.toLowerCase());
      });
    }
    // Legacy object format
    if (type === 'private') return !!profile.certificates.privatePilot;
    if (type === 'student') return !!profile.certificates.studentPilot;
    if (type === 'instrument') return !!profile.certificates.instrumentRating;
    if (type === 'commercial') return !!profile.certificates.commercialPilot;
    if (type === 'cfi') return !!profile.certificates.cfi;
  }
  return false;
}

function hasEndorsement(profile, keyword) {
  if (!profile?.endorsements?.length) return false;
  return profile.endorsements.some(e =>
    (e.text || '').toLowerCase().includes(keyword.toLowerCase())
  );
}

function hasAttestation(attestations, type) {
  if (!Array.isArray(attestations)) return false;
  return attestations.some(a => a.type === type || (a.kind || '').includes(type));
}

// ─── Progression State Computation ────────────────────────────────────────────

export function computeProgressionState(profile, entries, attestations) {
  const total = totalHours(entries);
  const dual = dualReceived(entries);
  const solo = soloHours(entries);
  const xc = xcHours(entries);
  const night = nightHours(entries);
  const instrument = instrumentHours(entries);
  const dayLandings = totalDayLandings(entries);

  const privatePilot = hasCert(profile, 'private');
  const instrumentRated = hasCert(profile, 'instrument');
  const commercial = hasCert(profile, 'commercial');
  const cfi = hasCert(profile, 'cfi');

  const hasSoloEndorsement = hasEndorsement(profile, 'solo');
  const hasFirstSolo = hasSoloEndorsement && solo > 0;

  // CFI track
  if (cfi || hasCert(profile, 'cfi')) return 'cfi_track';

  // Commercial track
  if (commercial) return 'commercial_track';

  // Instrument rated
  if (instrumentRated) return 'instrument_rated';

  // Private pilot
  if (privatePilot) {
    // Instrument training (meaningful IFR time without rating)
    if (instrument >= 10) {
      if (instrument >= 40) return 'instrument_ready';
      return 'instrument_training';
    }
    return 'private_pilot';
  }

  // Pre-PPL progression
  if (total === 0 && !profile?.endorsements?.length) return 'discovery';

  // PPL minimums met — checkride eligible
  if (total >= 40 && dual >= 20 && solo >= 10 && xc >= 3 && night >= 3) {
    return 'checkride_ready';
  }

  // XC solo done — working toward checkride
  if (xc >= 2 && solo > 3) return 'xc_ready';

  // Solo complete
  if (hasFirstSolo || solo > 0) return 'solo_complete';

  // Solo ready (pre-solo requirements nearly met)
  if (total >= 12 && dayLandings >= 8 && dual >= 10) return 'solo_ready';

  // Active student
  if (total > 0 || hasCert(profile, 'student')) return 'student_pilot';

  return 'discovery';
}

// ─── Milestone System ─────────────────────────────────────────────────────────

export function computeMilestones(profile, entries, attestations, asOf) {
  const total = totalHours(entries);
  const solo = soloHours(entries);
  const xc = xcHours(entries);
  const night = nightHours(entries);
  const dual = dualReceived(entries);
  const dayLandings = totalDayLandings(entries);
  const nightLandings = totalNightLandings(entries);
  const instrument = instrumentHours(entries);

  const hasSoloEndorsement = hasEndorsement(profile, 'solo');
  const hasFirstSolo = (hasSoloEndorsement && solo > 0) || solo >= 1;

  const instructorAttestation = hasAttestation(attestations, 'instructor') || hasAttestation(attestations, 'verification');
  const privatePilot = hasCert(profile, 'private');
  const instrumentRated = hasCert(profile, 'instrument');

  function ms(id, label, icon, status, detail) {
    return { id, label, icon, status, detail: detail || null };
  }

  return [
    ms(
      'first_flight',
      'First Flight Logged',
      '✈️',
      entries.length > 0 ? 'completed' : 'upcoming',
      entries.length > 0 ? `${entries.length} flight${entries.length !== 1 ? 's' : ''} in logbook` : 'Log your first flight to begin'
    ),
    ms(
      'student_cert',
      'Student Pilot Certificate',
      '📋',
      hasCert(profile, 'student') ? 'completed' : (total > 0 ? 'in_progress' : 'upcoming'),
      hasCert(profile, 'student') ? 'Student certificate on file' : 'Required before solo flight'
    ),
    ms(
      'solo_ready_milestone',
      'Pre-Solo',
      '🛫',
      hasSoloEndorsement ? 'completed' :
        (total >= 12 && dayLandings >= 8) ? 'in_progress' : 'upcoming',
      hasSoloEndorsement ? 'Solo endorsement received' :
        total >= 12 ? `${dayLandings} landings — working toward endorsement` :
        `${total.toFixed(1)}h / ~15h needed for solo readiness`
    ),
    ms(
      'first_solo',
      'First Solo Flight',
      '🌟',
      hasFirstSolo ? 'completed' :
        (hasSoloEndorsement ? 'in_progress' : 'upcoming'),
      hasFirstSolo ? `Solo time in logbook: ${solo.toFixed(1)}h` :
        hasSoloEndorsement ? 'Endorsed — fly your solo!' :
        'Solo endorsement needed first'
    ),
    ms(
      'first_xc',
      'First Cross Country',
      '🗺️',
      xc >= 1 ? 'completed' :
        (hasFirstSolo ? 'in_progress' : 'upcoming'),
      xc >= 1 ? `${xc.toFixed(1)}h cross-country logged` :
        'Complete first solo before XC training'
    ),
    ms(
      'night_flight',
      'Night Flight Milestone',
      '🌙',
      night >= 3 ? 'completed' :
        (night > 0 ? 'in_progress' : 'upcoming'),
      night >= 3 ? `${night.toFixed(1)}h night time — FAA minimums met` :
        night > 0 ? `${night.toFixed(1)}h night logged — need 3h total` :
        'Night training comes after solo'
    ),
    ms(
      'checkride_eligible',
      'Checkride Eligible',
      '🎯',
      (total >= 40 && dual >= 20 && solo >= 10 && xc >= 3) ? 'completed' :
        (total >= 30 ? 'in_progress' : 'upcoming'),
      (total >= 40 && dual >= 20 && solo >= 10 && xc >= 3) ?
        `All FAA hour minimums met (${total.toFixed(1)}h total)` :
        total >= 30 ? `${total.toFixed(1)}h / 40h — approaching checkride eligibility` :
        'FAA requires 40h total, 20h dual, 10h solo, 3h XC'
    ),
    ms(
      'ppl',
      'Private Pilot Certificate',
      '🏆',
      privatePilot ? 'completed' :
        (total >= 40 ? 'in_progress' : 'upcoming'),
      privatePilot ? 'PPL certificate earned' :
        total >= 40 ? 'Hours complete — schedule checkride' :
        'Complete PPL training to earn certificate'
    ),
    ms(
      'hours_100',
      '100 Hour Milestone',
      '💯',
      total >= 100 ? 'completed' :
        (total >= 75 ? 'in_progress' : 'upcoming'),
      total >= 100 ? `${total.toFixed(1)}h total — 100h milestone reached` :
        total >= 75 ? `${total.toFixed(1)}h / 100h — almost there!` :
        `${total.toFixed(1)}h logged — working toward 100h`
    ),
    ms(
      'instrument_milestone',
      'Instrument Milestone',
      '🎛️',
      instrument >= 50 ? 'completed' :
        (instrument >= 15 ? 'in_progress' : 'upcoming'),
      instrument >= 50 ? `${instrument.toFixed(1)}h instrument time — strong IFR foundation` :
        instrument > 0 ? `${instrument.toFixed(1)}h instrument time — building IFR skills` :
        'Instrument training begins after PPL'
    ),
    ms(
      'instructor_verification',
      'First Instructor Verification',
      '✅',
      instructorAttestation ? 'completed' : 'upcoming',
      instructorAttestation ? 'Instructor-verified logbook entry on file' :
        'Have your instructor verify a flight entry'
    ),
    ms(
      'instrument_rating',
      'Instrument Rating',
      '🌫️',
      instrumentRated ? 'completed' :
        (instrument >= 40 ? 'in_progress' : 'upcoming'),
      instrumentRated ? 'Instrument rating earned' :
        instrument >= 40 ? `${instrument.toFixed(1)}h instrument — approaching IFR checkride` :
        `${instrument.toFixed(1)}h instrument time logged`
    ),
  ];
}

// ─── Readiness Layer ──────────────────────────────────────────────────────────

export function computeReadinessLayers(profile, entries, asOf) {
  const asOfMs = new Date(asOf).getTime();
  const last90 = entries.filter(e => new Date(e.date).getTime() >= asOfMs - 90 * 86400000);
  const last6mo = entries.filter(e => {
    const d = new Date(asOf);
    d.setMonth(d.getMonth() - 6);
    return new Date(e.date) >= d;
  });

  const total = totalHours(entries);
  const solo = soloHours(entries);
  const xc = xcHours(entries);
  const night = nightHours(entries);
  const dual = dualReceived(entries);
  const dayLandings90 = last90.reduce((s, e) => s + num(e.dayLandings), 0);
  const nightLandings90 = last90.reduce((s, e) => s + num(e.nightLandings), 0);
  const approaches6 = last6mo.reduce((s, e) => s + num(e.approaches), 0);
  const holds6 = last6mo.reduce((s, e) => s + num(e.holds), 0);

  function pct(have, need) { return Math.min(100, Math.round((have / need) * 100)); }

  function readinessStatus(value) {
    if (value >= 100) return 'ready';
    if (value >= 70) return 'close';
    if (value > 0) return 'building';
    return 'not_started';
  }

  const soloScore = pct(
    Math.min(dual, 20) + Math.min(total, 15) + Math.min(totalDayLandings(entries), 10),
    20 + 15 + 10
  );

  const xcScore = pct(
    Math.min(solo, 10) + Math.min(xc * 10, 30) + Math.min(dual, 20),
    10 + 30 + 20
  );

  const checkrideScore = pct(
    (total >= 40 ? 25 : (total / 40) * 25) +
    (dual >= 20 ? 25 : (dual / 20) * 25) +
    (solo >= 10 ? 25 : (solo / 10) * 25) +
    (xc >= 3 ? 25 : (xc / 3) * 25),
    100
  );

  const instrScore = pct(
    Math.min(num(profile?.certificates?.instrumentRating ? 100 : 0), 50) +
    Math.min(approaches6 * 8, 50),
    100
  );

  const currencyScore = pct(
    (dayLandings90 >= 3 ? 34 : (dayLandings90 / 3) * 34) +
    (nightLandings90 >= 3 ? 33 : (nightLandings90 / 3) * 33) +
    (approaches6 >= 6 && holds6 >= 1 ? 33 : 0),
    100
  );

  return {
    soloReadiness: {
      label: 'Solo Readiness',
      score: soloScore,
      status: readinessStatus(soloScore),
      detail: solo > 0 ? `${solo.toFixed(1)}h solo time logged` :
        `${total.toFixed(1)}h total, ${totalDayLandings(entries)} landings`,
    },
    xcReadiness: {
      label: 'Cross-Country Readiness',
      score: xcScore,
      status: readinessStatus(xcScore),
      detail: xc > 0 ? `${xc.toFixed(1)}h cross-country time` : 'Solo required before XC',
    },
    checkrideReadiness: {
      label: 'Checkride Readiness',
      score: checkrideScore,
      status: readinessStatus(checkrideScore),
      detail: `${total.toFixed(1)}h / 40h, ${dual.toFixed(1)}h / 20h dual, ${solo.toFixed(1)}h / 10h solo`,
    },
    instrumentReadiness: {
      label: 'Instrument Readiness',
      score: instrScore,
      status: readinessStatus(instrScore),
      detail: approaches6 > 0 ? `${approaches6} approaches (last 6 months)` : 'No IFR activity logged',
    },
    currencyReadiness: {
      label: 'Currency Readiness',
      score: currencyScore,
      status: readinessStatus(currencyScore),
      detail: `${dayLandings90} day / ${nightLandings90} night landings (90 days)`,
    },
  };
}

// ─── Guidance Card System ─────────────────────────────────────────────────────

export function buildGuidanceCards(progressionState, readiness, entries, profile, asOf) {
  const cards = [];
  const total = totalHours(entries);
  const xc = xcHours(entries);
  const night = nightHours(entries);
  const solo = soloHours(entries);
  const dual = dualReceived(entries);

  const asOfMs = new Date(asOf).getTime();
  const last90 = entries.filter(e => new Date(e.date).getTime() >= asOfMs - 90 * 86400000);
  const last6mo = entries.filter(e => {
    const d = new Date(asOf);
    d.setMonth(d.getMonth() - 6);
    return new Date(e.date) >= d;
  });

  const dayLandings90 = last90.reduce((s, e) => s + num(e.dayLandings), 0);
  const nightLandings90 = last90.reduce((s, e) => s + num(e.nightLandings), 0);
  const approaches6 = last6mo.reduce((s, e) => s + num(e.approaches), 0);
  const holds6 = last6mo.reduce((s, e) => s + num(e.holds), 0);
  const intercepts6 = last6mo.reduce((s, e) => s + num(e.intercepts || 0), 0);

  // Night currency alert
  if (nightLandings90 > 0 && nightLandings90 < 3) {
    cards.push({
      id: 'night_currency_expiring',
      title: 'Night Currency Expiring',
      body: `You have ${nightLandings90} of 3 required night landings in the last 90 days.`,
      action: `Log ${3 - nightLandings90} more night landing${3 - nightLandings90 !== 1 ? 's' : ''} to stay current.`,
      priority: 'high',
      category: 'currency',
      icon: '🌙',
    });
  } else if (nightLandings90 === 0 && night > 0) {
    cards.push({
      id: 'night_currency_lapsed',
      title: 'Night Passenger Currency Lapsed',
      body: 'No night landings in the last 90 days — you cannot carry passengers at night.',
      action: 'Fly 3 full-stop night landings to restore currency.',
      priority: 'critical',
      category: 'currency',
      icon: '🌙',
    });
  }

  // FAA currency alert — day
  if (dayLandings90 > 0 && dayLandings90 < 3) {
    cards.push({
      id: 'day_currency_alert',
      title: 'FAA Currency Alert',
      body: `${dayLandings90} of 3 required landings in the past 90 days.`,
      action: `Fly ${3 - dayLandings90} more landing${3 - dayLandings90 !== 1 ? 's' : ''} before currency lapses.`,
      priority: 'high',
      category: 'currency',
      icon: '⚠️',
    });
  }

  // IFR approaches lagging
  if (approaches6 > 0 && approaches6 < 6) {
    cards.push({
      id: 'instrument_approaches_lagging',
      title: 'Instrument Approaches Lagging',
      body: `${approaches6} of 6 required approaches in the last 6 months.`,
      action: `Log ${6 - approaches6} more approach${6 - approaches6 !== 1 ? 'es' : ''} to stay IFR current.`,
      priority: 'high',
      category: 'ifr',
      icon: '🎛️',
    });
  }

  // XC progress for student
  if (['student_pilot', 'solo_complete'].includes(progressionState) && xc < 3) {
    cards.push({
      id: 'xc_progress',
      title: 'Cross Country Progress',
      body: `${xc.toFixed(1)}h of 3h cross-country time needed for PPL.`,
      action: xc === 0 ? 'Plan your first supervised cross-country flight with your instructor.'
        : `${(3 - xc).toFixed(1)}h more XC time needed — schedule your next XC flight.`,
      priority: 'medium',
      category: 'training',
      icon: '🗺️',
    });
  }

  // Solo XC preparation
  if (progressionState === 'xc_ready') {
    cards.push({
      id: 'solo_xc_prep',
      title: 'Solo XC Preparation',
      body: `You have ${xc.toFixed(1)}h cross-country time. Solo XC is your next major milestone.`,
      action: 'Review your cross-country planning skills and confirm endorsement with your instructor.',
      priority: 'high',
      category: 'training',
      icon: '🛫',
    });
  }

  // Checkride readiness
  if (['checkride_ready', 'xc_ready'].includes(progressionState) && readiness.checkrideReadiness.score >= 80) {
    cards.push({
      id: 'checkride_readiness',
      title: 'Checkride Readiness',
      body: `${total.toFixed(1)}h total time — you are approaching PPL checkride eligibility.`,
      action: 'Review the ACS standards and schedule your checkride with a DPE.',
      priority: 'high',
      category: 'milestone',
      icon: '🎯',
    });
  }

  // Hour building encouragement
  if (['student_pilot', 'solo_ready', 'solo_complete'].includes(progressionState)) {
    const remaining = Math.max(0, 40 - total);
    if (remaining > 0 && remaining <= 15) {
      cards.push({
        id: 'hours_final_push',
        title: `${remaining.toFixed(1)}h to PPL Minimum`,
        body: `You have ${total.toFixed(1)}h — only ${remaining.toFixed(1)}h left to reach the 40-hour FAA minimum.`,
        action: 'Schedule your next training flight to keep momentum.',
        priority: 'medium',
        category: 'training',
        icon: '📈',
      });
    }
  }

  // Instrument training progress
  if (progressionState === 'instrument_training') {
    const instrTotal = instrumentHours(entries);
    if (instrTotal < 40) {
      cards.push({
        id: 'instrument_training_progress',
        title: 'Instrument Training in Progress',
        body: `${instrTotal.toFixed(1)}h instrument time logged — FAA requires 40h for the rating.`,
        action: `Schedule ${Math.ceil((40 - instrTotal) / 2)} more IFR sessions to stay on track.`,
        priority: 'medium',
        category: 'ifr',
        icon: '🌫️',
      });
    }
  }

  // Medical reminder
  const medical = profile?.medical;
  if (medical?.kind === 'Medical' && medical?.expires) {
    const daysLeft = Math.ceil((new Date(medical.expires) - new Date(asOf)) / 86400000);
    if (daysLeft <= 60 && daysLeft > 0) {
      cards.push({
        id: 'medical_expiring',
        title: `Medical Expires in ${daysLeft} Day${daysLeft !== 1 ? 's' : ''}`,
        body: `Your Class ${medical.class} medical certificate expires ${medical.expires}.`,
        action: 'Schedule an AME appointment before it lapses.',
        priority: daysLeft <= 30 ? 'critical' : 'high',
        category: 'currency',
        icon: '🏥',
      });
    }
  }

  // Sort by priority
  const ORDER = { critical: 0, high: 1, medium: 2, low: 3 };
  cards.sort((a, b) => (ORDER[a.priority] ?? 3) - (ORDER[b.priority] ?? 3));

  return cards;
}

// ─── Recommendation Engine ────────────────────────────────────────────────────

export function buildRecommendations(progressionState, entries, profile, readiness, asOf) {
  const recs = [];
  const total = totalHours(entries);
  const xc = xcHours(entries);
  const night = nightHours(entries);
  const solo = soloHours(entries);
  const dual = dualReceived(entries);

  const asOfMs = new Date(asOf).getTime();
  const last90 = entries.filter(e => new Date(e.date).getTime() >= asOfMs - 90 * 86400000);
  const last6mo = entries.filter(e => {
    const d = new Date(asOf);
    d.setMonth(d.getMonth() - 6);
    return new Date(e.date) >= d;
  });

  const nightLandings90 = last90.reduce((s, e) => s + num(e.nightLandings), 0);
  const approaches6 = last6mo.reduce((s, e) => s + num(e.approaches), 0);

  // Night currency
  if (nightLandings90 < 3 && night > 0) {
    const needed = 3 - nightLandings90;
    recs.push(`You are ${needed} night landing${needed !== 1 ? 's' : ''} away from night passenger currency.`);
  }

  // XC lagging
  if (['student_pilot', 'solo_complete', 'xc_ready'].includes(progressionState) && xc < 3) {
    recs.push(`Cross-country time is behind expected PPL progression — ${xc.toFixed(1)}h of 3h needed.`);
  }

  // IFR approaches
  if (['instrument_training', 'instrument_rated'].includes(progressionState) && approaches6 < 6) {
    recs.push(`Instrument approaches below target for IFR readiness — ${approaches6} of 6 in last 6 months.`);
  }

  // Solo approaching
  if (progressionState === 'solo_ready') {
    recs.push(`Solo endorsement likely approaching — you have ${total.toFixed(1)}h and ${totalDayLandings(entries)} landings.`);
  }

  // Hour milestone approaching
  if (total >= 38 && total < 40) {
    recs.push(`You are ${(40 - total).toFixed(1)}h from meeting FAA minimum flight time for PPL — keep it up.`);
  }

  if (total >= 90 && total < 100) {
    recs.push(`Only ${(100 - total).toFixed(0)} more hours to your 100-hour milestone — a major achievement.`);
  }

  // Checkride eligible
  if (progressionState === 'checkride_ready') {
    recs.push(`All FAA hour minimums are met — you are eligible to schedule your PPL checkride.`);
  }

  // General encouragement
  if (recs.length === 0) {
    if (total === 0) {
      recs.push('Log your first flight to begin your pilot progression journey.');
    } else if (progressionState === 'private_pilot' || progressionState === 'instrument_rated') {
      recs.push(`Great work — you have ${total.toFixed(1)} hours logged. Keep flying to build proficiency.`);
    } else {
      recs.push(`You have ${total.toFixed(1)} hours logged. Every flight builds your skills — keep the momentum.`);
    }
  }

  return recs;
}

// ─── Main Entry Point ─────────────────────────────────────────────────────────

/**
 * computeProgression(profile, entries, attestations, asOf)
 *
 * Returns the full pilot progression state, milestones, readiness layers,
 * guidance cards, and recommendations.
 */
export function computeProgression(profile, entries, attestations, asOf) {
  if (!asOf) asOf = new Date().toISOString();

  const progressionState = computeProgressionState(profile, entries, attestations);
  const progressionConfig = PROGRESSION_STATES[progressionState] || PROGRESSION_STATES.discovery;

  const milestones = computeMilestones(profile, entries, attestations, asOf);
  const readiness = computeReadinessLayers(profile, entries, asOf);
  const guidanceCards = buildGuidanceCards(progressionState, readiness, entries, profile, asOf);
  const recommendations = buildRecommendations(progressionState, entries, profile, readiness, asOf);

  // Aggregate stats
  const total = totalHours(entries);
  const stats = {
    totalHours: parseFloat(total.toFixed(1)),
    picHours: parseFloat(picHours(entries).toFixed(1)),
    xcHours: parseFloat(xcHours(entries).toFixed(1)),
    nightHours: parseFloat(nightHours(entries).toFixed(1)),
    dualReceived: parseFloat(dualReceived(entries).toFixed(1)),
    soloHours: parseFloat(soloHours(entries).toFixed(1)),
    totalDayLandings: totalDayLandings(entries),
    totalNightLandings: totalNightLandings(entries),
    instrumentHours: parseFloat(instrumentHours(entries).toFixed(1)),
    totalFlights: entries.length,
  };

  // FAA Part 61 ASEL requirements engine — authoritative progression data.
  // Only applies to pilots who have not yet earned a PPL (or are student pilots).
  const hasPpl = hasCert(profile, 'private');

  if (!hasPpl) {
    // Pre-PPL: delegate milestones, readiness, guidance, and phase to the FAA engine.
    // computePplPart61Progress is the single authoritative source for pre-PPL progression UI.
    const faa = computePplPart61Progress(entries, { asOf });

    return {
      asOf,
      progressionState: faa.progressionState,
      label:            faa.label,
      description:      faa.description,
      progressPct:      faa.progressPct,
      stats,
      milestones:       faa.milestones,
      readiness:        faa.readiness,
      guidanceCards:    faa.guidanceCards,
      recommendations:  faa.recommendations,
      // Raw FAA data available for views that need detailed requirement breakdown
      faaRequirements:  { ...faa, requirements: faa.requirements },
    };
  }

  // Post-PPL: use the legacy milestone/readiness/guidance system.
  const completedMilestones = milestones.filter(m => m.status === 'completed').length;
  const progressPct = milestones.length > 0
    ? Math.round((completedMilestones / milestones.length) * 100)
    : 0;

  return {
    asOf,
    progressionState,
    label: progressionConfig.label,
    description: progressionConfig.description,
    progressPct,
    stats,
    milestones,
    readiness,
    guidanceCards,
    recommendations,
    faaRequirements: null,
  };
}
