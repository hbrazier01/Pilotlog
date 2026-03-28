# AirLog Demo Readiness (v1)

## Objective

Make AirLog credible to an external reviewer within 5 minutes.

This is NOT about features.
This is about trust, clarity, and reliability.

---

## Core Principle

A reviewer must be able to:

clone → run → add entry → export sale packet

Without confusion, errors, or false signals.

---

## Tier 1 — Must Be True (Blocking)

### 1. No Fake Trust Signals

* No fabricated `anchorTx`
* If not anchored:

  * show `null` or "not yet anchored"
* Never imply verification that does not exist

---

### 2. Local Dev Works Cleanly

* `docker compose up` runs successfully
* Correct:

  * volume mapping
  * entrypoint
  * service names
* No crashes on startup

---

### 3. Entry Flow Works

* `scripts/add.mjs` works
* Entry successfully appears in:

  * `/entries`
  * `/export/sale-packet`

---

### 4. Install Works

* `npm install` runs clean
* No phantom dependencies
* CLI runs without errors

---

### 5. Repo Credibility

* No `.bak` files
* No generated JSON in root
* Clean, intentional structure

---

## Tier 2 — Demo Enhancements (After Tier 1)

### Sale Packet Trust Features

* Buyer Evidence Index
* AD / 337 disclosure section
* Component condition snapshot
* Gap analysis (optional, already started)

---

## Definition of Done

A reviewer can:

1. Clone the repo
2. Run the app
3. Add an entry
4. View a sale packet

And concludes:

> “This is real, works, and can be trusted”

---

## What We Are NOT Doing

* No new features
* No Midnight integration expansion
* No over-engineering
* No UI redesign

---

## Current Focus

All work must support:

→ Demo credibility
→ Buyer trust
→ Execution clarity

Nothing else.

