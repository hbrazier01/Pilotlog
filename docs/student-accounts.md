# Student accounts — sign-in UI and per-student data (accounts v2)

Adapted from PR #11's `docs/student-accounts.md` (feature/student-accounts, 981fc87), rebuilt on the accounts v2
sessions/identities that shipped in PR-1…PR-5 + PR #19. **Everything here is behind `PILOTLOG_ACCOUNTS_V2=true`
and needs Postgres.** With the flag off (or no `DATABASE_URL`) none of it is mounted and PilotLog keeps its legacy
single-user behaviour: shared `data/*.json` files, the wallet-keyed pg cache, `/wallet/connect`, no sign-in chip.

## What a student sees

| Page | Signed out | Signed in |
|---|---|---|
| `/signin` | Email magic link (request → "Check your inbox"), passkey sign-in, optional linked-wallet sign-in, "Explore with sample data" | Same page, with a note that you're already signed in |
| Email link → `GET /api/v2/auth/email/verify?token=…` | Confirm page; pressing **Sign in** consumes the token, sets the session cookie, redirects to `PILOTLOG_POST_LOGIN_PATH` (default `/cockpit`) | — |
| `/account` | 303 → `/signin` | Passkeys (add on this device / remove), link a 1AM or Lace wallet (optional), sign out here / everywhere |
| `/cockpit`, `/cockpit/*`, `/checkride` | SAMPLE data + banner "Sign in … to see and save your own logbook" + **Sign in** chip | The student's own data; chip shows **Account** + **Sign out** |

Email or passkey is the primary sign-in. A wallet is an optional identity linked from Account; once linked it can also
sign in (`/signin` → "Linked a Midnight wallet?"). New accounts are only created by the email link (a wallet sign-in
also creates one, as shipped in PR-5).

Browser code: `public/js/signin.js`, `public/js/account.js`, `public/js/accounts.js` (shared: API helper, wallet
picker/flow, sign out), `public/js/webauthn.js` (base64url ↔ ArrayBuffer for `@simplewebauthn/server` JSON),
`public/js/wallets.js` (unchanged from PR #11: detect 1AM/Lace by rdns, DApp connector v4). Pages have no inline
script and send `Content-Security-Policy: script-src 'self'`.

## Per-student data

`lib/accounts/studentRoutes.mjs` is mounted **before** the legacy cockpit/checkride routes when v2 is enabled. The
student id comes only from the server-side session (`req.accountV2.studentId`); no route accepts one from the client.

| Data | Storage (`student_docs.kind`) | Routes |
|---|---|---|
| Logbook entries | `entries` | `GET/POST /api/cockpit/entries`, `PUT/DELETE /api/cockpit/entries/:id` |
| Settings + rates | `settings`, `checkride.rates` | `GET/PUT /api/cockpit/settings`, `GET /api/weather` (home airport) |
| Checkride prep | `checkride` | `GET /api/checkride`, `PUT /api/checkride/{rates,test-date,endorsements/:key,acs/:taskId,flights/:entryId}`, `GET /checkride` |
| Replay tracks | `tracks` | `GET/POST /api/cockpit/tracks/:entryId` (entry must belong to the student); `/tracks/sample` and `/tracks/parse` stay public/stateless |
| Radio practice | `radio` (last 200) | `GET/POST /api/cockpit/radio/attempts` (posted by `atc-practice.js` only when signed in) |
| AI-coach usage | `student_usage` (per month) | `GET /api/cockpit/usage`; writes are server-side only (`store.recordUsage`), cap `COACH_MONTHLY_CAP_USD` (default 1) |
| HTML pages | — | `/cockpit`, `/cockpit/{flight-plan,logbook,training,acs,resources,radio,settings,replay}` use the student's context |

Signed out: GETs return SAMPLE data (`demo: true`), writes return `401 {"error":"sign in required","signIn":"/signin"}`,
private reads (tracks, radio, usage) return 401. Writes also pass the same-origin guard (403 cross-origin).
In v2 mode `POST /wallet/connect` returns **410**: it switched one global wallet for every visitor.

Schema (additive, `accounts_v2_003_student_docs`, applied with the other v2 DDL only when the flag is on):
`student_docs (student_id → students, kind CHECK in 6 kinds, doc JSONB, updated_at, PK(student_id, kind))` and
`student_usage (student_id → students, month YYYY-MM, input_tokens, output_tokens, usd_micros, requests, PK(student_id, month))`.
Nothing existing is altered. Rollback = turn the flag off (tables are ignored); they can be dropped later.

Unlike PR #11 there is **no implicit fallback** from a student to the shared legacy files or wallet rows — that is
what kept one shared logbook visible to everyone. Legacy data reaches exactly one student through the migration below.

## Legacy-owner migration (explicit, dry run by default)

```bash
# 1. The owner signs in once (email or passkey) and, if using the wallet form, links the wallet on /account.
# 2. Dry run — prints what would be copied, writes nothing:
DATABASE_URL=… LEGACY_OWNER_WALLET=mn_addr_… node scripts/migrate-legacy-to-student.mjs
#    or: --email owner@example.com   or: --student st_…   [--data-dir /path/to/data]
# 3. Apply:
DATABASE_URL=… LEGACY_OWNER_WALLET=mn_addr_… node scripts/migrate-legacy-to-student.mjs --apply
```

Copies `entries.json`, `settings.json`, `checkride.json` (or `pilot_profiles.checkride_json` for the owner wallet
when the file is absent) and `tracks.json` from the data dir (`PILOTLOG_HOME` | `PILOTLOG_DIR` | `./data`) — each
kind only if the student doesn't already have it. Records `meta.legacyMigration`; re-running is a no-op. Never edits or
deletes legacy files/rows. Wallet-keyed `flights`/`aircraft`/`milestones` rows are covered separately by the PR-1
backfill (`lib/accounts/backfill.mjs`). Owner must resolve to exactly one active student via a **verified** identity.

## Tests

`test/accounts-student-scoping.test.mjs`: A/B isolation on every kind and on HTML pages, signed-out SAMPLE/401,
cross-origin 403, flag-off and file-mode boots (no `/signin`, legacy writes still work, no chip), migration dry run /
apply / idempotent / no overwrite, and the script end to end.

## Not verified

- **Wallet sign-in and wallet link have NOT been verified with a real Lace or 1AM extension.** Headless Chrome has no
  wallet; only the server-side signature verification is unit-tested (PR-5). See `docs/manual-wallet-test-plan.md`.
- Passkeys were exercised in headless Chrome with a CDP virtual authenticator on `localhost`, not on a phone/laptop
  platform authenticator or on `pilotlog.digitalaviationpool.com`.
