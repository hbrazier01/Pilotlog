# Student accounts

Every cockpit and checkride API is now scoped to the signed-in student. Settings, the logbook, checkride and cost data, imported tracks, Radio Practice history and the AI-coach usage ledger are stored per student. A second student can no longer overwrite the first.

## Identity

`pilotlog-cli/src/lib/accounts/identity.mjs` defines identity providers. Each one turns a browser proof into `{ studentId, walletAddress }`.

| Provider | Status |
|---|---|
| `midnight-1am` | Live. Uses Midnight DApp connector `signData` over a server nonce. |
| `midnight-passport` | Placeholder. It returns "not available yet" and plugs into the same `verify()` contract when Passport ships. |

`studentId = "st_" + sha256(canonical mn_addr_… address)[:24]`. It is stable across providers and safe to use in file paths. The canonical address is the same key that already scopes `flights` in Postgres.

### Sign-in flow (verified)

1. Browser: `wallet.connect('preprod')`, then `getUnshieldedAddress()`.
2. `POST /api/auth/challenge {address}`. The server checks the bech32m address, then issues a 5-minute, single-use nonce and a message containing the domain, address, nonce and time.
3. Browser: `api.signData(message, { encoding: 'text', keyType: 'unshielded' })`.
4. `POST /api/auth/verify`. The server rebuilds `midnight_signed_message:<len>:<message>` (DApp connector spec) and checks the signature with `@midnight-ntwrk/ledger-v8` `verifySignature`. It also requires that `addressFromKey(verifyingKey)` equals the address's 32-byte payload. Only then does it set the session.
5. Session: the `pl_session` cookie is HMAC-SHA256 signed with `SESSION_SECRET`. It is `HttpOnly`, `SameSite=Lax`, `Secure` on Railway/production, and lasts 30 days. Cross-origin writes to `/api/auth`, `/api/cockpit` and `/api/checkride` are rejected (403).

### Limits

- The test suite checks verification end to end with real ledger keys (`sampleSigningKey`). It has **not yet been tested against the real 1AM extension**. If 1AM returns a different signature encoding, sign-in fails with a clear error. It does not fail open.
- **Unverified fallback** (`POST /api/auth/connect`) is for wallets with no `signData`. It trusts the browser's claimed address, so it is **off** unless `ALLOW_UNVERIFIED_WALLET_LOGIN=1`. Sessions created that way are marked `verified:false`, and the nav dot turns amber.
- Sessions are stateless. "Sign out" clears the cookie, but a stolen cookie stays valid until it expires (30 days) or `SESSION_SECRET` is rotated.
- Nonces live in memory, which works for a single instance. With several replicas, move them to Postgres or Redis.
- The old `/wallet/connect` flow and its global in-memory `pgCache` (legacy dashboard, `/`, pilot report) are unchanged and remain single-user.

## Storage

| | Postgres (`DATABASE_URL`) | Local fallback |
|---|---|---|
| student | `students(id, wallet_address, provider)` | `DATA_DIR/students/<id>/student.json` |
| settings, checkride, tracks, entries, radio, meta | `student_docs(student_id, kind, doc jsonb)` | `DATA_DIR/students/<id>/<kind>.json` |
| AI usage ledger | `student_usage(student_id, month, input_tokens, output_tokens, usd_micros, requests)` | `DATA_DIR/students/<id>/usage.json` |

The migrations are additive (`CREATE TABLE IF NOT EXISTS`) and run in `db.mjs migrate()` at startup. No existing table is altered. In Postgres mode, a student with no `checkride` or `entries` doc yet falls back to the existing wallet-scoped `pilot_profiles.checkride_json` and `flights` rows, so earlier wallet data shows up on first sign-in without any copying.

Usage ledger: `store.recordUsage(studentId, { inputTokens, outputTokens, usd })` is server-only. `GET /api/cockpit/usage` returns month totals, the cap (`COACH_MONTHLY_CAP_USD`, default $1) and `overCap`.

Signed-out visitors and `?demo=1` get the SAMPLE data, read-only. Writes return `401 { connect: true }`.

## Legacy data migration (one time)

The old shared files (`settings.json`, `checkride.json`, `tracks.json`, `entries.json` in `DATA_DIR`) are never deleted or modified. To give them to one student:

1. Set `LEGACY_OWNER_WALLET=mn_addr_preprod1…` (the owner's canonical unshielded address).
2. Either sign in with that wallet, which triggers the migration automatically once, or run
   `LEGACY_OWNER_WALLET=… node pilotlog-cli/scripts/migrate-legacy-to-student.mjs --dry-run` and then run it again without `--dry-run`.
3. The migration copies only the kinds the student doesn't already have. It records `meta.legacyMigration`, and re-running it is a no-op.
4. Optionally unset `LEGACY_OWNER_WALLET` afterwards. While it is set, it also shows the old `profile.json` name on that student's chip.

Leave `LEGACY_OWNER_WALLET` unset in production until you decide to run this.
