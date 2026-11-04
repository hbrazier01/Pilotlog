/**
 * schemaV2.mjs — additive Postgres DDL for accounts v2 (scoping doc rev 2, PR-1).
 *
 * - Only CREATE ... IF NOT EXISTS / ADD COLUMN IF NOT EXISTS. Nothing is dropped or rewritten.
 * - Runs only when PILOTLOG_ACCOUNTS_V2 is on (see db.mjs migrate()) or when called explicitly.
 * - Idempotent and safe to run concurrently (transaction-scoped advisory lock).
 * - Existing wallet-keyed tables get a NULLABLE student_id; nothing reads or writes it yet.
 * - Compatible with PR #11: if its `students(wallet_address UNIQUE NOT NULL, provider…)` table
 *   already exists, missing v2 columns are added and wallet_address is relaxed to NULLable.
 */
import { IDENTITY_TYPES, WALLET_IDENTITY_TYPES } from "./ids.mjs";

export const ACCOUNTS_V2_MIGRATION = "accounts_v2_001_students_identities";
const LOCK_KEY = 727001; // arbitrary constant for pg_advisory_xact_lock

const q = (s) => `'${s.replace(/'/g, "''")}'`;
const TYPE_LIST = IDENTITY_TYPES.map(q).join(", ");
const WALLET_LIST = WALLET_IDENTITY_TYPES.map(q).join(", ");

/** Existing wallet-keyed tables that get a nullable student_id. */
export const WALLET_KEYED_TABLES = Object.freeze(["pilot_profiles", "flights", "aircraft", "milestones"]);

export const ACCOUNTS_V2_SQL = `
CREATE TABLE IF NOT EXISTS accounts_migration_log (
  id         BIGSERIAL   PRIMARY KEY,
  at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  kind       TEXT        NOT NULL CHECK (kind IN ('ddl', 'backfill')),
  name       TEXT        NOT NULL,
  mode       TEXT,
  detail     JSONB       NOT NULL DEFAULT '{}'
);
CREATE UNIQUE INDEX IF NOT EXISTS accounts_migration_log_ddl_uq
  ON accounts_migration_log (name) WHERE kind = 'ddl';

CREATE TABLE IF NOT EXISTS students (
  id            TEXT        PRIMARY KEY CHECK (id ~ '^st_[0-9a-f]{24}$'),
  display_name  TEXT,
  status        TEXT        NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'merged', 'deleted')),
  merged_into   TEXT        REFERENCES students(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- PR #11 compatibility: add v2 columns if its students table already exists.
ALTER TABLE students ADD COLUMN IF NOT EXISTS display_name TEXT;
ALTER TABLE students ADD COLUMN IF NOT EXISTS status       TEXT NOT NULL DEFAULT 'active';
ALTER TABLE students ADD COLUMN IF NOT EXISTS merged_into  TEXT REFERENCES students(id);
ALTER TABLE students ADD COLUMN IF NOT EXISTS created_at   TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE students ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now();
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = current_schema() AND table_name = 'students'
               AND column_name = 'wallet_address' AND is_nullable = 'NO') THEN
    ALTER TABLE students ALTER COLUMN wallet_address DROP NOT NULL;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS identities (
  id            BIGSERIAL   PRIMARY KEY,
  student_id    TEXT        NOT NULL REFERENCES students(id),
  type          TEXT        NOT NULL CHECK (type IN (${TYPE_LIST})),
  subject       TEXT        NOT NULL CHECK (length(subject) BETWEEN 1 AND 512),
  network       TEXT,
  verified_at   TIMESTAMPTZ,
  last_used_at  TIMESTAMPTZ,
  metadata      JSONB       NOT NULL DEFAULT '{}',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT identities_type_subject_uq UNIQUE (type, subject)
);
-- One wallet address belongs to one student regardless of which wallet app proved it.
CREATE UNIQUE INDEX IF NOT EXISTS identities_wallet_subject_uq
  ON identities (subject) WHERE type IN (${WALLET_LIST});
CREATE INDEX IF NOT EXISTS identities_student_idx ON identities (student_id);

CREATE TABLE IF NOT EXISTS webauthn_credentials (
  identity_id   BIGINT      PRIMARY KEY REFERENCES identities(id) ON DELETE CASCADE,
  public_key    BYTEA       NOT NULL,
  sign_count    BIGINT      NOT NULL DEFAULT 0,
  transports    TEXT[],
  aaguid        TEXT,
  backed_up     BOOLEAN,
  nickname      TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS auth_audit (
  id                    BIGSERIAL   PRIMARY KEY,
  at                    TIMESTAMPTZ NOT NULL DEFAULT now(),
  student_id            TEXT,
  actor_student_id      TEXT,
  event                 TEXT        NOT NULL,
  identity_type         TEXT,
  identity_subject_hash TEXT,
  detail                JSONB       NOT NULL DEFAULT '{}',
  ip_hash               TEXT,
  ua                    TEXT
);
CREATE INDEX IF NOT EXISTS auth_audit_student_idx ON auth_audit (student_id, at DESC);

${WALLET_KEYED_TABLES.map((t) => `ALTER TABLE ${t} ADD COLUMN IF NOT EXISTS student_id TEXT REFERENCES students(id);
CREATE INDEX IF NOT EXISTS ${t}_student_idx ON ${t} (student_id);`).join("\n")}
`;

/**
 * Apply the accounts v2 DDL using the given pg Pool/Client. The base wallet-keyed tables
 * must already exist (db.mjs migrate() creates them first).
 * @returns {Promise<{applied: boolean}>} applied=false if it had already been recorded.
 */
export async function migrateAccountsV2(db) {
  if (!db) throw new Error("migrateAccountsV2 requires a pg Pool or Client");
  const isPool = typeof db.totalCount === "number"; // pg.Pool; a pg.Client/PoolClient is used as-is
  const client = isPool ? await db.connect() : db;
  const release = client !== db;
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock($1)", [LOCK_KEY]);
    await client.query(ACCOUNTS_V2_SQL);
    const r = await client.query(
      `INSERT INTO accounts_migration_log (kind, name, mode, detail)
       VALUES ('ddl', $1, 'apply', '{}') ON CONFLICT (name) WHERE kind = 'ddl' DO NOTHING`,
      [ACCOUNTS_V2_MIGRATION]
    );
    await client.query("COMMIT");
    return { applied: r.rowCount === 1 };
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    if (release) client.release();
  }
}

/** True if the v2 tables exist in the current schema (read-only check). */
export async function accountsV2SchemaPresent(db) {
  const { rows } = await db.query(
    "SELECT to_regclass('students') IS NOT NULL AND to_regclass('identities') IS NOT NULL AS present"
  );
  return rows[0].present === true;
}
