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

# AirLog Sale Packet v1 — HTML Spec

**Route:** `GET /export/sale-packet/html`

This is the buyer-facing HTML document. It must be printable, credible to a sophisticated buyer, and complete enough to replace a folder of paper records.

---

## Sections (in order)

### 1. Header
Aircraft registration, type, make/model/year, generated date, integrity badge.

### 2. Trust Summary
High-level trust signal for buyers. Includes:
- Overall integrity status (anchored / not yet anchored)
- Hash match status
- Record quality score (0–100)
- Gap count with severity breakdown (e.g. "2 issues — 1 high, 1 medium")

### 3. Buyer Evidence Index
A checklist of what evidence exists in this packet:
- Logbook entries present (count)
- Maintenance records present (count)
- Annual inspection on file (yes/no + date)
- AD compliance records present (count)
- Documents referenced (count)
- Pilot profile complete (yes/no)
- On-chain anchor (yes/no)

### 4. Record Gaps & Flags
Gap analysis output. Each gap shows type, description, severity (red = high, yellow = medium). Green "No gaps" if clean.

### 5. Logbook Summary
Flight totals: total hours, PIC, landings, instrument time, night hours.

### 6. Aircraft & Pilot Summary (2-col grid)
Aircraft: registration, type, serial, manufacture year, total time, engine type/serial, prop type/serial.
Pilot: name, medical kind/class, flight review date, endorsements.

### 7. Compliance Calendar
Due dates for annual, transponder, pitot-static, ELT battery. Color-coded: red = overdue/due soon, yellow = upcoming, green = current.

### 8. AD Compliance
All AD compliance entries from maintenance records. Columns: AD number, description, date complied, mechanic, next due (if recurring).

### 9. 337 / Major Alterations
All maintenance records with category `major-alteration` or `337`. Columns: date, description, performed by, documents referenced.
If none: show "No major alterations on file."

### 10. Component Snapshot
Engine, propeller, and major avionics from aircraft record. Shows: part type, serial number, time since overhaul (if known), last service date (from maintenance records).

### 11. Maintenance History
Full maintenance log table: date, category, description, mechanic, airframe hours, RTS flag.

### 12. Record Integrity
Hash display, anchor status, anchor time/network/tx if available.

### 13. Record Quality Score
Score out of 100 with factor breakdown table.

---

## Design Rules
- Printable (print CSS, no background colors on print)
- Clean typography, no decorative elements
- Color only for status indicators (red/yellow/green)
- All sections must render gracefully when data is missing

