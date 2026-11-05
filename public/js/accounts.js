// PilotLog accounts v2 — shared browser helpers (sign-in page, account page, cockpit nav chip).
// Adapted from PR #11's accounts.js: same wallet picker + signData flow, now against /api/v2/auth/wallet/*
// with an explicit intent ('login' | 'link'). Sessions are an HttpOnly cookie; nothing is kept in localStorage.
import { detectWallets, isSupportedApiVersion } from './wallets.js';

export async function api(url, body, method = 'POST') {
  const r = await fetch(url, { method, credentials: 'same-origin', headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.ok === false) {
    const e = new Error(r.status === 429 ? `Too many attempts. Try again in ${Math.ceil(Number(r.headers.get('Retry-After') || 60) / 60)} min.` : (j.error || `Request failed (${r.status})`));
    e.status = r.status; throw e;
  }
  return j;
}

export function show(el, text, kind = 'err') {
  if (!el) return;
  el.className = 'msg' + (text ? ' ' + kind : ''); el.textContent = text || '';
}

/** Render one button per detected wallet into `container`; `onPick(found)` gets {wallet, provider, label, apiVersion}. */
export function renderWalletButtons(container, onPick, emptyText) {
  container.textContent = '';
  const found = detectWallets(window.midnight);
  if (!found.length) {
    const p = document.createElement('p'); p.className = 'dim small';
    p.textContent = emptyText || 'No Midnight wallet detected. Install 1AM or Lace and reload this page.';
    container.appendChild(p); return [];
  }
  for (const w of found) {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'btn'; b.dataset.provider = w.provider;
    b.textContent = `${w.label}${w.apiVersion ? ' · API ' + w.apiVersion : ''}`;
    b.addEventListener('click', () => onPick(w, b));
    container.appendChild(b);
  }
  return found;
}

/**
 * Wallet flow: connect → unshielded mn_addr → server challenge (intent) → signData → verify-login | link.
 * Lace and 1AM both expose signData(message, { encoding: 'text', keyType: 'unshielded' }) on DApp connector v4.
 */
export async function walletFlow(found, intent, network, onStep = () => {}) {
  const { wallet, provider, label } = found;
  if (!isSupportedApiVersion(found.apiVersion)) throw new Error(`${label} uses DApp connector ${found.apiVersion}; please update the wallet.`);
  onStep(`Connecting ${label}…`);
  const w = await wallet.connect(network || 'preprod');
  if (!w) throw new Error('Connection rejected');
  const { unshieldedAddress } = (await w.getUnshieldedAddress?.()) || {};
  if (!unshieldedAddress || !String(unshieldedAddress).startsWith('mn_addr')) throw new Error('Wallet did not return an mn_addr unshielded address');
  if (typeof w.signData !== 'function') throw new Error(`${label} can't sign messages (signData missing). Update the wallet.`);
  const ch = await api('/api/v2/auth/wallet/challenge', { address: unshieldedAddress, intent, provider });
  onStep(`Approve the message in ${label}…`);
  const signature = await w.signData(ch.message, { encoding: ch.encoding || 'text', keyType: ch.keyType || 'unshielded' });
  return api(intent === 'link' ? '/api/v2/auth/wallet/link' : '/api/v2/auth/wallet/verify-login', { address: unshieldedAddress, nonce: ch.nonce, signature });
}

export async function signOut(all = false) {
  await api('/api/v2/session/revoke', all ? { all: true } : {}).catch(() => {});
  location.href = '/signin';
}

// Cockpit nav chip (rendered only in accounts v2 mode).
document.getElementById('acct')?.addEventListener('click', (ev) => {
  const b = ev.target.closest('button[data-acct="signout"]');
  if (b) { b.disabled = true; signOut(); }
});
