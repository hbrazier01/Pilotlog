/**
 * walletSession.ts — Persistent wallet session store
 *
 * Stores the connected wallet address (bech32) and the seed reference
 * so subsequent CLI runs can skip the "connect wallet" step.
 *
 * Location: .pilotlog/wallet.json  (same dir as entries.json / profile.json)
 */

import fs from "node:fs";
import path from "node:path";

export type WalletSession = {
  address: string;          // bech32 unshielded address
  coinPublicKey: string;    // hex, used as account ID for private state
  connectedAt: string;      // ISO timestamp
};

const baseDir = process.env.PILOTLOG_HOME
  ? process.env.PILOTLOG_HOME
  : path.join(process.cwd(), ".pilotlog");

const walletFile = path.join(baseDir, "wallet.json");

function ensureDir() {
  if (!fs.existsSync(baseDir)) fs.mkdirSync(baseDir, { recursive: true });
}

export function loadWalletSession(): WalletSession | null {
  ensureDir();
  if (!fs.existsSync(walletFile)) return null;
  try {
    return JSON.parse(fs.readFileSync(walletFile, "utf-8")) as WalletSession;
  } catch {
    return null;
  }
}

export function saveWalletSession(session: WalletSession): void {
  ensureDir();
  fs.writeFileSync(walletFile, JSON.stringify(session, null, 2));
}

export function clearWalletSession(): void {
  if (fs.existsSync(walletFile)) fs.unlinkSync(walletFile);
}
