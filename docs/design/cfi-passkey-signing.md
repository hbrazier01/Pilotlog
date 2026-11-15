# CFI passkey signing of logbook entries on Midnight — production design

Status: **DRAFT for review. Not approved for production.** Implementation in this PR is isolated
(`pilotlog-midnight/`), behind `PILOTLOG_CFI_MIDNIGHT=1`, synthetic data, Midnight Preview testnet only.
Owner: Holland Brazier. Last updated: 2026-11-14.

## 1. Goal and non-goals

**Goal.** A CFI endorses a specific student logbook entry with their device passkey (WebAuthn,
ES256 / P-256). A Midnight Compact contract verifies the passkey signature *in-circuit* and records a
public, tamper-evident, PII-free endorsement record that anyone can later check against the entry.

**Non-goals (for v1).** Replacing the FAA-required endorsement wording/signature rules (legal review is
a rollout gate, §9); putting entry contents on-chain; requiring CFIs or students to hold a Midnight wallet
or tokens; browser-side ZK proving.

**Why this is feasible (from the spike, 2026-11-14).** Compact 0.36.0 ships `secp256r1EcdsaVerify` and
SHA-256 (`persistentHash`), so the whole WebAuthn check (challenge, clientDataJSON, rpIdHash, UP/UV flags,
ECDSA) runs in-circuit. A Preview deploy accepted a valid endorsement and the circuit rejected a tampered one.
Proof: 21.6 s on proof server 9.0.0 (1 worker), peak RSS 3,165 MB. The registry contract in this PR
re-ran on Preview: 19.6 s, peak 3,235 MB (§5.1).

## 2. Architecture overview

```
CFI browser (passkey)            PilotLog server                         Midnight
───────────────────────          ─────────────────────────────           ──────────────────────
1. GET /entries/:id/sign  ─────► canonicalize entry → entryHash
                                 studentCommit (salted)
                         ◄─────  digest = endorseDigest(contract, entryHash, studentCommit)
2. navigator.credentials.get({challenge: digest, rpId, userVerification:"required"})
3. POST assertion        ─────►  parse + pre-flight (DER→r,s; profile check; off-chain verify)
                                 enqueue job (idempotent on endorsementKey)
                                 proof worker → proof server (≥4 GB) → balance with DUST → submit ───► endorseEntry()
                         ◄─────  status: queued → proving → submitted → final (tx hash)
```

PilotLog runs a **relayer wallet** that pays DUST fees and submits; neither CFI nor student needs tokens.
The relayer cannot forge endorsements (it has no passkey); it can only delay or drop them (§8).

## 3. CFI key enrollment and revocation

### 3.1 Registry (on-chain + off-chain)

On-chain (`contract/cfi_endorse.compact`):

| Ledger field | Type | Meaning |
|---|---|---|
| `admin` | `Bytes<32>` | `SHA-256(pad32("pilotlog:cfi-admin:v1") ‖ sk)` — commitment to the maintenance authority's secret |
| `cfiKeys` | `Map<keyId, cfiRef>` | enrolled keys. `keyId = SHA-256(LE32(x) ‖ LE32(y))`; **the public key itself is never on-chain** |
| `revokedAtSeq` | `Map<keyId, Uint<64>>` | revocations, with the sequence number at which they took effect |
| `endorsements` | `Map<endorsementKey, {entryHash, keyId, studentCommit, seq}>` | one record per (entry, CFI) |
| `seq` | `Counter` | monotonic; bumped by every endorsement and revocation |

`cfiRef = SHA-256("pilotlog.cfi.v1\n" ‖ salt32 ‖ cfiId)` is a stable salted pseudonym for the CFI, shared by
all of that CFI's keys so rotations are linkable by PilotLog (and by anyone who learns the salt), but not to
the CFI's identity.

Off-chain (future PilotLog tables, **not created in this PR**): `cfi_signing_keys(cfi_id, credential_id,
cose_public_key, key_id, enrolled_tx, revoked_tx, status)`, `cfi_ref_salts(cfi_id, salt)`, plus the
verification of the CFI's certificate (manual review against the FAA airmen registry for v1).

### 3.2 Who can enroll and revoke

| Action | Authority | Circuit | Notes |
|---|---|---|---|
| Enroll key | Maintenance authority (admin secret, witness) | `enrollCfi(keyId, cfiRef)` | only after off-chain CFI certificate verification; a revoked keyId can never be re-enrolled |
| Revoke key | Admin | `revokeCfi(keyId)` | for lost devices, certificate suspension, offboarding |
| Revoke own key | The CFI, with that passkey | `selfRevoke(pk, assertion over revokeDigest)` | no admin needed; works even if PilotLog is unavailable to the CFI as long as anyone relays the tx |
| Rotate admin | Admin | `rotateAdmin(newCommit)` | key ceremony; old secret loses authority immediately |

The admin secret is **separate** from the Midnight contract *maintenance authority* (the signing key
midnight-js registers at deploy, which can replace verifier keys). Both must be protected; see §8 T7.

Admin authentication uses the standard Compact pattern: the admin secret is a private witness and the
circuit checks `admin == H(tag ‖ sk)`; the secret is never disclosed. For production the secret lives in a
KMS/HSM-backed signer on the relayer; a 2-of-N scheme (multiple admin commitments + threshold) is an open
question (§10).

### 3.3 Lost device, rotation, and keeping history valid

- **Rotation:** enroll the new key under the same `cfiRef`, then revoke the old one. Order matters only to
  avoid a gap; both can be in flight.
- **Lost / stolen device:** admin `revokeCfi` (or the CFI `selfRevoke` from another synced device). Endorsements
  after `revokedAtSeq[keyId]` are impossible; `endorseEntry` asserts the key is not revoked.
- **Past endorsements stay valid:** each endorsement records `seq`; it is valid iff
  `keyId ∈ cfiKeys ∧ (keyId ∉ revokedAtSeq ∨ endorsement.seq < revokedAtSeq[keyId])`. Revocation never deletes
  records. Verifiers apply this rule (implemented in tests).
- **Fraudulent endorsements made before revocation** (device stolen, used, then reported) cannot be singled out
  by the current contract. Planned: admin `disputeEndorsement(endorsementKey, reasonHash)` that marks records
  without deleting them (open question §10; not implemented).
- **Synced passkeys** (flags BE/BS) mean the private key is in the CFI's iCloud/Google account. Losing a phone
  is then not a key compromise, but compromising the cloud account is. v1 accepts synced passkeys (most CFIs
  will have nothing else); policy may require device-bound keys later.

## 4. Signing a specific logbook entry

### 4.1 Entry hash canonicalization (`src/canonical.mjs`)

`entryHash = SHA-256( "pilotlog.entry.v1\n" ‖ JCS(normalized entry) )`

- **Fields (fixed schema, every key always present):** `entryId` (opaque UUID), `entrySalt` (32 random bytes,
  hex), `date` (YYYY-MM-DD), `aircraftIdent`, `aircraftType`, `from`, `to`, `route[]`, `totalTenths`,
  `dualReceivedTenths`, `picTenths`, `soloTenths`, `nightTenths`, `crossCountryTenths`,
  `actualInstrumentTenths`, `simInstrumentTenths`, `groundTenths`, `landingsDay`, `landingsNight`,
  `approaches`, `maneuvers[]`, `remarks`.
- **Excluded on purpose:** student/CFI names, certificate numbers, emails (PII). The helper throws if they are
  present. Student binding is via `studentCommit` (§4.4); CFI binding via `keyId`.
- **Encoding:** RFC 8785 (JCS) subset — sorted keys, no whitespace, strings and safe integers only.
  Hours are **integer tenths** (`hoursToTenths("1.3") = 13`) so floats never reach the hash. Strings are NFC
  normalized and whitespace-collapsed; identifiers are upper-cased; `maneuvers` is a sorted set.
- **Why `entrySalt`:** without it an observer could brute-force low-entropy entries (date, tail, KAPA→KAPA, 1.3)
  against public `entryHash` values. The salt is stored with the entry off-chain.
- **Versioning:** the prefix is the version. Any schema/normalization change ships as `pilotlog.entry.v2`;
  verifiers dispatch on the version stored with the entry. A known-answer test pins v1.
- **Edits after endorsement** produce a new hash. The old endorsement remains on-chain for the old version; the
  UI shows "endorsed version differs — request re-endorsement".

### 4.2 What the passkey signs

The WebAuthn challenge is a 32-byte digest, computed identically off-chain and in-circuit:

`endorseDigest = SHA-256( pad32("pilotlog:cfi-endorse:v1") ‖ contractAddress ‖ entryHash ‖ studentCommit )`

`revokeDigest  = SHA-256( pad32("pilotlog:cfi-revoke:v1")  ‖ contractAddress ‖ keyId )`

The circuit reads `contractAddress` from `kernel.self()`, so an assertion for one deployment (e.g. Preview)
cannot be replayed on another (mainnet), and the domain tags stop an endorsement assertion from being used as
a revocation (tested).

### 4.3 WebAuthn client-data variants

The circuit hashes clientDataJSON in-circuit, so it needs a fixed byte layout. It accepts exactly profile
**`std-v1`**: `{"type":"webauthn.get","challenge":"<43 b64url>","origin":"https://pilotlog.digitalaviationpool.com","crossOrigin":false}`
(36-byte prefix ‖ 43-byte challenge ‖ 74-byte suffix). `src/webauthn.mjs::classifyClientData` recognises:

| Profile | Seen when | On-chain | Action |
|---|---|---|---|
| `std-v1` | Chrome, Safari, Firefox top-level (normal case) | yes | submit |
| `chrome-extra-keys` | Chrome randomly appends `"other_keys_can_be_added_here":"do not compare clientDataJSON against a template…"` | no | silently re-prompt once; next assertion is almost always `std-v1` |
| `no-crossorigin` | some older authenticators/browsers omit `crossOrigin` | no | candidate **second circuit** (`endorseEntryNoCo`, 52-byte suffix) if telemetry shows it matters |
| `cross-origin` | `crossOrigin:true` (iframe) | no | reject (signing is top-level only) |
| `top-origin` | `topOrigin` present (cross-origin iframe, L3) | no | reject |
| `non-canonical` | reordered keys / escaping / whitespace | no | log + unsupported |
| `invalid` | wrong type, origin, or challenge | no | reject |

Each extra profile costs one more circuit (~235 MB prover key, ~2.7 KB verifier key on-chain). Passport's
variable-JSON experiment is a possible later alternative. `authenticatorData` must be exactly 37 bytes (no
extensions/attested data) and have **UP and UV** set (checked in-circuit through a hint decomposition).

### 4.4 Binding to student and entry without PII

`studentCommit = SHA-256("pilotlog.student.v1\n" ‖ salt32 ‖ studentId)`, included in the signed digest and in
the stored record. The student (or PilotLog on their behalf) can later reveal `(studentId, salt)` to an examiner
to prove the endorsement was for them; nobody else learns who the student is.

**Decision:** in production derive a **per-entry** salt, `salt_e = HMAC-SHA256(studentMasterSalt, entryId)`, so
public records for one student are not linkable to each other (§7), while the student can still disclose one
entry (give `salt_e`) or all (give the master salt). The helper accepts any 32-byte salt; the derivation is not
implemented yet.

### 4.5 DER and COSE conversion (off-chain)

- `navigator.credentials.get` returns an ASN.1 **DER** `ECDSA-Sig-Value`; the circuit needs `(r, s)` scalars.
  `derToRawSignature` is strict (minimal lengths and integers, no negatives, no trailing bytes, `1 ≤ r,s < n`).
- The CFI's public key is stored at registration as a **COSE_Key** (`kty=2 EC2, alg=-7 ES256, crv=1 P-256`,
  `-2`=x, `-3`=y) or SPKI (`getPublicKey()`); `coseKeyToPoint` / `spkiToPoint` return `(x, y)` and check the
  point is on P-256.
- Every assertion is pre-flighted with Node's ECDSA verify before queueing, so bad input never costs a proof.

### 4.6 Replay and duplicate protection

- **Same deployment:** `endorsementKey = SHA-256(pad32("pilotlog:cfi-endorsement:v1") ‖ entryHash ‖ keyId)`;
  the circuit asserts it is unused. **Each (entry, CFI) is recorded once.** A second CFI can co-endorse.
- **Cross-deployment / cross-action / cross-student:** contract address, domain tag, and `studentCommit` are in
  the signed digest (§4.2).
- No server nonce is needed: the challenge is deterministic by design (it *is* the statement being signed);
  freshness comes from on-chain dedupe. Anyone who obtains an assertion can only submit the same endorsement.
- **Low-S / high-S:** `secp256r1EcdsaVerify` accepts both `(r, s)` and `(r, n−s)`. We never use the signature as
  an identifier or dedupe key — dedupe is on the entry and key — so malleation cannot double-record (tested:
  the high-S twin of an accepted assertion is rejected as a duplicate).
- The relayer job queue is idempotent on `endorsementKey` as well.

## 5. Running the proof service

### 5.1 Measurements (Preview, 2026-11-14)

| Circuit | k | rows | prover key | proof time (1 worker) |
|---|---|---|---|---|
| spike `endorseEntry` | 17 | 103,532 | 235 MB | 21.6 s, peak RSS **3,165 MB** |
| `endorseEntry` (this PR, Preview run) | 17 | 113,115 | 235 MB | 19.6 s server-side (25.4 s `proveTx` round trip), peak RSS **3,235 MB** |
| `selfRevoke` | 17 | 107,277 | 235 MB | ≈ endorse |
| `enrollCfi` / `revokeCfi` / `rotateAdmin` | 13 | ~4,090 | 11 MB | 0.8 s |

`endorseEntry` uses 86% of the k=17 row budget; adding a second profile in the same circuit or more logic could
push it to k=18 (≈2× memory and time). Keep the circuit lean; prefer separate circuits for variants.

### 5.2 Hosting options

| Option | Pros | Cons |
|---|---|---|
| **A. Private service next to the app** (Railway service, `midnightntwrk/proof-server:9.0.0`, private networking only) | simple ops, same platform | Railway RAM pricing; must not share the app container |
| **B. Dedicated VM** (e.g. 2 vCPU / 8 GB) running the proof server + relayer | cheapest steady state, full control | patching/monitoring ourselves |
| C. Browser WASM proving | no server trust for private inputs | 4–5 min per proof and ~3 GB RAM on our box; not viable on phones |
| D. Third-party/Midnight-hosted proof server | zero ops | sees private inputs; availability not under our control |

**Recommendation:** A for pilot, B if volume grows. Never run the proof server inside the web app container.

### 5.3 Memory headroom, workers, queueing

- **One worker = ≥ 4 GB container limit** (3,165–3,235 MB measured peak + ~25% headroom); 5–6 GB preferred. Run with
  `--num-workers 1` per container and scale horizontally; do not raise workers in one container without raising
  memory proportionally. Keep an RSS kill switch/alert at ~3.8 GB per worker.
- Queue: Postgres job table (`cfi_endorsement_jobs`, unique on `endorsement_key`), states
  `queued → proving → submitted → final | failed(reason)`, exponential backoff, max 3 proof attempts.
  Throughput ≈ 150 endorse proofs/hour/worker; CFIs sign in bursts after lessons, so a queue with user-visible
  status is enough — no synchronous proving in the request path.
- Proof server keys (~480 MB for this contract) are baked into the worker image, not fetched at runtime.

### 5.4 Cost estimate (to verify before rollout)

- Compute: one always-on 4–6 GB worker ≈ $40–80/month on Railway-class pricing, or ≈ $15–30/month as a
  dedicated VM. Scale-to-zero cuts this further at the cost of cold starts (~seconds to load keys).
- Fees (Preview, indexer `paidFees`): endorse 0.448 DUST, enroll 0.351, revoke 0.329, deploy 7.10 (5 circuits;
  the spike's 1-circuit deploy was 1.72). DUST is *generated* by held NIGHT
  (≈149 DUST/hour from 5,000 tNIGHT on Preview), so the steady-state cost is NIGHT held by the relayer, not spend
  per tx. Mainnet parameters and the NIGHT needed are an open question; acquiring NIGHT is a spending decision
  that needs Holland's explicit approval.

### 5.5 Failure modes

| Failure | Effect | Handling |
|---|---|---|
| Proof server OOM / killed | job fails mid-proof | retry on another worker; alert on repeat; never co-locate with app |
| Proof timeout / slow node | delayed status | backoff; status stays `proving`; user can leave |
| DUST exhausted | submissions fail | alert below threshold; pause queue; top-up is an ops action |
| RPC / indexer outage | cannot submit or confirm | queue holds; idempotent resubmit; show "pending on-chain" |
| Duplicate race (two submits) | second tx fails the dedupe assert | treat "already endorsed by this CFI" as success if the record matches |
| Circuit assertion fails | invalid input | pre-flight should catch; surface reason, no retry |
| Network upgrade / ledger version change | SDK or contract incompatible | pinned toolchain; staging canary on Preview first; redeploy plan (§10) |
| Unsupported client-data profile | assertion unusable | re-prompt once (Chrome), else explain |

## 6. Verification by third parties

Given an entry (with `entrySalt`), `studentId` + salt, and the contract address, anyone can recompute
`entryHash`, `studentCommit` and `endorsementKey` for each enrolled `keyId` and read the record from the indexer;
validity follows the seq rule in §3.3. A PDF export can carry these values and a QR link to the explorer.

## 7. Privacy: what goes on-chain and what it still leaks

On-chain: `admin` commitment, `keyId`s, `cfiRef`s, `revokedAtSeq`, endorsement records
(`entryHash`, `keyId`, `studentCommit`, `seq`), plus tx timing. **No names, certificate numbers, raw entries or
public keys.** Circuit inputs (public key, authData, signature, clientDataJSON) stay private in the proof.

Residual leakage:
- **Linkability:** a stable `keyId` / `cfiRef` exposes each CFI's endorsement volume and timing
  (pseudonymous). With a stable `studentCommit`, a student's entries are linkable → hence per-entry salts (§4.4).
- **Timing correlation:** tx times ≈ lesson end times; combined with off-chain knowledge (a school's schedule)
  this can de-anonymise. Batching submissions (e.g. hourly) reduces this.
- **Proof server sees private inputs** (public key, signature). Run it ourselves (§5.2).
- **Salt disclosure is irrevocable:** once a student reveals a salt, that record is linkable forever.
- `entryHash` is not brute-forceable thanks to `entrySalt`; losing `entrySalt` means the entry can no longer be
  matched to its endorsement — store it with the entry and include it in exports.

## 8. Threat model

| # | Threat | Mitigation |
|---|---|---|
| T1 | Forged endorsement without the passkey | in-circuit P-256 ECDSA over authData ‖ SHA-256(clientDataJSON) with UV; key must be enrolled |
| T2 | Phishing site gets the CFI to sign | rpIdHash and exact origin enforced in-circuit; browsers bind passkeys to the RP ID |
| T3 | Replay to another contract / action / student | address + domain tag + studentCommit in the digest |
| T4 | Double recording via signature malleability | dedupe on (entry, key), never on the signature |
| T5 | Entry edited after signing | new hash; old endorsement doesn't match the new version |
| T6 | Stolen/lost device | admin or self revoke; seq ordering; dispute marking (planned) |
| T7 | Contract maintenance authority compromise (can swap verifier keys) | hold in HSM, monitor on-chain VKs against `expectedVk`, consider relinquishing authority after stabilization |
| T8 | Admin secret compromise (enroll rogue keys) | KMS/HSM, `rotateAdmin`, enrollment audit log, consider threshold admins |
| T9 | Relayer censorship / delay | cannot forge; CFI can submit via another relayer (same assertion is valid); status visible |
| T10 | Rogue CFI enrollment (not a real CFI) | off-chain certificate verification before `enrollCfi`; revoke on discovery |
| T11 | Coerced or careless CFI | out of scope for crypto; UI shows the exact entry; UV required |
| T12 | Privacy loss through linkability | per-entry student salts, batching, no PII in hashes |
| T13 | Synced-passkey cloud account takeover | policy option to require device-bound keys; revoke |
| T14 | Network/SDK breaking upgrade | pinned versions; Preview canary; redeploy procedure |

## 9. Rollout gates

1. **G0 (this PR):** design + isolated module + simulator tests + one Preview run. No app wiring.
2. **G1 security review** of the circuit, digest construction and helpers (internal + external Compact reviewer).
3. **G2 real-browser matrix** on a staging RP ID/origin (contract compiled per environment): Chrome/Safari/Firefox,
   iOS/Android, platform + roaming authenticators; record profile telemetry; decide on a `no-crossorigin` circuit.
4. **G3 legal:** confirm a passkey-backed endorsement satisfies 14 CFR 61.51/61.189 and AC 120-78A expectations
   for electronic signatures (see brief 2026-11-02); keep the existing endorsement flow as the record of truth until then.
5. **G4 proof service:** load test (burst of 50 endorsements), OOM/kill drills, DUST alerting, runbook.
6. **G5 mainnet decision:** NIGHT acquisition (spending — explicit approval), key ceremony for admin and maintenance
   authority, deploy, publish contract address.
7. **G6 limited flag-on** for design-partner CFIs; kill switch = flag off (app falls back to the existing flow).

## 10. Open questions

- Threshold/multi-admin vs single admin secret; who holds it operationally.
- `disputeEndorsement` semantics and who can call it.
- Accept synced passkeys (BE/BS) or require device-bound keys for CFIs?
- Per-environment RP ID/origin: compile-time constants per contract (current) vs a hashed origin parameter.
- Mainnet DUST economics and NIGHT requirements; relayer key custody.
- Upgrade path when Midnight ships a breaking ledger version (contract migration vs maintenance-authority VK swap).
- Should the student also co-sign (two-party endorsement) — doubles proving cost.
- Batching endorsements per tx to cut fees and timing leakage.
