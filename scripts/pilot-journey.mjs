#!/usr/bin/env node
/**
 * pilot-journey.mjs
 * Pilot Journey UX — visual timeline, milestones, what's next, readiness.
 *
 * Usage:
 *   node scripts/pilot-journey.mjs [--view timeline|milestones|whats-next|dashboard]
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { computeProgression, PROGRESSION_STATES } from "../pilotlog-cli/src/lib/progression-engine.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.PILOTLOG_HOME || path.join(__dirname, "../data");

function readJSON(filePath, fallback) {
  try { return JSON.parse(fs.readFileSync(filePath, "utf-8")); } catch { return fallback; }
}

const profile      = readJSON(path.join(DATA_DIR, "profile.json"), {});
const entries      = readJSON(path.join(DATA_DIR, "entries.json"), []);
const attestations = readJSON(path.join(DATA_DIR, "attestations.json"), []);

const asOf = new Date().toISOString();
const prog = computeProgression(profile, entries, attestations, asOf);

// ─── ANSI Colors ──────────────────────────────────────────────────────────────
const C = {
  reset:   "\x1b[0m",
  bold:    "\x1b[1m",
  dim:     "\x1b[2m",
  green:   "\x1b[32m",
  yellow:  "\x1b[33m",
  blue:    "\x1b[34m",
  cyan:    "\x1b[36m",
  white:   "\x1b[37m",
  gray:    "\x1b[90m",
  bgBlue:  "\x1b[44m",
  bgGreen: "\x1b[42m",
};

function bold(s)   { return `${C.bold}${s}${C.reset}`; }
function dim(s)    { return `${C.dim}${s}${C.reset}`; }
function green(s)  { return `${C.green}${s}${C.reset}`; }
function yellow(s) { return `${C.yellow}${s}${C.reset}`; }
function cyan(s)   { return `${C.cyan}${s}${C.reset}`; }
function blue(s)   { return `${C.blue}${s}${C.reset}`; }
function gray(s)   { return `${C.gray}${s}${C.reset}`; }

function bar(pct, width = 24) {
  const filled = Math.round((pct / 100) * width);
  const empty  = width - filled;
  const fill   = filled > 0 ? "█".repeat(filled) : "";
  const space  = empty  > 0 ? "░".repeat(empty)  : "";
  if (pct >= 100) return green(fill);
  if (pct >= 70)  return yellow(fill) + gray(space);
  return cyan(fill) + gray(space);
}

function divider(char = "─", len = 60) {
  return gray(char.repeat(len));
}

function section(title) {
  console.log();
  console.log(bold(cyan("  " + title)));
  console.log("  " + divider());
}

// ─── VIEW: TIMELINE ───────────────────────────────────────────────────────────

function renderTimeline() {
  const phases = Object.entries(PROGRESSION_STATES).sort((a, b) => a[1].order - b[1].order);
  const currentOrder = PROGRESSION_STATES[prog.progressionState]?.order ?? 0;

  console.log();
  console.log(bold("  ✈  Pilot Journey Timeline"));
  console.log("  " + divider("═"));
  console.log();

  for (const [key, config] of phases) {
    const order = config.order;
    const isActive    = key === prog.progressionState;
    const isCompleted = order < currentOrder;
    const isUpcoming  = order > currentOrder;

    let marker, label;

    if (isCompleted) {
      marker = green("  ●");
      label  = green(config.label);
    } else if (isActive) {
      marker = yellow(" ▶ ");
      label  = bold(yellow(config.label)) + " " + yellow("← you are here");
    } else {
      marker = gray("  ○");
      label  = gray(config.label);
    }

    console.log(`${marker}  ${label}`);

    if (isActive) {
      console.log(gray(`        ${config.description}`));
    }

    if (!isCompleted && !isActive) {
      // connector
      console.log(gray("     │"));
    } else {
      console.log(gray("     │"));
    }
  }

  console.log();
  console.log(`  ${bold("Overall Progress:")} ${prog.progressPct}%  ${bar(prog.progressPct, 30)}`);
  console.log();
}

// ─── VIEW: MILESTONES ─────────────────────────────────────────────────────────

function renderMilestones() {
  section("Milestones");

  const completed  = prog.milestones.filter(m => m.status === "completed");
  const active     = prog.milestones.filter(m => m.status === "in_progress");
  const upcoming   = prog.milestones.filter(m => m.status === "upcoming");

  if (completed.length) {
    console.log();
    console.log(`  ${bold(green("Achieved"))}`);
    for (const m of completed) {
      console.log(`    ${green("✓")} ${m.icon}  ${green(m.label)}`);
      if (m.detail) console.log(gray(`         ${m.detail}`));
    }
  }

  if (active.length) {
    console.log();
    console.log(`  ${bold(yellow("In Progress"))}`);
    for (const m of active) {
      console.log(`    ${yellow("▶")} ${m.icon}  ${bold(yellow(m.label))}`);
      if (m.detail) console.log(`         ${m.detail}`);
    }
  }

  if (upcoming.length) {
    console.log();
    console.log(`  ${bold(gray("Upcoming"))}`);
    for (const m of upcoming) {
      console.log(`    ${gray("○")} ${m.icon}  ${gray(m.label)}`);
    }
  }

  console.log();
  const doneCount = completed.length;
  const total = prog.milestones.length;
  console.log(`  ${doneCount}/${total} milestones achieved  ${bar((doneCount / total) * 100, 30)}`);
  console.log();
}

// ─── VIEW: WHAT'S NEXT ────────────────────────────────────────────────────────

function renderWhatsNext() {
  section("What's Next");

  if (!prog.guidanceCards.length && !prog.recommendations.length) {
    console.log();
    console.log(`  ${green("You are on track.")} Keep flying and logging.`);
    console.log();
    return;
  }

  if (prog.guidanceCards.length) {
    console.log();
    for (const card of prog.guidanceCards.slice(0, 5)) {
      const priorityColor = card.priority === "critical" ? (s => `\x1b[31m${s}${C.reset}`) :
                            card.priority === "high"     ? yellow : cyan;

      const priorityLabel = card.priority === "critical" ? "[CRITICAL]" :
                            card.priority === "high"     ? "[HIGH]" : "[INFO]";

      console.log(`  ${card.icon}  ${bold(card.title)}  ${priorityColor(priorityLabel)}`);
      console.log(gray(`     ${card.body}`));
      console.log(`     ${cyan("→")} ${card.action}`);
      console.log();
    }
  }

  if (prog.recommendations.length) {
    console.log(`  ${bold("Recommendations")}`);
    for (const rec of prog.recommendations) {
      console.log(`  ${cyan("·")} ${rec}`);
    }
    console.log();
  }
}

// ─── VIEW: READINESS ──────────────────────────────────────────────────────────

function renderReadiness() {
  section("Readiness at a Glance");
  console.log();

  const readinessItems = Object.values(prog.readiness);
  for (const r of readinessItems) {
    const statusSymbol = r.status === "ready"       ? green("●") :
                         r.status === "close"        ? yellow("◑") :
                         r.status === "building"     ? cyan("○") : gray("○");

    const scoreLabel = `${r.score}%`.padStart(4);
    console.log(`  ${statusSymbol}  ${r.label.padEnd(28)} ${scoreLabel}  ${bar(r.score, 20)}`);
    if (r.detail) console.log(gray(`       ${r.detail}`));
  }

  console.log();
}

// ─── VIEW: DASHBOARD (default) ────────────────────────────────────────────────

function renderDashboard() {
  const name = profile?.pilot?.fullName || "Pilot";

  console.log();
  console.log(bold(cyan("  ╔══════════════════════════════════════════════════════════╗")));
  console.log(bold(cyan("  ║") + "  " + bold("PilotLog — Your Aviation Journey") + "                        " + cyan("║")));
  console.log(bold(cyan("  ╚══════════════════════════════════════════════════════════╝")));
  console.log();

  // Pilot summary
  const totalH   = prog.stats.totalHours;
  const phase    = prog.label;
  console.log(`  ${bold("Pilot:")}     ${name}`);
  console.log(`  ${bold("Phase:")}     ${bold(yellow(phase))}`);
  console.log(`  ${bold("Progress:")}  ${prog.progressPct}%  ${bar(prog.progressPct, 30)}`);
  console.log(`  ${bold("Flights:")}   ${prog.stats.totalFlights}  |  ${bold("Total:")} ${totalH}h  |  ${bold("PIC:")} ${prog.stats.picHours}h  |  ${bold("XC:")} ${prog.stats.xcHours}h  |  ${bold("Night:")} ${prog.stats.nightHours}h`);

  renderTimeline();
  renderReadiness();
  renderWhatsNext();
  renderMilestones();

  console.log("  " + divider("═"));
  console.log(gray(`  As of ${new Date(asOf).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}`));
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
  default:           renderDashboard();  break;
}
