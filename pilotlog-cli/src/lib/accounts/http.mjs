/**
 * http.mjs — Express wiring for accounts v2 sessions (PR-2). Library + middleware + two internal routes.
 * No sign-in provider is wired here (PR-3/4/5 create sessions via createSession()).
 *
 * Only active when PILOTLOG_ACCOUNTS_V2 is on AND Postgres is configured. Otherwise
 * registerAccountsV2() is a no-op: no middleware, no routes, no cookies (flag-off behaviour unchanged,
 * JSON-file mode unchanged).
 *
 * CSRF: the cookie is SameSite=Lax (not sent on cross-site POST/fetch) and every non-GET/HEAD/OPTIONS
 * request under /api/v2 must carry an Origin (or Referer) that matches this host or
 * PILOTLOG_ALLOWED_ORIGINS. State-changing v2 routes are JSON POSTs only. See docs/accounts-v2.md.
 */
import { accountsV2Enabled } from "./flag.mjs";
import { loadSession, revokeSession, revokeAllSessions, cleanupSessions } from "./sessions.mjs";
import { cleanupChallenges } from "./challenges.mjs";
import { selectEmailProvider } from "./email/index.mjs";
import { registerEmailAuthRoutes } from "./emailRoutes.mjs";
import { registerPasskeyRoutes } from "./passkeyRoutes.mjs";
import { registerWalletRoutes } from "./walletRoutes.mjs";
import { registerPaperImportRoutes, paperImportEnabled } from "../import/routes.mjs";
import { selectImageStore } from "../import/imageStore.mjs";
import { selectExtractor } from "../import/extractors.mjs";

export function cookieConfig(env = process.env) {
  const secure = String(env.PILOTLOG_COOKIE_SECURE ?? "true").trim().toLowerCase() !== "false";
  // __Host- prefix requires Secure + Path=/ + no Domain; plain name only for local http dev.
  return { name: secure ? "__Host-pl_sid" : "pl_sid", secure };
}

export function parseCookies(header) {
  const out = {};
  for (const part of String(header || "").split(";")) {
    const i = part.indexOf("=");
    if (i < 0) continue;
    const k = part.slice(0, i).trim();
    if (k && !(k in out)) out[k] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

export function sessionCookie(token, { expiresAt, env = process.env } = {}) {
  const { name, secure } = cookieConfig(env);
  const maxAge = Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000));
  return [`${name}=${token}`, "Path=/", "HttpOnly", "SameSite=Lax", secure ? "Secure" : null, `Max-Age=${maxAge}`]
    .filter(Boolean).join("; ");
}

export function clearSessionCookie(env = process.env) {
  const { name, secure } = cookieConfig(env);
  return [`${name}=`, "Path=/", "HttpOnly", "SameSite=Lax", secure ? "Secure" : null, "Max-Age=0"].filter(Boolean).join("; ");
}

function clientMeta(req) {
  const xff = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  return { ip: xff || req.socket?.remoteAddress || null, ua: req.headers["user-agent"] || null };
}

/** Load the v2 session cookie → req.accountV2 (and req.student if nothing else set it). */
export function attachSessionV2({ pool, env = process.env }) {
  const { name } = cookieConfig(env);
  return async (req, res, next) => {
    req.accountV2 = null;
    const token = parseCookies(req.headers.cookie)[name];
    if (!token) return next();
    try {
      const s = await loadSession(pool, token);
      if (s) {
        req.accountV2 = { studentId: s.studentId, session: s, token };
        if (req.student === undefined) req.student = { id: s.studentId, via: "accounts-v2" };
      } else {
        res.append("Set-Cookie", clearSessionCookie(env));
      }
    } catch (err) {
      console.error(`[accounts] session lookup failed: ${err.message}`); // fail closed: unauthenticated
    }
    next();
  };
}

/** Same-origin guard for state-changing requests (defence in depth on top of SameSite=Lax). */
export function sameOriginWritesV2({ env = process.env } = {}) {
  const extra = String(env.PILOTLOG_ALLOWED_ORIGINS || "").split(",").map((s) => s.trim()).filter(Boolean);
  return (req, res, next) => {
    if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
    let origin = req.headers.origin;
    if (!origin && req.headers.referer) { try { origin = new URL(req.headers.referer).origin; } catch { origin = null; } }
    const host = req.headers["x-forwarded-host"] || req.headers.host;
    const proto = String(req.headers["x-forwarded-proto"] || req.protocol || "http").split(",")[0].trim();
    const allowed = new Set([`${proto}://${host}`, ...extra]);
    if (!origin || origin === "null" || !allowed.has(origin)) {
      return res.status(403).json({ error: "cross-origin write rejected" });
    }
    next();
  };
}

/**
 * Register v2 session middleware + internal routes on an Express app.
 * Returns { enabled, reason? }. No-op unless the flag is on and a pg pool exists.
 */
export function registerAccountsV2(app, { pool, env = process.env, cleanupEveryMs = 60 * 60 * 1000, emailProvider, onMagicLinkStart, importStore, importExtractor } = {}) {
  if (!accountsV2Enabled(env)) return { enabled: false, reason: "flag-off" };
  if (!pool) {
    console.log("[accounts] PILOTLOG_ACCOUNTS_V2 is on but DATABASE_URL is not set — v2 sessions disabled in JSON-file mode");
    return { enabled: false, reason: "file-mode" };
  }
  app.use(attachSessionV2({ pool, env }));
  app.use("/api/v2", sameOriginWritesV2({ env }));

  app.get("/api/v2/session", (req, res) => {
    res.set("Cache-Control", "no-store");
    const a = req.accountV2;
    if (!a) return res.json({ authenticated: false });
    res.json({ authenticated: true, studentId: a.studentId,
      session: { createdAt: a.session.createdAt, expiresAt: a.session.expiresAt } });
  });

  app.post("/api/v2/session/revoke", async (req, res) => {
    res.set("Cache-Control", "no-store");
    const a = req.accountV2;
    if (!a) return res.status(401).json({ error: "not signed in" });
    const meta = clientMeta(req);
    try {
      let revoked;
      if (req.body?.all === true) revoked = await revokeAllSessions(pool, a.studentId, { ...meta });
      else revoked = (await revokeSession(pool, { idHash: a.session.idHash, ...meta })) ? 1 : 0;
      res.append("Set-Cookie", clearSessionCookie(env));
      res.json({ ok: true, revoked });
    } catch (err) {
      console.error(`[accounts] revoke failed: ${err.message}`);
      res.status(500).json({ error: "revoke failed" });
    }
  });

  // PR-3: email magic link. Provider misconfiguration (e.g. production without POSTMARK_SERVER_TOKEN)
  // fails closed: routes exist but /start answers 503 and nothing is sent or logged.
  let provider = emailProvider ?? null, providerError = null;
  if (!provider) {
    try { provider = selectEmailProvider(env); } catch (err) { providerError = err.message; console.error(`[accounts] ${err.message}`); }
  }
  registerEmailAuthRoutes(app, { pool, env, provider, providerError, onStart: onMagicLinkStart });
  // PR-4: passkeys (WebAuthn). RP ID / origin misconfiguration fails closed per request (503).
  registerPasskeyRoutes(app, { pool, env });
  // PR-5: Midnight wallets as identities (rework of PR #11). Legacy /wallet/connect untouched.
  registerWalletRoutes(app, { pool, env });
  // IE-4 lean v1: paper logbook import drafts (second flag). Misconfiguration disables the routes (fail closed).
  if (paperImportEnabled(env)) {
    try {
      registerPaperImportRoutes(app, { pool, env, store: importStore ?? selectImageStore(env), extractor: importExtractor ?? selectExtractor(env) });
    } catch (err) { console.error(`[import] paper import disabled: ${err.message}`); }
  }

  if (cleanupEveryMs > 0) {
    const t = setInterval(() => {
      Promise.all([cleanupSessions(pool), cleanupChallenges(pool)])
        .catch((err) => console.error(`[accounts] cleanup failed: ${err.message}`));
    }, cleanupEveryMs);
    t.unref?.();
  }
  console.log("[accounts] v2 sessions enabled (/api/v2/session)");
  return { enabled: true };
}
