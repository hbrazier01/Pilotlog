/**
 * backfill.mjs — create students + midnight-legacy identities for existing wallet-keyed rows
 * and fill the nullable student_id columns (scoping doc rev 2, §2.4 M2).
 *
 * Rules:
 * - Never deletes or rewrites wallet_address. Only sets student_id where it IS NULL.
 * - One random st_ id per canonical mn_addr_… wallet. If an identity for that address already
 *   exists (any wallet type), its student is reused — so re-runs are idempotent.
 * - Non-canonical values (e.g. AIR-314 mn_shield-cpk_… rows) are NOT guessed: left unassigned
 *   and reported as counts only.
 * - Backfilled identities are type 'midnight-legacy' with verified_at NULL, because the old
 *   /wallet/connect trusted the client. A later verified wallet sign-in claims/upgrades them.
 * - Dry run uses a READ ONLY transaction, so Postgres itself rejects any write.
 * - Reports contain counts only — no addresses, names, or record contents.
 */
import { newStudentId, isCanonicalWalletAddress, walletNetwork, WALLET_IDENTITY_TYPES } from "./ids.mjs";
import { WALLET_KEYED_TABLES, accountsV2SchemaPresent } from "./schemaV2.mjs";

async function tableCounts(client, { withStudentId }) {
  const out = {};
  for (const t of WALLET_KEYED_TABLES) {
    const sql = withStudentId
      ? `SELECT count(*)::int AS total, count(student_id)::int AS assigned FROM ${t}`
      : `SELECT count(*)::int AS total, 0 AS assigned FROM ${t}`;
    const { rows } = await client.query(sql);
    out[t] = { total: rows[0].total, assigned: rows[0].assigned, unassigned: rows[0].total - rows[0].assigned };
  }
  return out;
}

async function pendingWallets(client, { withStudentId }) {
  const where = withStudentId ? "WHERE student_id IS NULL AND wallet_address IS NOT NULL" : "WHERE wallet_address IS NOT NULL";
  const union = WALLET_KEYED_TABLES.map((t) => `SELECT wallet_address FROM ${t} ${where}`).join(" UNION ");
  const { rows } = await client.query(`SELECT DISTINCT wallet_address FROM (${union}) w`);
  return rows.map((r) => r.wallet_address);
}

async function findStudentForWallet(client, address) {
  const { rows } = await client.query(
    "SELECT student_id FROM identities WHERE subject = $1 AND type = ANY($2) LIMIT 1",
    [address, WALLET_IDENTITY_TYPES]
  );
  return rows[0]?.student_id ?? null;
}

/**
 * Plan (dry run) or apply the backfill.
 * @param {import('pg').Pool} pool
 * @param {{apply?: boolean, log?: (s:string)=>void}} opts
 */
export async function runBackfill(pool, { apply = false, log = () => {} } = {}) {
  const mode = apply ? "apply" : "dry-run";
  const client = await pool.connect();
  try {
    const schemaPresent = await accountsV2SchemaPresent(client);
    if (apply && !schemaPresent) {
      throw new Error("accounts v2 schema not present; run migrations with PILOTLOG_ACCOUNTS_V2=true first");
    }

    // ── Plan, inside a READ ONLY transaction ────────────────────────────────
    await client.query("BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY");
    const before = await tableCounts(client, { withStudentId: schemaPresent });
    const wallets = await pendingWallets(client, { withStudentId: schemaPresent });
    const canonical = wallets.filter(isCanonicalWalletAddress);
    const nonCanonical = wallets.length - canonical.length;
    let existingStudent = 0;
    if (schemaPresent) {
      for (const w of canonical) if (await findStudentForWallet(client, w)) existingStudent++;
    }
    let nonCanonicalRows = 0;
    for (const t of WALLET_KEYED_TABLES) {
      const cond = schemaPresent ? "AND student_id IS NULL" : "";
      const { rows } = await client.query(
        `SELECT wallet_address FROM ${t} WHERE wallet_address IS NOT NULL ${cond}`
      );
      nonCanonicalRows += rows.filter((r) => !isCanonicalWalletAddress(r.wallet_address)).length;
    }
    await client.query("COMMIT");

    const plan = {
      mode,
      schemaPresent,
      walletsPending: wallets.length,
      canonicalWallets: canonical.length,
      studentsToCreate: canonical.length - existingStudent,
      walletsWithExistingStudent: existingStudent,
      nonCanonicalWalletsSkipped: nonCanonical,
      nonCanonicalRowsSkipped: nonCanonicalRows,
      before,
    };
    if (!apply) return plan;

    // ── Apply: one transaction per wallet ───────────────────────────────────
    let studentsCreated = 0, identitiesCreated = 0;
    const rowsAssigned = Object.fromEntries(WALLET_KEYED_TABLES.map((t) => [t, 0]));
    for (const address of canonical) {
      await client.query("BEGIN");
      try {
        // Serialize per address so concurrent runs can't create two students for one wallet.
        await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", ["pilotlog-backfill:" + address]);
        let studentId = await findStudentForWallet(client, address);
        if (!studentId) {
          studentId = newStudentId();
          await client.query("INSERT INTO students (id, status) VALUES ($1, 'active')", [studentId]);
          await client.query(
            `INSERT INTO identities (student_id, type, subject, network, verified_at, metadata)
             VALUES ($1, 'midnight-legacy', $2, $3, NULL, $4)`,
            [studentId, address, walletNetwork(address), JSON.stringify({ source: "backfill-students" })]
          );
          studentsCreated++; identitiesCreated++;
        }
        for (const t of WALLET_KEYED_TABLES) {
          const r = await client.query(
            `UPDATE ${t} SET student_id = $1 WHERE wallet_address = $2 AND student_id IS NULL`,
            [studentId, address]
          );
          rowsAssigned[t] += r.rowCount;
        }
        await client.query("COMMIT");
      } catch (err) {
        await client.query("ROLLBACK").catch(() => {});
        throw err;
      }
    }

    const after = await tableCounts(client, { withStudentId: true });
    const countsEqual = WALLET_KEYED_TABLES.every((t) => after[t].total === before[t].total);
    if (!countsEqual) throw new Error("row counts changed during backfill; investigate before re-running");
    const result = { ...plan, studentsCreated, identitiesCreated, rowsAssigned, after, countsEqual };
    await client.query(
      `INSERT INTO accounts_migration_log (kind, name, mode, detail) VALUES ('backfill', 'backfill-students', 'apply', $1)`,
      [JSON.stringify({ studentsCreated, identitiesCreated, rowsAssigned, nonCanonicalWalletsSkipped: nonCanonical, countsEqual })]
    );
    log(`[backfill] applied: ${studentsCreated} students, ${identitiesCreated} identities`);
    return result;
  } finally {
    client.release();
  }
}
