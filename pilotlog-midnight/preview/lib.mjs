// Shared Midnight PREVIEW wiring for run.mjs (key-flow run) and worker.mjs (staging prover/relayer on the box).
// PREVIEW ONLY. The wallet seed is read from CFI_MIDNIGHT_SEED_FILE and never printed or logged.
import { WebSocket } from 'ws';
globalThis.WebSocket = WebSocket;
import { existsSync, readFileSync, mkdirSync, copyFileSync } from 'node:fs';
import * as Rx from 'rxjs';
import { assertEnabled } from '../src/flag.mjs';

export const ENV = {
  walletNetworkId: 'preview', networkId: 'preview',          // PREVIEW ONLY (https://docs.midnight.network/relnotes/network)
  indexer: 'https://indexer.preview.midnight.network/api/v4/graphql',
  indexerWS: 'wss://indexer.preview.midnight.network/api/v4/graphql/ws',
  node: 'https://rpc.preview.midnight.network', nodeWS: 'wss://rpc.preview.midnight.network',
  faucet: undefined, proofServer: process.env.PROOF_SERVER ?? 'http://127.0.0.1:6300',
};

/** Wallet + providers + compiled contract. `stateDir` is a URL (gitignored) where private state lands. */
export async function connect({ stateDir, log = console.log }) {
  assertEnabled();
  const seedFile = process.env.CFI_MIDNIGHT_SEED_FILE;
  if (!seedFile || !existsSync(seedFile)) throw new Error('CFI_MIDNIGHT_SEED_FILE must point to a throwaway Preview wallet seed');
  mkdirSync(new URL('contract/', stateDir), { recursive: true, mode: 0o700 });
  process.chdir(stateDir.pathname); // level-db private state lands in stateDir
  copyFileSync(new URL('../contract/managed/contract/index.js', import.meta.url), new URL('contract/index.js', stateDir));
  const { Contract, ledger } = await import(new URL('contract/index.js', stateDir));
  const { FluentWalletBuilder, WalletFactory, syncWallet, MidnightWalletProvider, initializeMidnightProviders } = await import('@midnight-ntwrk/testkit-js');
  const { deployContract, findDeployedContract } = await import('@midnight-ntwrk/midnight-js-contracts');
  const { CompiledContract } = await import('@midnight-ntwrk/compact-js');
  const { ContractState } = await import('@midnight-ntwrk/compact-runtime');

  // testkit's build() logs the seed, so use buildWithoutStarting + startWalletFacade.
  const seedHex = readFileSync(seedFile, 'utf8').trim();
  const { wallet, seeds, keystore } = await FluentWalletBuilder.forEnvironment(ENV).withSeed(seedHex).buildWithoutStarting();
  await WalletFactory.startWalletFacade(wallet, seeds);
  await syncWallet(wallet, 5_000, 900_000);
  const dust = async () => { const s = await Rx.firstValueFrom(wallet.state()); return Number(s.dust.balance(new Date()) / 10n ** 12n) / 1000; };
  log('wallet synced; DUST', await dust());

  const silent = { info() {}, debug() {}, warn: console.warn, error: console.error, trace() {}, child() { return silent; } };
  const wp = await MidnightWalletProvider.withWallet(silent, ENV, wallet, seeds, keystore);
  const zkConfigPath = new URL('../contract/managed', import.meta.url).pathname;
  const providers = initializeMidnightProviders(wp, ENV, { privateStateStoreName: 'pilotlog-cfi-endorse-v2-ps', zkConfigPath });
  const timing = { cur: null };
  const origProve = providers.proofProvider.proveTx.bind(providers.proofProvider);
  providers.proofProvider.proveTx = async (...a) => { const t = Date.now(); try { return await origProve(...a); } finally { if (timing.cur) timing.cur.proveMs = (timing.cur.proveMs ?? 0) + (Date.now() - t); } };
  // No witnesses: every authority is a signature verified in-circuit.
  const compiled = CompiledContract.withCompiledFileAssets(CompiledContract.withWitnesses(CompiledContract.make('cfi_endorse', Contract), {}), zkConfigPath);
  const readLedger = async (addr) => {
    const st = await providers.publicDataProvider.queryContractState(addr);
    return ledger(st.contractState.deserialize({ v9: ContractState }).data);
  };
  return {
    wallet, providers, compiled, dust, timing, readLedger,
    deploy: (args) => deployContract(providers, { compiledContract: compiled, args }),
    find: (contractAddress) => findDeployedContract(providers, { compiledContract: compiled, contractAddress }),
  };
}

export const pub = (p) => ({ txId: p.txId, txHash: p.txHash, blockHeight: p.blockHeight, status: p.status });
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
/** Circuit-args (bigints, Uint8Arrays) <-> JSON for the staging job queue. */
export const toJson = (v) => JSON.stringify(v, (k, x) => (typeof x === 'bigint' ? { $big: x.toString() } : x instanceof Uint8Array ? { $hex: Buffer.from(x).toString('hex') } : x));
export const fromJson = (s) => JSON.parse(s, (k, x) => (x && typeof x === 'object' && '$big' in x ? BigInt(x.$big) : x && typeof x === 'object' && '$hex' in x ? new Uint8Array(Buffer.from(x.$hex, 'hex')) : x));

/**
 * Restart the local proof server before a proof so its prover-key cache never accumulates across circuits.
 * Measured on Preview (2026-11-17): one process proving 3 distinct k=17 circuits passed 3.8 GB RSS, while a fresh
 * process stays near 3.2-3.3 GB. Enabled with PROOF_SERVER_RECYCLE=1; expects a supervisor that restarts the
 * server when it exits (box: /workspace/midnight-passkey-spike/proof-server/supervise.sh).
 */
export async function recycleProver(log = () => {}) {
  if (process.env.PROOF_SERVER_RECYCLE !== '1') return;
  const { execFileSync } = await import('node:child_process');
  try { execFileSync('pkill', ['-f', 'midnight-proof-server --port']); } catch { /* not running */ }
  const t = Date.now();
  await sleep(1_500);
  for (;;) {
    try { if ((await fetch(ENV.proofServer + '/version')).ok) break; } catch { /* starting */ }
    if (Date.now() - t > 180_000) throw new Error("proof server did not come back within 180 s");
    await sleep(500);
  }
  log('proof server recycled in', Date.now() - t, 'ms');
}
