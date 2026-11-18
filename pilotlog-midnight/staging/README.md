# CFI passkey signing: real-device staging (PROTOTYPE — not an FAA endorsement)

Synthetic data and the Midnight **Preview testnet** only. Nothing here touches PilotLog production, its database or
its domain. This is a technical prototype, not a legal signature or endorsement.

- URL: https://cfi-passkey-staging-staging.up.railway.app (RP ID = that host; the contract is compiled for it)
- Railway: project `pilotlog-staging`, service `cfi-passkey-staging`, 0.25 vCPU / 0.5 GB, app sleeping on.
  No database: data lives in memory and resets when the service restarts or sleeps.
- Proving and the relayer run on the box, not on Railway: `preview/worker.mjs` (needs the local proof server,
  ~3.2 GB RAM per worker). The header of the staging page shows whether the prover is online.

## Phone test checklist (Holland, Giselle)

1. Open the staging URL on your phone.
2. Register a passkey with a "Synthetic …" name and approve with Face ID, fingerprint or PIN.
3. Wait for **Enrolled on Preview** (~1 min).
4. Review the synthetic entry, tick certify, tap **Sign** and approve.
5. Confirm **Signed + Locked** (~1 min until "recorded on Midnight Preview").
6. Edit the entry and confirm v2 is **unsigned** and v1 **superseded**.
7. Open **Print** and scan the QR; confirm it **verifies** ("signature valid for this exact version").
8. Note the credential flags shown (credential ID, UV, BE, BS, attestation).

Record for each step: phone model + OS, browser, authenticator used (Face ID / fingerprint / PIN), pass/fail, time
taken, the backup-eligible (BE) / backed-up (BS) flags shown, and anything confusing.

Optional (school-admin actions, off-chain in staging): under "Test revocation", revoke with reason "left the school"
or "compromised" and check that signing is blocked while earlier signatures stay listed with a dated note; use
"dispute signature" on one signed entry and check that only that entry is flagged.

## Running the worker on the box (operators only)

```
cd preview
PILOTLOG_CFI_MIDNIGHT=1 CFI_MIDNIGHT_SEED_FILE=<throwaway Preview seed file> \
CFI_STAGING_URL=https://cfi-passkey-staging-staging.up.railway.app \
CFI_WORKER_TOKEN_FILE=<file holding the staging worker token> node worker.mjs
```

The worker polls every few seconds, which also keeps the sleeping service awake while a test session runs. Stop it
after testing so the service can sleep. Never print the seed or the token.
