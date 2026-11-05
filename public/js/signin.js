// /signin — email magic link, passkey sign-in, optional linked-wallet sign-in. All calls go to /api/v2/*.
import { api, show, renderWalletButtons, walletFlow } from './accounts.js';
import { passkeysSupported, getPasskey, cancelled } from './webauthn.js';

const $ = (id) => document.getElementById(id);
const network = document.body.dataset.network || 'preprod';
const next = () => { location.href = '/cockpit'; };

// Already signed in → offer the cockpit instead of a second sign-in.
api('/api/v2/session', undefined, 'GET').then((s) => {
  if (s.authenticated) show($('emailMsg'), 'You\u2019re already signed in. Open the cockpit or Account from the links below.', 'ok');
}).catch(() => {});

// ── email magic link: request → sent ──
let lastEmail = '';
async function sendLink(email) {
  const btn = $('emailBtn'); btn.disabled = true; $('resendBtn').disabled = true; show($('emailMsg'), '');
  try {
    await api('/api/v2/auth/email/start', { email });
    lastEmail = email; $('sentTo').textContent = email;
    $('emailForm').hidden = true; $('emailSent').hidden = false;
  } catch (e) {
    $('emailForm').hidden = false; $('emailSent').hidden = true;
    show($('emailMsg'), e.status === 400 ? 'Enter a valid email address.' : e.message);
  } finally { btn.disabled = false; $('resendBtn').disabled = false; }
}
$('emailForm').addEventListener('submit', (ev) => {
  ev.preventDefault();
  const email = $('email').value.trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return show($('emailMsg'), 'Enter a valid email address.');
  sendLink(email);
});
$('resendBtn').addEventListener('click', () => sendLink(lastEmail));
$('changeBtn').addEventListener('click', () => { $('emailSent').hidden = true; $('emailForm').hidden = false; $('email').focus(); });

// ── passkey (usernameless) ──
if (!passkeysSupported()) { $('passkeyBtn').hidden = true; $('pkUnsupported').hidden = false; }
$('passkeyBtn').addEventListener('click', async () => {
  const b = $('passkeyBtn'); b.disabled = true; show($('pkMsg'), '');
  try {
    const opts = await api('/api/v2/auth/passkey/login/options', {});
    const response = await getPasskey(opts);
    await api('/api/v2/auth/passkey/login/verify', { response });
    next();
  } catch (e) {
    show($('pkMsg'), cancelled(e) ? 'Passkey sign-in was cancelled.' : (e.message || 'Passkey sign-in failed.'));
  } finally { b.disabled = false; }
});

// ── optional: wallet already linked to an account ──
$('walletDetails').addEventListener('toggle', () => {
  if (!$('walletDetails').open) return;
  renderWalletButtons($('walletList'), async (w, b) => {
    b.disabled = true; show($('wMsg'), '');
    try { await walletFlow(w, 'login', network, (t) => show($('wMsg'), t, 'ok')); next(); }
    catch (e) { show($('wMsg'), 'Wallet sign-in failed: ' + (e?.message || e)); b.disabled = false; }
  });
});
