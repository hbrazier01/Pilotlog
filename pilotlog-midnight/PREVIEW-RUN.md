# Preview testnet run — 2026-11-14 (10:00–10:06 PM MST)

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
