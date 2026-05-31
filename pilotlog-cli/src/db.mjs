/**
 * db.mjs — Postgres pool and schema migration for PilotLog
 *
 * Activated when DATABASE_URL env var is set (Railway / production).
 * Falls back gracefully to JSON-file persistence when DATABASE_URL is absent.
 */

import pg from "pg";
const { Pool } = pg;

let pool = null;

/** Returns the pg Pool if DATABASE_URL is configured, otherwise null. */
export function getPool() {
  if (!pool && process.env.DATABASE_URL) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.DATABASE_URL.includes("localhost")
        ? false
        : { rejectUnauthorized: false },
    });
    pool.on("error", (err) => {
      console.error("[db] pool error:", err.message);
    });
  }
  return pool;
}

/**
 * Run schema migrations idempotently.
 * Call once at startup before the Express server begins serving requests.
 */
export async function migrate() {
  const p = getPool();
  if (!p) {
    console.log("[db] DATABASE_URL not set — using JSON file persistence");
    return;
  }
  console.log("[db] Running schema migrations...");
  await p.query(`
    CREATE TABLE IF NOT EXISTS pilot_profiles (
      id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      wallet_address  TEXT        UNIQUE NOT NULL,
      full_name       TEXT        DEFAULT '',
      training_phase  TEXT,
      profile_json    JSONB,
      identity_json   JSONB,
      created_at      TIMESTAMPTZ DEFAULT NOW(),
      updated_at      TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS flights (
      id                  TEXT        PRIMARY KEY,
      wallet_address      TEXT        NOT NULL,
      aircraft_ident      TEXT,
      date                TEXT,
      total_time          NUMERIC     DEFAULT 0,
      pic_time            NUMERIC     DEFAULT 0,
      xc_time             NUMERIC     DEFAULT 0,
      night_time          NUMERIC     DEFAULT 0,
      landings_day        INT         DEFAULT 0,
      landings_night      INT         DEFAULT 0,
      route_from          TEXT,
      route_to            TEXT,
      remarks             TEXT,
      training_tags       TEXT[]      DEFAULT '{}',
      verification_status TEXT        DEFAULT 'submitted',
      entry_json          JSONB       NOT NULL,
      created_at          TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS flights_wallet_idx ON flights (wallet_address);
    CREATE INDEX IF NOT EXISTS flights_date_idx   ON flights (wallet_address, date DESC);

    CREATE TABLE IF NOT EXISTS aircraft (
      id             UUID  PRIMARY KEY DEFAULT gen_random_uuid(),
      wallet_address TEXT  NOT NULL,
      ident          TEXT  NOT NULL,
      type           TEXT,
      created_at     TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE (wallet_address, ident)
    );

    CREATE TABLE IF NOT EXISTS milestones (
      id               UUID  PRIMARY KEY DEFAULT gen_random_uuid(),
      wallet_address   TEXT  NOT NULL,
      milestone_key    TEXT  NOT NULL,
      unlocked_at      TIMESTAMPTZ DEFAULT NOW(),
      source_flight_id TEXT,
      UNIQUE (wallet_address, milestone_key)
    );
  `);
  console.log("[db] Migrations complete.");
}

// ─── Wallet-scoped read helpers ───────────────────────────────────────────────

/** Load all flights for a given wallet address. Returns [] if no pg. */
export async function pgReadEntries(walletAddress, legacyAddress) {
  const p = getPool();
  if (!p || !walletAddress) return null; // null = fall through to JSON
  const { rows } = await p.query(
    "SELECT entry_json FROM flights WHERE wallet_address = $1 ORDER BY date DESC, created_at DESC",
    [walletAddress]
  );
  console.log(`[db] pgReadEntries: ${rows.length} flights for wallet ${walletAddress}`);
  // AIR-314: dual-query legacy recovery — also load rows saved under old shielded CPK identity.
  // These were written before the canonical identity fix. We merge them in without re-saving
  // so legacy data survives immediately after deployment. A separate migration script handles
  // the permanent remap.
  if (legacyAddress && legacyAddress !== walletAddress) {
    const { rows: legacyRows } = await p.query(
      "SELECT entry_json FROM flights WHERE wallet_address = $1 ORDER BY date DESC, created_at DESC",
      [legacyAddress]
    );
    if (legacyRows.length > 0) {
      console.log(`[db] pgReadEntries: ${legacyRows.length} legacy flights recovered from ${legacyAddress}`);
      const existingIds = new Set(rows.map((r) => r.entry_json?.id));
      const newLegacy = legacyRows.filter((r) => !existingIds.has(r.entry_json?.id));
      rows.push(...newLegacy);
    }
  }
  return rows.map((r) => r.entry_json);
}

/** Persist a single flight entry scoped to walletAddress. */
export async function pgSaveEntry(entry, walletAddress) {
  const p = getPool();
  if (!p) return false;
  console.log(`[db] pgSaveEntry: persisting flight ${entry.id} for wallet ${walletAddress}`);
  await p.query(
    `INSERT INTO flights
       (id, wallet_address, aircraft_ident, date, total_time, pic_time, xc_time,
        night_time, landings_day, landings_night, route_from, route_to, remarks,
        training_tags, verification_status, entry_json)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
     ON CONFLICT (id) DO UPDATE
       SET entry_json          = EXCLUDED.entry_json,
           verification_status = EXCLUDED.verification_status,
           aircraft_ident      = EXCLUDED.aircraft_ident`,
    [
      entry.id,
      walletAddress,
      entry.aircraftId || entry.aircraftIdent || null,
      entry.date || null,
      Number(entry.totalTime || entry.total || 0),
      Number(entry.pic || 0),
      Number(entry.xc || 0),
      Number(entry.night || 0),
      Number(entry.dayLandings || 0),
      Number(entry.nightLandings || 0),
      entry.from || null,
      entry.to || null,
      entry.remarks || null,
      Array.isArray(entry.trainingTags) ? entry.trainingTags : [],
      entry.anchorStatus || entry.anchor?.status || "submitted",
      JSON.stringify(entry),
    ]
  );
  return true;
}

/** Update txHash for a flight entry after blockchain confirmation. */
export async function pgUpdateEntryTxHash(id, txHash, walletAddress) {
  const p = getPool();
  if (!p) return false;
  const { rows } = await p.query(
    "SELECT entry_json FROM flights WHERE id = $1 AND wallet_address = $2",
    [id, walletAddress]
  );
  if (!rows.length) return false;
  const old = rows[0].entry_json;
  const updated = {
    ...old,
    anchored: true,
    anchorStatus: "anchored",
    anchorTx: txHash,
    anchor: { ...(old.anchor || {}), txHash, status: "anchored" },
  };
  const result = await p.query(
    "UPDATE flights SET entry_json = $1, verification_status = 'anchored' WHERE id = $2 AND wallet_address = $3",
    [JSON.stringify(updated), id, walletAddress]
  );
  if (result.rowCount === 0) return false; // wallet mismatch guard
  console.log(`[db] pgUpdateEntryTxHash: updated flight ${id} for wallet ${walletAddress}`);
  return updated;
}

/** Load pilot profile JSON for a wallet. Returns null if not found. */
export async function pgReadProfile(walletAddress) {
  const p = getPool();
  if (!p || !walletAddress) return null;
  const { rows } = await p.query(
    "SELECT profile_json FROM pilot_profiles WHERE wallet_address = $1",
    [walletAddress]
  );
  return rows.length ? rows[0].profile_json : null;
}

/** Upsert pilot profile scoped to walletAddress. */
export async function pgSaveProfile(walletAddress, profile) {
  const p = getPool();
  if (!p) return false;
  await p.query(
    `INSERT INTO pilot_profiles (wallet_address, full_name, training_phase, profile_json)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (wallet_address) DO UPDATE
       SET full_name      = EXCLUDED.full_name,
           training_phase = EXCLUDED.training_phase,
           profile_json   = EXCLUDED.profile_json,
           updated_at     = NOW()`,
    [
      walletAddress,
      profile?.pilot?.fullName || "",
      profile?.pilotPhase || null,
      JSON.stringify(profile),
    ]
  );
  return true;
}

/** Load identity JSON for a wallet. Returns null if not found. */
export async function pgReadIdentity(walletAddress) {
  const p = getPool();
  if (!p || !walletAddress) return null;
  const { rows } = await p.query(
    "SELECT identity_json FROM pilot_profiles WHERE wallet_address = $1",
    [walletAddress]
  );
  return rows.length ? rows[0].identity_json : null;
}

/** Upsert identity JSON scoped to walletAddress. */
export async function pgSaveIdentity(walletAddress, identity) {
  const p = getPool();
  if (!p) return false;
  await p.query(
    `INSERT INTO pilot_profiles (wallet_address, identity_json)
     VALUES ($1, $2)
     ON CONFLICT (wallet_address) DO UPDATE
       SET identity_json = EXCLUDED.identity_json,
           updated_at    = NOW()`,
    [walletAddress, JSON.stringify(identity)]
  );
  return true;
}

/** Load all aircraft for a given wallet address. Returns [] if none. */
export async function pgReadAircraft(walletAddress) {
  const p = getPool();
  if (!p || !walletAddress) return null; // null = fall through to JSON
  const { rows } = await p.query(
    "SELECT id, ident, type, created_at FROM aircraft WHERE wallet_address = $1 ORDER BY created_at ASC",
    [walletAddress]
  );
  console.log(`[db] pgReadAircraft: ${rows.length} aircraft for wallet ${walletAddress}`);
  return rows.map((r) => ({ id: r.id, ident: r.ident, type: r.type || "" }));
}

/** Upsert an aircraft record scoped to walletAddress. */
export async function pgSaveAircraft(aircraft, walletAddress) {
  const p = getPool();
  if (!p) return false;
  await p.query(
    `INSERT INTO aircraft (wallet_address, ident, type)
     VALUES ($1, $2, $3)
     ON CONFLICT (wallet_address, ident) DO UPDATE
       SET type = EXCLUDED.type`,
    [walletAddress, aircraft.ident || "", aircraft.type || ""]
  );
  return true;
}
