// Midnight PREVIEW TESTNET run of contract/cfi_endorse.compact with SYNTHETIC data.
//   deploy -> enrollCfi -> endorseEntry (valid) -> tampered endorse (must fail) -> revokeCfi
//   -> endorse with the revoked key (must fail) -> read back the public ledger.
//
// Requirements (all local; nothing here touches PilotLog production):
//   PILOTLOG_CFI_MIDNIGHT=1
//   CFI_MIDNIGHT_SEED_FILE=/path/to/throwaway-preview-wallet-seed.hex   (funded from the public faucet; NEVER printed)
//   a local proof server 9.0.0 on PROOF_SERVER (default http://127.0.0.1:6300)
//   full compile output in ../contract/managed (keys are gitignored: `COMPACTC=... npm run compile`)
// Resumable: progress and the synthetic admin secret / passkey live in preview/.state/ (gitignored).
import { WebSocket } from 'ws';
globalThis.WebSocket = WebSocket;
import { existsSync, readFileSync, writeFileSync, mkdirSync, copyFileSync, chmodSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import * as Rx from 'rxjs';
import { assertEnabled } from '../src/flag.mjs';
import { entryHash, studentCommit, cfiRef, endorseDigest, endorsementKey, adminCommitment, keyIdOf } from '../src/canonical.mjs';
import { assertionToCircuitArgs, coseKeyToPoint } from '../src/webauthn.mjs';
import { createSoftPasskey } from '../src/softPasskey.mjs';
import { toHex, fromHex, sha256 } from '../src/bytes.mjs';

assertEnabled();
const ENV = {
  walletNetworkId: 'preview', networkId: 'preview',          // PREVIEW ONLY (https://docs.midnight.network/relnotes/network)
  indexer: 'https://indexer.preview.midnight.network/api/v4/graphql',
  indexerWS: 'wss://indexer.preview.midnight.network/api/v4/graphql/ws',
  node: 'https://rpc.preview.midnight.network', nodeWS: 'wss://rpc.preview.midnight.network',
  faucet: undefined, proofServer: process.env.PROOF_SERVER ?? 'http://127.0.0.1:6300',
};
const seedFile = process.env.CFI_MIDNIGHT_SEED_FILE;
if (!seedFile || !existsSync(seedFile)) throw new Error('CFI_MIDNIGHT_SEED_FILE must point to a throwaway Preview wallet seed');

const STATE = new URL('./.state/', import.meta.url);
mkdirSync(new URL('contract/', STATE), { recursive: true, mode: 0o700 });
process.chdir(STATE.pathname); // level-db private state lands in .state/
const RES = new URL('results.json', STATE), SECRETS = new URL('synthetic-secrets.json', STATE);
const R = existsSync(RES) ? JSON.parse(readFileSync(RES, 'utf8')) : { network: 'preview', steps: {} };
const save = () => writeFileSync(RES, JSON.stringify(R, (k, v) => (typeof v === 'bigint' ? v.toString() : v), 2));
if (!existsSync(SECRETS)) {
  const pk = await createSoftPasskey();
  writeFileSync(SECRETS, JSON.stringify({ note: 'SYNTHETIC test-only secrets for a Preview run', adminSecret: toHex(randomBytes(32)), passkeyJwk: await pk.exportPrivateJwk(), cfiSalt: toHex(randomBytes(32)), studentSalt: toHex(randomBytes(32)) }));
  chmodSync(SECRETS, 0o600);
}
const S = JSON.parse(readFileSync(SECRETS, 'utf8'));
const adminSecret = fromHex(S.adminSecret, 32);
const passkey = await createSoftPasskey({ privateJwk: S.passkeyJwk });
const point = coseKeyToPoint(passkey.cose), keyId = keyIdOf(point);
const T0 = Date.now();
const log = (...a) => console.log(`[+${((Date.now() - T0) / 1000).toFixed(0)}s]`, ...a);

// Load the compiled contract through this directory's node_modules (one compact-runtime instance).
copyFileSync(new URL('../../contract/managed/contract/index.js', STATE), new URL('contract/index.js', STATE));
const { Contract, ledger } = await import(new URL('contract/index.js', STATE));
const { FluentWalletBuilder, WalletFactory, syncWallet, MidnightWalletProvider, initializeMidnightProviders } = await import('@midnight-ntwrk/testkit-js');
const { deployContract, findDeployedContract } = await import('@midnight-ntwrk/midnight-js-contracts');
const { CompiledContract } = await import('@midnight-ntwrk/compact-js');
const { ContractState } = await import('@midnight-ntwrk/compact-runtime');

// Wallet (testkit's build() logs the seed, so use buildWithoutStarting + startWalletFacade).
const seedHex = readFileSync(seedFile, 'utf8').trim();
const { wallet, seeds, keystore } = await FluentWalletBuilder.forEnvironment(ENV).withSeed(seedHex).buildWithoutStarting();
await WalletFactory.startWalletFacade(wallet, seeds);
await syncWallet(wallet, 5_000, 900_000);
const dust = async () => { const s = await Rx.firstValueFrom(wallet.state()); return Number(s.dust.balance(new Date()) / 10n ** 12n) / 1000; };
log('wallet synced; DUST', await dust());

const silent = { info() {}, debug() {}, warn: console.warn, error: console.error, trace() {}, child() { return silent; } };
const wp = await MidnightWalletProvider.withWallet(silent, ENV, wallet, seeds, keystore);
const zkConfigPath = new URL('../../contract/managed', STATE).pathname;
const providers = initializeMidnightProviders(wp, ENV, { privateStateStoreName: 'pilotlog-cfi-endorse-ps', zkConfigPath });
let cur = null;
const origProve = providers.proofProvider.proveTx.bind(providers.proofProvider);
providers.proofProvider.proveTx = async (...a) => { const t = Date.now(); try { return await origProve(...a); } finally { if (cur) cur.proveMs = (cur.proveMs ?? 0) + (Date.now() - t); } };

const compiled = CompiledContract.withCompiledFileAssets(
  CompiledContract.withWitnesses(CompiledContract.make('cfi_endorse', Contract), { adminSecret: ({ privateState }) => [privateState, adminSecret] }),
  zkConfigPath);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pub = (p) => ({ txId: p.txId, txHash: p.txHash, blockHeight: p.blockHeight, status: p.status });
async function step(name, fn) {
  if (R.steps[name]?.done) { log('skip', name); return R.steps[name]; }
  await sleep(10_000); await wallet.waitForSyncedState();
  cur = { dustBefore: await dust() }; const t = Date.now();
  try { Object.assign(cur, await fn()); } catch (e) {
    Object.assign(cur, { rejected: true, where: cur.proveMs === undefined ? 'local circuit execution (before proving/submission)' : 'after proving', error: String(e?.message ?? e).split('\n')[0].slice(0, 300) });
  }
  Object.assign(cur, { totalMs: Date.now() - t, dustAfter: await dust(), done: true });
  R.steps[name] = cur; save(); log(name, cur); return cur;
}

let deployed;
if (!R.steps.deploy?.contractAddress) {
  await step('deploy', async () => {
    deployed = await deployContract(providers, { compiledContract: compiled, args: [adminCommitment(adminSecret)] });
    return { contractAddress: deployed.deployTxData.public.contractAddress, ...pub(deployed.deployTxData.public) };
  });
  if (!R.steps.deploy.contractAddress) throw new Error('deploy failed: ' + R.steps.deploy.error);
} else {
  deployed = await findDeployedContract(providers, { compiledContract: compiled, contractAddress: R.steps.deploy.contractAddress });
}
const addr = R.steps.deploy.contractAddress, addrBytes = fromHex(addr, 32);
log('contract', addr);

const entry = (id) => entryHash({ entryId: id, entrySalt: toHex(sha256(fromHex(S.studentSalt), id)), date: '2026-11-14', aircraftIdent: 'N123PL', aircraftType: 'DA40', from: 'KAPA', to: 'KAPA', totalTenths: 13, dualReceivedTenths: 13, landingsDay: 3, remarks: 'SYNTHETIC Preview test entry' });
const sc = studentCommit('synthetic-student-preview', S.studentSalt);
const ref = cfiRef('synthetic-cfi-preview', S.cfiSalt);
const argsFor = async (eh) => { const d = endorseDigest(addrBytes, eh, sc); const a = assertionToCircuitArgs({ publicKey: { cose: passkey.cose }, ...(await passkey.get(d)), digest: d }); return [eh, sc, a.cfiPubKey, a.authData, a.challenge, a.cdSuffix, a.flagsBit1, a.flagsHigh, a.sig]; };
const E1 = entry('synthetic-preview-1'), E2 = entry('synthetic-preview-2');

await step('enrollCfi', async () => pub((await deployed.callTx.enrollCfi(keyId, ref)).public));
await step('endorseValid', async () => ({ entryHash: toHex(E1), ...pub((await deployed.callTx.endorseEntry(...(await argsFor(E1)))).public) }));
await step('endorseTampered', async () => {
  const args = await argsFor(E2); const t = Uint8Array.from(E2); t[0] ^= 1; args[0] = t;
  const r = await deployed.callTx.endorseEntry(...args); return { UNEXPECTED: 'accepted', ...pub(r.public) };
});
await step('revokeCfi', async () => pub((await deployed.callTx.revokeCfi(keyId)).public));
await step('endorseAfterRevoke', async () => { const r = await deployed.callTx.endorseEntry(...(await argsFor(E2))); return { UNEXPECTED: 'accepted', ...pub(r.public) }; });

await sleep(10_000);
const st = await providers.publicDataProvider.queryContractState(addr);
const L = ledger(st.contractState.deserialize({ v9: ContractState }).data);
R.readBack = {
  cfiKeys: String(L.cfiKeys.size()), revoked: String(L.revokedAtSeq.size()), endorsements: String(L.endorsements.size()), seq: String(L.seq),
  validRecorded: L.endorsements.member(endorsementKey(E1, keyId)), e2Recorded: L.endorsements.member(endorsementKey(E2, keyId)),
  keyId: toHex(keyId), revokedAtSeq: L.revokedAtSeq.member(keyId) ? String(L.revokedAtSeq.lookup(keyId)) : null,
  validSeq: L.endorsements.member(endorsementKey(E1, keyId)) ? String(L.endorsements.lookup(endorsementKey(E1, keyId)).seq) : null,
};
R.nodePeakRssMB = Math.round(process.resourceUsage().maxRSS / 1024); R.totalMs = Date.now() - T0; save();
log('readBack', R.readBack);
await wallet.stop(); process.exit(0);
