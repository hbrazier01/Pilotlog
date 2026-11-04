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

## PR-2: sessions, challenges, audit
Library: `lib/accounts/{sessions,challenges,audit,crypto,http}.mjs`. Tables (migration `accounts_v2_002`):
- `sessions(id_hash = sha256(token), student_id, created_at, last_seen_at, expires_at, revoked_at, revoke_reason, rotated_to, ua, ip_hash)`.
  The 256-bit token exists only in the cookie; the DB never sees it. Absolute expiry 30 d
  (`PILOTLOG_SESSION_ABSOLUTE_MS`), idle timeout 7 d (`PILOTLOG_SESSION_IDLE_MS`), `last_seen_at`
  touched at most every 5 min. Sessions of merged/deleted students stop working.
  `rotateSession()` (call on sign-in, link/unlink, merge, email change), `revokeSession()`, `revokeAllSessions()`.
- `auth_challenges(id_hash = sha256(nonce), purpose, subject, student_id, payload, expires_at, consumed_at)`;
  purposes: sign-in, link-wallet, merge, email-magic-link, webauthn-register, webauthn-auth.
  `consumeChallenge()` is a single atomic `UPDATE … WHERE consumed_at IS NULL AND expires_at > now() RETURNING`;
  the nonce is burned even when purpose/subject/student then mismatch. Replaces PR #11's in-memory nonce Map.
- `auth_audit` rows for session create/rotate/revoke/revoke-all and challenge issue/consume/fail.
  Subjects and IPs are salted sha256 (`PILOTLOG_AUDIT_SALT`, optional); keys that look like
  token/nonce/secret/signature are stripped from `detail`.
- Hourly cleanup of expired/consumed rows while the flag is on.

Cookie: `__Host-pl_sid` with `HttpOnly; Secure; SameSite=Lax; Path=/`. For local http dev only,
`PILOTLOG_COOKIE_SECURE=false` switches to `pl_sid` without `Secure`. (PR #11's `pl_session` is a different cookie.)

Middleware (flag on + `DATABASE_URL` only): loads the cookie into `req.accountV2` and, if nothing else set it,
`req.student = { id, via: 'accounts-v2' }`. Lookup errors fail closed (unauthenticated). Internal routes:
`GET /api/v2/session`, `POST /api/v2/session/revoke` (`{"all": true}` = sign out everywhere).
Flag on in JSON-file mode: logs a notice and registers nothing.

**CSRF:** (1) `SameSite=Lax` keeps the cookie off cross-site POST/fetch; (2) every non-GET/HEAD/OPTIONS under
`/api/v2` must send an `Origin` (or `Referer`) equal to this host (`x-forwarded-proto/host` aware) or one of
`PILOTLOG_ALLOWED_ORIGINS`; missing or `null` origin → 403; (3) v2 writes are JSON POSTs, never GET.
Legacy routes are not covered yet (PR-13); PR-5 should extend the guard to every state-changing route.

## Not included (later PRs)
Magic link (PR-3), passkeys (PR-4), PR #11 rework onto this schema
(PR-5), link/merge (PR-12), legacy cutover (PR-13), any runtime read/write of `student_id`,
any production migration or backfill run.
