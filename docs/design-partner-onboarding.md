# AirLog Design Partner Onboarding Guide

Welcome. You're one of AirLog's first design partners.

This guide walks you through running the system, reviewing its outputs, and giving us structured feedback. Your input will directly shape the product.

---

## What You're Testing

AirLog turns messy aircraft records into clean, verifiable digital history. The current prototype covers:

- **Aircraft logbook** — flight entry ingestion and totals
- **Maintenance records** — chronology, component tracking, return-to-service status
- **Compliance calendar** — annual, transponder, pitot-static, ELT due dates
- **Sale packet** — buyer-ready summary document (JSON + HTML)
- **Trust report** — risk-scored dossier for buyers: provenance, maintenance chronology, risk indicators, integrity verification

---

## Step 1 — Run the System

### Option A: View the live demo (no setup required)

Open the live demo — N123AB (2018 Cirrus SR20) data is pre-loaded:

- **Dashboard:** https://pilotlog-production.up.railway.app
- **Sale Packet (HTML):** https://pilotlog-production.up.railway.app/export/sale-packet/html
- **Trust Report (HTML):** https://pilotlog-production.up.railway.app/export/trust-report/html

No login, no install required.

---

### Option B: Docker (run locally)

```bash
git clone https://github.com/hbrazier01/Pilotlog.git
cd Pilotlog
docker compose up
```

Open: **http://localhost:8788**

### Option C: Node directly

```bash
npm install
node pilotlog-cli/src/readApi.mjs
```

Demo data is pre-loaded. You'll see N123AB (2018 Cirrus SR20) with maintenance records and flight logs.

---

## Step 2 — Explore the Dashboard

Visit **http://localhost:8788** to see:

- Flight totals and currency status
- Aircraft compliance alerts
- Record integrity hash and verification status
- Maintenance reminder alerts
- Pilot profile

---

## Step 3 — Review the Key Outputs

### Sale Packet (HTML)
**http://localhost:8788/export/sale-packet/html**

A formatted document a seller would hand to a buyer. Includes:
- Aircraft identity and specs
- Compliance calendar
- Maintenance history
- Logbook summary
- Record quality score

### Trust Report (HTML) ← new
**http://localhost:8788/export/trust-report/html**

A risk-scored buyer dossier. Includes:
- Trust Score (0–100)
- Risk flags with severity (CRITICAL / HIGH / MEDIUM / LOW)
- Aircraft provenance
- Compliance calendar with overdue/upcoming status
- Maintenance chronology with gap analysis
- Integrity verification (hash match against anchored record)

### Sale Packet (JSON)
**http://localhost:8788/export/sale-packet**

Machine-readable format for integration or further processing.

### Trust Report (JSON)
**http://localhost:8788/export/trust-report**

Same as above for the trust dossier.

### Logbook Summary
**http://localhost:8788/export/summary**

---

## Step 4 — Add Your Own Data (Optional)

You can replace the demo data with a real aircraft to test realistic output.

### Add a flight entry (CLI)
```bash
node bin/pilotlog.mjs add \
  --from KAPA --to KDEN \
  --total 1.5 --pic 1.5 \
  --date 2026-03-01 \
  --remarks "IFR cross-country"
```

### Update aircraft data
Edit `data/aircraft.json` directly — swap in a real N-number, serial, engine type, and due dates.

### Update maintenance records
Edit `data/maintenance.json` — each record has: id, date, category, description, performedBy, mechanic, totalAirframeHours, returnToService, components, documents.

---

## Step 5 — Run the Quick Demo Script

```bash
node scripts/setup-demo.mjs
```

This prints all available endpoints with links, confirms data is loaded, and shows a live trust score for the demo aircraft.

---

## Step 6 — Give Us Feedback

Please fill out `data/feedback-template.json` with your observations. You can email it back, paste it into our shared Slack channel, or send a GitHub issue.

Key questions we want answered:

1. Is the trust report output useful in a real sale/purchase scenario?
2. What fields are missing from the sale packet?
3. Where would you integrate this into your existing workflow?
4. What would make this credible enough to show to a buyer or seller today?

---

## Contacts

- **Harrison** (CEO) — questions, feedback, scheduling
- GitHub issues: https://github.com/hbrazier01/Pilotlog/issues

---

## Appendix — Available Endpoints

| Endpoint | Description |
|---|---|
| `GET /` | Dashboard |
| `GET /export/summary` | Logbook summary (HTML) |
| `GET /export/summary/download` | Logbook summary (JSON download) |
| `GET /export/sale-packet` | Sale packet (JSON download) |
| `GET /export/sale-packet/html` | Sale packet (HTML view) |
| `GET /export/trust-report` | Trust report (JSON download) |
| `GET /export/trust-report/html` | Trust report (HTML view) |
| `GET /verify/hash/:hash` | Verify a record hash |
| `GET /aircraft` | Aircraft list (JSON) |
| `GET /entries` | Flight entries (JSON) |
| `GET /profile` | Pilot profile (JSON) |
| `GET /maintenance` | Maintenance records (JSON) |
