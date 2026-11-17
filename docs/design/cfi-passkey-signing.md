# CFI passkey signing of logbook entries on Midnight: prototype design

> **PROTOTYPE. Not an FAA endorsement.** This is a technical prototype of passkey signing with supplemental
> on-chain tamper evidence. It has not been reviewed by the FAA or by counsel. Nothing here claims legal
> sufficiency, and it is not a substitute for any endorsement or signature the regulations require. Legal review is a
> rollout gate (§12, G3).

Status: **DRAFT for review. Not approved for production.** Everything is isolated in `pilotlog-midnight/`, behind
`PILOTLOG_CFI_MIDNIGHT=1`, uses synthetic data, and runs on the Midnight Preview testnet only. The real-device staging
app lives in the `pilotlog-staging` Railway project and does not touch production.
Owner: Holland Brazier. Last updated: 2026-11-17 (layered admin, key ceremony, e-signature requirements from
Eric's 11-17 brief, signature binding, versioning).

## 1. Goal and non-goals

**Goal.** A CFI signs a specific version of a student's logbook entry with their device passkey (WebAuthn,
ES256 / P-256). PilotLog keeps the **readable entry, the signature block and the WebAuthn assertion as the
record**. As *supplemental* tamper evidence, a Midnight Compact contract verifies the same passkey signature
in-circuit and stores a PII-free record that anyone can check against the entry later.

**The chain is not the record.** The readable entry (and its printable PDF) is the record. Retention, export and
printing must never depend on the chain or on PilotLog's contract existing (§7). The on-chain check only shows
that the entry has not changed since it was signed.

**Non-goals (v1).** Any claim of FAA acceptance or legal sufficiency; replacing paper or any required
endorsement; solo, solo cross-country or practical-test endorsements (training entries only until counsel signs
off); entry contents on-chain; CFIs, schools or students holding wallets, keys or tokens; browser-side proving.

**Why it is feasible.** Compact 0.36.0 ships `secp256r1EcdsaVerify` and SHA-256 (`persistentHash`), so the whole
WebAuthn check (challenge, clientDataJSON, rpIdHash, UP/UV flags, ECDSA) runs in-circuit. Measured numbers are in §8.1.

## 2. Architecture

```
ROOT (Holland, offline P-256 key, rare)        SCHOOL admin (passkey)          CFI (passkey)
  onboard / revoke school, replace a           enroll / revoke own CFIs,      sign entry versions,
  school admin, add / remove root keys         hand over admin                self-revoke
        │ signature over rootDigest                  │ WebAuthn assertion            │ WebAuthn assertion
        ▼                                            ▼                               ▼
                         PilotLog server (relayer): verify off-chain, queue, never holds root keys
                                                     │
                       proof worker → proof server (≈3.2–3.8 GB, 1 worker) → balance DUST → submit
                                                     ▼
                                   Midnight contract cfi_endorse (per environment)
```

Nobody but the relayer touches the chain. CFIs and school admins only ever see their device's passkey prompt
(Face ID, Touch ID, Android fingerprint or device PIN). No keys, wallets or fees are shown. The relayer pays
DUST fees. **The relayer cannot forge anything:** every authority (root, school, CFI) is a signature checked
in-circuit, and the contract has **no witnesses and no server-held admin secret**. A compromised relayer can delay
or drop transactions. It cannot enroll, revoke, or endorse.

## 3. Layered registry and administration

### 3.1 On-chain state (`contract/cfi_endorse.compact.in`)

| Ledger field | Type | Meaning |
|---|---|---|
| `rootKeys` | `Set<keyId>` | active root keys (1-of-N: primary + backup) |
| `retiredRootKeys` | `Set<keyId>` | removed root keys; can never be re-added |
| `schools` | `Map<schoolId, adminKeyId>` | each school's current admin passkey |
| `adminKeySchool` | `Map<adminKeyId, schoolId>` | reverse index; an admin key serves exactly one school |
| `retiredAdminKeys` | `Set<keyId>` | replaced school admin keys; never reusable |
| `schoolRevokedAtSeq` | `Map<schoolId, Uint<64>>` | school revocations (a revoked id can never be onboarded again) |
| `cfiKeys` | `Map<keyId, {cfiRef, schoolId}>` | enrolled CFI passkeys; a key belongs to exactly one school |
| `revokedAtSeq` | `Map<keyId, Uint<64>>` | CFI key revocations |
| `endorsements` | `Map<endorsementKey, {entryHash, keyId, schoolId, studentCommit, seq}>` | one record per (entry version, CFI key) |
| `seq` | `Counter` | bumped by every endorsement and every CFI or school revocation |

`keyId = SHA-256(LE32(x) ‖ LE32(y))`, so public keys are never on-chain. `schoolId`, `cfiRef` and `studentCommit` are
salted pseudonyms (`SHA-256(tag ‖ salt32 ‖ id)`). There are no names, certificate numbers or entry contents.

### 3.2 Who can do what

| Action | Authority | Circuit | Signed digest |
|---|---|---|---|
| Onboard school (with its first admin key) | **root** | `rootOnboardSchool(schoolId, adminKeyId, rootPk, sig)` | `rootDigest(addr, "onboard-school", schoolId, adminKeyId)` |
| Revoke school | **root** | `rootRevokeSchool(schoolId, …)` | `rootDigest(addr, "revoke-school", schoolId, 0)` |
| Replace a school's admin key (lost device) | **root** | `rootSetSchoolAdmin(schoolId, newAdminKeyId, …)` | `rootDigest(addr, "set-school-admin", schoolId, newKey)` |
| Add / remove a root key | **root** | `rootSetKey(keyId, active, …)` | `rootDigest(addr, "add-root-key"/"remove-root-key", keyId, 0)` |
| Enroll a CFI key | that **school's admin** | `schoolEnrollCfi(schoolId, cfiKeyId, cfiRef, adminPk, assertion…)` | `schoolDigest(addr, "enroll-cfi", schoolId, cfiKeyId, cfiRef)` |
| Revoke a CFI key | that **school's admin** | `schoolRevokeCfi(schoolId, cfiKeyId, …)` | `schoolDigest(addr, "revoke-cfi", schoolId, cfiKeyId, 0)` |
| Hand over school admin | that **school's admin** | `schoolRotateAdmin(schoolId, newAdminKeyId, …)` | `schoolDigest(addr, "rotate-admin", schoolId, newKey, 0)` |
| Revoke own key | the **CFI** (that passkey) | `selfRevoke(pk, assertion…)` | `revokeDigest(addr, keyId)` |
| Sign an entry version | the **CFI** (enrolled, school active) | `endorseEntry(entryHash, studentCommit, attestHash, pk, assertion…)` | `endorseDigest(addr, entryHash, studentCommit, attestHash)` (§4.3) |

- `rootDigest = SHA-256(pad32("pilotlog:cfi-root:v1") ‖ addr ‖ op ‖ a ‖ b)`. The root key signs it with
  **raw ECDSA P-256 over SHA-256(digest)**, which is exactly what `openssl dgst -sha256 -sign` and a YubiKey PIV
  `sign -H SHA256` produce for the 32-byte file. This is checked in-circuit with `secp256r1EcdsaVerify`.
- `schoolDigest = SHA-256(pad32("pilotlog:cfi-school:v1") ‖ addr ‖ op ‖ schoolId ‖ a ‖ b)` is the WebAuthn challenge
  of the school admin's passkey. It is verified in-circuit like a CFI signature (same RP ID and origin, UP+UV required).
- **School isolation:** a school op asserts `schools[schoolId] == keyIdOf(adminPk)` and that the school is not
  revoked. `schoolRevokeCfi` also asserts `cfiKeys[k].schoolId == schoolId`, so a school can never act on another
  school's CFI. This is tested: B cannot enroll into A, cannot revoke A's CFI under either school id, and A's
  enrollment signature cannot be replayed for another key, ref or op.
- **Root-only:** school admin keys are not in `rootKeys`, so every root circuit rejects them (`not a root key`),
  even with a valid P-256 signature. This is tested and was also run on Preview (§8.1).
- **Replay safety without nonces:** every authorized op either can only happen once or makes its own replay
  impossible. Onboard/enroll/add fail if the item is already present. Revoke/remove fail if it is already gone.
  Replaced keys are retired forever, and revoked school ids and CFI keys can never come back. So a captured root or
  school signature can never be re-applied to a different state, and the offline root signer never needs to fetch a
  nonce. All digests include the contract address and an op tag, which prevents cross-deployment and cross-op replay.

### 3.3 Revoking a school, and what happens to its endorsements

`rootRevokeSchool` records `schoolRevokedAtSeq[schoolId] = seq` and bumps `seq`. From then on:

- that school's CFIs cannot endorse (`CFI's school revoked`), and its admin cannot enroll, revoke or rotate;
- **other schools, their CFIs and their endorsements are unaffected.** Every check is per-school, so no global state
  changes (tested; also run on Preview);
- **existing endorsements of the revoked school stay valid** under the same sequence rule used for CFI key revocation.
  The validity rule for verifiers (implemented in `src/canonical.mjs::endorsementValidity`) is:

```
valid(e) ⇔ cfiKeys[e.keyId].schoolId == e.schoolId
         ∧ (e.keyId    ∉ revokedAtSeq       ∨ e.seq < revokedAtSeq[e.keyId])
         ∧ (e.schoolId ∉ schoolRevokedAtSeq ∨ e.seq < schoolRevokedAtSeq[e.schoolId])
```

  Rationale: revocation means "stop trusting this school from now on", not "the training never happened".
  Fraud by a school before it was revoked needs a separate, explicit dispute marking (`disputeEndorsement`,
  §13 open question; not implemented), never silent invalidation;
- a CFI of a revoked school can still `selfRevoke` (harmless). To move to another school, the CFI enrolls a **new**
  passkey there, because a key belongs to one school forever;
- a revoked `schoolId` can never be onboarded again. Reinstating a school means a new `schoolId` under a new root operation.

### 3.4 Root key ceremony (Holland runs it himself, offline)

The root key **never goes on a server, a CI system, or to an agent.** PilotLog only ever receives the root
**public** key and individual signatures over specific operation digests. Tests and the Preview run use a
**synthetic** root key generated in-process.

**Recommended form: two hardware keys (YubiKey 5 series, PIV applet, P-256), each generated on-device and
non-exportable.** The primary stays with Holland; the backup goes in a safe or bank box. Both keys are registered as
root keys (1-of-2). The software alternative below is for cases where hardware isn't available.

**A. Generation (once, about 45 min).**
1. Use a clean offline laptop: a fresh OS install or a live USB (Tails/Ubuntu live), with Wi‑Fi off and no network
   cable. Put a copy of this repo on a USB stick, checked against a commit hash Holland reads from GitHub on another device.
2. Hardware: `ykman piv keys generate --algorithm ECCP256 --pin-policy ALWAYS --touch-policy ALWAYS 9c root-pub-1.pem`,
   then `ykman piv certificates generate 9c root-pub-1.pem -s "PilotLog root 1"`. Change the PIV PIN, PUK and
   management key from their defaults first. Repeat on the backup YubiKey to get `root-pub-2.pem`.
   *Software alternative:* `openssl ecparam -name prime256v1 -genkey -noout -out root.pem`. Encrypt it with
   `age -p`/`gpg -c` using a long passphrase. Keep **two** encrypted copies on two USB sticks in two places, or
   split the passphrase 2-of-3 with `ssss`. The plaintext `root.pem` never touches a networked machine.
3. `PILOTLOG_CFI_MIDNIGHT=1 node pilotlog-midnight/src/cli.mjs root-verify root-pub-1.pem …` prints the
   `rootKeyId`. Write both keyIds on paper and keep it with the backup.
4. Hand only `root-pub-*.pem` (public) to engineering. The contract is deployed with `rootKeyId(1)`, then
   `rootSetKey(rootKeyId(2), true)` is signed as the first root operation.

**B. Signing a root operation (minutes, rare).**
1. Engineering prepares the request: `op`, contract address, `a`, `b`, plus a human-readable description (for
   example, "onboard school X with admin key …"). It is delivered to Holland's own device by a channel he trusts.
2. On the offline machine, Holland **recomputes** the digest himself instead of trusting engineering's:
   `node src/cli.mjs root-digest onboardSchool <contract> <schoolId> <adminKeyId> digest.bin`.
3. Sign: `yubico-piv-tool -a verify-pin -a sign -s 9c -A ECCP256 -H SHA256 -i digest.bin -o sig.der` (touch the key),
   or with software: `openssl dgst -sha256 -sign root.pem -out sig.der digest.bin`.
4. Check: `node src/cli.mjs root-verify root-pub-1.pem digest.bin sig.der`. Copy **only `sig.der`** back to engineering.
5. The relayer submits it. A signature is useless for any other op, contract, school or key (§3.2).

**C. Rotation and loss recovery.**
- *Lost or stolen primary:* use the backup key to sign `rootSetKey(primary, false)`, which retires the primary forever,
  then `rootSetKey(newKey, true)`. Order the replacement hardware in advance.
- *Routine rotation (for example, yearly):* add the new key, then remove the old one. The contract refuses to remove the last root key.
- *Both keys lost:* root actions become impossible. Schools keep operating (their admins don't need root). Recovery
  means a new contract deployment and a migration (§13). This is why the backup lives in a separate location.
- *Suspected compromise:* use the other root key to remove the compromised one immediately, audit recent root
  operations on-chain (all are public), then revoke any rogue school.

**D. Contract upgrade and maintenance authority (separate key).** Midnight's *contract maintenance authority* (the key
that can replace verifier keys, set via midnight-js at deploy) is a Midnight signing key, not P-256, so the root
YubiKey cannot hold it. Plan: generate it in the same offline ceremony; store it encrypted beside the software
backup (2 places); use it only from the offline laptop, connected briefly to submit, for a verifier-key swap
announced in advance; monitor on-chain verifier keys against the expected set (T7). Option for later: hand
maintenance to a committee or relinquish it once stable. **For Preview/staging the maintenance key is
midnight-js's default ephemeral key.** It was not kept, so the staging contract cannot be upgraded, by design.

### 3.5 CFI identity verification at enrollment (design only; staging uses a stub)

A passkey proves "the same key as at enrollment", not "this is CFI #123". Binding identity to the key is PilotLog's
job, done once at enrollment:

1. The CFI enters their legal name and certificate number. PilotLog checks them against **FAA Airmen Inquiry**
   (https://amsrvs.registry.faa.gov/airmeninquiry/). It searches by certificate number but doesn't display it, so
   the match is name plus certificate number plus "flight instructor" rating. **No live FAA calls are made in this
   PR.** Staging uses `faaLookupStub` with deterministic synthetic answers, accepts only names containing
   Synthetic/Test/Demo, and treats numbers starting with 0 as "no match".
2. A photo-ID check (vendor TBD) ties the person to that name.
3. The **RE (recent-experience) end date or certificate expiration date** is entered by the CFI with evidence (a FIRC
   certificate or 61.197 activity). The registry may not show RE dates (unavailable per Eric's brief). PilotLog
   stores the date and **blocks signing once it has passed**. This is implemented in staging and tested.
4. The CFI creates a passkey (`userVerification: "required"`, ES256). PilotLog stores a **PilotLog-signed binding**
   `{publicKey, keyId, legal name, certificate number, evidence refs, check date, BE/BS flags}` off-chain.
5. The CFI's **school admin approves** with their own passkey (`schoolEnrollCfi`). Only `keyId`, `cfiRef` and `schoolId`
   go on-chain.
6. Re-verification runs yearly and on RE-date change; revocation follows certificate action or offboarding.

### 3.6 Lost device, rotation, synced vs device-bound

- **Rotation:** the school enrolls the new key under the same `cfiRef`, then revokes the old one.
- **Lost or stolen device:** the school admin runs `schoolRevokeCfi`, or the CFI runs `selfRevoke` from a synced copy.
  Earlier signatures stay valid (seq rule); later ones are impossible.
- **Lost school-admin device:** root runs `rootSetSchoolAdmin`, or the admin hands over with `schoolRotateAdmin` while they
  still have it. Replaced admin keys are retired forever.
- **Synced vs device-bound:** the authenticator's **BE** (backup-eligible) and **BS** (backed-up) flags are recorded at
  registration and **on every signature** (implemented in staging). Synced passkeys live in the CFI's
  iCloud/Google account. Losing a phone is then not a key compromise, but an account takeover is. v1 accepts both
  kinds and records which one was used. Requiring device-bound keys is a policy switch (§13, decision D3).

## 4. Signing a specific entry version

### 4.1 Canonical entry (`src/canonical.mjs`)

`entryHash = SHA-256("pilotlog.entry.v1\n" ‖ JCS(normalized entry))`. The fixed schema (every key always present) is
`entryId`, `entrySalt` (32 random bytes), `date`, aircraft, `from`/`to`/`route`, the time fields in **integer tenths**,
landings, approaches, `maneuvers` (sorted set) and `remarks`, using RFC 8785 JCS, NFC normalization, and upper-cased
identifiers. PII (names, certificate numbers, emails) is rejected from the entry; it lives in the signature block.
`entrySalt` stops brute force of low-entropy entries. A known-answer test pins v1, and any change ships as `v2`.

### 4.2 Versions, lock-on-sign, and superseding edits

- Each logical entry is a **lineage** of versions 1, 2, 3, … Each version is a distinct canonical entry with its own
  `entryId`/`entrySalt`, so it has its own `entryHash`.
- **A signed version locks.** It can't be edited or re-signed (server `409`; on-chain, `(entryHash, keyId)` is recorded once).
- **An edit creates version n+1,** whose signature block names `entryVersion = n+1` and `supersedes = entryHash(n)`.
  It needs a **new** signature. Version 1 supersedes nothing, and every later version must name its predecessor (enforced).
- **The old signature stays valid only for the old version.** It covers the old `entryHash` and the old
  `entryVersion`, so attaching it to the new version fails verification (tested).
- **States shown in the UI and on the printable record** (`src/record.mjs::verifyRecord`):
  `unsigned` (editable) · `signed` (locked) · `superseded` (an older signed version with a newer version present;
  still valid for itself) · `invalid` (content, version, nonce, block or assertion mismatch).

### 4.3 What the passkey signs: server nonce plus signature block (reconciling the old design)

WebAuthn says the challenge MUST be randomly generated by the relying party. The 11-14 design used a deterministic
challenge equal to the statement being signed. **v2** keeps the statement binding and adds a server-random,
single-use nonce and the signature block:

```
signatureBlockCommit = SHA-256("pilotlog.sigblock.v1\n" ‖ salt32 ‖ JCS(signature block))
attestHash           = SHA-256("pilotlog.attest.v1\n"   ‖ serverNonce32 ‖ signatureBlockCommit)
challenge = endorseDigest = SHA-256(pad32("pilotlog:cfi-endorse:v2") ‖ contractAddr ‖ entryHash ‖ studentCommit ‖ attestHash)
```

- **Contract change:** `endorseEntry` takes one extra **private** input, `attestHash`. The circuit recomputes the digest
  and checks the challenge inside clientDataJSON against it. `attestHash` is never disclosed, so nonces and signature
  blocks never reach the public ledger. It costs +180 rows (113,115 → 113,295; still k=17, 86.4%).
- **Server rules (staging implements them):** the nonce is 32 random bytes, valid for 3 minutes, single use, and
  bound to (entry, CFI). It is issued only after the review-and-certify step (§5b), deleted on first use, and a new
  request invalidates the previous one.
- The entry, student, version, predecessor, signature block (name, certificate number, RE/expiration date, signing
  date, certification statement) and the deployment are all covered by one passkey signature.

### 4.4 Signature block (AC 61-65K format)

`/s/ 11-17-2026 J. J. Jones 987654321CFI RE 12-31-2026`, built by `signatureBlockLine` from
`{cfiName, certificateNumber, certificateType, currencyKind (RE|EXP), currencyDate, signedDate, statement, entryVersion, supersedes}`.
It is shown on the review screen and printed on every record. Signing is blocked when
`signedDate > currencyDate` (`normalizeSignatureBlock` throws, and the server returns 403). Endorsement text and reg
cites (e.g. A.10, 61.93(c)(3)) are a later slice. Training entries come first.

### 4.5 Per-environment RP ID and origin

The circuit hashes clientDataJSON in-circuit, so the origin is a **compile-time constant**: the suffix length is part
of the circuit's shape. `scripts/gen-contract.mjs` generates `cfi_endorse.compact` from the template for
`CFI_RP_ID`/`CFI_ORIGIN` and records them in `contract/managed/env.json`. All off-chain helpers read that file, so
nothing is hard-coded to the production domain. Each environment (staging, production) gets its own compile and
its own contract deployment. The committed build targets **staging**
(`cfi-passkey-staging-staging.up.railway.app`, 84-byte suffix). The staging server refuses to boot if its public
domain differs from the compiled RP ID.

### 4.6 WebAuthn client-data variants, authenticatorData, DER/COSE

Unchanged from the 11-14 design. Only profile `std-v1`
(`{"type":"webauthn.get","challenge":…,"origin":…,"crossOrigin":false}`) is accepted on-chain. Chrome's
`other_keys_can_be_added_here` triggers a single silent re-prompt. `crossOrigin:true` and `topOrigin` are rejected.
`authenticatorData` must be exactly 37 bytes with UP and UV set. DER signatures are parsed strictly and COSE/SPKI keys
are checked on-curve. Every assertion is pre-flighted off-chain before it is queued.

### 4.7 Replay and duplicates

| Replay attempt | Stopped by |
|---|---|
| Same assertion again (same deployment) | on-chain dedupe on `(entryHash, keyId)`, plus the server single-use nonce |
| Assertion moved to another entry, student, version, signature block or nonce | all are in the signed digest; in-circuit challenge check fails (tested) |
| Assertion moved to another deployment or action | contract address and domain tags are in the digest (tested) |
| Old challenge after a new one was issued | server deletes the old nonce; the pre-flight fails (tested in staging) |
| Low-S/high-S twin | dedupe is never on the signature (tested) |
| Root or school signature replay | idempotent-or-impossible ops plus retired keys (§3.2, tested) |

## 5. Signature binding: what each signature does and does not prove

### (a) It was made by a verified instructor

| Link | Mechanism | Where |
|---|---|---|
| Person ↔ certificate | FAA Airmen Inquiry match (name, certificate number, CFI rating) plus photo ID; RE/expiration date with evidence | off-chain at enrollment (§3.5; **stubbed** in staging) |
| Certificate ↔ passkey | PilotLog-signed binding record `{publicKey, keyId, name, cert #, evidence, date, BE/BS}` | off-chain |
| Passkey ↔ school | the school admin's passkey approves `schoolEnrollCfi(schoolId, keyId, cfiRef)` | **on-chain** (`cfiKeys[keyId] = {cfiRef, schoolId}`) |
| School ↔ PilotLog trust root | root key onboarded the school | **on-chain** (`schools`, root signature verified in-circuit) |
| Still trusted at signing time | key not revoked, school not revoked, RE date not passed | on-chain (key and school), off-chain (RE date, blocked at challenge) |

### (b) The instructor's intent

- **The UI supplies intent; the authenticator does not.** The staging flow is: the full rendered entry (date,
  aircraft, route, times, maneuvers, remarks, student, version, and predecessor if any) → the exact AC 61-65K
  signature block that will be applied → the certification statement *"I certify that I have reviewed this
  logbook entry, that it accurately records the training I gave, and that I am signing it with my own passkey."*
  with an unticked checkbox → a deliberate **Certify and sign with passkey** tap → the OS passkey prompt →
  a receipt showing the signature line, locked state and passkey kind. The server refuses to issue a challenge
  unless the certify flag and the exact statement text are posted. The statement is bound into the signature
  through `signatureBlockCommit`.
- **What WebAuthn actually attests, precisely:** a valid assertion proves that **someone in possession of this
  passkey's private key** produced a signature over this exact challenge, for this RP ID and origin, and that the
  authenticator **reports** UP (user present) and **UV (user verified: biometric or device PIN)**. `userVerification:
  "required"` is requested, and UV=1 is enforced by the server and in-circuit.
- **What it does not prove:** **who** the person is (the biometric match never leaves the device, and anyone enrolled
  on the phone, or anyone who knows the device PIN, passes UV); **what they read or understood** (the OS prompt is
  generic, and WebAuthn has no transaction-text display); or that the device is uncompromised. With synced passkeys,
  anyone controlling the sync account can sign. Identity comes from §5(a); intent comes from the review screen and
  certification step, logged by PilotLog. These are recorded facts, not cryptographic proofs.

### (c) The exact entry version

| Item | Value | On-chain | Off-chain |
|---|---|---|---|
| Canonical serialization | `"pilotlog.entry.v1\n" ‖ JCS(entry)` | – | stored with the entry |
| Entry hash | `SHA-256(canonical)` | `entryHash` in the record | stored |
| Version and predecessor | `entryVersion`, `supersedes` (in the signature block) | – (inside private `attestHash`) | stored; verified by `verifyRecord` |
| Server challenge | `serverNonce` (single use) | – (inside private `attestHash`) | stored with the signature |
| Signature block plus statement | JCS block plus salt → `signatureBlockCommit` | – | stored; printed |
| Student binding | `studentCommit` (salted) | yes | salt kept for selective disclosure |
| Passkey assertion | authenticatorData, clientDataJSON, DER signature, BE/BS | – (private circuit input) | **stored**: re-verifiable offline forever |
| On-chain record | `{entryHash, keyId, schoolId, studentCommit, seq}` | yes | tx hash stored |

Off-chain verification (`verifyRecord`) recomputes the entry hash from the stored readable entry, checks the version
and predecessor against the signature block, rebuilds the digest from the nonce, block and salt, and verifies the
stored assertion with the stored public key. This works with no chain at all. The chain record adds independent
tamper evidence of `entryHash` and timing.

### After an edit

- A signed entry is **locked**. Edits to a locked version are refused (staging: 409).
- An edit creates **version n+1** (`supersedes = entryHash(n)`), which is **unsigned** until the CFI reviews and signs it.
- The old signature remains valid **only for version n**. Presenting it for n+1 fails (`verifyRecord` reports `invalid`, and
  the circuit fails the challenge check). Version n shows **superseded**.
- The UI and printable record show `unsigned` / `signed · locked` / `superseded` / `invalid`.
- Tests: tampered entry, replayed signature onto another entry, replayed or old challenge, wrong version number,
  forged version in the stored block, old signature on a new version, and superseded status
  (`test/record.test.mjs`, `test/staging.test.mjs`).

## 6. Requirements from the e-signature brief (Eric, 2026-11-17 §4): status

| Requirement | Design | Staging prototype |
|---|---|---|
| Verified CFI identity bound to the key (Airmen Inquiry name plus cert #) | §3.5 | **stub** (no FAA calls) |
| AC 61-65K block on every signature (name, cert #, RE/expiration, date) | §4.4 | **yes** |
| Block signing after RE/expiration date | §3.5, §4.4 | **yes** (403; RE date editable in staging to test) |
| Review then certify before the passkey prompt, UV required | §5(b) | **yes** |
| Server-random challenge bound to the entry hash | §4.3 | **yes** (contract and circuit changed) |
| Lock on sign; corrections as superseding versions | §4.2 | **yes** |
| Record synced vs device-bound (BE/BS) | §3.6 | **yes** (at registration and on each signature) |
| Retention independent of the chain; readable entry is the record | §7 | design; staging memory is ephemeral (synthetic) |
| Printable PDF with verify QR | §7 | **yes**, browser "Save as PDF" of `/print/:id` with QR to `/verify/:entryHash` |
| Photo-ID check, PilotLog-signed binding record, re-verification | §3.5 | no |
| Endorsement text and reg cites; solo/checkride endorsements | §4.4 | no (deliberately out of scope until counsel) |

## 7. Records, retention, export and PDF

- **The readable entry is the record.** PilotLog stores, per entry version: canonical entry (+ `entrySalt`), signature
  block (+ salt), server nonce, the full WebAuthn assertion, the public key and binding record, BE/BS/UV flags, the
  review/certify event (timestamp, user agent), and the on-chain tx hash, if any.
- **Retention does not depend on the chain or the contract.** Every record can be verified offline with
  `verifyRecord`. CFI records are kept for at least 3 years and the student's entries for life, with export (JSON plus
  PDF) and backups that are part of PilotLog's normal DB backups.
- **Printable PDF:** entry, version and status, signature block line, certification statement, passkey kind and UV,
  entry hash, tx hash (labelled *supplemental*), and a QR code to the verify page. **Production PDF generation is
  currently disabled by the S2 gate.** Staging uses a print-styled HTML page ("Save as PDF"). A server-generated PDF
  for production is estimated in §14.

## 8. Proof service

### 8.1 Measurements (Preview)

Toolchain: Compact 0.36.0, ledger 9, native `midnight-proof-server` with `--num-workers 1`, on the box (not on staging).

Preview run 2026-11-17, 4:27–4:48 PM MST, contract `74f20099…b3bdc426` (9 circuits). Proof times are server-side
`proveTx`; fees are the indexer's `paidFees`.

| Circuit | k | prover key | proof time (1 worker) | fee (DUST) |
|---|---|---|---|---|
| 11-14 spike `endorseEntry` (for comparison) | 17 | 235 MB | 21.6 s | 0.448 |
| `endorseEntry` v2 (attestHash; 113,295 rows, 86.4%) | 17 | 235 MB | 22.9 s, 29.8 s; staging phone flow 28.2 s | 0.234, 0.234 |
| `schoolEnrollCfi` (school admin passkey check) | 17 | 235 MB | 24.7 s, 23.3 s, 26.8 s; staging 40.4 s | 0.067, 0.572, 0.233 |
| `schoolRevokeCfi` | 17 | 235 MB | 25.2 s | 0.234 |
| `rootOnboardSchool` (raw P-256 root signature) | 17 | 235 MB | 24.1 s, 18.0 s | 0.499, 0.654 |
| `rootRevokeSchool` | 17 | 235 MB | 23.8 s | 0.232 |
| `rootSetSchoolAdmin`, `rootSetKey`, `schoolRotateAdmin`, `selfRevoke` | 17 | 235 MB each | simulator-tested; not run on Preview | — |
| deploy (9 circuits) | — | — | — | 13.938 |

**Peak memory:** 3,094–3,137 MB per proof (sampled RSS) when the proof-server process is fresh for each proof.
**A long-lived process climbed to 3,939 MB and was killed by the 3.8 GB watchdog** on its third k=17 proof (two
`rootOnboardSchool`, then the first `schoolEnrollCfi`): memory is not released between proofs, apparently because
the prover keeps each circuit's key material loaded. All nine circuits are k=17 (235 MB
prover key each, ~2.1 GB of keys in total), so a worker that serves every circuit must either be recycled between
proofs (what the box worker does now, `PROOF_SERVER_RECYCLE=1`, ~2 s per restart) or be sized for several cached
circuits (≥ 6 GB). Fees vary per tx with Preview fee conditions (0.07–0.65 DUST); deploy cost rose from 7.10 to 13.94
DUST because the contract has 9 circuits instead of 5. Tx hashes are in the PR description.

**Circuit budget.** Every circuit stays within k=17; nothing had to be split further than one circuit per operation.
The P-256 check dominates, so even the admin circuits land at k=17. `endorseEntry` is the largest at 86.4% of k=17. Adding a second
client-data profile or more logic to it could push it to k=18 (≈2× memory and time), so variants go in separate circuits.

### 8.2 Hosting options

| Option | Pros | Cons |
|---|---|---|
| **A. Private service next to the app** (`--num-workers 1`, private networking only) | simple ops, same platform | RAM pricing; must never share the web app container |
| **B. Dedicated VM** (2 vCPU / 8 GB) running proof server + relayer | cheapest steady state, full control | patching and monitoring ourselves |
| C. Browser WASM proving | no server sees private inputs | minutes per proof and ~3 GB RAM; not viable on phones |
| D. Third-party proof server | zero ops | sees private inputs; availability not ours |

**Recommendation:** A for a pilot, B if volume grows. Never run the proof server inside the web app container.
**Staging** (this PR) runs the web app on a 0.25 vCPU / 0.5 GB Railway service with app sleeping enabled. The proof
server and relayer run on the box as `preview/worker.mjs`, which polls the staging app over HTTPS with a staging-only
token. CFI enrollment must finish on-chain (worker running) before the CFI can sign. Once signed, the readable record
is complete immediately and the on-chain endorsement is queued; if the worker is offline it shows "queued".

### 8.3 Memory headroom, workers, queueing

- **One worker needs a ≥ 4 GB container limit** if the process is recycled between proofs (3.1–3.2 GB measured peak
  plus headroom), or **≥ 6 GB** if one process serves many circuits without restarts (3.9 GB seen on the third proof
  in one process). Run `--num-workers 1` per container and scale out, not up. Alert or kill at ~3.8 GB RSS per worker.
- Queue: a Postgres job table (`cfi_chain_jobs`, unique on `(kind, endorsementKey | keyId)`), with states
  `queued → proving → submitted → final | failed(reason)`, exponential backoff and at most 3 proof attempts. Throughput
  is ≈150 endorse proofs per hour per worker. CFIs sign in bursts after lessons, so an async queue with visible status
  is enough. There is no synchronous proving in the request path; staging already works this way.
- The proof server's keys for this contract are baked into the worker image, not fetched at runtime.

### 8.4 Cost estimate (to verify before any rollout)

- Compute: one always-on 4–6 GB worker ≈ $40–80/month on Railway-class pricing, or ≈ $15–30/month on a dedicated VM.
  Scale-to-zero reduces this at the cost of a cold start of a few seconds.
- Fees: see §8.1 (0.07–0.65 DUST per tx on Preview; ~14 DUST to deploy). DUST is *generated* by held NIGHT (≈149 DUST/hour from 5,000 tNIGHT on Preview), so the steady-state
  cost is NIGHT held by the relayer, not a per-transaction spend. Mainnet parameters and how much NIGHT is needed are
  open. **Acquiring NIGHT is a spending decision that needs Holland's explicit approval.**
- Staging (this PR): the web service is capped at 0.25 vCPU / 0.5 GB and sleeps when idle; measured usage is in the PR.

### 8.5 Failure modes

| Failure | Effect | Handling |
|---|---|---|
| Proof server OOM / killed | job fails mid-proof | retry on another worker; alert on repeat; never co-locate with the app |
| Proof timeout / slow node | delayed on-chain status | backoff; status stays `proving`; the readable record is already complete |
| DUST exhausted | submissions fail | alert below a threshold; pause the queue; top-up is an ops action |
| RPC / indexer outage | cannot submit or confirm | queue holds; idempotent resubmit; UI shows "pending on-chain" |
| Duplicate race | second tx fails the dedupe assert | treat "already endorsed" as success if the record matches |
| Circuit assertion fails | bad input | the off-chain pre-flight should catch it; surface the reason, no retry |
| Ledger or SDK upgrade | contract or SDK incompatible | pinned toolchain; Preview canary first; migration plan (§13) |
| Unsupported client-data profile | assertion unusable on-chain | one silent re-prompt (Chrome); otherwise explain; record still signed off-chain |
| Staging app slept and restarted | in-memory synthetic data is reset | expected for the prototype; re-enroll (phone test steps say so) |

## 9. Verification by third parties

Anyone holding the readable record (entry plus `entrySalt`, signature block plus salt, server nonce, WebAuthn
assertion, public key) can verify it **offline** with `verifyRecord`: recompute `entryHash`, `signatureBlockCommit`,
`attestHash` and the challenge, then check the P-256 signature, rpIdHash, origin and UP/UV. No chain access is needed.
As supplemental tamper evidence, they can also recompute `endorsementKey` and read the on-chain record from the
indexer; validity then follows the seq rule in §3.3. The staging print page carries a QR code to `/verify/:entryHash`.

## 10. Privacy: what goes on-chain and what it still leaks

On-chain: root `keyId`s, school ids (salted), admin and CFI `keyId`s, `cfiRef`s (salted), revocation seqs, and
endorsement records (`entryHash`, `keyId`, `schoolId`, `studentCommit`, `seq`), plus tx timing. **No names,
certificate numbers, raw entries, signature blocks, nonces or public keys.** Circuit inputs (public key, authData,
signature, clientDataJSON, `attestHash`) stay private in the proof.

Residual leakage:
- **Linkability:** a stable `keyId` / `cfiRef` / `schoolId` exposes each CFI's and school's volume and timing
  (pseudonymous). Per-entry student salts keep a student's entries unlinkable.
- **Timing correlation:** tx times ≈ lesson end times. Batching submissions (e.g. hourly) reduces this.
- **The proof server sees private inputs** (public key, signature). We run it ourselves (§8.2).
- **Salt disclosure is irrevocable:** once a salt is revealed, that record is linkable forever.
- Losing `entrySalt` means the entry can no longer be matched to its on-chain record. It is stored with the entry
  and included in exports.

## 11. Threat model

| # | Threat | Mitigation |
|---|---|---|
| T1 | Forged CFI signature without the passkey | in-circuit P-256 ECDSA over authData ‖ SHA-256(clientDataJSON), UP+UV; key must be enrolled by its school |
| T2 | Phishing site gets the CFI to sign | rpIdHash and exact origin enforced in-circuit; browsers bind passkeys to the RP ID |
| T3 | Replay to another contract, action, student, entry, version or signature block | all are in the signed digest (§4.3, §4.7) |
| T4 | Replay of an old or captured challenge | server-random single-use nonce, 3-minute TTL, a new request invalidates the old one |
| T5 | Double recording via signature malleability | dedupe on `(entryHash, keyId)`, never on the signature |
| T6 | Entry edited after signing | signed versions lock; edits are new versions; the old signature fails on the new version |
| T7 | Stolen or lost CFI device | school revoke or self revoke; seq ordering; dispute marking (open) |
| T8 | **Root key compromise** (onboard rogue schools, swap admins) | offline key, ideally on a YubiKey with PIN; 2 root keys in separate places; `rootSetKey` removal; ceremony runbook (§3.4); on-chain monitoring of every root op |
| T9 | **Root key loss** (both copies) | no recovery path in the contract by design; new deployment and migration (§13). Backup key stored separately |
| T10 | School admin compromise (enroll rogue CFIs in that school) | blast radius is one school; root replaces the admin; enrollment audit log; per-school revocation does not affect others |
| T11 | A school acting on another school's CFI | per-school asserts in every school circuit (tested) |
| T12 | Relayer or server compromise | holds no authority: cannot enroll, revoke or sign; can delay or drop txs, or show a misleading review screen (T15) |
| T13 | Contract maintenance authority compromise (verifier key swap) | hold offline like the root key; monitor on-chain verifier keys; consider giving up the authority once stable |
| T14 | Rogue CFI enrollment (not a real CFI) | Airmen Inquiry check plus photo ID before the school enrolls (§3.5; stubbed in staging) |
| T15 | The review screen shows something other than what is signed | the server renders the canonical entry it hashes; the record stores the exact block and entry; independent verify page. Residual risk: a compromised server could show one thing and hash another, which WebAuthn cannot detect |
| T16 | Coerced, careless or impersonated CFI (someone else with the unlocked device) | out of scope for cryptography: WebAuthn proves possession of the key and a UV gesture, not identity or attention (§5) |
| T17 | Synced passkey cloud account takeover | BE/BS recorded per signature; policy option to require device-bound keys (D3); revoke |
| T18 | Signing after certificate or recent-experience expiration | server block on `signedDate > currencyDate` (staging); production needs a verified date source (§3.5) |
| T19 | Privacy loss through linkability | per-entry salts, batching, no PII in hashes |
| T20 | Network or SDK breaking upgrade | pinned versions; Preview canary; redeploy procedure |
| T21 | Users mistake the prototype for a legal endorsement | "Prototype — not an FAA endorsement" banner on every staging page and printout; no claims about regulatory status anywhere |

## 12. Rollout gates

1. **G0 (this PR):** design, isolated module, simulator tests, Preview run, real-device staging with synthetic data.
   No wiring into the PilotLog app.
2. **G1 security review** of the circuits, digests and helpers (internal plus an external Compact reviewer).
3. **G2 real-device matrix** on staging (§15): iPhone Face ID, Mac/iPad Touch ID, Android fingerprint, PIN fallback;
   record client-data profiles and BE/BS; decide D3.
4. **G3 legal and regulatory review:** counsel and, if needed, the FAA decide whether and how a passkey signature may be
   used for logbook entries. Until then the existing endorsement flow stays the record, and this feature is labelled a
   prototype.
5. **G4 proof service:** load test (burst of 50), OOM and kill drills, DUST alerting, runbook.
6. **G5 mainnet decision:** NIGHT acquisition (spending, needs explicit approval), root key ceremony, maintenance
   authority custody, deploy, publish the address.
7. **G6 limited flag-on** for design-partner schools; kill switch = flag off.

## 13. Open questions and decisions for Holland

- **D1 Root key custody:** two YubiKeys (primary plus backup in a separate location) with 1-of-2 authority, or a
  Shamir split of a software key? Recommendation: two YubiKeys.
- **D2 Revoked school's past endorsements:** keep them valid (current seq rule) with an explicit dispute marking for
  fraud, or invalidate them all on revocation?
- **D3 Synced vs device-bound passkeys:** accept both and record which (current), or require device-bound for CFIs?
- **D4 Identity vendor** for the photo-ID check, and whether to use the Airmen Inquiry download file or a manual check.
- `disputeEndorsement` semantics and who may call it (root only, or the school too).
- Contract migration path for a breaking ledger version or root key loss.
- Should the student co-sign? That doubles proving cost.
- Batching endorsements per tx to cut fees and timing leakage.
- Mainnet DUST economics, NIGHT requirements and relayer key custody.

## 14. Estimate (revised 2026-11-17)

Engineering time, one engineer, after G0. Ranges reflect unknowns in review feedback and device results.

| Work | Estimate |
|---|---|
| G1 security review fixes (circuits, digests) | 3–5 days, plus external reviewer lead time |
| G2 device matrix on staging, client-data profile fixes, decide D3 | 2–4 days |
| Production identity verification (Airmen Inquiry data, photo ID vendor, binding record, re-verification) | 6–10 days |
| App integration: Postgres schema (lineages, versions, signatures, nonces, jobs), review-and-certify UI, lock and supersede in the real logbook, school admin console | 10–15 days |
| Root key ceremony tooling (offline signer script, runbook dry run with a synthetic key) | 2–3 days |
| Proof service and relayer as a private service, queue, alerting, drills (G4) | 5–8 days |
| Server-side PDF with verify QR (production PDF is disabled by the S2 gate until it lifts) | 2–3 days |
| Endorsement text and reg cites (after counsel) | 3–5 days |
| **Total to a limited design-partner pilot (G6)** | **≈ 33–53 engineering days**, plus legal review (G3) and the mainnet spending decision (G5), which are not engineering-time-bound |

## 15. Staging environment (real devices)

- URL: `https://cfi-passkey-staging-staging.up.railway.app` (Railway-provided domain; RP ID = that host).
- Project `pilotlog-staging`, service `cfi-passkey-staging`, capped at 0.25 vCPU / 0.5 GB with app sleeping. In-memory
  synthetic data only; no database, no production access. Hard cleanup Nov 22.
- Synthetic school A is pre-onboarded on Preview by a synthetic root key. Enrollment is approved by school A's
  synthetic admin key, held by the worker on the box (staging only; in production the school admin approves with
  their own passkey).
- Device test matrix and phone test steps are in the PR description.
