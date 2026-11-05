// /account — passkeys (list/add/remove), optional wallet link, sign out. All calls go to /api/v2/*.
import { api, show, renderWalletButtons, walletFlow, signOut } from './accounts.js';
import { passkeysSupported, createPasskey, cancelled } from './webauthn.js';

const $ = (id) => document.getElementById(id);
const network = document.body.dataset.network || 'preprod';

api('/api/v2/session', undefined, 'GET').then((s) => {
  if (!s.authenticated) { location.href = '/signin'; return; }
  $('who').textContent = `Signed in · session expires ${new Date(s.session.expiresAt).toLocaleString()}`;
}).catch(() => {});

async function loadPasskeys() {
  const ul = $('pkList'); ul.textContent = '';
  try {
    const { passkeys } = await api('/api/v2/auth/passkeys', undefined, 'GET');
    if (!passkeys.length) { const li = document.createElement('li'); li.className = 'dim'; li.textContent = 'No passkeys yet. Add one to sign in without email.'; ul.appendChild(li); return; }
    for (const p of passkeys) {
      const li = document.createElement('li');
      const t = document.createElement('span');
      t.textContent = `${p.nickname || 'Passkey'} · added ${new Date(p.createdAt).toLocaleDateString()}${p.lastUsedAt ? ' · last used ' + new Date(p.lastUsedAt).toLocaleDateString() : ''}`;
      const b = document.createElement('button'); b.type = 'button'; b.className = 'btn small'; b.textContent = 'Remove';
      b.addEventListener('click', async () => {
        b.disabled = true;
        try { await api('/api/v2/auth/passkeys/' + encodeURIComponent(p.id), undefined, 'DELETE'); show($('pkMsg'), 'Passkey removed.', 'ok'); loadPasskeys(); }
        catch (e) { show($('pkMsg'), e.message); b.disabled = false; }
      });
      li.append(t, b); ul.appendChild(li);
    }
  } catch (e) { show($('pkMsg'), e.message); }
}
loadPasskeys();

if (!passkeysSupported()) { $('addPk').hidden = true; $('pkUnsupported').hidden = false; }
$('addPk').addEventListener('click', async () => {
  const b = $('addPk'); b.disabled = true; show($('pkMsg'), '');
  try {
    const opts = await api('/api/v2/auth/passkey/register/options', {});
    const response = await createPasskey(opts);
    await api('/api/v2/auth/passkey/register/verify', { response, nickname: navigator.platform ? `Passkey (${navigator.platform})`.slice(0, 60) : 'Passkey' });
    show($('pkMsg'), 'Passkey added. You can now sign in with it.', 'ok'); loadPasskeys();
  } catch (e) { show($('pkMsg'), cancelled(e) ? 'Passkey setup was cancelled.' : e.message); }
  finally { b.disabled = false; }
});

renderWalletButtons($('walletList'), async (w, b) => {
  b.disabled = true; show($('wMsg'), '');
  try {
    const r = await walletFlow(w, 'link', network, (t) => show($('wMsg'), t, 'ok'));
    show($('wMsg'), r.alreadyLinked ? 'That wallet is already linked to this account.' : `${w.label} linked. You can now sign in with it.`, 'ok');
  } catch (e) { show($('wMsg'), 'Wallet link failed: ' + (e?.message || e)); }
  finally { b.disabled = false; }
}, 'No Midnight wallet detected. Linking a wallet is optional — install 1AM or Lace and reload to link one.');

$('signOut').addEventListener('click', () => signOut(false));
$('signOutAll').addEventListener('click', () => signOut(true));
