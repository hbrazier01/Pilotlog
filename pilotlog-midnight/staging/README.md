# CFI passkey signing: real-device staging (PROTOTYPE — not an FAA endorsement)

Synthetic data and the Midnight **Preview testnet** only. Nothing here touches PilotLog production, its database or
its domain. This is a technical prototype, not a legal signature or endorsement.

- URL: https://cfi-passkey-staging-staging.up.railway.app (RP ID = that host; the contract is compiled for it)
- Railway: project `pilotlog-staging`, service `cfi-passkey-staging`, 0.25 vCPU / 0.5 GB, app sleeping on.
  No database: data lives in memory and resets when the service restarts or sleeps.
- Proving and the relayer run on the box, not on Railway: `preview/worker.mjs` (needs the local proof server,
  ~3.2 GB RAM per worker). The header of the staging page shows whether the prover is online.

## Phone test steps (Holland, Giselle)

1. Open the URL in Safari (iPhone/iPad/Mac) or Chrome (Android). Check the yellow "Prototype — not an FAA
   endorsement" banner and that "prover: online" is shown.
2. **Set up:** keep a name containing "Synthetic", "Test" or "Demo" (the FAA lookup is a stub that refuses real
   names). Use any certificate number, set the RE date in the future, and tap **Create my signing passkey**.
   Approve with Face ID / Touch ID / fingerprint / device PIN.
3. Note the passkey kind shown (synced or device-bound). Wait for **enrollment: done** (1–3 minutes; the school
   approval is proved and submitted to Preview).
4. Tap **Review a new synthetic entry**. Read the entry and the signature block, tick the certification statement,
   then tap **Certify and sign with passkey** and approve the prompt.
5. The entry shows **signed · locked**, version 1. Try **edit**: it creates version 2 (unsigned); version 1 now shows
   **superseded**. Sign version 2.
6. Open **print** for an entry: check the signature block, status, "Prototype" notice and QR code. Scan the QR with
   another phone; the verify page should show the same status.
7. Optional checks: set the RE date in the past under "Test the RE-date block" and try to sign (must be refused);
   cancel the passkey prompt (nothing is signed); try from a second device (it gets its own passkey and profile).
8. Fill in the actual results in the PR #28 device matrix. Use **Reset** to forget the profile on that device.

## Running the worker on the box (operators only)

```
cd preview
PILOTLOG_CFI_MIDNIGHT=1 CFI_MIDNIGHT_SEED_FILE=<throwaway Preview seed file> \
CFI_STAGING_URL=https://cfi-passkey-staging-staging.up.railway.app \
CFI_WORKER_TOKEN_FILE=<file holding the staging worker token> node worker.mjs
```

The worker polls every few seconds, which also keeps the sleeping service awake while a test session runs. Stop it
after testing so the service can sleep. Never print the seed or the token.
