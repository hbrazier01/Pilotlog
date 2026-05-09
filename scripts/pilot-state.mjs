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
const DATA_DIR = process.env.PILOTLOG_HOME || process.env.PILOTLOG_DIR || path.resolve(process.cwd(), "data");
const WALLET_FILE    = path.join(DATA_DIR, "wallet.json");
const IDENTITY_FILE  = path.join(DATA_DIR, "identity.json");
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
  const identityData  = readJSON(IDENTITY_FILE, null);
  const profile       = readJSON(PROFILE_FILE, {});
  const entries       = readJSON(ENTRIES_FILE, []);
  const attestations  = readJSON(ATTEST_FILE, []);

  const prog = computeProgression(profile, entries, attestations, asOf);

  // Verified flights = entries that have a pilotId (wallet-anchored) and are not marked unverified
  const verifiedFlights = entries.filter(e => e.pilotId && !e.unverified).length;
  const attestationCount = Array.isArray(attestations) ? attestations.length : 0;

  // Attestation breakdown
  const pendingAttestations  = Array.isArray(attestations) ? attestations.filter(a => a.status === "pending").length : 0;
  const verifiedAttestations = Array.isArray(attestations) ? attestations.filter(a => a.status === "verified").length : 0;
  const latestVerification   = Array.isArray(attestations)
    ? attestations
        .filter(a => a.status === "verified")
        .sort((a, b) => String(b.verifiedAt || b.createdAt).localeCompare(String(a.verifiedAt || a.createdAt)))[0] || null
    : null;

  // Wallet: prefer wallet.json; fall back to identity.json walletAddress
  const walletConnected  = !!(walletSession || identityData?.walletAddress);
  const walletAddress    = walletSession?.address || identityData?.walletAddress || null;
  const coinPublicKey    = walletSession?.coinPublicKey || null;

  // Identity: read from identity.json (same source as readApi.mjs)
  const midname          = identityData?.midname || null;
  const midnameVerified  = identityData?.midnameVerified === true;
  const shieldedIdentity = identityData?.resolvedType === "shielded" ? identityData.resolvedAddress : null;

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
    attestations:          attestationCount,
    pendingAttestations,
    verifiedAttestations,
    latestVerification,
    trustLevel,

    // Raw sources (for views that need them)
    _profile:      profile,
    _entries:      entries,
    _attestations: attestations,
    _prog:         prog,
  };
}

// CLI entry point
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  const debug = process.argv.includes("--debug");
  if (debug) {
    console.log("[pilot-state] Data sources:");
    console.log("  entries path:    ", ENTRIES_FILE);
    console.log("  profile path:    ", PROFILE_FILE);
    console.log("  identity path:   ", IDENTITY_FILE);
    console.log("  wallet path:     ", WALLET_FILE);
    console.log("  attestation path:", ATTEST_FILE);
    const raw = {
      entries:      readJSON(ENTRIES_FILE, []),
      identity:     readJSON(IDENTITY_FILE, null),
      wallet:       readJSON(WALLET_FILE, null),
      attestations: readJSON(ATTEST_FILE, []),
    };
    console.log("  entries loaded:      ", raw.entries.length);
    console.log("  identity midname:    ", raw.identity?.midname ?? "(none)");
    console.log("  identity verified:   ", raw.identity?.midnameVerified ?? false);
    console.log("  wallet connected:    ", !!(raw.wallet || raw.identity?.walletAddress));
    console.log("  attestations loaded: ", Array.isArray(raw.attestations) ? raw.attestations.length : 0);
    console.log("");
  }
  const state = buildPilotState();
  console.log(JSON.stringify(state, null, 2));
}
