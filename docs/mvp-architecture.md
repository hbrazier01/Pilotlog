# AirLog MVP Architecture

## MVP Boundaries

**Included:**
- Ingestion of raw maintenance text records from structured input files
- Parsing and normalization of maintenance records into canonical JSON schema
- Missing-field detection on ingested records
- SHA-256 integrity hashing of canonical records
- Integrity result output suitable for resale verification

**Excluded:**
- User authentication and access control
- Web UI or dashboard
- Real-time data streaming
- Multi-aircraft fleet management
- External AirLog contract network integration (simulated locally only)
- Automated scheduling or cron-based ingestion

---

## Current System Map

| File | Role |
|------|------|
| `src/lib/maintenance-parser.mjs` | Parses raw maintenance text input into structured record objects |
| `scripts/ingest-maintenance.mjs` | Entry-point script: reads source data, invokes parser, writes canonical output |
| `data/schemas/canonical-maintenance-record.schema.json` | JSON Schema defining the canonical maintenance record shape |
| `src/lib/canonicalize-records.mjs` | Normalizes parsed records to the canonical schema format |
| `src/lib/hash-records.mjs` | Computes SHA-256 hashes over canonical record fields for integrity |
| `src/services/build-integrity-result.mjs` | Assembles final integrity result object from hashed canonical records |

---

## Target MVP Architecture

```
raw maintenance text input
        │
        ▼
src/lib/maintenance-parser.mjs
        │  (structured record objects)
        ▼
src/lib/canonicalize-records.mjs
        │  (validated against canonical-maintenance-record.schema.json)
        ▼
  missing-field detection
        │  (flags records with absent required fields)
        ▼
src/lib/hash-records.mjs
        │  (SHA-256 per record)
        ▼
src/services/build-integrity-result.mjs
        │
        ▼
   integrity output
   (resale-verification-ready JSON)
```

---

## Milestones

| # | Milestone | Description |
|---|-----------|-------------|
| M1 | Ingestion normalization | Raw text → parser → canonical JSON, persisted via `ingest-maintenance.mjs` |
| M2 | Schema + validation hardening | All records validated against `canonical-maintenance-record.schema.json`; invalid records rejected with error detail |
| M3 | Missing-record detection coverage | Every required canonical field checked; missing fields surfaced in output with record identifier |
| M4 | Resale verification output readiness | Integrity result includes hashes, missing-field flags, and structured metadata consumable by AirLog contract layer |

---

## Implementation Sequence

1. **`src/lib/maintenance-parser.mjs`** — Confirm parser handles all known raw record formats and returns typed objects matching the canonical schema shape.

2. **`data/schemas/canonical-maintenance-record.schema.json`** — Audit required fields; lock the schema for M2 validation milestone.

3. **`src/lib/canonicalize-records.mjs`** — Add schema validation step (e.g., using `ajv`). Reject records that fail; return structured errors.

4. **`src/lib/canonicalize-records.mjs` / inline** — Add missing-field detection pass after canonicalization. Collect missing required fields per record.

5. **`src/lib/hash-records.mjs`** — Confirm hashing covers all canonical fields deterministically. Verify reproducibility across runs.

6. **`src/services/build-integrity-result.mjs`** — Include missing-field report alongside hashes in the final result object.

7. **`scripts/ingest-maintenance.mjs`** — Wire all stages end-to-end. Write final integrity result to output file. Confirm valid JSON output.

---

## Acceptance Criteria

- [ ] Ingestion pipeline produces valid JSON output
- [ ] Missing-field detection exists and surfaces absent required fields per record
- [ ] Schema validation passes for all well-formed records; malformed records fail with clear errors
- [ ] Output structure supports resale verification (hashes + missing-field flags + record metadata present)
