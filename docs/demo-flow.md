# AirLog Demo Flow

**Base URL:** `https://pilotlog-production.up.railway.app`

Use this guide to walk through the product with a buyer, design partner, or reviewer. Every link below is live and clickable.

---

## Step 1 — Confirm the service is live

**URL:** https://pilotlog-production.up.railway.app/health

Returns `{ "status": "ok" }`. Confirms the server is up before starting the demo.

---

## Step 2 — View the dashboard

**URL:** https://pilotlog-production.up.railway.app/

The AirLog home screen. Shows the aircraft registration, pilot profile, and quick-access links to all exports. This is where a buyer or reviewer lands first.

---

## Step 3 — Browse flight log entries

**URL:** https://pilotlog-production.up.railway.app/entries

The raw logbook — every flight entry with date, route, duration, and flight conditions. This is the core record that buyers want to see.

---

## Step 4 — Check totals and pilot currency

**URL:** https://pilotlog-production.up.railway.app/export/summary

A structured summary of the logbook: total hours, PIC time, landings, instrument time, night hours, and currency status. Shows at a glance whether the pilot and aircraft records are complete.

To download as a file:
**URL:** https://pilotlog-production.up.railway.app/export/summary/download

---

## Step 5 — Generate the sale packet (JSON)

**URL:** https://pilotlog-production.up.railway.app/export/sale-packet

The full structured sale packet. Includes:
- Aircraft summary (registration, type, engine, avionics)
- Maintenance history
- Logbook totals
- Pilot profile
- **Gap analysis** — flags any chronology gaps, missing inspections, or missing TSOH data
- Integrity hash and blockchain anchor status

Save the `currentHash` value from this response — you'll use it in Step 6.

---

## Step 5b — View the sale packet as HTML (buyer-facing)

**URL:** https://pilotlog-production.up.railway.app/export/sale-packet/html

The same data rendered as a printable report. This is what you email or print for a buyer. Includes:
- Record quality score
- Compliance calendar (annual, transponder, pitot-static, ELT)
- **Record Gaps & Flags section** — red/yellow indicators for issues, green if clean
- Hash integrity block

---

## Step 6 — Verify the record hash

**URL:** https://pilotlog-production.up.railway.app/verify/hash/{hash}

Replace `{hash}` with the `currentHash` value from Step 5.

**Example:**
```
https://pilotlog-production.up.railway.app/verify/hash/abc123def456...
```

Confirms the records have not been altered since they were logged. Returns the verification status and whether the hash matches the anchored record.

---

## Full Demo Sequence (Quick Reference)

| Step | URL | What it shows |
|------|-----|---------------|
| 1 | `/health` | Service is live |
| 2 | `/` | Dashboard / home |
| 3 | `/entries` | Flight log entries |
| 4 | `/export/summary` | Totals & currency |
| 4b | `/export/summary/download` | Download summary |
| 5 | `/export/sale-packet` | Full sale packet JSON |
| 5b | `/export/sale-packet/html` | Sale packet (buyer view) |
| 6 | `/verify/hash/:hash` | Hash verification |

---

## Notes

- All routes use base URL: `https://pilotlog-production.up.railway.app`
- The HTML sale packet (`/export/sale-packet/html`) is the primary buyer-facing output
- Hash for Step 6 comes from the `verification.currentHash` field in Step 5
- Do not use root-level `/trust-report` or `/sale-packet` — use the `/export/` prefixed versions
