/**
 * deployed.ts — AirLog on-chain transaction flow (Midnight PreProd)
 *
 * Proves end-to-end: deploy AirLog contract → call addEntry → get real tx hash.
 *
 * Prerequisites:
 *   1. Proof server running at http://127.0.0.1:6300
 *      docker run -p 6300:6300 midnightntwrk/proof-server:latest
 *   2. Wallet funded with tNight on PreProd:
 *      https://faucet.preprod.midnight.network/
 *
 * Run:
 *   node --experimental-specifier-resolution=node --loader ts-node/esm src/cli/deployed.ts
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import { createHash } from "node:crypto";
import { Buffer } from "buffer";
import { WebSocket } from "ws";

// Midnight core
import { CompiledContract } from "@midnight-ntwrk/compact-js";
import { deployContract, findDeployedContract } from "@midnight-ntwrk/midnight-js-contracts";
import { httpClientProofProvider } from "@midnight-ntwrk/midnight-js-http-client-proof-provider";
import { indexerPublicDataProvider } from "@midnight-ntwrk/midnight-js-indexer-public-data-provider";
import { NodeZkConfigProvider } from "@midnight-ntwrk/midnight-js-node-zk-config-provider";
import { levelPrivateStateProvider } from "@midnight-ntwrk/midnight-js-level-private-state-provider";
import { type MidnightProvider, type WalletProvider } from "@midnight-ntwrk/midnight-js-types";
import { getNetworkId, setNetworkId } from "@midnight-ntwrk/midnight-js-network-id";
import { toHex } from "@midnight-ntwrk/midnight-js-utils";

// Wallet SDK
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

// AirLog contract
import { Airlog, createAirlogPrivateState } from "@repo/airlog-contract";

// Required for GraphQL subscriptions in Node.js
// @ts-expect-error: global WebSocket polyfill for apollo
globalThis.WebSocket = WebSocket;

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Base directory for ZK assets — must contain keys/ and zkir/ subdirectories
const ZK_KEYS_PATH = path.resolve(
  __dirname,
  "../../../../compact/contracts/airlog/src/managed/airlog"
);

// Deployment state persisted between runs
const DEPLOYMENT_JSON = path.resolve(__dirname, "../../../../deployment.json");

// Midnight PreProd network endpoints
const PREPROD_CONFIG = {
  indexer: "https://indexer.preprod.midnight.network/api/v4/graphql",
  indexerWS: "wss://indexer.preprod.midnight.network/api/v4/graphql/ws",
  node: "https://rpc.preprod.midnight.network",
  proofServer: "http://127.0.0.1:6300",
};

// ---------------------------------------------------------------------------
// Hardcoded dev seed (hex). DO NOT use in production.
// Replace with your own seed generated from generateRandomSeed() on first run.
// ---------------------------------------------------------------------------
const DEV_SEED =
  "a1b2c3d4e5f60718293a4b5c6d7e8f9001112131415161718191a1b1c1d1e1f20";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function loadDeployment(): { contractAddress: string } | null {
  if (fs.existsSync(DEPLOYMENT_JSON)) {
    return JSON.parse(fs.readFileSync(DEPLOYMENT_JSON, "utf8"));
  }
  return null;
}

function saveDeployment(contractAddress: string): void {
  fs.writeFileSync(DEPLOYMENT_JSON, JSON.stringify({ contractAddress }, null, 2));
  console.log(`  Deployment saved → ${DEPLOYMENT_JSON}`);
}

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

  const config = PREPROD_CONFIG;
  const sharedCfg = {
    networkId: getNetworkId(),
    indexerClientConnection: {
      indexerHttpUrl: config.indexer,
      indexerWsUrl: config.indexerWS,
    },
    provingServerUrl: new URL(config.proofServer),
    relayURL: new URL(config.node.replace(/^http/, "ws")),
    txHistoryStorage: new InMemoryTransactionHistoryStorage(),
    costParameters: {
      additionalFeeOverhead: 300_000_000_000_000n,
      feeBlocksMargin: 5,
    },
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

async function createProviders(
  walletCtx: Awaited<ReturnType<typeof buildWallet>>
): Promise<WalletProvider & MidnightProvider & { publicDataProvider: any; zkConfigProvider: any; proofProvider: any; privateStateProvider: any }> {
  const { wallet, shieldedSecretKeys, dustSecretKey, unshieldedKeystore } = walletCtx;

  const state = await Rx.firstValueFrom(
    wallet.state().pipe(Rx.filter((s) => s.isSynced))
  );

  const walletAndMidnight: WalletProvider & MidnightProvider = {
    getCoinPublicKey() {
      return state.shielded.coinPublicKey.toHexString();
    },
    getEncryptionPublicKey() {
      return state.shielded.encryptionPublicKey.toHexString();
    },
    async balanceTx(tx, ttl?) {
      const recipe = await wallet.balanceUnboundTransaction(
        tx,
        { shieldedSecretKeys, dustSecretKey },
        { ttl: ttl ?? new Date(Date.now() + 30 * 60 * 1000) }
      );
      // Sign unshielded intents manually (works around wallet-sdk bug with 'pre-proof' marker)
      const signFn = (payload: Uint8Array) => unshieldedKeystore.signData(payload);
      signIntents(recipe.baseTransaction, signFn, "proof");
      if (recipe.balancingTransaction) signIntents(recipe.balancingTransaction, signFn, "pre-proof");
      return wallet.finalizeRecipe(recipe);
    },
    submitTx(tx) {
      return wallet.submitTransaction(tx) as any;
    },
  };

  const coinPublicKey = walletAndMidnight.getCoinPublicKey();
  const storagePassword = `${coinPublicKey}!A`;
  const zkConfigProvider = new NodeZkConfigProvider(ZK_KEYS_PATH);

  return {
    ...walletAndMidnight,
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

function signIntents(
  tx: { intents?: Map<number, any> },
  signFn: (payload: Uint8Array) => ledger.Signature,
  proofMarker: "proof" | "pre-proof"
): void {
  if (!tx.intents || tx.intents.size === 0) return;
  for (const segment of tx.intents.keys()) {
    const intent = tx.intents.get(segment);
    if (!intent) continue;
    const cloned = ledger.Intent.deserialize<ledger.SignatureEnabled, ledger.Proofish, ledger.PreBinding>(
      "signature", proofMarker, "pre-binding", intent.serialize()
    );
    const sigData = cloned.signatureData(segment);
    const signature = signFn(sigData);
    if (cloned.fallibleUnshieldedOffer) {
      const sigs = cloned.fallibleUnshieldedOffer.inputs.map(
        (_: any, i: number) => cloned.fallibleUnshieldedOffer!.signatures.at(i) ?? signature
      );
      cloned.fallibleUnshieldedOffer = cloned.fallibleUnshieldedOffer.addSignatures(sigs);
    }
    if (cloned.guaranteedUnshieldedOffer) {
      const sigs = cloned.guaranteedUnshieldedOffer.inputs.map(
        (_: any, i: number) => cloned.guaranteedUnshieldedOffer!.signatures.at(i) ?? signature
      );
      cloned.guaranteedUnshieldedOffer = cloned.guaranteedUnshieldedOffer.addSignatures(sigs);
    }
    tx.intents.set(segment, cloned);
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log("=== AirLog on-chain transaction flow (Midnight PreProd) ===\n");

  // Set network to PreProd
  setNetworkId("preprod");
  console.log(`Network: ${getNetworkId()}`);
  console.log(`ZK keys: ${ZK_KEYS_PATH}`);
  console.log(`Proof server: ${PREPROD_CONFIG.proofServer}\n`);

  // Compile the AirLog contract with ZK assets
  const airlogCompiledContract = CompiledContract.make("airlog", Airlog.Contract).pipe(
    CompiledContract.withVacantWitnesses,
    CompiledContract.withCompiledFileAssets(ZK_KEYS_PATH)
  );

  // Build wallet from hardcoded dev seed
  console.log("Building wallet from seed...");
  const walletCtx = await buildWallet(DEV_SEED);
  console.log("Wallet built.\n");

  // Show unshielded address for funding
  console.log(`Unshielded address (fund with tNight): ${walletCtx.unshieldedKeystore.getBech32Address()}`);
  console.log("Faucet: https://faucet.preprod.midnight.network/\n");

  // Wait for sync
  console.log("Syncing with PreProd network (this may take a minute)...");
  const syncedState = await Rx.firstValueFrom(
    walletCtx.wallet.state().pipe(
      Rx.throttleTime(5_000),
      Rx.filter((s) => s.isSynced)
    )
  );
  console.log("Synced.\n");

  // Check for tNight balance
  const balance = syncedState.unshielded.balances[unshieldedToken().raw] ?? 0n;
  console.log(`tNight balance: ${balance}`);
  if (balance === 0n) {
    console.error(
      "\nERROR: Wallet has no tNight. Fund it at https://faucet.preprod.midnight.network/ then re-run."
    );
    process.exit(1);
  }

  // Configure all providers
  console.log("\nConfiguring providers...");
  const providers = await createProviders(walletCtx);
  console.log("Providers ready.\n");

  // Deploy or reuse contract
  let deployedContract: any;
  const existing = loadDeployment();

  if (existing) {
    console.log(`Joining existing contract at ${existing.contractAddress}...`);
    deployedContract = await findDeployedContract(providers, {
      contractAddress: existing.contractAddress,
      compiledContract: airlogCompiledContract,
      privateStateId: "airlogPrivateState",
      initialPrivateState: createAirlogPrivateState(),
    });
    console.log("Contract joined.\n");
  } else {
    console.log("Deploying AirLog contract to PreProd...");
    deployedContract = await deployContract(providers, {
      compiledContract: airlogCompiledContract,
      privateStateId: "airlogPrivateState",
      initialPrivateState: createAirlogPrivateState(),
    });
    const contractAddress = deployedContract.deployTxData.public.contractAddress;
    console.log(`Contract deployed at: ${contractAddress}\n`);
    saveDeployment(contractAddress);
  }

  // Build addEntry arguments
  const airframeId = new Uint8Array(32);
  const tail = Buffer.from("N12345", "utf8");
  airframeId.set(tail.subarray(0, Math.min(tail.length, 32)));

  const entryType = Airlog.EntryType.ANNUAL; // ANNUAL inspection

  const dateUtc = BigInt(Math.floor(new Date("2026-04-02").getTime() / 1000));
  const tachOrTT = BigInt(1234); // 1234 tach hours

  const docHash = new Uint8Array(
    createHash("sha256").update("annual-inspection-report-2026.pdf").digest()
  );
  const docRef = new Uint8Array(32); // empty ref for now

  // Call addEntry — the key transaction
  console.log("Calling addEntry on-chain...");
  console.log(`  airframeId: N12345 (padded to 32 bytes)`);
  console.log(`  entryType: ANNUAL`);
  console.log(`  dateUtc: ${dateUtc} (2026-04-02)`);
  console.log(`  tachOrTT: ${tachOrTT}`);
  console.log(`  docHash: ${toHex(docHash)}`);

  const finalizedTxData = await deployedContract.callTx.addEntry(
    airframeId,
    entryType,
    dateUtc,
    tachOrTT,
    docHash,
    docRef
  );

  // Output
  console.log("\n=== SUCCESS ===");
  console.log(`Transaction hash: ${finalizedTxData.public.txId}`);
  console.log(`Block height:     ${finalizedTxData.public.blockHeight}`);
  console.log(`Contract address: ${deployedContract.deployTxData.public.contractAddress}`);
  console.log("\nAirLog entry anchored on Midnight PreProd.");

  process.exit(0);
}

main().catch((err) => {
  console.error("\n=== FAILED ===");
  console.error(err);
  process.exit(1);
});
