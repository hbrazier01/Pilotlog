#!/usr/bin/env node
/**
 * pilot-state.mjs
 * Unified Pilot State Engine — single source of truth for all views.
 *
 * Aggregates:
 *   wallet session  → walletConnected, walletAddress
 *   midname store   → midname, midnameVerified, shieldedIdentity
 *   profile store   → pilotPhase, pilot name
 *   entries store   → verifiedFlights, total stats
 *   attestations    → attestations count
 *   progression     → progressionState, readiness, milestones
 *
 * Trust unlock chain:
 *   Level 0  No wallet, no identity
 *   Level 1  Wallet connected   → identity unlocked
 *   Level 2  Midname set        → reputation layer unlocked
 *   Level 3  Verified flights   → progression verified
 *   Level 4  Attestations       → trust unlocked
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { computeProgression } from "../pilotlog-cli/src/lib/progression-engine.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.PILOTLOG_HOME || path.join(__dirname, "../data");
const WALLET_FILE    = path.join(DATA_DIR, "wallet.json");
const MIDNAME_FILE   = path.join(DATA_DIR, "midname.json");
const PROFILE_FILE   = path.join(DATA_DIR, "profile.json");
const ENTRIES_FILE   = path.join(DATA_DIR, "entries.json");
const ATTEST_FILE    = path.join(DATA_DIR, "attestations.json");

function readJSON(filePath, fallback) {
  try { return JSON.parse(fs.readFileSync(filePath, "utf-8")); } catch { return fallback; }
}

/**
 * Compute identityLevel from the unlock chain.
 *   0 = no wallet
 *   1 = wallet connected
 *   2 = wallet + midname set
 *   3 = wallet + midname + verified flights
 *   4 = wallet + midname + verified flights + attestations
 */
function computeIdentityLevel(walletSession, midname, verifiedFlights, attestationCount) {
  if (!walletSession) return 0;
  if (!midname) return 1;
  if (verifiedFlights === 0) return 2;
  if (attestationCount === 0) return 3;
  return 4;
}

/**
 * Compute trust level label.
 */
function trustLevelLabel(level) {
  switch (level) {
    case 0: return "Unverified";
    case 1: return "Wallet Linked";
    case 2: return "Identity Claimed";
    case 3: return "Progression Verified";
    case 4: return "Trusted Aviator";
    default: return "Unknown";
  }
}

/**
 * Build and return the unified PilotState.
 */
export function buildPilotState(asOf = new Date().toISOString()) {
  const walletSession = readJSON(WALLET_FILE, null);
  const midnameData   = readJSON(MIDNAME_FILE, null);
  const profile       = readJSON(PROFILE_FILE, {});
  const entries       = readJSON(ENTRIES_FILE, []);
  const attestations  = readJSON(ATTEST_FILE, []);

  const prog = computeProgression(profile, entries, attestations, asOf);

  // Verified flights = entries that have a pilotId (wallet-anchored) and are not marked unverified
  const verifiedFlights = entries.filter(e => e.pilotId && !e.unverified).length;
  const attestationCount = Array.isArray(attestations) ? attestations.length : 0;

  const walletConnected  = !!walletSession;
  const walletAddress    = walletSession?.address || null;
  const coinPublicKey    = walletSession?.coinPublicKey || null;

  const midname          = midnameData?.midname || null;
  const midnameVerified  = midnameData?.verificationStatus === "verified";
  const shieldedIdentity = midnameData?.resolvedType === "shielded" ? midnameData.resolvedAddress : null;

  const identityLevel    = computeIdentityLevel(walletSession, midname, verifiedFlights, attestationCount);
  const trustLevel       = trustLevelLabel(identityLevel);

  // Milestone progress percent
  const completedMilestones = prog.milestones.filter(m => m.status === "completed").length;
  const totalMilestones     = prog.milestones.length;
  const milestoneProgress   = totalMilestones > 0
    ? Math.round((completedMilestones / totalMilestones) * 100)
    : 0;

  return {
    // Wallet
    walletConnected,
    walletAddress,
    coinPublicKey,

    // Identity
    shieldedIdentity,
    midname,
    midnameVerified,
    identityLevel,

    // Progression
    pilotPhase:       prog.progressionState,
    pilotPhaseLabel:  prog.label,
    readiness:        prog.readiness,
    milestoneProgress,
    milestones:       prog.milestones,
    progressionState: prog.progressionState,
    progressPct:      prog.progressPct,
    stats:            prog.stats,
    guidanceCards:    prog.guidanceCards,
    recommendations:  prog.recommendations,

    // Trust
    verifiedFlights,
    attestations:     attestationCount,
    trustLevel,

    // Raw sources (for views that need them)
    _profile:      profile,
    _entries:      entries,
    _attestations: attestations,
    _prog:         prog,
  };
}
