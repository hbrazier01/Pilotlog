/**
 * Auth routes + middleware.
 *   GET  /api/auth/session     who am I (never 401s)
 *   POST /api/auth/challenge   { address }                      -> { nonce, message }
 *   POST /api/auth/verify      { address, nonce, signature }    -> sets pl_session cookie
 *   POST /api/auth/connect     { address }  UNVERIFIED fallback, only if ALLOW_UNVERIFIED_WALLET_LOGIN=1
 *   POST /api/auth/signout
 * attachStudent(): sets req.student = { id, walletAddress, provider, verified } | null.
 * requireStudent(): 401 { error, connect: true } for unauthenticated writes.
 */
import { getProvider, PROVIDERS, studentIdFor, looksLikeWalletAddress, challengeMessage, decodeUnshieldedAddress } from './identity.mjs';
import { COOKIE, encodeSession, decodeSession, parseCookies, sessionCookie, clearCookie, createNonceStore } from './session.mjs';
import { migrateLegacyData } from './legacyMigration.mjs';

export function shortAddress(a = '') {
  const s = String(a);
  const body = s.replace(/^mn_addr_[a-z]+1/, '');   // drop the constant mn_addr_preprod1 prefix
  return body.length > 12 ? `${body.slice(0, 5)}…${body.slice(-5)}` : s;
}

export function publicStudent(st) {
  if (!st) return null;
  return { id: st.id, walletAddress: st.walletAddress, shortAddress: shortAddress(st.walletAddress), provider: st.provider, verified: !!st.verified };
}

export function attachStudent() {
  return (req, _res, next) => {
    const tok = parseCookies(req.headers.cookie || '')[COOKIE];
    const s = tok ? decodeSession(tok) : null;
    req.student = s ? { id: s.sid, walletAddress: s.wa, provider: s.prov, verified: !!s.ver } : null;
    next();
  };
}

export function requireStudent(req, res, next) {
  if (req.student) return next();
  res.status(401).json({ ok: false, error: 'Connect your wallet to save your own data.', connect: true });
}

/** Block cross-site state changes (defence in depth on top of SameSite=Lax). */
export function sameOriginWrites() {
  return (req, res, next) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
    const origin = req.headers.origin;
    if (!origin) return next();
    try {
      if (new URL(origin).host === req.headers.host) return next();
    } catch { /* fallthrough */ }
    res.status(403).json({ ok: false, error: 'cross-origin request blocked' });
  };
}

export function registerAuthRoutes(app, { store, dataDir, nonces = createNonceStore() }) {
  const startSession = async (req, res, { address, provider, verified }) => {
    const id = studentIdFor(address);
    await store.ensureStudent(id, { walletAddress: address, provider });
    let migration = null;
    try { migration = await migrateLegacyData({ dataDir, store, studentId: id, walletAddress: address }); }
    catch (err) { console.error('[auth] legacy migration error:', err.message); }
    res.setHeader('Set-Cookie', sessionCookie(encodeSession({ sid: id, wa: address, prov: provider, ver: verified }), req));
    const st = { id, walletAddress: address, provider, verified };
    res.json({ ok: true, student: publicStudent(st), migration: migration?.ran ? migration : undefined });
  };

  app.get('/api/auth/session', (req, res) => {
    res.json({
      signedIn: !!req.student,
      student: publicStudent(req.student),
      providers: Object.values(PROVIDERS).map((p) => ({ id: p.id, label: p.label, available: p.available })),
      unverifiedFallback: process.env.ALLOW_UNVERIFIED_WALLET_LOGIN === '1',
    });
  });

  app.post('/api/auth/challenge', async (req, res) => {
    const address = String(req.body?.address || '').trim();
    try { await decodeUnshieldedAddress(address); } catch (err) { return res.status(400).json({ ok: false, error: err.message }); }
    const issuedAt = new Date().toISOString();
    const domain = String(req.headers.host || 'pilotlog').slice(0, 100);
    const pending = { address, issuedAt, domain };
    const nonce = nonces.issue(pending);
    pending.message = challengeMessage({ address, nonce, issuedAt, domain });
    res.json({ ok: true, nonce, message: pending.message, encoding: 'text', keyType: 'unshielded' });
  });

  app.post('/api/auth/verify', async (req, res) => {
    const { address, nonce, signature, provider = 'midnight-1am' } = req.body || {};
    const pending = nonces.take(nonce);
    if (!pending) return res.status(400).json({ ok: false, error: 'sign-in challenge expired or already used' });
    if (pending.address !== address) return res.status(400).json({ ok: false, error: 'address does not match challenge' });
    try {
      const p = getProvider(provider);
      const out = await p.verify({ address, message: pending.message, signature });
      await startSession(req, res, { address: out.walletAddress, provider: p.id, verified: true });
    } catch (err) {
      res.status(401).json({ ok: false, error: String(err.message || err) });
    }
  });

  // Fallback for wallets without signData. Trusts the client's address — off unless explicitly enabled.
  app.post('/api/auth/connect', async (req, res) => {
    if (process.env.ALLOW_UNVERIFIED_WALLET_LOGIN !== '1') return res.status(403).json({ ok: false, error: 'This wallet must sign a message to sign in (signData). Unverified sign-in is disabled.' });
    const address = String(req.body?.address || '').trim();
    if (!looksLikeWalletAddress(address)) return res.status(400).json({ ok: false, error: 'invalid Midnight address' });
    try { await decodeUnshieldedAddress(address); } catch (err) { return res.status(400).json({ ok: false, error: err.message }); }
    await startSession(req, res, { address, provider: 'midnight-1am', verified: false });
  });

  app.post('/api/auth/signout', (req, res) => {
    res.setHeader('Set-Cookie', clearCookie(req));
    res.json({ ok: true });
  });
}
