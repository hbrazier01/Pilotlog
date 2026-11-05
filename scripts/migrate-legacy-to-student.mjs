#!/usr/bin/env node
/**
 * Hand the legacy single-user data to one accounts-v2 student. DRY RUN unless --apply is given.
 *
 *   DATABASE_URL=… LEGACY_OWNER_WALLET=mn_addr_… node scripts/migrate-legacy-to-student.mjs            # dry run
 *   DATABASE_URL=… node scripts/migrate-legacy-to-student.mjs --email owner@example.com --apply
 *   DATABASE_URL=… node scripts/migrate-legacy-to-student.mjs --student st_… [--data-dir ./data] [--apply]
 *
 * Requires the accounts v2 schema (run the app once with PILOTLOG_ACCOUNTS_V2=true, or migrateAccountsV2).
 * Never deletes or edits legacy files/rows. Prints a JSON report; exit 1 on error. See docs/student-accounts.md.
 */
import path from "node:path";
import pg from "pg";
import { accountsV2SchemaPresent } from "../pilotlog-cli/src/lib/accounts/schemaV2.mjs";
import { createStudentStore } from "../pilotlog-cli/src/lib/accounts/studentStore.mjs";
import { resolveOwnerStudent, migrateLegacyData } from "../pilotlog-cli/src/lib/accounts/legacyMigration.mjs";

const args = process.argv.slice(2);
const opt = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };
const apply = args.includes("--apply");
const dataDir = path.resolve(opt("--data-dir") || process.env.PILOTLOG_HOME || process.env.PILOTLOG_DIR || "data");
const email = opt("--email"), studentId = opt("--student");
const wallet = opt("--wallet") || (email || studentId ? null : (process.env.LEGACY_OWNER_WALLET || "").trim() || null);

if (!process.env.DATABASE_URL) { console.error("DATABASE_URL is required (accounts v2 is Postgres-only)."); process.exit(1); }
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
try {
  if (!(await accountsV2SchemaPresent(pool)) || !(await pool.query("SELECT to_regclass('student_docs') IS NOT NULL AS ok")).rows[0].ok)
    throw new Error("accounts v2 schema (incl. student_docs) not present — start the app once with PILOTLOG_ACCOUNTS_V2=true first");
  const id = await resolveOwnerStudent(pool, { wallet, email, studentId });
  const report = await migrateLegacyData({ pool, store: createStudentStore({ pool }), dataDir, studentId: id, ownerWallet: wallet, apply });
  console.log(JSON.stringify({ ...report, dataDir }, null, 2));
  if (!apply) console.log("\nDry run only. Re-run with --apply to copy.");
} catch (err) {
  console.error(`migrate-legacy-to-student: ${err.message}`); process.exitCode = 1;
} finally { await pool.end(); }
