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

## PR-3: email magic-link sign-in
Files: `lib/accounts/email/{index,postmark,console,test}.mjs`, `lib/accounts/magicLink.mjs`, `lib/accounts/emailRoutes.mjs`.

**Email adapter** (`PILOTLOG_EMAIL_PROVIDER` = `postmark` | `console` | `test`):
- Outside production the default is `console`, which prints the message *including the link* to stdout (dev only).
  `postmark` without `POSTMARK_SERVER_TOKEN` falls back to console with a warning. `test` records sends in memory.
- In production it is Postmark only. A missing token, or `console`/`test`, **fails closed**: `/start` answers 503 and nothing is
  issued, sent, or logged.
- Postmark: `POST https://api.postmarkapp.com/email` via `fetch`, header `X-Postmark-Server-Token` from
  `POSTMARK_SERVER_TOKEN`, `From` = `PILOTLOG_EMAIL_FROM` or `support@digitalaviationpool.com`, `MessageStream: outbound`.
  Errors carry only HTTP status + Postmark `ErrorCode`. The token, recipient, and link are never logged.
  Postmark needs a verified sender signature/domain (SPF/DKIM) for `digitalaviationpool.com` before go-live.

**Flow**
1. `POST /api/v2/auth/email/start {email}`: normalize (trim, NFC, lowercase; no gmail-dot rewriting), then rate-limit
   per email (`PILOTLOG_MAGIC_LINK_MAX_PER_EMAIL`, default 3/15 min) and per IP (`PILOTLOG_MAGIC_LINK_MAX_PER_IP`,
   default 10/15 min). Limits are counted from `auth_challenges`, so they're multi-instance safe. Then issue an `email-magic-link`
   challenge (`PILOTLOG_MAGIC_LINK_TTL_MS`, default 15 min, single-use, sha256 stored) and send the link.
   The response is **always the same 202** for new, existing, and rate-limited addresses. Account lookup never happens
   here, and delivery runs after the response, so neither status, body, nor timing enumerates accounts. A malformed address gets 400.
2. `GET /api/v2/auth/email/verify?token=…` renders a confirm page (no-store, no-referrer, strict CSP) whose button POSTs.
   **GET never consumes**, so mail scanners and link previews can't burn the link.
3. `POST /api/v2/auth/email/verify` (form or JSON `{token}`) consumes the token atomically and finds or creates the student plus a verified
   `email` identity (transaction + per-email advisory lock). It revokes any current session, sets a fresh `__Host-pl_sid`, and
   writes `signup`/`signin` audit rows. Forms get a 303 redirect to `PILOTLOG_POST_LOGIN_PATH` (default `/cockpit`, relative paths only).
   Replayed, wrong, or expired tokens all get one generic 400.
4. If you are already signed in as student A and the link's email belongs to someone else (or no one), the request is **409, blocked**.
   Linking and merging are PR-12 and never implicit.

**Links** use `PILOTLOG_PUBLIC_URL` (must be https; **required in production**). The Host header is never trusted for links
in production, which prevents Host-header link poisoning. In dev it falls back to the request host.
CSRF: both POSTs sit under the PR-2 `/api/v2` same-origin guard.

## Not included (later PRs)
Passkeys (PR-4), PR #11 rework onto this schema
(PR-5), link/merge (PR-12), legacy cutover (PR-13), any runtime read/write of `student_id`,
any production migration or backfill run.

## PR-4: passkey (WebAuthn) sign-in
Files: `lib/accounts/passkeys.mjs`, `lib/accounts/passkeyRoutes.mjs`, `test/helpers/soft-authenticator.mjs`.
Library: `@simplewebauthn/server` **14.0.3** (pinned exactly; Node ≥ 20). Only active with `PILOTLOG_ACCOUNTS_V2` on and Postgres configured; otherwise every route below is 404.

| Route | Auth | Notes |
|---|---|---|
| `POST /api/v2/auth/passkey/register/options` | session | `residentKey: required`, `userVerification: preferred`, attestation `none`, ES256/RS256, existing credentials excluded |
| `POST /api/v2/auth/passkey/register/verify` `{response, nickname?}` | session | stores `identities(type='passkey', subject=credential id)` + `webauthn_credentials` (public key, sign_count, transports, aaguid, backed_up; device type / backup-eligible in `identities.metadata`) |
| `POST /api/v2/auth/passkey/login/options` `{email?}` | none | usernameless: `allowCredentials` is always empty, so the response is identical whether or not the email exists. A hint is bound into the challenge and enforced on verify (credential must belong to that email's student) |
| `POST /api/v2/auth/passkey/login/verify` `{response}` | none | one generic 400 for every failure; success rotates any current session and sets `__Host-pl_sid` |
| `GET /api/v2/auth/passkeys` | session | own passkeys only (id, nickname, created/last used, transports, aaguid, backedUp, deviceType); no key material |
| `DELETE /api/v2/auth/passkeys/:id` | session | own only (else 404). **409** if it's the last sign-in method and the student has no verified email |

- **Challenges:** the PR-2 nonce *is* the WebAuthn challenge (purposes `webauthn-register` bound to the student, `webauthn-auth` bound to `passkey-login`; 5-min TTL). Verify decodes `clientDataJSON.challenge` and consumes it atomically **before** looking up the credential, so replays, forged challenges, and any failed attempt burn it.
- **RP config:** `PILOTLOG_RP_ID` + `PILOTLOG_PUBLIC_URL`. Dev defaults to RP ID `localhost` and the request origin. Production requires both, an https URL, a real domain, and URL host == RP ID or a subdomain of it; anything else → 503 and no challenge issued (fail closed). Changing the RP ID later invalidates every registered passkey.
- **Counter:** a non-increasing counter (when either side is non-zero) is rejected and audited as `passkey_counter_regression`; the update is compare-and-swap. Authenticators that always report 0 (most synced passkeys) are allowed.
- **User verification:** requested as `preferred`, not required; `userVerified` is recorded in the audit detail.
- **CSRF:** all writes go through the PR-2 `/api/v2` same-origin guard.
- **Audit events:** `passkey_register`, `passkey_register_fail`, `signin` (identity_type `passkey`), `passkey_signin_fail`, `passkey_counter_regression`, `passkey_delete`, `passkey_delete_blocked`. Credential ids are stored only as salted hashes.
- **Not in this PR:** sign-up with a passkey (a student must already exist via email), renaming, linking or merging, attestation/AAGUID allow-lists, and front-end UI.
