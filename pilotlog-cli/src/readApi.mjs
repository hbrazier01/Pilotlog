
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
import { createHash, randomBytes } from "node:crypto";
import { buildIntegrityResult } from "../../src/services/build-integrity-result.mjs";
import { anchorOnMidnight } from "../../src/services/airlog-anchor-midnight.mjs";
import { canonicalizeFlightEntry } from "../../src/lib/canonicalize-entry.mjs";
import { buildTrustReport } from "../../src/services/build-trust-report.mjs";
import { buildPilotReport } from "../../src/services/build-pilot-report.mjs";
import { anchorRecord, verifyRecord, grantAccess, revokeAccess } from "../../src/services/airlog-anchor-service.mjs";
import { computeReadiness, PILOT_PHASES } from "./lib/readiness.mjs";
import { computeProgression } from "./lib/progression-engine.mjs";
import { computePplRequirements, computePplPart61Progress } from "./lib/faa/pplPart61.mjs";

const PORT = Number(process.env.PORT || 8788);
const DATA_DIR = process.env.PILOTLOG_HOME || process.env.PILOTLOG_DIR || path.resolve(process.cwd(), "data");
const ENTRIES_PATH = path.join(DATA_DIR, "entries.json");
const PROFILE_PATH = path.join(DATA_DIR, "profile.json");
const AIRCRAFT_PATH = path.join(DATA_DIR, "aircraft.json");
const VERIFICATION_PATH = path.join(DATA_DIR, "verification.json");
const MAINTENANCE_PATH = path.join(DATA_DIR, "maintenance.json");
const WALLET_PATH = path.join(DATA_DIR, "wallet.json");
const IDENTITY_PATH = path.join(DATA_DIR, "identity.json");
const ATTESTATIONS_PATH = path.join(DATA_DIR, "attestations.json");

fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(ENTRIES_PATH)) fs.writeFileSync(ENTRIES_PATH, "[]");
if (!fs.existsSync(PROFILE_PATH)) {
  fs.writeFileSync(
    PROFILE_PATH,
    JSON.stringify(
      {
        pilot: { fullName: "", email: "", phone: "" },
        certificates: [],
        ratings: [],
        medical: {
          kind: "None",
          class: null,
          issued: null,
          expires: null,
          basicMed: { cmecDate: null, onlineCourseDate: null }
        },
        proficiency: { flightReviewDate: null, ipcDate: null },
        endorsements: []
      },
      null,
      2
    )
  );
}

if (!fs.existsSync(AIRCRAFT_PATH)) {
  fs.writeFileSync(
    AIRCRAFT_PATH,
    JSON.stringify({ aircraft: [] }, null, 2)
  );
}

if (!fs.existsSync(VERIFICATION_PATH)) {
  fs.writeFileSync(
    VERIFICATION_PATH,
    JSON.stringify(
      {
        anchored: false,
        anchorHash: null,
        anchorTime: null,
        anchorNetwork: "midnight-preprod",
        anchorTx: null,
        entries: 0,
        aircraftIdent: null,
        airframeId: null
      },
      null,
      2
    )
  );
}

if (!fs.existsSync(IDENTITY_PATH)) {
  fs.writeFileSync(
    IDENTITY_PATH,
    JSON.stringify(
      {
        walletAddress: null,
        midname: null,
        did: null,
        midnameVerified: false,
        verifiedAt: null,
        identitySource: "wallet",
        networkId: "preprod"
      },
      null,
      2
    )
  );
}

if (!fs.existsSync(ATTESTATIONS_PATH)) {
  fs.writeFileSync(ATTESTATIONS_PATH, JSON.stringify([], null, 2));
}

function readEntries() {
  try {
    const raw = fs.readFileSync(ENTRIES_PATH, "utf-8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function readWalletSession() {
  try {
    if (!fs.existsSync(WALLET_PATH)) return null;
    const raw = fs.readFileSync(WALLET_PATH, "utf-8");
    const parsed = JSON.parse(raw);
    return parsed && parsed.address ? parsed : null;
  } catch {
    return null;
  }
}

function saveWalletSession(session) {
  fs.writeFileSync(WALLET_PATH, JSON.stringify(session, null, 2));
}

function readIdentity() {
  try {
    if (!fs.existsSync(IDENTITY_PATH)) return null;
    return JSON.parse(fs.readFileSync(IDENTITY_PATH, "utf-8"));
  } catch {
    return null;
  }
}

function saveIdentity(identity) {
  fs.writeFileSync(IDENTITY_PATH, JSON.stringify(identity, null, 2));
}

function readAttestations() {
  try {
    if (!fs.existsSync(ATTESTATIONS_PATH)) return [];
    const raw = fs.readFileSync(ATTESTATIONS_PATH, "utf-8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveAttestations(attestations) {
  fs.writeFileSync(ATTESTATIONS_PATH, JSON.stringify(attestations, null, 2));
}

// ─── Unified PilotState ───────────────────────────────────────────────────────
// Single source of truth for dashboard, passport, and journey views.
// Trust unlock chain:
//   0 = no wallet  1 = wallet  2 = wallet+midname  3 = +verified flights  4 = +attestations
function buildPilotState(asOf = new Date().toISOString()) {
  const walletSession  = readWalletSession();
  const identity       = readIdentity() || {};
  const profile        = readProfile();
  const entries        = readEntries();
  const attestations   = readAttestations();
  // FAA engine is the single source of truth for all progression state
  const prog           = computePplPart61Progress(entries, { asOf });

  const verifiedFlights  = entries.filter(e => e.pilotId && !e.unverified).length;
  const attestationCount = Array.isArray(attestations) ? attestations.length : 0;

  const walletConnected = !!(walletSession || identity?.walletAddress);
  const walletAddress   = walletSession?.address || identity?.walletAddress || null;
  const midname         = identity?.midname || null;
  const midnameVerified = identity?.midnameVerified === true;

  let identityLevel = 0;
  if (walletConnected) identityLevel = 1;
  if (walletConnected && midname) identityLevel = 2;
  if (walletConnected && midname && verifiedFlights > 0) identityLevel = 3;
  if (walletConnected && midname && verifiedFlights > 0 && attestationCount > 0) identityLevel = 4;

  const trustLabels = ["Unverified", "Wallet Linked", "Identity Claimed", "Progression Verified", "Trusted Aviator"];
  const trustLevel  = trustLabels[identityLevel] || "Unknown";

  const completedMilestones = prog.milestones.filter(m => m.status === "completed").length;
  const totalMilestones     = prog.milestones.length;
  const milestoneProgress   = totalMilestones > 0
    ? Math.round((completedMilestones / totalMilestones) * 100)
    : 0;

  return {
    walletConnected,
    walletAddress,
    coinPublicKey:    walletSession?.coinPublicKey || null,
    midname,
    midnameVerified,
    identityLevel,
    trustLevel,
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
    verifiedFlights,
    attestations:     attestationCount,
    // Raw sources available to route handlers
    _walletSession:   walletSession,
    _identity:        identity,
    _profile:         profile,
    _entries:         entries,
    _attestations:    attestations,
    _prog:            prog,
  };
}

// ─── Dashboard State Derivation ──────────────────────────────────────────────
// Derives structured dashboard state from pilotState.
// Pattern: pilotState -> buildDashboardState() -> sections/cards/journey -> UI
//
// Consumers should use /api/dashboard-state to get this structure.
function buildDashboardState(ps) {
  const progState = ps.progressionState || 'discovery';

  // Phase-aware journey steps: three milestones that frame the pilot's current arc
  const JOURNEY_STEPS = {
    discovery:           ['First Flight', 'Student Certificate', 'Pre-Solo'],
    student_pilot:       ['Foundation', 'Pre-Solo', 'Solo Ready'],
    solo_ready:          ['Foundation', 'Pre-Solo', 'Solo Ready'],
    solo_complete:       ['Solo Complete', 'Cross-Country', 'Checkride'],
    xc_ready:            ['Solo Complete', 'Cross-Country', 'Checkride'],
    checkride_ready:     ['Hours Met', 'XC Complete', 'Schedule Checkride'],
    private_pilot:       ['Legal Currency', 'Proficiency', 'Next Rating'],
    instrument_training: ['VFR Current', 'IFR Approaches', 'IFR Rating'],
    instrument_ready:    ['VFR Current', 'IFR Approaches', 'IFR Ready'],
    instrument_rated:    ['VFR Baseline', 'IFR Currency', 'IFR Proficiency'],
    commercial_track:    ['Currency', 'Hours', 'CPL Certificate'],
    cfi_track:           ['Current', 'Proficient', 'Teaching Ready'],
  };

  const guidanceCards = ps.guidanceCards || [];
  const recommendations = ps.recommendations || [];

  // Derive chip status from highest-priority guidance card
  let chipStatus = 'current';
  let chipLabel = 'On Track';
  const criticalCard = guidanceCards.find(c => c.priority === 'critical');
  const highCard = guidanceCards.find(c => c.priority === 'high');
  if (criticalCard) {
    chipStatus = 'not_current';
    chipLabel = criticalCard.title;
  } else if (highCard) {
    chipStatus = 'needs_attention';
    chipLabel = highCard.title;
  } else if (guidanceCards.length === 0) {
    chipStatus = 'current';
    chipLabel = ps.milestones?.length > 0 ? 'All systems go' : 'Log your first flight';
  }

  // Journey active step index: 0 = not_current, 1 = needs_attention, 2 = current
  const journeyActiveIdx = chipStatus === 'not_current' ? 0 : chipStatus === 'needs_attention' ? 1 : 2;

  return {
    progressionState: progState,
    phaseLabel:       ps.pilotPhaseLabel || 'Pilot',
    chipStatus,
    chipLabel,
    // Primary action card — top-priority guidance card from the progression engine
    todayCard:        guidanceCards[0] || null,
    secondaryCards:   guidanceCards.slice(1, 3),
    // All guidance cards for readiness lane rendering (max 4)
    guidanceCards,
    recommendations,
    journeySteps:     JOURNEY_STEPS[progState] || JOURNEY_STEPS.student_pilot,
    journeyActiveIdx,
    stats:            ps.stats,
    readiness:        ps.readiness,
    progressPct:      ps.progressPct,
    milestones:       ps.milestones,
  };
}

// ─── FlightAttestationCard HTML ──────────────────────────────────────────────
// Renders a single attestation card. Works in both dark (passport) and light
// (pilot-report) contexts via the `theme` param: "dark" | "light".
function flightAttestationCardHtml(attestation, { theme = "dark" } = {}) {
  const dark = theme === "dark";
  const bg = dark ? "#0b0f18" : "#f8fafc";
  const border = dark ? "#1f2440" : "#e2e8f0";
  const labelColor = dark ? "#6b7280" : "#6b7280";
  const textColor = dark ? "#e2e8f0" : "#1a202c";
  const dimColor = dark ? "#b6b9c6" : "#4a5568";

  const statusConfig = {
    pending:  { color: "#f59e0b", bg: dark ? "#1a1203" : "#fef9c3", label: "Pending" },
    verified: { color: "#22c55e", bg: dark ? "#0d1f10" : "#dcfce7", label: "Confirmed" },
    rejected: { color: "#ef4444", bg: dark ? "#1f0a0a" : "#fee2e2", label: "Not Confirmed" },
  };
  const s = statusConfig[attestation.status] || statusConfig.pending;

  const typeLabel = {
    instruction_verified: "Instructor Verified",
    flight_verified: "Flight Confirmed",
    endorsement_verified: "Endorsement Signed Off",
    aircraft_checkout: "Aircraft Checkout",
    maintenance_verified: "Maintenance Signed Off",
  }[attestation.type] || attestation.type;

  const signedDate = attestation.signedAt ? String(attestation.signedAt).slice(0, 10) : null;
  const createdDate = attestation.createdAt ? String(attestation.createdAt).slice(0, 10) : "—";

  return `<div style="background:${bg};border:1px solid ${border};border-radius:10px;padding:14px 16px;margin-bottom:10px;display:flex;justify-content:space-between;align-items:flex-start;gap:12px;">
    <div style="flex:1;min-width:0;">
      <div style="font-size:13px;font-weight:700;color:${textColor};margin-bottom:4px;">${typeLabel}</div>
      ${attestation.attestorMidname ? `<div style="font-size:12px;color:${dimColor};margin-bottom:2px;">By <strong>${attestation.attestorMidname}</strong>${attestation.attestorRole ? ` · ${attestation.attestorRole}` : ""}</div>` : ""}
      <div style="font-size:11px;color:${labelColor};">${signedDate ? `Signed ${signedDate}` : `Requested ${createdDate}`}${attestation.notes ? ` · ${attestation.notes}` : ""}</div>
    </div>
    <div style="display:flex;align-items:center;gap:6px;background:${s.bg};border:1px solid ${s.color}33;border-radius:20px;padding:3px 10px;flex-shrink:0;">
      <span style="width:6px;height:6px;border-radius:50%;background:${s.color};display:inline-block;"></span>
      <span style="font-size:11px;font-weight:700;color:${s.color};">${s.label}</span>
    </div>
  </div>`;
}

// Returns attestations section HTML for a set of attestations.
// emptyMsg is shown when no attestations exist.
function attestationsSectionHtml(attestations, { theme = "dark", emptyMsg = "No attestations yet." } = {}) {
  if (!attestations || attestations.length === 0) {
    const dark = theme === "dark";
    return `<div style="font-size:13px;color:${dark ? "#374151" : "#6b7280"};font-style:italic;padding:12px 0;">${emptyMsg}</div>`;
  }
  return attestations.map(a => flightAttestationCardHtml(a, { theme })).join("");
}
// ─────────────────────────────────────────────────────────────────────────────

// --- Shared wallet nav helpers ---

function truncateWalletAddress(address) {
  if (!address || address.length < 16) return address || "Connected";
  return address.slice(0, 8) + "…" + address.slice(-6);
}

// Returns the wallet nav element HTML (SSR). Always a <button> — JS updates state in-place.
function walletNavHtml(session, identity) {
  if (session && session.address) {
    const displayLabel = (identity && identity.midnameVerified && identity.midname)
      ? identity.midname
      : truncateWalletAddress(session.address);
    return `<button id="wallet-nav-link" data-connected="true" title="Click to disconnect · ${session.address}" onclick="walletHeaderClick()" style="background:none;border:1px solid #14532d;color:#22c55e;font-size:14px;padding:5px 12px;border-radius:6px;cursor:pointer;font-weight:600;">&#9679; ${displayLabel}</button>`;
  }
  return `<button id="wallet-nav-link" onclick="connectWalletHeader()" style="background:none;border:1px solid #374151;color:#9aa3ff;font-size:14px;padding:5px 12px;border-radius:6px;cursor:pointer;font-weight:600;">Connect Wallet</button>`;
}

// ─── Reusable Pilot Passport Card ────────────────────────────────────────────
// Returns an HTML string for the Pilot Passport identity card.
// Used on: dashboard, /passport route, pilot-report.
// mode: "compact" (dashboard strip) | "full" (passport page)
function pilotPassportCardHtml(session, identity, profile, totals, { mode = "full", aircraftCount = 0 } = {}) {
  const walletConnected = !!(session && session.address);
  const midnameVerified = !!(identity && identity.midnameVerified && identity.midname);
  const midname = midnameVerified ? identity.midname : null;
  const idFields = (identity && identity.fields) || {};
  const idName = idFields.name || (profile && profile.pilot && profile.pilot.fullName) || null;
  const pilotPhase = (profile && profile.pilotPhase) || null;
  const totalHrs = totals ? Number(totals.total || 0).toFixed(1) : "—";
  const privacyEnabled = !!(identity && identity.resolvedType === "shielded");
  const networkLabel = (identity && identity.networkId === "preprod") ? "Midnight PreProd" : (identity && identity.networkId) || "Midnight";
  const verificationBadge = midnameVerified
    ? `<div style="display:flex;align-items:center;gap:6px;background:#0d1f10;border:1px solid #1a4a20;border-radius:20px;padding:4px 12px;flex-shrink:0;">
        <span style="width:7px;height:7px;border-radius:50%;background:#22c55e;display:inline-block;"></span>
        <span style="font-size:12px;color:#22c55e;font-weight:700;">Verified</span>
       </div>`
    : walletConnected
    ? `<div style="display:flex;align-items:center;gap:6px;background:#1a1203;border:1px solid #3a2a0a;border-radius:20px;padding:4px 12px;flex-shrink:0;">
        <span style="width:7px;height:7px;border-radius:50%;background:#f59e0b;display:inline-block;"></span>
        <span style="font-size:12px;color:#f59e0b;font-weight:700;">Wallet Connected</span>
       </div>`
    : `<div style="display:flex;align-items:center;gap:6px;background:#111827;border:1px solid #222843;border-radius:20px;padding:4px 12px;flex-shrink:0;">
        <span style="width:7px;height:7px;border-radius:50%;background:#6b7280;display:inline-block;"></span>
        <span style="font-size:12px;color:#6b7280;font-weight:700;">Not Verified</span>
       </div>`;

  const phaseLabel = pilotPhase
    ? pilotPhase.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())
    : null;

  if (mode === "compact") {
    // Compact card for dashboard
    return `<div style="display:flex;align-items:center;gap:12px;background:#121624;border:1px solid #222843;border-radius:12px;padding:14px 18px;margin-bottom:16px;">
      <div style="width:40px;height:40px;border-radius:50%;background:linear-gradient(135deg,#1a3a8f,#7c3aed);display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0;">&#9992;</div>
      <div style="flex:1;min-width:0;">
        <div style="font-size:16px;font-weight:800;color:#fff;">${midname || idName || "Pilot"}</div>
        <div style="font-size:12px;color:#b6b9c6;margin-top:2px;">
          ${phaseLabel ? `<span>${phaseLabel}</span>` : ""}
          ${phaseLabel && totalHrs !== "—" ? `<span style="color:#374151;"> · </span>` : ""}
          ${totalHrs !== "—" ? `<span>${totalHrs} hrs total</span>` : ""}
          ${aircraftCount > 0 ? `<span style="color:#374151;"> · </span><span>${aircraftCount} aircraft</span>` : ""}
        </div>
      </div>
      <div style="display:flex;align-items:center;gap:8px;flex-shrink:0;">
        ${verificationBadge}
        <a href="/passport" style="font-size:12px;color:#9aa3ff;text-decoration:none;">Passport →</a>
      </div>
    </div>`;
  }

  // Full passport card
  const privacyRow = privacyEnabled
    ? `<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid #1f2440;">
        <span style="font-size:13px;color:#b6b9c6;">Privacy</span>
        <span style="font-size:13px;font-weight:600;color:#9aa3ff;">Private · Shielded Identity</span>
       </div>`
    : "";

  return `
  <div style="background:linear-gradient(135deg,#0f1835 0%,#121624 100%);border:1px solid #2a3060;border-radius:20px;padding:28px;margin-bottom:24px;">
    <div style="display:flex;align-items:flex-start;gap:16px;margin-bottom:20px;">
      <div style="width:56px;height:56px;border-radius:50%;background:linear-gradient(135deg,#1a3a8f,#7c3aed);display:flex;align-items:center;justify-content:center;font-size:24px;flex-shrink:0;">&#9992;</div>
      <div style="flex:1;">
        <div style="font-size:22px;font-weight:800;color:#fff;letter-spacing:-0.3px;">${midname || idName || "Pilot"}</div>
        ${idName && midname && idName !== midname ? `<div style="font-size:14px;color:#b6b9c6;margin-top:2px;">${idName}</div>` : ""}
        <div style="margin-top:10px;">
          ${verificationBadge}
        </div>
      </div>
    </div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px;margin-bottom:20px;">
      <div style="background:#0b0f18;border:1px solid #1f2440;border-radius:12px;padding:14px;">
        <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#6b7280;margin-bottom:6px;">Total Time</div>
        <div style="font-size:22px;font-weight:800;color:#fff;">${totalHrs} hrs</div>
      </div>
      ${aircraftCount > 0 ? `<div style="background:#0b0f18;border:1px solid #1f2440;border-radius:12px;padding:14px;">
        <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#6b7280;margin-bottom:6px;">Aircraft</div>
        <div style="font-size:22px;font-weight:800;color:#fff;">${aircraftCount}</div>
      </div>` : ""}
      ${phaseLabel ? `<div style="background:#0b0f18;border:1px solid #1f2440;border-radius:12px;padding:14px;">
        <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#6b7280;margin-bottom:6px;">Phase</div>
        <div style="font-size:14px;font-weight:700;color:#fff;margin-top:4px;">${phaseLabel}</div>
      </div>` : ""}
      <div style="background:#0b0f18;border:1px solid #1f2440;border-radius:12px;padding:14px;">
        <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#6b7280;margin-bottom:6px;">Network</div>
        <div style="font-size:12px;font-weight:700;color:#9aa3ff;margin-top:4px;">${midnameVerified ? networkLabel : "—"}</div>
      </div>
    </div>
    <div style="background:#0b0f18;border:1px solid #1f2440;border-radius:12px;padding:16px;">
      ${midnameVerified ? `<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid #1f2440;">
        <span style="font-size:13px;color:#b6b9c6;">Pilot Identity</span>
        <span style="font-size:13px;font-weight:700;color:#fff;">${midname}</span>
      </div>` : ""}
      <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid #1f2440;">
        <span style="font-size:13px;color:#b6b9c6;">Verification</span>
        <span style="font-size:13px;font-weight:600;color:${midnameVerified ? "#22c55e" : "#6b7280"};">${midnameVerified ? "Verified on Midnight" : "Not yet verified"}</span>
      </div>
      ${privacyRow}
      <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;">
        <span style="font-size:13px;color:#b6b9c6;">Portable</span>
        <span style="font-size:13px;font-weight:600;color:#9aa3ff;">${midnameVerified ? "Yes · Linked to Midnight" : "—"}</span>
      </div>
    </div>
  </div>`;
}
// ─────────────────────────────────────────────────────────────────────────────

// Helper: update wallet button state without replacing the element.
function setWalletButtonConnected(el, addr) {
  const short = addr.length > 16 ? addr.slice(0, 8) + '\u2026' + addr.slice(-6) : addr;
  el.textContent = '\u25CF ' + short;
  el.setAttribute('title', addr);
  el.setAttribute('data-connected', 'true');
  el.style.color = '#22c55e';
  el.style.border = 'none';
  el.style.cursor = 'default';
  el.onclick = null;
  el.disabled = false;
}

function setWalletButtonDisconnected(el) {
  el.textContent = 'Connect Wallet';
  el.setAttribute('title', '');
  el.setAttribute('data-connected', 'false');
  el.style.color = '#9aa3ff';
  el.style.border = '1px solid #374151';
  el.style.cursor = 'pointer';
  el.onclick = connectWalletHeader;
  el.disabled = false;
}

// Inline script injected into every main page — refreshes wallet nav from server session.
const walletStatusScript = `
<script>
// ── Wallet disconnect dropdown ────────────────────────────────────────────────
// AIR-272: inject a hidden dropdown into the document once DOM is ready
function _ensureWalletDropdown() {
  if (document.getElementById('wallet-dropdown')) return;
  const d = document.createElement('div');
  d.id = 'wallet-dropdown';
  d.style.cssText = 'display:none;position:fixed;z-index:9999;background:#1a1f36;border:1px solid #2a3060;border-radius:10px;box-shadow:0 8px 24px rgba(0,0,0,.5);min-width:200px;padding:8px 0;';
  d.innerHTML = \`
    <div id="wallet-dropdown-addr" style="font-size:11px;color:#6b7280;padding:8px 16px 6px;border-bottom:1px solid #222843;word-break:break-all;"></div>
    <button onclick="disconnectWallet()" style="display:block;width:100%;text-align:left;background:none;border:none;color:#f87171;font-size:14px;padding:10px 16px;cursor:pointer;font-weight:600;">&#9679; Disconnect Wallet</button>
    <button onclick="reconnectWallet()" style="display:block;width:100%;text-align:left;background:none;border:none;color:#9aa3ff;font-size:14px;padding:8px 16px;cursor:pointer;">&#8635; Reconnect</button>
  \`;
  document.body.appendChild(d);
  // Close dropdown on outside click
  document.addEventListener('click', function(e) {
    const dd = document.getElementById('wallet-dropdown');
    const btn = document.getElementById('wallet-nav-link');
    if (dd && !dd.contains(e.target) && e.target !== btn) {
      dd.style.display = 'none';
    }
  }, true);
}

// ── Expired-session / reconnect banner ───────────────────────────────────────
function _ensureReconnectBanner() {
  if (document.getElementById('wallet-reconnect-banner')) return;
  const b = document.createElement('div');
  b.id = 'wallet-reconnect-banner';
  b.style.cssText = 'display:none;position:fixed;top:0;left:0;right:0;z-index:10000;background:#7c2d12;color:#fff;font-size:14px;padding:10px 20px;display:flex;align-items:center;gap:12px;justify-content:center;';
  b.innerHTML = \`
    <span>&#9888; Wallet session expired.</span>
    <button onclick="reconnectWallet()" style="background:#fff;color:#7c2d12;border:none;border-radius:6px;padding:4px 14px;font-size:13px;font-weight:700;cursor:pointer;">Reconnect Wallet</button>
    <button onclick="dismissReconnectBanner()" style="background:none;border:none;color:#fca5a5;font-size:18px;cursor:pointer;line-height:1;margin-left:4px;">&times;</button>
  \`;
  b.style.display = 'none';
  document.body.prepend(b);
}

function showReconnectBanner() {
  _ensureReconnectBanner();
  const b = document.getElementById('wallet-reconnect-banner');
  if (b) b.style.display = 'flex';
}

function dismissReconnectBanner() {
  const b = document.getElementById('wallet-reconnect-banner');
  if (b) b.style.display = 'none';
}

function _walletSetConnected(el, addr, displayLabel) {
  const short = displayLabel || (addr.length > 16 ? addr.slice(0, 8) + '\\u2026' + addr.slice(-6) : addr);
  el.textContent = '\\u25CF ' + short;
  el.setAttribute('title', 'Click to disconnect \\u00b7 ' + addr);
  el.setAttribute('data-connected', 'true');
  el.style.color = '#22c55e';
  el.style.border = '1px solid #14532d';
  el.style.cursor = 'pointer';
  el.onclick = walletHeaderClick;
  el.disabled = false;
  dismissReconnectBanner();
}

function _walletSetDisconnected(el) {
  el.textContent = 'Connect Wallet';
  el.setAttribute('title', '');
  el.setAttribute('data-connected', 'false');
  el.style.color = '#9aa3ff';
  el.style.border = '1px solid #374151';
  el.style.cursor = 'pointer';
  el.onclick = connectWalletHeader;
  el.disabled = false;
  const dd = document.getElementById('wallet-dropdown');
  if (dd) dd.style.display = 'none';
}

// ── Wallet header click — toggle disconnect dropdown ─────────────────────────
function walletHeaderClick() {
  const el = document.getElementById('wallet-nav-link');
  if (!el || el.getAttribute('data-connected') !== 'true') {
    connectWalletHeader();
    return;
  }
  _ensureWalletDropdown();
  const dd = document.getElementById('wallet-dropdown');
  if (!dd) return;
  if (dd.style.display === 'none' || !dd.style.display) {
    // Position below the button
    const rect = el.getBoundingClientRect();
    dd.style.top = (rect.bottom + 6) + 'px';
    dd.style.right = (window.innerWidth - rect.right) + 'px';
    // Show current address
    const addrEl = document.getElementById('wallet-dropdown-addr');
    if (addrEl) addrEl.textContent = el.getAttribute('title')?.replace('Click to disconnect \\u00b7 ', '') || '';
    dd.style.display = 'block';
  } else {
    dd.style.display = 'none';
  }
}

// ── Disconnect ────────────────────────────────────────────────────────────────
async function disconnectWallet() {
  const dd = document.getElementById('wallet-dropdown');
  if (dd) dd.style.display = 'none';
  const el = document.getElementById('wallet-nav-link');
  if (el) { el.textContent = 'Disconnecting\\u2026'; el.disabled = true; el.onclick = null; }
  try {
    await fetch('/wallet/disconnect', { method: 'POST' });
  } catch (_) {}
  if (el) { _walletSetDisconnected(el); }
}

// ── Reconnect — re-runs the full connect flow ─────────────────────────────────
async function reconnectWallet() {
  dismissReconnectBanner();
  const dd = document.getElementById('wallet-dropdown');
  if (dd) dd.style.display = 'none';
  // Clear any stale server session first, then reconnect fresh
  try { await fetch('/wallet/disconnect', { method: 'POST' }); } catch (_) {}
  await connectWalletHeader();
}

(function() {
  Promise.all([
    fetch('/wallet/status').then(r => r.json()).catch(() => ({})),
    fetch('/identity').then(r => r.json()).catch(() => ({}))
  ]).then(([walletData, identityData]) => {
    const el = document.getElementById('wallet-nav-link');
    if (!el) return;
    if (walletData.connected && walletData.session && walletData.session.address) {
      const displayLabel = (identityData && identityData.midnameVerified && identityData.midname)
        ? identityData.midname
        : null;
      _walletSetConnected(el, walletData.session.address, displayLabel);
      // AIR-272: check if the extension is actually available; if not, session is stale
      const extPresent = !!(window.midnight && window.midnight['1am'] && typeof window.midnight['1am'].connect === 'function');
      if (!extPresent) {
        showReconnectBanner();
      }
    } else {
      _walletSetDisconnected(el);
    }
  }).catch(() => {});
})();

async function connectWalletHeader() {
  const el = document.getElementById('wallet-nav-link');
  if (el) { el.textContent = 'Connecting\\u2026'; el.disabled = true; el.onclick = null; }
  const wallet = window.midnight?.['1am'];
  if (!wallet || typeof wallet.connect !== 'function') {
    alert('1AM wallet extension not found. Install the Midnight 1AM extension to continue.');
    if (el) { _walletSetDisconnected(el); }
    return;
  }
  try {
    const api = await wallet.connect('preprod');
    if (!api) throw new Error('Connection rejected');

    // Primary: getUnshieldedAddress() — returns { unshieldedAddress }
    let addr = null;
    try {
      const { unshieldedAddress } = await api.getUnshieldedAddress();
      addr = unshieldedAddress || null;
    } catch (_) {}
    // Fallback: api.state() looking for bech32 mn_addr_* unshielded address
    if (!addr) {
      try {
        const state = await api.state();
        const candidate = state?.address || state?.unshieldedAddress || null;
        if (candidate && String(candidate).startsWith('mn_addr')) {
          addr = candidate;
        }
      } catch (_) {}
    }
    // Always capture shielded addresses for midname identity verification
    let shieldedAddress = null;
    let coinPublicKey = null;
    let _rawShieldedResult = null;
    try {
      console.log('[wallet-connect] typeof api.getShieldedAddresses:', typeof api.getShieldedAddresses);
      console.log('[wallet-connect] calling getShieldedAddresses...');
      const shielded = await api.getShieldedAddresses();
      _rawShieldedResult = shielded;
      // AIR-247: log raw result and all keys to detect field name mismatches
      try {
        console.log('[wallet-connect] getShieldedAddresses RAW keys:', shielded ? Object.keys(shielded) : 'null/undefined');
        console.log('[wallet-connect] getShieldedAddresses RAW result:', JSON.stringify(shielded));
      } catch (_) {
        console.log('[wallet-connect] getShieldedAddresses RAW result (non-serializable):', String(shielded));
      }
      console.log('[wallet-connect] getShieldedAddresses extracted:', JSON.stringify({
        shieldedAddress: shielded?.shieldedAddress || null,
        shieldedCoinPublicKey: shielded?.shieldedCoinPublicKey || null,
        shieldedEncryptionPublicKey: shielded?.shieldedEncryptionPublicKey ? '(present)' : null,
      }));
      shieldedAddress = shielded?.shieldedAddress || null;
      coinPublicKey = shielded?.shieldedCoinPublicKey || null;
      if (!addr) addr = coinPublicKey || shieldedAddress;
    } catch (e) {
      console.warn('[wallet-connect] getShieldedAddresses failed:', e?.message || String(e));
      console.warn('[wallet-connect] getShieldedAddresses error stack:', e?.stack || 'no stack');
      _rawShieldedResult = { error: e?.message || String(e) };
    }
    // AIR-247: persist raw shielded result in session-level debug state
    try { window.__pilotlog_shielded_debug = _rawShieldedResult; } catch (_) {}
    console.log('[wallet-connect] final shieldedAddress:', shieldedAddress, '| coinPublicKey:', coinPublicKey ? '(present)' : 'null');
    if (!addr) {
      try {
        const state = await api.state();
        addr = state?.shieldedAddress || state?.coinPublicKey || null;
        if (!shieldedAddress) shieldedAddress = state?.shieldedAddress || null;
        if (!coinPublicKey) coinPublicKey = state?.coinPublicKey || null;
      } catch (_) {}
    }

    if (!addr) throw new Error('No address returned from wallet');

    const resp = await fetch('/wallet/connect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ address: addr, shieldedAddress, coinPublicKey }),
    });
    if (!resp.ok) throw new Error('Server rejected wallet session');

    // Show connected immediately — auto-resolve will update the label when it completes
    if (el) { _walletSetConnected(el, addr); }

    // Auto-resolve Midname for this wallet (reverse lookup via Midnames contract ledger)
    console.log('[identity] auto-resolve start');
    fetch('/identity/auto-resolve-midname', { method: 'POST' })
      .then(r => r.json())
      .then(result => {
        const displayLabel = (result && result.ok && result.midname) ? result.midname : null;
        console.log('[identity] auto-resolve result:', displayLabel || 'none');
        if (el) { _walletSetConnected(el, addr, displayLabel); }
      })
      .catch(err => {
        console.log('[identity] auto-resolve failed:', err?.message || String(err));
        // UI already set connected above — no further action needed
      });
  } catch (err) {
    if (el) { _walletSetDisconnected(el); }
    alert('Wallet connection failed: ' + err.message);
  }
}
</script>`;

// ---- end wallet nav helpers ----

function updateEntryAnchorFields(entryId, fields) {
  try {
    const entries = readEntries();
    const idx = entries.findIndex((e) => e.id === entryId);
    if (idx === -1) return;
    entries[idx] = { ...entries[idx], ...fields };
    fs.writeFileSync(ENTRIES_PATH, JSON.stringify(entries, null, 2));
  } catch (err) {
    console.error("[anchor] failed to update entry anchor fields:", err.message);
  }
}

async function anchorEntryInBackground(entryId, aircraftId) {
  try {
    const entries = readEntries();
    const entry = entries.find((e) => e.id === entryId);
    if (!entry) return;
    // Use pre-computed canonical hash stored at save time
    const recordHash = entry.anchorHash;
    if (!recordHash) return;
    const aircraftList = readAircraft();
    const aircraft = aircraftList.find((a) => a.ident === aircraftId || a.id === aircraftId) || aircraftList[0];
    const airframeId = aircraft
      ? createHash("sha256").update(String(aircraft.ident || aircraftId).toUpperCase()).digest("hex")
      : createHash("sha256").update(String(aircraftId).toUpperCase()).digest("hex");
    const result = await anchorOnMidnight({
      anchorHash: recordHash,
      airframeId,
      hours: Number(entry.totalTime || entry.total || 0),
    });
    if (result.anchored) {
      const anchoredAt = result.anchoredAt || new Date().toISOString();
      updateEntryAnchorFields(entryId, {
        anchorStatus: "anchored",
        anchored: true,
        anchoredAt,
        anchorTx: result.anchorId || null,
        anchorHash: recordHash,
        anchor: {
          hash: recordHash,
          walletAddress: entry.anchor?.walletAddress || null,
          anchoredAt,
          status: "anchored",
        },
      });
    } else {
      updateEntryAnchorFields(entryId, {
        anchorStatus: "anchor_failed",
        anchored: false,
        anchorHash: recordHash,
        anchor: {
          hash: recordHash,
          walletAddress: entry.anchor?.walletAddress || null,
          anchoredAt: entry.anchor?.anchoredAt || new Date().toISOString(),
          status: "anchor_failed",
        },
      });
    }
  } catch (err) {
    console.error("[anchor] background anchor error:", err.message);
    updateEntryAnchorFields(entryId, { anchorStatus: "anchor_failed", anchored: false });
  }
}

function readProfile() {
  try {
    const raw = fs.readFileSync(PROFILE_PATH, "utf-8");
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function saveProfile(profile) {
  fs.writeFileSync(PROFILE_PATH, JSON.stringify(profile, null, 2));
}

function readAircraft() {
  try {
    const raw = fs.readFileSync(AIRCRAFT_PATH, "utf-8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed?.aircraft) ? parsed.aircraft : [];
  } catch {
    return [];
  }
}

function readVerification() {
  try {
    const raw = fs.readFileSync(VERIFICATION_PATH, "utf-8");
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function readMaintenance() {
  try {
    const raw = fs.readFileSync(MAINTENANCE_PATH, "utf-8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function sortNewestFirst(entries) {
  return entries.sort((a, b) => String(b.date).localeCompare(String(a.date)));
}

function computeTotals(entries) {
  return entries.reduce(
    (acc, e) => {
      acc.total += Number(e.totalTime || e.total || 0);
      acc.pic += Number(e.pic || 0);
      acc.dual += Number(e.dual || 0);
      acc.xc += Number(e.xc || 0);
      acc.night += Number(e.night || 0);
      acc.actualInstrument += Number(e.actualInstrument || 0);
      acc.simulatedInstrument += Number(e.simulatedInstrument || 0);

      acc.approaches += Number(e.approaches || 0);
      acc.holds += Number(e.holds || 0);
      acc.intercepts += Number(e.intercepts || 0);

      acc.dayLandings += Number(e.dayLandings || 0);
      acc.nightLandings += Number(e.nightLandings || 0);
      return acc;
    },
    {
      total: 0,
      pic: 0,
      dual: 0,
      xc: 0,
      night: 0,
      actualInstrument: 0,
      simulatedInstrument: 0,

      approaches: 0,
      holds: 0,
      intercepts: 0,

      dayLandings: 0,
      nightLandings: 0,
    }
  );
}

function withinDays(dateIso, asOfIso, days) {
  const d = new Date(dateIso).getTime();
  const asOf = new Date(asOfIso).getTime();
  const diffMs = asOf - d;
  return diffMs >= 0 && diffMs <= days * 24 * 60 * 60 * 1000;
}

function monthsAgoIso(asOfIso, months) {
  const d = new Date(asOfIso);
  const cut = new Date(d);
  cut.setMonth(cut.getMonth() - months);
  return cut.toISOString();
}

// NOTE: simplified cutoff (we can refine to “6 calendar months” rule later)
function addMonths(dateIso, months) {
  const d = new Date(dateIso);
  const x = new Date(d);
  x.setMonth(x.getMonth() + months);
  return x.toISOString();
}

function isWithinMonths(asOfIso, dateIso, months) {
  if (!dateIso) return false;
  const start = new Date(dateIso).getTime();
  const end = new Date(addMonths(dateIso, months)).getTime();
  const asOf = new Date(asOfIso).getTime();
  return asOf >= start && asOf <= end;
}

function isFuture(asOfIso, dateIso) {
  if (!dateIso) return false;
  return new Date(dateIso).getTime() >= new Date(asOfIso).getTime();
}

function sumLandings(entries) {
  return entries.reduce(
    (acc, e) => {
      acc.day += Number(e.dayLandings || 0);
      acc.night += Number(e.nightLandings || 0);
      return acc;
    },
    { day: 0, night: 0 }
  );
}

function sumIfr(entries) {
  return entries.reduce(
    (acc, e) => {
      acc.approaches += Number(e.approaches || 0);
      acc.holds += Number(e.holds || 0);
      acc.intercepts += Number(e.intercepts || 0);
      return acc;
    },
    { approaches: 0, holds: 0, intercepts: 0 }
  );
}

function formatDateShort(dateIso) {
  if (!dateIso) return "Not set";
  const d = new Date(dateIso);
  if (Number.isNaN(d.getTime())) return "Not set";
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function addDays(dateIso, days) {
  const d = new Date(dateIso);
  const x = new Date(d);
  x.setDate(x.getDate() + days);
  return x.toISOString();
}

function latestDate(entries, getter) {
  let latest = null;
  for (const e of entries) {
    const value = Number(getter(e) || 0);
    if (value > 0) {
      if (!latest || String(e.date) > String(latest)) latest = e.date;
    }
  }
  return latest;
}

function daysUntil(asOfIso, dateIso) {
  if (!dateIso) return null;
  const asOf = new Date(asOfIso).getTime();
  const due = new Date(dateIso).getTime();
  if (Number.isNaN(asOf) || Number.isNaN(due)) return null;
  return Math.ceil((due - asOf) / (24 * 60 * 60 * 1000));
}

function dueClass(asOfIso, dateIso) {
  const d = daysUntil(asOfIso, dateIso);
  if (d === null) return "muted";
  if (d < 0) return "bad";
  if (d <= 30) return "warn";
  return "ok";
}

function dueLabel(asOfIso, dateIso) {
  const d = daysUntil(asOfIso, dateIso);
  if (d === null) return "Not set";
  if (d < 0) return `${formatDateShort(dateIso)} · overdue`;
  if (d === 0) return `${formatDateShort(dateIso)} · due today`;
  return `${formatDateShort(dateIso)} · ${d} day${d === 1 ? "" : "s"} left`;
}

function hashLogbook(entries, profile, aircraft) {
  const payload = {
    entries,
    profile,
    aircraft
  };

  const json = JSON.stringify(payload, Object.keys(payload).sort());
  return createHash("sha256").update(json).digest("hex");
}

function scoreClass(score) {
  if (score >= 85) return "ok";
  if (score >= 60) return "warn";
  return "bad";
}

const app = express();
app.use(express.json());

app.get("/health", (_req, res) => {
  res.status(200).send("OK");
});

// Compute passenger currency for a given landing type over 90 days.
// Returns { status: 'green'|'yellow'|'red', count, daysUntilExpiry, message, action }
function computePassengerCurrency(entries, type /* 'day' | 'night' */, asOf) {
  const cutoff = new Date(asOf);
  cutoff.setDate(cutoff.getDate() - 90);
  const cutoffMs = cutoff.getTime();
  const asOfMs = new Date(asOf).getTime();

  const field = type === 'day' ? 'dayLandings' : 'nightLandings';

  // Collect individual landing events sorted oldest-first within 90-day window
  const landingDates = [];
  for (const e of entries) {
    const d = new Date(e.date);
    if (!isNaN(d) && d.getTime() >= cutoffMs) {
      const n = Number(e[field] || 0);
      for (let i = 0; i < n; i++) landingDates.push(d.getTime());
    }
  }
  landingDates.sort((a, b) => a - b);

  const count = landingDates.length;
  const label = type === 'day' ? 'day' : 'night';

  if (count >= 3) {
    // Current — find when oldest of last-3 will age out of 90-day window
    const oldest3 = landingDates[landingDates.length - 3];
    const expiryMs = oldest3 + 90 * 24 * 60 * 60 * 1000;
    const daysLeft = Math.ceil((expiryMs - asOfMs) / (24 * 60 * 60 * 1000));
    return {
      status: 'green',
      count,
      daysUntilExpiry: daysLeft,
      message: `You're current to carry passengers during the ${label}.`,
      action: `Currency valid for ${daysLeft} more day${daysLeft === 1 ? '' : 's'}.`,
    };
  }

  const needed = 3 - count;

  if (count === 0) {
    return {
      status: 'red',
      count,
      daysUntilExpiry: 0,
      message: `You are not current. You need ${needed} ${label} landing${needed === 1 ? '' : 's'} to carry passengers.`,
      action: `Complete ${needed} landing${needed === 1 ? '' : 's'} to restore currency.`,
    };
  }

  // Has some landings — find when the most recent will age out
  const newestMs = landingDates[landingDates.length - 1];
  const expiryMs = newestMs + 90 * 24 * 60 * 60 * 1000;
  const daysLeft = Math.ceil((expiryMs - asOfMs) / (24 * 60 * 60 * 1000));

  if (daysLeft > 0 && daysLeft <= 14) {
    return {
      status: 'yellow',
      count,
      daysUntilExpiry: daysLeft,
      message: `You need ${needed} more ${label} landing${needed === 1 ? '' : 's'} in the next ${daysLeft} day${daysLeft === 1 ? '' : 's'} to stay current.`,
      action: `Act soon — currency window closing.`,
    };
  }

  if (daysLeft <= 0) {
    return {
      status: 'red',
      count,
      daysUntilExpiry: 0,
      message: `You are not current. You need ${needed} more ${label} landing${needed === 1 ? '' : 's'} to carry passengers.`,
      action: `Complete ${needed} landing${needed === 1 ? '' : 's'} to restore currency.`,
    };
  }

  // > 14 days left but < 3 landings (edge case: they have some but need more, not urgent yet)
  return {
    status: 'yellow',
    count,
    daysUntilExpiry: daysLeft,
    message: `You need ${needed} more ${label} landing${needed === 1 ? '' : 's'} to be current.`,
    action: `${daysLeft} day${daysLeft === 1 ? '' : 's'} until existing landings expire.`,
  };
}

app.get("/", (_req, res) => {
  const ps = buildPilotState();
  const entries = sortNewestFirst(ps._entries);
  const totals = computeTotals(entries);
  const recent = entries.slice(0, 10);
  const profile = ps._profile;
  const walletSession = ps._walletSession;
  const identity = ps._identity;
  const allAttestationsForDash = ps._attestations;
  // Build a map: flightId -> best attestation status for dashboard badge
  const flightAttestationMap = {};
  for (const a of allAttestationsForDash) {
    const prev = flightAttestationMap[a.flightId];
    // Priority: verified > pending > rejected
    if (!prev || (a.status === "verified") || (a.status === "pending" && prev.status !== "verified")) {
      flightAttestationMap[a.flightId] = a;
    }
  }

  const pilotName = profile?.pilot?.fullName || "Pilot";

  const fmt = (n) => Number(n || 0).toFixed(1);
  const totalFlights = entries.length;
  const lastFlightDate = entries[0]?.date ? String(entries[0].date).slice(0, 10) : "—";
  const landings = Number(totals.dayLandings || 0) + Number(totals.nightLandings || 0);
  const anchoredCount = entries.filter(e => e.anchored === true || e.anchorStatus === "anchored").length;

  // Aircraft summary from entries
  const aircraftStats = {};
  for (const e of entries) {
    const ident = e.aircraftIdent || e.aircraftId || "Unknown";
    if (!aircraftStats[ident]) {
      aircraftStats[ident] = { flights: 0, hours: 0, lastFlight: e.date, type: e.aircraftType || "" };
    }
    aircraftStats[ident].flights += 1;
    aircraftStats[ident].hours += Number(e.totalTime || e.total || 0);
    if (String(e.date) > String(aircraftStats[ident].lastFlight)) {
      aircraftStats[ident].lastFlight = e.date;
    }
  }
  const sortedAircraft = Object.entries(aircraftStats)
    .sort((a, b) => String(b[1].lastFlight).localeCompare(String(a[1].lastFlight)));
  const lastUsedAircraft = sortedAircraft.length > 0 ? sortedAircraft[0][0] : "";
  const aircraftRows = sortedAircraft
    .map(([ident, s]) => `
      <tr>
        <td>${ident}</td>
        <td class="muted">${s.type}</td>
        <td>${s.flights}</td>
        <td>${fmt(s.hours)} hrs</td>
        <td class="muted">${String(s.lastFlight || "").slice(0, 10)}</td>
      </tr>
    `).join("");

  res.type("html").send(`<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>PilotLog</title>
  <style>
  body { font-family: -apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial,sans-serif; background:#0b0f18; color:#fff; margin:0; }
  .wrap { max-width: 1080px; margin: 0 auto; padding: 32px 20px; }
  .topbar { display:flex; justify-content:space-between; align-items:center; margin-bottom:28px; flex-wrap:wrap; gap:12px; }
  .brand { font-size:20px; font-weight:800; letter-spacing:-0.5px; }
  .nav a { color:#9aa3ff; text-decoration:none; font-size:14px; margin-left:16px; }
  .nav a:hover { color:#fff; }
  .hero { margin-bottom:24px; }
  .big { font-size:56px; font-weight:800; letter-spacing:-1px; }
  .sub { color:#b6b9c6; margin-top:6px; font-size:15px; }
  .grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(200px,1fr)); gap:12px; margin-top:20px; }
  .card { background:#121624; border:1px solid #222843; border-radius:14px; padding:16px; }
  .label { color:#b6b9c6; font-size:12px; text-transform:uppercase; letter-spacing:.08em; }
  .val { font-size:28px; font-weight:700; margin-top:8px; }
  .table { margin-top:24px; background:#121624; border:1px solid #222843; border-radius:14px; overflow:hidden; }
  .table-title { padding:14px 16px 0; font-size:13px; font-weight:700; color:#b6b9c6; text-transform:uppercase; letter-spacing:.06em; }
  table { width:100%; border-collapse:collapse; }
  th, td { padding:10px 14px; border-bottom:1px solid #1f2440; text-align:left; font-size:14px; }
  th { background:#0f1320; color:#b6b9c6; font-weight:700; }
  tr:last-child td { border-bottom:none; }
  .muted { color:#b6b9c6; }
  .btn { display:inline-block; padding:10px 20px; background:#1a3a8f; color:#fff; border-radius:8px; font-size:14px; font-weight:700; text-decoration:none; }
  .btn:hover { background:#1e46b0; }
  .btn-outline { background:transparent; border:1px solid #222843; color:#9aa3ff; }
  .actions { display:flex; gap:12px; margin-top:20px; flex-wrap:wrap; align-items:center; }
  .log-form { display:none; background:#121624; border:1px solid #222843; border-radius:14px; padding:20px; margin-top:16px; }
  .log-form.open { display:block; }
  .log-form h3 { margin:0 0 16px; font-size:15px; font-weight:700; }
  .form-row { display:flex; gap:12px; flex-wrap:wrap; margin-bottom:12px; }
  .form-field { display:flex; flex-direction:column; gap:4px; flex:1; min-width:120px; }
  .form-field label { font-size:11px; color:#b6b9c6; text-transform:uppercase; letter-spacing:.06em; }
  .form-field input { background:#0b0f18; border:1px solid #222843; border-radius:6px; padding:8px 10px; color:#fff; font-size:14px; width:100%; box-sizing:border-box; }
  .form-field input:focus { outline:none; border-color:#1a3a8f; }
  .form-actions { display:flex; gap:10px; margin-top:4px; }
  .btn-sm { padding:8px 16px; font-size:13px; }
  .btn-cancel { background:transparent; border:1px solid #222843; color:#b6b9c6; border-radius:8px; padding:8px 16px; font-size:13px; cursor:pointer; }
  .btn-cancel:hover { color:#fff; }
  .toast { display:none; position:fixed; bottom:24px; right:24px; background:#1a3a8f; color:#fff; padding:12px 20px; border-radius:10px; font-size:14px; font-weight:600; z-index:999; }
  .toast.show { display:block; }
  .assistant-section { margin-top:20px; }
  .readiness-chip { display:inline-flex; align-items:center; gap:8px; padding:8px 16px; border-radius:999px; font-size:13px; font-weight:700; margin-bottom:14px; }
  .currency-cards { display:grid; grid-template-columns:repeat(auto-fit,minmax(240px,1fr)); gap:12px; }
  .currency-card { background:#121624; border:1px solid #222843; border-radius:14px; padding:16px; }
  .currency-card-header { display:flex; align-items:center; gap:8px; margin-bottom:8px; }
  .currency-dot { width:10px; height:10px; border-radius:50%; flex-shrink:0; }
  .currency-type { font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:.08em; color:#b6b9c6; }
  .currency-status-label { font-size:13px; font-weight:700; }
  .currency-message { font-size:13px; color:#b6b9c6; margin-top:4px; line-height:1.5; }
  .currency-action { font-size:12px; color:#9aa3ff; margin-top:6px; }
  .section-title { font-size:12px; font-weight:700; text-transform:uppercase; letter-spacing:.08em; color:#b6b9c6; margin-bottom:10px; }
  @media(max-width:820px) { .big { font-size:40px; } }
  /* Today Card */
  #today-card { background:#0d1220; border:1px solid #1e2a48; border-radius:16px; padding:18px 20px; margin-bottom:14px; }
  .today-card-header { display:flex; align-items:center; gap:8px; margin-bottom:12px; }
  .phase-badge { font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:.08em; background:#1a2240; color:#9aa3ff; padding:3px 10px; border-radius:999px; }
  .urgency-badge { font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:.08em; padding:3px 10px; border-radius:999px; margin-left:auto; }
  .urgency-badge.critical { background:#2a0a0a; color:#ef4444; }
  .urgency-badge.important { background:#1c1203; color:#f59e0b; }
  .urgency-badge.optional { background:#0f1235; color:#6366f1; }
  .urgency-badge.none { background:#1a1f30; color:#b6b9c6; }
  .today-headline { font-size:16px; font-weight:700; color:#fff; margin-bottom:4px; line-height:1.4; }
  .today-reason { font-size:13px; color:#b6b9c6; line-height:1.5; margin-bottom:10px; }
  .today-meta { display:flex; gap:16px; margin-bottom:12px; flex-wrap:wrap; }
  .today-meta-item { font-size:11px; color:#6b7280; }
  .today-meta-item span { color:#9aa3ff; font-weight:600; }
  .today-footer { display:flex; gap:8px; flex-wrap:wrap; }
  .secondary-chip { font-size:12px; background:#111827; border:1px solid #222843; color:#6b7280; border-radius:8px; padding:6px 12px; }
  .today-outcome { font-size:12px; color:#22c55e; font-weight:600; margin-bottom:4px; margin-top:-4px; }
  .today-cta { display:inline-block; margin-top:12px; padding:9px 20px; background:#1a3a8f; color:#fff; border:none; border-radius:8px; font-size:13px; font-weight:700; cursor:pointer; text-decoration:none; }
  .today-cta:hover { background:#1e46b0; }
  .today-changed { font-size:12px; color:#22c55e; font-weight:600; margin-bottom:6px; }
  /* Progression bar */
  #progression-bar { margin-bottom:14px; }
  .progression-phase { font-size:11px; font-weight:700; color:#9aa3ff; text-transform:uppercase; letter-spacing:.06em; margin-bottom:6px; display:flex; justify-content:space-between; align-items:center; }
  .progression-track { height:6px; border-radius:3px; background:#1a1f30; overflow:hidden; }
  .progression-fill { height:100%; border-radius:3px; background:linear-gradient(90deg,#1a3a8f,#9aa3ff); transition:width .4s ease; }
  /* Readiness scores */
  #readiness-scores { display:grid; grid-template-columns:repeat(auto-fit,minmax(130px,1fr)); gap:8px; margin-bottom:14px; }
  .readiness-score-item { background:#0e1220; border:1px solid #1a1f30; border-radius:10px; padding:10px 12px; }
  .readiness-score-label { font-size:10px; color:#6b7280; text-transform:uppercase; letter-spacing:.05em; margin-bottom:4px; }
  .readiness-score-val { font-size:16px; font-weight:800; margin-bottom:4px; }
  .readiness-score-track { height:3px; border-radius:2px; background:#1a1f30; overflow:hidden; }
  .readiness-score-fill { height:100%; border-radius:2px; }
  </style>
</head>
<body>
<div class="wrap">
  <div class="topbar">
    <div class="brand">PilotLog</div>
    <div class="nav">
      ${walletNavHtml(walletSession, identity)}
      <a href="/passport">Passport</a>
      <a href="/progression">Journey</a>
      <a href="/pilot-report">Pilot Report →</a>
    </div>
  </div>

  <div class="hero">
    <div class="big" id="stat-total-hrs">${fmt(totals.total)} hrs</div>
    <div class="sub" id="stat-sub">${pilotName} · PIC ${fmt(totals.pic)} · XC ${fmt(totals.xc)} · Night ${fmt(totals.night)}</div>
  </div>

  <div class="grid">
    <div class="card">
      <div class="label">Total Flights</div>
      <div class="val" id="stat-total-flights">${totalFlights}</div>
    </div>
    <div class="card">
      <div class="label">Total Time</div>
      <div class="val" id="stat-total-time">${fmt(totals.total)} hrs</div>
    </div>
    <div class="card">
      <div class="label">Last Flight</div>
      <div class="val" id="stat-last-flight" style="font-size:20px;margin-top:10px;">${lastFlightDate}</div>
    </div>
    <div class="card">
      <div class="label">Landings</div>
      <div class="val" id="stat-landings">${landings}</div>
    </div>
  </div>

  <div class="assistant-section">
    <div class="section-title">Flight Readiness</div>
    <div id="readiness-chip" class="readiness-chip" style="background:#1a1f30;color:#b6b9c6;">
      <span id="readiness-dot" style="width:8px;height:8px;border-radius:50%;background:#b6b9c6;display:inline-block;"></span>
      <span id="readiness-label">Loading…</span>
    </div>
    <div id="today-card" style="display:none;"></div>
    <div id="progression-bar" style="display:none;"></div>
    <div id="readiness-scores" style="display:none;"></div>
    <div class="currency-cards" id="readiness-cards">
      <div class="currency-card" style="color:#b6b9c6;font-size:13px;">Checking readiness…</div>
    </div>
  </div>

  <div class="actions">
    <button class="btn btn-outline" id="openLogBtn" onclick="toggleForm()">+ Log Flight</button>
    <a href="/pilot-report" class="btn">View Pilot Report →</a>
  </div>

  <div class="log-form" id="logForm">
    <h3>Log a Flight</h3>
    <form id="flightForm" onsubmit="submitFlight(event)">
      <div class="form-row">
        <div class="form-field">
          <label>Aircraft ID</label>
          <input type="text" name="aircraftId" placeholder="e.g. N123AB" required />
        </div>
        <div class="form-field">
          <label>Date</label>
          <input type="date" name="date" value="${new Date().toISOString().slice(0,10)}" required />
        </div>
        <div class="form-field">
          <label>Total Time (hrs)</label>
          <input type="number" name="totalTime" placeholder="1.5" min="0" step="0.1" required />
        </div>
        <div class="form-field">
          <label>Day Landings</label>
          <input type="number" name="dayLandings" placeholder="1" min="0" step="1" value="0" />
        </div>
        <div class="form-field">
          <label>Night Landings</label>
          <input type="number" name="nightLandings" placeholder="0" min="0" step="1" value="0" />
        </div>
      </div>
      <div class="form-row">
        <div class="form-field">
          <label>From</label>
          <input type="text" name="from" placeholder="KAPA" maxlength="10" />
        </div>
        <div class="form-field">
          <label>To</label>
          <input type="text" name="to" placeholder="KADS" maxlength="10" />
        </div>
        <div class="form-field" style="flex:2;min-width:200px;">
          <label>Remarks</label>
          <input type="text" name="remarks" placeholder="Optional notes" />
        </div>
      </div>
      <div class="form-actions">
        <button type="submit" class="btn btn-sm">Save Flight</button>
        <button type="button" class="btn-cancel" onclick="toggleForm()">Cancel</button>
      </div>
    </form>
  </div>

  <div class="toast" id="toast"></div>

  <script>
    const lastUsedAircraft = ${JSON.stringify(lastUsedAircraft)};
    window.pilotlogAttestationMap = ${JSON.stringify(flightAttestationMap)};

    // State-driven dashboard — consumes /api/dashboard-state (pilotState -> dashboardState -> UI)
    (async function loadDashboard() {
      const COLOR = { current: '#22c55e', needs_attention: '#f59e0b', not_current: '#ef4444' };
      const BG    = { current: '#052e16', needs_attention: '#1c1203', not_current: '#1c0505' };
      const PRIORITY_COLOR = { critical: '#ef4444', high: '#f97316', medium: '#f59e0b', low: '#60a5fa' };

      try {
        const res = await fetch('/api/dashboard-state');
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const d = await res.json();

        // ── Chip ──────────────────────────────────────────────────────────────
        const chip = document.getElementById('readiness-chip');
        chip.style.background = BG[d.chipStatus] || BG.current;
        chip.style.color = COLOR[d.chipStatus] || COLOR.current;
        document.getElementById('readiness-dot').style.background = COLOR[d.chipStatus] || COLOR.current;
        document.getElementById('readiness-label').textContent = d.chipLabel;

        // Post-action feedback banner
        const justLogged = sessionStorage.getItem('airlog_just_logged');
        sessionStorage.removeItem('airlog_just_logged');
        const changedBanner = justLogged ? \`<div class="today-changed">✓ Flight logged. Readiness updated.</div>\` : '';

        // ── Today Card ────────────────────────────────────────────────────────
        const todayEl = document.getElementById('today-card');
        todayEl.style.display = 'block';
        if (!d.todayCard) {
          const fallback = d.recommendations?.[0] || 'Keep flying — every flight counts.';
          todayEl.innerHTML = \`\${changedBanner}
            <div class="today-card-header">
              <span class="phase-badge">\${d.phaseLabel}</span>
              <span class="urgency-badge none">On Track</span>
            </div>
            <div class="today-headline" style="color:#22c55e;">You are on track. Keep the momentum.</div>
            <div class="today-reason">\${fallback.slice(0,160)}</div>\`;
        } else {
          const c = d.todayCard;
          const urgencyClass = c.priority || 'none';
          todayEl.innerHTML = \`\${changedBanner}
            <div class="today-card-header">
              <span class="phase-badge">\${d.phaseLabel}</span>
              \${c.priority ? \`<span class="urgency-badge \${urgencyClass}">\${c.priority}</span>\` : ''}
            </div>
            <div class="today-headline">\${(c.title || '').slice(0,80)}</div>
            <div class="today-reason">\${(c.body || '').slice(0,160)}</div>
            <a class="today-cta" href="/pilot-report">View Pilot Report →</a>
            <div class="today-footer" style="margin-top:10px;">
              \${d.secondaryCards.map(sc => \`<span class="secondary-chip">\${(sc.title || '').slice(0,52)}</span>\`).join('')}
            </div>\`;
        }

        // ── Progression Bar ───────────────────────────────────────────────────
        const progBarEl = document.getElementById('progression-bar');
        if (d.progressPct !== undefined) {
          const pct = Math.max(0, Math.min(100, d.progressPct));
          progBarEl.innerHTML = \`
            <div class="progression-phase">
              <span>\${d.phaseLabel || 'Pilot'}</span>
              <span style="color:#b6b9c6;font-weight:600;">\${pct}%</span>
            </div>
            <div class="progression-track">
              <div class="progression-fill" style="width:\${pct}%;"></div>
            </div>\`;
          progBarEl.style.display = 'block';
        }

        // ── Readiness Scores ─────────────────────────────────────────────────
        const readinessScoresEl = document.getElementById('readiness-scores');
        if (d.readiness && Object.keys(d.readiness).length > 0) {
          const SCORE_COLOR = { ready: '#22c55e', close: '#f59e0b', building: '#9aa3ff', not_started: '#374151' };
          readinessScoresEl.innerHTML = Object.values(d.readiness).map(r => {
            const col = SCORE_COLOR[r.status] || '#6b7280';
            return \`<div class="readiness-score-item">
              <div class="readiness-score-label">\${(r.label || '').replace(' Readiness','')}</div>
              <div class="readiness-score-val" style="color:\${col};">\${r.score}%</div>
              <div class="readiness-score-track"><div class="readiness-score-fill" style="width:\${r.score}%;background:\${col};"></div></div>
            </div>\`;
          }).join('');
          readinessScoresEl.style.display = 'grid';
        }

        // ── Readiness Cards (guidance cards rendered as advisory lanes) ───────
        const container = document.getElementById('readiness-cards');
        const laneHtml = d.guidanceCards.slice(0,4).map(c => {
          const col = PRIORITY_COLOR[c.priority] || '#b6b9c6';
          const catLabel = (c.category || '').replace(/_/g,' ').toUpperCase();
          return \`<div class="currency-card">
            <div class="currency-card-header">
              <span class="currency-dot" style="background:\${col};"></span>
              <span class="currency-type">\${catLabel}</span>
              <span class="currency-status-label" style="color:\${col};">\${(c.priority || '').toUpperCase()}</span>
            </div>
            <div style="font-size:13px;font-weight:700;color:#fff;margin-bottom:4px;">\${c.title}</div>
            <div class="currency-message">\${(c.body || '').slice(0,120)}</div>
            <div class="currency-action">→ \${(c.action || '').slice(0,72)}</div>
          </div>\`;
        }).join('');
        container.innerHTML = laneHtml || '<div class="currency-card" style="color:#22c55e;font-size:13px;">All systems go — no active advisories.</div>';

      } catch (err) {
        document.getElementById('readiness-label').textContent = 'Unavailable';
        document.getElementById('readiness-cards').innerHTML =
          '<div class="currency-card" style="color:#ef4444;font-size:13px;">Could not load readiness data.</div>';
      }
    })();

    function toggleForm() {
      const form = document.getElementById('logForm');
      const btn = document.getElementById('openLogBtn');
      const open = form.classList.toggle('open');
      btn.textContent = open ? '✕ Cancel' : '+ Log Flight';
      if (open) form.querySelector('input[name="aircraftId"]').focus();
    }
    function openLogForm() {
      const form = document.getElementById('logForm');
      if (!form.classList.contains('open')) {
        form.classList.add('open');
        document.getElementById('openLogBtn').textContent = '✕ Cancel';
      }
      if (lastUsedAircraft) {
        const acInput = form.querySelector('input[name="aircraftId"]');
        if (!acInput.value) acInput.value = lastUsedAircraft;
      }
      form.scrollIntoView({ behavior: 'smooth', block: 'start' });
      form.querySelector('input[name="totalTime"]').focus();
    }
    async function submitFlight(e) {
      e.preventDefault();
      const btn = e.target.querySelector('button[type="submit"]');
      const origBtnText = btn.textContent;

      // 1. Require wallet session before doing anything
      let walletStatus = null;
      try {
        walletStatus = await fetch('/wallet/status').then(r => r.json());
      } catch (_) {}
      if (!walletStatus?.connected) {
        showToast('Connect wallet to save flight on-chain · Use the header button to connect', true);
        return;
      }

      // 2. Require 1AM extension
      const walletExt = window.midnight?.['1am'];
      if (!walletExt || typeof walletExt.connect !== 'function') {
        showToast('Wallet extension unavailable · Reconnect wallet to continue', true);
        return;
      }

      // 3. Build flight payload
      const fd = new FormData(e.target);
      const body = {
        aircraftId: fd.get('aircraftId').toUpperCase().trim(),
        date: fd.get('date'),
        totalTime: parseFloat(fd.get('totalTime')) || 0,
        dayLandings: parseInt(fd.get('dayLandings')) || 0,
        nightLandings: parseInt(fd.get('nightLandings')) || 0,
        from: (fd.get('from') || '').toUpperCase().trim(),
        to: (fd.get('to') || '').toUpperCase().trim(),
        remarks: (fd.get('remarks') || '').trim(),
      };

      // 4. Show "Saving to chain..."
      btn.textContent = 'Saving to chain...';
      btn.disabled = true;

      let txHash = null;
      let backfillTxId = null;
      let walletAddress = walletStatus?.session?.address || null;

      // ── BLOCK 1: wallet connect ───────────────────────────────────────────
      let connectedAPI, walletConfig;
      try {
        // AIR-178: log wallet presence at window.midnight['1am']
        console.log('[tx-debug] wallet detected (window.midnight[1am]):', typeof window !== 'undefined' && window.midnight && window.midnight['1am'] ? 'present' : 'not found');
        // 5. Connect wallet
        connectedAPI = await walletExt.connect('preprod');
        if (!connectedAPI) throw new Error('wallet.connect() returned null — wallet rejected connection');
        console.log('[tx-debug] step: wallet connected', connectedAPI);
        console.log('[tx-debug] connectedAPI type:', typeof connectedAPI);
        console.log('[tx-debug] connectedAPI keys:', connectedAPI ? Object.keys(connectedAPI) : 'null');
        console.log('[tx-debug] connectedAPI.getProvingProvider:', connectedAPI?.getProvingProvider);
        console.log('[tx-debug] connectedAPI.getShieldedAddresses:', connectedAPI?.getShieldedAddresses);
        console.log('[tx-debug] connectedAPI.balanceUnsealedTransaction:', connectedAPI?.balanceUnsealedTransaction);
        console.log('[tx-debug] connectedAPI.submitTransaction:', connectedAPI?.submitTransaction);

        // 7. Get wallet config (networkId, indexer, prover URIs)
        walletConfig = await connectedAPI.getConfiguration();
        console.log('[tx-debug] step: config loaded', walletConfig);
      } catch (err) {
        btn.textContent = origBtnText;
        btn.disabled = false;
        console.error('[tx-debug] wallet connect block failed', err.message, err.stack);
        console.error('[1AM] wallet tx error:', err.message);
        showToast('Failed to save flight · Retry or reconnect wallet', true);
        return;
      }

      // ── BLOCK 2: canonical hash ───────────────────────────────────────────
      let anchorHash;
      try {
        // 8. Build canonical hash of flight data (deterministic, sorted keys)
        const sortedEntries = Object.entries(body).sort(([a],[b]) => a.localeCompare(b));
        const canonical = JSON.stringify(Object.fromEntries(sortedEntries));
        const hashBuf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical));
        anchorHash = Array.from(new Uint8Array(hashBuf)).map(b => b.toString(16).padStart(2,'0')).join('');
        console.log('[tx-debug] step: anchor hash computed', anchorHash);
      } catch (err) {
        btn.textContent = origBtnText;
        btn.disabled = false;
        console.error('[tx-debug] hash block failed', err.message, err.stack);
        console.error('[1AM] wallet tx error:', err.message);
        showToast('Failed to save flight · Retry or reconnect wallet', true);
        return;
      }

      // ── BLOCK 3: SDK import + config + providers ──────────────────────────
      let setNetworkId, CompiledContract, submitCallTx, deployContractFn, httpClientProofProvider, indexerPublicDataProvider;
      let proofProvider, walletProvider, midnightProvider, publicDataProvider, zkConfigProvider;
      try {
        console.log('[tx-debug] step: providers start');
        // 9. Execute transaction via 1AM wallet (browser-only, no server involvement).
        //    Import from local pre-built bundle — avoids CDN bare-specifier errors for
        //    @midnight-ntwrk/compact-runtime (WASM) which CDN cannot inline properly.
        // AIR-143: CostModel and Transaction from ledger-v8 removed from SDK entry —
        // balanceTx uses a duck-typed proxy instead of Transaction.deserialize.
        ({ setNetworkId, CompiledContract, submitCallTx, deployContract: deployContractFn, CostModel, indexerPublicDataProvider } =
          await import('/js/midnight-sdk.js'));

        // AIR-135: Log each symbol immediately after SDK import to pinpoint undefined callables
        console.log('[tx-debug] SDK import complete');
        console.log('submitCallTx', submitCallTx);
        console.log('CompiledContract', CompiledContract);
        console.log('CompiledContract.make', CompiledContract?.make);
        console.log('CompiledContract.withVacantWitnesses', CompiledContract?.withVacantWitnesses);
        console.log('setNetworkId', setNetworkId);
        console.log('CostModel', CostModel);

        setNetworkId(walletConfig.networkId);

        // ZK config provider: fetch prover key, verifier key, and IR from static assets.
        // AIR-181: declared in outer scope so it's accessible in BLOCK 5 (deployContractFn call).
        zkConfigProvider = {
          async get(circuitId) {
            console.log('[zk-debug] get called:', circuitId);
            const proverUrl = \`/contract/compiled/airlog/keys/\${circuitId}.prover\`;
            const verifierUrl = \`/contract/compiled/airlog/keys/\${circuitId}.verifier\`;
            const zkirUrl = \`/contract/compiled/airlog/zkir/\${circuitId}.bzkir\`;

            console.log('[tx-debug] zkConfigProvider.get circuitId:', circuitId);
            console.log('[tx-debug] fetch prover:', proverUrl);
            let proverRes;
            try {
              proverRes = await fetch(proverUrl);
              console.log('[tx-debug] prover response:', proverRes.status, proverRes.ok);
            } catch (e) {
              console.error('[tx-debug] FETCH FAILED prover:', proverUrl, e.message);
              throw e;
            }

            console.log('[tx-debug] fetch verifier:', verifierUrl);
            let verifierRes;
            try {
              verifierRes = await fetch(verifierUrl);
              console.log('[tx-debug] verifier response:', verifierRes.status, verifierRes.ok);
            } catch (e) {
              console.error('[tx-debug] FETCH FAILED verifier:', verifierUrl, e.message);
              throw e;
            }

            console.log('[tx-debug] fetch zkir:', zkirUrl);
            let zkirRes;
            try {
              zkirRes = await fetch(zkirUrl);
              console.log('[tx-debug] zkir response:', zkirRes.status, zkirRes.ok);
            } catch (e) {
              console.error('[tx-debug] FETCH FAILED zkir:', zkirUrl, e.message);
              throw e;
            }

            if (!proverRes.ok) throw new Error(\`ZK prover key not found: \${circuitId} (status \${proverRes.status})\`);
            if (!verifierRes.ok) throw new Error(\`ZK verifier key not found: \${circuitId} (status \${verifierRes.status})\`);
            if (!zkirRes.ok) throw new Error(\`ZK IR not found: \${circuitId} (status \${zkirRes.status})\`);
            const [proverKey, verifierKey, zkir] = await Promise.all([
              proverRes.arrayBuffer().then(b => new Uint8Array(b)),
              verifierRes.arrayBuffer().then(b => new Uint8Array(b)),
              zkirRes.arrayBuffer().then(b => new Uint8Array(b)),
            ]);
            console.log('[tx-debug] zk assets loaded ok:', circuitId, { proverKey: proverKey.length, verifierKey: verifierKey.length, zkir: zkir.length });
            return { circuitId, proverKey, verifierKey, zkir };
          },
          // AIR-180: SDK's makeAdaptedReader calls getVerifierKey(circuitId) during deploy.
          // Our provider only had get(circuitId), causing ZKConfigurationReadError on deploy.
          async getVerifierKey(circuitId) {
            console.log('[zk-debug] getVerifierKey called:', circuitId);
            const verifierUrl = \`/contract/compiled/airlog/keys/\${circuitId}.verifier\`;
            console.log('[tx-debug] getVerifierKey fetch:', verifierUrl);
            const res = await fetch(verifierUrl);
            if (!res.ok) throw new Error(\`ZK verifier key not found: \${circuitId} (status \${res.status})\`);
            return new Uint8Array(await res.arrayBuffer());
          },
          // AIR-225: getProvingProvider calls getZKIR and getProverKey directly on the provider.
          // Missing these caused: TypeError: e.getZKIR is not a function
          async getZKIR(circuitId) {
            console.log('[zk-debug] getZKIR called:', circuitId);
            const zkirUrl = \`/contract/compiled/airlog/zkir/\${circuitId}.bzkir\`;
            console.log('[tx-debug] getZKIR fetch:', zkirUrl);
            const res = await fetch(zkirUrl);
            if (!res.ok) throw new Error(\`ZK IR not found: \${circuitId} (status \${res.status})\`);
            return new Uint8Array(await res.arrayBuffer());
          },
          async getProverKey(circuitId) {
            console.log('[zk-debug] getProverKey called:', circuitId);
            const proverUrl = \`/contract/compiled/airlog/keys/\${circuitId}.prover\`;
            console.log('[tx-debug] getProverKey fetch:', proverUrl);
            const res = await fetch(proverUrl);
            if (!res.ok) throw new Error(\`ZK prover key not found: \${circuitId} (status \${res.status})\`);
            return new Uint8Array(await res.arrayBuffer());
          },
        };

        // AIR-178: browser-safe hex helpers (no Buffer / no .toString('hex'))
        const bytesToHex = (bytes) => Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');

        // AIR-223: Official 1AM pattern — wallet routes all proofs through ProofStation.
        // api.getProvingProvider(zkConfigProvider) returns a circuit-level ProvingProvider.
        // We wrap it with proveTx() so it satisfies the ProofProvider interface expected
        // by deployContract / submitCallTx.
        console.log('[tx-debug] building provingProvider via api.getProvingProvider');
        const provingProvider = await connectedAPI.getProvingProvider(zkConfigProvider);
        proofProvider = {
          async proveTx(unprovenTx) {
            console.log('[tx-debug] proofProvider.proveTx: calling unprovenTx.prove');
            return unprovenTx.prove(provingProvider, CostModel.initialCostModel());
          },
        };
        console.log('[tx-debug] proofProvider.proveTx:', typeof proofProvider?.proveTx);

        // AIR-247: log raw result before field extraction
        console.log('[tx-debug] typeof connectedAPI.getShieldedAddresses:', typeof connectedAPI.getShieldedAddresses);
        const shielded = await connectedAPI.getShieldedAddresses();
        try {
          console.log('[tx-debug] getShieldedAddresses RAW keys:', shielded ? Object.keys(shielded) : 'null/undefined');
          console.log('[tx-debug] getShieldedAddresses RAW result:', JSON.stringify(shielded));
        } catch (_) {
          console.log('[tx-debug] getShieldedAddresses RAW result (non-serializable):', String(shielded));
        }
        console.log('[tx-debug] shieldedCoinPublicKey:', shielded?.shieldedCoinPublicKey ? '(present)' : 'null');
        console.log('[tx-debug] shieldedEncryptionPublicKey:', shielded?.shieldedEncryptionPublicKey ? '(present)' : 'null');
        walletAddress = shielded.shieldedCoinPublicKey || walletAddress;

        walletProvider = {
          getCoinPublicKey: () => shielded.shieldedCoinPublicKey,
          getEncryptionPublicKey: () => shielded.shieldedEncryptionPublicKey,
          async balanceTx(tx) {
            // AIR-178: browser-safe — no Buffer.toString('hex')
            const serialized = tx.serialize();
            console.log('[tx-debug] balanceTx: tx.serialize() type:', serialized?.constructor?.name, 'length:', serialized?.length);
            const hex = bytesToHex(serialized);
            // AIR-202: instrument elapsed time and enforce 90s timeout so a hung 1AM
            // wallet connection fails fast instead of blocking the deploy indefinitely.
            const balanceTxStart = Date.now();
            console.log('[balanceTx] calling balanceUnsealedTransaction — start');
            const BALANCE_TX_TIMEOUT_MS = 90_000;
            const result = await Promise.race([
              connectedAPI.balanceUnsealedTransaction(hex),
              new Promise((_, reject) =>
                setTimeout(
                  () => reject(new Error('[balanceTx] timed out after ' + (BALANCE_TX_TIMEOUT_MS / 1000) + 's — 1AM wallet did not respond')),
                  BALANCE_TX_TIMEOUT_MS
                )
              ),
            ]);
            console.log('[balanceTx] balanceUnsealedTransaction resolved in', Date.now() - balanceTxStart, 'ms');
            // AIR-143: avoid Transaction.deserialize (ledger-v8/WASM, Node-only).
            // Return a duck-typed proxy that satisfies the serialize()/identifiers() contract
            // expected by midnightProvider.submitTx without importing ledger-v8 at the entry.
            const balancedBytes = new Uint8Array(result.tx.match(/.{2}/g).map(b => parseInt(b, 16)));
            return {
              // AIR-178: return Uint8Array directly — no Buffer.from()
              serialize: () => balancedBytes,
              identifiers: () => [result.txId ?? result.tx.slice(0, 64)],
            };
          },
        };

        midnightProvider = {
          async submitTx(tx) {
            // AIR-178: browser-safe — no Buffer.toString('hex')
            const serialized = tx.serialize();
            console.log('[tx-debug] submitTx: tx.serialize() type:', serialized?.constructor?.name, 'length:', serialized?.length);
            console.log('[tx-debug] submitTx: submission start');
            const hex = bytesToHex(serialized);
            const submitResult = await connectedAPI.submitTransaction(hex);
            console.log('[tx-debug] submitTx: submission result:', submitResult);
            return tx.identifiers()[0];
          },
        };

        // AIR-165: publicDataProvider is required by submitCallTx to call
        // queryZSwapAndContractState. Omitting it causes:
        // TypeError: Cannot read properties of undefined (reading 'queryZSwapAndContractState')
        // Derive indexer URLs from wallet config (1AM wallet provides these via getConfiguration()).
        const indexerHttpUrl = walletConfig.indexerUri
          || \`https://indexer.\${walletConfig.networkId}.midnight.network/api/v4/graphql\`;
        const indexerWsUrl = walletConfig.indexerWsUri
          || indexerHttpUrl.replace(/^https/, 'wss').replace(/^http/, 'ws');
        console.log('[tx-debug] indexer HTTP:', indexerHttpUrl);
        console.log('[tx-debug] indexer WS:', indexerWsUrl);
        publicDataProvider = indexerPublicDataProvider(indexerHttpUrl, indexerWsUrl);

        console.log('[tx-debug] step: providers built');
      } catch (err) {
        btn.textContent = origBtnText;
        btn.disabled = false;
        console.error('[tx-debug] provider setup block failed', err.message, err.stack);
        console.error('[1AM] wallet tx error:', err.message);
        showToast('Failed to save flight · Retry or reconnect wallet', true);
        return;
      }

      // ── BLOCK 4: compiled contract construction ───────────────────────────
      let compiledContract;
      try {
        console.log('[tx-debug] step: compiled contract start');
        // Load contract class and build a proper CompiledContract via 1AM SDK pattern.
        // DApp builds tx → wallet proves → wallet balances → wallet submits.
        // Contract bundle has compact-runtime + WASM inlined (no bare specifiers).
        const contractMod = await import('/contract/compiled/airlog/index.js');
        const { Contract } = contractMod;

        // AIR-227: Bridge cross-WASM ContractMaintenanceAuthority mismatch.
        // ContractMaintenanceAuthority and ContractState are NOT exported from the
        // bundled contract module, so we cannot reference their classes directly.
        // Instead, wrap Contract.prototype.initialState to intercept the returned
        // ContractState instance at runtime, extract the CMA class from its prototype
        // (via the maintenanceAuthority getter), and patch the setter to bridge
        // cross-WASM CMAs via serialize/deserialize.
        {
          let cmaPatched = false;
          const origInitialState = Contract.prototype.initialState;
          Contract.prototype.initialState = function(context, ...args) {
            const result = origInitialState.call(this, context, ...args);
            if (!cmaPatched && result?.currentContractState) {
              const cs = result.currentContractState;
              const proto = Object.getPrototypeOf(cs);
              const desc = Object.getOwnPropertyDescriptor(proto, 'maintenanceAuthority');
              if (desc && desc.set) {
                // Get the CMA class from the getter. Even if the initial state has no
                // CMA set (ptr=0), __wrap(0) returns an object whose constructor is
                // the contract-native ContractMaintenanceAuthority class.
                let CMAClass = null;
                try {
                  const inst = desc.get.call(cs);
                  if (inst) CMAClass = inst.constructor;
                } catch (_) { /* getter may throw for null pointer */ }

                Object.defineProperty(proto, 'maintenanceAuthority', {
                  get: desc.get,
                  set(authority) {
                    if (!authority || (CMAClass && authority instanceof CMAClass)) {
                      desc.set.call(this, authority);
                    } else if (CMAClass && typeof authority.serialize === 'function') {
                      // Cross-WASM: bridge by serializing and deserializing into the
                      // contract's own ContractMaintenanceAuthority class.
                      desc.set.call(this, CMAClass.deserialize(authority.serialize()));
                    } else {
                      desc.set.call(this, authority);
                    }
                  },
                  configurable: true,
                  enumerable: desc.enumerable,
                });
                cmaPatched = true;
                console.log('[AIR-227] ContractState.maintenanceAuthority setter patched for cross-WASM CMA');
              }
            }
            return result;
          };
        }

        compiledContract = CompiledContract
          .make('AirLog', Contract)
          .pipe(
            CompiledContract.withVacantWitnesses,
            CompiledContract.withCompiledFileAssets('/contract/compiled/airlog')
          );
        console.log('[tx-debug] step: compiled contract built', compiledContract);
      } catch (err) {
        btn.textContent = origBtnText;
        btn.disabled = false;
        console.error('[tx-debug] compiled contract block failed', err.message, err.stack);
        console.error('[1AM] wallet tx error:', err.message);
        showToast('Failed to save flight · Retry or reconnect wallet', true);
        return;
      }

      // ── BLOCK 5: ensure contract + submitCallTx ───────────────────────────
      try {
        // AIR-208: deployment.json is the source of truth. Always fetch it first.
        // localStorage stale address must NOT override a valid deployment.json entry.
        let contractAddress = null;
        let contractAddressSource = 'none';
        let deploymentNetworkId = null;

        try {
          const deployRes = await fetch('/deployment.json');
          if (deployRes.ok) {
            const deployData = await deployRes.json();
            if (deployData?.contractAddress) {
              contractAddress = deployData.contractAddress;
              contractAddressSource = 'deployment.json';
              deploymentNetworkId = deployData.networkId || null;
              // Keep localStorage in sync so deploy-on-first-save still works
              localStorage.setItem('airlog.contractAddress', contractAddress);
              console.log('[tx] contractAddress from deployment.json:', contractAddress);
            }
          }
        } catch (deployFetchErr) {
          console.warn('[tx] could not fetch deployment.json:', deployFetchErr.message);
        }

        // Fall back to localStorage only when deployment.json has no address
        if (!contractAddress) {
          const lsAddr = localStorage.getItem('airlog.contractAddress');
          if (lsAddr) {
            contractAddress = lsAddr;
            contractAddressSource = 'localStorage';
            console.warn('[tx] contractAddress from localStorage (deployment.json unavailable):', contractAddress);
          }
        }

        // Log resolution summary for debugging
        const walletNetworkId = walletConfig.networkId || 'unknown';
        console.log('[tx] address-source:', contractAddressSource);
        console.log('[tx] deployment networkId:', deploymentNetworkId || '(not stored)');
        console.log('[tx] wallet networkId:', walletNetworkId);
        console.log('[tx] circuitId: anchorEntry');

        // Network mismatch check: if deployment.json recorded a networkId, it must match wallet
        if (deploymentNetworkId && deploymentNetworkId !== walletNetworkId) {
          const msg = \`Contract network mismatch: deployment is "\${deploymentNetworkId}" but wallet is "\${walletNetworkId}". Clear localStorage or redeploy for this network.\`;
          console.error('[tx] NETWORK MISMATCH:', msg);
          showToast(msg, true);
          btn.textContent = origBtnText;
          return;
        }

        if (!contractAddress) {
          // No contract deployed yet — deploy now via wallet (deploy-on-first-save)
          console.log('[tx] no contract found -> deploying');
          btn.textContent = 'Deploying contract…';

          console.log('[deploy] deploy started');
          // AIR-181: Verify zkConfigProvider is wired into providers before deployContract.
          // SDK's makeAdaptedReader reads providers.zkConfigProvider.getVerifierKey() — omitting
          // this key causes ZKConfigurationReadError on every deploy attempt.
          console.log('[zk-debug] providers.zkConfigProvider exists:', !!zkConfigProvider);
          console.log('[zk-debug] typeof providers.zkConfigProvider.getVerifierKey:', typeof zkConfigProvider?.getVerifierKey);
          console.log('[zk-debug] providers keys:', ['proofProvider', 'walletProvider', 'midnightProvider', 'publicDataProvider', 'zkConfigProvider'].join(', '));

          // AIR-200: 1AM submitTransaction() returns void — the SDK's internal submitTx calls
          // publicDataProvider.watchForTxData(txId) which waits forever when txId is undefined.
          // Fix: pass a deploy-specific publicDataProvider that resolves watchForTxData immediately
          // after submission (returning SucceedEntirely), and a no-op privateStateProvider.
          // contractAddress comes from unprovenDeployTxData.public (computed pre-submit by SDK),
          // so it is available in deployed.deployTxData.public.contractAddress regardless.
          const deployPublicDataProvider = {
            queryZSwapAndContractState: (...args) => publicDataProvider.queryZSwapAndContractState(...args),
            watchForTxData: async (txId) => {
              console.log('[deploy] watchForTxData called with txId:', txId, '— resolving immediately (AIR-200)');
              return { status: 'SucceedEntirely' };
            },
          };
          const deployPrivateStateProvider = {
            setContractAddress: (addr) => { console.log('[deploy] privateStateProvider.setContractAddress:', addr); },
            set: async () => {},
            setSigningKey: async () => {},
            getContractAddress: () => null,
            get: async () => null,
          };

          let deployed;
          try {
            deployed = await deployContractFn(
              { proofProvider, walletProvider, midnightProvider, publicDataProvider: deployPublicDataProvider, zkConfigProvider, privateStateProvider: deployPrivateStateProvider },
              { compiledContract }
            );
          } catch (deployErr) {
            console.error('[deploy] deployContractFn threw:', deployErr.message, deployErr.stack);
            throw deployErr;
          }

          console.log('[deploy] raw deploy result:', JSON.stringify(deployed, (_, v) => typeof v === 'bigint' ? v.toString() : v, 2));
          contractAddress = deployed?.deployTxData?.public?.contractAddress;
          console.log('[deploy] contractAddress from result:', contractAddress);
          if (!contractAddress) throw new Error('Deploy returned no contractAddress — see raw result above');

          console.log('[deploy] storing contract address');
          localStorage.setItem('airlog.contractAddress', contractAddress);
          console.log('[deploy] contract address stored in localStorage:', localStorage.getItem('airlog.contractAddress'));
          console.log('[deploy] contract deployed:', contractAddress);

          // Persist to backend as well (best-effort, do not await — do not block submitCallTx)
          // AIR-208: also persist networkId so future sessions can detect network mismatch
          fetch('/deployment', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contractAddress, networkId: walletConfig.networkId }),
          }).catch(() => {});

        }

        console.log('[tx] using contract:', contractAddress);

        // Poll indexer until the contract state cell (result[1]) is non-null before calling submitCallTx.
        // Runs for every address source: localStorage, deployment.json, and fresh deploy.
        // queryZSwapAndContractState returns [zswapState, contractState, ledgerParams] or null.
        // The outer tuple can be truthy while result[1] (contractState) is still null when the indexer
        // has the tx but hasn't propagated state — submitCallTx throws "expected a cell, received null"
        // in that case. We must wait for result[1] to be non-null before proceeding.
        {
          const maxAttempts = 20;
          const intervalMs = 5000;
          let indexed = false;
          btn.textContent = 'Syncing…';
          console.log('[tx] validating contract state cell for:', contractAddress);
          for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            const queryResult = await publicDataProvider.queryZSwapAndContractState(contractAddress).catch(() => null);
            const contractStateCell = queryResult ? queryResult[1] : null;
            console.log('[tx] result[1] (contractState):', contractStateCell === null ? 'null' : contractStateCell === undefined ? 'undefined' : typeof contractStateCell);
            if (contractStateCell !== null && contractStateCell !== undefined) {
              indexed = true;
              console.log('[tx] contract state cell confirmed (attempt ' + attempt + ')');
              break;
            }
            console.log('[tx] contract state cell not ready (' + attempt + '/' + maxAttempts + '), retrying in ' + (intervalMs / 1000) + 's…');
            btn.textContent = 'Syncing… (' + attempt + '/' + maxAttempts + ')';
            await new Promise(r => setTimeout(r, intervalMs));
          }
          if (!indexed) {
            // AIR-210: Contract state cell never appeared — stored address is stale (e.g. after preprod network reset).
            // Redeploy a fresh contract and continue with the new address.
            console.warn('[tx] stale contract detected (state cell null after ' + maxAttempts + ' attempts) — redeploying');
            btn.textContent = 'Redeploying contract…';
            const deployPublicDataProvider2 = {
              queryZSwapAndContractState: (...args) => publicDataProvider.queryZSwapAndContractState(...args),
              watchForTxData: async (txId) => {
                console.log('[redeploy] watchForTxData:', txId, '— resolving immediately (AIR-210)');
                return { status: 'SucceedEntirely' };
              },
            };
            const deployPrivateStateProvider2 = {
              setContractAddress: (addr) => { console.log('[redeploy] privateStateProvider.setContractAddress:', addr); },
              set: async () => {},
              setSigningKey: async () => {},
              getContractAddress: () => null,
              get: async () => null,
            };
            let redeployed;
            try {
              redeployed = await deployContractFn(
                { proofProvider, walletProvider, midnightProvider, publicDataProvider: deployPublicDataProvider2, zkConfigProvider, privateStateProvider: deployPrivateStateProvider2 },
                { compiledContract }
              );
            } catch (redeployErr) {
              console.error('[redeploy] deployContractFn threw:', redeployErr.message);
              throw redeployErr;
            }
            contractAddress = redeployed?.deployTxData?.public?.contractAddress;
            if (!contractAddress) throw new Error('Redeploy returned no contractAddress — see console for raw result');
            console.log('[redeploy] new contractAddress:', contractAddress);
            localStorage.setItem('airlog.contractAddress', contractAddress);
            fetch('/deployment', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ contractAddress, networkId: walletConfig.networkId }),
            }).catch(() => {});

            // AIR-211: Poll new contract's state cell before submitCallTx — same race
            // condition applies to freshly-redeployed contracts as to pre-existing ones.
            {
              const maxAttempts2 = 20;
              const intervalMs2 = 5000;
              let indexed2 = false;
              btn.textContent = 'Syncing new contract…';
              console.log('[redeploy] waiting for new contract state cell:', contractAddress);
              for (let attempt = 1; attempt <= maxAttempts2; attempt++) {
                const queryResult2 = await publicDataProvider.queryZSwapAndContractState(contractAddress).catch(() => null);
                const stateCell2 = queryResult2 ? queryResult2[1] : null;
                console.log('[redeploy] result[1] attempt ' + attempt + ':', stateCell2 === null ? 'null' : stateCell2 === undefined ? 'undefined' : typeof stateCell2);
                if (stateCell2 !== null && stateCell2 !== undefined) {
                  indexed2 = true;
                  console.log('[redeploy] new contract state cell confirmed (attempt ' + attempt + ')');
                  break;
                }
                if (attempt < maxAttempts2) await new Promise(r => setTimeout(r, intervalMs2));
              }
              if (!indexed2) {
                throw new Error('[redeploy] new contract state cell never appeared after ' + maxAttempts2 + ' attempts — cannot submit');
              }
            }
          }
        }

        btn.textContent = 'Submitting flight entry…';

        console.log('[tx] submitting flight entry');
        const recordHashBytes = new Uint8Array(anchorHash.match(/.{2}/g).map(b => parseInt(b, 16)));
        const anchoredAt = BigInt(Math.floor(Date.now() / 1000));

        // AIR-213: submitCallTx requires a privateStateProvider + privateStateId.
        // The SDK calls privateStateProvider.get(privateStateId) and asserts non-null.
        // AirLog private state is empty ({}) — use an in-memory provider seeded here.
        const _callPrivateStateStore = new Map();
        const callPrivateStateProvider = {
          setContractAddress: (addr) => { console.log('[tx-debug] callPrivateStateProvider.setContractAddress:', addr); },
          getContractAddress: () => contractAddress,
          get: async (id) => _callPrivateStateStore.get(id) ?? null,
          set: async (id, val) => { _callPrivateStateStore.set(id, val); },
          setSigningKey: async (addr, key) => { _callPrivateStateStore.set('__signingKey__' + addr, key); },
          getSigningKey: async (addr) => _callPrivateStateStore.get('__signingKey__' + addr) ?? null,
        };
        // Seed initial empty private state so the SDK find it on get()
        await callPrivateStateProvider.set('airlogPrivateState', {});
        console.log('[tx-debug] AIR-213: in-memory privateStateProvider seeded with empty private state');

        // AIR-277: Pre-proving state diagnostic — log the actual on-chain nextEntryId BEFORE
        // submitCallTx starts proving, so we can confirm whether the contract state is hydrated
        // from the indexer or silently falls back to empty/default state (MAP_KEY_PRESENT root cause).
        try {
          console.log('[air-277] === PRE-PROVING STATE DIAGNOSTIC ===');
          const rawStateResult = await publicDataProvider.queryZSwapAndContractState(contractAddress).catch(e => {
            console.error('[air-277] queryZSwapAndContractState threw:', e?.message);
            return null;
          });
          if (rawStateResult === null) {
            console.warn('[air-277] queryZSwapAndContractState returned null — state hydration FAILED; proving will use empty/default state');
          } else {
            const contractStateCell = rawStateResult[1];
            console.log('[air-277] contractState cell present?', contractStateCell !== null && contractStateCell !== undefined);
            console.log('[air-277] contractState type:', typeof contractStateCell);
            console.log('[air-277] contractState keys:', contractStateCell && typeof contractStateCell === 'object' ? Object.keys(contractStateCell).join(',') : 'n/a');
            if (contractStateCell?.data) {
              console.log('[air-277] contractState.data type:', typeof contractStateCell.data);
              try {
                // contractMod was const-scoped inside BLOCK 4's try — re-import here.
                // ES module cache guarantees the same module instance at zero reload cost.
                const diagMod = await import('/contract/compiled/airlog/index.js');
                console.log('[air-277] diagMod keys:', Object.keys(diagMod).join(','));
                // The compiled contract exports ContractModule as Airlog.
                // Airlog.ledger(data) deserializes raw ContractState.data into typed ledger.
                const AirlogMod = diagMod.Airlog;
                if (!AirlogMod || typeof AirlogMod.ledger !== 'function') {
                  console.error('[air-277] Airlog.ledger is not a function — module shape:', AirlogMod ? Object.keys(AirlogMod).join(',') : 'undefined');
                } else {
                  const ledgerState = AirlogMod.ledger(contractStateCell.data);
                  const COUNTER_KEY = BigInt(0);
                  const hasMember = ledgerState.nextEntryId.member(COUNTER_KEY);
                  const nextId = hasMember ? ledgerState.nextEntryId.lookup(COUNTER_KEY) : null;
                  console.log('[air-277] nextEntryId.member(0):', hasMember, '— hydrated from chain?', hasMember, '— nextId:', nextId !== null ? String(nextId) : 'unset (empty state)');
                  if (nextId !== null) {
                    const entryExists = ledgerState.entryStore.member(nextId);
                    console.log('[air-277] entryStore.member(nextId=' + String(nextId) + '):', entryExists, entryExists ? '⚠ KEY COLLISION — this would cause MAP_KEY_PRESENT (error 115)' : '✓ key is free');
                  } else {
                    const id0Exists = ledgerState.entryStore.member(COUNTER_KEY);
                    console.log('[air-277] nextId is unset (empty state) — entryStore.member(0):', id0Exists, id0Exists ? '⚠ KEY COLLISION — empty state proves against id=0 but entryStore[0] already exists on-chain' : '✓ no collision at id=0');
                  }
                }
              } catch (ledgerErr) {
                console.error('[air-277] ledger() deserialization FAILED:', ledgerErr?.message);
                console.error('[air-277] This means the Compact runtime will prove against empty/default state → MAP_KEY_PRESENT');
              }
            } else {
              console.warn('[air-277] contractState.data is absent/null — no ledger state to deserialize; proving will use empty state');
            }
          }
          console.log('[air-277] === END PRE-PROVING STATE DIAGNOSTIC ===');
        } catch (diagErr) {
          console.error('[air-277] pre-proving diagnostic failed (non-fatal):', diagErr?.message);
        }

        // AIR-214: Wrap publicDataProvider for submitCallTx with a logging+retry proxy.
        // queryZSwapAndContractState returns [zswapState, contractState, ledgerParams] but the
        // SDK calls deserializeContractState(state) with NO null guard on state — if the indexer
        // has the contract action but state is still null, deserializeContractState(null) may
        // return a truthy-but-empty ContractState that passes our outer poll check yet causes
        // "expected a cell, received null" inside the WASM runtime (transactionContext cell null).
        // This proxy logs the raw tuple and retries up to 5 times if result or result[1] is null.
        const callPublicDataProvider = {
          ...publicDataProvider,
          queryZSwapAndContractState: async (addr, ...rest) => {
            const maxRetries = 5;
            const retryDelayMs = 3000;
            let lastResult = null;
            for (let attempt = 1; attempt <= maxRetries; attempt++) {
              lastResult = await publicDataProvider.queryZSwapAndContractState(addr, ...rest).catch(e => {
                console.error('[tx-debug][AIR-214] queryZSwapAndContractState threw:', e.message);
                return null;
              });
              const stateCell = lastResult ? lastResult[1] : null;
              const dataProp = stateCell && typeof stateCell === 'object' ? stateCell.data : undefined;
              console.log('[tx-debug][AIR-214] queryZSwapAndContractState attempt', attempt,
                'addr:', addr,
                'result null?', lastResult === null,
                'result[1] null?', stateCell === null,
                'result[1] type:', stateCell === null ? 'null' : stateCell === undefined ? 'undefined' : typeof stateCell,
                'result[1] keys:', stateCell && typeof stateCell === 'object' ? Object.keys(stateCell).join(',') : 'n/a',
                'result[1].data type:', dataProp === undefined ? 'absent' : typeof dataProp,
                'result[1].data byteLength:', dataProp instanceof Uint8Array ? dataProp.byteLength : (dataProp && typeof dataProp === 'object' && dataProp.byteLength !== undefined ? dataProp.byteLength : 'n/a')
              );
              if (lastResult !== null && stateCell !== null && stateCell !== undefined) {
                return lastResult;
              }
              if (attempt < maxRetries) {
                console.warn('[tx-debug][AIR-214] contractState cell null — retrying in', retryDelayMs / 1000, 's');
                await new Promise(r => setTimeout(r, retryDelayMs));
              }
            }
            console.error('[tx-debug][AIR-214] contractState cell still null after', maxRetries, 'retries — proceeding anyway');
            return lastResult;
          },
          // AIR-230: Use real watchForTxData with timeout to capture the real txHash from the indexer.
          // If the indexer confirms within 45s we get txHash for the Explorer link.
          // If it times out (indexer lag or undefined txId), fall back gracefully (AIR-229 guard).
          watchForTxData: async (txId) => {
            console.log('[ui-sync] watchForTxData called for txId:', txId);
            if (!txId || String(txId) === 'undefined') {
              console.log('[ui-sync] txId invalid — resolving immediately as submitted');
              return { status: 'SucceedEntirely', txId: null };
            }
            const WATCH_TIMEOUT_MS = 45_000;
            try {
              const realResult = await Promise.race([
                publicDataProvider.watchForTxData(txId),
                new Promise((resolve) =>
                  setTimeout(
                    () => resolve({ status: 'SucceedEntirely', txId, timedOut: true }),
                    WATCH_TIMEOUT_MS
                  )
                ),
              ]);
              if (realResult?.timedOut) {
                console.log('[ui-sync] watchForTxData timed out after', WATCH_TIMEOUT_MS / 1000, 's — treating as submitted');
              } else {
                console.log('[ui-sync] watchForTxData confirmed — txHash:', realResult?.txHash);
              }
              return realResult;
            } catch (err) {
              console.warn('[ui-sync] watchForTxData error:', err.message, '— resolving as submitted');
              return { status: 'SucceedEntirely', txId };
            }
          },
        };

        const result = await submitCallTx(
          { proofProvider, walletProvider, midnightProvider, publicDataProvider: callPublicDataProvider, privateStateProvider: callPrivateStateProvider },
          { compiledContract, contractAddress, circuitId: 'anchorEntry', privateStateId: 'airlogPrivateState', args: [recordHashBytes, anchoredAt] }
        );
        console.log('[ui-sync] submitCallTx resolved', result);

        // AIR-233: Only use real blockchain txHash for explorer link — never use txId (Midnight contract identifier).
        // txId is a local contract identifier (e.g. midnight:transaction[v9](...)) and is NOT a valid explorer hash.
        // watchForTxData returns { txHash: transaction.hash, ... } — only that is a real on-chain hash.
        txHash = result?.txHash || result?.public?.txHash || ('submitted-' + Date.now());
        // AIR-234: If watchForTxData timed out, capture txId so we can backfill the real txHash in the background.
        backfillTxId = (!result?.txHash && !result?.public?.txHash && result?.txId) ? String(result.txId) : null;
        console.log('[tx] tx ref:', txHash, 'backfillTxId:', backfillTxId);

        // Chain confirmation success — update button immediately
        btn.textContent = 'Saved to chain';
        btn.disabled = false;
        showToast('Flight anchored on-chain — saving record...');

        // AIR-228/AIR-230: Immediately prepend local entry row so table updates without waiting for server.
        // If txHash is real (not fallback), show "Saved to chain" badge with View link.
        const isRealHash = txHash && !txHash.startsWith('submitted-');
        const explorerUrl = isRealHash ? \`https://explorer.1am.xyz/tx/\${txHash}?network=preprod\` : null;
        const pendingBadge = isRealHash
          ? \`<span style="color:#22c55e;font-size:11px;font-weight:600;">&#x2713; Saved to chain (PreProd)</span><br><a href="\${explorerUrl}" target="_blank" rel="noopener" style="color:#7c3aed;font-size:10px;font-weight:500;text-decoration:none;">View on chain →</a>\`
          : '<span style="color:#a78bfa;font-size:11px;font-weight:600;">&#x29D6; Submitted</span>';
        console.log('[ui-sync] inserting pending row, isRealHash:', isRealHash);
        const tbody = document.getElementById('recent-flights-tbody');
        if (tbody) {
          const newRow = \`<tr id="airlog-pending-row">
            <td>\${body.date}</td>
            <td>\${body.aircraftId}</td>
            <td>\${body.from || ''} → \${body.to || ''}</td>
            <td>\${body.totalTime}</td>
            <td></td>
            <td class="muted">\${(body.remarks || '').replaceAll('<','&lt;').replaceAll('>','&gt;')}</td>
            <td>\${pendingBadge}</td>
          </tr>\`;
          // Remove stale placeholder if present
          const emptyRow = tbody.querySelector('td[colspan="8"]');
          if (emptyRow) tbody.innerHTML = '';
          tbody.insertAdjacentHTML('afterbegin', newRow);
        }
        console.log('[tx-debug] AIR-230: local row prepended, txHash:', txHash);

      } catch (err) {
        btn.textContent = origBtnText;
        btn.disabled = false;
        console.error('[tx] block failed', err.message, err.stack);
        const isEmptyStateError = err.message && err.message.includes('No public state found');
        // AIR-277: error 115 = chain rejected proof due to stale verifier key (contract was
        // recompiled after deployment). Auto-clear the stored contract address so the next
        // save triggers a fresh deploy with the current ZK keys.
        const isVerifierMismatch = err.message && (
          err.message.includes('Custom error: 115') ||
          err.message.includes('custom error: 115') ||
          err.message.includes('error 115')
        );
        if (isVerifierMismatch) {
          console.warn('[tx] error 115 detected — clearing stale contract address for redeploy');
          localStorage.removeItem('airlog.contractAddress');
          fetch('/deployment', { method: 'DELETE' }).catch(() => {});
          showToast('Contract state mismatch — save again to anchor on fresh contract', true);
          return;
        }
        showToast(isEmptyStateError
          ? 'Contract not yet synced — please wait 30 seconds and retry'
          : 'Chain submit failed · Retry or reconnect wallet', true);
        return;
      }

      // 10. Only save entry locally after successful on-chain tx
      let res;
      try {
        res = await fetch('/entries', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...body, txHash, walletAddress }),
        });
      } catch (netErr) {
        // Network error on local save — chain write succeeded, don't lose that info
        console.error('[save] local save network error:', netErr.message);
        showToast('Saved to chain — local save failed · Refresh to sync', true);
        e.target.reset();
        e.target.querySelector('input[name="date"]').value = new Date().toISOString().slice(0,10);
        toggleForm();
        btn.textContent = origBtnText;
        return;
      }

      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        console.error('[save] local save failed:', res.status, errBody);
        showToast('Saved to chain — local save failed · ' + (errBody.error || res.status), true);
        e.target.reset();
        e.target.querySelector('input[name="date"]').value = new Date().toISOString().slice(0,10);
        toggleForm();
        btn.textContent = origBtnText;
        return;
      }

      // Full success: chain confirmed + local saved
      const savedEntry = await res.json().catch(() => null);
      const savedEntryId = savedEntry?.id || null;

      // AIR-234: If we saved with a fallback txHash and have a txId, backfill the real txHash in the background.
      if (backfillTxId && savedEntryId && txHash.startsWith('submitted-')) {
        console.log('[backfill] started — entry:', savedEntryId);
        console.log('[backfill] txId:', backfillTxId);
        (async () => {
          const BACKFILL_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
          try {
            const backfillResult = await Promise.race([
              publicDataProvider.watchForTxData(backfillTxId),
              new Promise(resolve => setTimeout(() => resolve({ timedOut: true }), BACKFILL_TIMEOUT_MS)),
            ]);
            console.log('[backfill] watch result:', JSON.stringify(backfillResult));
            if (backfillResult?.timedOut) {
              console.log('[backfill] timed out after 5 min — leaving status as Submitted for entry', savedEntryId);
              return;
            }
            const realTxHash = backfillResult?.txHash;
            if (!realTxHash || !/^[0-9a-f]{64}$/i.test(realTxHash)) {
              console.log('[backfill] no real txHash in result — skipping patch');
              return;
            }
            console.log('[backfill] real txHash received:', realTxHash, '— patching entry', savedEntryId);
            const patchRes = await fetch(\`/entries/\${savedEntryId}/txhash\`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ txHash: realTxHash }),
            });
            if (patchRes.ok) {
              console.log('[backfill] PATCH success — entry', savedEntryId, 'updated with real txHash');
              // Update any pending row in the table
              const pendingRow = document.getElementById('airlog-pending-row');
              if (pendingRow) {
                const explorerUrl = \`https://explorer.1am.xyz/tx/\${realTxHash}?network=preprod\`;
                const lastCell = pendingRow.querySelector('td:last-child');
                if (lastCell) {
                  lastCell.innerHTML = \`<span style="color:#22c55e;font-size:11px;font-weight:600;">&#x2713; Saved to chain (PreProd)</span><br><a href="\${explorerUrl}" target="_blank" rel="noopener" style="color:#7c3aed;font-size:10px;font-weight:500;text-decoration:none;">View on chain →</a>\`;
                }
              }
              refreshEntries();
            } else {
              console.warn('[backfill] PATCH failure:', patchRes.status);
            }
          } catch (backfillErr) {
            console.warn('[backfill] error:', backfillErr.message);
          }
        })();
      }

      e.target.reset();
      e.target.querySelector('input[name="date"]').value = new Date().toISOString().slice(0,10);
      toggleForm();
      btn.textContent = origBtnText;
      btn.disabled = false;
      showToast('Flight saved to chain');
      sessionStorage.setItem('airlog_just_logged', '1');
      refreshEntries();
    }
    async function refreshEntries() {
      try {
        const res = await fetch('/entries');
        if (!res.ok) return;
        const entries = await res.json();

        // Sort newest first
        const sorted = [...entries].sort((a, b) => String(b.date).localeCompare(String(a.date)));
        const recent = sorted.slice(0, 10);

        // Update totals
        let total = 0, pic = 0, xc = 0, night = 0, dayL = 0, nightL = 0;
        for (const e of entries) {
          total += Number(e.totalTime || e.total || 0);
          pic   += Number(e.pic || 0);
          xc    += Number(e.xc || 0);
          night += Number(e.night || 0);
          dayL  += Number(e.dayLandings || 0);
          nightL+= Number(e.nightLandings || 0);
        }
        const fmt = v => Number(v).toFixed(1);
        const lastDate = sorted[0]?.date ? String(sorted[0].date).slice(0, 10) : '—';
        const landings = dayL + nightL;

        const el = id => document.getElementById(id);
        if (el('stat-total-hrs'))     el('stat-total-hrs').textContent     = fmt(total) + ' hrs';
        if (el('stat-total-flights')) el('stat-total-flights').textContent = entries.length;
        if (el('stat-total-time'))    el('stat-total-time').textContent    = fmt(total) + ' hrs';
        if (el('stat-last-flight'))   el('stat-last-flight').textContent   = lastDate;
        if (el('stat-landings'))      el('stat-landings').textContent      = landings;
        const sub = el('stat-sub');
        if (sub) {
          const name = sub.textContent.split('·')[0].trim();
          sub.textContent = name + ' · PIC ' + fmt(pic) + ' · XC ' + fmt(xc) + ' · Night ' + fmt(night);
        }

        // Update recent flights table
        const tbody = el('recent-flights-tbody');
        if (tbody) {
          if (recent.length === 0) {
            tbody.innerHTML = '<tr><td colspan="8" class="muted">No flights logged yet.</td></tr>';
          } else {
            tbody.innerHTML = recent.map(e => {
              const anchorObj = e.anchor || null;
              const status = anchorObj?.status || e.anchorStatus || (e.anchored ? 'anchored' : null);
              const explorerNetwork = anchorObj?.network || 'preprod';
              const networkLabel = explorerNetwork === 'preview' ? 'Preview' : explorerNetwork === 'preprod' ? 'PreProd' : explorerNetwork;
              const anchorTx = anchorObj?.tx || anchorObj?.txHash || null;
              const isRealAnchorTx = anchorTx && /^[0-9a-f]{64}$/i.test(anchorTx);
              const explorerLink = (status === 'anchored' && isRealAnchorTx)
                ? \`<br><a href="https://explorer.1am.xyz/tx/\${anchorTx}?network=\${explorerNetwork}" target="_blank" rel="noopener" style="color:#7c3aed;font-size:10px;font-weight:500;text-decoration:none;">View on chain →</a>\`
                : '';
              const statusBadge = status === 'anchored'
                ? \`<span style="color:#22c55e;font-size:11px;font-weight:600;">&#x2713; Saved to chain (\${networkLabel})</span>\${explorerLink}\`
                : status === 'anchor_failed'
                ? '<span style="color:#ef4444;font-size:11px;font-weight:600;">&#x2717; Failed</span>'
                : (status === 'pending_anchor' || status === 'anchored_pending')
                ? '<span style="color:#f59e0b;font-size:11px;font-weight:600;">&#x29D7; Verified</span>'
                : status === 'submitted'
                ? '<span style="color:#a78bfa;font-size:11px;font-weight:600;">&#x29D6; Submitted</span>'
                : '<span style="color:#718096;font-size:11px;">—</span>';
              const attest = window.pilotlogAttestationMap && window.pilotlogAttestationMap[e.id];
              const attestBadge = attest && attest.status === 'verified'
                ? \`<span style="color:#22c55e;font-size:10px;font-weight:700;display:block;margin-top:2px;">&#9989; Instructor Verified\${attest.attestorMidname ? ' · ' + attest.attestorMidname : ''}</span>\`
                : attest && attest.status === 'pending'
                ? \`<span style="color:#f59e0b;font-size:10px;font-weight:600;display:block;margin-top:2px;">&#9711; Pending Review</span>\`
                : '';
              const verifyBtn = attest && attest.status === 'verified'
                ? \`<span style="font-size:10px;color:#22c55e;font-weight:600;">&#10003; Verified</span>\`
                : \`<button onclick="requestVerification('\${e.id}')" style="font-size:10px;padding:3px 8px;border:1px solid #374151;background:none;color:#9aa3ff;border-radius:5px;cursor:pointer;white-space:nowrap;">Request Verify</button>\`;
              return \`<tr>
                <td>\${String(e.date || '').slice(0, 10)}</td>
                <td>\${e.aircraftIdent || e.aircraftId || ''} <span class="muted">\${e.aircraftType ? \`(\${e.aircraftType})\` : ''}</span></td>
                <td>\${e.from || ''} → \${e.to || ''}</td>
                <td>\${e.totalTime ?? e.total ?? ''}</td>
                <td>\${e.pic ?? ''}</td>
                <td class="muted">\${(e.remarks || '').replaceAll('<','&lt;').replaceAll('>','&gt;')}</td>
                <td>\${statusBadge}\${attestBadge}</td>
                <td>\${verifyBtn}</td>
              </tr>\`;
            }).join('');
          }
        }
      } catch (_) {
        // Silent — flight was saved, UI will be stale but not broken
      }
    }
    function showToast(msg, isError) {
      const t = document.getElementById('toast');
      t.textContent = msg;
      t.style.background = isError ? '#7f1d1d' : '#1a3a8f';
      t.classList.add('show');
      setTimeout(() => t.classList.remove('show'), isError ? 4000 : 2500);
    }

    async function requestVerification(flightId) {
      const attestorMidname = prompt('Instructor or verifier Midname (optional):', '');
      if (attestorMidname === null) return; // cancelled
      const type = 'flight_verified';
      try {
        const res = await fetch('/attestations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ flightId, attestorMidname: attestorMidname || null, type }),
        });
        if (!res.ok) throw new Error('Request failed');
        showToast('Verification requested');
      } catch (err) {
        showToast('Failed to request verification', true);
      }
    }

  </script>

  ${walletStatusScript}

  ${aircraftRows ? `
  <div class="table">
    <div class="table-title">Aircraft</div>
    <table>
      <thead><tr><th>Ident</th><th>Type</th><th>Flights</th><th>Hours</th><th>Last Flight</th></tr></thead>
      <tbody>${aircraftRows}</tbody>
    </table>
  </div>
  ` : ""}

  <div class="table">
    <div class="table-title">Recent Flights</div>
    <table>
      <thead>
        <tr>
          <th>Date</th><th>Aircraft</th><th>Route</th><th>Total</th><th>PIC</th><th class="muted">Remarks</th><th>Status</th><th></th>
        </tr>
      </thead>
      <tbody id="recent-flights-tbody">
        ${recent.map(e => {
          const anchorObj = e.anchor || null;
          const status = anchorObj?.status || e.anchorStatus || (e.anchored ? "anchored" : null);
          const explorerNetwork = anchorObj?.network || "preprod";
          const networkLabel = explorerNetwork === "preview" ? "Preview" : explorerNetwork === "preprod" ? "PreProd" : explorerNetwork;
          const anchorTx = anchorObj?.tx || anchorObj?.txHash || null;
          const isRealAnchorTx = anchorTx && /^[0-9a-f]{64}$/i.test(anchorTx);
          const explorerLink = (status === "anchored" && isRealAnchorTx)
            ? `<br><a href="https://explorer.1am.xyz/tx/${anchorTx}?network=${explorerNetwork}" target="_blank" rel="noopener" style="color:#7c3aed;font-size:10px;font-weight:500;text-decoration:none;">View on chain →</a>`
            : "";
          const statusBadge = status === "anchored"
            ? `<span style="color:#22c55e;font-size:11px;font-weight:600;">&#x2713; Saved to chain (${networkLabel})</span>${explorerLink}`
            : status === "anchor_failed"
            ? '<span style="color:#ef4444;font-size:11px;font-weight:600;">&#x2717; Failed</span>'
            : (status === "pending_anchor" || status === "anchored_pending")
            ? '<span style="color:#f59e0b;font-size:11px;font-weight:600;">&#x29D7; Verified</span>'
            : status === "submitted"
            ? '<span style="color:#a78bfa;font-size:11px;font-weight:600;">&#x29D6; Submitted</span>'
            : '<span style="color:#718096;font-size:11px;">—</span>';
          return `
          <tr>
            <td>${String(e.date || "").slice(0, 10)}</td>
            <td>${e.aircraftIdent || e.aircraftId || ""} <span class="muted">${e.aircraftType ? `(${e.aircraftType})` : ""}</span></td>
            <td>${e.from || ""} → ${e.to || ""}</td>
            <td>${e.totalTime ?? e.total ?? ""}</td>
            <td>${e.pic ?? ""}</td>
            <td class="muted">${(e.remarks || "").replaceAll("<","&lt;").replaceAll(">","&gt;")}</td>
            <td>${statusBadge}</td>
            <td><button onclick="requestVerification('${e.id}')" style="font-size:10px;padding:3px 8px;border:1px solid #374151;background:none;color:#9aa3ff;border-radius:5px;cursor:pointer;white-space:nowrap;">Request Verify</button></td>
          </tr>`;
        }).join("")}
        ${recent.length === 0 ? '<tr><td colspan="8" class="muted">No flights logged yet.</td></tr>' : ""}
      </tbody>
    </table>
  </div>
</div>
<script>
(function() {
  // Seed real on-chain entry into localStorage (hybrid model)
  var REAL_ENTRY = ${JSON.stringify({
    id: "e005",
    date: "2026-04-12",
    aircraftId: "N12345",
    from: "KAPA",
    to: "KAPA",
    totalTime: 1.2,
    pic: 1.2,
    remarks: "Annual — N12345 airframe inspection and verification",
    anchor: {
      status: "anchored",
      hash: "91ee77fd525d2e1d7d8eee3ed84c1584d2ca59f912cff8f691e9fad708bca23e",
      tx: "ba8469647e24aff2b10dfbc1c5858dabe0bba06b8a6b489346acfbb1ac382240",
      network: "preprod",
      time: "2026-04-03T02:46:24.000Z",
      contractAddress: "2308d3e94b0bdd11631a814beb9e1d46b0d192254dcbb95aa4dcf40cb6a4b6ab",
      blockHeight: 181586
    }
  })};
  try {
    var stored = JSON.parse(localStorage.getItem('airlog_anchored_entries') || '[]');
    var exists = stored.some(function(e) { return e.id === REAL_ENTRY.id; });
    if (!exists) {
      stored.push(REAL_ENTRY);
      localStorage.setItem('airlog_anchored_entries', JSON.stringify(stored));
    }
  } catch(e) {}
})();
</script>
</body>
</html>`);
});

app.get("/maintenance", (_req, res) => {
  const records = readMaintenance();
  res.json(records);
});

app.get("/entries", (_req, res) => {
  const entries = sortNewestFirst(readEntries());
  res.json({ count: entries.length, entries });
});

app.post("/entries", (req, res) => {
  const { date, aircraftId, totalTime, dayLandings, nightLandings, from, to, remarks, txHash, walletAddress: bodyWalletAddress } = req.body || {};
  if (!aircraftId) {
    return res.status(400).json({ error: "aircraftId is required" });
  }
  // Accept real txHash (64-char hex) or fallback sentinel `submitted-${Date.now()}`.
  // AIR-233: Reject SDK txId values (Midnight contract identifiers, not blockchain hashes).
  // A real blockchain hash is exactly 64 hex characters; anything else is treated as a fallback.
  const txRef = txHash || null;
  if (!txRef) {
    return res.status(400).json({ error: "Wallet required to save flight — no transaction reference provided" });
  }
  // Normalise: if txRef is not a 64-char hex string and not a submitted- sentinel, treat as fallback.
  const isRealHash = /^[0-9a-f]{64}$/i.test(txRef);
  const normalisedTxRef = isRealHash ? txRef : (txRef.startsWith("submitted-") ? txRef : ("submitted-" + Date.now()));
  const walletSession = readWalletSession();
  const walletAddress = bodyWalletAddress || walletSession?.address || null;
  if (!walletAddress) {
    return res.status(400).json({ error: "Wallet not connected — connect your wallet before logging a flight" });
  }
  const identity = readIdentity();
  const midname = (identity && identity.midnameVerified && identity.midname) ? identity.midname : undefined;
  const entryId = randomBytes(8).toString("hex");
  const entryBase = {
    id: entryId,
    date: date || new Date().toISOString().slice(0, 10),
    aircraftId: String(aircraftId).toUpperCase().trim(),
    totalTime: Number(totalTime) || 0,
    dayLandings: Number(dayLandings) || 0,
    nightLandings: Number(nightLandings) || 0,
    from: from ? String(from).toUpperCase().trim() : "",
    to: to ? String(to).toUpperCase().trim() : "",
    remarks: remarks ? String(remarks).trim() : "",
  };
  // Compute canonical hash — pilotId (wallet address) and midname (if verified) are bound into the hash
  const { recordId, recordHash, canonical } = canonicalizeFlightEntry(
    { ...entryBase, total: entryBase.totalTime, pilotId: walletAddress, ...(midname ? { midname } : {}) },
    entryBase.aircraftId
  );
  const anchoredAt = new Date().toISOString();
  // Determine chain status: real tx hash (64-char hex) = anchored; fallback ref = submitted (pending confirmation)
  const isFallbackRef = normalisedTxRef.startsWith("submitted-");
  const chainStatus = isFallbackRef ? "submitted" : "anchored";
  const entry = {
    ...entryBase,
    pilotId: walletAddress,
    ...(midname ? { midname } : {}),
    recordId,
    createdAt: anchoredAt,
    anchored: !isFallbackRef,
    anchorStatus: chainStatus,
    anchoredAt,
    anchorTx: normalisedTxRef,
    anchorHash: recordHash,
    canonicalPayload: canonical,
    anchor: {
      hash: recordHash,
      walletAddress,
      txHash: isFallbackRef ? null : normalisedTxRef,
      anchoredAt,
      status: chainStatus,
      network: "preprod",
    },
  };
  const entries = readEntries();
  entries.push(entry);
  fs.writeFileSync(ENTRIES_PATH, JSON.stringify(entries, null, 2));
  res.status(201).json(entry);
});

// /entries/chain-submit is REMOVED — transactions are executed browser-side via 1AM wallet

// PATCH /entries/:id/txhash — AIR-234: backfill real txHash after submission timeout
app.patch("/entries/:id/txhash", (req, res) => {
  const { id } = req.params;
  const { txHash: newTxHash } = req.body || {};
  if (!newTxHash || !/^[0-9a-f]{64}$/i.test(newTxHash)) {
    return res.status(400).json({ error: "txHash must be a 64-char hex string" });
  }
  const entries = readEntries();
  const idx = entries.findIndex((e) => e.id === id);
  if (idx === -1) return res.status(404).json({ error: "entry not found" });
  const entry = entries[idx];
  // Only backfill if currently in submitted state
  const currentStatus = entry.anchor?.status || entry.anchorStatus;
  if (currentStatus === "anchored") {
    return res.json({ status: "anchored", message: "already anchored — no change" });
  }
  entries[idx] = {
    ...entry,
    anchored: true,
    anchorStatus: "anchored",
    anchorTx: newTxHash,
    anchor: {
      ...(entry.anchor || {}),
      txHash: newTxHash,
      status: "anchored",
    },
  };
  fs.writeFileSync(ENTRIES_PATH, JSON.stringify(entries, null, 2));
  console.log('[backfill] entry', id, 'patched with real txHash:', newTxHash);
  res.json(entries[idx]);
});

// POST /entries/:id/anchor — trigger or re-trigger background anchor for a specific entry
app.post("/entries/:id/anchor", (req, res) => {
  const { id } = req.params;
  const entries = readEntries();
  const entry = entries.find((e) => e.id === id);
  if (!entry) return res.status(404).json({ error: "entry not found" });
  const currentStatus = entry.anchor?.status || entry.anchorStatus;
  if (currentStatus === "anchored") return res.json({ status: "anchored", message: "already anchored" });
  // Re-trigger background anchor
  setImmediate(() => anchorEntryInBackground(entry.id, entry.aircraftId));
  res.json({ status: "anchored_pending", entryId: id });
});

// ─── Attestation API ──────────────────────────────────────────────────────────

app.get("/attestations", (_req, res) => {
  res.json(readAttestations());
});

app.get("/attestations/flight/:flightId", (req, res) => {
  const all = readAttestations();
  res.json(all.filter(a => a.flightId === req.params.flightId));
});

app.post("/attestations", (req, res) => {
  const { flightId, attestorMidname, attestorRole, type, notes } = req.body || {};
  if (!flightId || !type) return res.status(400).json({ error: "flightId and type required" });
  const entries = readEntries();
  const flight = entries.find(e => e.id === flightId);
  if (!flight) return res.status(404).json({ error: "flight not found" });
  const attestation = {
    id: Math.random().toString(36).slice(2) + Date.now().toString(36),
    flightId,
    attestorMidname: attestorMidname || null,
    attestorRole: attestorRole || null,
    type,
    status: "pending",
    createdAt: new Date().toISOString(),
    signedAt: null,
    notes: notes || null,
  };
  const all = readAttestations();
  all.push(attestation);
  saveAttestations(all);
  res.status(201).json(attestation);
});

app.patch("/attestations/:id", (req, res) => {
  const { action, reviewerMidname, reviewerRole, notes } = req.body || {};
  if (!action || !["approve", "reject"].includes(action)) {
    return res.status(400).json({ error: "action must be 'approve' or 'reject'" });
  }
  const all = readAttestations();
  const idx = all.findIndex(a => a.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: "attestation not found" });
  const attestation = all[idx];
  if (attestation.status !== "pending") {
    return res.status(409).json({ error: "attestation is not pending" });
  }
  if (action === "approve") {
    attestation.status = "verified";
    attestation.signedAt = new Date().toISOString();
    attestation.attestorMidname = reviewerMidname || attestation.attestorMidname || null;
    attestation.attestorRole = reviewerRole || attestation.attestorRole || null;
    if (notes) attestation.notes = notes;
  } else {
    attestation.status = "rejected";
    attestation.rejectedAt = new Date().toISOString();
    attestation.rejectedBy = reviewerMidname || null;
    if (notes) attestation.notes = notes;
  }
  all[idx] = attestation;
  saveAttestations(all);
  res.json(attestation);
});

// ─────────────────────────────────────────────────────────────────────────────

app.get("/dashboard", (_req, res) => {
  const entries = readEntries();
  // Pilot totals
  const totalTime = entries.reduce((s, e) => s + Number(e.totalTime || e.total || 0), 0);
  const totalFlights = entries.length;
  const lastFlightDate = entries.reduce((latest, e) => {
    const d = String(e.date || "");
    return d > latest ? d : latest;
  }, "");
  // Aircraft profiles computed from entries
  const aircraftMap = {};
  for (const e of entries) {
    const id = e.aircraftId || e.aircraftIdent || null;
    if (!id) continue;
    if (!aircraftMap[id]) aircraftMap[id] = { aircraftId: id, totalTime: 0, totalFlights: 0, lastFlown: "" };
    aircraftMap[id].totalTime += Number(e.totalTime || e.total || 0);
    aircraftMap[id].totalFlights += 1;
    const d = String(e.date || "");
    if (d > aircraftMap[id].lastFlown) aircraftMap[id].lastFlown = d;
  }
  res.json({
    pilot: { totalTime: Math.round(totalTime * 10) / 10, totalFlights, lastFlightDate },
    aircraft: Object.values(aircraftMap).map(a => ({ ...a, totalTime: Math.round(a.totalTime * 10) / 10 })),
  });
});

app.get("/recent", (req, res) => {
  const limit = Math.max(1, Math.min(100, Number(req.query.limit || 10)));
  const entries = sortNewestFirst(readEntries());
  res.json({
    count: entries.length,
    limit,
    entries: entries.slice(0, limit),
  });
});

app.get("/currency", (req, res) => {
  const asOf = String(req.query.asOf || new Date().toISOString());
  const entries = readEntries();

  // Passenger currency: 90 days
  const last90 = entries.filter((e) => withinDays(e.date, asOf, 90));
  const land90 = sumLandings(last90);

  // IFR currency: last 6 months (simplified cutoff)
  const cutoff6mo = monthsAgoIso(asOf, 6);
  const last6mo = entries.filter(
    (e) => String(e.date) >= cutoff6mo && String(e.date) <= asOf
  );
  const ifr = sumIfr(last6mo);

  const ifrCurrent =
    ifr.approaches >= 6 && ifr.holds >= 1 && ifr.intercepts >= 1;

  res.json({
    asOf,
    passengerCurrency: {
      windowDays: 90,
      dayLandingsLast90: land90.day,
      nightLandingsLast90: land90.night,
      dayCurrent: land90.day >= 3,
      nightCurrent: land90.night >= 3,
    },
    ifrCurrency: {
      windowMonths: 6,
      cutoff: cutoff6mo,
      approachesLast6Months: ifr.approaches,
      holdsLast6Months: ifr.holds,
      interceptsLast6Months: ifr.intercepts,
      current: ifrCurrent,
      rule:
        ">=6 approaches, >=1 hold, >=1 intercept/tracking in last 6 months (simplified cutoff).",
    },
  });
});

// NEW: audit-friendly details for UI
app.get("/currency/details", (req, res) => {
  const asOf = String(req.query.asOf || new Date().toISOString());
  const entries = readEntries();

  // Passenger currency: 90 days
  const last90 = entries
    .filter((e) => withinDays(e.date, asOf, 90))
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));

  const land90 = sumLandings(last90);

  // IFR currency: last 6 months (simplified cutoff)
  const cutoff6mo = monthsAgoIso(asOf, 6);
  const last6mo = entries
    .filter((e) => String(e.date) >= cutoff6mo && String(e.date) <= asOf)
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));

  const ifr = sumIfr(last6mo);

  const ifrCurrent =
    ifr.approaches >= 6 && ifr.holds >= 1 && ifr.intercepts >= 1;

  res.json({
    asOf,
    passengerWindow: {
      windowDays: 90,
      dayLandingsLast90: land90.day,
      nightLandingsLast90: land90.night,
      dayCurrent: land90.day >= 3,
      nightCurrent: land90.night >= 3,
      entries: last90,
    },
    ifrWindow: {
      windowMonths: 6,
      cutoff: cutoff6mo,
      approachesLast6Months: ifr.approaches,
      holdsLast6Months: ifr.holds,
      interceptsLast6Months: ifr.intercepts,
      current: ifrCurrent,
      rule:
        ">=6 approaches, >=1 hold, >=1 intercept/tracking in last 6 months (simplified cutoff).",
      entries: last6mo,
    },
  });
});

app.get("/profile", (_req, res) => {
  const profile = readProfile();
  if (!profile) return res.status(500).json({ error: "Failed to read profile.json" });
  res.json(profile);
});

app.get("/profile/summary", (req, res) => {
  const asOf = String(req.query.asOf || new Date().toISOString());

  const profile = readProfile();
  if (!profile) return res.status(500).json({ error: "Failed to read profile.json" });

  const entries = readEntries();

  const last90 = entries.filter((e) => withinDays(e.date, asOf, 90));
  const land90 = sumLandings(last90);

  const cutoff6mo = monthsAgoIso(asOf, 6);
  const last6mo = entries.filter(
    (e) => String(e.date) >= cutoff6mo && String(e.date) <= asOf
  );
  const ifr = sumIfr(last6mo);

  const ifrCurrent =
    ifr.approaches >= 6 && ifr.holds >= 1 && ifr.intercepts >= 1;

  const flightReviewDate = profile?.proficiency?.flightReviewDate ?? null;
  const flightReviewCurrent = isWithinMonths(asOf, flightReviewDate, 24);

  const medical = profile?.medical ?? { kind: "None" };
  let medicalCurrent = false;

  if (medical.kind === "Medical") {
    medicalCurrent = isFuture(asOf, medical.expires);
  } else if (medical.kind === "BasicMed") {
    const cmecOk = !!medical?.basicMed?.cmecDate;
    const courseOk = !!medical?.basicMed?.onlineCourseDate;
    medicalCurrent = cmecOk && courseOk;
  }

  res.json({
    asOf,
    pilot: profile?.pilot ?? {},
    medical: {
      kind: medical.kind,
      class: medical.class ?? null,
      issued: medical.issued ?? null,
      expires: medical.expires ?? null,
      basicMed: medical.basicMed ?? null,
      current: medicalCurrent
    },
    proficiency: {
      flightReviewDate,
      flightReviewCurrent,
      ipcDate: profile?.proficiency?.ipcDate ?? null
    },
    passengerCurrency: {
      windowDays: 90,
      dayLandingsLast90: land90.day,
      nightLandingsLast90: land90.night,
      dayCurrent: land90.day >= 3,
      nightCurrent: land90.night >= 3
    },
    ifrCurrency: {
      windowMonths: 6,
      cutoff: cutoff6mo,
      approachesLast6Months: ifr.approaches,
      holdsLast6Months: ifr.holds,
      interceptsLast6Months: ifr.intercepts,
      current: ifrCurrent,
      rule: ">=6 approaches, >=1 hold, >=1 intercept/tracking in last 6 months (simplified cutoff)."
    }
  });
});

app.get("/totals", (_req, res) => {
  const entries = readEntries();
  res.json({ totals: computeTotals(entries) });
});

app.get("/export", (_req, res) => {
  const entries = readEntries();
  const profile = readProfile();
  const aircraft = readAircraft();
  const verification = readVerification();

  const payload = {
    entries,
    profile,
    aircraft
  };

  const hash = hashLogbook(entries, profile, aircraft);

  res.json({
    generated: new Date().toISOString(),
    hash,
    verification,
    payload
  });
});

app.get("/export/summary", (_req, res) => {
  const entries = readEntries();
  const profile = readProfile();
  const aircraft = readAircraft();
  const verification = readVerification();

  const hash = hashLogbook(entries, profile, aircraft);

  res.json({
    generated: new Date().toISOString(),
    hash,
    verification,
    counts: {
      entries: entries.length,
      aircraft: aircraft.length,
      endorsements: profile?.endorsements?.length || 0
    },
    pilot: {
      fullName: profile?.pilot?.fullName || "",
      medicalKind: profile?.medical?.kind || "None",
      medicalClass: profile?.medical?.class || null,
      flightReviewDate: profile?.proficiency?.flightReviewDate || null
    },
    aircraftSummary: aircraft.map((a) => ({
      ident: a.ident,
      type: a.type,
      annualDue: a.annualDue || null,
      transponderDue: a.transponderDue || null,
      pitotStaticDue: a.pitotStaticDue || null,
      eltBatteryDue: a.eltBatteryDue || null
    }))
  });
});

app.get("/export/summary/download", (_req, res) => {
  const entries = readEntries();
  const profile = readProfile();
  const aircraft = readAircraft();
  const verification = readVerification();

  const hash = hashLogbook(entries, profile, aircraft);

  const payload = {
    generated: new Date().toISOString(),
    hash,
    verification,
    counts: {
      entries: entries.length,
      aircraft: aircraft.length,
      endorsements: profile?.endorsements?.length || 0
    },
    pilot: {
      fullName: profile?.pilot?.fullName || "",
      medicalKind: profile?.medical?.kind || "None",
      medicalClass: profile?.medical?.class || null,
      flightReviewDate: profile?.proficiency?.flightReviewDate || null
    },
    aircraftSummary: aircraft.map((a) => ({
      ident: a.ident,
      type: a.type,
      annualDue: a.annualDue || null,
      transponderDue: a.transponderDue || null,
      pitotStaticDue: a.pitotStaticDue || null,
      eltBatteryDue: a.eltBatteryDue || null
    }))
  };

  res.setHeader("Content-Type", "application/json");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="airlog-summary-${new Date().toISOString().slice(0,10)}.json"`
  );
  res.send(JSON.stringify(payload, null, 2));
});

app.post("/verify/anchor", async (_req, res) => {
  const entries = readEntries();
  const aircraftList = readAircraft();
  const aircraft = aircraftList[0];

  if (!aircraft) {
    return res.status(400).json({
      message: "No aircraft found to anchor",
    });
  }

  const integrity = buildIntegrityResult({ aircraft, entries });
  const totalHours = entries.reduce((s, e) => s + Number(e.total || 0), 0);

  const anchorResult = await anchorOnMidnight({
    anchorHash: integrity.anchorHash,
    airframeId: integrity.airframeId,
    hours: totalHours,
  });

  const verification = {
    ...integrity,
    anchored: anchorResult.anchored === true,
    anchorTime: anchorResult.anchoredAt || new Date().toISOString(),
    anchorTx: anchorResult.anchorId || null,
    anchorNetwork: anchorResult.network || "midnight-local",
    runtimeAvailable: anchorResult.anchored === true,
    contract: anchorResult.anchored
      ? { contractAddress: anchorResult.contractAddress, anchorId: anchorResult.anchorId }
      : anchorResult.pending
        ? "pending"
        : "unavailable",
  };

  fs.writeFileSync(VERIFICATION_PATH, JSON.stringify(verification, null, 2));

  res.json({
    message: anchorResult.anchored
      ? "Logbook anchored on Midnight local network"
      : `Anchor pending — ${anchorResult.error || "network unavailable"}`,
    verification,
  });
});  

// ── Anchor Service endpoints ────────────────────────────────────────────────

app.post("/anchor/logbook", async (_req, res) => {
  const entries = readEntries();
  const aircraftList = readAircraft();
  const aircraft = aircraftList[0];
  if (!aircraft) return res.status(400).json({ error: "No aircraft found" });
  try {
    const result = await anchorRecord(aircraft, entries);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: String(err.message || err) });
  }
});

app.get("/anchor/verify", (_req, res) => {
  const entries = readEntries();
  const aircraftList = readAircraft();
  const aircraft = aircraftList[0];
  if (!aircraft) return res.status(400).json({ error: "No aircraft found" });
  res.json(verifyRecord(aircraft, entries));
});

app.post("/anchor/grant", (req, res) => {
  const { recordId, viewerId, accessLevel } = req.body || {};
  if (!recordId || !viewerId) return res.status(400).json({ error: "recordId and viewerId required" });
  res.json(grantAccess(recordId, viewerId, accessLevel || "VERIFY"));
});

app.post("/anchor/revoke", (req, res) => {
  const { recordId, viewerId } = req.body || {};
  if (!recordId || !viewerId) return res.status(400).json({ error: "recordId and viewerId required" });
  res.json(revokeAccess(recordId, viewerId));
});

// ── End Anchor Service endpoints ─────────────────────────────────────────────

function computeGaps(aircraft, maintenance) {
  const gaps = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // 1. Maintenance chronology gaps > 12 months
  const dated = maintenance
    .filter((m) => m.date)
    .map((m) => ({ date: new Date(String(m.date).slice(0, 10)), entry: m }))
    .filter((x) => !isNaN(x.date))
    .sort((a, b) => a.date - b.date);

  for (let i = 1; i < dated.length; i++) {
    const prev = dated[i - 1];
    const curr = dated[i];
    const daysDiff = Math.round((curr.date - prev.date) / 86400000);
    if (daysDiff > 365) {
      gaps.push({
        type: "maintenance_gap",
        description: `No maintenance recorded for ${Math.round(daysDiff / 30)} months (${String(prev.date.toISOString()).slice(0, 10)} to ${String(curr.date.toISOString()).slice(0, 10)})`,
        severity: daysDiff > 730 ? "high" : "medium",
        dateRange: {
          start: String(prev.date.toISOString()).slice(0, 10),
          end: String(curr.date.toISOString()).slice(0, 10),
        },
      });
    }
  }

  // Check gap from last maintenance to today
  if (dated.length > 0) {
    const lastDate = dated[dated.length - 1].date;
    const daysSinceLast = Math.round((today - lastDate) / 86400000);
    if (daysSinceLast > 365) {
      gaps.push({
        type: "maintenance_gap",
        description: `No maintenance recorded in the last ${Math.round(daysSinceLast / 30)} months (last entry: ${String(lastDate.toISOString()).slice(0, 10)})`,
        severity: daysSinceLast > 730 ? "high" : "medium",
        dateRange: {
          start: String(lastDate.toISOString()).slice(0, 10),
          end: today.toISOString().slice(0, 10),
        },
      });
    }
  }

  // 2. Missing annual inspection in last 12 months
  for (const a of aircraft) {
    if (!a.annualDue) {
      gaps.push({
        type: "missing_inspection",
        description: `No annual inspection date recorded for ${a.ident || "aircraft"}`,
        severity: "high",
      });
    } else {
      const annualDate = new Date(String(a.annualDue).slice(0, 10));
      const daysUntilAnnual = Math.round((annualDate - today) / 86400000);
      if (daysUntilAnnual < 0) {
        gaps.push({
          type: "missing_inspection",
          description: `Annual inspection overdue for ${a.ident || "aircraft"} (was due ${String(a.annualDue).slice(0, 10)})`,
          severity: "high",
        });
      }
    }
  }

  // 3. Overdue recurring AD compliance
  for (const m of maintenance) {
    for (const ad of (m.adCompliance || [])) {
      if (ad.nextDue) {
        const nextDueDate = new Date(String(ad.nextDue).slice(0, 10));
        if (nextDueDate < today) {
          const daysOverdue = Math.round((today - nextDueDate) / 86400000);
          gaps.push({
            type: "ad_compliance_overdue",
            description: `AD ${ad.adNumber || "unknown"} (${ad.description || m.description || "recurring"}) overdue by ${daysOverdue} days — next due was ${String(ad.nextDue).slice(0, 10)}`,
            severity: "high",
          });
        }
      }
    }
  }

  // 4. Components without TSOH/SMOH data
  const majorComponents = ["engine", "propeller", "prop"];
  const componentsCovered = new Set();
  for (const m of maintenance) {
    for (const c of m.components || []) {
      const name = (c.name || "").toLowerCase();
      for (const comp of majorComponents) {
        if (name.includes(comp)) componentsCovered.add(comp);
      }
    }
  }
  for (const a of aircraft) {
    if (!a.engineTimeSMOH && !a.engineSerial) {
      gaps.push({
        type: "missing_tsoh",
        description: `Engine time since major overhaul (SMOH) not recorded for ${a.ident || "aircraft"}`,
        severity: "medium",
        component: "engine",
      });
    }
    const propCovered = componentsCovered.has("propeller") || componentsCovered.has("prop") || a.propSerial;
    if (!propCovered) {
      gaps.push({
        type: "missing_tsoh",
        description: `Propeller service history not recorded for ${a.ident || "aircraft"}`,
        severity: "medium",
        component: "propeller",
      });
    }
  }

  // 5. Serial number consistency — detect engine/prop serial mismatches between
  //    aircraft.json master record and component entries in maintenance records.
  //    A mismatch may indicate an undisclosed engine/prop swap or a data error.
  for (const a of aircraft) {
    const engineSerial = (a.engineSerial || "").trim().toUpperCase();
    const propSerial = (a.propSerial || "").trim().toUpperCase();

    const engineSerialsInMaintenance = new Set();
    const propSerialsInMaintenance = new Set();

    for (const m of maintenance) {
      for (const c of m.components || []) {
        const name = (c.name || "").toLowerCase();
        const sn = (c.serialNumber || "").trim().toUpperCase();
        if (!sn) continue;
        if (name.includes("engine")) engineSerialsInMaintenance.add(sn);
        if (name.includes("prop")) propSerialsInMaintenance.add(sn);
      }
    }

    if (engineSerial && engineSerialsInMaintenance.size > 0 && !engineSerialsInMaintenance.has(engineSerial)) {
      gaps.push({
        type: "serial_mismatch",
        description: `Engine serial number mismatch: aircraft record shows ${a.engineSerial}, but maintenance records reference ${[...engineSerialsInMaintenance].join(", ")}. Possible undisclosed engine swap.`,
        severity: "high",
        component: "engine",
      });
    }

    if (propSerial && propSerialsInMaintenance.size > 0 && !propSerialsInMaintenance.has(propSerial)) {
      gaps.push({
        type: "serial_mismatch",
        description: `Propeller serial number mismatch: aircraft record shows ${a.propSerial}, but maintenance records reference ${[...propSerialsInMaintenance].join(", ")}. Possible undisclosed prop swap.`,
        severity: "high",
        component: "propeller",
      });
    }

    // Also flag if maintenance components reference multiple different engine/prop serials
    if (engineSerialsInMaintenance.size > 1) {
      gaps.push({
        type: "serial_mismatch",
        description: `Multiple engine serial numbers found across maintenance records (${[...engineSerialsInMaintenance].join(", ")}). Verify engine history with IA logbook.`,
        severity: "high",
        component: "engine",
      });
    }

    if (propSerialsInMaintenance.size > 1) {
      gaps.push({
        type: "serial_mismatch",
        description: `Multiple propeller serial numbers found across maintenance records (${[...propSerialsInMaintenance].join(", ")}). Verify prop history.`,
        severity: "medium",
        component: "propeller",
      });
    }
  }

  return gaps;
}

app.get("/export/sale-packet", (_req, res) => {
  const entries = readEntries();
  const profile = readProfile();
  const aircraft = readAircraft();
  const verification = readVerification();
  const maintenance = readMaintenance();

  const hash = hashLogbook(entries, profile, aircraft);

  const aircraftSummary = aircraft.map((a) => ({
    ident: a.ident,
    make: a.make || null,
    model: a.model || null,
    year: a.year || a.manufactureYear || null,
    type: a.type,
    engineTimeSMOH: a.engineTimeSMOH || null,
    avionics: a.avionics || [],
    annualDue: a.annualDue || null,
    transponderDue: a.transponderDue || null,
    pitotStaticDue: a.pitotStaticDue || null,
    eltBatteryDue: a.eltBatteryDue || null,
    notes: a.notes || ""
  }));

  const totals = computeTotals(entries);

  const maintenanceSummary = maintenance.map((m) => ({
    id: m.id,
    date: m.date,
    category: m.category,
    description: m.description,
    performedBy: m.performedBy,
    mechanic: m.mechanic,
    totalAirframeHours: m.totalAirframeHours || null,
    returnToService: m.returnToService || false,
    components: (m.components || []).map((c) => ({
      name: c.name,
      partNumber: c.partNumber || null,
      action: c.action,
      condition: c.condition
    })),
    adCompliance: m.adCompliance || [],
    documents: m.documents || []
  }));

  const gaps = computeGaps(aircraft, maintenance);

  // Build trust basis for JSON packet
  const adEntriesForPacket = maintenance.filter((m) => m.category === "ad-compliance" || (m.adCompliance && m.adCompliance.length > 0));
  const primaryA = aircraft[0] || {};
  const tbVerified = [];
  const tbAssumed = [];
  const tbMissing = [];
  if (maintenance.length > 0) tbVerified.push(`${maintenance.length} maintenance record${maintenance.length > 1 ? "s" : ""} on file`);
  if (primaryA.annualDue) tbVerified.push(`Annual inspection on file — due ${primaryA.annualDue}`);
  if (entries.length > 0) tbVerified.push(`${entries.length} flight log entries recorded`);
  if (adEntriesForPacket.length > 0) tbVerified.push(`${adEntriesForPacket.length} AD compliance records present`);
  if (primaryA.serialNumber) tbVerified.push("Aircraft serial number on file");
  if (primaryA.engineSerial) tbVerified.push("Engine serial number on file");
  tbAssumed.push("Flight hours are pilot-reported and not independently audited");
  tbAssumed.push("Aircraft specifications provided by the seller");
  if (maintenance.length > 0) tbAssumed.push("Maintenance entries reflect mechanic records — work quality not inspected by AirLog");
  if (!primaryA.annualDue) tbMissing.push("Annual inspection date not recorded");
  if (adEntriesForPacket.length === 0) tbMissing.push("No AD compliance records — compliance status cannot be confirmed");
  for (const g of gaps) {
    if (g.severity === "high" && g.description) tbMissing.push(g.description);
  }

  const packet = {
    generated: new Date().toISOString(),
    packetType: "airlog-sale-packet",
    trustBasis: { verified: tbVerified, assumed: tbAssumed, missing: tbMissing },
    gaps,
    verification: {
      anchored: verification?.anchored || false,
      anchorHash: verification?.anchorHash || null,
      anchorTime: verification?.anchorTime || null,
      anchorNetwork: verification?.anchorNetwork || null,
      anchorTx: verification?.anchorTx || null,
      currentHash: hash
    },
    aircraftSummary,
    maintenanceSummary,
    logbookSummary: {
      entries: entries.length,
      totalHours: totals.total,
      picHours: totals.pic,
      landings: Number(totals.dayLandings || 0) + Number(totals.nightLandings || 0),
      instrumentTime:
        Number(totals.actualInstrument || 0) +
        Number(totals.simulatedInstrument || 0)
    },
    pilotSummary: {
      fullName: profile?.pilot?.fullName || "",
      medicalKind: profile?.medical?.kind || "None",
      medicalClass: profile?.medical?.class || null,
      flightReviewDate: profile?.proficiency?.flightReviewDate || null,
      endorsements: profile?.endorsements?.length || 0
    }
  };

  res.setHeader("Content-Type", "application/json");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="airlog-sale-packet-${new Date().toISOString().slice(0,10)}.json"`
  );
  res.send(JSON.stringify(packet, null, 2));
});

app.get("/export/sale-packet/html", (_req, res) => {
  const entries = readEntries();
  const profile = readProfile();
  const aircraft = readAircraft();
  const verification = readVerification();
  const maintenance = readMaintenance();

  const hash = hashLogbook(entries, profile, aircraft);
  const totals = computeTotals(entries);
  const generatedDate = new Date().toISOString();
  const generatedFormatted = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

  const primaryAircraft = aircraft[0] || {};
  const anchored = verification?.anchored || false;
  const currentHash = hash;
  const anchorHash = verification?.anchorHash || null;
  const hashMatch = anchorHash && anchorHash === currentHash;
  const gaps = computeGaps(aircraft, maintenance);

  // Record quality score — weighted by documentation completeness, not blockchain status
  // On-chain anchoring is shown as a verification badge separately
  const qualityFactors = [];
  let qualityScore = 0;
  const adEntriesForScore = maintenance.filter((m) => m.category === "ad-compliance" || (m.adCompliance && m.adCompliance.length > 0));
  if (maintenance.length > 0) { qualityScore += 30; qualityFactors.push({ label: "Maintenance records present", points: 30, pass: true }); }
  else { qualityFactors.push({ label: "Maintenance records present", points: 30, pass: false }); }
  if (aircraft.length > 0 && primaryAircraft.annualDue) { qualityScore += 25; qualityFactors.push({ label: "Annual inspection date on file", points: 25, pass: true }); }
  else { qualityFactors.push({ label: "Annual inspection date on file", points: 25, pass: false }); }
  if (adEntriesForScore.length > 0) { qualityScore += 20; qualityFactors.push({ label: "AD compliance records present", points: 20, pass: true }); }
  else { qualityFactors.push({ label: "AD compliance records present", points: 20, pass: false }); }
  if (entries.length > 0) { qualityScore += 15; qualityFactors.push({ label: "Flight log entries present", points: 15, pass: true }); }
  else { qualityFactors.push({ label: "Flight log entries present", points: 15, pass: false }); }
  if (profile?.pilot?.fullName) { qualityScore += 10; qualityFactors.push({ label: "Pilot profile complete", points: 10, pass: true }); }
  else { qualityFactors.push({ label: "Pilot profile complete", points: 10, pass: false }); }

  // Deduct for active compliance gaps — a 100/100 score with overdue ADs is misleading
  const highGapCount = gaps.filter((g) => g.severity === "high").length;
  const medGapCount = gaps.filter((g) => g.severity === "medium").length;
  if (highGapCount > 0) {
    const deduct = Math.min(highGapCount * 20, 40);
    qualityScore = Math.max(0, qualityScore - deduct);
    qualityFactors.push({ label: `${highGapCount} high-severity compliance gap${highGapCount > 1 ? "s" : ""}`, points: -deduct, pass: false });
  }
  if (medGapCount > 0) {
    const deduct = Math.min(medGapCount * 10, 20);
    qualityScore = Math.max(0, qualityScore - deduct);
    qualityFactors.push({ label: `${medGapCount} medium-severity gap${medGapCount > 1 ? "s" : ""}`, points: -deduct, pass: false });
  }

  const totalLandings = Number(totals.dayLandings || 0) + Number(totals.nightLandings || 0);
  const instrumentTime = Number(totals.actualInstrument || 0) + Number(totals.simulatedInstrument || 0);

  function fmt(val) { return val ? String(val).slice(0, 10) : "—"; }
  function fmtNum(val) { return Number(val || 0).toFixed(1); }

  const maintenanceRows = maintenance.map((m) => {
    const date = m.date ? String(m.date).slice(0, 10) : "—";
    const cat = (m.category || "").replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase());
    const rts = m.returnToService ? "✓" : "—";
    const components = m.components || [];
    const compDetail = components.length > 0
      ? `<tr class="comp-row"><td colspan="6"><div class="comp-detail"><strong>Components Serviced:</strong> ` +
        components.map(c => {
          const parts = [c.name];
          if (c.partNumber) parts.push(`P/N: ${c.partNumber}`);
          if (c.serialNumber) parts.push(`S/N: ${c.serialNumber}`);
          if (c.action) parts.push(`Action: ${c.action}`);
          return parts.join(" · ");
        }).join(" &nbsp;|&nbsp; ") + `</div></td></tr>`
      : "";
    const extraDetail = (m.remarks || m.tach != null || m.hobbs != null)
      ? `<tr class="comp-row"><td colspan="6"><div class="comp-detail">` +
        [m.tach != null ? `Tach: ${m.tach}` : null,
         m.hobbs != null ? `Hobbs: ${m.hobbs}` : null,
         m.remarks ? `Remarks: ${m.remarks}` : null
        ].filter(Boolean).join(" &nbsp;·&nbsp; ") +
        `</div></td></tr>`
      : "";
    return `<tr>
      <td>${date}</td>
      <td><span class="badge">${cat}</span></td>
      <td>${m.description || "—"}</td>
      <td>${m.mechanic || m.performedBy || "—"}</td>
      <td>${m.totalAirframeHours != null ? fmtNum(m.totalAirframeHours) + " hrs" : "—"}</td>
      <td class="rts ${m.returnToService ? "rts-yes" : "rts-no"}">${rts}</td>
    </tr>${compDetail}${extraDetail}`;
  }).join("\n");

  const qualityRows = qualityFactors.map((f) =>
    `<tr>
      <td>${f.pass ? "✓" : "✗"}</td>
      <td>${f.label}</td>
      <td>${f.points < 0 ? f.points : (f.pass ? f.points : 0)} ${f.points > 0 ? `/ ${f.points}` : ""}</td>
    </tr>`
  ).join("\n");

  // AD compliance rows
  const adEntries = maintenance.filter((m) => m.category === "ad-compliance" || (m.adCompliance && m.adCompliance.length > 0));
  const now = new Date();
  const adRows = adEntries.map((m) => {
    const ads = m.adCompliance && m.adCompliance.length > 0
      ? m.adCompliance.map((ad) => {
          let nextDueCell = "—";
          if (ad.nextDue) {
            const nextDueDate = new Date(ad.nextDue);
            const overdue = nextDueDate < now;
            const daysOut = Math.round((nextDueDate - now) / (1000 * 60 * 60 * 24));
            const dueSoon = !overdue && daysOut <= 60;
            const statusBadge = overdue
              ? `<span style="display:inline-block;background:#fee2e2;color:#b91c1c;font-size:10px;font-weight:700;padding:2px 7px;border-radius:10px;margin-left:6px;">OVERDUE</span>`
              : dueSoon
              ? `<span style="display:inline-block;background:#fef3c7;color:#92400e;font-size:10px;font-weight:700;padding:2px 7px;border-radius:10px;margin-left:6px;">DUE SOON</span>`
              : "";
            nextDueCell = `<span style="color:${overdue ? "#b91c1c" : "#2d3748"};font-weight:${overdue ? "700" : "400"};">${fmt(ad.nextDue)}</span>${statusBadge}`;
          }
          return `<tr>
            <td>${ad.adNumber || "—"}</td>
            <td>${ad.description || ad.title || m.description || "—"}</td>
            <td>${m.date ? String(m.date).slice(0, 10) : "—"}</td>
            <td>${m.mechanic || m.performedBy || "—"}</td>
            <td>${nextDueCell}</td>
          </tr>`;
        }).join("")
      : `<tr>
          <td>—</td>
          <td>${m.description || "—"}</td>
          <td>${m.date ? String(m.date).slice(0, 10) : "—"}</td>
          <td>${m.mechanic || m.performedBy || "—"}</td>
          <td>—</td>
        </tr>`;
    return ads;
  }).join("");

  // 337 / Major alteration rows
  const alterationEntries = maintenance.filter((m) =>
    m.category === "major-alteration" || m.category === "337" || (m.description || "").toLowerCase().includes("337")
  );
  const alterationRows = alterationEntries.map((m) => {
    const docs = (m.documents || []).join(", ") || "—";
    return `<tr>
      <td>${m.date ? String(m.date).slice(0, 10) : "—"}</td>
      <td>${m.description || "—"}</td>
      <td>${m.mechanic || m.performedBy || "—"}</td>
      <td>${docs}</td>
    </tr>`;
  }).join("");

  // Component snapshot: engine, prop, avionics
  const pa = primaryAircraft;
  // Find last service record for a keyword — returns { date, mechanic, condition }
  function lastServiceRecord(keyword) {
    const matches = maintenance
      .filter((m) => (m.components || []).some((c) => (c.name || "").toLowerCase().includes(keyword)) ||
        (m.description || "").toLowerCase().includes(keyword))
      .sort((a, b) => new Date(b.date) - new Date(a.date));
    if (matches.length === 0) return null;
    const rec = matches[0];
    const comp = (rec.components || []).find((c) => (c.name || "").toLowerCase().includes(keyword));
    return {
      date: rec.date ? String(rec.date).slice(0, 10) : null,
      mechanic: rec.mechanic || rec.performedBy || null,
      condition: comp?.condition || null,
    };
  }
  function lastServiceDate(keyword) {
    const r = lastServiceRecord(keyword);
    return r ? r.date : null;
  }

  // Buyer evidence index
  const adCount = adEntries.length;
  const docCount = maintenance.reduce((n, m) => n + (m.documents || []).length, 0);
  const hasAnnual = !!(pa.annualDue);
  const evidenceItems = [
    { label: "Flight log entries", value: entries.length > 0 ? `${entries.length} entries` : "None", pass: entries.length > 0 },
    { label: "Maintenance records", value: maintenance.length > 0 ? `${maintenance.length} records` : "None", pass: maintenance.length > 0 },
    { label: "Annual inspection on file", value: hasAnnual ? fmt(pa.annualDue) : "Not recorded", pass: hasAnnual },
    { label: "AD compliance records", value: adCount > 0 ? `${adCount} records` : "None", pass: adCount > 0 },
    { label: "Referenced documents", value: docCount > 0 ? `${docCount} files` : "None", pass: docCount > 0 },
    { label: "Pilot profile", value: profile?.pilot?.fullName ? profile.pilot.fullName : "Incomplete", pass: !!(profile?.pilot?.fullName) },
    { label: "On-chain anchor", value: anchored ? `Yes — ${verification.anchorNetwork || "network"}` : "Not yet anchored", pass: anchored },
  ];

  const evidenceRows = evidenceItems.map((ei) =>
    `<tr>
      <td style="color:${ei.pass ? "#22c55e" : "#ef4444"};font-weight:700;width:24px;">${ei.pass ? "✓" : "✗"}</td>
      <td style="color:#4a5568;">${ei.label}</td>
      <td style="font-weight:600;color:${ei.pass ? "#2d3748" : "#ef4444"};">${ei.value}</td>
    </tr>`
  ).join("");

  // Trust summary
  const highGaps = gaps.filter((g) => g.severity === "high").length;
  const medGaps = gaps.filter((g) => g.severity === "medium").length;
  const trustColor = qualityScore >= 80 ? "#22c55e" : qualityScore >= 55 ? "#f59e0b" : "#ef4444";
  const trustLabel = qualityScore >= 80 ? "Strong" : qualityScore >= 55 ? "Moderate" : "Weak";
  const trustExplanation = qualityScore >= 80
    ? "Records are well-documented with maintenance history, compliance dates, and flight log entries present."
    : qualityScore >= 55
    ? "Core records are present but some documentation gaps were identified. A pre-buy inspection is recommended."
    : "Significant documentation gaps exist. Independent verification is strongly recommended before purchase.";

  // Logbook continuity
  const sortedEntries = [...entries].sort((a, b) => new Date(a.date) - new Date(b.date));
  const firstEntryDate = sortedEntries.length > 0 ? String(sortedEntries[0].date).slice(0, 10) : null;
  const lastEntryDate = sortedEntries.length > 0 ? String(sortedEntries[sortedEntries.length - 1].date).slice(0, 10) : null;

  // Buyer summary plain language
  const buyerSummaryStatus = anchored
    ? "Records have been cryptographically hashed."
    : "Records have not yet been anchored to an external verification network.";
  const buyerSummaryGaps = highGaps > 0
    ? `${highGaps} high-severity record gap${highGaps > 1 ? "s" : ""} ${highGaps > 1 ? "were" : "was"} identified and should be reviewed prior to purchase.`
    : gaps.length > 0
    ? `${gaps.length} record item${gaps.length > 1 ? "s" : ""} flagged for review.`
    : "No record gaps or flags were detected.";

  // Trust Basis — what is verified, assumed, and missing
  const trustBasis = { verified: [], assumed: [], missing: [] };
  if (maintenance.length > 0) trustBasis.verified.push(`${maintenance.length} maintenance record${maintenance.length > 1 ? "s" : ""} on file`);
  if (primaryAircraft.annualDue) trustBasis.verified.push(`Annual inspection on file — due ${fmt(primaryAircraft.annualDue)}`);
  if (entries.length > 0) trustBasis.verified.push(`${entries.length} flight log entr${entries.length > 1 ? "ies" : "y"} recorded`);
  if (adEntries.length > 0) trustBasis.verified.push(`${adEntries.length} AD compliance record${adEntries.length > 1 ? "s" : ""} present`);
  if (primaryAircraft.serialNumber) trustBasis.verified.push("Aircraft serial number on file");
  if (primaryAircraft.engineSerial) trustBasis.verified.push("Engine serial number on file");
  if (currentHash) trustBasis.verified.push(`Record set produces a consistent hash (${currentHash.slice(0, 8)}…)`);

  trustBasis.assumed.push("Flight hours are pilot-reported and not independently audited");
  trustBasis.assumed.push("Aircraft specifications provided by the seller");
  if (maintenance.length > 0) trustBasis.assumed.push("Maintenance entries reflect mechanic records — work quality not inspected by AirLog");
  if (!anchored) trustBasis.assumed.push("Record hash is locally computed — not externally anchored or time-stamped");

  if (!primaryAircraft.annualDue) trustBasis.missing.push("Annual inspection date not recorded");
  if (adEntries.length === 0) trustBasis.missing.push("No AD compliance records — compliance status cannot be confirmed");
  if (!primaryAircraft.engineSerial) trustBasis.missing.push("Engine serial number not recorded");
  if (!primaryAircraft.serialNumber) trustBasis.missing.push("Aircraft serial number not recorded");
  for (const g of gaps) {
    if (g.severity === "high" && g.description) trustBasis.missing.push(g.description);
  }

  const aircraftRows = aircraft.map((a) => `
    <tr><td>Registration</td><td>${a.ident || "—"}</td></tr>
    <tr><td>Type</td><td>${a.type || "—"}</td></tr>
    <tr><td>Serial Number</td><td>${a.serialNumber || "—"}</td></tr>
    <tr><td>Manufacture Year</td><td>${a.manufactureYear || "—"}</td></tr>
    <tr><td>Total Time in Service</td><td>${a.totalTimeInService != null ? fmtNum(a.totalTimeInService) + " hrs" : "—"}</td></tr>
    <tr><td>Registration Date</td><td>${fmt(a.registrationDate)}</td></tr>
    <tr><td>Engine Type</td><td>${a.engineType || "—"}</td></tr>
    <tr><td>Engine Serial</td><td>${a.engineSerial || "—"}</td></tr>
    <tr><td>Propeller Type</td><td>${a.propType || "—"}</td></tr>
    <tr><td>Propeller Serial</td><td>${a.propSerial || "—"}</td></tr>
    <tr><td>Annual Due</td><td>${fmt(a.annualDue)}</td></tr>
    <tr><td>Transponder Due</td><td>${fmt(a.transponderDue)}</td></tr>
    <tr><td>Pitot-Static Due</td><td>${fmt(a.pitotStaticDue)}</td></tr>
    <tr><td>ELT Battery Due</td><td>${fmt(a.eltBatteryDue)}</td></tr>
  `).join("\n");

  // Compliance calendar: pull due dates from aircraft + recurring AD nextDue from maintenance
  const today = new Date();
  today.setHours(0,0,0,0);
  function daysUntil(dateStr) {
    if (!dateStr) return null;
    const d = new Date(String(dateStr).slice(0, 10));
    if (isNaN(d)) return null;
    return Math.round((d - today) / 86400000);
  }
  function complianceColor(days) {
    if (days === null) return "";
    if (days < 0) return "badge-red";
    if (days <= 30) return "badge-red";
    if (days <= 90) return "badge-yellow";
    return "badge-green";
  }
  function complianceStatus(days) {
    if (days === null) return "Unknown";
    if (days < 0) return "OVERDUE";
    if (days <= 30) return "Due Soon";
    if (days <= 90) return "Upcoming";
    return "Current";
  }

  const complianceItems = [];
  if (primaryAircraft.annualDue) complianceItems.push({ item: "Annual Inspection", due: primaryAircraft.annualDue });
  if (primaryAircraft.transponderDue) complianceItems.push({ item: "Transponder Check", due: primaryAircraft.transponderDue });
  if (primaryAircraft.pitotStaticDue) complianceItems.push({ item: "Pitot-Static Check", due: primaryAircraft.pitotStaticDue });
  if (primaryAircraft.eltBatteryDue) complianceItems.push({ item: "ELT Battery", due: primaryAircraft.eltBatteryDue });

  // Pull AD nextDue from maintenance records
  for (const m of maintenance) {
    for (const ad of (m.adCompliance || [])) {
      if (ad.nextDue) {
        complianceItems.push({ item: `AD ${ad.adNumber || ""}${ad.title ? " — " + ad.title : ""}`, due: ad.nextDue });
      }
    }
  }

  const complianceRows = complianceItems.map((ci) => {
    const days = daysUntil(ci.due);
    const colorClass = complianceColor(days);
    const status = complianceStatus(days);
    return `<tr>
      <td>${ci.item}</td>
      <td>${fmt(ci.due)}</td>
      <td>${days !== null ? (days < 0 ? `${Math.abs(days)} days ago` : `${days} days`) : "—"}</td>
      <td><span class="badge ${colorClass}">${status}</span></td>
    </tr>`;
  }).join("\n");

  const integrityStatus = anchored
    ? `<span class="badge badge-green">Anchored — ${verification.anchorNetwork || "network"}</span>`
    : `<span class="badge badge-yellow">Not Yet Anchored</span>`;

  const hashMatchBadge = hashMatch
    ? `<span class="badge badge-green">Hash Match ✓</span>`
    : `<span class="badge badge-yellow">Hash Drift Detected</span>`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>AirLog Sale Packet — ${primaryAircraft.ident || "Aircraft"}</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: "Helvetica Neue", Helvetica, Arial, sans-serif;
      font-size: 13px;
      color: #1a1a2e;
      background: #f5f7fa;
      line-height: 1.5;
    }
    @media print {
      body { background: #fff; font-size: 11px; }
      .no-print { display: none !important; }
      section { break-inside: avoid; }
      .page-break { page-break-after: always; }
    }
    .container { max-width: 960px; margin: 0 auto; padding: 24px 20px 48px; }

    /* HEADER */
    .header {
      background: linear-gradient(135deg, #0d1b4b 0%, #1a3a8f 100%);
      color: #fff;
      padding: 32px 36px;
      border-radius: 8px;
      margin-bottom: 28px;
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
    }
    .header-brand { font-size: 22px; font-weight: 700; letter-spacing: 0.04em; }
    .header-brand span { color: #7aa7ff; }
    .header-sub { font-size: 12px; color: #b0c4ff; margin-top: 4px; }
    .header-ident { text-align: right; }
    .header-ident .ident { font-size: 36px; font-weight: 800; letter-spacing: 0.06em; color: #fff; }
    .header-ident .type { font-size: 14px; color: #b0c4ff; margin-top: 2px; }
    .header-ident .gendate { font-size: 11px; color: #8099cc; margin-top: 6px; }

    /* SECTION */
    section {
      background: #fff;
      border-radius: 8px;
      border: 1px solid #e2e8f0;
      margin-bottom: 20px;
      overflow: hidden;
    }
    .section-title {
      background: #f8fafc;
      border-bottom: 1px solid #e2e8f0;
      padding: 12px 20px;
      font-size: 12px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: #4a5568;
    }
    .section-body { padding: 20px; }

    /* GRID */
    .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
    .grid-3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }
    .stat-card {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 6px;
      padding: 14px 16px;
    }
    .stat-label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.07em; color: #718096; font-weight: 600; }
    .stat-value { font-size: 22px; font-weight: 700; color: #1a1a2e; margin-top: 4px; }
    .stat-unit { font-size: 11px; color: #a0aec0; font-weight: 400; }

    /* KV TABLE */
    .kv-table { width: 100%; border-collapse: collapse; }
    .kv-table tr { border-bottom: 1px solid #f0f4f8; }
    .kv-table tr:last-child { border-bottom: none; }
    .kv-table td { padding: 8px 0; vertical-align: top; }
    .kv-table td:first-child { color: #718096; font-weight: 500; width: 42%; font-size: 12px; }
    .kv-table td:last-child { color: #1a1a2e; font-weight: 600; }

    /* DATA TABLE */
    .data-table { width: 100%; border-collapse: collapse; }
    .data-table th {
      background: #f8fafc;
      text-align: left;
      padding: 9px 12px;
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: #4a5568;
      border-bottom: 2px solid #e2e8f0;
    }
    .data-table td {
      padding: 9px 12px;
      border-bottom: 1px solid #f0f4f8;
      vertical-align: top;
      color: #2d3748;
      font-size: 12px;
    }
    .data-table tr:last-child td { border-bottom: none; }
    .data-table tr:hover td { background: #fafbff; }

    /* BADGES */
    .badge {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 12px;
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      background: #e8edf8;
      color: #3a5199;
    }
    .badge-green { background: #d4edda; color: #1a6630; }
    .badge-yellow { background: #fff3cd; color: #856404; }
    .badge-red { background: #f8d7da; color: #721c24; }

    .rts-yes { color: #1a6630; font-weight: 700; }
    .rts-no { color: #a0aec0; }

    /* COMPONENT DETAIL ROW */
    .comp-row td { padding: 0 12px 8px; border-bottom: none; background: #fafbff; }
    .comp-detail { font-size: 11px; color: #4a5568; background: #f0f4ff; border-radius: 4px; padding: 6px 10px; border-left: 3px solid #b0c4ff; }

    /* INTEGRITY BLOCK */
    .integrity-block {
      background: #f0f4ff;
      border: 1px solid #c3d0f5;
      border-radius: 6px;
      padding: 16px 20px;
    }
    .hash-display {
      font-family: "SFMono-Regular", Consolas, monospace;
      font-size: 11px;
      color: #2d3748;
      word-break: break-all;
      background: #fff;
      border: 1px solid #d6e0f5;
      border-radius: 4px;
      padding: 8px 12px;
      margin-top: 8px;
    }

    /* QUALITY SCORE */
    .score-display { font-size: 48px; font-weight: 800; color: #1a3a8f; line-height: 1; }
    .score-label { font-size: 12px; color: #718096; margin-top: 4px; }
    .score-bar { height: 8px; background: #e2e8f0; border-radius: 4px; margin: 12px 0; overflow: hidden; }
    .score-fill { height: 100%; background: linear-gradient(90deg, #1a3a8f, #4a7adf); border-radius: 4px; transition: width 0.3s; }

    /* GAPS */
    .gap-item { display: flex; align-items: flex-start; gap: 10px; padding: 10px 0; border-bottom: 1px solid #f0f4f8; }
    .gap-item:last-child { border-bottom: none; }
    .gap-dot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; margin-top: 3px; }
    .gap-dot-high { background: #ef4444; }
    .gap-dot-medium { background: #f59e0b; }
    .gap-text { font-size: 12px; color: #2d3748; }
    .gap-type { font-size: 10px; text-transform: uppercase; letter-spacing: 0.06em; color: #a0aec0; margin-top: 2px; }
    .gap-none { color: #22c55e; font-size: 12px; font-weight: 600; display: flex; align-items: center; gap: 8px; }

    /* FOOTER */
    .footer {
      text-align: center;
      margin-top: 32px;
      padding-top: 20px;
      border-top: 1px solid #e2e8f0;
      font-size: 11px;
      color: #a0aec0;
    }
    .footer strong { color: #4a5568; }
  </style>
</head>
<body>
<div class="container">

  <!-- HEADER -->
  <div class="header">
    <div>
      <div class="header-brand">Air<span>Log</span></div>
      <div class="header-sub">Aircraft Records &amp; Sale Packet</div>
      <div style="margin-top:12px;">${integrityStatus}</div>
    </div>
    <div class="header-ident">
      <div class="ident">${primaryAircraft.ident || "—"}</div>
      <div class="type">${primaryAircraft.type || "—"}</div>
      <div class="gendate">Generated ${generatedFormatted}</div>
      <div style="margin-top:10px;">
        <a href="/export/sale-packet/pdf" style="display:inline-block;padding:7px 16px;background:#1a3a6e;color:#fff;border-radius:6px;font-size:12px;font-weight:700;text-decoration:none;letter-spacing:0.03em;" download>⬇ Download PDF</a>
      </div>
    </div>
  </div>

  <!-- BUYER SUMMARY -->
  <section style="border-left: 4px solid ${trustColor};">
    <div class="section-title" style="background:#fafbff;">Buyer Summary</div>
    <div class="section-body">
      <div style="display:flex;align-items:center;gap:16px;margin-bottom:14px;">
        <div style="font-size:32px;font-weight:800;color:${trustColor};line-height:1;">${trustLabel}</div>
        <div style="font-size:13px;color:#2d3748;line-height:1.6;max-width:640px;">
          ${trustExplanation}
        </div>
      </div>
      <div style="font-size:13px;color:#4a5568;line-height:1.8;">
        This record package covers <strong>${primaryAircraft.type || "the aircraft"}</strong>
        (${primaryAircraft.ident || "—"}), serial number <strong>${primaryAircraft.serialNumber || "—"}</strong>.
        The logbook contains <strong>${entries.length} entr${entries.length === 1 ? "y" : "ies"}</strong>
        ${firstEntryDate && lastEntryDate ? `spanning <strong>${firstEntryDate}</strong> to <strong>${lastEntryDate}</strong>` : ""}.
        ${buyerSummaryStatus}
        ${buyerSummaryGaps}
      </div>
    </div>
  </section>

  <!-- TRUST SUMMARY + BUYER EVIDENCE INDEX -->
  <div class="grid-2">
    <section>
      <div class="section-title">Trust Summary</div>
      <div class="section-body">
        <div style="display:flex;align-items:center;gap:14px;margin-bottom:12px;">
          <div style="width:14px;height:14px;border-radius:50%;background:${trustColor};flex-shrink:0;"></div>
          <div>
            <div style="font-size:16px;font-weight:700;color:${trustColor};">${trustLabel} — ${qualityScore}/100</div>
            <div style="font-size:11px;color:#718096;margin-top:2px;">${trustExplanation}</div>
          </div>
        </div>
        <table class="kv-table">
          <tr><td style="color:#718096;">Integrity</td><td>${integrityStatus}</td></tr>
          <tr><td style="color:#718096;">Hash</td><td>${hashMatchBadge}</td></tr>
          <tr><td style="color:#718096;">Quality Score</td><td><strong>${qualityScore}/100</strong></td></tr>
          <tr><td style="color:#718096;">Maintenance Records</td><td>${maintenance.length}</td></tr>
          <tr><td style="color:#718096;">Log Entries</td><td>${entries.length}</td></tr>
        </table>
        <div style="margin-top:12px;">
          <a href="/verify/airworthy/html" style="display:inline-block;padding:7px 14px;background:#1a3a8f;color:#fff;border-radius:6px;font-size:12px;font-weight:600;text-decoration:none;">
            View Airworthiness Check →
          </a>
        </div>
      </div>
    </section>
    <section>
      <div class="section-title">Buyer Evidence Index</div>
      <div class="section-body" style="padding:0;">
        <table class="data-table">
          <tbody>${evidenceRows}</tbody>
        </table>
      </div>
    </section>
  </div>

  <!-- TRUST BASIS -->
  <section>
    <div class="section-title">Trust Basis</div>
    <div class="section-body">
      <p style="font-size:12px;color:#718096;margin-bottom:14px;line-height:1.6;">
        This section explains what AirLog can confirm, what it takes as given, and what it cannot verify.
        It is intended to help buyers make informed decisions — not to substitute for a pre-buy inspection.
      </p>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px;">
        <div>
          <div style="font-size:11px;font-weight:700;color:#22c55e;letter-spacing:0.05em;margin-bottom:8px;text-transform:uppercase;">✓ Verified</div>
          ${trustBasis.verified.length > 0
            ? trustBasis.verified.map(v => `<div style="font-size:12px;color:#2d3748;padding:4px 0;border-bottom:1px solid #f0f2f5;">${v}</div>`).join("")
            : `<div style="font-size:12px;color:#a0aec0;">No items verified</div>`}
        </div>
        <div>
          <div style="font-size:11px;font-weight:700;color:#f59e0b;letter-spacing:0.05em;margin-bottom:8px;text-transform:uppercase;">~ Assumed</div>
          ${trustBasis.assumed.map(a => `<div style="font-size:12px;color:#4a5568;padding:4px 0;border-bottom:1px solid #f0f2f5;">${a}</div>`).join("")}
        </div>
        <div>
          <div style="font-size:11px;font-weight:700;color:#ef4444;letter-spacing:0.05em;margin-bottom:8px;text-transform:uppercase;">✗ Missing / Unverifiable</div>
          ${trustBasis.missing.length > 0
            ? trustBasis.missing.map(m => `<div style="font-size:12px;color:#ef4444;padding:4px 0;border-bottom:1px solid #f0f2f5;">${m}</div>`).join("")
            : `<div style="font-size:12px;color:#22c55e;">No known gaps</div>`}
        </div>
      </div>
    </div>
  </section>

  <!-- RECORD GAPS & FLAGS -->
  <section>
    <div class="section-title">Record Gaps &amp; Flags</div>
    <div class="section-body">
      ${gaps.length === 0
        ? `<div class="gap-none"><span style="font-size:16px;">✓</span> No gaps detected — records appear complete</div>`
        : gaps.map((g) => `
        <div class="gap-item">
          <div class="gap-dot gap-dot-${g.severity}"></div>
          <div>
            <div class="gap-text">${g.description}</div>
            <div class="gap-type">${g.type.replace(/_/g, " ")}${g.severity === "high" ? " · high severity" : " · medium severity"}</div>
          </div>
        </div>`).join("")}
    </div>
  </section>

  <!-- LOGBOOK SUMMARY -->
  <section>
    <div class="section-title">Logbook Summary</div>
    <div class="section-body">
      <div style="display:flex;gap:24px;margin-bottom:16px;padding-bottom:16px;border-bottom:1px solid #e2e8f0;flex-wrap:wrap;">
        <div><span style="font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:#718096;font-weight:600;">First Entry</span><div style="font-size:14px;font-weight:700;color:#1a1a2e;margin-top:3px;">${firstEntryDate || "—"}</div></div>
        <div><span style="font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:#718096;font-weight:600;">Last Entry</span><div style="font-size:14px;font-weight:700;color:#1a1a2e;margin-top:3px;">${lastEntryDate || "—"}</div></div>
        <div><span style="font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:#718096;font-weight:600;">Total Entries</span><div style="font-size:14px;font-weight:700;color:#1a1a2e;margin-top:3px;">${entries.length}</div></div>
      </div>
      <div class="grid-3">
        <div class="stat-card">
          <div class="stat-label">Total Hours</div>
          <div class="stat-value">${fmtNum(totals.total)} <span class="stat-unit">hrs</span></div>
        </div>
        <div class="stat-card">
          <div class="stat-label">PIC Hours</div>
          <div class="stat-value">${fmtNum(totals.pic)} <span class="stat-unit">hrs</span></div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Total Landings</div>
          <div class="stat-value">${totalLandings}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Instrument Time</div>
          <div class="stat-value">${fmtNum(instrumentTime)} <span class="stat-unit">hrs</span></div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Night Hours</div>
          <div class="stat-value">${fmtNum(totals.night)} <span class="stat-unit">hrs</span></div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Log Entries</div>
          <div class="stat-value">${entries.length}</div>
        </div>
      </div>
    </div>
  </section>

  <!-- AIRCRAFT + PILOT GRID -->
  <div class="grid-2">
    <section>
      <div class="section-title">Aircraft Summary</div>
      <div class="section-body">
        <table class="kv-table">
          ${aircraftRows}
        </table>
      </div>
    </section>
    <section>
      <div class="section-title">Pilot / Owner Summary</div>
      <div class="section-body">
        <table class="kv-table">
          <tr><td>Full Name</td><td>${profile?.pilot?.fullName || "—"}</td></tr>
          <tr><td>Medical</td><td>${profile?.medical?.kind || "None"}${profile?.medical?.class ? " Class " + profile.medical.class : ""}</td></tr>
          <tr><td>Medical Expires</td><td>${fmt(profile?.medical?.expires)}</td></tr>
          <tr><td>Flight Review</td><td>${fmt(profile?.proficiency?.flightReviewDate)}</td></tr>
          <tr><td>IPC Date</td><td>${fmt(profile?.proficiency?.ipcDate)}</td></tr>
          <tr><td>Endorsements</td><td>${profile?.endorsements?.length || 0}</td></tr>
        </table>
      </div>
    </section>
  </div>

  <!-- COMPLIANCE CALENDAR -->
  <section>
    <div class="section-title">Upcoming Compliance &amp; Inspections</div>
    <div class="section-body" style="padding:0;">
      ${complianceItems.length === 0
        ? '<div style="padding:20px;color:#a0aec0;text-align:center;">No compliance dates on file.</div>'
        : `<table class="data-table">
          <thead>
            <tr>
              <th>Item</th>
              <th>Due Date</th>
              <th>Days Until Due</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            ${complianceRows}
          </tbody>
        </table>`}
    </div>
  </section>

  <!-- AD COMPLIANCE -->
  <section>
    <div class="section-title">AD Compliance</div>
    <div class="section-body" style="padding:0;">
      ${adEntries.length === 0
        ? '<div style="padding:20px 24px;color:#4a5568;font-size:13px;line-height:1.7;border-left:3px solid #e2e8f0;margin:16px;border-radius:2px;">No airworthiness directive compliance records are included in this package. The absence of records in this system does not confirm compliance status. Buyers should verify AD compliance independently through the aircraft maintenance logbooks and with a qualified A&amp;P mechanic or IA prior to purchase.</div>'
        : `<table class="data-table">
          <thead><tr><th>AD Number</th><th>Description</th><th>Date Complied</th><th>Mechanic</th><th>Next Due</th></tr></thead>
          <tbody>${adRows}</tbody>
        </table>`}
    </div>
  </section>

  <!-- 337 / MAJOR ALTERATIONS -->
  <section>
    <div class="section-title">337 / Major Alterations</div>
    <div class="section-body" style="padding:0;">
      ${alterationEntries.length === 0
        ? '<div style="padding:20px 24px;color:#4a5568;font-size:13px;line-height:1.7;border-left:3px solid #e2e8f0;margin:16px;border-radius:2px;">No FAA Form 337 or major alteration records are included in this package. This does not confirm that no alterations have been performed. Buyers should review all aircraft logbooks and FAA records directly to verify the modification history of this aircraft.</div>'
        : `<table class="data-table">
          <thead><tr><th>Date</th><th>Description</th><th>Performed By</th><th>Documents</th></tr></thead>
          <tbody>${alterationRows}</tbody>
        </table>`}
    </div>
  </section>

  <!-- COMPONENT SNAPSHOT -->
  <section>
    <div class="section-title">Component Snapshot</div>
    <div class="section-body">
      <div class="grid-3">
        <div class="stat-card">
          <div class="stat-label">Engine</div>
          <div style="font-size:13px;font-weight:600;color:#1a1a2e;margin-top:6px;">${pa.engineType || "—"}</div>
          <div style="font-size:11px;color:#718096;margin-top:2px;">S/N: ${pa.engineSerial || "—"}</div>
          <div style="font-size:11px;color:#718096;margin-top:2px;">SMOH: ${pa.engineTimeSMOH != null ? fmtNum(pa.engineTimeSMOH) + " hrs" : "Not recorded"}</div>
          ${(() => { const r = lastServiceRecord("engine"); return r ? `
          <div style="font-size:11px;color:#718096;margin-top:2px;">Last service: ${r.date}</div>
          ${r.condition ? `<div style="font-size:11px;color:#718096;margin-top:2px;">Condition: <span style="color:${r.condition === "serviceable" ? "#22c55e" : "#ef4444"};font-weight:600;">${r.condition}</span></div>` : ""}
          ${r.mechanic ? `<div style="font-size:11px;color:#718096;margin-top:2px;">Signed off: ${r.mechanic}</div>` : ""}
          ` : '<div style="font-size:11px;color:#a0aec0;margin-top:2px;">No service records</div>'; })()}
        </div>
        <div class="stat-card">
          <div class="stat-label">Propeller</div>
          <div style="font-size:13px;font-weight:600;color:#1a1a2e;margin-top:6px;">${pa.propType || "—"}</div>
          <div style="font-size:11px;color:#718096;margin-top:2px;">S/N: ${pa.propSerial || "—"}</div>
          ${(() => { const r = lastServiceRecord("prop"); return r ? `
          <div style="font-size:11px;color:#718096;margin-top:2px;">Last service: ${r.date}</div>
          ${r.condition ? `<div style="font-size:11px;color:#718096;margin-top:2px;">Condition: <span style="color:${r.condition === "serviceable" ? "#22c55e" : "#ef4444"};font-weight:600;">${r.condition}</span></div>` : ""}
          ${r.mechanic ? `<div style="font-size:11px;color:#718096;margin-top:2px;">Signed off: ${r.mechanic}</div>` : ""}
          ` : '<div style="font-size:11px;color:#a0aec0;margin-top:2px;">No service records</div>'; })()}
        </div>
        <div class="stat-card">
          <div class="stat-label">Avionics</div>
          ${(pa.avionics || []).map((av) => {
            const r = lastServiceRecord(av.toLowerCase().split(" ").slice(0, 2).join(" "));
            return `<div style="font-size:12px;color:#2d3748;margin-top:6px;font-weight:600;">${av}</div>
            ${r ? `<div style="font-size:11px;color:#718096;">Last tested: ${r.date}</div>
            ${r.condition ? `<div style="font-size:11px;color:#718096;">Condition: <span style="color:${r.condition === "serviceable" ? "#22c55e" : "#ef4444"};font-weight:600;">${r.condition}</span></div>` : ""}` : ""}`;
          }).join("") || '<div style="font-size:12px;color:#a0aec0;margin-top:6px;">Not recorded</div>'}
        </div>
      </div>
    </div>
  </section>

  <!-- MAINTENANCE HISTORY -->
  <section>
    <div class="section-title">Maintenance History (${maintenance.length} records)</div>
    <div class="section-body" style="padding:0;">
      ${maintenance.length === 0
        ? '<div style="padding:20px;color:#a0aec0;text-align:center;">No maintenance records on file.</div>'
        : `<table class="data-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Category</th>
              <th>Description</th>
              <th>Mechanic</th>
              <th>Airframe Hrs</th>
              <th>RTS</th>
            </tr>
          </thead>
          <tbody>
            ${maintenanceRows}
          </tbody>
        </table>`}
    </div>
  </section>

  <!-- INTEGRITY + QUALITY GRID -->
  <div class="grid-2">
    <section>
      <div class="section-title">Record Integrity</div>
      <div class="section-body">
        <div class="integrity-block">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
            <span style="font-weight:600;font-size:12px;">Status</span>
            ${integrityStatus}
          </div>
          ${anchorHash ? `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
            <span style="font-weight:600;font-size:12px;">Hash Match</span>
            ${hashMatchBadge}
          </div>` : ""}
          ${verification?.anchorTime ? `<div style="font-size:11px;color:#718096;margin-bottom:6px;">Anchored: ${String(verification.anchorTime).slice(0,10)}</div>` : ""}
          ${verification?.anchorNetwork ? `<div style="font-size:11px;color:#718096;margin-bottom:6px;">Network: ${verification.anchorNetwork}</div>` : ""}
          <div style="font-size:11px;color:#718096;margin-top:12px;line-height:1.6;border-left:3px solid #e2e8f0;padding-left:10px;">
            This record set hashes to the value below. Any change to the underlying records — even a single character — will produce a different hash. You can use this to confirm you are reviewing unmodified records.
          </div>
          <div style="font-size:11px;color:#718096;margin-top:8px;font-weight:600;">Current Record Hash</div>
          <div class="hash-display">${currentHash}</div>
          ${anchorHash && anchorHash !== currentHash ? `<div style="font-size:11px;color:#718096;margin-top:8px;font-weight:600;">Anchored Hash</div><div class="hash-display">${anchorHash}</div>` : ""}
        </div>
      </div>
    </section>
    <section>
      <div class="section-title">Record Completeness Score</div>
      <div class="section-body">
        <div class="score-display">${qualityScore}<span style="font-size:20px;color:#a0aec0;">/100</span></div>
        <div class="score-label">${qualityScore >= 90 ? "Excellent" : qualityScore >= 70 ? "Good" : qualityScore >= 45 ? "Fair" : "Incomplete"}</div>
        <div class="score-bar"><div class="score-fill" style="width:${qualityScore}%;"></div></div>
        <table class="data-table" style="margin-top:8px;">
          <thead><tr><th></th><th>Factor</th><th>Points</th></tr></thead>
          <tbody>${qualityRows}</tbody>
        </table>
      </div>
    </section>
  </div>

</div>

<!-- FOOTER -->
<div class="footer">
  <strong>Verified by AirLog</strong> &mdash;
  Record Hash: <code style="font-size:10px;">${currentHash.slice(0, 16)}…</code> &mdash;
  Generated ${generatedFormatted} &mdash;
  <a href="/verify/airworthy/html" style="color:#9aa3ff;text-decoration:none;">Airworthiness Check</a>
</div>

</body>
</html>`;

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(html);
});

app.get("/export/sale-packet/pdf", async (_req, res) => {
  let browser;
  try {
    const { default: puppeteer } = await import("puppeteer");
    browser = await puppeteer.launch({ args: ["--no-sandbox", "--disable-setuid-sandbox"] });
    const page = await browser.newPage();
    await page.goto(`http://127.0.0.1:${PORT}/export/sale-packet/html`, { waitUntil: "networkidle0", timeout: 15000 });
    const pdf = await page.pdf({
      format: "Letter",
      printBackground: true,
      margin: { top: "0.5in", bottom: "0.5in", left: "0.5in", right: "0.5in" }
    });
    await browser.close();
    const entries = readEntries();
    const aircraft = readAircraft();
    const reg = (aircraft[0]?.registration || "aircraft").replace(/[^A-Z0-9]/gi, "");
    const date = new Date().toISOString().slice(0, 10);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="AirLog-SalePacket-${reg}-${date}.pdf"`);
    res.send(pdf);
  } catch (err) {
    if (browser) await browser.close().catch(() => {});
    res.status(500).json({ error: "PDF generation failed", detail: err.message });
  }
});

app.get("/verify/hash/:hash", (_req, res) => {
  const verification = readVerification();
  const submitted = _req.params.hash;

  if (!verification?.anchorHash) {
    return res.json({
      verified: false,
      reason: "No anchored record found"
    });
  }

  const match = verification.anchorHash === submitted;

  res.json({
    verified: match,
    submittedHash: submitted,
    anchoredHash: verification.anchorHash,
    anchorNetwork: verification.anchorNetwork,
    anchorTime: verification.anchorTime,
    anchorTx: verification.anchorTx
  });
});

// ── Public Anchor Verification ───────────────────────────────────────────────
function renderVerifyHtml(body) {
  const anchored = body.anchored === true;
  const integrityOk = body.integrity === "valid";
  const statusColor = anchored && integrityOk ? "#22c55e" : anchored && !integrityOk ? "#ef4444" : "#f59e0b";
  const statusIcon = anchored && integrityOk ? "✓" : anchored && !integrityOk ? "✗" : "—";
  const statusLabel = anchored && integrityOk ? "Anchored" : anchored && !integrityOk ? "Hash Mismatch" : "Not Anchored";
  const integrityLabel = integrityOk ? "✓ Valid" : body.integrity === "hash_mismatch" ? "✗ Hash mismatch — records changed after anchoring" : "—";
  const timestampStr = body.timestamp ? String(body.timestamp).slice(0, 19).replace("T", " ") + " UTC" : "—";
  const network = body.network || "midnight-local";
  const tx = body.tx || "—";
  const hash = body.hash || "—";
  const reason = body.reason || null;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>AirLog — Blockchain Verification</title>
<style>
  body { margin: 0; background: #0f172a; color: #e2e8f0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; padding: 40px 20px; }
  .container { max-width: 560px; margin: 0 auto; }
  .header { margin-bottom: 32px; }
  .header h1 { font-size: 20px; font-weight: 700; color: #f8fafc; margin: 0 0 4px; }
  .header p { font-size: 13px; color: #64748b; margin: 0; }
  .card { background: #1e293b; border-radius: 10px; padding: 24px; margin-bottom: 16px; }
  .status-badge { display: inline-flex; align-items: center; gap: 8px; padding: 8px 16px; border-radius: 20px; font-size: 14px; font-weight: 700; background: ${anchored && integrityOk ? "#14532d" : anchored && !integrityOk ? "#7f1d1d" : "#422006"}; color: ${statusColor}; margin-bottom: 20px; }
  .row { display: flex; flex-direction: column; margin-bottom: 14px; }
  .row:last-child { margin-bottom: 0; }
  .lbl { font-size: 10px; letter-spacing: 0.08em; text-transform: uppercase; color: #64748b; margin-bottom: 4px; }
  .val { font-size: 12px; color: #cbd5e1; word-break: break-all; font-family: ui-monospace, monospace; }
  .val.ok { color: #22c55e; font-family: inherit; font-size: 13px; }
  .val.fail { color: #ef4444; font-family: inherit; font-size: 13px; }
  .back { display: inline-block; margin-top: 24px; font-size: 12px; color: #6366f1; text-decoration: none; }
  .back:hover { text-decoration: underline; }
</style>
</head>
<body>
<div class="container">
  <div class="header">
    <h1>AirLog · Blockchain Verification</h1>
    <p>Independent confirmation of the Midnight network anchor for this aircraft record report.</p>
  </div>
  <div class="card">
    <div class="status-badge">${statusIcon} ${statusLabel}</div>
    ${reason ? `<div class="row"><div class="lbl">Note</div><div class="val">${reason}</div></div>` : ""}
    <div class="row"><div class="lbl">Transaction ID</div><div class="val">${tx}</div></div>
    <div class="row"><div class="lbl">Anchored</div><div class="val ${anchored ? "ok" : "fail"}">${anchored ? "✓ Yes" : "✗ No"}</div></div>
    <div class="row"><div class="lbl">Integrity</div><div class="val ${integrityOk ? "ok" : "fail"}">${integrityLabel}</div></div>
    <div class="row"><div class="lbl">Timestamp</div><div class="val">${timestampStr}</div></div>
    <div class="row"><div class="lbl">Network</div><div class="val">${network}</div></div>
    ${anchored ? `<div class="row"><div class="lbl">Anchored Hash</div><div class="val">${hash}</div></div>` : ""}
  </div>
  <a href="/report" class="back">← Back to Record Report</a>
  <span style="font-size:11px;color:#334155;margin-left:16px;"><a href="?format=json" style="color:#334155;">View raw JSON</a></span>
</div>
</body>
</html>`;
}

function verifyAnchorTx(tx) {
  const verification = readVerification();
  const entries = readEntries();
  const aircraftList = readAircraft();
  const aircraft = aircraftList[0];

  if (!tx) {
    return { status: 200, body: { anchored: false, integrity: "invalid", reason: "No anchor transaction on record" } };
  }

  if (!verification?.anchorTx || !verification?.anchored) {
    return {
      status: 200,
      body: { tx, anchored: false, integrity: "invalid" },
    };
  }

  if (verification.anchorTx !== tx) {
    return {
      status: 200,
      body: { tx, anchored: false, integrity: "invalid" },
    };
  }

  // Compute current hash for comparison
  let currentHash = null;
  try {
    if (aircraft) {
      currentHash = buildIntegrityResult({ aircraft, entries }).anchorHash;
    }
  } catch {}

  const hashMatch = currentHash && verification.anchorHash
    ? currentHash === verification.anchorHash
    : null;

  return {
    status: 200,
    body: {
      tx,
      anchored: true,
      hash: verification.anchorHash,
      timestamp: verification.anchorTime || null,
      integrity: hashMatch === false ? "hash_mismatch" : "valid",
      network: verification.anchorNetwork || "midnight-local",
    },
  };
}

// ── Airworthiness Verification ───────────────────────────────────────────────
app.get("/verify/airworthy", (_req, res) => {
  const aircraft = readAircraft();
  const maintenance = readMaintenance();
  const entries = readEntries();

  const pa = aircraft[0] || {};
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  function daysUntil(dateStr) {
    if (!dateStr) return null;
    const d = new Date(String(dateStr).slice(0, 10));
    if (isNaN(d)) return null;
    return Math.round((d - today) / 86400000);
  }

  const basis = [];
  const missing = [];
  let pass = true;

  // Annual inspection
  if (pa.annualDue) {
    const days = daysUntil(pa.annualDue);
    if (days !== null && days >= 0) {
      basis.push(`Annual inspection current — due ${String(pa.annualDue).slice(0, 10)} (${days} days)`);
    } else if (days !== null && days < 0) {
      pass = false;
      missing.push(`Annual inspection overdue by ${Math.abs(days)} days (due ${String(pa.annualDue).slice(0, 10)})`);
    }
  } else {
    pass = false;
    missing.push("Annual inspection date not recorded — currency cannot be confirmed");
  }

  // Flight records present
  if (entries.length > 0) {
    basis.push(`${entries.length} flight log entr${entries.length > 1 ? "ies" : "y"} on file`);
  } else {
    missing.push("No flight log entries — total time unverifiable");
  }

  // Maintenance history
  if (maintenance.length > 0) {
    basis.push(`${maintenance.length} maintenance record${maintenance.length > 1 ? "s" : ""} on file`);
  } else {
    missing.push("No maintenance records — service history unverifiable");
  }

  // AD compliance
  const adEntries = maintenance.filter((m) => m.category === "ad-compliance" || (m.adCompliance && m.adCompliance.length > 0));
  if (adEntries.length > 0) {
    basis.push(`${adEntries.length} AD compliance record${adEntries.length > 1 ? "s" : ""} present`);
  } else {
    missing.push("No AD compliance records — airworthiness directive status unverifiable");
  }

  // Transponder check
  if (pa.transponderDue) {
    const days = daysUntil(pa.transponderDue);
    if (days !== null && days >= 0) {
      basis.push(`Transponder check current — due ${String(pa.transponderDue).slice(0, 10)}`);
    } else if (days !== null && days < 0) {
      missing.push(`Transponder check overdue by ${Math.abs(days)} days`);
    }
  } else {
    missing.push("Transponder check date not recorded");
  }

  res.json({
    pass,
    result: pass ? "PASS" : "FAIL",
    disclaimer: "This is a record-based assessment only. It does not constitute a legal airworthiness determination. A qualified A&P mechanic or IA must inspect the aircraft prior to purchase.",
    basis,
    missing,
    generated: new Date().toISOString()
  });
});

// ── Airworthiness Check (HTML) ───────────────────────────────────────────────
app.get("/verify/airworthy/html", (_req, res) => {
  const aircraft = readAircraft();
  const maintenance = readMaintenance();
  const entries = readEntries();

  const pa = aircraft[0] || {};
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  function daysUntil(dateStr) {
    if (!dateStr) return null;
    const d = new Date(String(dateStr).slice(0, 10));
    if (isNaN(d)) return null;
    return Math.round((d - today) / 86400000);
  }

  const checks = [];
  let overallPass = true;

  // Annual inspection
  if (pa.annualDue) {
    const days = daysUntil(pa.annualDue);
    if (days !== null && days >= 0) {
      checks.push({ label: "Annual Inspection", status: "pass", detail: `Current — due ${String(pa.annualDue).slice(0, 10)} (${days} days remaining)` });
    } else {
      overallPass = false;
      checks.push({ label: "Annual Inspection", status: "fail", detail: `Overdue by ${Math.abs(days)} days (was due ${String(pa.annualDue).slice(0, 10)})` });
    }
  } else {
    overallPass = false;
    checks.push({ label: "Annual Inspection", status: "unknown", detail: "Due date not recorded — currency cannot be confirmed" });
  }

  // Transponder check
  if (pa.transponderDue) {
    const days = daysUntil(pa.transponderDue);
    if (days !== null && days >= 0) {
      checks.push({ label: "Transponder / ADS-B Check", status: "pass", detail: `Current — due ${String(pa.transponderDue).slice(0, 10)}` });
    } else {
      overallPass = false;
      checks.push({ label: "Transponder / ADS-B Check", status: "fail", detail: `Overdue by ${Math.abs(days)} days` });
    }
  } else {
    overallPass = false;
    checks.push({ label: "Transponder / ADS-B Check", status: "unknown", detail: "Check date not recorded — cannot confirm currency" });
  }

  // Pitot-static check
  if (pa.pitotStaticDue) {
    const days = daysUntil(pa.pitotStaticDue);
    if (days !== null && days >= 0) {
      checks.push({ label: "Pitot-Static Check", status: "pass", detail: `Current — due ${String(pa.pitotStaticDue).slice(0, 10)}` });
    } else {
      overallPass = false;
      checks.push({ label: "Pitot-Static Check", status: "fail", detail: `Overdue by ${Math.abs(days)} days` });
    }
  } else {
    overallPass = false;
    checks.push({ label: "Pitot-Static Check", status: "unknown", detail: "Check date not recorded — cannot confirm currency" });
  }

  // ELT battery
  if (pa.eltBatteryDue) {
    const days = daysUntil(pa.eltBatteryDue);
    if (days !== null && days >= 0) {
      checks.push({ label: "ELT Battery", status: "pass", detail: `Current — due ${String(pa.eltBatteryDue).slice(0, 10)}` });
    } else {
      overallPass = false;
      checks.push({ label: "ELT Battery", status: "fail", detail: `Expired ${Math.abs(days)} days ago` });
    }
  } else {
    overallPass = false;
    checks.push({ label: "ELT Battery", status: "unknown", detail: "Expiry date not recorded — cannot confirm currency" });
  }

  // Maintenance history
  if (maintenance.length > 0) {
    checks.push({ label: "Maintenance Records", status: "pass", detail: `${maintenance.length} record${maintenance.length > 1 ? "s" : ""} on file` });
  } else {
    overallPass = false;
    checks.push({ label: "Maintenance Records", status: "fail", detail: "No maintenance records — service history unverifiable" });
  }

  // AD compliance
  const adEntries = maintenance.filter((m) => m.category === "ad-compliance" || (m.adCompliance && m.adCompliance.length > 0));
  if (adEntries.length > 0) {
    checks.push({ label: "AD Compliance Records", status: "pass", detail: `${adEntries.length} airworthiness directive record${adEntries.length > 1 ? "s" : ""} present` });
  } else {
    overallPass = false;
    checks.push({ label: "AD Compliance Records", status: "unknown", detail: "No AD records in this system — verify independently with logbooks and an A&P/IA" });
  }

  // Flight log
  if (entries.length > 0) {
    checks.push({ label: "Flight Log Entries", status: "pass", detail: `${entries.length} entries on file` });
  } else {
    overallPass = false;
    checks.push({ label: "Flight Log Entries", status: "unknown", detail: "No flight log entries — total time unverifiable" });
  }

  const passCount = checks.filter(c => c.status === "pass").length;
  const failCount = checks.filter(c => c.status === "fail").length;
  const unknownCount = checks.filter(c => c.status === "unknown").length;

  const generatedFormatted = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

  function statusIcon(s) {
    if (s === "pass") return "✓";
    if (s === "fail") return "✗";
    return "?";
  }
  function statusColor(s) {
    if (s === "pass") return "#22c55e";
    if (s === "fail") return "#ef4444";
    return "#f59e0b";
  }
  function statusBg(s) {
    if (s === "pass") return "#14532d";
    if (s === "fail") return "#7f1d1d";
    return "#78350f";
  }

  const checkRows = checks.map(c => `
    <div class="check-row">
      <div class="check-icon" style="background:${statusBg(c.status)};color:${statusColor(c.status)};">${statusIcon(c.status)}</div>
      <div class="check-body">
        <div class="check-label">${c.label}</div>
        <div class="check-detail">${c.detail}</div>
      </div>
    </div>`).join("\n");

  const resultBg = overallPass ? "#14532d" : "#7f1d1d";
  const resultColor = overallPass ? "#86efac" : "#fca5a5";
  const resultText = overallPass ? "PASS" : "FAIL";
  const resultDesc = overallPass
    ? "All compliance items on record are current. No missing or overdue items."
    : failCount > 0
      ? `${failCount} item${failCount !== 1 ? "s" : ""} failed. Review required before purchase.`
      : `${unknownCount} item${unknownCount !== 1 ? "s" : ""} could not be confirmed from available records. Independent verification required.`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Airworthiness Check — ${pa.ident || "Aircraft"}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{background:#0f1117;color:#e2e8f0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;padding:32px 24px;line-height:1.6}
  .container{max-width:700px;margin:0 auto}
  .header{margin-bottom:28px}
  h1{font-size:26px;font-weight:700;margin-bottom:4px}
  .subtitle{font-size:14px;color:#64748b}
  .result-banner{padding:16px 22px;border-radius:10px;margin-bottom:28px;display:flex;align-items:center;gap:16px;background:${resultBg}}
  .result-badge{font-size:28px;font-weight:800;color:${resultColor}}
  .result-text{font-size:15px;color:${resultColor};font-weight:500}
  .result-sub{font-size:13px;color:${resultColor};opacity:.8;margin-top:2px}
  .summary-row{display:flex;gap:16px;margin-bottom:24px;flex-wrap:wrap}
  .summary-pill{padding:6px 16px;border-radius:20px;font-size:13px;font-weight:600}
  .checks{display:flex;flex-direction:column;gap:10px;margin-bottom:28px}
  .check-row{display:flex;align-items:flex-start;gap:14px;background:#141920;border:1px solid #1e293b;border-radius:8px;padding:14px 16px}
  .check-icon{width:32px;height:32px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:16px;font-weight:700;flex-shrink:0}
  .check-label{font-size:15px;font-weight:600;color:#e2e8f0}
  .check-detail{font-size:13px;color:#94a3b8;margin-top:2px}
  .disclaimer{background:#141920;border:1px solid #334155;border-radius:8px;padding:16px 18px;font-size:13px;color:#64748b;line-height:1.7}
  .disclaimer strong{color:#94a3b8}
  .footer{margin-top:32px;text-align:center;font-size:12px;color:#475569}
  .back-link{margin-bottom:20px;font-size:13px}
  .back-link a{color:#9aa3ff;text-decoration:none}
</style>
</head>
<body>
<div class="container">
  <div class="back-link">
    <a href="/">← Back to Dashboard</a>
    &nbsp;&nbsp;·&nbsp;&nbsp;
    <a href="/export/sale-packet/html">View Full Sale Packet</a>
    &nbsp;&nbsp;·&nbsp;&nbsp;
    <a href="/export/sale-packet/pdf" download>⬇ Download PDF</a>
  </div>
  <div class="header">
    <h1>Airworthiness Check</h1>
    <div class="subtitle">${pa.ident || "Aircraft"} &nbsp;·&nbsp; ${pa.make || ""} ${pa.model || ""} &nbsp;·&nbsp; Generated ${generatedFormatted}</div>
  </div>

  <div class="result-banner">
    <div class="result-badge">${resultText}</div>
    <div>
      <div class="result-text">${resultDesc}</div>
      <div class="result-sub">Record-based assessment only — not a legal airworthiness determination</div>
    </div>
  </div>

  <div class="summary-row">
    <div class="summary-pill" style="background:#14532d;color:#86efac;">${passCount} Passed</div>
    ${failCount > 0 ? `<div class="summary-pill" style="background:#7f1d1d;color:#fca5a5;">${failCount} Failed</div>` : ""}
    ${unknownCount > 0 ? `<div class="summary-pill" style="background:#78350f;color:#fde68a;">${unknownCount} Unknown</div>` : ""}
  </div>

  <div class="checks">${checkRows}</div>

  <div class="disclaimer">
    <strong>Important:</strong> This is a record-based assessment derived from data entered into AirLog. It does not constitute a legal determination of airworthiness under 14 CFR Part 91. A qualified A&amp;P mechanic or IA must physically inspect the aircraft and review all maintenance logbooks prior to purchase. The absence of a record in this system does not confirm compliance — it may simply mean the record has not been entered.
  </div>

  <div class="footer">Generated by AirLog &nbsp;·&nbsp; ${new Date().toISOString()}</div>
</div>
</body>
</html>`;

  res.setHeader("Content-Type", "text/html");
  res.send(html);
});

app.get("/verify", (req, res) => {
  // If no tx param, use the stored anchorTx from verification.json for self-contained verification
  const tx = req.query.tx || readVerification()?.anchorTx || null;
  const result = verifyAnchorTx(tx);
  if (req.query.format === "json") {
    return res.status(result.status).json(result.body);
  }
  res.status(result.status).setHeader("Content-Type", "text/html; charset=utf-8").send(renderVerifyHtml(result.body));
});

app.get("/verify/:tx", (req, res) => {
  const result = verifyAnchorTx(req.params.tx);
  if (req.query.format === "json") {
    return res.status(result.status).json(result.body);
  }
  res.status(result.status).setHeader("Content-Type", "text/html; charset=utf-8").send(renderVerifyHtml(result.body));
});

// ── Trust Report (JSON) ──────────────────────────────────────────────────────
app.get("/export/trust-report", (_req, res) => {
  const entries = readEntries();
  const aircraft = readAircraft();
  const verification = readVerification();
  const maintenance = readMaintenance();
  const hash = hashLogbook(entries, readProfile(), aircraft);

  const report = buildTrustReport({
    aircraft,
    entries,
    maintenance,
    verification: { ...verification, currentHash: hash },
  });

  res.setHeader("Content-Type", "application/json");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="airlog-trust-report-${new Date().toISOString().slice(0,10)}.json"`
  );
  res.send(JSON.stringify(report, null, 2));
});

// ── Trust Report (HTML) ──────────────────────────────────────────────────────
app.get("/export/trust-report/html", (_req, res) => {
  const entries = readEntries();
  const profile = readProfile();
  const aircraft = readAircraft();
  const verification = readVerification();
  const maintenance = readMaintenance();
  const hash = hashLogbook(entries, profile, aircraft);

  const report = buildTrustReport({
    aircraft,
    entries,
    maintenance,
    verification: { ...verification, currentHash: hash },
  });

  const {
    trustScore, riskLevel, riskFlags, provenance,
    complianceCalendar, maintenanceChronology, integrityVerification, logbookSnapshot
  } = report;

  const generatedFormatted = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

  function scoreColor(score) {
    if (score >= 80) return "#22c55e";
    if (score >= 50) return "#f59e0b";
    return "#ef4444";
  }

  function riskBadgeStyle(severity) {
    if (severity === "critical") return "background:#7f1d1d;color:#fca5a5;";
    if (severity === "high")     return "background:#7c2d12;color:#fdba74;";
    if (severity === "medium")   return "background:#78350f;color:#fde68a;";
    return "background:#1e3a5f;color:#93c5fd;";
  }

  function compColor(c) {
    if (c === "red")    return "#ef4444";
    if (c === "yellow") return "#f59e0b";
    if (c === "green")  return "#22c55e";
    return "#6b7280";
  }

  const riskFlagRows = riskFlags.length > 0
    ? riskFlags.map(f => `<tr>
        <td><span style="padding:2px 8px;border-radius:4px;font-size:12px;${riskBadgeStyle(f.severity)}">${f.severity.toUpperCase()}</span></td>
        <td style="font-family:monospace;font-size:12px;color:#94a3b8;">${f.code}</td>
        <td>${f.detail}</td>
      </tr>`).join("\n")
    : `<tr><td colspan="3" style="color:#22c55e;text-align:center;">No risk flags — records look clean.</td></tr>`;

  const compRows = complianceCalendar.map(c => `<tr>
    <td>${c.label}</td>
    <td>${c.dueDate || "—"}</td>
    <td>${c.daysUntilDue !== null ? c.daysUntilDue + " days" : "—"}</td>
    <td><span style="color:${compColor(c.color)};font-weight:600;">${c.status.replace(/_/g," ").toUpperCase()}</span></td>
  </tr>`).join("\n");

  const chronoRows = maintenanceChronology.map(m => {
    const gapBadge = m.gapDaysFromPrevious !== null
      ? `<span style="color:${m.gapDaysFromPrevious > 365 ? "#ef4444" : "#94a3b8"};font-size:11px;">(+${m.gapDaysFromPrevious}d gap)</span>`
      : "";
    const cat = (m.category || "").replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase());
    const rts = m.returnToService
      ? `<span style="color:#22c55e;">✓ RTS</span>`
      : `<span style="color:#ef4444;">✗ No RTS</span>`;
    return `<tr>
      <td>${m.date} ${gapBadge}</td>
      <td><span class="badge">${cat}</span></td>
      <td>${m.description || "—"}</td>
      <td>${m.mechanic || m.performedBy || "—"}</td>
      <td>${m.totalAirframeHours != null ? Number(m.totalAirframeHours).toFixed(1) + " hrs" : "—"}</td>
      <td>${rts}</td>
    </tr>`;
  }).join("\n");

  const hashLine = integrityVerification.anchored
    ? (integrityVerification.hashMatch
        ? `<span style="color:#22c55e;">✓ Hash verified — records unchanged since anchoring</span>`
        : `<span style="color:#ef4444;">✗ Hash mismatch — records may have changed since anchoring</span>`)
    : `<span style="color:#f59e0b;">⚠ Records not anchored — integrity cannot be independently verified</span>`;

  const provenanceRows = provenance ? `
    <tr><td>Registration</td><td>${provenance.ident || "—"}</td></tr>
    <tr><td>Type</td><td>${provenance.type || "—"}</td></tr>
    <tr><td>Serial Number</td><td>${provenance.serialNumber || "—"}</td></tr>
    <tr><td>Manufacture Year</td><td>${provenance.manufactureYear || "—"}</td></tr>
    <tr><td>Total Time in Service</td><td>${provenance.totalTimeInService != null ? Number(provenance.totalTimeInService).toFixed(1) + " hrs" : "—"}</td></tr>
    <tr><td>Registration Date</td><td>${provenance.registrationDate ? String(provenance.registrationDate).slice(0,10) : "—"}</td></tr>
    <tr><td>Engine Type</td><td>${provenance.engineType || "—"}</td></tr>
    <tr><td>Engine Serial</td><td>${provenance.engineSerial || "—"}</td></tr>
    <tr><td>Propeller Type</td><td>${provenance.propType || "—"}</td></tr>
    <tr><td>Propeller Serial</td><td>${provenance.propSerial || "—"}</td></tr>
  ` : `<tr><td colspan="2">No aircraft data</td></tr>`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>AirLog Trust Report — ${provenance?.ident || "Aircraft"}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{background:#0f1117;color:#e2e8f0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;padding:32px 24px;line-height:1.6}
  .container{max-width:900px;margin:0 auto}
  h1{font-size:28px;font-weight:700;margin-bottom:4px}
  h2{font-size:18px;font-weight:600;color:#94a3b8;margin:32px 0 12px;text-transform:uppercase;letter-spacing:.08em}
  .subtitle{color:#64748b;font-size:14px;margin-bottom:32px}
  .score-ring{display:inline-flex;flex-direction:column;align-items:center;justify-content:center;width:120px;height:120px;border-radius:50%;border:6px solid ${scoreColor(trustScore)};margin-bottom:8px}
  .score-num{font-size:40px;font-weight:800;color:${scoreColor(trustScore)}}
  .score-label{font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:.1em}
  .risk-banner{padding:12px 18px;border-radius:8px;margin-bottom:32px;font-weight:600;font-size:15px;background:${riskLevel === "high" ? "#7f1d1d" : riskLevel === "medium" ? "#78350f" : "#14532d"};color:${riskLevel === "high" ? "#fca5a5" : riskLevel === "medium" ? "#fde68a" : "#86efac"}}
  .header-row{display:flex;align-items:center;gap:32px;margin-bottom:24px}
  table{width:100%;border-collapse:collapse;font-size:14px;margin-bottom:16px}
  th{text-align:left;padding:8px 12px;background:#1e293b;color:#94a3b8;font-size:12px;text-transform:uppercase;letter-spacing:.06em;border-bottom:1px solid #334155}
  td{padding:8px 12px;border-bottom:1px solid #1e293b;vertical-align:top}
  tr:last-child td{border-bottom:none}
  .badge{background:#1e3a5f;color:#93c5fd;padding:2px 8px;border-radius:4px;font-size:12px;white-space:nowrap}
  .section{background:#141920;border:1px solid #1e293b;border-radius:10px;padding:20px;margin-bottom:24px}
  .integrity-box{background:#0d1520;border:1px solid #334155;border-radius:8px;padding:14px 18px;font-size:13px;color:#94a3b8;margin-top:8px}
  .integrity-box code{font-family:monospace;font-size:11px;word-break:break-all;color:#64748b;display:block;margin-top:4px}
  .footer{margin-top:40px;text-align:center;font-size:12px;color:#475569}
</style>
</head>
<body>
<div class="container">
  <div class="header-row">
    <div>
      <div class="score-ring"><span class="score-num">${trustScore}</span><span class="score-label">Trust Score</span></div>
    </div>
    <div>
      <h1>AirLog Trust Report</h1>
      <div class="subtitle">Aircraft: ${provenance?.ident || "—"} &nbsp;·&nbsp; Generated ${generatedFormatted}</div>
      <div class="risk-banner">Overall Risk: ${riskLevel.toUpperCase()} &nbsp;·&nbsp; ${riskFlags.length} flag${riskFlags.length !== 1 ? "s" : ""} found</div>
    </div>
  </div>

  <div class="section">
    <h2>Aircraft Provenance</h2>
    <table><tbody>${provenanceRows}</tbody></table>
  </div>

  <div class="section">
    <h2>Integrity Verification</h2>
    <div class="integrity-box">
      ${hashLine}
      <code>Anchor Hash: ${integrityVerification.anchorHash || "—"}<br>Current Hash: ${integrityVerification.currentHash || "—"}<br>Network: ${integrityVerification.anchorNetwork || "—"} &nbsp;·&nbsp; Anchored: ${integrityVerification.anchorTime ? String(integrityVerification.anchorTime).slice(0,10) : "—"}</code>
    </div>
  </div>

  <div class="section">
    <h2>Risk Indicators</h2>
    <table>
      <thead><tr><th>Severity</th><th>Code</th><th>Detail</th></tr></thead>
      <tbody>${riskFlagRows}</tbody>
    </table>
  </div>

  <div class="section">
    <h2>Compliance Calendar</h2>
    <table>
      <thead><tr><th>Item</th><th>Due Date</th><th>Days Until Due</th><th>Status</th></tr></thead>
      <tbody>${compRows}</tbody>
    </table>
  </div>

  <div class="section">
    <h2>Maintenance Chronology</h2>
    <table>
      <thead><tr><th>Date</th><th>Category</th><th>Description</th><th>Mechanic / Shop</th><th>Airframe Hrs</th><th>RTS</th></tr></thead>
      <tbody>${chronoRows || `<tr><td colspan="6" style="color:#64748b;text-align:center;">No maintenance records.</td></tr>`}</tbody>
    </table>
  </div>

  <div class="section">
    <h2>Logbook Snapshot</h2>
    <table><tbody>
      <tr><td>Total Flight Entries</td><td>${logbookSnapshot.totalEntries}</td></tr>
      <tr><td>Total Flight Hours</td><td>${Number(logbookSnapshot.totalHours).toFixed(1)}</td></tr>
    </tbody></table>
  </div>

  <div class="footer">Generated by AirLog &nbsp;·&nbsp; ${new Date().toISOString()}</div>
</div>
</body>
</html>`;

  res.setHeader("Content-Type", "text/html");
  res.send(html);

});

// ─── Aircraft Record Report (unified product) ────────────────────────────────
app.get("/report", (_req, res) => {
  const entries = readEntries();
  const profile = readProfile();
  const aircraft = readAircraft();
  const verification = readVerification();
  const maintenance = readMaintenance();

  // Use canonical hash (same algorithm as the contract) so anchor comparison is consistent
  const hash = aircraft[0]
    ? buildIntegrityResult({ aircraft: aircraft[0], entries }).anchorHash
    : hashLogbook(entries, profile, aircraft);

  // Auto-anchor: trigger in background if records changed since last anchor.
  // The report renders immediately with stored verification; anchor result persists for next load.
  let liveVerification = verification;
  const existingAnchorHash = verification?.anchorHash || null;
  if (aircraft[0] && (!existingAnchorHash || existingAnchorHash !== hash)) {
    // Update stored hash immediately so UI shows "Pending verification…"
    const pendingVerification = {
      ...(verification || {}),
      anchorHash: hash,
      airframeId: buildIntegrityResult({ aircraft: aircraft[0], entries }).airframeId,
      aircraftIdent: aircraft[0]?.ident || null,
      entries: entries.length,
      anchored: false,
      anchorTime: null,
      anchorTx: null,
      anchorNetwork: "midnight-local",
      runtimeAvailable: false,
      contract: "pending",
    };
    try { fs.writeFileSync(VERIFICATION_PATH, JSON.stringify(pendingVerification, null, 2)); } catch {}
    liveVerification = pendingVerification;

    // Fire real anchor in background — result persists to disk when done
    const totalHours = entries.reduce((s, e) => s + Number(e.total || 0), 0);
    const bgAirframeId = pendingVerification.airframeId;
    const bgHash = hash;
    anchorOnMidnight({ anchorHash: bgHash, airframeId: bgAirframeId, hours: totalHours })
      .then((anchorResult) => {
        const updated = {
          ...pendingVerification,
          anchored: anchorResult.anchored === true,
          anchorTime: anchorResult.anchoredAt || null,
          anchorTx: anchorResult.anchorId || null,
          anchorNetwork: anchorResult.network || "midnight-local",
          runtimeAvailable: anchorResult.anchored === true,
          contract: anchorResult.anchored
            ? { contractAddress: anchorResult.contractAddress, anchorId: anchorResult.anchorId }
            : anchorResult.pending ? "pending" : "unavailable",
        };
        try { fs.writeFileSync(VERIFICATION_PATH, JSON.stringify(updated, null, 2)); } catch {}
      })
      .catch(() => {});
  }

  const totals = computeTotals(entries);
  const generatedFormatted = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  const primaryAircraft = aircraft[0] || {};
  const anchored = liveVerification?.anchored || false;
  const anchorHash = liveVerification?.anchorHash || null;
  const hashMatch = anchorHash && anchorHash === hash;
  const gaps = computeGaps(aircraft, maintenance);
  const adEntries = maintenance.filter((m) => m.category === "ad-compliance" || (m.adCompliance && m.adCompliance.length > 0));

  function fmt(val) { return val ? String(val).slice(0, 10) : "—"; }
  function fmtNum(val) { return Number(val || 0).toFixed(1); }

  const today = new Date(); today.setHours(0,0,0,0);
  function daysUntil(dateStr) {
    if (!dateStr) return null;
    const d = new Date(String(dateStr).slice(0, 10));
    if (isNaN(d)) return null;
    return Math.round((d - today) / 86400000);
  }
  function complianceBadge(days) {
    if (days === null) return ["badge-gray", "Unknown"];
    if (days < 0) return ["badge-red", "Overdue"];
    if (days <= 30) return ["badge-red", "Due Soon"];
    if (days <= 90) return ["badge-yellow", "Upcoming"];
    return ["badge-green", "Current"];
  }

  // Compliance checks (airworthiness)
  const complianceChecks = [];
  function addCheck(label, dueDate, note) {
    const days = daysUntil(dueDate);
    const [cls, status] = complianceBadge(days);
    const detail = dueDate ? `Due ${fmt(dueDate)}${days !== null ? (days < 0 ? ` — ${Math.abs(days)} days overdue` : ` — ${days} days`) : ""}` : "No date on file";
    complianceChecks.push({ label, cls, status, detail, note: note || null });
  }
  addCheck("Annual Inspection", primaryAircraft.annualDue);
  addCheck("Transponder / ADS-B Check", primaryAircraft.transponderDue);
  addCheck("Pitot-Static Check", primaryAircraft.pitotStaticDue);
  addCheck("ELT Battery", primaryAircraft.eltBatteryDue);

  const overallPass = complianceChecks.every((c) => c.status === "Current");
  const overallFail = complianceChecks.some((c) => c.status === "Overdue");
  const overallUnknown = complianceChecks.some((c) => c.status === "Unknown");
  const verdictClass = overallFail ? "badge-red" : overallUnknown ? "badge-yellow" : "badge-green";
  const verdictLabel = overallFail
    ? "Records show unresolved airworthiness items"
    : overallUnknown
      ? "Records are incomplete for a full airworthiness call"
      : "Records support airworthiness";
  const verdictSubcopy = overallFail
    ? "At least one required inspection or equipment check is overdue in the records on file."
    : overallUnknown
      ? "Some required due dates are missing in the records, so a full determination is not possible yet."
      : "Inspection and equipment due dates on file are currently in date.";

  const complianceRows = complianceChecks.map((c) =>
    `<tr>
      <td>${c.label}</td>
      <td>${c.detail}</td>
      <td><span class="badge ${c.cls}">${c.status}</span></td>
    </tr>`
  ).join("\n");

  // Maintenance timeline
  const sortedMaint = [...maintenance].sort((a, b) => String(b.date).localeCompare(String(a.date)));
  const maintenanceRows = sortedMaint.map((m) => {
    const cat = (m.category || "").replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase());
    return `<tr>
      <td>${fmt(m.date)}</td>
      <td><span class="badge badge-gray">${cat || "—"}</span></td>
      <td>${m.description || "—"}</td>
      <td>${m.mechanic || m.performedBy || "—"}</td>
      <td>${m.totalAirframeHours != null ? fmtNum(m.totalAirframeHours) + " hrs" : "—"}</td>
      <td class="${m.returnToService ? "rts-yes" : "rts-no"}">${m.returnToService ? "✓" : "—"}</td>
    </tr>`;
  }).join("\n");

  // Verification summary (trust basis)
  const tbVerified = [];
  const tbAssumed = [];
  const tbMissing = [];
  if (maintenance.length > 0) tbVerified.push(`${maintenance.length} maintenance record${maintenance.length > 1 ? "s" : ""} on file`);
  if (primaryAircraft.annualDue) tbVerified.push(`Annual inspection on file — due ${fmt(primaryAircraft.annualDue)}`);
  if (entries.length > 0) tbVerified.push(`${entries.length} flight log entr${entries.length > 1 ? "ies" : "y"} recorded`);
  if (adEntries.length > 0) tbVerified.push(`${adEntries.length} AD compliance record${adEntries.length > 1 ? "s" : ""} present`);
  if (primaryAircraft.serialNumber) tbVerified.push("Aircraft serial number on file");
  if (primaryAircraft.engineSerial) tbVerified.push("Engine serial number on file");
  if (hash) tbVerified.push(`Record hash computed (${hash.slice(0,8)}…)`);
  tbAssumed.push("Flight hours are owner-reported and not independently audited");
  tbAssumed.push("Aircraft specifications are seller-provided");
  if (maintenance.length > 0) tbAssumed.push("Maintenance entries reflect logged mechanic records; workmanship itself is not inspected by AirLog");
  if (!anchored) tbAssumed.push("Record hash is generated locally and not yet externally anchored");
  if (!primaryAircraft.annualDue) tbMissing.push("Annual inspection date not recorded");
  if (adEntries.length === 0) tbMissing.push("No AD compliance records — compliance status cannot be confirmed");
  if (!primaryAircraft.engineSerial) tbMissing.push("Engine serial number not recorded");
  if (!primaryAircraft.serialNumber) tbMissing.push("Aircraft serial number not recorded");
  for (const g of gaps) { if (g.severity === "high" && g.description) tbMissing.push(g.description); }

  function listItems(arr, cls) {
    if (!arr.length) return `<li style="color:#6b7280;">None</li>`;
    return arr.map((s) => `<li class="${cls}">${s}</li>`).join("\n");
  }

  // Missing items / gaps
  const gapRows = gaps.length === 0
    ? `<p style="color:#22c55e;font-weight:600;padding:12px 20px;">No record gaps detected.</p>`
    : gaps.map((g) => {
        const color = g.severity === "high" ? "#ef4444" : g.severity === "medium" ? "#f59e0b" : "#6b7280";
        return `<tr>
          <td style="color:${color};font-weight:700;text-transform:uppercase;font-size:11px;">${g.severity || "low"}</td>
          <td>${g.description || "—"}</td>
        </tr>`;
      }).join("\n");

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Aircraft History & Pre-Buy Summary — ${primaryAircraft.ident || "Aircraft"}</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: "Helvetica Neue", Helvetica, Arial, sans-serif; font-size: 13px; color: #1a1a2e; background: #f5f7fa; line-height: 1.5; }
    @media print { body { background: #fff; font-size: 11px; } .no-print { display: none !important; } section { break-inside: avoid; } }
    .container { max-width: 960px; margin: 0 auto; padding: 24px 20px 48px; }
    .header { background: linear-gradient(135deg, #0d1b4b 0%, #1a3a8f 100%); color: #fff; padding: 32px 36px; border-radius: 8px; margin-bottom: 28px; display: flex; justify-content: space-between; align-items: flex-start; }
    .header-brand { font-size: 22px; font-weight: 700; letter-spacing: 0.04em; }
    .header-brand span { color: #7aa7ff; }
    .header-sub { font-size: 12px; color: #b0c4ff; margin-top: 4px; }
    .header-ident { text-align: right; }
    .header-ident .ident { font-size: 36px; font-weight: 800; letter-spacing: 0.06em; }
    .header-ident .type { font-size: 14px; color: #b0c4ff; margin-top: 2px; }
    .header-ident .gendate { font-size: 11px; color: #8099cc; margin-top: 6px; }
    section { background: #fff; border-radius: 8px; border: 1px solid #e2e8f0; margin-bottom: 20px; overflow: hidden; }
    .section-title { background: #f8fafc; border-bottom: 1px solid #e2e8f0; padding: 12px 20px; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: #4a5568; }
    .section-body { padding: 16px 20px; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; }
    th { background: #f8fafc; color: #4a5568; font-weight: 600; text-align: left; padding: 8px 10px; border-bottom: 1px solid #e2e8f0; font-size: 11px; text-transform: uppercase; letter-spacing: 0.04em; }
    td { padding: 8px 10px; border-bottom: 1px solid #f1f5f9; vertical-align: top; }
    tr:last-child td { border-bottom: none; }
    .badge { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 700; text-transform: uppercase; }
    .badge-green { background: #dcfce7; color: #166534; }
    .badge-red { background: #fee2e2; color: #991b1b; }
    .badge-yellow { background: #fef9c3; color: #854d0e; }
    .badge-gray { background: #f1f5f9; color: #475569; }
    .verdict { display: flex; align-items: center; gap: 12px; padding: 16px 20px; }
    .verdict-label { font-size: 20px; font-weight: 800; line-height: 1.3; }
    .verdict-sub { font-size: 13px; color: #6b7280; }
    .buyer-impact { margin: 0 20px 14px; border: 1px solid #e2e8f0; border-radius: 8px; background: #f8fafc; padding: 12px 14px; }
    .buyer-impact-title { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: #475569; margin-bottom: 6px; }
    .buyer-impact ul { margin: 0; padding-left: 18px; color: #334155; font-size: 12px; }
    .buyer-impact li { margin: 3px 0; }
    .rts-yes { color: #22c55e; font-weight: 700; }
    .rts-no { color: #94a3b8; }
    .two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; padding: 16px 20px; }
    .kv td:first-child { color: #6b7280; width: 52%; font-size: 12px; }
    .kv td:last-child { font-weight: 600; font-size: 12px; }
    ul.trust-list { list-style: none; padding: 0; margin: 0; }
    ul.trust-list li { padding: 4px 0; font-size: 12px; }
    li.ok::before { content: "✓ "; color: #22c55e; font-weight: 700; }
    li.assumed::before { content: "~ "; color: #f59e0b; font-weight: 700; }
    li.missing::before { content: "✗ "; color: #ef4444; font-weight: 700; }
    .tamper-seal { background: #0f1117; color: #e2e8f0; border-radius: 8px; padding: 20px; font-family: monospace; font-size: 12px; line-height: 1.8; }
    .tamper-seal .label { color: #64748b; font-size: 10px; text-transform: uppercase; letter-spacing: 0.08em; }
    .tamper-seal .value { color: #7aa7ff; word-break: break-all; }
    .disclaimer { font-size: 10px; color: #94a3b8; padding: 10px 20px; border-top: 1px dashed #e2e8f0; background: #fcfdff; }
    .back-link { display: inline-block; margin-bottom: 16px; font-size: 13px; color: #1a3a8f; text-decoration: none; }
    .back-link:hover { text-decoration: underline; }
    .print-btn { display: inline-block; padding: 8px 18px; background: #1a3a8f; color: #fff; border-radius: 8px; font-size: 13px; font-weight: 700; text-decoration: none; cursor: pointer; border: none; }
    .print-btn:hover { background: #0d1b4b; }
  </style>
</head>
<body>
<div class="container">

  <div class="no-print" style="margin-bottom:12px;display:flex;justify-content:space-between;align-items:center;">
    <a href="/" class="back-link">← Dashboard</a>
    <button class="print-btn" onclick="window.print()">Print / Save PDF</button>
  </div>

  <div class="header">
    <div>
      <div class="header-brand">Air<span>Log</span></div>
      <div class="header-sub">Aircraft History &amp; Pre-Buy Summary</div>
    </div>
    <div class="header-ident">
      <div class="ident">${primaryAircraft.ident || "—"}</div>
      <div class="type">${primaryAircraft.type || "—"}</div>
      <div class="gendate">Generated ${generatedFormatted}</div>
    </div>
  </div>

  <!-- 1. Compliance Status -->
  <section>
    <div class="section-title">Compliance Status</div>
    <div class="verdict">
      <div class="verdict-label"><span class="badge ${verdictClass}" style="font-size:14px;padding:6px 12px;text-transform:none;">${verdictLabel}</span></div>
      <div class="verdict-sub">${verdictSubcopy}<br><em>Record-based screening only; confirm condition with a qualified A&amp;P pre-buy inspection.</em></div>
    </div>
    <div class="buyer-impact">
      <div class="buyer-impact-title">Buyer Impact</div>
      <ul>
        <li><strong>Pre-buy process:</strong> ${overallFail ? "Expect additional inspection findings and corrective actions before close." : overallUnknown ? "Expect a smoother process once missing dates and records are provided." : "Records suggest a smoother pre-buy process with fewer compliance surprises."}</li>
        <li><strong>Documentation risk:</strong> ${tbMissing.length > 0 ? "Some required records are missing; unresolved documentation may delay underwriting or escrow." : "No major documentation gaps are flagged in this report."}</li>
        <li><strong>Resale position:</strong> ${overallFail || tbMissing.length > 0 ? "Open record issues can reduce buyer confidence and negotiating leverage." : "Complete and current records generally support stronger resale confidence."}</li>
      </ul>
    </div>
    <table>
      <thead><tr><th>Item</th><th>Due Date</th><th>Status</th></tr></thead>
      <tbody>${complianceRows}</tbody>
    </table>
  </section>

  <!-- 2. Aircraft Summary -->
  <section>
    <div class="section-title">Aircraft Summary</div>
    <div class="two-col">
      <table class="kv">
        <tbody>
          <tr><td>Registration</td><td>${primaryAircraft.ident || "—"}</td></tr>
          <tr><td>Make / Model</td><td>${[primaryAircraft.make, primaryAircraft.model].filter(Boolean).join(" ") || primaryAircraft.type || "—"}</td></tr>
          <tr><td>Year</td><td>${primaryAircraft.manufactureYear || primaryAircraft.year || "—"}</td></tr>
          <tr><td>Serial Number</td><td>${primaryAircraft.serialNumber || "—"}</td></tr>
          <tr><td>Total Time in Service</td><td>${primaryAircraft.totalTimeInService != null ? fmtNum(primaryAircraft.totalTimeInService) + " hrs" : "—"}</td></tr>
        </tbody>
      </table>
      <table class="kv">
        <tbody>
          <tr><td>Engine Type</td><td>${primaryAircraft.engineType || "—"}</td></tr>
          <tr><td>Engine Serial</td><td>${primaryAircraft.engineSerial || "—"}</td></tr>
          <tr><td>Engine SMOH</td><td>${primaryAircraft.engineTimeSMOH != null ? fmtNum(primaryAircraft.engineTimeSMOH) + " hrs" : "—"}</td></tr>
          <tr><td>Propeller Type</td><td>${primaryAircraft.propType || "—"}</td></tr>
          <tr><td>Propeller Serial</td><td>${primaryAircraft.propSerial || "—"}</td></tr>
        </tbody>
      </table>
    </div>
    <div style="padding:0 20px 16px;">
      <table class="kv" style="max-width:480px;">
        <tbody>
          <tr><td>Flight Log Entries</td><td>${entries.length}</td></tr>
          <tr><td>Total Flight Hours</td><td>${fmtNum(totals.total)} hrs</td></tr>
          <tr><td>PIC Hours</td><td>${fmtNum(totals.pic)} hrs</td></tr>
          <tr><td>Pilot on File</td><td>${profile?.pilot?.fullName || "—"}</td></tr>
        </tbody>
      </table>
    </div>
  </section>

  <!-- 3. Maintenance Timeline -->
  <section>
    <div class="section-title">Maintenance Timeline</div>
    ${maintenance.length === 0
      ? `<p style="padding:16px 20px;color:#6b7280;">No maintenance records on file.</p>`
      : `<table>
          <thead><tr><th>Date</th><th>Category</th><th>Description</th><th>Mechanic</th><th>Airframe Hrs</th><th>RTS</th></tr></thead>
          <tbody>${maintenanceRows}</tbody>
        </table>`}
  </section>

  <!-- 4. Verification Summary -->
  <section>
    <div class="section-title">Verification Summary</div>
    <div class="two-col">
      <div>
        <div style="font-size:11px;font-weight:700;text-transform:uppercase;color:#4a5568;margin-bottom:8px;">Verified</div>
        <ul class="trust-list">${listItems(tbVerified, "ok")}</ul>
      </div>
      <div>
        <div style="font-size:11px;font-weight:700;text-transform:uppercase;color:#4a5568;margin-bottom:8px;">Reported, Not Independently Verified</div>
        <ul class="trust-list">${listItems(tbAssumed, "assumed")}</ul>
      </div>
    </div>
  </section>

  <!-- 5. Missing Items -->
  <section>
    <div class="section-title">Missing Items &amp; Gaps</div>
    ${gaps.length === 0
      ? gapRows
      : `<table>
          <thead><tr><th>Severity</th><th>Description</th></tr></thead>
          <tbody>${gapRows}</tbody>
        </table>`}
    ${tbMissing.length > 0
      ? `<div style="padding:12px 20px;border-top:1px solid #f1f5f9;">
          <div style="font-size:11px;font-weight:700;text-transform:uppercase;color:#4a5568;margin-bottom:8px;">Not Recorded</div>
          <ul class="trust-list">${listItems(tbMissing, "missing")}</ul>
        </div>`
      : ""}
  </section>

  <!-- 6. Tamper Seal -->
  <section>
    <div class="section-title">Tamper Seal</div>
    <div style="padding:16px 20px;">
      <div class="tamper-seal">
        <div style="margin-bottom:10px;">
          <span class="label">Verification Status</span><br>
          <span class="value" style="font-size:14px;color:${anchored && hashMatch ? "#22c55e" : anchored && !hashMatch ? "#ef4444" : "#94a3b8"};">
            ${anchored && hashMatch ? "Anchored on Midnight ✓" : anchored && !hashMatch ? "Verification failed — records changed since anchor" : "Pending verification…"}
          </span>
        </div>
        <div style="margin-top:14px;display:flex;gap:10px;flex-wrap:wrap;align-items:center;">
          <a href="/verify/hash/${hash}" style="display:inline-block;padding:8px 16px;background:#1e3a5f;color:#93c5fd;border-radius:6px;font-size:12px;font-weight:600;text-decoration:none;">Verify Report</a>
          ${anchored && liveVerification?.anchorTx ? `<a href="/verify/${liveVerification.anchorTx}" target="_blank" style="display:inline-block;padding:8px 16px;background:#312e81;color:#a5b4fc;border-radius:6px;font-size:12px;font-weight:600;text-decoration:none;">Verify on Blockchain ↗</a>` : ""}
        </div>
        <p style="margin-top:8px;font-size:11px;color:#64748b;">Verify internally or confirm independently on the Midnight network.</p>
        <details style="margin-top:12px;">
          <summary style="cursor:pointer;font-size:11px;color:#64748b;letter-spacing:0.05em;text-transform:uppercase;user-select:none;">View verification details</summary>
          <div style="margin-top:10px;">
            <div><span class="label">Report Hash</span></div>
            <div><span class="value">${hash || "—"}</span></div>
            ${anchored && liveVerification?.anchorTx ? `<div style="margin-top:8px;"><span class="label">Anchor ID</span></div>
            <div><span class="value">${liveVerification.anchorTx}</span></div>` : ""}
            ${anchored && liveVerification?.anchorTime ? `<div style="margin-top:8px;"><span class="label">Anchored At</span></div>
            <div><span class="value">${String(liveVerification.anchorTime).slice(0, 19).replace("T", " ")} UTC</span></div>` : ""}
            ${hashMatch ? `<div style="margin-top:8px;"><span class="label">Integrity</span></div>
            <div><span class="value" style="color:#22c55e;">✓ Records match anchored hash</span></div>` : anchorHash ? `<div style="margin-top:8px;"><span class="label">Integrity</span></div>
            <div><span class="value" style="color:#ef4444;">Records have changed since last anchor</span></div>` : ""}
          </div>
        </details>
      </div>
      <p style="margin-top:12px;font-size:11px;color:#9ca3af;">
        This report is independently verified. Any change to the underlying records produces a different fingerprint.
      </p>
    </div>
    <p class="disclaimer">This report was generated by AirLog and reflects data entered by the aircraft owner or operator. AirLog does not independently verify the accuracy of maintenance records, flight hours, or compliance dates. This report is not a substitute for a pre-purchase inspection by a qualified A&amp;P mechanic or IA.</p>
  </section>

</div>
</body>
</html>`;

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(html);
});

// ─── Readiness API ────────────────────────────────────────────────────────────
// Logic lives in src/lib/readiness.mjs — computeReadiness() is the entry point.

app.get("/assistant/readiness", (req, res) => {
  const asOf = String(req.query.asOf || new Date().toISOString());
  const result = computeReadiness(
    readProfile(),
    readEntries(),
    readAircraft(),
    readMaintenance(),
    asOf
  );
  res.json(result);
});

app.patch("/profile/phase", (req, res) => {
  const { pilotPhase } = req.body || {};
  if (!pilotPhase || !PILOT_PHASES[pilotPhase]) {
    return res.status(400).json({ error: "Invalid pilotPhase. Valid values: " + Object.keys(PILOT_PHASES).join(", ") });
  }
  const profile = readProfile();
  profile.pilotPhase = pilotPhase;
  saveProfile(profile);
  res.json({ ok: true, pilotPhase, label: PILOT_PHASES[pilotPhase].label });
});

// ── Wallet State (server-side session) ───────────────────────────────────────

// POST /wallet/connect — browser posts connected wallet address here
app.post("/wallet/connect", (req, res) => {
  const { address, coinPublicKey, shieldedAddress } = req.body || {};
  console.log("[wallet/connect] raw body:", JSON.stringify({ address, coinPublicKey, shieldedAddress }));
  if (!address) return res.status(400).json({ error: "address required" });
  const session = { address, coinPublicKey: coinPublicKey || null, shieldedAddress: shieldedAddress || null, connectedAt: new Date().toISOString() };
  console.log("[wallet/connect] stored session.address:", session.address);
  console.log("[wallet/connect] stored session.shieldedAddress:", session.shieldedAddress);
  console.log("[wallet/connect] stored session.coinPublicKey:", session.coinPublicKey);
  saveWalletSession(session);
  res.json({ ok: true, session });
});

// POST /wallet/disconnect — clear wallet session
app.post("/wallet/disconnect", (_req, res) => {
  if (fs.existsSync(WALLET_PATH)) fs.unlinkSync(WALLET_PATH);
  res.json({ ok: true });
});

// GET /wallet/status — current wallet session
app.get("/wallet/status", (_req, res) => {
  const session = readWalletSession();
  res.json({ connected: !!session, session: session || null });
});


// ─── Pilot Report (JSON) ──────────────────────────────────────────────────────
app.get("/pilot-report/json", (_req, res) => {
  const entries = readEntries();
  const profile = readProfile();
  const aircraft = readAircraft();
  const maintenance = readMaintenance();
  const verification = readVerification();
  const report = buildPilotReport({ profile, entries, aircraft, maintenance, verification });
  res.json(report);
});

// ─── Pilot Report (HTML) ──────────────────────────────────────────────────────
app.get("/pilot-report", (_req, res) => {
  const entries = readEntries();
  const profile = readProfile();
  const allAttestationsPR = readAttestations();
  const aircraft = readAircraft();
  const maintenance = readMaintenance();
  const verification = readVerification();
  const walletSessionPR = readWalletSession();
  const identityPR = readIdentity() || {};
  const report = buildPilotReport({ profile, entries, aircraft, maintenance, verification });

  const r = report;
  const id = r.pilotIdentity;
  const cert = r.certificateSnapshot;
  const currency = r.currencySummary;
  const activity = r.flightActivity;
  const integrity = r.integrityStatus;
  const generatedFormatted = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

  function badge(color, label) {
    const map = { green: "badge-green", red: "badge-red", yellow: "badge-yellow", gray: "badge-gray" };
    return `<span class="badge ${map[color] || "badge-gray"}">${label}</span>`;
  }

  function row(label, value, extra) {
    return `<tr><td>${label}</td><td>${value || "—"}${extra ? ` <span style="color:#6b7280;font-size:11px;">${extra}</span>` : ""}</td></tr>`;
  }

  // Certificate / ratings block
  const certListHtml = id.certificates.length
    ? id.certificates.map(c => `<li>${c}</li>`).join("")
    : "<li style='color:#6b7280;'>None on file</li>";

  // Medical block
  const med = cert.medical;
  const medBadge = badge(med.status.color, med.status.label);
  const medRows = [
    row("Type", med.kind),
    row("Class", med.class),
    row("Issued", med.issued),
    row("Expires", med.expires, med.daysLeft !== null ? `(${med.daysLeft > 0 ? med.daysLeft + " days left" : Math.abs(med.daysLeft) + " days ago"})` : ""),
    row("Status", medBadge),
  ].join("");

  // Flight review
  const fr = cert.flightReview;
  const frBadge = badge(fr.status.color, fr.status.label);
  const frRows = [
    row("Last Review", fr.lastDate),
    row("Expires", fr.expiryDate, fr.daysLeft !== null ? `(${fr.daysLeft > 0 ? fr.daysLeft + " days left" : Math.abs(fr.daysLeft) + " days ago"})` : ""),
    row("Status", frBadge),
  ].join("");

  // Currency rows
  const currencies = [
    currency.passengerDay,
    currency.passengerNight,
    currency.ifr,
  ];
  const currencyRows = currencies.map(c => {
    const detail = c.approaches !== undefined
      ? `${c.approaches} approaches, ${c.holds} holds (${c.window})`
      : `${c.count}/${c.required} landings (${c.window})`;
    return `<tr><td>${c.label}</td><td>${detail}</td><td>${badge(c.status.color, c.status.label)}</td></tr>`;
  }).join("");

  // Activity rows
  const activityRows = [
    row("Total Entries", activity.totalEntries),
    row("Total Hours", activity.totalHours + " hrs"),
    row("PIC Hours", activity.picHours + " hrs"),
    row("Dual Received", activity.dualReceivedHours + " hrs"),
    row("Cross-Country", activity.crossCountryHours + " hrs"),
    row("Night", activity.nightHours + " hrs"),
    row("IFR (sim + actual)", activity.ifrHours + " hrs"),
    row("Last 90 Days", activity.last90Hours + " hrs"),
  ].join("");

  // Recent flights
  const recentRows = activity.recentFlights.length
    ? activity.recentFlights.map(f => {
        const anchor = f.anchor || null;
        let chainCell = '<span style="color:#718096;">—</span>';
        if (anchor?.status === "anchored") {
          const net = anchor.network || "preprod";
          const netLabel = net === "preview" ? "Preview" : net === "preprod" ? "PreProd" : net;
          const anchorTxId = anchor.tx || anchor.txHash || null;
          const explorerLink = anchorTxId
            ? ` <a href="https://explorer.1am.xyz/tx/${anchorTxId}?network=${net}" target="_blank" rel="noopener" style="color:#7c3aed;font-size:10px;text-decoration:none;">View →</a>`
            : "";
          chainCell = `<span style="color:#22c55e;font-size:11px;font-weight:600;">&#x2713; Saved to chain (${netLabel})</span>${explorerLink}`;
        }
        return `<tr><td>${f.date || "—"}</td><td>${f.route || "—"}</td><td>${f.aircraft || "—"}</td><td>${f.hours} hrs</td><td>${f.remarks || "—"}</td><td>${chainCell}</td></tr>`;
      }).join("")
    : `<tr><td colspan="6" style="color:#6b7280;">No flights logged yet.</td></tr>`;

  // Integrity
  const intBadge = badge(integrity.status.color, integrity.status.label);

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Pilot Report — ${id.name || "Pilot"}</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: "Helvetica Neue", Helvetica, Arial, sans-serif; font-size: 13px; color: #1a1a2e; background: #f5f7fa; line-height: 1.5; }
    @media print { body { background: #fff; font-size: 11px; } .no-print { display: none !important; } section { break-inside: avoid; } }
    .container { max-width: 960px; margin: 0 auto; padding: 24px 20px 48px; }
    .header { background: linear-gradient(135deg, #0d1b4b 0%, #1a3a8f 100%); color: #fff; padding: 32px 36px; border-radius: 8px; margin-bottom: 28px; display: flex; justify-content: space-between; align-items: flex-start; }
    .header-brand { font-size: 22px; font-weight: 700; letter-spacing: 0.04em; }
    .header-brand span { color: #7aa7ff; }
    .header-sub { font-size: 12px; color: #b0c4ff; margin-top: 4px; }
    .header-ident .name { font-size: 28px; font-weight: 800; letter-spacing: 0.02em; text-align: right; }
    .header-ident .gendate { font-size: 11px; color: #8099cc; margin-top: 6px; text-align: right; }
    section { background: #fff; border-radius: 8px; border: 1px solid #e2e8f0; margin-bottom: 20px; overflow: hidden; }
    .section-title { background: #f8fafc; border-bottom: 1px solid #e2e8f0; padding: 12px 20px; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: #4a5568; }
    .section-body { padding: 16px 20px; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; }
    th { background: #f8fafc; color: #4a5568; font-weight: 600; text-align: left; padding: 8px 10px; border-bottom: 1px solid #e2e8f0; font-size: 11px; text-transform: uppercase; letter-spacing: 0.04em; }
    td { padding: 8px 10px; border-bottom: 1px solid #f1f5f9; vertical-align: top; }
    tr:last-child td { border-bottom: none; }
    .badge { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 700; text-transform: uppercase; }
    .badge-green { background: #dcfce7; color: #166534; }
    .badge-red { background: #fee2e2; color: #991b1b; }
    .badge-yellow { background: #fef9c3; color: #854d0e; }
    .badge-gray { background: #f1f5f9; color: #475569; }
    ul.cert-list { list-style: none; padding: 0; margin: 0; }
    ul.cert-list li { padding: 5px 0; border-bottom: 1px solid #f1f5f9; font-size: 13px; }
    ul.cert-list li:last-child { border-bottom: none; }
    .two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
    @media (max-width: 640px) { .two-col { grid-template-columns: 1fr; } .header { flex-direction: column; gap: 12px; } .header-ident .name { text-align: left; } .header-ident .gendate { text-align: left; } }
    .no-print-actions { display: flex; gap: 12px; margin-bottom: 20px; }
    .btn { display: inline-block; padding: 9px 18px; background: #1a3a8f; color: #fff; border: none; border-radius: 6px; font-size: 13px; font-weight: 600; cursor: pointer; text-decoration: none; }
    .btn:hover { background: #1e46b0; }
    .btn-outline { background: transparent; border: 1px solid #cbd5e1; color: #1a3a8f; }
    .btn-outline:hover { background: #f8fafc; }
    .integrity-row { display: flex; gap: 24px; flex-wrap: wrap; }
    .integrity-item { flex: 1; min-width: 180px; }
    .integrity-label { font-size: 11px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.04em; margin-bottom: 4px; }
    .integrity-val { font-size: 13px; font-weight: 600; font-family: monospace; }
  </style>
</head>
<body>
<div class="container">
  <div class="header">
    <div>
      <div class="header-brand">Air<span>Log</span></div>
      <div class="header-sub">Pilot Report</div>
    </div>
    <div class="header-ident">
      <div class="name">${id.name || "Pilot"}</div>
      <div class="gendate">Generated ${generatedFormatted}</div>
    </div>
  </div>

  <div class="no-print no-print-actions">
    <a href="/" class="btn btn-outline">← Dashboard</a>
    <a href="/pilot-report/json" class="btn btn-outline">View JSON</a>
    <button class="btn" onclick="window.print()">Print / PDF</button>
    <span id="wallet-nav-link" style="margin-left:auto;font-size:13px;"></span>
  </div>
  ${walletStatusScript}

  <!-- Pilot Identity -->
  <section>
    <div class="section-title">Pilot Identity</div>
    <div class="section-body">
      <table>
        <tbody>
          ${row("Full Name", id.name)}
          ${row("Email", id.email)}
          ${row("Phone", id.phone)}
          ${row("Pilot Phase", id.pilotPhase)}
          ${identityPR.midnameVerified && identityPR.midname
            ? row("Pilot Identity (Midname)", `<span style="font-weight:700;">${identityPR.midname}</span>`)
            : ""}
          ${identityPR.midnameVerified
            ? row("Verification", `<span style="color:#166534;font-weight:700;">&#10003; Verified on Midnight</span>${identityPR.verifiedAt ? ` <span style="color:#6b7280;font-size:11px;">· ${String(identityPR.verifiedAt).slice(0,10)}</span>` : ""}`)
            : row("Verification", `<span style="color:#6b7280;">Not verified</span>`)}
          ${identityPR.resolvedType === "shielded"
            ? row("Privacy", `<span style="color:#1a3a8f;font-weight:600;">Private · Shielded Identity</span>`)
            : ""}
        </tbody>
      </table>
    </div>
  </section>

  <!-- Certificates & Ratings -->
  <section>
    <div class="section-title">Certificates &amp; Ratings</div>
    <div class="section-body">
      <ul class="cert-list">${certListHtml}</ul>
    </div>
  </section>

  <!-- Medical & Flight Review -->
  <div class="two-col">
    <section>
      <div class="section-title">Medical Certificate</div>
      <div class="section-body">
        <table><tbody>${medRows}</tbody></table>
      </div>
    </section>
    <section>
      <div class="section-title">Flight Review</div>
      <div class="section-body">
        <table><tbody>${frRows}</tbody></table>
      </div>
    </section>
  </div>

  <!-- Currency -->
  <section>
    <div class="section-title">Currency &amp; Readiness</div>
    <div class="section-body">
      <table>
        <thead><tr><th>Item</th><th>Detail</th><th>Status</th></tr></thead>
        <tbody>${currencyRows}</tbody>
      </table>
    </div>
  </section>

  <!-- Flight Activity -->
  <section>
    <div class="section-title">Flight Activity Summary</div>
    <div class="section-body">
      <table><tbody>${activityRows}</tbody></table>
    </div>
  </section>

  <!-- Recent Flights -->
  <section>
    <div class="section-title">Recent Flight History</div>
    <div class="section-body">
      <table>
        <thead><tr><th>Date</th><th>Route</th><th>Aircraft</th><th>Hours</th><th>Remarks</th><th>Chain</th></tr></thead>
        <tbody>${recentRows}</tbody>
      </table>
    </div>
  </section>

  <!-- Integrity -->
  <section>
    <div class="section-title">Verification &amp; Integrity</div>
    <div class="section-body">
      <div class="integrity-row">
        <div class="integrity-item">
          <div class="integrity-label">Status</div>
          <div class="integrity-val">${intBadge}</div>
        </div>
        <div class="integrity-item">
          <div class="integrity-label">Record Hash</div>
          <div class="integrity-val">${integrity.anchorHash || "—"}</div>
        </div>
        <div class="integrity-item">
          <div class="integrity-label">Anchored</div>
          <div class="integrity-val">${integrity.anchorTime || "—"}</div>
        </div>
        <div class="integrity-item">
          <div class="integrity-label">Network</div>
          <div class="integrity-val">${integrity.anchorNetwork || "—"}</div>
        </div>
      </div>
    </div>
  </section>

  <!-- Attestations -->
  <section>
    <div class="section-title">Flight Attestations</div>
    <div class="section-body">
      ${allAttestationsPR.length === 0
        ? `<p style="color:#6b7280;font-size:13px;font-style:italic;margin:0;">No attestations on record. Request verification from your instructor or peers from the dashboard.</p>`
        : allAttestationsPR.map(a => flightAttestationCardHtml(a, { theme: "light" })).join("")
      }
    </div>
  </section>

</div>
</body>
</html>`;

  res.type("html").send(html);
});

// Serve Midnight browser SDK bundle (pre-built, avoids CDN bare-specifier errors)
const midnightSdkDir = path.resolve(process.cwd(), "public/js");
if (fs.existsSync(midnightSdkDir)) {
  app.use("/js", express.static(midnightSdkDir));
  const sdkBundle = path.resolve(midnightSdkDir, "midnight-sdk.js");
  if (fs.existsSync(sdkBundle)) {
    console.log("[sdk] Midnight browser SDK bundle ready:", sdkBundle);
  } else {
    console.warn("[sdk] midnight-sdk.js NOT FOUND — run: npm run build:midnight-sdk");
  }
}

// Serve deployment.json and compiled contract artifacts for browser-side 1AM wallet tx
// Resolve from actual runtime root (fixes PKG_ROOT mismatch)
const deploymentJsonPath = path.resolve(process.cwd(), "deployment.json");
// AIR-203: Always register GET /deployment.json — reads file on demand so the route
// works even if the file is created after server start (e.g. first deploy in session).
// ─── Pilot Identity ───────────────────────────────────────────────────────────

// GET /identity — return current identity JSON
app.get("/identity", (_req, res) => {
  const identity = readIdentity() || {
    walletAddress: null, midname: null, did: null,
    midnameVerified: false, verifiedAt: null,
    identitySource: "wallet", networkId: "preprod"
  };
  res.json(identity);
});

// POST /identity/verify-midname — verify midname against connected wallet and persist
app.post("/identity/verify-midname", async (req, res) => {
  const { midname } = req.body || {};
  if (!midname || typeof midname !== "string" || !midname.trim()) {
    return res.status(400).json({ ok: false, error: "midname required" });
  }
  const cleanMidname = midname.trim().toLowerCase();
  const session = readWalletSession();
  if (!session || !session.address) {
    return res.status(400).json({ ok: false, error: "No wallet connected. Connect wallet first." });
  }

  // Forward-lookup: resolve midname → address + fields via @midnames/sdk
  let resolvedAddress = null;
  let resolvedType = null;
  let resolvedFields = {};
  try {
    const { getDefaultProvider, resolveDomain, getDomainFields } = await import("@midnames/sdk");
    const provider = getDefaultProvider("preprod");
    const result = await resolveDomain(cleanMidname, { provider });
    if (result && result.success) {
      const target = result.value || result.data;
      if (target && target.address) {
        resolvedAddress = target.address;
        resolvedType = target.type || null;
      }
    }
    // Fetch optional profile fields (name, twitter, etc.)
    try {
      const fieldsResult = await getDomainFields(cleanMidname, { provider });
      if (fieldsResult && fieldsResult.success) {
        const map = fieldsResult.value || fieldsResult.data;
        if (map && typeof map.get === "function") {
          for (const key of ["name", "avatar", "bio", "website", "github", "twitter"]) {
            const val = map.get(key);
            if (val) resolvedFields[key] = val;
          }
        }
      }
    } catch (_) {}
  } catch (err) {
    console.warn("[identity] midname resolve failed:", err.message);
  }

  if (!resolvedAddress) {
    return res.status(422).json({ ok: false, error: "Midname could not be resolved. Check spelling and try again." });
  }

  // Debug: log resolved values and session state
  console.log("[identity/verify-midname] resolved type:", resolvedType);
  console.log("[identity/verify-midname] resolved address:", resolvedAddress);
  console.log("[identity/verify-midname] session.address:", session.address);
  console.log("[identity/verify-midname] session.shieldedAddress:", session.shieldedAddress || "(none)");
  console.log("[identity/verify-midname] session.coinPublicKey:", session.coinPublicKey || "(none)");

  // Verify ownership: compare resolved address against connected wallet
  let verified = false;
  if (resolvedType === "shielded") {
    if (!session.coinPublicKey && !session.shieldedAddress) {
      // Wallet session has no shielded identity — wallet did not expose it at connect time
      console.log("[identity/verify-midname] no shielded identity in session — shielded_unverifiable");
      return res.status(422).json({
        ok: false,
        error: "Your wallet did not expose shielded identity when you connected. Disconnect and reconnect your wallet, then try again.",
        verificationStatus: "shielded_unverifiable",
        resolved: resolvedAddress,
        resolvedType,
      });
    }

    // Primary: bech32 decode — extract coinPublicKey bytes from both sides and compare.
    // resolvedAddress is a shield-addr bech32 (cpk + epk encoded together).
    // session.coinPublicKey is mn_shield-cpk_... bech32 (just the cpk).
    // Direct string comparison always fails — we must decode both.
    if (session.coinPublicKey) {
      try {
        const { MidnightBech32m, ShieldedCoinPublicKey, ShieldedAddress } =
          await import("@midnight-ntwrk/wallet-sdk-address-format");

        const parsedResolved = MidnightBech32m.parse(resolvedAddress);
        let resolvedCpk;
        if (parsedResolved.type === "shield-addr") {
          const shieldedAddr = ShieldedAddress.codec.decode("preprod", parsedResolved);
          resolvedCpk = shieldedAddr.coinPublicKey;
        } else {
          resolvedCpk = ShieldedCoinPublicKey.codec.decode("preprod", parsedResolved);
        }

        const parsedWalletCpk = MidnightBech32m.parse(session.coinPublicKey);
        const walletCpk = ShieldedCoinPublicKey.codec.decode("preprod", parsedWalletCpk);

        verified = resolvedCpk.equals(walletCpk);
        console.log("[identity/verify-midname] bech32 cpk comparison:", verified,
          "resolved cpk hex:", resolvedCpk.toHexString?.() || "(no toHexString)",
          "wallet cpk hex:", walletCpk.toHexString?.() || "(no toHexString)");
      } catch (e) {
        console.log("[identity/verify-midname] bech32 decode failed:", e.message, "— falling back to string compare");
        // Fallback: direct string comparison
        const norm = (s) => (s || "").trim().toLowerCase();
        verified = norm(resolvedAddress) === norm(session.coinPublicKey) ||
                   norm(resolvedAddress) === norm(session.shieldedAddress);
        console.log("[identity/verify-midname] string fallback match:", verified);
      }
    } else if (session.shieldedAddress) {
      // Only shieldedAddress available (no coinPublicKey), try direct compare
      verified = resolvedAddress.trim().toLowerCase() === session.shieldedAddress.trim().toLowerCase();
      console.log("[identity/verify-midname] shieldedAddress direct match:", verified);
    }

    if (!verified) {
      console.log("[identity/verify-midname] shielded mismatch — resolved:", resolvedAddress,
        "session.coinPublicKey:", session.coinPublicKey || "(none)",
        "session.shieldedAddress:", session.shieldedAddress || "(none)");
    }
  } else {
    // unshielded: direct comparison
    verified = (resolvedAddress.trim().toLowerCase() === session.address.trim().toLowerCase());
    console.log("[identity/verify-midname] unshielded match:", verified);
  }

  if (!verified) {
    return res.status(422).json({
      ok: false,
      error: resolvedType === "shielded"
        ? "Midname resolves to a shielded address that does not match your connected wallet's shielded identity."
        : "Midname resolves to a different address. Verify you own this midname.",
      resolved: resolvedAddress,
      resolvedType,
      connected: session.address,
      connectedShielded: session.shieldedAddress || null,
      connectedCoinPublicKey: session.coinPublicKey ? "(present)" : null,
    });
  }

  const identity = {
    walletAddress: session.address,
    midname: cleanMidname,
    did: null,
    midnameVerified: true,
    verifiedAt: new Date().toISOString(),
    identitySource: "midname",
    networkId: "preprod",
    resolvedType,
    resolvedAddress,
    fields: resolvedFields
  };
  saveIdentity(identity);
  console.log("[identity] midname verified and persisted:", cleanMidname, "->", resolvedAddress, "(type:", resolvedType + ")");
  res.json({ ok: true, identity });
});

// ─── Auto-resolve Midname via addr_to_domains reverse lookup ──────────────────
// Fetches the Midnames contract ledger and looks up which domain(s) resolve to
// the connected wallet address. Returns the first match or null. Never throws.
async function autoResolveMidnameFromWallet(walletAddress, coinPublicKey) {
  try {
    const { getDefaultProvider, getContractLedger, keyToDomain } = await import("@midnames/sdk");
    const { MidnightBech32m } = await import("@midnight-ntwrk/wallet-sdk-address-format");

    const provider = getDefaultProvider("preprod");
    const ledgerResult = await getContractLedger(provider);
    if (!ledgerResult || !ledgerResult.success) {
      console.log("[auto-resolve-midname] getContractLedger failed");
      return null;
    }

    const contractLedger = ledgerResult.data;

    // Build id → DomainReference map for reconstructing full domain paths
    const idToRef = new Map();
    for (const [ref, id] of contractLedger.name_to_id) {
      idToRef.set(id, ref);
    }

    function buildFullDomain(ref) {
      const segment = keyToDomain(ref.domain);
      if (ref.parent_id === contractLedger.ROOT_ZONE_ID) {
        return `${segment}.${contractLedger.TLD}`;
      }
      const parentRef = idToRef.get(ref.parent_id);
      if (!parentRef) return `${segment}.${contractLedger.TLD}`;
      return `${segment}.${buildFullDomain(parentRef)}`;
    }

    // Try unshielded address: parse bech32 → raw bytes → addr_to_domains lookup
    if (walletAddress) {
      try {
        const parsed = MidnightBech32m.parse(walletAddress);
        const addrBytes = new Uint8Array(parsed.data);
        if (contractLedger.addr_to_domains.member(addrBytes)) {
          const domains = contractLedger.addr_to_domains.lookup(addrBytes);
          for (const ref of domains) {
            const fullDomain = buildFullDomain(ref);
            console.log(`[auto-resolve-midname] found (unshielded): ${fullDomain}`);
            return { midname: fullDomain, resolvedType: "unshielded", resolvedAddress: walletAddress };
          }
        }
      } catch (e) {
        console.log("[auto-resolve-midname] unshielded lookup failed:", e?.message);
      }
    }

    // Try shielded (coinPublicKey): same pattern
    if (coinPublicKey) {
      try {
        const parsed = MidnightBech32m.parse(coinPublicKey);
        const cpkBytes = new Uint8Array(parsed.data);
        if (contractLedger.addr_to_domains.member(cpkBytes)) {
          const domains = contractLedger.addr_to_domains.lookup(cpkBytes);
          for (const ref of domains) {
            const fullDomain = buildFullDomain(ref);
            console.log(`[auto-resolve-midname] found (shielded): ${fullDomain}`);
            return { midname: fullDomain, resolvedType: "shielded", resolvedAddress: coinPublicKey };
          }
        }
      } catch (e) {
        console.log("[auto-resolve-midname] shielded lookup failed:", e?.message);
      }
    }

    console.log("[auto-resolve-midname] no Midname found for wallet");
    return null;
  } catch (err) {
    console.warn("[auto-resolve-midname] error:", err?.message || String(err));
    return null;
  }
}

// POST /identity/auto-resolve-midname — automatic reverse-lookup Midnames resolution on wallet connect
app.post("/identity/auto-resolve-midname", async (req, res) => {
  const session = readWalletSession();
  console.log("[identity] auto-resolve start", session ? session.address : "(no session)");
  if (!session || !session.address) {
    console.log("[identity] auto-resolve failed: no wallet session");
    return res.json({ ok: false, midname: null, reason: "no wallet session" });
  }

  // Don't overwrite an already-verified midname unless this is a new wallet.
  // identity.json is the canonical identity source. Match on any known address field
  // because walletAddress may be shielded CPK (mn_shield-cpk_...) while session.address
  // is unshielded (mn_addr_...) — a format mismatch that must not break retention.
  const existing = readIdentity();
  const sessionAddrs = [session.address, session.coinPublicKey, session.shieldedAddress].filter(Boolean);
  const identityAddrs = [existing?.walletAddress, existing?.resolvedAddress].filter(Boolean);
  const walletMatches = existing && existing.midnameVerified && existing.midname &&
    sessionAddrs.some(sa => identityAddrs.some(ia => ia === sa));
  if (walletMatches) {
    console.log("[auto-resolve-midname] existing verified midname retained (identity.json canonical):", existing.midname);
    return res.json({ ok: true, midname: existing.midname, identity: existing });
  }

  const resolved = await autoResolveMidnameFromWallet(session.address, session.coinPublicKey || null);
  if (!resolved) {
    console.log("[identity] auto-resolve result: none");
    return res.json({ ok: false, midname: null, reason: "not found" });
  }
  console.log("[identity] auto-resolve result:", resolved.midname);

  const identity = {
    walletAddress: session.address,
    midname: resolved.midname,
    did: null,
    midnameVerified: true,
    verifiedAt: new Date().toISOString(),
    identitySource: "midname-auto",
    networkId: "preprod",
    resolvedType: resolved.resolvedType,
    resolvedAddress: resolved.resolvedAddress,
    fields: {}
  };
  saveIdentity(identity);
  console.log("[auto-resolve-midname] resolved and saved:", resolved.midname);
  res.json({ ok: true, midname: resolved.midname, identity });
});

// POST /identity/clear-midname — clear verified midname, revert to wallet identity
app.post("/identity/clear-midname", (req, res) => {
  const session = readWalletSession();
  const identity = {
    walletAddress: session ? session.address : null,
    midname: null,
    did: null,
    midnameVerified: false,
    verifiedAt: null,
    identitySource: "wallet",
    networkId: "preprod"
  };
  saveIdentity(identity);
  res.json({ ok: true, identity });
});

// GET /identity/card — Pilot Identity HTML page
app.get("/identity/card", (_req, res) => {
  const session = readWalletSession();
  const identity = readIdentity() || {};
  const walletConnected = !!(session && session.address);
  const walletDisplay = walletConnected
    ? (session.address.length > 16 ? session.address.slice(0, 10) + "…" + session.address.slice(-8) : session.address)
    : "Not connected";
  const midnameDisplay = identity.midnameVerified && identity.midname ? identity.midname : "—";
  const midnameStatus = identity.midnameVerified ? "Verified" : (identity.midname ? "Unresolved" : "Not set");
  const midnameStatusColor = identity.midnameVerified ? "#22c55e" : "#f59e0b";
  const verifiedAt = identity.verifiedAt ? String(identity.verifiedAt).slice(0, 10) : null;
  const idFields = identity.fields || {};
  const idName = idFields.name || null;
  const idTwitter = idFields.twitter || null;
  const idBio = idFields.bio || null;
  const idResolvedType = identity.resolvedType || null;
  const shieldedIdentityAvailable = !!(session && (session.coinPublicKey || session.shieldedAddress));
  const shieldedRawAddr = (session && session.shieldedAddress) || null;
  const shieldedRawCpk = (session && session.coinPublicKey) || null;
  const shieldedDisplay = shieldedRawAddr
    ? (shieldedRawAddr.length > 20 ? shieldedRawAddr.slice(0, 12) + "…" + shieldedRawAddr.slice(-8) : shieldedRawAddr)
    : shieldedRawCpk
    ? (shieldedRawCpk.length > 20 ? shieldedRawCpk.slice(0, 12) + "…" + shieldedRawCpk.slice(-8) : shieldedRawCpk)
    : null;
  const shieldedStatus = !walletConnected ? "not connected" : shieldedIdentityAvailable ? "available" : "not captured";
  const shieldedStatusColor = !walletConnected ? "#6b7280" : shieldedIdentityAvailable ? "#22c55e" : "#f59e0b";

  res.type("html").send(`<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Pilot Identity — PilotLog</title>
  <style>
  body { font-family: -apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial,sans-serif; background:#0b0f18; color:#fff; margin:0; }
  .wrap { max-width:680px; margin:0 auto; padding:32px 20px; }
  .topbar { display:flex; justify-content:space-between; align-items:center; margin-bottom:28px; flex-wrap:wrap; gap:12px; }
  .brand { font-size:20px; font-weight:800; letter-spacing:-0.5px; }
  .nav a { color:#9aa3ff; text-decoration:none; font-size:14px; margin-left:16px; }
  .nav a:hover { color:#fff; }
  h1 { font-size:24px; font-weight:800; margin:0 0 6px; }
  .subtitle { color:#b6b9c6; font-size:14px; margin-bottom:24px; }
  .card { background:#121624; border:1px solid #222843; border-radius:14px; padding:20px; margin-bottom:16px; }
  .card-title { font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:.08em; color:#b6b9c6; margin-bottom:14px; }
  .identity-row { display:flex; justify-content:space-between; align-items:center; padding:8px 0; border-bottom:1px solid #1f2440; }
  .identity-row:last-child { border-bottom:none; }
  .identity-label { font-size:13px; color:#b6b9c6; }
  .identity-value { font-size:13px; font-weight:600; }
  .status-dot { display:inline-block; width:8px; height:8px; border-radius:50%; margin-right:6px; }
  .verify-form { margin-top:20px; }
  .verify-form label { display:block; font-size:11px; color:#b6b9c6; text-transform:uppercase; letter-spacing:.06em; margin-bottom:6px; }
  .verify-form input { width:100%; box-sizing:border-box; background:#0b0f18; border:1px solid #222843; border-radius:8px; padding:10px 12px; color:#fff; font-size:14px; }
  .verify-form input:focus { outline:none; border-color:#1a3a8f; }
  .btn { display:inline-block; padding:10px 20px; background:#1a3a8f; color:#fff; border:none; border-radius:8px; font-size:14px; font-weight:700; cursor:pointer; margin-top:10px; }
  .btn:hover { background:#1e46b0; }
  .btn-outline { background:transparent; border:1px solid #222843; color:#9aa3ff; }
  .btn-outline:hover { color:#fff; }
  .btn-danger { background:transparent; border:1px solid #374151; color:#ef4444; }
  .btn-danger:hover { background:#1a0a0a; }
  .msg { margin-top:12px; font-size:13px; padding:10px 14px; border-radius:8px; display:none; }
  .msg.ok { background:#0d1f10; color:#22c55e; border:1px solid #1a3a1a; }
  .msg.err { background:#1a0a0a; color:#ef4444; border:1px solid #3a1a1a; }
  .future-tag { font-size:11px; background:#1a1f30; color:#6b7280; padding:2px 8px; border-radius:6px; }
  </style>
</head>
<body>
<div class="wrap">
  <div class="topbar">
    <div class="brand">PilotLog</div>
    <div class="nav">
      ${walletNavHtml(session, identity)}
      <a href="/">Dashboard</a>
      <a href="/passport">Passport</a>
      <a href="/pilot-report">Pilot Report →</a>
    </div>
  </div>

  <h1>Verify Identity</h1>
  <div class="subtitle">Link your Midnight Midname to your pilot identity.</div>

  <div class="card">
    <div class="card-title">Identity Status</div>
    <div class="identity-row">
      <span class="identity-label">Wallet</span>
      <span class="identity-value" style="color:${walletConnected ? '#22c55e' : '#ef4444'};">
        <span class="status-dot" style="background:${walletConnected ? '#22c55e' : '#ef4444'};"></span>
        ${walletConnected ? walletDisplay : "Not connected"}
      </span>
    </div>
    <div class="identity-row">
      <span class="identity-label">Midname</span>
      <span class="identity-value" style="color:${midnameStatusColor};">
        <span class="status-dot" style="background:${midnameStatusColor};"></span>
        ${midnameDisplay} <span style="font-size:11px;color:#6b7280;font-weight:400;">${midnameStatus}</span>
        ${verifiedAt ? `<span style="font-size:11px;color:#6b7280;font-weight:400;margin-left:8px;">· ${verifiedAt}</span>` : ""}
      </span>
    </div>
    ${idName ? `<div class="identity-row">
      <span class="identity-label">Name</span>
      <span class="identity-value">${idName}</span>
    </div>` : ""}
    ${idTwitter ? `<div class="identity-row">
      <span class="identity-label">Twitter</span>
      <span class="identity-value" style="color:#9aa3ff;">${idTwitter}</span>
    </div>` : ""}
    ${idBio ? `<div class="identity-row">
      <span class="identity-label">Bio</span>
      <span class="identity-value" style="font-weight:400;color:#b6b9c6;">${idBio}</span>
    </div>` : ""}
    ${idResolvedType ? `<div class="identity-row">
      <span class="identity-label">Address Type</span>
      <span class="identity-value" style="color:#6b7280;">${idResolvedType}</span>
    </div>` : ""}
    <div class="identity-row">
      <span class="identity-label">Privacy</span>
      <span class="identity-value" style="color:${shieldedIdentityAvailable ? '#9aa3ff' : '#6b7280'};">
        ${shieldedIdentityAvailable
          ? `<span class="status-dot" style="background:#9aa3ff;"></span>Private · Shielded`
          : walletConnected
          ? `<span class="status-dot" style="background:#6b7280;"></span>Standard`
          : `<span class="status-dot" style="background:#6b7280;"></span>—`
        }
      </span>
    </div>
    <div class="identity-row">
      <span class="identity-label">DID</span>
      <span class="identity-value" style="color:#6b7280;">
        <span class="future-tag">Future / Unavailable</span>
      </span>
    </div>
    <div class="identity-row">
      <span class="identity-label">Network</span>
      <span class="identity-value" style="color:#9aa3ff;">preprod</span>
    </div>
  </div>

  ${walletConnected ? `
  <div class="card">
    <div class="card-title">Verify Midname</div>
    <p style="font-size:13px;color:#b6b9c6;margin:0 0 14px;line-height:1.6;">
      Enter your Midnight Midname (e.g. <code style="color:#9aa3ff;">pilot.night</code>).
      The app will resolve it and verify it matches your connected wallet address.
    </p>
    ${!shieldedIdentityAvailable ? `<div style="font-size:12px;background:#1a1200;border:1px solid #3a2a00;color:#f59e0b;padding:10px 14px;border-radius:8px;margin-bottom:12px;">
      ⚠ Shielded identity not captured from wallet. Shielded midnames (.night shielded) cannot be verified until you disconnect and reconnect your wallet.
      Unshielded midnames will still work.
    </div>` : ""}
    <div class="verify-form">
      <label>Midname</label>
      <input type="text" id="midname-input" placeholder="e.g. pilot.night" value="${identity.midname || ''}" />
      <br/>
      <button class="btn" onclick="verifyMidname()">Verify &amp; Save</button>
      ${identity.midnameVerified ? `<button class="btn btn-danger" onclick="clearMidname()" style="margin-left:10px;">Clear Midname</button>` : ""}
    </div>
    <div class="msg" id="verify-msg"></div>
  </div>
  ` : `
  <div class="card" style="text-align:center;color:#b6b9c6;font-size:14px;">
    Connect your wallet to verify a Midname.
  </div>
  `}

  <script>
  async function verifyMidname() {
    const midname = document.getElementById('midname-input').value.trim();
    const msg = document.getElementById('verify-msg');
    msg.style.display = 'none';
    if (!midname) { showMsg('err', 'Enter a midname.'); return; }
    try {
      const resp = await fetch('/identity/verify-midname', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ midname })
      });
      const data = await resp.json();
      if (data.ok) {
        showMsg('ok', 'Midname verified! Reloading…');
        setTimeout(() => location.reload(), 1200);
      } else {
        showMsg('err', data.error || 'Verification failed.');
      }
    } catch (e) {
      showMsg('err', 'Request failed: ' + e.message);
    }
  }

  async function clearMidname() {
    const resp = await fetch('/identity/clear-midname', { method: 'POST' });
    const data = await resp.json();
    if (data.ok) location.reload();
  }

  function showMsg(type, text) {
    const msg = document.getElementById('verify-msg');
    msg.className = 'msg ' + type;
    msg.textContent = text;
    msg.style.display = 'block';
  }
  </script>
</div>
</body>
</html>`);
});

app.get("/deployment.json", (_req, res) => {
  try {
    if (!fs.existsSync(deploymentJsonPath)) {
      return res.status(404).json({ error: "no deployment" });
    }
    const raw = fs.readFileSync(deploymentJsonPath, "utf8");
    const json = JSON.parse(raw);
    res.json(json);
  } catch (err) {
    console.error("[deployment] failed:", err);
    res.status(500).json({ error: "deployment.json load failed" });
  }
});

// DELETE /deployment — clear contractAddress (forces redeploy on next save).
// Used by browser when error 115 (verifier key mismatch after contract recompile) is detected.
app.delete("/deployment", (req, res) => {
  try {
    const existing = fs.existsSync(deploymentJsonPath)
      ? JSON.parse(fs.readFileSync(deploymentJsonPath, "utf8"))
      : {};
    const cleared = { networkId: existing.networkId || "preprod" };
    fs.writeFileSync(deploymentJsonPath, JSON.stringify(cleared, null, 2));
    console.log("[deploy] contractAddress cleared — fresh deploy required");
    res.json({ ok: true });
  } catch (err) {
    console.error("[deployment] clear failed:", err);
    res.status(500).json({ error: "deployment.json clear failed" });
  }
});

// POST /deployment — update contractAddress (and optionally networkId) from browser deploy flow
app.post("/deployment", (req, res) => {
  const { contractAddress, networkId } = req.body || {};
  if (!contractAddress || typeof contractAddress !== "string") {
    return res.status(400).json({ error: "contractAddress required" });
  }
  try {
    const existing = fs.existsSync(deploymentJsonPath)
      ? JSON.parse(fs.readFileSync(deploymentJsonPath, "utf8"))
      : {};
    // AIR-208: persist networkId alongside contractAddress for future mismatch checks
    const updated = { ...existing, contractAddress, deployedAt: new Date().toISOString() };
    if (networkId && typeof networkId === "string") updated.networkId = networkId;
    fs.writeFileSync(deploymentJsonPath, JSON.stringify(updated, null, 2));
    console.log("[deploy] contract address updated:", contractAddress, "network:", networkId || "(not provided)");
    res.json({ ok: true, contractAddress });
  } catch (err) {
    console.error("[deployment] write failed:", err);
    res.status(500).json({ error: "deployment.json write failed" });
  }
});

const compiledContractDir = path.resolve(
  process.cwd(),
  "compact/contracts/airlog/src/managed/airlog/contract"
);

if (fs.existsSync(compiledContractDir)) {
  console.log("[contract] serving compiled contract from:", compiledContractDir);
  app.use("/contract/compiled/airlog", express.static(compiledContractDir));
  const browserBundle = path.resolve(compiledContractDir, "index.js");
  if (fs.existsSync(browserBundle)) {
    console.log("[contract] browser bundle ready:", browserBundle);
  } else {
    console.warn("[contract] browser bundle NOT FOUND — run: npm run build:contract-bundle");
  }
} else {
  console.error("[contract] compiled contract dir NOT FOUND:", compiledContractDir);
}

const keysDir = path.resolve(
  process.cwd(),
  "compact/contracts/airlog/src/managed/airlog/keys"
);

if (fs.existsSync(keysDir)) {
  app.use("/contract/compiled/airlog/keys", express.static(keysDir));
}

// ─── /passport — Pilot Passport v1 ───────────────────────────────────────────
app.get("/passport", (_req, res) => {
  const ps = buildPilotState();
  const session = ps._walletSession;
  const identity = ps._identity;
  const profile = ps._profile;
  const entries = ps._entries;
  const totals = computeTotals(entries);
  const allAttestations = ps._attestations;
  const walletConnected = ps.walletConnected;
  const midnameVerified = ps.midnameVerified;
  const idName = (identity.fields && identity.fields.name) || (profile && profile.pilot && profile.pilot.fullName) || "";
  const aircraftSet = new Set();
  for (const e of entries) {
    const ident = e.aircraftIdent || e.aircraftId;
    if (ident) aircraftSet.add(ident);
  }
  const aircraftCount = aircraftSet.size;
  const certs = (profile && profile.certificates) || [];
  const ratings = (profile && profile.ratings) || [];
  const anchored = entries.filter(e => e.anchored === true || e.anchorStatus === "anchored").length;

  const passportCard = pilotPassportCardHtml(session, identity, profile, totals, { mode: "full", aircraftCount });

  const certListHtml = certs.length
    ? certs.map(c => `<li style="padding:7px 0;border-bottom:1px solid #1f2440;font-size:14px;color:#e2e8f0;">${c.type}${c.number ? ` <span style="color:#6b7280;font-size:12px;">#${c.number}</span>` : ""}${c.issued ? ` <span style="color:#6b7280;font-size:12px;">· ${c.issued}</span>` : ""}</li>`).join("")
    : `<li style="padding:7px 0;font-size:13px;color:#374151;">None on file — add via profile</li>`;

  const ratingListHtml = ratings.length
    ? ratings.map(r => `<li style="padding:7px 0;border-bottom:1px solid #1f2440;font-size:14px;color:#e2e8f0;">${r.type}${r.issued ? ` <span style="color:#6b7280;font-size:12px;">· ${r.issued}</span>` : ""}</li>`).join("")
    : `<li style="padding:7px 0;font-size:13px;color:#374151;">None on file</li>`;

  function placeholderSection(label) {
    return `<div style="background:#0b0f18;border:1px solid #1f2440;border-radius:12px;padding:16px;margin-bottom:12px;opacity:0.5;">
      <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#6b7280;margin-bottom:8px;">${label}</div>
      <div style="font-size:13px;color:#374151;font-style:italic;">Coming soon</div>
    </div>`;
  }

  res.type("html").send(`<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Pilot Passport — PilotLog</title>
  <style>
  body { font-family: -apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial,sans-serif; background:#0b0f18; color:#fff; margin:0; }
  .wrap { max-width:720px; margin:0 auto; padding:32px 20px 60px; }
  .topbar { display:flex; justify-content:space-between; align-items:center; margin-bottom:32px; flex-wrap:wrap; gap:12px; }
  .brand { font-size:20px; font-weight:800; letter-spacing:-0.5px; }
  .nav a { color:#9aa3ff; text-decoration:none; font-size:14px; margin-left:16px; }
  .nav a:hover { color:#fff; }
  .section-label { font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:.08em; color:#6b7280; margin:24px 0 12px; }
  .two-col { display:grid; grid-template-columns:1fr 1fr; gap:12px; }
  @media(max-width:560px) { .two-col { grid-template-columns:1fr; } }
  ul { list-style:none; padding:0; margin:0; }
  .section-card { background:#121624; border:1px solid #222843; border-radius:14px; padding:18px 20px; margin-bottom:14px; }
  .actions { display:flex; gap:12px; margin-top:24px; flex-wrap:wrap; }
  .btn { display:inline-block; padding:10px 20px; background:#1a3a8f; color:#fff; border-radius:8px; font-size:14px; font-weight:700; text-decoration:none; border:none; cursor:pointer; }
  .btn:hover { background:#1e46b0; }
  .btn-outline { background:transparent; border:1px solid #222843; color:#9aa3ff; }
  .btn-outline:hover { color:#fff; }
  .stat-chip { background:#0b0f18; border:1px solid #1f2440; border-radius:10px; padding:8px 14px; font-size:13px; color:#b6b9c6; display:inline-flex; align-items:center; gap:6px; }
  .stat-chip strong { color:#fff; }
  </style>
</head>
<body>
<div class="wrap">
  <div class="topbar">
    <div class="brand">PilotLog</div>
    <div class="nav">
      ${walletNavHtml(session, identity)}
      <a href="/">Dashboard</a>
      <a href="/pilot-report">Pilot Report →</a>
    </div>
  </div>

  <div style="margin-bottom:8px;">
    <h1 style="font-size:28px;font-weight:800;margin:0 0 4px;letter-spacing:-0.5px;">Pilot Passport</h1>
    <p style="color:#b6b9c6;font-size:14px;margin:0;">Your verified aviation identity on Midnight.</p>
  </div>

  ${passportCard}

  <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:24px;">
    <div class="stat-chip"><strong>${entries.length}</strong> flights logged</div>
    <div class="stat-chip"><strong>${anchored}</strong> anchored on-chain</div>
    ${aircraftCount > 0 ? `<div class="stat-chip"><strong>${aircraftCount}</strong> aircraft</div>` : ""}
  </div>

  <div class="section-label">Certificates &amp; Ratings</div>
  <div class="section-card">
    <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#6b7280;margin-bottom:10px;">Certificates</div>
    <ul>${certListHtml}</ul>
    ${ratings.length > 0 ? `<div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#6b7280;margin:14px 0 10px;">Ratings</div><ul>${ratingListHtml}</ul>` : ""}
  </div>

  <div class="section-label">Attestations</div>

  ${(() => {
    const pending = allAttestations.filter(a => a.status === "pending");
    const verified = allAttestations.filter(a => a.status === "verified");
    const rejected = allAttestations.filter(a => a.status === "rejected");

    const pendingHtml = pending.length > 0
      ? pending.map(a => {
          const entries2 = readEntries();
          const flight = entries2.find(e => e.id === a.flightId);
          const flightLabel = flight
            ? `${String(flight.date || "").slice(0,10)} · ${flight.from || ""}→${flight.to || ""}`
            : a.flightId.slice(0, 8) + "…";
          const typeLabel = { instruction_verified: "Instructor Verified", flight_verified: "Flight Confirmed", endorsement_verified: "Endorsement Signed Off", aircraft_checkout: "Aircraft Checkout", maintenance_verified: "Maintenance Signed Off" }[a.type] || a.type;
          return `<div style="background:#0b0f18;border:1px solid #2d2209;border-radius:10px;padding:14px 16px;margin-bottom:10px;display:flex;justify-content:space-between;align-items:flex-start;gap:12px;">
            <div style="flex:1;min-width:0;">
              <div style="font-size:13px;font-weight:700;color:#e2e8f0;margin-bottom:3px;">${typeLabel}</div>
              <div style="font-size:12px;color:#b6b9c6;margin-bottom:2px;">${flightLabel}</div>
              ${a.attestorMidname ? `<div style="font-size:11px;color:#6b7280;">Requested from <strong>${a.attestorMidname}</strong></div>` : `<div style="font-size:11px;color:#6b7280;">Awaiting reviewer</div>`}
            </div>
            <div style="display:flex;align-items:center;gap:6px;background:#1a1203;border:1px solid #f59e0b33;border-radius:20px;padding:3px 10px;flex-shrink:0;">
              <span style="width:6px;height:6px;border-radius:50%;background:#f59e0b;display:inline-block;"></span>
              <span style="font-size:11px;font-weight:700;color:#f59e0b;">Pending</span>
            </div>
          </div>`;
        }).join("")
      : `<div style="font-size:13px;color:#374151;font-style:italic;padding:8px 0;">No pending requests.</div>`;

    const verifiedHtml = verified.length > 0
      ? attestationsSectionHtml(verified, { theme: "dark" })
      : `<div style="font-size:13px;color:#374151;font-style:italic;padding:8px 0;">No verified attestations yet.</div>`;

    const rejectedHtml = rejected.length > 0
      ? attestationsSectionHtml(rejected, { theme: "dark" })
      : `<div style="font-size:13px;color:#374151;font-style:italic;padding:8px 0;">No rejected requests.</div>`;

    return `
  <div class="section-card" style="margin-bottom:12px;">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">
      <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#6b7280;">Pending Requests</div>
      ${pending.length > 0 ? `<a href="/review" style="font-size:12px;font-weight:700;color:#9aa3ff;text-decoration:none;background:#0f1628;border:1px solid #222843;border-radius:6px;padding:4px 12px;">Review →</a>` : ""}
    </div>
    ${pendingHtml}
  </div>

  <div class="section-card" style="margin-bottom:12px;">
    <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#6b7280;margin-bottom:12px;">Verified Attestations</div>
    ${verifiedHtml}
  </div>

  ${rejected.length > 0 ? `<div class="section-card" style="margin-bottom:12px;">
    <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#6b7280;margin-bottom:12px;">Rejected Requests</div>
    ${rejectedHtml}
  </div>` : ""}
    `;
  })()}

  <div class="actions">
    <a href="/" class="btn btn-outline">← Dashboard</a>
    <a href="/review" class="btn">Review Requests →</a>
    ${!midnameVerified ? `<a href="/identity/card" class="btn btn-outline">Verify Identity →</a>` : ""}
    <a href="/pilot-report" class="btn btn-outline">Pilot Report →</a>
  </div>
</div>
${walletStatusScript}
</body>
</html>`);
});
// ─── /review — Attestation Review Panel ───────────────────────────────────────
app.get("/review", (_req, res) => {
  const session = readWalletSession();
  const identity = readIdentity() || {};
  const allAttestations = readAttestations();
  const entries = readEntries();
  const pending = allAttestations.filter(a => a.status === "pending");

  function flightSummary(flightId) {
    const f = entries.find(e => e.id === flightId);
    if (!f) return { label: flightId.slice(0, 8) + "…", route: "—", date: "—", aircraft: "—" };
    return {
      label: `${String(f.date || "").slice(0, 10)} · ${f.from || "?"}→${f.to || "?"}`,
      route: `${f.from || "?"}→${f.to || "?"}`,
      date: String(f.date || "").slice(0, 10),
      aircraft: f.aircraftIdent || f.aircraftId || "—",
    };
  }

  const MOCK_REVIEWERS = ["cfi.night", "school.night", "instructor.night", "checkpilot.night", "dpe.night"];

  const pendingCardsHtml = pending.length === 0
    ? `<div style="text-align:center;padding:48px 24px;color:#4a5568;font-size:14px;font-style:italic;">No pending verification requests.</div>`
    : pending.map(a => {
        const fl = flightSummary(a.flightId);
        const typeLabel = { instruction_verified: "Instructor Verified", flight_verified: "Flight Confirmed", endorsement_verified: "Endorsement Signed Off", aircraft_checkout: "Aircraft Checkout", maintenance_verified: "Maintenance Signed Off" }[a.type] || a.type;
        const requested = String(a.createdAt || "").slice(0, 10);
        return `<div id="card-${a.id}" style="background:#0f1628;border:1px solid #222843;border-radius:14px;padding:22px 24px;margin-bottom:18px;">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:16px;flex-wrap:wrap;">
            <div style="flex:1;min-width:0;">
              <div style="font-size:16px;font-weight:800;color:#e2e8f0;margin-bottom:6px;">${typeLabel}</div>
              <div style="display:flex;gap:16px;flex-wrap:wrap;margin-bottom:10px;">
                <span style="font-size:12px;color:#9aa3ff;font-weight:600;">&#9992; ${fl.route}</span>
                <span style="font-size:12px;color:#b6b9c6;">${fl.aircraft}</span>
                <span style="font-size:12px;color:#6b7280;">${fl.date}</span>
              </div>
              ${a.attestorMidname ? `<div style="font-size:12px;color:#b6b9c6;margin-bottom:6px;">Requested from: <strong style="color:#9aa3ff;">${a.attestorMidname}</strong></div>` : ""}
              <div style="font-size:11px;color:#4a5568;">Requested ${requested}</div>
            </div>
            <div style="display:flex;align-items:center;gap:6px;background:#1a1203;border:1px solid #f59e0b33;border-radius:20px;padding:4px 12px;flex-shrink:0;align-self:flex-start;">
              <span style="width:6px;height:6px;border-radius:50%;background:#f59e0b;display:inline-block;"></span>
              <span style="font-size:11px;font-weight:700;color:#f59e0b;">Pending</span>
            </div>
          </div>
          <div style="margin-top:16px;padding-top:16px;border-top:1px solid #1a1f33;">
            <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#6b7280;margin-bottom:10px;">Reviewing as</div>
            <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;">
              <select id="reviewer-${a.id}" style="background:#0b0f18;border:1px solid #222843;color:#e2e8f0;border-radius:7px;padding:7px 12px;font-size:13px;min-width:180px;">
                ${MOCK_REVIEWERS.map(m => `<option value="${m}"${a.attestorMidname === m ? " selected" : ""}>${m}</option>`).join("")}
              </select>
              <button onclick="approveAttestation('${a.id}')" style="background:#14532d;border:1px solid #16a34a55;color:#4ade80;border-radius:8px;padding:8px 18px;font-size:13px;font-weight:700;cursor:pointer;">
                &#10003; Approve
              </button>
              <button onclick="rejectAttestation('${a.id}')" style="background:#450a0a;border:1px solid #dc262655;color:#f87171;border-radius:8px;padding:8px 18px;font-size:13px;font-weight:700;cursor:pointer;">
                &#10007; Reject
              </button>
            </div>
          </div>
        </div>`;
      }).join("");

  res.type("html").send(`<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Review Attestations — PilotLog</title>
  <style>
  body { font-family: -apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial,sans-serif; background:#0b0f18; color:#fff; margin:0; }
  .wrap { max-width:720px; margin:0 auto; padding:32px 20px 60px; }
  .topbar { display:flex; justify-content:space-between; align-items:center; margin-bottom:32px; flex-wrap:wrap; gap:12px; }
  .brand { font-size:20px; font-weight:800; letter-spacing:-0.5px; }
  .nav a { color:#9aa3ff; text-decoration:none; font-size:14px; margin-left:16px; }
  .nav a:hover { color:#fff; }
  #toast { position:fixed;bottom:24px;right:24px;background:#1a3a8f;color:#fff;padding:12px 20px;border-radius:10px;font-size:14px;font-weight:600;z-index:9999;opacity:0;transition:opacity .3s;pointer-events:none; }
  #toast.show { opacity:1; }
  </style>
</head>
<body>
<div class="wrap">
  <div class="topbar">
    <div class="brand">PilotLog</div>
    <div class="nav">
      ${walletNavHtml(session, identity)}
      <a href="/">Dashboard</a>
      <a href="/passport">Passport</a>
    </div>
  </div>

  <div style="margin-bottom:24px;">
    <h1 style="font-size:28px;font-weight:800;margin:0 0 6px;letter-spacing:-0.5px;">Verification Review</h1>
    <p style="color:#b6b9c6;font-size:14px;margin:0;">Review and sign off pending flight verification requests.</p>
  </div>

  <div id="pending-list">
    ${pendingCardsHtml}
  </div>

  <div style="margin-top:32px;">
    <a href="/passport" style="color:#9aa3ff;font-size:14px;text-decoration:none;">← Back to Passport</a>
  </div>
</div>

<div id="toast"></div>

<script>
  function showToast(msg, isError) {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.style.background = isError ? '#7f1d1d' : '#14532d';
    t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), isError ? 4000 : 2500);
  }

  async function approveAttestation(id) {
    const sel = document.getElementById('reviewer-' + id);
    const reviewerMidname = sel ? sel.value : 'cfi.night';
    try {
      const res = await fetch('/attestations/' + id, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'approve', reviewerMidname }),
      });
      if (!res.ok) throw new Error(await res.text());
      const card = document.getElementById('card-' + id);
      if (card) {
        card.style.opacity = '0.4';
        card.style.pointerEvents = 'none';
        card.querySelector('[style*="Pending"]')?.parentElement && Object.assign(card.querySelector('[style*="1a1203"]').style, { background: '#0d1f10', borderColor: '#22c55e33' });
      }
      showToast('Flight Confirmed — Instructor Verified');
      setTimeout(() => { window.location.reload(); }, 1400);
    } catch (err) {
      showToast('Failed to approve: ' + err.message, true);
    }
  }

  async function rejectAttestation(id) {
    const sel = document.getElementById('reviewer-' + id);
    const reviewerMidname = sel ? sel.value : 'cfi.night';
    const notes = prompt('Reason for rejection (optional):', '');
    if (notes === null) return;
    try {
      const res = await fetch('/attestations/' + id, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reject', reviewerMidname, notes: notes || undefined }),
      });
      if (!res.ok) throw new Error(await res.text());
      showToast('Verification request rejected.');
      setTimeout(() => { window.location.reload(); }, 1400);
    } catch (err) {
      showToast('Failed to reject: ' + err.message, true);
    }
  }
</script>
${walletStatusScript}
</body>
</html>`);
});
// ─────────────────────────────────────────────────────────────────────────────

const zkirDir = path.resolve(
  process.cwd(),
  "compact/contracts/airlog/src/managed/airlog/zkir"
);

if (fs.existsSync(zkirDir)) {
  app.use("/contract/compiled/airlog/zkir", express.static(zkirDir));
}

// ─── Unified PilotState API ───────────────────────────────────────────────────

app.get("/api/pilot-state", (_req, res) => {
  const ps = buildPilotState();
  // Strip raw sources from the API response
  const { _walletSession, _identity, _profile, _entries, _attestations, _prog, ...state } = ps;
  res.json(state);
});

// ─── Dashboard State ──────────────────────────────────────────────────────────
// Fully derived dashboard structure: pilotState -> dashboardState -> UI
// UI should consume this instead of assembling state from multiple endpoints.
app.get("/api/dashboard-state", (req, res) => {
  const asOf = String(req.query.asOf || new Date().toISOString());
  const ps = buildPilotState(asOf);
  res.json(buildDashboardState(ps));
});

// ─── Pilot Progression Engine ─────────────────────────────────────────────────

app.get("/api/progression", (req, res) => {
  const asOf = String(req.query.asOf || new Date().toISOString());
  const entries = readEntries();
  res.json(computePplPart61Progress(entries, { asOf }));
});

app.get("/api/whats-next", (req, res) => {
  const asOf = String(req.query.asOf || new Date().toISOString());
  const entries = readEntries();
  const prog = computePplPart61Progress(entries, { asOf });
  res.json({
    asOf,
    progressionState: prog.progressionState,
    label: prog.label,
    guidanceCards: prog.guidanceCards,
    recommendations: prog.recommendations,
  });
});

app.get("/api/milestones", (req, res) => {
  const asOf = String(req.query.asOf || new Date().toISOString());
  const entries = readEntries();
  const prog = computePplPart61Progress(entries, { asOf });
  res.json({
    asOf,
    progressionState: prog.progressionState,
    label: prog.label,
    progressPct: prog.progressPct,
    milestones: prog.milestones,
  });
});

// FAA Part 61 ASEL requirements — raw engine output
app.get("/api/faa-requirements", (req, res) => {
  const asOf = String(req.query.asOf || new Date().toISOString());
  const entries = readEntries();
  const result = computePplRequirements(entries, { asOf });
  res.json(result);
});

// /journey is an alias for /progression
app.get("/journey", (req, res) => res.redirect("/progression"));

app.get("/progression", (_req, res) => {
  const ps = buildPilotState();
  const profile = ps._profile;
  const entries = ps._entries;
  const attestations = ps._attestations;
  const prog = ps._prog;
  const asOf = prog.asOf || new Date().toISOString();

  const pilotName = profile?.pilot?.fullName || "Pilot";

  function statusColor(status) {
    if (status === 'completed' || status === 'ready') return '#22c55e';
    if (status === 'in_progress' || status === 'close') return '#f59e0b';
    if (status === 'building') return '#60a5fa';
    if (status === 'not_started') return '#6b7280';
    return '#6b7280';
  }

  function priorityColor(p) {
    if (p === 'critical') return '#ef4444';
    if (p === 'high') return '#f97316';
    if (p === 'medium') return '#f59e0b';
    return '#60a5fa';
  }

  function milestoneStatusBadge(status) {
    if (status === 'completed') return '<span style="background:#14532d;color:#4ade80;padding:2px 10px;border-radius:99px;font-size:11px;font-weight:700;">✓ Complete</span>';
    if (status === 'in_progress') return '<span style="background:#78350f;color:#fbbf24;padding:2px 10px;border-radius:99px;font-size:11px;font-weight:700;">In Progress</span>';
    return '<span style="background:#1e293b;color:#64748b;padding:2px 10px;border-radius:99px;font-size:11px;font-weight:700;">Upcoming</span>';
  }

  const milestonesHtml = prog.milestones.map(m => `
    <div style="display:flex;align-items:flex-start;gap:12px;padding:12px 0;border-bottom:1px solid #1e293b;">
      <span style="font-size:22px;margin-top:2px;">${m.icon}</span>
      <div style="flex:1;">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
          <span style="color:#e2e8f0;font-size:14px;font-weight:600;">${m.label}</span>
          ${milestoneStatusBadge(m.status)}
        </div>
        <div style="color:#64748b;font-size:12px;">${m.detail || ''}</div>
      </div>
    </div>
  `).join('');

  const readinessHtml = Object.values(prog.readiness).map(r => `
    <div style="margin-bottom:16px;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
        <span style="color:#cbd5e1;font-size:13px;font-weight:600;">${r.label}</span>
        <span style="color:${statusColor(r.status)};font-size:12px;font-weight:700;">${r.score}%</span>
      </div>
      <div style="background:#1e293b;border-radius:4px;height:6px;overflow:hidden;">
        <div style="background:${statusColor(r.status)};width:${r.score}%;height:6px;border-radius:4px;transition:width 0.3s;"></div>
      </div>
      <div style="color:#475569;font-size:11px;margin-top:4px;">${r.detail}</div>
    </div>
  `).join('');

  const cardsHtml = prog.guidanceCards.length === 0
    ? '<div style="color:#64748b;font-size:13px;padding:16px 0;">All clear — no active alerts.</div>'
    : prog.guidanceCards.map(c => `
      <div style="background:#0f172a;border:1px solid #1e293b;border-left:3px solid ${priorityColor(c.priority)};border-radius:8px;padding:14px 16px;margin-bottom:10px;">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
          <span style="font-size:18px;">${c.icon}</span>
          <span style="color:#e2e8f0;font-size:14px;font-weight:700;">${c.title}</span>
          <span style="margin-left:auto;background:${priorityColor(c.priority)}22;color:${priorityColor(c.priority)};padding:2px 8px;border-radius:99px;font-size:11px;font-weight:700;text-transform:uppercase;">${c.priority}</span>
        </div>
        <div style="color:#94a3b8;font-size:13px;margin-bottom:6px;">${c.body}</div>
        <div style="color:#60a5fa;font-size:12px;">→ ${c.action}</div>
      </div>
    `).join('');

  const recsHtml = prog.recommendations.map(r => `
    <div style="display:flex;gap:10px;padding:10px 0;border-bottom:1px solid #1e293b;">
      <span style="color:#818cf8;font-size:16px;flex-shrink:0;">✦</span>
      <span style="color:#cbd5e1;font-size:13px;line-height:1.5;">${r}</span>
    </div>
  `).join('');

  const statsHtml = [
    ['Total Hours', prog.stats.totalHours + 'h'],
    ['PIC Hours', prog.stats.picHours + 'h'],
    ['XC Hours', prog.stats.xcHours + 'h'],
    ['Night Hours', prog.stats.nightHours + 'h'],
    ['Dual Received', prog.stats.dualReceived + 'h'],
    ['Solo Hours', prog.stats.soloHours + 'h'],
    ['Instrument', prog.stats.instrumentHours + 'h'],
    ['Day Landings', prog.stats.totalDayLandings],
    ['Night Landings', prog.stats.totalNightLandings],
    ['Total Flights', prog.stats.totalFlights],
  ].map(([k, v]) => `
    <div style="background:#0f172a;border:1px solid #1e293b;border-radius:8px;padding:12px 14px;text-align:center;">
      <div style="color:#e2e8f0;font-size:18px;font-weight:700;">${v}</div>
      <div style="color:#64748b;font-size:11px;margin-top:2px;">${k}</div>
    </div>
  `).join('');

  const completedCount = prog.milestones.filter(m => m.status === 'completed').length;
  const inProgCount = prog.milestones.filter(m => m.status === 'in_progress').length;

  // Journey Timeline
  const PROGRESSION_PHASES = [
    { key: 'discovery',           label: 'Discovery',          short: 'Discovery',      order: 0 },
    { key: 'student_pilot',       label: 'Student Pilot',      short: 'Student',        order: 1 },
    { key: 'solo_ready',          label: 'Pre-Solo',           short: 'Pre-Solo',       order: 2 },
    { key: 'solo_complete',       label: 'Solo Complete',      short: 'Solo',           order: 3 },
    { key: 'xc_ready',            label: 'Cross-Country',      short: 'XC',             order: 4 },
    { key: 'checkride_ready',     label: 'Checkride Ready',    short: 'Checkride',      order: 5 },
    { key: 'private_pilot',       label: 'Private Pilot',      short: 'PPL',            order: 6 },
    { key: 'instrument_training', label: 'Instrument Training', short: 'IFR Training',  order: 7 },
    { key: 'instrument_ready',    label: 'Instrument Ready',   short: 'IFR Ready',      order: 8 },
    { key: 'instrument_rated',    label: 'Instrument Rated',   short: 'IFR Rated',      order: 9 },
    { key: 'commercial_track',    label: 'Commercial Track',   short: 'Commercial',     order: 10 },
    { key: 'cfi_track',           label: 'CFI Track',          short: 'CFI',            order: 11 },
  ];

  const currentOrder = PROGRESSION_PHASES.find(p => p.key === prog.progressionState)?.order ?? 0;

  const timelineHtml = PROGRESSION_PHASES.map((phase, idx) => {
    const isCompleted = phase.order < currentOrder;
    const isActive    = phase.key === prog.progressionState;
    const isUpcoming  = phase.order > currentOrder;

    const dotColor    = isCompleted ? '#22c55e' : isActive ? '#818cf8' : '#1e293b';
    const dotBorder   = isCompleted ? '#22c55e' : isActive ? '#818cf8' : '#334155';
    const dotShadow   = isActive ? '0 0 0 4px rgba(129,140,248,0.2)' : 'none';
    const labelColor  = isCompleted ? '#22c55e' : isActive ? '#818cf8' : '#374151';
    const labelWeight = isActive ? '700' : '600';
    const dotSize     = isActive ? '14px' : '10px';

    const connectorColor = isCompleted ? '#22c55e' : '#1e293b';
    const connectorHtml  = idx < PROGRESSION_PHASES.length - 1
      ? `<div style="flex:1;height:2px;background:${connectorColor};align-self:flex-start;margin-top:${isActive ? '7px' : '5px'};"></div>`
      : '';

    return `
      <div style="display:flex;align-items:flex-start;flex:1;">
        <div style="display:flex;flex-direction:column;align-items:center;gap:6px;">
          <div style="width:${dotSize};height:${dotSize};border-radius:50%;background:${dotColor};border:2px solid ${dotBorder};box-shadow:${dotShadow};flex-shrink:0;"></div>
          <div style="font-size:9px;font-weight:${labelWeight};color:${labelColor};text-align:center;white-space:nowrap;text-transform:uppercase;letter-spacing:0.05em;">${phase.short}</div>
          ${isActive ? `<div style="font-size:8px;color:#6366f1;text-align:center;white-space:nowrap;">← you are here</div>` : ''}
        </div>
        ${connectorHtml}
      </div>
    `;
  }).join('');

  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Pilot Progression — ${pilotName}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: #020817; color: #e2e8f0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; min-height: 100vh; }
  a { color: #818cf8; text-decoration: none; }
  a:hover { text-decoration: underline; }
  .page { max-width: 960px; margin: 0 auto; padding: 32px 20px 60px; }
  .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
  .grid-stats { display: grid; grid-template-columns: repeat(5, 1fr); gap: 10px; margin-bottom: 28px; }
  @media(max-width: 700px) { .grid-2 { grid-template-columns: 1fr; } .grid-stats { grid-template-columns: repeat(2, 1fr); } }
  .card { background: #0b1120; border: 1px solid #1e293b; border-radius: 12px; padding: 20px 22px; }
  .section-title { color: #94a3b8; font-size: 11px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; margin-bottom: 14px; }
  nav { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 28px; padding: 12px 0; border-bottom: 1px solid #1e293b; }
  nav a { color: #64748b; font-size: 13px; padding: 4px 10px; border-radius: 6px; }
  nav a:hover { color: #e2e8f0; background: #1e293b; text-decoration: none; }
  nav a.active { color: #818cf8; background: #1e293b; }
</style>
</head>
<body>
<div class="page">
  <nav>
    <a href="/">Dashboard</a>
    <a href="/passport">Passport</a>
    <a href="/progression" class="active">Journey</a>
    <a href="/pilot-report">Pilot Report</a>
  </nav>

  <!-- Header -->
  <div style="margin-bottom:28px;">
    <div style="display:flex;align-items:center;gap:16px;flex-wrap:wrap;">
      <div>
        <h1 style="font-size:26px;font-weight:800;color:#f1f5f9;letter-spacing:-0.02em;">${pilotName}</h1>
        <div style="color:#818cf8;font-size:14px;font-weight:600;margin-top:2px;">${prog.label}</div>
        <div style="color:#64748b;font-size:12px;margin-top:2px;">${prog.description}</div>
      </div>
      <div style="margin-left:auto;text-align:right;">
        <div style="color:#e2e8f0;font-size:28px;font-weight:800;">${prog.progressPercent}%</div>
        <div style="color:#64748b;font-size:11px;">FAA requirements met</div>
        <div style="color:#64748b;font-size:11px;">${completedCount} milestones done · ${inProgCount} in progress</div>
      </div>
    </div>
    <!-- Progress bar -->
    <div style="background:#1e293b;border-radius:6px;height:8px;margin-top:16px;overflow:hidden;">
      <div style="background:linear-gradient(90deg,#6366f1,#818cf8);width:${prog.progressPercent}%;height:8px;border-radius:6px;"></div>
    </div>
  </div>

  <!-- Journey Timeline -->
  <div class="card" style="margin-bottom:20px;">
    <div class="section-title">Pilot Journey Timeline</div>
    <div style="display:flex;align-items:flex-start;gap:0;overflow-x:auto;padding:8px 0 16px;">
      ${timelineHtml}
    </div>
    <div style="color:#475569;font-size:11px;margin-top:4px;">${prog.description}</div>
  </div>

  <!-- Stats Grid -->
  <div class="grid-stats">
    ${statsHtml}
  </div>

  <!-- What's Next (full width) -->
  ${prog.guidanceCards.length > 0 ? `
  <div class="card" style="margin-bottom:20px;">
    <div class="section-title">What's Next</div>
    ${cardsHtml}
    ${recsHtml ? `<div style="margin-top:16px;"><div class="section-title">Recommendations</div>${recsHtml}</div>` : ''}
  </div>
  ` : ''}

  <!-- Cards + Milestones -->
  <div class="grid-2" style="margin-bottom:20px;">
    <!-- Readiness Layers -->
    <div class="card">
      <div class="section-title">Readiness</div>
      ${readinessHtml}
      ${prog.guidanceCards.length === 0 && recsHtml ? `<div style="margin-top:20px;"><div class="section-title">Recommendations</div>${recsHtml}</div>` : ''}
    </div>

    <!-- Milestones Summary -->
    <div class="card">
      <div class="section-title">Milestones</div>
      ${milestonesHtml}
    </div>
  </div>

  <div style="margin-top:16px;color:#334155;font-size:11px;text-align:center;">
    Generated ${new Date(asOf).toLocaleString()} · FAA Part 61 ASEL Requirements Engine · ${prog.certificate || 'PPL-ASEL'}
  </div>
</div>
</body>
</html>`);
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`pilotlog-read-api listening on :${PORT}`);
  console.log(`Reading entries from: ${ENTRIES_PATH}`);
  console.log(`Reading profile from: ${PROFILE_PATH}`);
  console.log(`Reading aircraft from: ${AIRCRAFT_PATH}`);
  console.log(`Reading verification from: ${VERIFICATION_PATH}`);
});
