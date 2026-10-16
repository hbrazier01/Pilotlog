// Midnight wallet discovery (DApp connector v4 / CAIP-372 draft).
// Wallets install an InitialAPI { rdns, name, icon, apiVersion, connect(networkId) } under window.midnight.
// Current Lace builds use a random UUID key (rdns io.lace.wallet); 1AM uses the key '1am' (rdns com.midnight.1am).
// We match on rdns first, then on known legacy keys, and only list wallets we support and actually see.
export const SUPPORTED_WALLETS = [
  { provider: 'midnight-1am', label: '1AM', rdns: ['com.midnight.1am'], keys: ['1am', '1AM'], install: 'https://1am.xyz' },
  { provider: 'midnight-lace', label: 'Lace', rdns: ['io.lace.wallet'], keys: ['mnLace'], install: 'https://www.lace.io' },
];

/** Returns [{ provider, label, wallet, apiVersion }] for supported wallets present in `midnight`, one per provider. */
export function detectWallets(midnight) {
  const out = [];
  if (!midnight || typeof midnight !== 'object') return out;
  const entries = Object.entries(midnight).filter(([, w]) => w && typeof w.connect === 'function');
  for (const spec of SUPPORTED_WALLETS) {
    const hit = entries.find(([, w]) => spec.rdns.includes(String(w.rdns || '')))
      || entries.find(([k]) => spec.keys.includes(k));
    if (hit) out.push({ provider: spec.provider, label: spec.label, wallet: hit[1], apiVersion: String(hit[1].apiVersion || '') });
  }
  return out;
}

/** v4 connector only (connect(networkId) + signData). Older/unknown major versions are refused. */
export function isSupportedApiVersion(v) {
  const major = parseInt(String(v || '').split('.')[0], 10);
  return Number.isFinite(major) ? major >= 4 : true; // missing apiVersion: let connect() + feature checks decide
}
