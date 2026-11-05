# Manual real-wallet test plan — Lace and 1AM (`signData`)

Status: **NOT verified with a real wallet extension.** Run this before calling wallet sign-in/link done.
Where: a local server or a non-production environment with `PILOTLOG_ACCOUNTS_V2=true`. Never turn the flag on in
production for this. Use a desktop Chrome/Brave profile with the extension installed, switched to the network the
server expects (`MIDNIGHT_NETWORK`, default `preprod`).

## Setup (local)
1. Postgres running; `DATABASE_URL=postgres://…/pilotlog_walletqa` (a throwaway DB).
2. `PILOTLOG_ACCOUNTS_V2=true PILOTLOG_COOKIE_SECURE=false PILOTLOG_EMAIL_PROVIDER=console PILOTLOG_PUBLIC_URL=http://localhost:4610 PORT=4610 npm start`
3. Open `http://localhost:4610/signin`, sign in by email (link prints to the server console), land on `/cockpit`.

## A. Lace
1. Install Lace (lace.io), create/restore a **test** wallet, enable Midnight, network = PreProd. Note its unshielded `mn_addr_…`.
2. Reload `/account`. Expect a **Lace · API 4.x** button under "Midnight wallet (optional)". If missing: open DevTools →
   `Object.values(window.midnight||{}).map(w=>[w.rdns,w.name,w.apiVersion])` and record the output (rdns must be `io.lace.wallet`).
3. Click **Lace**. Expect: Lace connect prompt for `localhost` → approve.
4. Expect a second Lace prompt to **sign a message**. Check the text shown contains: `PilotLog`, intent `link`, the
   `Domain: localhost:4610`, `Intent: link`, `Account: st_…`, `Address: mn_addr_…`, `Nonce:` and `Issued:`. Approve.
5. Expect green "Lace linked. You can now sign in with it." In DevTools → Network: `POST /api/v2/auth/wallet/challenge` 200
   (body `{address, intent:"link", provider:"midnight-lace"}`), `POST /api/v2/auth/wallet/link` 200 `{ok:true, alreadyLinked:false}`.
   Record the `signature` object shape (`signature`, `verifyingKey`, `scheme`) — no private data.
6. Click **Lace** again → expect "already linked to this account".
7. **Account → Sign out on this device.** On `/signin` open "Linked a Midnight wallet?" → **Lace** → approve connect + sign
   (intent `login` in the message) → expect redirect to `/cockpit` with the **same** data as before (logbook entry you added).
8. Negative: reject the sign prompt → expect "Wallet sign-in failed: …" and no session (`GET /api/v2/session` → `authenticated:false`).
9. Negative: in a second browser profile signed in by email as a different student, link the same Lace wallet → expect
   409 "This wallet is already linked to another PilotLog account."

## B. 1AM
Repeat A.2–A.9 with the 1AM extension (1am.xyz). Expect button **1AM** (rdns `com.midnight.1am` or key `1am`) and
`provider: "midnight-1am"`. Additionally:
10. With both Lace and 1AM installed and holding the **same** seed/address: after linking via Lace, sign in via 1AM →
    expect the same student (one wallet address = one student across wallet apps).

## C. Record results
For each wallet: extension + version, browser + version, apiVersion, pass/fail for steps 2–10, screenshots of the
sign prompts, any console errors. Save as `docs/wallet-qa-<date>.md`. Do not paste addresses tied to real funds.

## Known risks to watch
- `signData` options: we pass `{ encoding: 'text', keyType: 'unshielded' }` (from the challenge response). If a wallet
  rejects either, note the exact error; the server verifies `midnight_signed_message:<len>:<message>` with schnorr_bip340.
- Wallets that don't expose `getUnshieldedAddress` or `signData` are refused with a clear message (no unsigned fallback).
- Network mismatch (wallet on Mainnet/Testnet vs server `preprod`) should fail at the challenge with a 400.
