# Sale Packet Trust Upgrades (v1)

## Goal
Make the sale packet feel credible and demo-ready for a broker or buyer.

## Required Improvements

### 1. Buyer Evidence Index
Add a table showing each critical claim with:
- claim
- source document
- document hash
- signed by
- date
- verification status

Include unresolved or missing evidence items.

### 2. Structured AD & 337 Dossier
Add a top-level section for AD status showing:
- AD number
- status
- recurrence
- next due
- linked proof docs

Add a dedicated Form 337 / major repair / alteration disclosure section.

If none exist, explicitly state:
- No Form 337 records reported

### 3. Component Condition Snapshot
Add standardized sections for:
- engine
- prop
- avionics

For each, show:
- condition
- last inspection/test
- time since major event
- open discrepancies
- signoff authority

## Requirements
- HTML output only
- Keep it simple, readable, and demo-ready
- Do not redesign unrelated parts of the UI

## Definition of Done
The sale packet clearly shows:
- maintenance completeness
- verification evidence
- gaps or missing data
