# Preview testnet runs

## Run 2: layered admin — 2026-11-17 (4:27–4:48 PM MST)

Template `contract/cfi_endorse.compact.in` compiled for the staging RP ID/origin
(`cfi-passkey-staging-staging.up.railway.app`) with Compact 0.36.0: 9 circuits, all k=17. Same throwaway wallet, free
faucet tNIGHT only. **Synthetic** root key (software P-256), synthetic school admin and CFI passkeys, synthetic entries.
Proof server 9.0.0 native, 1 worker, 3.8 GB RSS kill switch, **recycled before every proof** (see below).

Contract address: `74f20099add308890e6e46b9404e78f08524f89f04792c9e9066ea79b3bdc426`

| Step | Expect | Tx hash | Block | Result | Fee (DUST) | Proof |
|---|---|---|---|---|---|---|
| Deploy (synthetic root keyId as constructor arg) | ok | `5345c45743917f6913a9f6a75bb6f28cec36a12960304881cfc5f6928d820373` | 157035 | SucceedEntirely | 13.938 | none |
| `rootOnboardSchool` A (staging demo school) | ok | `e78dd7e4c887399090c29cc9f11b1f515af16f6952991b5dc8cde16e8b991e8a` | 157044 | SucceedEntirely | 0.499 | 24.1 s |
| `rootOnboardSchool` B | ok | `f3472848c300955bc86d46eb2b3974924de0ebc09431cb5459281b7043b11e0b` | 157052 | SucceedEntirely | 0.654 | 18.0 s |
| `schoolEnrollCfi` A → CFI A1 | ok | `8c1da9d6a23fd2e52c7d698d2606e6b73a038fe4a78857b7342d2141d7e5d168` | 157125 | SucceedEntirely | 0.067 | 24.7 s |
| `schoolEnrollCfi` B → CFI B1 | ok | `92add9f2244df044d8bdd52983e13665735023ca863f6dbe257f164f30244ccb` | 157134 | SucceedEntirely | 0.572 | 23.3 s |
| `endorseEntry` A1 (valid, with attestHash) | ok | `7bfbe69b48738099653501b81eb207063b924f6b3798ad006f20d53156c2afb7` | 157143 | SucceedEntirely | 0.234 | 22.9 s |
| `endorseEntry` A1, entryHash tampered | reject | — | — | `challenge != base64url(digest)` | 0 | — |
| School B revokes A's CFI | reject | — | — | `CFI belongs to another school` | 0 | — |
| School A admin key attempts `rootRevokeSchool` | reject | — | — | `not a root key` | 0 | — |
| `schoolEnrollCfi` A → CFI A2 | ok | `a83bd4fa659a1527e8d51aa1fe13ce93bf449f8ff4b6e724028addc712f73e7d` | 157213 | SucceedEntirely | 0.233 | 26.8 s |
| `schoolRevokeCfi` A → A2 | ok | `a83c9393430aed001fe6f13cbd7e128d946a8636023c9f25078e404a62e7fd98` | 157223 | SucceedEntirely | 0.234 | 25.2 s |
| `endorseEntry` A2 after revoke | reject | — | — | `CFI key revoked` | 0 | — |
| `rootRevokeSchool` B | ok | `dd31fd5af8a911dbd118e995ed44229d2b3f02e35db7a399e0f9fe82df98321d` | 157235 | SucceedEntirely | 0.232 | 23.8 s |
| `endorseEntry` B1 after its school is revoked | reject | — | — | `CFI's school revoked` | 0 | — |
| `endorseEntry` A1 after school B revoked (isolation) | ok | `7ba7832c78a3c39d6b9074395a84075e42780d2d422190f6795d42d0706b06a7` | 157248 | SucceedEntirely | 0.234 | 29.8 s |

Read-back from the indexer: 1 root key, 2 schools (1 revoked, at seq 2), 3 CFI keys (1 revoked), 2 endorsements
(both of A1's entries; the tampered and post-revoke ones are absent), seq 4. A1 belongs to school A.

Staging phone-flow transactions on the same contract (headless Chrome virtual authenticator, 4:56–4:58 PM MST):
`schoolEnrollCfi` `8dccfbdc836bd30603b2929712f217b7469c8291587114fe7057f52ddbe31751` (proof 40.4 s) and `endorseEntry`
`a30d4dbddb059d94daf952518057e10113fdb385361f6a8046dfb5703b5466c9` (proof 28.2 s).

**Memory.** Fresh process per proof: 3,094–3,137 MB peak RSS (sampled). The first attempt used one long-lived process,
which reached 3,939 MB on its third k=17 proof and was killed by the 3.8 GB watchdog. The affected steps were re-run
with `PROOF_SERVER_RECYCLE=1` (restart ~2 s). The runner process itself peaked at ~2 GB.

## Run 1: single-admin spike contract — 2026-11-14 (10:00–10:06 PM MST)

Contract `contract/cfi_endorse.compact` at this branch, compiled with Compact 0.36.0. Throwaway wallet funded
from the public Preview faucet (free tNIGHT); synthetic admin secret, synthetic passkey, synthetic entry.
Proof server 9.0.0 run natively, 1 worker, under a 3.8 GB RSS kill switch; stopped afterwards.

Contract address: `7a677f76769f9902ad23aa2e5dcbc7532d8deaf809e6b801e99ed65b678e33d7`

| Step | Tx hash | Block | Result | Fee (DUST, indexer `paidFees`) | Proof |
|---|---|---|---|---|---|
| Deploy (admin commitment as constructor arg) | `e60351f7b8a60e575707160bf8c4bb253ef6dd0a5b76c5760099700c0b986eea` | 117209 | SucceedEntirely | 7.0993 | none (DUST spend only) |
| `enrollCfi(keyId, cfiRef)` | `766806efa35e0e5780a6e3c84ea9017d7239ddc440edc21d5ea740da13c1d98c` | 117219 | SucceedEntirely | 0.3509 | 0.8 s |
| `endorseEntry` (valid) | `cb9522ec86a65624e12210b85f255c8fbe9e9a49e442a5c2234cb8b61b86f866` | 117234 | SucceedEntirely | 0.4483 | 19.6 s server-side (25.4 s round trip) |
| `endorseEntry` (entryHash byte 0 flipped) | none | none | **Rejected locally** in circuit execution: `failed assert: challenge != base64url(digest)` | 0 | not proved |
| `revokeCfi(keyId)` | `5a20a13e6b25b8518d36ba8368a99811e9e12037408814ffb055bcfce3e6d0af` | 117244 | SucceedEntirely | 0.3295 | 0.75 s |
| `endorseEntry` with the revoked key (new entry) | none | none | **Rejected locally**: `failed assert: CFI key revoked` | 0 | not proved |

Read-back from the indexer: `cfiKeys` = 1, `revokedAtSeq` = 1 (keyId `c347…e376` revoked at seq 1),
`endorsements` = 1 (the valid entry `44cd0bf6…8a9c`, recorded at seq 0, so it stays valid after the revocation),
the post-revocation entry is absent, `seq` = 2.

Peak proof-server RSS: **3,235 MB** (watchdog sample; 3,215 MB from the 0.5 s sampler). Node client peak RSS 1,831 MB.
Total fees from the wallet ≈ 8.23 DUST (deploy dominates: 5 circuits, two with k=17 verifier keys).

Explorer: `https://midnight-preview.subscan.io/extrinsic/0x<txHash>`.

Rejected cases never reach the network: midnight-js executes the circuit locally first, and a failed `assert`
aborts before proving. The same asserts are enforced by the proof, so a modified client could not get them
accepted either.
