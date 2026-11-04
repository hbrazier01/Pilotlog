# Paper logbook import (IE-4 lean v1)
Status: **behind flags**. It needs both `PILOTLOG_ACCOUNTS_V2` and `PILOTLOG_PAPER_IMPORT`, plus Postgres and a v2 session.
It's based on the IE-4 spike findings (local, private) and the IE-4 backlog entry.
v1 has **no OCR or vision model**. Extraction is `manual` (the student types) or `fixture` (tests only).

## Model
- **`import_batches`**: one per import session (`draft` / `confirmed` / `abandoned`) and the extractor name.
- **`import_pages`**: one per photo.
  - Fields: `page_type` (`flight_left`, `flight_right`, `flight_full`, `ground`, `endorsements`, `remarks`), `spread_index` (pairs left and right halves), and `rotation_deg`.
  - Also: the image key, image sha256, content type, `footer` (the totals this page / amount forwarded / totals to date rows), and status (`draft` → `extracted` → `confirmed`).
- **`import_rows`**: one per grid row, holding `cells` = `{field: {v, c: high|med|low, reason?, reviewed?, edited?}}`. An empty cell is `v: null`, never 0.
- **`flights`** additions: `source`, `imported_by_student_verified`, and `import_page_id`, all nullable.
  - `wallet_address` is relaxed to NULLable, because a v2 student may have no wallet. Legacy wallet-keyed readers filter on it, so imported rows never show up there.
  - Confirmed rows are written with `source='paper_import'`, `imported_by_student_verified=true`, and `verification_status='student_imported'`. They are **never** stored as CFI-signed. Whether the paper shows a CFI signature is kept as `entry_json.cfiSignedOnPaper`.
- **Images** go through a pluggable store (`imageStore.mjs`). v1 is local disk: `PILOTLOG_IMPORT_DIR`, random keys, 0600 files, 0700 directory. An object-store adapter has to keep the same interface and use a private bucket with encryption at rest.

## Rules
- **Validation** (`validate.mjs`, ported from the spike's `validate.py`). Errors block confirm:
  - The date must be full `YYYY-MM-DD`, because paper logbooks omit the year.
  - Numeric cells must be numbers. Annotations like "2 PP T" belong in remarks.
  - dual, PIC, XC, night, or instrument must not exceed the total.
  - A flight row must have a total.
  - Low-confidence cells must be reviewed.
- **Validation warnings:**
  - dual + PIC > total
  - dates out of order
  - SEL ≠ total
  - SEL filled on a sim-only row
  - a dual row without a CFI signature
  - row sums ≠ "totals this page"
  - forwarded + this page ≠ to date
  - across pages: forwarded ≠ the previous page's to date (`checkCarryAcrossPages`)
- **Redaction** (`redact.mjs`): passport, driver's license, SSN, and other ID or certificate numbers are cut to their last 2 characters **before anything is stored**. This runs on extract and on every edit. It deliberately over-redacts: any run of 7 or more digits counts.
- **Confirm** works per page and is atomic. A flight page in v1 is either `flight_full` or the `flight_left` half that owns the row. The right-half photo is stored with the same `spread_index` as the image evidence, and the reviewer enters right-half values on the left page's rows.

## API
All routes are under `/api/v2/import`; see the header of `lib/import/routes.mjs`. `GET /import` is a static stub page.

## TODO: guided camera overlay (Holland's idea, from the spike)
1. **Overlay:** a full-screen `getUserMedia` view showing an ASA/Jeppesen-shaped grid outline for the *expected half*: "Spread 3 · LEFT page", then "RIGHT page".
2. **Live gates before the shutter unlocks:** all 4 page corners found, a sharpness threshold met, low glare, and no finger over the grid. Encourage shooting flat on a table.
3. **Auto-rotate** from the printed header text, so the student never rotates by hand. The 0/90/180/270 options become a fallback only.
4. **Auto-pair** left and right by capture order, then check that the row counts match.
5. **Year prompt** at the first row and at every month wrap.
6. **Review screen:** each cell shown next to its image crop. Amber cells block confirm. Signature areas render as "signed" and never as text. ID numbers are blurred in the crops.
