# PilotLog

PilotLog is a lightweight General Aviation flight logbook engine that converts flight records into structured, verifiable compliance summaries and resale-ready aircraft record packets.

PilotLog currently serves as the prototype foundation for AirLog, a broader system focused on digitizing, organizing, and verifying legacy aircraft and pilot records.

## PilotLog Dashboard

<img width="640" height="632" alt="Dashboard_github" src="https://github.com/user-attachments/assets/6a9c8a21-0dd1-44f4-9c98-ef6974a6a3c3" />

The dashboard displays flight totals, regulatory currency status, aircraft maintenance alerts, record integrity verification, and structured logbook entries.

```
CLI Ingestion
      │
      ▼
Flight Entries
(data/entries.json)
      │
      ▼
PilotLog Engine
  • currency calculations
  • compliance checks
  • maintenance alerts
      │
      ▼
Record Integrity Hash
      │
      ▼
Verification Output
  • verification.json
  • sale packet artifacts
      │
      ▼
Read API + Dashboard
http://localhost:8788
```

## Current Capabilities


PilotLog currently includes:

- Command line ingestion tools for flight entries
- Persistent runtime storage for aircraft records
- Pilot currency tracking and compliance checks
- Maintenance reminder alerts
- Record integrity hashing for verification
- Verification artifact generation
- Local dashboard interface
- Read API for structured record access

## Example Outputs

The system generates structured verification artifacts such as:
```
verification.json
airlog-sale-packet-YYYY-MM-DD.json
```
These files demonstrate how aviation records can be converted into structured digital verification artifacts that may later be used for:

• aircraft resale documentation
• record audits
• compliance review
• record authenticity verification

## Running PilotLog Locally

Clone the repository:
```
git clone https://github.com/hbrazier01/Pilotlog.git
cd Pilotlog
docker compose up
```
Once running, open your browser:

http://localhost:8788

The dashboard will display:

• total flight hours
• landing counts
• currency status
• compliance indicators
• aircraft information
• logged flight entries

## Data Storage

Flight entries are stored in runtime storage:

data/entries.json

Example flight entries are included so the dashboard loads with demonstration data when the project runs locally.

Runtime data is stored outside the application code to keep user data separate from source control.

## Technology Stack

• Node.js
• JavaScript / TypeScript
• Docker container environment
• CLI utilities for ingestion
• Local API and dashboard interface

## Relationship to AirLog

PilotLog is the foundational engine for the larger AirLog system.

AirLog expands this concept to include:

• aircraft maintenance log ingestion
• legacy aircraft record digitization
• structured aircraft history verification
• resale-ready aircraft documentation
• privacy-preserving verification anchored to Midnight

PilotLog demonstrates the core ingestion, structuring, and verification model that powers that future platform.

## About

A lightweight General Aviation pilot logbook engine focused on currency tracking, compliance awareness, and verifiable record generation.

## Development Status

PilotLog is currently an active prototype and part of ongoing development toward the broader AirLog platform.
