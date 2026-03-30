# AirLog

AirLog turns messy aircraft records into clean, structured, and verifiable digital history — improving resale trust, compliance clarity, and aircraft value.

Built on PilotLog, the foundational flight logbook engine.

## Dashboard

<img width="640" height="632" alt="Dashboard_github" src="https://github.com/user-attachments/assets/6a9c8a21-0dd1-44f4-9c98-ef6974a6a3c3" />

## What It Does

AirLog ingests aircraft and pilot records and produces structured outputs that answer three questions a buyer or inspector actually cares about:

1. **Is this aircraft airworthy?** — compliance status on annual, transponder, pitot-static, ELT, and AD records
2. **Can I trust these records?** — a Trust Basis that shows what is verified, what is assumed, and what is missing
3. **What is the complete history?** — a buyer-facing sale packet with maintenance logs, flight history, component snapshot, and gap analysis

## Running Locally

```bash
git clone https://github.com/hbrazier01/Pilotlog.git
cd Pilotlog
docker compose up
```

Open: **http://localhost:8788**

Or without Docker:

```bash
cd pilotlog-cli
node src/readApi.mjs
```

## Key Endpoints

| Endpoint | Description |
|---|---|
| `GET /` | Dashboard — flight totals, currency, compliance alerts |
| `GET /verify/airworthy/html` | Buyer-facing airworthiness check — pass/fail on 7 compliance items |
| `GET /verify/airworthy` | Same check as JSON |
| `GET /export/sale-packet/html` | Full sale packet — Trust Basis, maintenance history, compliance calendar, gap analysis |
| `GET /export/sale-packet` | Sale packet as JSON download |
| `GET /export/trust-report/html` | Trust report — risk score, provenance, integrity verification |
| `GET /verify/hash/:hash` | Hash verification — confirm record integrity |

## Outputs Explained

### Trust Basis (in sale packet)
Shows exactly what AirLog can confirm vs. what it takes at face value vs. what is missing. Non-technical language intended for buyers.

### Airworthiness Check
Pass/fail assessment across: annual inspection, transponder/ADS-B, pitot-static, ELT battery, maintenance records, AD compliance, and flight log presence. Includes plain-language disclaimer that this is record-based, not a legal determination.

### Record Integrity Hash
Every record set produces a SHA-256 hash. Any change — even a single character — produces a different hash. Buyers can compare hashes to confirm they are reviewing unmodified records.

### Gap Analysis
Flags missing or overdue items (maintenance chronology gaps >12 months, missing annual, missing engine TSOH) with severity ratings.

## Data

Demo data for a 2018 Cirrus SR20 (N123AB) is included in `data/` and `pilotlog-cli/data/`. The aircraft has:
- 4 flight log entries
- 5 maintenance records including 1 AD compliance record
- Annual inspection current through 2026-05-15
- Transponder and pitot-static current through 2027

To add a flight entry:
```bash
node scripts/add.mjs --from KAPA --to KADS --total 1.3 --pic 1.3
```

## Architecture

```
data/
  aircraft.json     ← aircraft specs, compliance due dates
  entries.json      ← flight log entries
  maintenance.json  ← maintenance records, AD compliance, components
  profile.json      ← pilot profile, medical, endorsements

pilotlog-cli/src/readApi.mjs   ← Express API + all HTML pages
src/services/                  ← trust report, integrity, contract simulation
src/lib/                       ← hashing, canonicalization, airframe ID
compact/contracts/airlog/      ← Midnight Compact smart contract (compiled)
scripts/                       ← CLI utilities and Phase 2 readiness validator
```

## Phase 2 — Midnight Blockchain

The Compact smart contract (`compact/contracts/airlog/src/airlog.compact`) is written and compiled. It supports:
- `registerAirframe` — owner registers aircraft on-chain by airframe ID
- `authorizeIssuer` — owner authorizes A&P/IA mechanics to add entries
- `addEntry` — authorized mechanic records a maintenance event on-chain
- `transferAirframe` — ownership transfer

Local circuit simulation works today. To validate readiness for live PreProd deployment:

```bash
node scripts/validate-phase2-readiness.mjs
```

Live deployment requires: Lace wallet with tDUST on Midnight PreProd, plus `MIDNIGHT_NODE_URL`, `MIDNIGHT_INDEXER_URL`, `MIDNIGHT_PROOF_SERVER_URL`, and `MIDNIGHT_WALLET_SEED` env vars.

## Technology

- Node.js / ES Modules
- Express (read API + HTML pages)
- Midnight Compact (ZK smart contract language)
- @midnight-ntwrk/compact-runtime (local circuit simulation)
- Docker
- SHA-256 record hashing
