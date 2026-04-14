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
    submitTx(tx: unknown) {
      return wallet.submitTransaction(tx as any) as any;
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

  return {
    walletProvider: walletAndMidnight,
    midnightProvider: walletAndMidnight,
    publicDataProvider: indexerPublicDataProvider(
      ACTIVE_CONFIG.indexer,
      ACTIVE_CONFIG.indexerWS
    ),
    zkConfigProvider,
    proofProvider: httpClientProofProvider(
      ACTIVE_CONFIG.proofServer,
      zkConfigProvider as any
    ),
    privateStateProvider: levelPrivateStateProvider({
      privateStateStoreName: "airlog-private-state",
      accountId: coinPublicKey,
      privateStoragePasswordProvider: () => storagePassword,
    }),
  };
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

  if (existing) {
    console.log(`  Contract address: ${existing.contractAddress}`);
    deployedContract = await findDeployedContract(providers as any, {
      contractAddress: existing.contractAddress,
      compiledContract: airlogCompiledContract,
      privateStateId: "airlogPrivateState",
      initialPrivateState: createAirlogPrivateState(),
    });
    ok("Contract joined");
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
  }

  const contractAddress = deployedContract.deployTxData.public.contractAddress;

  // Build record hash: SHA-256 of a sample pilot log entry
  const sampleRecord = JSON.stringify({
    aircraft: "N12345",
    date: "2026-04-12",
    totalTime: 1234.5,
    entryType: "ANNUAL",
  });
  const recordHash = new Uint8Array(
    createHash("sha256").update(sampleRecord).digest()
  );
  const anchoredAt = BigInt(Math.floor(Date.now() / 1000));

  step(5, "anchorEntry");
  console.log(`  recordHash: ${toHex(recordHash)}`);
  console.log(`  anchoredAt: ${anchoredAt} (unix seconds)`);
  console.log(`  note: no prior setup required — works on fresh contract`);

  const anchorTxData = await deployedContract.callTx.anchorEntry(recordHash, anchoredAt);

  ok(`SUCCESS`);
  console.log(`  tx:       ${anchorTxData.public.txId}`);
  console.log(`  block:    ${anchorTxData.public.blockHeight}`);

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
