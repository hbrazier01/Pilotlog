// PilotLog student sign-in (cockpit nav chip).
// Flow: pick a detected wallet (1AM or Lace) -> wallet.connect('preprod') -> getUnshieldedAddress() -> POST /api/auth/challenge ->
//       api.signData(message, { encoding: 'text', keyType: 'unshielded' }) -> POST /api/auth/verify.
// The server verifies the signature and that the verifying key belongs to the address; the session
// is an httpOnly cookie. No wallet data is kept in localStorage.
const chip = document.getElementById('acct');
const msgEl = document.getElementById('acctMsg');
function say(t, ms = 6000) {
  if (!msgEl) return alert(t);
  msgEl.textContent = t; msgEl.style.display = 'block';
  clearTimeout(say._t); say._t = setTimeout(() => { msgEl.style.display = 'none'; }, ms);
}
async function post(url, body) {
  const r = await fetch(url, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.ok === false) throw new Error(j.error || `HTTP ${r.status}`);
  return j;
}
import { detectWallets, isSupportedApiVersion } from './wallets.js';

function closePicker() { document.getElementById('walletPicker')?.remove(); }
function openPicker(btn) {
  closePicker();
  const found = detectWallets(window.midnight);
  if (!found.length) return say('No Midnight wallet found. Install 1AM or Lace, switch it to PreProd, then try again. You can keep exploring the SAMPLE data meanwhile.');
  const box = document.createElement('div');
  box.id = 'walletPicker'; box.className = 'wallet-picker'; box.setAttribute('role', 'dialog'); box.setAttribute('aria-label', 'Choose a wallet');
  const h = document.createElement('div'); h.className = 'wp-h'; h.textContent = 'Sign in with your Midnight wallet'; box.appendChild(h);
  for (const w of found) {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'wp-opt'; b.dataset.provider = w.provider;
    const icon = String(w.wallet.icon || '');
    if (/^(https:|data:image\/)/.test(icon)) { const img = document.createElement('img'); img.src = icon; img.alt = ''; b.appendChild(img); }
    else { const m = document.createElement('span'); m.className = 'wp-mono'; m.textContent = w.label.slice(0, 2); b.appendChild(m); }
    const t = document.createElement('span'); t.className = 'wp-t';
    const n = document.createElement('b'); n.textContent = w.label; t.appendChild(n);
    const d = document.createElement('small'); d.textContent = 'Detected' + (w.apiVersion ? ' · API ' + w.apiVersion : ''); t.appendChild(d);
    b.appendChild(t);
    b.addEventListener('click', () => { closePicker(); connect(btn, w); });
    box.appendChild(b);
  }
  const f = document.createElement('div'); f.className = 'wp-f'; f.textContent = 'Same wallet address = same logbook, whichever wallet you use. Signing is free and sends no transaction.'; box.appendChild(f);
  document.body.appendChild(box);
  setTimeout(() => document.addEventListener('click', function off(e) { if (!box.contains(e.target)) { closePicker(); document.removeEventListener('click', off); } }), 0);
}
async function connect(btn, found) {
  const { wallet, provider, label } = found;
  if (!isSupportedApiVersion(found.apiVersion)) return say(`${label} uses DApp connector ${found.apiVersion}; please update the wallet.`);
  btn.disabled = true; btn.textContent = `Connecting ${label}…`;
  try {
    const api = await wallet.connect('preprod');
    if (!api) throw new Error('Connection rejected');
    const { unshieldedAddress } = (await api.getUnshieldedAddress?.()) || {};
    if (!unshieldedAddress || !String(unshieldedAddress).startsWith('mn_addr')) throw new Error('Wallet did not return an mn_addr unshielded address');
    if (typeof api.signData === 'function') {
      btn.textContent = `Approve in ${label}…`;
      const ch = await post('/api/auth/challenge', { address: unshieldedAddress });
      const signature = await api.signData(ch.message, { encoding: 'text', keyType: 'unshielded' });
      await post('/api/auth/verify', { address: unshieldedAddress, nonce: ch.nonce, signature, provider });
    } else {
      // Only works if the server explicitly enables ALLOW_UNVERIFIED_WALLET_LOGIN (off by default).
      await post('/api/auth/connect', { address: unshieldedAddress, provider });
    }
    location.href = location.pathname + location.search.replace(/([?&])demo=1&?/, '$1').replace(/[?&]$/, '');
  } catch (e) {
    say('Sign-in failed: ' + (e?.message || e));
    btn.disabled = false; btn.textContent = 'Connect wallet';
  }
}
chip?.addEventListener('click', async (ev) => {
  const b = ev.target.closest('button[data-acct]');
  if (!b) return;
  if (b.dataset.acct === 'connect') return openPicker(b);
  if (b.dataset.acct === 'signout') { await post('/api/auth/signout').catch(() => {}); location.href = '/cockpit'; }
});
