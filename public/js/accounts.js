// PilotLog student sign-in (cockpit nav chip).
// Flow: wallet.connect('preprod') -> getUnshieldedAddress() -> POST /api/auth/challenge ->
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
function findWallet() {
  const m = window.midnight || {};
  return m['1am'] || m.mnLace || Object.values(m).find((w) => w && typeof w.connect === 'function') || null;
}
async function connect(btn) {
  const wallet = findWallet();
  if (!wallet) return say('No Midnight wallet found. Install the 1AM Wallet extension, switch it to PreProd, then try again. You can keep exploring the SAMPLE data meanwhile.');
  btn.disabled = true; btn.textContent = 'Connecting…';
  try {
    const api = typeof wallet.connect === 'function' ? await wallet.connect('preprod') : await wallet.enable();
    if (!api) throw new Error('Connection rejected');
    const { unshieldedAddress } = (await api.getUnshieldedAddress?.()) || {};
    if (!unshieldedAddress || !String(unshieldedAddress).startsWith('mn_addr')) throw new Error('Wallet did not return an mn_addr unshielded address');
    if (typeof api.signData === 'function') {
      btn.textContent = 'Sign in wallet…';
      const ch = await post('/api/auth/challenge', { address: unshieldedAddress });
      const signature = await api.signData(ch.message, { encoding: 'text', keyType: 'unshielded' });
      await post('/api/auth/verify', { address: unshieldedAddress, nonce: ch.nonce, signature, provider: 'midnight-1am' });
    } else {
      await post('/api/auth/connect', { address: unshieldedAddress });
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
  if (b.dataset.acct === 'connect') return connect(b);
  if (b.dataset.acct === 'signout') { await post('/api/auth/signout').catch(() => {}); location.href = '/cockpit'; }
});
