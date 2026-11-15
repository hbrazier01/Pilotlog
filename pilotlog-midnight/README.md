# pilotlog-midnight (isolated, Preview testnet only)

CFI passkey (WebAuthn ES256 / P-256) endorsement of PilotLog logbook entries, verified in a Midnight
Compact contract. Design: [`docs/design/cfi-passkey-signing.md`](../docs/design/cfi-passkey-signing.md).

**Status: experimental. Not wired into the app. Not for production.**

- Separate package with its own lockfile. The root `package.json` has no workspace or dependency on
  it, so `npm ci` and `npm test` for the main app are unchanged. It is excluded from Dockerfile builds
  (`.dockerignore`); the live Railway services build with Railpack from `main`, where these files may be
  copied but are never installed or imported.
- Everything that touches a contract (`src/simulator.mjs`, `src/cli.mjs`, `preview/run.mjs`) refuses
  to run unless `PILOTLOG_CFI_MIDNIGHT=1`. The main app never reads that flag.
- Synthetic data only. Preview testnet only. No production database, flags or secrets.

## Layout

| Path | What |
|---|---|
| `contract/cfi_endorse.compact` | Contract: admin-managed CFI key registry, endorse, admin revoke, CFI self-revoke, admin rotation |
| `contract/managed/` | `compactc 0.36.0` output (JS + zkir). `keys/` (~480 MB) is gitignored; regenerate with `npm run compile` |
| `src/canonical.mjs` | Entry canonicalization (v1), `entryHash`, salted `studentCommit` / `cfiRef`, digest mirrors |
| `src/webauthn.mjs` | clientDataJSON profiles, authenticatorData flags, DER→(r,s), COSE/SPKI→P-256 point, circuit args |
| `src/cbor.mjs` | Minimal strict CBOR for COSE keys |
| `src/simulator.mjs` | In-process contract simulator (compact-runtime 0.21.0) |
| `src/softPasskey.mjs` | Synthetic authenticator for tests (DER sigs, COSE keys, client-data variants) |
| `src/cli.mjs` | Dev-only CLI (`demo`, `entry-hash`, `classify`) |
| `preview/run.mjs` | One-off Preview testnet run (deploy, enroll, endorse, tamper, revoke, read back) |

## Commands

```sh
cd pilotlog-midnight
npm ci && npm test                                   # unit + simulator tests (no network)
PILOTLOG_CFI_MIDNIGHT=1 node src/cli.mjs demo        # simulator walk-through
COMPACTC=/path/to/compactc-0.36.0/compactc npm run compile:skip-zk   # regenerate committed JS
COMPACTC=/path/to/compactc-0.36.0/compactc npm run compile           # + prover keys (gitignored)
```

Preview run (needs a funded **throwaway** Preview wallet, a local proof server 9.0.0, and full compile output):

```sh
cd preview && npm ci               # pins @midnightntwrk/ledger-v9 to 1.0.1 via overrides (duplicate copies break calls)
PILOTLOG_CFI_MIDNIGHT=1 CFI_MIDNIGHT_SEED_FILE=/path/to/seed.hex PROOF_SERVER=http://127.0.0.1:6300 node run.mjs
```

Toolchain: Compact 0.36.0 (language 0.28), compact-runtime 0.21.0, Midnight.js 5.0.0, Wallet SDK 2.0.0,
testkit-js 5.0.0, compact-js 3.0.0, proof server 9.0.0, ledger-v9 1.0.1.
