# Accounts v2 — students + identities (PR-0/PR-1)

Scope: the first two slices of the wallet-optional sign-up plan (scoping doc rev 2, §2 and §7.3).
Schema and backfill only. **No route, session, or UI uses this yet.** Everything is behind
`PILOTLOG_ACCOUNTS_V2` (default off).

## What it adds (Postgres only, additive)
| Object | Purpose |
|---|---|
| `students` | `id` = `st_` + 24 hex from `crypto.randomBytes(12)` (never derived from a credential), `display_name`, `status` (active/merged/deleted), `merged_into`, timestamps |
| `identities` | `student_id` FK, `type` ∈ email, passkey, midnight-1am, midnight-lace, midnight-passport (future slot), midnight-legacy (backfilled, unverified); `subject`, `network`, `verified_at`, `metadata`; `UNIQUE(type, subject)` plus one wallet address ↔ one student across all wallet types |
| `webauthn_credentials` | Passkey public keys (used by PR-4) |
| `auth_audit` | Security events, hashed subjects (used by PR-2+) |
| `accounts_migration_log` | DDL version row + one row per backfill `--apply` (counts only) |
| `student_id` (nullable) + index | on `pilot_profiles`, `flights`, `aircraft`, `milestones` |

Nothing is dropped. `wallet_address` columns are untouched. If PR #11's `students` table already
exists, v2 adds the missing columns and relaxes `wallet_address` to NULLable.

## Flag
- Off (default / unset / anything but `true` or `1`): `migrate()` is byte-for-byte the old behaviour.
- On: `migrate()` additionally runs `migrateAccountsV2()` (transaction + advisory lock, idempotent).
- JSON-file mode (no `DATABASE_URL`) is unaffected either way.

## Backfill
```bash
# Dry run (default): READ ONLY transaction, prints counts only, writes nothing
DATABASE_URL=... node pilotlog-cli/scripts/backfill-students.mjs
# Apply (after the schema exists and a pg_dump has been taken)
DATABASE_URL=... node pilotlog-cli/scripts/backfill-students.mjs --apply
```
- One random student per canonical `mn_addr_…` wallet, with a `midnight-legacy` identity
  (`verified_at NULL`, because legacy `/wallet/connect` trusted the client). A later verified wallet
  sign-in (PR-5) claims and upgrades it.
- Non-canonical values (AIR-314 `mn_shield-cpk_…` rows) are **not guessed**; they stay unassigned and
  are reported as counts.
- Idempotent: only fills `student_id IS NULL`; reuses an existing student for a wallet identity.
- Verifies before/after row counts are equal, logs a summary row to `accounts_migration_log`.

## Tests
`npm test` runs everything. Postgres tests run when `PILOTLOG_TEST_DATABASE_URL` is set (CI uses a
`postgres:16` service) and are skipped otherwise. Each test uses a throwaway schema.

## Not included (later PRs)
DB sessions/challenges (PR-2), magic link (PR-3), passkeys (PR-4), PR #11 rework onto this schema
(PR-5), link/merge (PR-12), legacy cutover (PR-13), any runtime read/write of `student_id`,
any production migration or backfill run.
