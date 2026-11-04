/**
 * schema.mjs — paper logbook import drafts (IE-4 lean v1). Additive DDL only, idempotent,
 * runs only when PILOTLOG_ACCOUNTS_V2 and PILOTLOG_PAPER_IMPORT are both on.
 *
 * flights: wallet_address is relaxed to NULLable (v2 students may have no wallet) and three nullable
 * provenance columns are added. Existing wallet-keyed readers filter by wallet_address, so imported
 * rows (wallet_address NULL, student_id set) never appear in legacy views.
 */
export const PAPER_IMPORT_MIGRATION = "ie4_001_paper_import";
export const PAGE_TYPES = Object.freeze(["flight_left", "flight_right", "flight_full", "ground", "endorsements", "remarks"]);

export const PAPER_IMPORT_SQL = `
CREATE TABLE IF NOT EXISTS import_batches (
  id          TEXT        PRIMARY KEY,
  student_id  TEXT        NOT NULL REFERENCES students(id),
  status      TEXT        NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'confirmed', 'abandoned')),
  extractor   TEXT        NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS import_batches_student_idx ON import_batches (student_id);

CREATE TABLE IF NOT EXISTS import_pages (
  id            TEXT        PRIMARY KEY,
  batch_id      TEXT        NOT NULL REFERENCES import_batches(id) ON DELETE CASCADE,
  student_id    TEXT        NOT NULL REFERENCES students(id),
  page_type     TEXT        NOT NULL CHECK (page_type IN (${PAGE_TYPES.map((t) => `'${t}'`).join(", ")})),
  spread_index  INT,
  image_key     TEXT        NOT NULL,
  image_sha256  TEXT        NOT NULL,
  content_type  TEXT        NOT NULL,
  rotation_deg  INT         NOT NULL DEFAULT 0 CHECK (rotation_deg IN (0, 90, 180, 270)),
  footer        JSONB       NOT NULL DEFAULT '{}',
  status        TEXT        NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'extracted', 'confirmed')),
  confirmed_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS import_pages_batch_idx ON import_pages (batch_id);

CREATE TABLE IF NOT EXISTS import_rows (
  page_id      TEXT        NOT NULL REFERENCES import_pages(id) ON DELETE CASCADE,
  row_index    INT         NOT NULL CHECK (row_index >= 0 AND row_index < 64),
  cells        JSONB       NOT NULL,                -- {field: {v, c: high|med|low, reason?, reviewed?, edited?}}
  flight_id    TEXT,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (page_id, row_index)
);

ALTER TABLE flights ALTER COLUMN wallet_address DROP NOT NULL;
ALTER TABLE flights ADD COLUMN IF NOT EXISTS source                       TEXT;
ALTER TABLE flights ADD COLUMN IF NOT EXISTS imported_by_student_verified BOOLEAN;
ALTER TABLE flights ADD COLUMN IF NOT EXISTS import_page_id               TEXT REFERENCES import_pages(id);
CREATE INDEX IF NOT EXISTS flights_student_source_idx ON flights (student_id, source) WHERE student_id IS NOT NULL;
`;

export async function migratePaperImport(pool) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(727004)");
    await client.query(PAPER_IMPORT_SQL);
    await client.query("COMMIT");
  } catch (err) { await client.query("ROLLBACK").catch(() => {}); throw err; } finally { client.release(); }
}
