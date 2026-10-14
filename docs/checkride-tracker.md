# Checkride Tracker (v0.2)

Route: `/checkride` (linked from the dashboard and Progression nav). JSON: `GET /api/checkride`.

| Piece | Module | Notes |
|---|---|---|
| §61.109(a) readiness | `pilotlog-cli/src/lib/checkride/requirements.mjs` | 13 items incl. (a)(2)(i) night XC >100 NM, (a)(2)(ii) 10 night T/O + full-stops, (a)(4) 3h prep in the 2 calendar months before the test month, (a)(5)(ii) 150 NM / 3 points / leg >50 NM, (a)(5)(iii) 3 solo towered full-stops. Verified against eCFR. |
| Endorsements | `lib/checkride/endorsements.mjs` | 61.87 pre-solo, 61.93 solo/solo XC, knowledge test, 61.39/61.103 practical test. Date + CFI name + cert #. |
| ACS | `lib/checkride/acs.mjs` | FAA-S-ACS-6C ASEL tasks, Areas I–XII; status not started / introduced / proficient. |
| Costs | `lib/checkride/costs.mjs` | Defaults $229/hr aircraft (DA40 XLT), $60/hr instructor; per-flight overrides incl. instructor billed hours (block billing). Cost by phase and projection from deficits. |

Storage: `<PILOTLOG_HOME>/checkride.json`. Per-flight details (XC distance, full-stop points, longest leg,
tower full-stops, night takeoffs, checkride-prep flag, rates) are stored there keyed by entry id, so anchored
logbook entries are never rewritten. Not yet wired to Postgres mode.

Tests: `npm test` (node:test, `test/checkride.test.mjs`).
