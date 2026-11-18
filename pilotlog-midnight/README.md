# pilotlog-midnight (isolated, Preview testnet only)

CFI passkey (WebAuthn ES256 / P-256) endorsement of PilotLog logbook entries, verified in a Midnight
Compact contract. Design: [`docs/design/cfi-passkey-signing.md`](../docs/design/cfi-passkey-signing.md).

**Status: PROTOTYPE — not an FAA endorsement. Not wired into the app. Not for production.**

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
| `contract/cfi_endorse.compact.in` | Contract template: root keys (offline P-256), per-school admins (passkey), CFI keys, endorse, revocations |
| `contract/cfi_endorse.compact`, `contract/env.json` | Generated per environment by `scripts/gen-contract.mjs` (RP ID and origin are compile-time constants) |
| `contract/managed/` | `compactc 0.36.0` output (JS + zkir), 9 circuits. `keys/` (~2.1 GB) is gitignored; regenerate with `npm run compile` |
| `src/canonical.mjs` | Entry canonicalization (v1), `entryHash`, salted ids, root/school/endorse digests, signature block, `attestHash`, validity rule |
| `src/record.mjs` | Offline verification of a stored record: `unsigned` / `signed` / `superseded` / `invalid` |
| `src/revocation.mjs` | Leave-school / compromised revocations and per-entry disputes: reason + UTC time, signature standing; history never deleted |
| `src/credential.mjs` | What a WebAuthn response establishes about a credential (ID, UV, BE, BS, attestation format) and what it doesn't |
| `src/rootKey.mjs` | **Synthetic** root key helpers for tests and Preview (the real root key is offline; see the design doc §3.4) |
| `src/webauthn.mjs`, `src/env.mjs` | clientDataJSON profiles, authenticatorData flags, DER/COSE/SPKI, circuit args; compiled RP ID and origin |
| `src/cbor.mjs` | Minimal strict CBOR for COSE keys |
| `src/simulator.mjs` | In-process contract simulator (compact-runtime 0.21.0) |
| `src/softPasskey.mjs` | Synthetic authenticator for tests (DER sigs, COSE keys, client-data variants) |
| `src/cli.mjs` | Dev-only CLI (`demo`, `entry-hash`, `classify`) |
| `preview/run.mjs` | Preview testnet run of the layered-admin key flows (results in `preview/.state-v2/`, gitignored) |
| `preview/worker.mjs` | Staging prover/relayer, run on the box next to a local proof server (never on Railway) |
| `staging/` | Real-device staging app (Railway `pilotlog-staging` only, synthetic data). See `staging/README.md` |
| `railway.json` | Used only by `railway up` from this directory for the staging service. Production services do not read it |

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
