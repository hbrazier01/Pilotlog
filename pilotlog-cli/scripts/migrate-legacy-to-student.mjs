#!/usr/bin/env node
/**
 * One-time, idempotent: assign the legacy shared files (settings.json, checkride.json, tracks.json,
 * entries.json in DATA_DIR) to the student whose wallet is LEGACY_OWNER_WALLET.
 * Copies only kinds the student doesn't already have; never modifies or deletes the legacy files.
 * The same migration also runs automatically the first time that wallet signs in.
 *
 *   LEGACY_OWNER_WALLET=mn_addr_preprod1… node pilotlog-cli/scripts/migrate-legacy-to-student.mjs [--dry-run]
 * Uses DATABASE_URL (Postgres student_docs) when set, else DATA_DIR/students/<id>/ (PILOTLOG_HOME or ./data).
 */
import path from 'node:path';
import { getPool, migrate } from '../src/db.mjs';
import { createStudentStore } from '../src/lib/accounts/studentStore.mjs';
import { migrateLegacyData, legacyOwnerWallet } from '../src/lib/accounts/legacyMigration.mjs';
import { studentIdFor, decodeUnshieldedAddress } from '../src/lib/accounts/identity.mjs';

const dryRun = process.argv.includes('--dry-run');
const wallet = legacyOwnerWallet();
if (!wallet) { console.error('Set LEGACY_OWNER_WALLET to the owner\'s canonical mn_addr_preprod1… address.'); process.exit(2); }
await decodeUnshieldedAddress(wallet);
const dataDir = process.env.PILOTLOG_HOME || process.env.PILOTLOG_DIR || path.resolve(process.cwd(), 'data');
await migrate();
const store = createStudentStore({ dataDir, pool: getPool() });
const studentId = studentIdFor(wallet);
if (!dryRun) await store.ensureStudent(studentId, { walletAddress: wallet, provider: 'midnight-1am' });
const r = await migrateLegacyData({ dataDir, store, studentId, walletAddress: wallet, dryRun });
console.log(JSON.stringify({ backend: store.backend, dataDir, studentId, ...r }, null, 2));
await getPool()?.end();
