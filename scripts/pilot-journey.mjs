#!/usr/bin/env node
/**
 * pilot-journey.mjs
 * Pilot Journey UX — visual timeline, milestones, what's next, readiness.
 *
 * Usage:
 *   node scripts/pilot-journey.mjs [--view timeline|milestones|whats-next|dashboard]
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import { PROGRESSION_STATES } from "../pilotlog-cli/src/lib/progression-engine.mjs";
import { computeMentorInsights } from "../pilotlog-cli/src/lib/mentor-engine.mjs";
import { buildPilotState } from "./pilot-state.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const asOf    = new Date().toISOString();
const state   = buildPilotState(asOf);

// Aliases for backward-compat with existing render functions
const profile      = state._profile;
const entries      = state._entries;
const attestations = state._attestations;
const prog         = state._prog;
const mentor = computeMentorInsights(profile, entries, attestations, prog, asOf);

// ─── ANSI Colors ──────────────────────────────────────────────────────────────
const C = {
  reset:   "\x1b[0m",
  bold:    "\x1b[1m",
  dim:     "\x1b[2m",
  red:     "\x1b[31m",
  green:   "\x1b[32m",
  yellow:  "\x1b[33m",
  blue:    "\x1b[34m",
  magenta: "\x1b[35m",
  cyan:    "\x1b[36m",
  white:   "\x1b[37m",
  gray:    "\x1b[90m",
  bgBlue:  "\x1b[44m",
  bgGreen: "\x1b[42m",
};

function bold(s)    { return `${C.bold}${s}${C.reset}`; }
function dim(s)     { return `${C.dim}${s}${C.reset}`; }
function green(s)   { return `${C.green}${s}${C.reset}`; }
function yellow(s)  { return `${C.yellow}${s}${C.reset}`; }
function cyan(s)    { return `${C.cyan}${s}${C.reset}`; }
function blue(s)    { return `${C.blue}${s}${C.reset}`; }
function gray(s)    { return `${C.gray}${s}${C.reset}`; }
function red(s)     { return `${C.red}${s}${C.reset}`; }
function magenta(s) { return `${C.magenta}${s}${C.reset}`; }

function bar(pct, width = 24) {
  const filled = Math.round((pct / 100) * width);
  const empty  = width - filled;
  const fill   = filled > 0 ? "\u2588".repeat(filled) : "";
  const space  = empty  > 0 ? "\u2591".repeat(empty)  : "";
  if (pct >= 100) return green(fill);
  if (pct >= 70)  return yellow(fill) + gray(space);
  return cyan(fill) + gray(space);
}

function divider(char = "\u2500", len = 60) {
  return gray(char.repeat(len));
}

function section(title, icon = "") {
  console.log();
  const label = icon ? `${icon}  ${title}` : title;
  console.log(bold(cyan(`  ${label}`)));
  console.log("  " + divider());
}

function num(v) { return Number(v) || 0; }

function daysSinceLastFlight(entries, asOf) {
  if (!entries.length) return null;
  const sorted = [...entries].sort((a, b) => String(b.date).localeCompare(String(a.date)));
  return Math.round((new Date(asOf).getTime() - new Date(sorted[0].date).getTime()) / 86400000);
}

function flightStreakDays(entries, asOf) {
  // Count consecutive days with at least one flight (rolling back from most recent)
  if (!entries.length) return 0;
  const sorted = [...entries].sort((a, b) => String(b.date).localeCompare(String(a.date)));
  const dateSet = new Set(sorted.map(e => String(e.date).slice(0, 10)));
  let streak = 0;
  let check = new Date(asOf);
  for (let i = 0; i < 365; i++) {
    const d = check.toISOString().slice(0, 10);
    if (dateSet.has(d)) {
      streak++;
      check.setDate(check.getDate() - 1);
    } else {
      break;
    }
  }
  return streak;
}

// ─── SHARED: UNLOCK FLOW ──────────────────────────────────────────────────────
// Reusable unlock chain display — shows identity/trust progression steps.

function renderUnlockChain({ compact = false } = {}) {
  const unlockSteps = [
    {
      label:    "Wallet Connected",
      sublabel: state.walletConnected
        ? "Shielded identity active"
        : "Run: pilotlog wallet connect",
      done:     state.walletConnected,
      unlocks:  "Verified Identity",
    },
    {
      label:    "Verified Identity",
      sublabel: state.midname
        ? `${state.midname}${state.midnameVerified ? "  \u2713 verified" : "  (unverified)"}`
        : "Run: pilotlog midname set --midname <handle>",
      done:     !!state.midname,
      unlocks:  "Verified Flights",
    },
    {
      label:    "Verified Flights",
      sublabel: state.verifiedFlights > 0
        ? `${state.verifiedFlights} flight${state.verifiedFlights !== 1 ? "s" : ""} on record`
        : "Log flights to build your verified record",
      done:     state.verifiedFlights > 0,
      unlocks:  "Instructor Verification",
    },
    {
      label:    "Instructor Verification",
      sublabel: state.attestations > 0
        ? `${state.attestations} attestation${state.attestations !== 1 ? "s" : ""} received`
        : "Request instructor attestation: pilotlog attest",
      done:     state.attestations > 0,
      unlocks:  "Pilot Reputation",
    },
  ];

  if (compact) {
    // One-line horizontal chain for banners
    const parts = unlockSteps.map((step, i) => {
      const isNext = !step.done && (i === 0 || unlockSteps[i - 1].done);
      if (step.done)   return green(`\u2713 ${step.label}`);
      if (isNext)      return yellow(`\u25b6 ${step.label}`);
      return gray(`\u25cb ${step.label}`);
    });
    console.log("  " + parts.join(gray("  \u2192  ")));
    return;
  }

  for (let i = 0; i < unlockSteps.length; i++) {
    const step = unlockSteps[i];
    const isNext = !step.done && (i === 0 || unlockSteps[i - 1].done);

    let marker, labelStr, sublabelStr;

    if (step.done) {
      marker      = green("  \u2713");
      labelStr    = green(bold(step.label));
      sublabelStr = gray(`    ${step.sublabel}`);
    } else if (isNext) {
      marker      = yellow(" \u25b6 ");
      labelStr    = bold(yellow(step.label)) + "  " + yellow("\u2190 next step");
      sublabelStr = `    ${step.sublabel}`;
    } else {
      marker      = gray("  \u25cb");
      labelStr    = gray(step.label);
      sublabelStr = gray(`    ${step.sublabel}`);
    }

    console.log(`  ${marker}  ${labelStr}`);
    console.log(`       ${sublabelStr}`);

    if (i < unlockSteps.length - 1) {
      const connectorColor = step.done ? green : gray;
      console.log(`       ${connectorColor("  \u2502")}  ${gray("\u2192 unlocks " + step.unlocks)}`);
    }
  }
}

// ─── VIEW: TIMELINE ───────────────────────────────────────────────────────────

function renderTimeline() {
  const phases = Object.entries(PROGRESSION_STATES).sort((a, b) => a[1].order - b[1].order);
  const currentOrder = PROGRESSION_STATES[prog.progressionState]?.order ?? 0;

  console.log();
  console.log(bold("  \u2708  Pilot Journey Timeline"));
  console.log("  " + divider("\u2550"));
  console.log();

  // ── Identity / Trust Banner ──────────────────────────────────────────────────
  const identityParts = [];
  if (state.midname)     identityParts.push(green(`\u2713 ${state.midname}`));
  else if (state.walletConnected) identityParts.push(yellow("\u25b6 Wallet connected"));
  identityParts.push(cyan(state.trustLevel));
  const nextUnlock = !state.walletConnected ? "Wallet connection"
                   : !state.midname          ? "Verified Identity"
                   : state.verifiedFlights === 0 ? "Verified Flights"
                   : state.attestations === 0    ? "Instructor Verification"
                   : null;
  if (nextUnlock) identityParts.push(yellow(`Next Unlock: ${nextUnlock}`));
  identityParts.push(gray(`${state.milestoneProgress}% milestones`));
  console.log("  " + identityParts.join(gray("  \u00b7  ")));
  console.log();

  for (const [key, config] of phases) {
    const order = config.order;
    const isActive    = key === prog.progressionState;
    const isCompleted = order < currentOrder;

    let marker, label;

    if (isCompleted) {
      marker = green("  \u25cf");
      label  = green(config.label);
    } else if (isActive) {
      marker = yellow(" \u25b6 ");
      label  = bold(yellow(config.label)) + "  " + yellow("\u2190 you are here");
    } else {
      marker = gray("  \u25cb");
      label  = gray(config.label);
    }

    console.log(`${marker}  ${label}`);

    if (isActive) {
      console.log(gray(`        ${config.description}`));
    }

    console.log(gray("     \u2502"));
  }

  console.log();
  console.log(`  ${bold("Overall Progress:")} ${prog.progressPct}%  ${bar(prog.progressPct, 30)}`);

  // ── Trust Progression ─────────────────────────────────────────────────────────
  console.log();
  console.log(bold(cyan("  \u2500\u2500\u2500  Trust Progression  \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500")));
  console.log();

  const trustSteps = [
    { label: "Unverified",          done: true,                          icon: gray("\u25cb") },
    { label: "Connected",           done: state.walletConnected,         icon: state.walletConnected ? green("\u25cf") : gray("\u25cb") },
    { label: "Identity Verified",   done: !!state.midname,               icon: state.midname ? green("\u25cf") : gray("\u25cb") },
    { label: "Progression Verified",done: state.verifiedFlights > 0,     icon: state.verifiedFlights > 0 ? green("\u25cf") : gray("\u25cb") },
    { label: "Trusted Aviator",     done: state.verifiedAttestations > 0, icon: state.verifiedAttestations > 0 ? green("\u25cf") : gray("\u25cb") },
  ];

  for (let i = 0; i < trustSteps.length; i++) {
    const s = trustSteps[i];
    const isNext = !s.done && (i === 0 || trustSteps[i - 1].done);
    const isCurrent = state.trustLevel === s.label;
    const label = s.done
      ? green(`Level ${i} \u2014 ${s.label}`)
      : isNext
        ? bold(yellow(`Level ${i} \u2014 ${s.label}`)) + "  " + yellow("\u2190 next")
        : gray(`Level ${i} \u2014 ${s.label}`);
    console.log(`  ${s.icon}  ${label}`);
    if (i < trustSteps.length - 1) console.log(gray("     \u2502"));
  }

  // Trust events from verified attestations
  if (state.verifiedAttestations > 0 || state.pendingAttestations > 0) {
    console.log();
    console.log(bold(cyan("  \u2500\u2500\u2500  Instructor Trust Events  \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500")));
    console.log();

    if (Array.isArray(attestations)) {
      const sorted = [...attestations].sort((a, b) =>
        String(b.verifiedAt || b.createdAt).localeCompare(String(a.verifiedAt || a.createdAt))
      );
      for (const a of sorted) {
        const date = String(a.verifiedAt || a.createdAt).slice(0, 10);
        const type = String(a.type).replace(/_/g, " ");
        if (a.status === "verified") {
          console.log(`  ${green("\u2713")}  ${bold(green("Flight Verified by Instructor"))}  ${gray(date)}`);
          console.log(gray(`     Training Verified \u00b7 ${type}`));
        } else if (a.status === "pending") {
          console.log(`  ${yellow("\u25b6")}  ${bold(yellow("CFI Review Pending"))}  ${gray(date)}`);
          console.log(gray(`     Verification Submitted \u00b7 Awaiting Instructor Review`));
        }
        console.log();
      }
    }
  }

  console.log();
}

// ─── VIEW: MILESTONES ─────────────────────────────────────────────────────────

function renderMilestones() {
  section("Milestones", "\u{1F3AF}");

  const completed = prog.milestones.filter(m => m.status === "completed");
  const active    = prog.milestones.filter(m => m.status === "in_progress");
  const upcoming  = prog.milestones.filter(m => m.status === "upcoming");

  if (completed.length) {
    console.log();
    console.log(`  ${bold(green("  Achieved"))}`);
    for (const m of completed) {
      console.log(`    ${green("\u2713")} ${m.icon}  ${bold(green(m.label))}`);
      if (m.detail) console.log(gray(`         ${m.detail}`));
    }
  }

  if (active.length) {
    console.log();
    console.log(`  ${bold(yellow("  In Progress"))}`);
    for (const m of active) {
      console.log(`    ${yellow("\u25b6")} ${m.icon}  ${bold(yellow(m.label))}`);
      if (m.detail) console.log(`         ${m.detail}`);
    }
  }

  // Show next 3 upcoming prominently
  if (upcoming.length) {
    const nextMilestone = upcoming[0];
    console.log();
    console.log(`  ${bold(cyan("  Next Milestone"))}`);
    console.log(`    ${cyan("\u25cb")} ${nextMilestone.icon}  ${bold(cyan(nextMilestone.label))}`);
    if (nextMilestone.detail) console.log(gray(`         ${nextMilestone.detail}`));

    if (upcoming.length > 1) {
      console.log();
      console.log(`  ${gray("  On the horizon")}`);
      for (const m of upcoming.slice(1, 4)) {
        console.log(`    ${gray("\u25cb")} ${m.icon}  ${gray(m.label)}`);
      }
      if (upcoming.length > 4) {
        console.log(gray(`    + ${upcoming.length - 4} more ahead`));
      }
    }
  }

  console.log();
  const doneCount = completed.length;
  const total = prog.milestones.length;
  const pct = total > 0 ? Math.round((doneCount / total) * 100) : 0;
  console.log(`  ${doneCount}/${total} milestones  ${bar(pct, 28)}  ${pct}%`);
  console.log();
}

// ─── VIEW: WHAT'S NEXT ────────────────────────────────────────────────────────

function renderWhatsNext() {
  section("What's Next", "\u{1F4CB}");

  if (!prog.guidanceCards.length && !prog.recommendations.length) {
    console.log();
    console.log(`  ${green("You are on track.")} Keep flying and logging.`);
    console.log();
    return;
  }

  if (prog.guidanceCards.length) {
    console.log();
    for (const card of prog.guidanceCards.slice(0, 5)) {
      const priorityColor = card.priority === "critical" ? red :
                            card.priority === "high"     ? yellow : cyan;

      const priorityLabel = card.priority === "critical" ? "[CRITICAL]" :
                            card.priority === "high"     ? "[HIGH]" : "[INFO]";

      console.log(`  ${card.icon}  ${bold(card.title)}  ${priorityColor(priorityLabel)}`);
      console.log(gray(`     ${card.body}`));
      console.log(`     ${cyan("\u2192")} ${card.action}`);
      console.log();
    }
  }

  if (prog.recommendations.length) {
    console.log(`  ${bold("Recommendations")}`);
    for (const rec of prog.recommendations) {
      console.log(`  ${cyan("\u00b7")} ${rec}`);
    }
    console.log();
  }
}

// ─── VIEW: READINESS ──────────────────────────────────────────────────────────

function renderReadiness() {
  section("Readiness", "\u{1F4CA}");
  console.log();

  const readinessItems = Object.values(prog.readiness);
  for (const r of readinessItems) {
    const statusSymbol = r.status === "ready"   ? green("\u25cf") :
                         r.status === "close"   ? yellow("\u25d1") :
                         r.status === "building"? cyan("\u25cb") : gray("\u25cb");

    const scoreLabel = `${r.score}%`.padStart(4);
    console.log(`  ${statusSymbol}  ${r.label.padEnd(28)} ${scoreLabel}  ${bar(r.score, 20)}`);
    if (r.detail) console.log(gray(`       ${r.detail}`));
  }

  console.log();
}

// ─── VIEW: MENTOR ─────────────────────────────────────────────────────────────

function priorityLabel(p) {
  if (p === "critical")    return red("[CRITICAL]");
  if (p === "important")   return yellow("[IMPORTANT]");
  if (p === "milestone")   return cyan("[MILESTONE]");
  if (p === "recommended") return blue("[RECOMMENDED]");
  return gray("[OPTIONAL]");
}

function renderMentor() {
  section("Aviation Mentor", "\u{1F9ED}");

  console.log();
  console.log(`  ${bold("Mentor:")} ${bold(yellow(mentor.summary))}`);
  console.log();

  // Trends
  if (mentor.trends.length) {
    const positiveTrends = mentor.trends.filter(t => t.type === "positive");
    const warningTrends  = mentor.trends.filter(t => t.type === "warning");

    if (positiveTrends.length) {
      console.log(`  ${bold(green("Positive Trends"))}`);
      for (const t of positiveTrends) {
        console.log(`    ${green("\u2191")}  ${bold(t.headline)}`);
        console.log(gray(`       ${t.body}`));
      }
      console.log();
    }

    if (warningTrends.length) {
      console.log(`  ${bold(yellow("Watch"))}`);
      for (const t of warningTrends) {
        console.log(`    ${yellow("\u26a0")}  ${bold(t.headline)}`);
        console.log(gray(`       ${t.body}`));
      }
      console.log();
    }
  }

  if (mentor.insights.length) {
    console.log(`  ${bold("Guidance")}`);
    console.log();
    for (const ins of mentor.insights.slice(0, 7)) {
      console.log(`  ${priorityLabel(ins.priority)}  ${bold(ins.headline)}`);
      console.log(gray(`     ${ins.body}`));
      if (ins.action) console.log(`     ${cyan("\u2192")} ${ins.action}`);
      console.log();
    }
  }

  if (mentor.reinforcements.length) {
    console.log(`  ${bold(green("Wins"))}`);
    for (const r of mentor.reinforcements) {
      console.log(`  ${green("\u2726")}  ${r}`);
    }
    console.log();
  }

  if (!mentor.insights.length && !mentor.trends.length) {
    console.log(`  ${green("No active alerts.")} Keep flying and logging.`);
    console.log();
  }
}

// ─── VIEW: DASHBOARD (redesigned) ─────────────────────────────────────────────

function renderDashboard() {
  const name      = profile?.pilot?.fullName || "Pilot";
  const totalH    = prog.stats.totalHours;
  const phase     = prog.label;
  const sinceLastFlight = daysSinceLastFlight(entries, asOf);

  // ── Header ──────────────────────────────────────────────────────────────────
  console.log();
  console.log(bold(cyan("  \u250f" + "\u2501".repeat(58) + "\u2513")));
  console.log(bold(cyan("  \u2503") + `  \u2708  PilotLog  \u2014  ${name}`.padEnd(58) + cyan("\u2503")));
  console.log(bold(cyan("  \u2517" + "\u2501".repeat(58) + "\u251b")));
  console.log();

  // ── Identity Unlock Flow ─────────────────────────────────────────────────────
  console.log(bold(cyan("  \u2500\u2500\u2500  Identity & Trust  \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500")));
  console.log();
  renderUnlockChain({ compact: true });
  console.log(gray(`  Trust Level: ${bold(state.trustLevel)}`));
  console.log();

  // ── Instructor Trust Card ────────────────────────────────────────────────────
  console.log(bold(cyan("  \u2500\u2500\u2500  Instructor Trust  \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500")));
  console.log();

  if (state.pendingAttestations > 0) {
    console.log(`  ${yellow("\u25b6")}  ${bold(yellow("CFI Review Pending"))}  ${gray("\u2014")}  ${state.pendingAttestations} awaiting instructor review`);
    console.log(gray(`     Verification Submitted \u00b7 Status: Awaiting Instructor Review`));
    console.log();
  }

  if (state.verifiedAttestations > 0) {
    const latest = state.latestVerification;
    const latestDate = latest ? String(latest.verifiedAt || latest.createdAt).slice(0, 10) : "";
    console.log(`  ${green("\u2713")}  ${bold(green("Instructor Verified"))}  ${gray("\u2014")}  ${state.verifiedAttestations} CFI Verified`);
    if (latestDate) console.log(gray(`     Last verified: ${latestDate}`));
    console.log();
    console.log(`  ${cyan("\u25b6")}  ${bold("Trust Level Increased")}  ${gray("\u00b7")}  Reputation Growing`);
    console.log();
  }

  if (state.attestations === 0) {
    const nextUnlock = !state.walletConnected ? "Connect Wallet"
                     : !state.midname          ? "Claim Verified Identity"
                     : state.verifiedFlights === 0 ? "Log Verified Flights"
                     : "Request CFI Review";
    console.log(`  ${gray("\u25cb")}  ${gray("No instructor reviews yet")}  ${gray("\u00b7")}  ${yellow(`Next Trust Unlock: ${nextUnlock}`)}`);
    if (state.verifiedFlights > 0) {
      console.log(gray(`     Run: pilotlog attest request --flight <id>`));
    }
    console.log();
  }

  // ── Pilot Status Card ────────────────────────────────────────────────────────
  console.log(`  ${bold("Phase:")}    ${bold(yellow(phase))}`);
  console.log(`  ${bold("Progress:")} ${prog.progressPct}%  ${bar(prog.progressPct, 32)}  ${gray("toward Private Pilot")}`);
  console.log();

  // Flight stats row
  const statsLine = [
    `${bold(String(prog.stats.totalFlights))} flights`,
    `${bold(totalH.toFixed(1))}h total`,
    `${bold(prog.stats.picHours.toFixed(1))}h PIC`,
    `${bold(prog.stats.xcHours.toFixed(1))}h XC`,
    `${bold(prog.stats.nightHours.toFixed(1))}h night`,
  ].join(gray("  |  "));
  console.log(`  ${statsLine}`);

  // Last flight / momentum
  if (sinceLastFlight === null) {
    console.log();
    console.log(`  ${cyan("\u25b6")} ${bold("Log your first flight to begin your aviation journey.")}`);
  } else if (sinceLastFlight === 0) {
    console.log();
    console.log(`  ${green("\u25cf")} ${bold(green("Flew today"))}  ${gray("\u2014 great momentum")}`);
  } else if (sinceLastFlight <= 7) {
    console.log();
    console.log(`  ${green("\u25cf")} ${bold("Last flight:")} ${sinceLastFlight}d ago  ${gray("\u2014 good consistency")}`);
  } else if (sinceLastFlight <= 21) {
    console.log();
    console.log(`  ${yellow("\u25d1")} ${bold("Last flight:")} ${sinceLastFlight}d ago  ${yellow("\u2014 time to fly again")}`);
  } else {
    console.log();
    console.log(`  ${red("\u25cb")} ${bold("Last flight:")} ${sinceLastFlight}d ago  ${red("\u2014 extended gap \u2014 schedule a flight")}`);
  }

  // ── Today's Priority ─────────────────────────────────────────────────────────
  const topInsight = mentor.insights.find(i => i.priority === "critical") ||
                     mentor.insights.find(i => i.priority === "important");
  const topCard    = prog.guidanceCards?.[0];

  console.log();
  console.log(bold(cyan("  \u2500\u2500\u2500  Today's Priority  \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500")));

  if (topInsight) {
    const isAlert = topInsight.priority === "critical" || topInsight.priority === "important";
    const icon    = topInsight.priority === "critical" ? red("!") : yellow("\u25b6");
    console.log();
    console.log(`  ${icon}  ${bold(topInsight.headline)}`);
    console.log(gray(`     ${topInsight.body}`));
    if (topInsight.action) console.log(`     ${cyan("\u2192")} ${bold(topInsight.action)}`);
  } else if (topCard) {
    console.log();
    console.log(`  ${topCard.icon}  ${bold(topCard.title)}`);
    console.log(gray(`     ${topCard.body}`));
    console.log(`     ${cyan("\u2192")} ${bold(topCard.action)}`);
  } else {
    console.log();
    console.log(`  ${green("\u25cf")}  ${bold("You are on track.")}  Keep flying and logging.`);
  }

  // ── Where You Are ────────────────────────────────────────────────────────────
  console.log();
  console.log(bold(cyan("  \u2500\u2500\u2500  Where You Are  \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500")));
  console.log();

  const phases = Object.entries(PROGRESSION_STATES).sort((a, b) => a[1].order - b[1].order);
  const currentOrder = PROGRESSION_STATES[prog.progressionState]?.order ?? 0;

  // Compact journey: show 2 behind, current, 2 ahead
  const phaseEntries = phases.map(([key, cfg]) => ({ key, ...cfg }));
  const currentIdx = phaseEntries.findIndex(p => p.key === prog.progressionState);
  const showFrom = Math.max(0, currentIdx - 2);
  const showTo   = Math.min(phaseEntries.length, currentIdx + 3);
  const visible  = phaseEntries.slice(showFrom, showTo);

  if (showFrom > 0) console.log(gray(`  ${gray("  \u22ee")}  ${gray("(earlier stages completed)")}`));

  for (const p of visible) {
    const isActive    = p.key === prog.progressionState;
    const isCompleted = p.order < currentOrder;

    if (isCompleted) {
      console.log(`  ${green("  \u2713")}  ${green(p.label)}`);
    } else if (isActive) {
      console.log(`  ${yellow(" \u25b6 ")}  ${bold(yellow(p.label))}  ${yellow("\u2190 you are here")}`);
      console.log(gray(`        ${p.description}`));
    } else {
      console.log(`  ${gray("  \u25cb")}  ${gray(p.label)}`);
    }
  }

  if (showTo < phaseEntries.length) {
    console.log(gray(`       \u22ee  ${gray(`(${phaseEntries.length - showTo} more stages ahead)`)}`));
  }

  // ── Readiness ────────────────────────────────────────────────────────────────
  console.log();
  console.log(bold(cyan("  \u2500\u2500\u2500  Readiness  \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500")));
  console.log();

  const readinessItems = Object.values(prog.readiness);
  for (const r of readinessItems) {
    const statusSymbol = r.status === "ready"   ? green("\u25cf") :
                         r.status === "close"   ? yellow("\u25d1") :
                         r.status === "building"? cyan("\u25cb") : gray("\u25cb");
    const scoreLabel = `${r.score}%`.padStart(4);
    console.log(`  ${statusSymbol}  ${r.label.padEnd(28)} ${scoreLabel}  ${bar(r.score, 18)}`);
  }

  // ── Milestones ───────────────────────────────────────────────────────────────
  console.log();
  console.log(bold(cyan("  \u2500\u2500\u2500  Milestones  \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500")));

  const completed = prog.milestones.filter(m => m.status === "completed");
  const upcoming  = prog.milestones.filter(m => m.status !== "completed");
  const nextUp    = upcoming[0];

  if (completed.length) {
    console.log();
    for (const m of completed) {
      console.log(`  ${green("\u2713")} ${m.icon}  ${green(m.label)}`);
    }
  }

  if (nextUp) {
    console.log();
    console.log(`  ${cyan("\u25b6")} ${nextUp.icon}  ${bold(cyan("Next:"))} ${bold(nextUp.label)}`);
    if (nextUp.detail) console.log(gray(`     ${nextUp.detail}`));
  }

  const doneCount = completed.length;
  const totalM = prog.milestones.length;
  const pct = totalM > 0 ? Math.round((doneCount / totalM) * 100) : 0;
  console.log();
  console.log(`  ${doneCount}/${totalM} milestones  ${bar(pct, 26)}  ${pct}%`);

  // ── Mentor Insights (secondary — not duplicating today's priority) ────────────
  const secondaryInsights = mentor.insights.filter(
    i => i !== (mentor.insights.find(x => x.priority === "critical") ||
                mentor.insights.find(x => x.priority === "important"))
  ).slice(0, 3);

  if (secondaryInsights.length || mentor.reinforcements.length) {
    console.log();
    console.log(bold(cyan("  \u2500\u2500\u2500  Mentor Notes  \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500")));
    console.log();

    for (const ins of secondaryInsights) {
      console.log(`  ${priorityLabel(ins.priority)}  ${bold(ins.headline)}`);
      if (ins.action) console.log(gray(`     \u2192 ${ins.action}`));
    }

    if (mentor.reinforcements.length) {
      for (const r of mentor.reinforcements.slice(0, 2)) {
        console.log(`  ${green("\u2726")}  ${r}`);
      }
    }
  }

  // ── Footer ───────────────────────────────────────────────────────────────────
  console.log();
  console.log("  " + divider("\u2550"));
  const dateStr = new Date(asOf).toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
  console.log(gray(`  ${dateStr}`));
  console.log(gray(`  pilotlog dashboard  |  journey  |  milestones  |  whats-next  |  mentor`));
  console.log();
}

// ─── VIEW: PASSPORT ───────────────────────────────────────────────────────────

function renderPassport() {
  const name = profile?.pilot?.fullName || "Pilot";

  console.log();
  console.log(bold(cyan("  \u250f" + "\u2501".repeat(58) + "\u2513")));
  console.log(bold(cyan("  \u2503") + `  \u{1F6E1}  Pilot Passport  \u2014  ${name}`.padEnd(58) + cyan("\u2503")));
  console.log(bold(cyan("  \u2517" + "\u2501".repeat(58) + "\u251b")));
  console.log();

  // ── Identity Unlock Chain ─────────────────────────────────────────────────
  console.log(bold(cyan("  \u2500\u2500\u2500  Identity Unlock Chain  \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500")));
  console.log();
  renderUnlockChain();
  console.log();

  // ── Trust Level ───────────────────────────────────────────────────────────
  console.log(bold(cyan("  \u2500\u2500\u2500  Trust Level  \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500")));
  console.log();

  const level = state.identityLevel;
  const trustColors = [gray, cyan, blue, yellow, green];
  const trustColor  = trustColors[level] || gray;
  const trustBar    = bar(level * 25, 32);

  console.log(`  ${trustColor(bold(state.trustLevel))}`);
  console.log(`  Level ${level}/4  ${trustBar}`);
  console.log();

  // ── Pilot Summary ─────────────────────────────────────────────────────────
  console.log(bold(cyan("  \u2500\u2500\u2500  Pilot Summary  \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500")));
  console.log();

  const cfiVerifiedLabel = state.verifiedAttestations > 0
    ? `${state.verifiedAttestations} CFI Verified${state.pendingAttestations > 0 ? `  (${state.pendingAttestations} pending)` : ""}`
    : state.pendingAttestations > 0
      ? yellow(`${state.pendingAttestations} Awaiting CFI Review`)
      : dim("none yet");

  const rows = [
    ["Verified Identity", state.midname ? `${state.midname}${state.midnameVerified ? "  \u2713" : ""}` : dim("not set")],
    ["Wallet",            state.walletConnected ? green("connected") : dim("not connected")],
    ["Pilot Phase",       state.pilotPhaseLabel || dim("unknown")],
    ["Verified Flights",  String(state.verifiedFlights)],
    ["CFI Verifications", cfiVerifiedLabel],
    ["Milestones",        `${state.milestoneProgress}%`],
  ];

  for (const [label, value] of rows) {
    console.log(`  ${bold(label.padEnd(18))}  ${value}`);
  }

  // ── Instructor Verification Detail ────────────────────────────────────────
  console.log();
  console.log(bold(cyan("  \u2500\u2500\u2500  Instructor Verification  \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500")));
  console.log();

  if (Array.isArray(attestations) && attestations.length > 0) {
    const verified = attestations.filter(a => a.status === "verified");
    const pending  = attestations.filter(a => a.status === "pending");

    if (verified.length) {
      for (const a of verified) {
        const date = String(a.verifiedAt || a.createdAt).slice(0, 10);
        const type = String(a.type).replace(/_/g, " ");
        console.log(`  ${green("\u2713")}  ${bold(green("Flight Verified by Instructor"))}  ${gray("\u2014")}  ${type}  ${gray(date)}`);
        if (a.remarks) console.log(green(`       CFI Approved \u00b7 ${a.remarks}`));
      }
      if (verified.length > 0) {
        console.log();
        console.log(`  ${green("\u2726")}  ${bold(green("Trust Level Increased"))}  ${gray("\u00b7")}  ${bold(state.trustLevel)}`);
        console.log(`     ${bold("Reputation Growing")}  ${gray("\u00b7")}  ${state.verifiedAttestations} instructor review${state.verifiedAttestations !== 1 ? "s" : ""} on record`);
      }
    }

    if (pending.length) {
      console.log();
      for (const a of pending) {
        const date = String(a.createdAt).slice(0, 10);
        const type = String(a.type).replace(/_/g, " ");
        console.log(`  ${yellow("\u25b6")}  ${bold(yellow("Awaiting Instructor Review"))}  ${gray("\u2014")}  ${type}  ${gray(date)}`);
        console.log(gray(`     Verification Submitted \u00b7 CFI Review Pending`));
      }
    }

    console.log();
    console.log(`  ${bold(String(verified.length))} CFI Verified  ${gray("|")}  ${bold(String(pending.length))} Pending Review`);

  } else {
    console.log(gray("  No instructor reviews yet."));
    if (state.verifiedFlights > 0) {
      console.log();
      console.log(`  ${yellow("\u25b6")}  ${bold("Request your first CFI review")}`);
      console.log(gray(`     Run: pilotlog attest request --flight <id>`));
      console.log(gray(`     Your training will be Instructor Reviewed \u2014 Trust Level Increases`));
    } else {
      console.log(gray("  Log flights first, then request instructor verification."));
    }
  }

  console.log();
  console.log("  " + divider("\u2550"));
  const dateStr = new Date(asOf).toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
  console.log(gray(`  ${dateStr}`));
  console.log(gray(`  pilotlog passport  |  dashboard  |  journey  |  milestones  |  mentor`));
  console.log();
}

// ─── Dispatch ─────────────────────────────────────────────────────────────────

const viewArg = process.argv.find(a => a === "--view");
const viewIdx = process.argv.indexOf("--view");
const view    = viewIdx !== -1 ? process.argv[viewIdx + 1] : (process.argv[2] || "dashboard");

switch (view) {
  case "timeline":   renderTimeline();   break;
  case "milestones": renderMilestones(); break;
  case "whats-next": renderWhatsNext();  break;
  case "readiness":  renderReadiness();  break;
  case "mentor":     renderMentor();     break;
  case "passport":   renderPassport();   break;
  default:           renderDashboard();  break;
}
