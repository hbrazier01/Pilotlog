/**
 * deployed.ts — AirLog v2 on-chain demo flow (Midnight PreProd)
 *
 * Goal:
 *   deploy AirLog v2 contract → anchorEntry(recordHash, anchoredAt)
 *   prints contract address and tx hash
 *
 * v2 model: no registerAirframe, no authorizeIssuer. First write succeeds immediately.
 *
 * Prerequisites:
 *   1. Node v22  (nvm use 22)
 *   2. Wallet funded with tNight on PreProd
 *      PreProd faucet:  https://faucet.preprod.midnight.network/
 *
 * Run from pilotlog-cli/:
 *   AIRLOG_SEED=<hex-seed> npm run demo
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import { createHash } from "node:crypto";
import { Buffer } from "buffer";
import { WebSocket } from "ws";


import { CompiledContract } from "@midnight-ntwrk/compact-js";
import {
  deployContract,
  findDeployedContract,
} from "@midnight-ntwrk/midnight-js-contracts";
import { httpClientProofProvider } from "@midnight-ntwrk/midnight-js-http-client-proof-provider";
import { indexerPublicDataProvider } from "@midnight-ntwrk/midnight-js-indexer-public-data-provider";
import { NodeZkConfigProvider } from "@midnight-ntwrk/midnight-js-node-zk-config-provider";
import { levelPrivateStateProvider } from "@midnight-ntwrk/midnight-js-level-private-state-provider";
import {
  getNetworkId,
  setNetworkId,
} from "@midnight-ntwrk/midnight-js-network-id";
import { toHex } from "@midnight-ntwrk/midnight-js-utils";

import * as ledger from "@midnight-ntwrk/ledger-v8";
import { unshieldedToken } from "@midnight-ntwrk/ledger-v8";
import { WalletFacade } from "@midnight-ntwrk/wallet-sdk-facade";
import { HDWallet, Roles } from "@midnight-ntwrk/wallet-sdk-hd";
import { ShieldedWallet } from "@midnight-ntwrk/wallet-sdk-shielded";
import {
  createKeystore,
  InMemoryTransactionHistoryStorage,
  PublicKey,
  UnshieldedWallet,
} from "@midnight-ntwrk/wallet-sdk-unshielded-wallet";
import { DustWallet } from "@midnight-ntwrk/wallet-sdk-dust-wallet";
import * as Rx from "rxjs";

import { Airlog, createAirlogPrivateState } from "@repo/airlog-contract";

// Required for GraphQL subscriptions in Node.js
// @ts-expect-error global WebSocket polyfill for apollo usage
globalThis.WebSocket = WebSocket;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ZK_KEYS_PATH = path.resolve(
  __dirname,
  "../../../compact/contracts/airlog/src/managed/airlog"
);

const DEPLOYMENT_JSON = path.resolve(__dirname, "../../../deployment.json");

// Proof Station URL: use env var or fall back to the Midnight PreProd public Proof Station.
// No local proof server required — proving is handled remotely.
const PROOF_STATION_URL =
  process.env.MIDNIGHT_PROOF_SERVER_URL ??
  "https://proof-server.testnet-02.midnight.network";

const PREPROD_CONFIG = {
  indexer: "https://indexer.preprod.midnight.network/api/v4/graphql",
  indexerWS: "wss://indexer.preprod.midnight.network/api/v4/graphql/ws",
  node: "https://rpc.preprod.midnight.network",
  proofServer: PROOF_STATION_URL,
};

const ACTIVE_CONFIG = PREPROD_CONFIG;

function resolveWalletSeed(): string {
  if (!process.env.AIRLOG_SEED) {
    throw new Error(
      "AIRLOG_SEED is required — set it to your real wallet seed hex. " +
      "No dev/fallback seeds are allowed."
    );
  }
  return process.env.AIRLOG_SEED;
}

function loadDeployment(): { contractAddress: string } | null {
  if (!fs.existsSync(DEPLOYMENT_JSON)) return null;
  return JSON.parse(fs.readFileSync(DEPLOYMENT_JSON, "utf8"));
}

function saveDeployment(contractAddress: string): void {
  fs.writeFileSync(
    DEPLOYMENT_JSON,
    JSON.stringify({ contractAddress }, null, 2)
  );
  console.log(`Deployment saved -> ${DEPLOYMENT_JSON}`);
}

function deriveKeysFromSeed(seed: string) {
  const hdWallet = HDWallet.fromSeed(Buffer.from(seed, "hex"));
  if (hdWallet.type !== "seedOk") {
    throw new Error("HDWallet init failed");
  }

  const result = hdWallet.hdWallet
    .selectAccount(0)
    .selectRoles([Roles.Zswap, Roles.NightExternal, Roles.Dust])
    .deriveKeysAt(0);

  if (result.type !== "keysDerived") {
    throw new Error("Key derivation failed");
  }

  hdWallet.hdWallet.clear();
  return result.keys;
}

async function buildWallet(seed: string) {
  const keys = deriveKeysFromSeed(seed);

  const shieldedSecretKeys = ledger.ZswapSecretKeys.fromSeed(keys[Roles.Zswap]);
  const dustSecretKey = ledger.DustSecretKey.fromSeed(keys[Roles.Dust]);
  const unshieldedKeystore = createKeystore(
    keys[Roles.NightExternal],
    getNetworkId()
  );

  const sharedCfg = {
    networkId: getNetworkId(),
    indexerClientConnection: {
      indexerHttpUrl: ACTIVE_CONFIG.indexer,
      indexerWsUrl: ACTIVE_CONFIG.indexerWS,
    },
    provingServerUrl: new URL(ACTIVE_CONFIG.proofServer),
    relayURL: new URL(ACTIVE_CONFIG.node.replace(/^http/, "ws")),
    txHistoryStorage: new InMemoryTransactionHistoryStorage(),
    costParameters: {
      additionalFeeOverhead: 0n,
      feeBlocksMargin: 5,
    },
  };

  const wallet = await WalletFacade.init({
    configuration: sharedCfg,
    shielded: (cfg) => ShieldedWallet(cfg).startWithSecretKeys(shieldedSecretKeys),
    unshielded: (cfg) =>
      UnshieldedWallet(cfg).startWithPublicKey(
        PublicKey.fromKeyStore(unshieldedKeystore)
      ),
    dust: (cfg) =>
      DustWallet(cfg).startWithSecretKey(
        dustSecretKey,
        ledger.LedgerParameters.initialParameters().dust
      ),
  });

  await wallet.start(shieldedSecretKeys, dustSecretKey);

  return { wallet, shieldedSecretKeys, dustSecretKey, unshieldedKeystore };
}

function signIntents(
  tx: { intents?: Map<number, any> },
  signFn: (payload: Uint8Array) => ledger.Signature,
  proofMarker: "proof" | "pre-proof"
): void {
  if (!tx.intents || tx.intents.size === 0) return;

  for (const segment of tx.intents.keys()) {
    const intent = tx.intents.get(segment);
    if (!intent) continue;

    const cloned = ledger.Intent.deserialize<
      ledger.SignatureEnabled,
      ledger.Proofish,
      ledger.PreBinding
    >("signature", proofMarker, "pre-binding", intent.serialize());

    const sigData = cloned.signatureData(segment);
    const signature = signFn(sigData);

    if (cloned.fallibleUnshieldedOffer) {
      const sigs = cloned.fallibleUnshieldedOffer.inputs.map(
        (_: unknown, i: number) =>
          cloned.fallibleUnshieldedOffer!.signatures.at(i) ?? signature
      );
      cloned.fallibleUnshieldedOffer =
        cloned.fallibleUnshieldedOffer.addSignatures(sigs);
    }

    if (cloned.guaranteedUnshieldedOffer) {
      const sigs = cloned.guaranteedUnshieldedOffer.inputs.map(
        (_: unknown, i: number) =>
          cloned.guaranteedUnshieldedOffer!.signatures.at(i) ?? signature
      );
      cloned.guaranteedUnshieldedOffer =
        cloned.guaranteedUnshieldedOffer.addSignatures(sigs);
    }

    tx.intents.set(segment, cloned);
  }
}

async function createProviders(
  walletCtx: Awaited<ReturnType<typeof buildWallet>>
) {
  const { wallet, shieldedSecretKeys, dustSecretKey, unshieldedKeystore } =
    walletCtx;

  const state = await Rx.firstValueFrom(
    wallet.state().pipe(Rx.filter((s) => s.isSynced))
  );

  const walletAndMidnight = {
    getCoinPublicKey() {
      return state.shielded.coinPublicKey.toHexString();
    },
    getEncryptionPublicKey() {
      return state.shielded.encryptionPublicKey.toHexString();
    },
    async balanceTx(tx: unknown, ttl?: Date) {
      const recipe = await wallet.balanceUnboundTransaction(
        tx as any,
        { shieldedSecretKeys, dustSecretKey },
        { ttl: ttl ?? new Date(Date.now() + 30 * 60 * 1000) }
      );

      const signFn = (payload: Uint8Array) => unshieldedKeystore.signData(payload);

      signIntents(recipe.baseTransaction, signFn, "proof");
      if (recipe.balancingTransaction) {
        signIntents(recipe.balancingTransaction, signFn, "pre-proof");
      }

      return wallet.finalizeRecipe(recipe);
    },
    async submitTx(tx: unknown) {
      const txAny = tx as any;
      const txHex: string | undefined =
        typeof txAny?.toHex === 'function' ? txAny.toHex() :
        typeof txAny === 'string' ? txAny : undefined;
      console.log(`[tx-debug] submitTx start — txHex length: ${txHex?.length ?? 'n/a'}`);
      if (txAny?.txId) console.log(`[tx-debug] txId before submit: ${txAny.txId}`);
      if (txAny?.id)   console.log(`[tx-debug] tx.id before submit: ${txAny.id}`);
      try {
        const result = await wallet.submitTransaction(txAny);
        if (result === undefined || result === null) {
          const fallbackRef = `fallback-${Date.now()}`;
          console.log(`[tx-debug] submitTransaction resolved undefined — treating as submitted, fallbackRef: ${fallbackRef}`);
          return { txId: fallbackRef, fallback: true } as any;
        }
        return result as any;
      } catch (err: any) {
        console.error('[tx-debug] submitTransaction THREW:');
        console.error('  message:', err?.message);
        console.error('  name:   ', err?.name);
        console.error('  cause:  ', err?.cause);
        console.error('  stack:  ', err?.stack);
        try {
          const enumerable = JSON.stringify(err, Object.getOwnPropertyNames(err), 2);
          console.error('  full:   ', enumerable);
        } catch (_) {
          console.error('  (could not serialize full error)');
        }
        throw err;
      }
    },
  };

  const coinPublicKey = walletAndMidnight.getCoinPublicKey();
  const storagePassword = `${coinPublicKey}!A`;
  const baseZkConfigProvider = new NodeZkConfigProvider(ZK_KEYS_PATH);

  // Wrap NodeZkConfigProvider to normalize keyLocation shape.
  // httpClientProofProvider may pass keyLocation as a string or an object
  // with .circuitId / .id — NodeZkConfigProvider.get() expects a plain string.
  const zkConfigProvider = {
    async get(keyLocation: unknown) {
      console.log(`  [zkConfigProvider] get called with:`, JSON.stringify(keyLocation));
      const circuitId =
        typeof keyLocation === "string"
          ? keyLocation
          : (keyLocation as any)?.circuitId ?? (keyLocation as any)?.id ?? String(keyLocation);
      console.log(`  [zkConfigProvider] resolved circuitId: ${circuitId}`);
      const result = await baseZkConfigProvider.get(circuitId);
      return {
        circuitId,
        proverKey: (result as any).proverKey ?? (result as any).prover,
        verifierKey: (result as any).verifierKey ?? (result as any).verifier,
        zkir: (result as any).zkir,
      };
    },
  };

  console.log(`  [providers] httpClientProofProvider:`, typeof httpClientProofProvider);
  console.log(`  [providers] coinPublicKey:`, coinPublicKey);

  const basePublicDataProvider = indexerPublicDataProvider(
    ACTIVE_CONFIG.indexer,
    ACTIVE_CONFIG.indexerWS
  );

  // Wrap publicDataProvider to instrument contractState reads
  const publicDataProvider = new Proxy(basePublicDataProvider, {
    get(target, prop) {
      const val = (target as any)[prop];
      if (prop === 'contractStateOf') {
        return async (...args: unknown[]) => {
          const result = await (val as (...a: unknown[]) => Promise<unknown>).apply(target, args);
          console.log(`  [provider] contractState for ${args[0]}:`, result == null ? 'NULL' : 'present');
          return result;
        };
      }
      if (typeof val === 'function') return val.bind(target);
      return val;
    },
  });

  const basePrivateStateProvider = levelPrivateStateProvider({
    privateStateStoreName: "airlog-private-state",
    accountId: coinPublicKey,
    privateStoragePasswordProvider: () => storagePassword,
  });

  // Wrap privateStateProvider to instrument get/set
  const privateStateProvider = new Proxy(basePrivateStateProvider, {
    get(target, prop) {
      const val = (target as any)[prop];
      if (prop === 'get') {
        return async (...args: unknown[]) => {
          const result = await (val as (...a: unknown[]) => Promise<unknown>).apply(target, args);
          console.log(`  [provider] privateState get(${args[0]}):`, result == null ? 'NULL' : 'present');
          return result;
        };
      }
      if (typeof val === 'function') return val.bind(target);
      return val;
    },
  });

  return {
    walletProvider: walletAndMidnight,
    midnightProvider: walletAndMidnight,
    publicDataProvider,
    zkConfigProvider,
    proofProvider: httpClientProofProvider(
      ACTIVE_CONFIG.proofServer,
      zkConfigProvider as any
    ),
    privateStateProvider,
  };
}

/**
 * Poll the indexer until the newly-deployed contract is visible,
 * then return the joined contract handle.
 *
 * The indexer typically lags 1-3 blocks (~5-15 s) behind the node.
 * Without this wait, callTx calls made immediately after deployContract
 * can fail with "contract not found" from the public data provider.
 */
async function waitForContractIndexed(
  providers: Awaited<ReturnType<typeof createProviders>>,
  contractAddress: string,
  compiledContract: any,
  maxAttempts = 20,
  intervalMs = 5_000
): Promise<any> {
  console.log(`  Waiting for contract to be indexed (up to ${maxAttempts * intervalMs / 1000}s)…`);
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const found = await findDeployedContract(providers as any, {
        contractAddress,
        compiledContract,
        privateStateId: "airlogPrivateState",
        initialPrivateState: createAirlogPrivateState(),
      });
      if (found) {
        ok(`Contract indexed (attempt ${attempt})`);
        return found;
      }
    } catch {
      // not yet visible — keep polling
    }
    console.log(`  [${attempt}/${maxAttempts}] Not indexed yet, retrying in ${intervalMs / 1000}s…`);
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error(`Contract ${contractAddress} was not indexed after ${maxAttempts} attempts.`);
}

function step(n: number, label: string) {
  console.log(`\n[${n}] ${label}`);
  console.log("─".repeat(50));
}

function ok(msg: string) {
  console.log(`  ✓ ${msg}`);
}

function fail(msg: string) {
  console.error(`  ✗ ${msg}`);
}

async function main() {
  console.log("╔══════════════════════════════════════════════════╗");
  console.log("║      AirLog v2 — Hash Anchoring Demo Flow        ║");
  console.log("╚══════════════════════════════════════════════════╝");

  setNetworkId("preprod");
  console.log(`\nNetwork:      ${getNetworkId()}`);
  console.log(`ZK keys:      ${ZK_KEYS_PATH}`);
  console.log(`Proof server: ${ACTIVE_CONFIG.proofServer}`);

  const airlogCompiledContract = CompiledContract.make(
    "airlog",
    Airlog.Contract
  ).pipe(
    CompiledContract.withVacantWitnesses,
    CompiledContract.withCompiledFileAssets(ZK_KEYS_PATH)
  );

  step(1, "Build wallet");
  const seed = resolveWalletSeed();
  const walletCtx = await buildWallet(seed);
  ok(`Wallet ready`);
  console.log(`  Address (fund with tNight): ${walletCtx.unshieldedKeystore.getBech32Address()}`);
  console.log(`  Faucet: https://faucet.${"preprod"}.midnight.network/`);

  step(2, "Sync with network");
  const syncedState = await Rx.firstValueFrom(
    walletCtx.wallet.state().pipe(
      Rx.throttleTime(5_000),
      Rx.filter((s) => s.isSynced)
    )
  );
  ok("Synced");

  const balance = syncedState.unshielded.balances[unshieldedToken().raw] ?? 0n;
  console.log(`  tNight balance: ${balance}`);

  if (balance === 0n) {
    fail(`Wallet has no tNight. Fund it at https://faucet.${"preprod"}.midnight.network/ then re-run.`);
    process.exit(1);
  }

  // Dust bootstrap
  const dustState = await walletCtx.wallet.dust.waitForSyncedState();
  console.log(`  Dust coins (UTXOs): ${dustState.totalCoins.length}`);

  if (dustState.totalCoins.length === 0) {
    const unshieldedState = await walletCtx.wallet.unshielded.waitForSyncedState();
    const nightUtxos = unshieldedState.availableCoins;
    console.log(`  Dust wallet empty. Registering ${nightUtxos.length} Night UTXO(s) for dust generation...`);

    if (nightUtxos.length === 0) {
      fail("No unshielded Night UTXOs to register. Wallet cannot pay fees.");
      process.exit(1);
    }

    const nightVerifyingKey = walletCtx.unshieldedKeystore.getPublicKey();
    const signFn = (payload: Uint8Array) => walletCtx.unshieldedKeystore.signData(payload);

    const registrationRecipe = await walletCtx.wallet.registerNightUtxosForDustGeneration(
      nightUtxos,
      nightVerifyingKey,
      signFn
    );

    const finalizedRegistration = await walletCtx.wallet.finalizeRecipe(registrationRecipe);
    const regTxId = await walletCtx.wallet.submitTransaction(finalizedRegistration);
    ok(`Dust registration submitted: ${regTxId}`);
    console.log("  Waiting 30s for dust generation to begin...");
    await new Promise((r) => setTimeout(r, 30_000));
  }

  step(3, "Configure providers");
  const providers = await createProviders(walletCtx);
  ok("Providers ready");

  const existing = loadDeployment();

  step(4, existing ? "Join existing contract" : "Deploy AirLog v2 contract");

  let deployedContract: any;
  let needsIndexingWait = false;

  if (existing) {
    console.log(`  Contract address: ${existing.contractAddress}`);
    try {
      deployedContract = await findDeployedContract(providers as any, {
        contractAddress: existing.contractAddress,
        compiledContract: airlogCompiledContract,
        privateStateId: "airlogPrivateState",
        initialPrivateState: createAirlogPrivateState(),
      });
      if (!deployedContract) {
        throw new Error("findDeployedContract returned null — address not found on-chain");
      }
      ok("Contract joined");
    } catch (err) {
      fail(`Persisted contract address is stale or invalid: ${(err as Error).message}`);
      console.log("  Clearing stale deployment.json and deploying a fresh contract...");
      fs.unlinkSync(DEPLOYMENT_JSON);

      deployedContract = await deployContract(providers as any, {
        compiledContract: airlogCompiledContract,
        privateStateId: "airlogPrivateState",
        initialPrivateState: createAirlogPrivateState(),
      });
      const freshAddress = deployedContract.deployTxData.public.contractAddress;
      ok(`Fresh contract deployed`);
      console.log(`  Contract address: ${freshAddress}`);
      console.log(`  Deploy tx:        ${deployedContract.deployTxData.public.txId}`);
      saveDeployment(freshAddress);
      needsIndexingWait = true;
    }
  } else {
    deployedContract = await deployContract(providers as any, {
      compiledContract: airlogCompiledContract,
      privateStateId: "airlogPrivateState",
      initialPrivateState: createAirlogPrivateState(),
    });
    const contractAddress = deployedContract.deployTxData.public.contractAddress;
    ok(`Contract deployed`);
    console.log(`  Contract address: ${contractAddress}`);
    console.log(`  Deploy tx:        ${deployedContract.deployTxData.public.txId}`);
    saveDeployment(contractAddress);
    needsIndexingWait = true;
  }

  const contractAddress = deployedContract.deployTxData.public.contractAddress;

  // After a fresh deploy, wait for the indexer to catch up before calling any
  // contract methods. deployContract returns as soon as the tx is accepted by
  // the node, but callTx reads contract state from the indexer which may lag
  // several blocks behind.
  if (needsIndexingWait) {
    console.log("\n[4b] Wait for contract indexing");
    console.log("─".repeat(50));
    deployedContract = await waitForContractIndexed(
      providers,
      contractAddress,
      airlogCompiledContract
    );
  }

  // Ensure private state is initialized in the LevelDB provider.
  // submitCallTx reads privateStateProvider.get(privateStateId) before invoking
  // the circuit — if the entry is absent (fresh storage or new wallet), it returns
  // null and the call fails with "private state null". Explicitly seed it here.
  const existingPrivateState = await providers.privateStateProvider.get("airlogPrivateState");
  if (!existingPrivateState) {
    console.log("  [tx-debug] privateState not found in LevelDB — seeding initial state");
    await providers.privateStateProvider.set("airlogPrivateState", createAirlogPrivateState());
  } else {
    console.log("  [tx-debug] privateState already present in LevelDB");
  }

  // Resolve pilot identity from wallet address
  const pilotId = walletCtx.unshieldedKeystore.getBech32Address();
  console.log(`  pilotId (wallet): ${pilotId}`);

  // Build record hash: SHA-256 of a pilot log entry bound to pilot identity
  const sampleRecord = JSON.stringify({
    pilotId,
    aircraft: "N12345",
    date: "2026-04-12",
    totalTime: 1234.5,
    entryType: "ANNUAL",
  });
  const recordHash = new Uint8Array(
    createHash("sha256").update(sampleRecord).digest()
  );
  const anchoredAt = BigInt(Math.floor(Date.now() / 1000));

  step(5, "Validate contract state");
  const contractState = await (providers.publicDataProvider as any).contractStateOf?.(contractAddress)
    ?? await (providers.publicDataProvider as any).getContractState?.(contractAddress);
  if (contractState == null) {
    fail(`Contract state is NULL — contract ${contractAddress} is not indexed`);
    console.log("  Clearing deployment.json and re-running will deploy a fresh contract.");
    fs.writeFileSync(DEPLOYMENT_JSON, JSON.stringify({}, null, 2));
    process.exit(1);
  }
  ok(`Contract state present`);

  step(6, "anchorEntry");

  const payload = {
    recordHash: toHex(recordHash),
    anchoredAt: anchoredAt.toString(),
    contractAddress,
    circuitId: 'anchorEntry',
    pilotId,
  };
  console.log('[anchor-debug] payload:', JSON.stringify(payload, null, 2));
  console.log(`  recordHash bytes: ${recordHash.length} bytes`);
  console.log(`  anchoredAt type: ${typeof anchoredAt} = ${anchoredAt}`);

  let anchorTxData: Awaited<ReturnType<typeof deployedContract.callTx.anchorEntry>>;
  try {
    anchorTxData = await deployedContract.callTx.anchorEntry(recordHash, anchoredAt);
  } catch (err: any) {
    console.error('[tx-debug] anchorEntry FAILED:');
    console.error('  message:', err?.message);
    console.error('  name:   ', err?.name);
    console.error('  cause:  ', err?.cause);
    console.error('  stack:  ', err?.stack);
    try {
      console.error('  full:   ', JSON.stringify(err, Object.getOwnPropertyNames(err), 2));
    } catch (_) {}
    throw err;
  }

  ok(`SUCCESS`);
  console.log(`  tx:       ${anchorTxData.public.txId}`);
  console.log(`  block:    ${anchorTxData.public.blockHeight}`);
  console.log(`[tx-debug] chainStatus: submitted`);
  console.log(`[tx-debug] txHash: ${anchorTxData.public.txId}`);
  console.log(`[tx-debug] entry: ${JSON.stringify({ hash: toHex(recordHash), chainStatus: 'submitted', txHash: anchorTxData.public.txId })}}`);

  console.log("\n╔══════════════════════════════════════════════════╗");
  console.log("║  DEMO COMPLETE                                   ║");
  console.log("╠══════════════════════════════════════════════════╣");
  console.log(`║  Contract:  ${contractAddress.slice(0, 37)}  ║`);
  console.log(`║  anchorEntry: ${anchorTxData.public.txId.slice(0, 35)}  ║`);
  console.log("╚══════════════════════════════════════════════════╝");
  console.log(`\nAirLog v2 entry anchored on Midnight ${"preprod"}.`);

  process.exit(0);
}

main().catch((err) => {
  console.error("\n=== FAILED ===");
  console.error(err);
  process.exit(1);
});
