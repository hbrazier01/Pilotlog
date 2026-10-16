/**
 * Server sessions: stateless HMAC-signed cookie + single-use sign-in nonces.
 * Cookie: pl_session (httpOnly, SameSite=Lax, Secure in production, 30 days).
 * Secret: SESSION_SECRET env (>= 32 chars). If unset, a random per-process secret is used and
 * everyone is signed out on restart/redeploy (logged as a warning).
 */
import crypto from 'node:crypto';
import { isValidStudentId } from './identity.mjs';

export const COOKIE = 'pl_session';
const MAX_AGE_S = 30 * 24 * 3600;
const NONCE_TTL_MS = 5 * 60 * 1000;

let warned = false;
export function sessionSecret() {
  const s = process.env.SESSION_SECRET;
  if (s && s.length >= 32) return s;
  if (!globalThis.__plEphemeralSecret) {
    globalThis.__plEphemeralSecret = crypto.randomBytes(32).toString('hex');
    if (!warned && process.env.NODE_ENV !== 'test') { warned = true; console.warn('[auth] SESSION_SECRET not set (or < 32 chars): using a per-process secret; sessions reset on restart'); }
  }
  return globalThis.__plEphemeralSecret;
}

const b64u = (b) => Buffer.from(b).toString('base64url');
const mac = (data, secret) => crypto.createHmac('sha256', secret).update(data).digest('base64url');

export function encodeSession(payload, { secret = sessionSecret(), now = Date.now() } = {}) {
  const body = { v: 1, ...payload, iat: Math.floor(now / 1000), exp: Math.floor(now / 1000) + MAX_AGE_S };
  const data = b64u(JSON.stringify(body));
  return `${data}.${mac(data, secret)}`;
}

export function decodeSession(token, { secret = sessionSecret(), now = Date.now() } = {}) {
  if (typeof token !== 'string' || token.length > 2048) return null;
  const [data, sig] = token.split('.');
  if (!data || !sig) return null;
  const want = Buffer.from(mac(data, secret));
  const got = Buffer.from(sig);
  if (want.length !== got.length || !crypto.timingSafeEqual(want, got)) return null;
  let body;
  try { body = JSON.parse(Buffer.from(data, 'base64url').toString('utf8')); } catch { return null; }
  if (!body || body.v !== 1 || !isValidStudentId(body.sid) || typeof body.wa !== 'string') return null;
  if (!(body.exp > now / 1000)) return null;
  return body;
}

export function parseCookies(header = '') {
  const out = {};
  for (const part of String(header).split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    const k = part.slice(0, i).trim();
    if (k) out[k] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

export function isSecureRequest(req) {
  return process.env.NODE_ENV === 'production' || !!process.env.RAILWAY_ENVIRONMENT || req.secure || req.get?.('x-forwarded-proto') === 'https';
}

export function sessionCookie(token, req) {
  return `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${MAX_AGE_S}${isSecureRequest(req) ? '; Secure' : ''}`;
}
export function clearCookie(req) {
  return `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${isSecureRequest(req) ? '; Secure' : ''}`;
}

/** In-memory single-use nonces (single Railway instance). */
export function createNonceStore({ ttlMs = NONCE_TTL_MS, max = 5000 } = {}) {
  const m = new Map();
  const sweep = (now) => { for (const [k, v] of m) if (v.exp <= now) m.delete(k); };
  return {
    issue(data, now = Date.now()) {
      sweep(now);
      if (m.size >= max) m.delete(m.keys().next().value);
      const nonce = crypto.randomBytes(16).toString('hex');
      m.set(nonce, Object.assign(data, { exp: now + ttlMs })); // same object: caller may add fields
      return nonce;
    },
    take(nonce, now = Date.now()) {
      const v = m.get(String(nonce));
      if (!v) return null;
      m.delete(String(nonce));
      return v.exp > now ? v : null;
    },
    size: () => m.size,
  };
}
