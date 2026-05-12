# PilotLog Progression Engine

**Status:** Architecture reference + MVP design doc
**Last updated:** 2026-05-11

---

## Purpose

This document defines the design philosophy, architecture, and MVP scope of the PilotLog Progression Engine — the system that transforms raw logbook entries into a living pilot identity layer.

The goal is not a gamification overlay.
The goal is a **verifiable, emotionally resonant record of who a pilot is becoming.**

---

## Core Design Philosophy

### 1. Logbook as truth

Every calculation derives from actual flight entries. No guesses, no faked scores. If the pilot hasn't flown it, it doesn't count. The engine is a pure function: same entries in, same state out.

### 2. Deterministic over probabilistic

No AI-generated "predictions" in MVP. Every state, readiness score, and recommendation must be traceable to a specific regulation, threshold, or data point. A pilot or instructor should be able to audit every number.

### 3. Phase before hours

Progression phases are more meaningful than raw hour counts. A pilot at 14 hours in pre-solo is further along than a pilot at 20 hours who stopped flying for a year. The engine weights recency, phase completion, and training arc — not just cumulative hours.

### 4. Emotional momentum is a feature

The system should feel like it is rooting for the pilot. Not patronizing. Not childish. The language, card priorities, and milestone structure should create forward pull — the next logical step should always be visible.

### 5. Aviation-grade professionalism

Design register: Garmin G1000 + LinkedIn endorsements + structured training record.
Not: mobile game, streak tracker, or social media feed.

---

## System Architecture

### Single Entry Point

```
computeProgression(profile, entries, attestations, asOf)
  └── computePplPart61Progress(entries, { asOf })      ← pre-PPL (authoritative)
  └── legacy milestone/readiness system                 ← post-PPL
```

All UI must derive from `computeProgression()`. No component should independently calculate progression state from raw entries.

### Core Data Flow

```
Raw Entries
    │
    ▼
aggregateFlightStats()
    │
    ├── evaluateRequirements()   → per-requirement met/deficit/pct
    ├── computePhase()           → training phase label
    ├── computeProgressPercent() → weighted 0–100 score
    ├── buildDeficiencies()      → actionable gap list
    └── buildCompleted()         → achievement list
    │
    ▼
computeProgression()
    │
    ├── progressionState         → canonical pilot stage key
    ├── label / description      → human-readable phase display
    ├── progressPct              → overall progress 0–100
    ├── stats                    → aggregate flight stats
    ├── milestones               → ordered milestone array
    ├── readiness                → readiness layer per dimension
    ├── guidanceCards            → priority-sorted action cards
    ├── recommendations          → natural language prompts
    └── faaRequirements          → raw FAA engine output (pre-PPL only)
```

### Dashboard Composition Layer (AIR-267)

The dashboard is now fully state-driven via a second derivation layer:

```
computeProgression()         ← progression engine (pure computation)
    │
    ▼
buildPilotState()            ← unifies wallet/identity/progression into one object
    │
    ▼
buildDashboardState()        ← derives dashboard structure from pilotState
    │
    ├── chipStatus / chipLabel    → readiness indicator (current / needs_attention / not_current)
    ├── todayCard                 → highest-priority guidance card as primary action
    ├── secondaryCards            → next 2 guidance cards for context
    ├── journeySteps              → 3-step arc for current progression phase
    ├── journeyActiveIdx          → which step is active (0/1/2)
    ├── guidanceCards             → all guidance cards for readiness lane rendering
    └── recommendations           → natural language progression prompts
```

**API endpoint:** `GET /api/dashboard-state`

**Key architectural constraint:** the dashboard UI consumes `/api/dashboard-state` only. It does NOT independently call `/assistant/readiness` or assemble logic from raw entries. All card priority, phase configuration, and journey step mapping lives server-side in `buildDashboardState()`.

**Phase-aware journey strips** are derived from `progressionState` → `JOURNEY_STEPS` map inside `buildDashboardState()`. Adding a new phase only requires updating that map — no JS changes.

---

## Progression Phases

### Pre-PPL Phases (FAA Engine — authoritative)

| Phase | Key | Trigger Condition |
|---|---|---|
| Foundation | `foundation` | < 3h total, minimal dual |
| Pre-Solo Training | `pre_solo` | 3–12h total, dual underway |
| Pre-Solo | `solo_ready` | 10h+ dual, approaching endorsement |
| Cross-Country Phase | `xc_phase` | Solo complete, building toward checkride mins |
| Checkride Ready | `checkride_ready` | All Part 61 ASEL minimums met |

### Post-PPL States (Legacy Engine)

| State | Key | Notes |
|---|---|---|
| Private Pilot | `private_pilot` | PPL held, minimal IFR |
| Instrument Training | `instrument_training` | 10–39h instrument time |
| Instrument Ready | `instrument_ready` | 40h+ instrument time |
| Instrument Rated | `instrument_rated` | IR held |
| Commercial Track | `commercial_track` | CPL in progress |
| CFI Track | `cfi_track` | CFI held or in progress |

---

## Readiness Dimensions

Each readiness dimension is independent. A pilot can be checkride-ready on hours but currency-lapsed. The engine surfaces all relevant dimensions simultaneously.

### Pre-PPL Readiness (FAA requirement-mapped)

Each dimension maps directly to a 14 CFR §61.109 requirement:

| Dimension | Regulation | Minimum |
|---|---|---|
| Total Flight Time | §61.109(a) | 40h |
| Dual Received | §61.109(a)(1) | 20h |
| Solo Time | §61.109(a)(2) | 10h |
| Dual Cross-Country | §61.109(a)(1)(i) | 3h |
| Solo Cross-Country | §61.109(a)(2)(ii) | 5h |
| Night Hours | §61.109(a)(1)(ii) | 3h |
| Night Landings | §61.109(a)(1)(ii)(A) | 10 full-stop |
| Simulated Instrument | §61.109(a)(1)(iii) | 3h |

Readiness status per dimension: `not_started` → `in_progress` → `close` (75%+) → `completed`

### Post-PPL Currency Readiness

| Dimension | Window | Minimum |
|---|---|---|
| Day Passenger Currency | 90 days | 3 takeoffs/landings |
| Night Passenger Currency | 90 days | 3 full-stop night landings |
| IFR Currency (approaches) | 6 months | 6 approaches |
| IFR Currency (holds) | 6 months | 1 holding procedure |

---

## Guidance Card System

Cards are the primary surface for actionable intelligence. They are not decorative.

### Card Priority Model

```
critical → expires within 30 days, immediate safety/currency impact
high     → expires within 60 days, or approaching milestone gate
medium   → training gap, hour deficit, recommended next action
low      → encouragement, optional improvements
```

### Card Trigger Categories

| Category | Example |
|---|---|
| `currency` | Night currency lapsing, medical expiring |
| `training` | XC hours behind, solo XC not started |
| `milestone` | Approaching checkride eligibility |
| `ifr` | Approaches below IFR currency threshold |

### Card Composition Rules

- One card per issue (no duplicate alerts)
- Sorted: critical → high → medium → low
- Each card must have: title, body (what's happening), action (what to do)
- Medical expiry logic: surface at 60 days, escalate to critical at 30 days

---

## Milestone Architecture

Milestones are a sequential narrative of pilot achievement. They answer: "What have I done? What's next?"

### Status Model

```
upcoming    → not yet reachable (prerequisites incomplete)
in_progress → actively working toward (partial progress logged)
completed   → met or surpassed
```

### Milestone Ordering (pre-PPL)

1. First Flight Logged
2. Dual Training Underway
3. Pre-Solo Eligible
4. First Solo
5. Dual Cross-Country
6. Solo Cross-Country
7. Night Training
8. Instrument Training
9. Checkride Eligible

Each milestone's `detail` field is a short, specific data-backed sentence. Not static copy.

---

## Recommendation Engine

Recommendations are 1–3 short sentences. Plain language. Data-driven. No filler.

### Generation Rules

1. Evaluate currency state first (most time-sensitive)
2. Evaluate training gaps by priority weight
3. Evaluate phase-appropriate next steps
4. Fall back to encouragement only if no gaps detected

### Example Outputs

- "You are 2 night landings away from night passenger currency."
- "Cross-country time is behind expected progression — 1.2h of 3h needed."
- "All FAA hour minimums are met — eligible to schedule your PPL checkride."
- "You have 38.5 hours logged. Only 1.5h more to reach the FAA minimum."

Avoid:
- "Keep up the great work!"
- "You're doing amazing!"
- Generic copy that could apply to any pilot

---

## MVP Boundary

### NOW — Implemented

- [x] FAA Part 61 ASEL requirements engine (`pplPart61.mjs`)
- [x] Pre-PPL phase detection (5 phases)
- [x] Per-requirement readiness scoring with deficit tracking
- [x] Post-PPL progression states (12 states)
- [x] Milestone system (sequential, status-tracked)
- [x] Guidance card system (priority-sorted, categorized)
- [x] Recommendation engine (data-driven, contextual)
- [x] Currency tracking (day/night/IFR with time windows)
- [x] Medical expiry detection
- [x] Instructor attestation integration
- [x] Dashboard and Journey views connected to engine

### LATER — Deferred

- [ ] Aircraft-specific readiness (aircraft complexity factors)
- [ ] Inactivity decay scoring (recency-weighted proficiency)
- [ ] Badge / collection system (first solo badge, 100h badge, etc.)
- [ ] Pilot-aircraft familiarity graph
- [ ] AI-augmented recommendations (post-MVP, post-user feedback)
- [ ] Part 141 thresholds (different minimums, accelerated program)
- [ ] Commercial / ATP progression engine
- [ ] Adaptive dashboard (card visibility by phase)
- [ ] Trust score / Pilot Passport identity primitive
- [ ] Flight review expiration tracking (currently missing from data model)

---

## UI Opportunities

### Cards that should become dynamic

| Component | Current State | Should Become |
|---|---|---|
| Progress bar | Static percentage | Phase-aware: shows current phase label + weighted FAA completion |
| Readiness cards | Static display | Dynamic per dimension, disappear when 100% met |
| Guidance cards | Always visible | Priority-sorted, phase-gated (don't show IFR currency to pre-solo pilot) |
| Milestone list | Full list always | Sequential unlock — upcoming milestones collapsed until reachable |
| Stats panel | All stats always | Surface only stats relevant to current phase |

### Phase-gated card visibility

A student pilot in `foundation` phase should not see:
- IFR currency alerts
- Commercial track guidance
- Instrument readiness cards

Show only what is actionable for the pilot's current phase.

### Momentum indicators

Surface these prominently without making them the focus:

- Flights this week/month
- Hours added since last visit
- Most recent milestone completed
- Next milestone distance ("2.3h from First Solo")

---

## Extensibility Model

The engine is designed to support future certificate tracks without a full rewrite.

### Adding a new certificate track

1. Define thresholds object (mirrors `DEFAULT_PPL_THRESHOLDS`)
2. Define phase config (maps phases to `progressionState` keys)
3. Pass custom thresholds to `computePplRequirements(entries, { thresholds })`
4. Add phase config entry to `PHASE_CONFIG`

Example future tracks: Part 141 PPL, Instrument Rating, Commercial (ASEL/AMEL), CFI initial.

### Adding a new readiness dimension

1. Add field to `aggregateFlightStats()` output
2. Add `req()` entry in `evaluateRequirements()`
3. Add weight entry in `REQUIREMENT_WEIGHTS`
4. Add milestone in `buildViewMilestones()`

The architecture is intentionally flat — no deep class hierarchies, no framework coupling. Pure functions composable at any level.

---

## Future Vision: Pilot Passport Integration

The progression engine is the computation layer for what eventually becomes the Pilot Passport identity primitive.

Each verified milestone becomes a chain-anchored proof:
- First solo: date + aircraft + instructor attestation + logbook hash
- Checkride: examiner attestation + certificate number
- Currency: rolling window computation, provable from entry hashes
- Hours milestones: deterministic from verified entry chain

The engine today already outputs the right semantic primitives. The path to chain-backed identity is: anchor entry hashes → attest milestones → issue Passport proofs.

No redesign needed. Extension, not replacement.
