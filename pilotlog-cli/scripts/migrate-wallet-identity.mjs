/**
 * migrate-wallet-identity.mjs
 *
 * AIR-314: Migration utility for legacy flights saved under mn_shield-cpk identity.
 *
 * Before the canonical identity fix, flights were persisted with:
 *   wallet_address = mn_shield-cpk_preprod...
 *
 * After the fix they use:
 *   wallet_address = mn_addr_preprod...
 *
 * This script remaps legacy rows to the canonical address.
 * It does NOT delete legacy rows until --confirm is passed.
 *
 * Usage:
 *   node scripts/migrate-wallet-identity.mjs --dry-run
 *   node scripts/migrate-wallet-identity.mjs --canonical mn_addr_preprod_XXX --legacy mn_shield-cpk_preprod_YYY
 *   node scripts/migrate-wallet-identity.mjs --canonical mn_addr_preprod_XXX --legacy mn_shield-cpk_preprod_YYY --confirm
 */

import pg from "pg";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const args = Object.fromEntries(
  process.argv.slice(2).flatMap((a, i, arr) =>
    a.startsWith("--") ? [[a.slice(2), arr[i + 1] && !arr[i + 1].startsWith("--") ? arr[i + 1] : true]] : []
  )
);

const isDryRun = args["dry-run"] === true || !args["confirm"];
const canonicalAddress = args["canonical"];
const legacyAddress = args["legacy"];

if (!canonicalAddress || !legacyAddress) {
  console.error("Usage: node migrate-wallet-identity.mjs --canonical <mn_addr_...> --legacy <mn_shield-cpk_...> [--confirm]");
  process.exit(1);
}

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL env var required");
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function run() {
  const client = await pool.connect();
  try {
    // 1. Find legacy flights not already present under canonical address
    const { rows: legacyFlights } = await client.query(
      `SELECT id, aircraft_ident, date, entry_json
       FROM flights
       WHERE wallet_address = $1
       ORDER BY date DESC, created_at DESC`,
      [legacyAddress]
    );
    console.log(`Found ${legacyFlights.length} flights under legacy address ${legacyAddress}`);

    if (legacyFlights.length === 0) {
      console.log("Nothing to migrate.");
      return;
    }

    // 2. Check which IDs already exist under canonical address
    const legacyIds = legacyFlights.map((r) => r.id);
    const { rows: existing } = await client.query(
      `SELECT id FROM flights WHERE wallet_address = $1 AND id = ANY($2)`,
      [canonicalAddress, legacyIds]
    );
    const existingIds = new Set(existing.map((r) => r.id));

    const toMigrate = legacyFlights.filter((r) => !existingIds.has(r.id));
    const alreadyPresent = legacyFlights.filter((r) => existingIds.has(r.id));

    console.log(`Already present under canonical: ${alreadyPresent.length}`);
    console.log(`To migrate: ${toMigrate.length}`);

    if (isDryRun) {
      console.log("[DRY RUN] Would migrate the following flight IDs:");
      toMigrate.forEach((r) => console.log(`  ${r.id}  ${r.date}  ${r.aircraft_ident}`));
      console.log("[DRY RUN] Pass --confirm to apply.");
      return;
    }

    // 3. Insert copies under canonical address
    for (const row of toMigrate) {
      const entry = row.entry_json;
      // Update pilotId and walletAddress fields inside entry_json to canonical
      const updatedEntry = {
        ...entry,
        pilotId: canonicalAddress,
        anchor: entry.anchor ? { ...entry.anchor, walletAddress: canonicalAddress } : entry.anchor,
      };
      await client.query(
        `INSERT INTO flights
           (id, wallet_address, aircraft_ident, date, total_time, pic_time, xc_time,
            night_time, landings_day, landings_night, route_from, route_to, remarks,
            training_tags, verification_status, entry_json)
         SELECT id, $2, aircraft_ident, date, total_time, pic_time, xc_time,
                night_time, landings_day, landings_night, route_from, route_to, remarks,
                training_tags, verification_status, $3
         FROM flights
         WHERE id = $1 AND wallet_address = $4
         ON CONFLICT (id) DO NOTHING`,
        [row.id, canonicalAddress, JSON.stringify(updatedEntry), legacyAddress]
      );
      console.log(`Migrated flight ${row.id} (${row.date} ${row.aircraft_ident})`);
    }

    console.log(`Migration complete. ${toMigrate.length} flights remapped to ${canonicalAddress}`);
    console.log(`Legacy rows under ${legacyAddress} preserved (not deleted).`);
    console.log("Once verified, you may delete legacy rows manually with:");
    console.log(`  DELETE FROM flights WHERE wallet_address = '${legacyAddress}';`);
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch((err) => {
  console.error("Migration error:", err.message);
  process.exit(1);
});
