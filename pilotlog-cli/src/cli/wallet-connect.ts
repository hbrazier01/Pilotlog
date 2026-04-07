/**
 * wallet-connect.ts — Connect PilotLog to the 1AM wallet (Midnight PreProd)
 *
 * Provider detection order:
 *   1. AIRLOG_SEED env var  (CI / automation)
 *   2. Persisted session in .pilotlog/wallet.json  (already connected)
 *   3. Hard-coded DEV_SEED fallback (local dev only)
 *
 * What this does:
 *   - Detects the 1AM wallet provider (via env / session)
 *   - Initialises WalletFacade (proving service + indexer)
 *   - Syncs and reads the wallet address
 *   - Persists the session to .pilotlog/wallet.json
 *   - Optionally submits a test registerAirframe transaction
 *
 * Usage:
 *   npm run wallet:connect                       # detect + connect
 *   npm run wallet:connect -- --test-tx          # connect + submit test tx
 *   npm run wallet:connect -- --disconnect       # clear session
 *
 * Prerequisites:
 *   - Node v22  (nvm use 22)
 *   - Proof server running at http://127.0.0.1:6300
 *   - Wallet funded with tNight: https://faucet.preprod.midnight.network/
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import { Buffer } from "buffer";
import { WebSocket } from "ws";

import { CompiledContract } from "@midnight-ntwrk/compact-js";
import { deployContract, findDeployedContract } from "@midnight-ntwrk/midnight-js-contracts";
import { httpClientProofProvider } from "@midnight-ntwrk/midnight-js-http-client-proof-provider";
import { indexerPublicDataProvider } from "@midnight-ntwrk/midnight-js-indexer-public-data-provider";
import { NodeZkConfigProvider } from "@midnight-ntwrk/midnight-js-node-zk-config-provider";
import { levelPrivateStateProvider } from "@midnight-ntwrk/midnight-js-level-private-state-provider";
import { getNetworkId, setNetworkId } from "@midnight-ntwrk/midnight-js-network-id";

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
import { saveWalletSession, loadWalletSession, clearWalletSession } from "../walletSession.js";

// @ts-expect-error global WebSocket polyfill
globalThis.WebSocket = WebSocket;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ZK_KEYS_PATH = path.resolve(
  __dirname,
  "../../../compact/contracts/airlog/src/managed/airlog"
);

const PREPROD_CONFIG = {
  indexer: "https://indexer.preprod.midnight.network/api/v4/graphql",
  indexerWS: "wss://indexer.preprod.midnight.network/api/v4/graphql/ws",
  node: "https://rpc.preprod.midnight.network",
  proofServer: "http://127.0.0.1:6300",
};

// DEV_SEED is only used when no provider is detected
const DEV_SEED =
  "a1b2c3d4e5f60718293a4b5c6d7e8f9001112131415161718191a1b1c1d1e1f20";

// ─── Provider detection ───────────────────────────────────────────────────────

type ProviderResult =
  | { kind: "env"; seed: string }
  | { kind: "session"; address: string; coinPublicKey: string }
  | { kind: "devSeed"; seed: string };

function detect1AMProvider(): ProviderResult {
  // 1. Env var — highest priority (CI / 1AM wallet seed export)
  if (process.env.AIRLOG_SEED) {
    console.log("  Provider: AIRLOG_SEED (env)");
    return { kind: "env", seed: process.env.AIRLOG_SEED };
  }

  // 2. Existing session — already connected
  const session = loadWalletSession();
  if (session) {
    console.log("  Provider: persisted session (.pilotlog/wallet.json)");
    return { kind: "session", address: session.address, coinPublicKey: session.coinPublicKey };
  }

  // 3. Dev seed fallback (local dev only)
  console.log("  Provider: DEV_SEED (local dev fallback)");
  return { kind: "devSeed", seed: DEV_SEED };
}

// ─── Wallet initialisation ────────────────────────────────────────────────────

function deriveKeysFromSeed(seed: string) {
  const hdWallet = HDWallet.fromSeed(Buffer.from(seed, "hex"));
  if (hdWallet.type !== "seedOk") throw new Error("HDWallet init failed");

  const result = hdWallet.hdWallet
    .selectAccount(0)
    .selectRoles([Roles.Zswap, Roles.NightExternal, Roles.Dust])
    .deriveKeysAt(0);

  if (result.type !== "keysDerived") throw new Error("Key derivation failed");
  hdWallet.hdWallet.clear();
  return result.keys;
}

async function buildWallet(seed: string) {
  const keys = deriveKeysFromSeed(seed);

  const shieldedSecretKeys = ledger.ZswapSecretKeys.fromSeed(keys[Roles.Zswap]);
  const dustSecretKey = ledger.DustSecretKey.fromSeed(keys[Roles.Dust]);
  const unshieldedKeystore = createKeystore(keys[Roles.NightExternal], getNetworkId());

  const sharedCfg = {
    networkId: getNetworkId(),
    indexerClientConnection: {
      indexerHttpUrl: PREPROD_CONFIG.indexer,
      indexerWsUrl: PREPROD_CONFIG.indexerWS,
    },
    provingServerUrl: new URL(PREPROD_CONFIG.proofServer),
    relayURL: new URL(PREPROD_CONFIG.node.replace(/^http/, "ws")),
    txHistoryStorage: new InMemoryTransactionHistoryStorage(),
    costParameters: { additionalFeeOverhead: 0n, feeBlocksMargin: 5 },
  };

  const wallet = await WalletFacade.init({
    configuration: sharedCfg,
    shielded: (cfg) => ShieldedWallet(cfg).startWithSecretKeys(shieldedSecretKeys),
    unshielded: (cfg) =>
      UnshieldedWallet(cfg).startWithPublicKey(PublicKey.fromKeyStore(unshieldedKeystore)),
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
        (_: unknown, i: number) => cloned.fallibleUnshieldedOffer!.signatures.at(i) ?? signature
      );
      cloned.fallibleUnshieldedOffer = cloned.fallibleUnshieldedOffer.addSignatures(sigs);
    }
    if (cloned.guaranteedUnshieldedOffer) {
      const sigs = cloned.guaranteedUnshieldedOffer.inputs.map(
        (_: unknown, i: number) => cloned.guaranteedUnshieldedOffer!.signatures.at(i) ?? signature
      );
      cloned.guaranteedUnshieldedOffer = cloned.guaranteedUnshieldedOffer.addSignatures(sigs);
    }
    tx.intents.set(segment, cloned);
  }
}

async function createProviders(walletCtx: Awaited<ReturnType<typeof buildWallet>>) {
  const { wallet, shieldedSecretKeys, dustSecretKey, unshieldedKeystore } = walletCtx;

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
  const zkConfigProvider = new NodeZkConfigProvider(ZK_KEYS_PATH);

  return {
    walletProvider: walletAndMidnight,
    midnightProvider: walletAndMidnight,
    publicDataProvider: indexerPublicDataProvider(
      PREPROD_CONFIG.indexer,
      PREPROD_CONFIG.indexerWS
    ),
    zkConfigProvider,
    proofProvider: httpClientProofProvider(PREPROD_CONFIG.proofServer, zkConfigProvider),
    privateStateProvider: levelPrivateStateProvider({
      privateStateStoreName: "airlog-private-state",
      accountId: coinPublicKey,
      privateStoragePasswordProvider: () => storagePassword,
    }),
  };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const runTestTx = args.includes("--test-tx");
const disconnect = args.includes("--disconnect");

async function main() {
  console.log("╔══════════════════════════════════════════════════╗");
  console.log("║      AirLog — 1AM Wallet Connect                ║");
  console.log("╚══════════════════════════════════════════════════╝");

  if (disconnect) {
    clearWalletSession();
    console.log("\n  Wallet session cleared.");
    process.exit(0);
  }

  setNetworkId("preprod");

  // ── Step 1: Detect provider ──────────────────────────────────────────────
  console.log("\n[1] Detecting 1AM wallet provider");
  console.log("─".repeat(50));
  const provider = detect1AMProvider();

  // If we already have a session and don't need a test tx, just print and exit
  if (provider.kind === "session" && !runTestTx) {
    console.log(`  ✓ Wallet connected`);
    console.log(`  Address:       ${provider.address}`);
    console.log(`  CoinPublicKey: ${provider.coinPublicKey.slice(0, 16)}…`);
    console.log("\n  Run with --test-tx to submit a transaction.");
    process.exit(0);
  }

  // ── Step 2: Init wallet facade ───────────────────────────────────────────
  console.log("\n[2] Initialising wallet facade");
  console.log("─".repeat(50));

  const seed = provider.kind === "session"
    ? process.env.AIRLOG_SEED ?? DEV_SEED
    : (provider as { kind: "env" | "devSeed"; seed: string }).seed;

  const walletCtx = await buildWallet(seed);
  const address = walletCtx.unshieldedKeystore.getBech32Address();
  console.log(`  ✓ Wallet facade initialised`);
  console.log(`  Address (fund with tNight): ${address}`);
  console.log(`  Faucet: https://faucet.preprod.midnight.network/`);

  // ── Step 3: Connect proving service + sync ───────────────────────────────
  console.log("\n[3] Connecting proving service & syncing with PreProd");
  console.log("─".repeat(50));

  const syncedState = await Rx.firstValueFrom(
    walletCtx.wallet.state().pipe(
      Rx.throttleTime(5_000),
      Rx.filter((s) => s.isSynced)
    )
  );
  console.log("  ✓ Synced with PreProd");

  const balance = syncedState.unshielded.balances[unshieldedToken().raw] ?? 0n;
  const coinPublicKey = syncedState.shielded.coinPublicKey.toHexString();
  console.log(`  tNight balance: ${balance}`);
  console.log(`  CoinPublicKey:  ${coinPublicKey.slice(0, 16)}…`);

  // ── Step 4: Store session ────────────────────────────────────────────────
  console.log("\n[4] Storing wallet session");
  console.log("─".repeat(50));

  saveWalletSession({
    address,
    coinPublicKey,
    connectedAt: new Date().toISOString(),
  });
  console.log("  ✓ Session saved → .pilotlog/wallet.json");
  console.log(`  Address: ${address}`);

  if (!runTestTx) {
    console.log("\n╔══════════════════════════════════════════════════╗");
    console.log("║  WALLET CONNECTED                                ║");
    console.log("╚══════════════════════════════════════════════════╝");
    console.log(`\n  Run with --test-tx to submit a contract transaction.`);
    process.exit(0);
  }

  // ── Step 5: Test transaction ─────────────────────────────────────────────
  if (balance === 0n) {
    console.error("  ✗ Wallet has no tNight. Fund it first, then re-run.");
    process.exit(1);
  }

  console.log("\n[5] Submitting test transaction (registerAirframe)");
  console.log("─".repeat(50));

  const providers = await createProviders(walletCtx);

  const airlogCompiledContract = CompiledContract.make("airlog", Airlog.Contract).pipe(
    CompiledContract.withVacantWitnesses,
    CompiledContract.withCompiledFileAssets(ZK_KEYS_PATH)
  );

  const deployedContract = await deployContract(providers as any, {
    compiledContract: airlogCompiledContract,
    privateStateId: "airlogPrivateState",
    initialPrivateState: createAirlogPrivateState(),
  });

  const contractAddress = deployedContract.deployTxData.public.contractAddress;
  console.log(`  ✓ Contract deployed: ${contractAddress}`);

  const airframeId = new Uint8Array(32);
  const tail = Buffer.from("N12345", "utf8");
  airframeId.set(tail.subarray(0, Math.min(tail.length, 32)));

  const registerTxData = await deployedContract.callTx.registerAirframe(airframeId);
  console.log(`  ✓ registerAirframe tx: ${registerTxData.public.txId}`);

  console.log("\n╔══════════════════════════════════════════════════╗");
  console.log("║  WALLET CONNECTED + TRANSACTION CONFIRMED        ║");
  console.log("╠══════════════════════════════════════════════════╣");
  console.log(`║  Address:  ${address.slice(0, 38)}  ║`);
  console.log(`║  Contract: ${contractAddress.slice(0, 38)}  ║`);
  console.log(`║  Tx:       ${registerTxData.public.txId.slice(0, 38)}  ║`);
  console.log("╚══════════════════════════════════════════════════╝");

  process.exit(0);
}

main().catch((err) => {
  console.error("\n=== FAILED ===");
  console.error(err);
  process.exit(1);
});
