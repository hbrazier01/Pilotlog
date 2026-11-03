#!/usr/bin/env node
/**
 * backfill-students.mjs — accounts v2 backfill (wallet-keyed rows → students + identities).
 *
 *   node pilotlog-cli/scripts/backfill-students.mjs            # dry run (default): counts only, writes nothing
 *   node pilotlog-cli/scripts/backfill-students.mjs --dry-run  # same
 *   node pilotlog-cli/scripts/backfill-students.mjs --apply    # write (requires PILOTLOG_ACCOUNTS_V2=true schema)
 *
 * Needs DATABASE_URL. In JSON-file mode (no DATABASE_URL) there are no wallet-keyed SQL tables,
 * so it exits 0 without doing anything. Output is counts only (no addresses or record contents).
 * Take a pg_dump before --apply on any real database.
 */
import pg from "pg";
import { runBackfill } from "../src/lib/accounts/backfill.mjs";

const args = new Set(process.argv.slice(2));
const unknown = [...args].filter((a) => !["--apply", "--dry-run", "--json"].includes(a));
if (unknown.length || (args.has("--apply") && args.has("--dry-run"))) {
  console.error("Usage: backfill-students.mjs [--dry-run | --apply] [--json]");
  process.exit(2);
}
const apply = args.has("--apply");

const url = process.env.DATABASE_URL;
if (!url) {
  console.log("[backfill] DATABASE_URL not set (JSON-file mode) — nothing to backfill.");
  process.exit(0);
}

const pool = new pg.Pool({
  connectionString: url,
  ssl: /localhost|127\.0\.0\.1/.test(url) ? false : { rejectUnauthorized: false },
  max: 1,
});
try {
  const result = await runBackfill(pool, { apply, log: (s) => console.log(s) });
  if (args.has("--json")) console.log(JSON.stringify(result));
  else {
    console.log(`[backfill] mode=${result.mode} schemaPresent=${result.schemaPresent}`);
    console.log(`[backfill] wallets pending=${result.walletsPending} canonical=${result.canonicalWallets} ` +
      `studentsToCreate=${result.studentsToCreate} existingStudent=${result.walletsWithExistingStudent} ` +
      `nonCanonicalSkipped=${result.nonCanonicalWalletsSkipped} (rows=${result.nonCanonicalRowsSkipped})`);
    for (const [t, c] of Object.entries(result.before)) {
      const a = result.after?.[t];
      console.log(`[backfill]   ${t}: total=${c.total} unassigned(before)=${c.unassigned}` +
        (a ? ` unassigned(after)=${a.unassigned} assignedNow=${result.rowsAssigned[t]}` : ""));
    }
    if (!apply) console.log("[backfill] dry run — no changes written. Re-run with --apply to write.");
  }
} catch (err) {
  console.error(`[backfill] failed: ${err.message}`);
  process.exitCode = 1;
} finally {
  await pool.end();
}
