/**
 * emailRoutes.mjs — HTTP for email magic-link sign-in (PR-3). Registered by registerAccountsV2()
 * only when PILOTLOG_ACCOUNTS_V2 is on and Postgres is configured.
 *
 *   POST /api/v2/auth/email/start  {email}   → always 202 {ok:true} for any well-formed email
 *   GET  /api/v2/auth/email/verify?token=…   → confirm page only (does NOT consume: mail scanners
 *                                              and link previews can't burn the link)
 *   POST /api/v2/auth/email/verify {token}   → consume, find/create student, set __Host-pl_sid
 *
 * POSTs are covered by the /api/v2 same-origin guard from PR-2 (Origin/Referer must match).
 */
import express from "express";
import { normalizeEmail, startMagicLink, verifyMagicLink } from "./magicLink.mjs";
import { createSession, revokeSession } from "./sessions.mjs";
import { sessionCookie } from "./http.mjs";
import { looksLikeToken } from "./crypto.mjs";

const ACCEPTED = { ok: true, message: "If that address can receive email, a sign-in link is on its way." };

function isProd(env) { return String(env.NODE_ENV || "").trim().toLowerCase() === "production"; }

/** Base URL for links. Production requires PILOTLOG_PUBLIC_URL (never trust Host for links). */
export function publicBaseUrl(req, env = process.env) {
  const configured = String(env.PILOTLOG_PUBLIC_URL || "").trim();
  if (configured) {
    const u = new URL(configured); // throws on garbage → caller returns 503
    if (isProd(env) && u.protocol !== "https:") throw new Error("PILOTLOG_PUBLIC_URL must be https in production");
    return u.origin;
  }
  if (isProd(env)) throw new Error("PILOTLOG_PUBLIC_URL is required in production");
  return `${req.protocol}://${req.headers.host}`;
}

function safeRedirectPath(env) {
  const p = String(env.PILOTLOG_POST_LOGIN_PATH || "/cockpit");
  return p.startsWith("/") && !p.startsWith("//") && !p.includes("\\") ? p : "/cockpit";
}

function page(res, status, title, bodyHtml) {
  res.status(status)
    .set("Cache-Control", "no-store")
    .set("Referrer-Policy", "no-referrer")
    .set("X-Frame-Options", "DENY")
    .set("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'")
    .type("html")
    .send(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="robots" content="noindex">` +
      `<meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title>` +
      `<style>body{font-family:system-ui,sans-serif;max-width:28rem;margin:4rem auto;padding:0 1rem;color:#0f172a}` +
      `button{font-size:1rem;padding:.6rem 1.2rem;border-radius:.5rem;border:0;background:#1d4ed8;color:#fff;cursor:pointer}</style>` +
      `</head><body>${bodyHtml}</body></html>`);
}

const INVALID = "This sign-in link is invalid, already used, or expired. Request a new one.";

export function registerEmailAuthRoutes(app, { pool, env = process.env, provider, providerError = null, onStart = null }) {
  app.post("/api/v2/auth/email/start", async (req, res) => {
    res.set("Cache-Control", "no-store");
    const email = normalizeEmail(req.body?.email);
    if (!email) return res.status(400).json({ error: "enter a valid email address" });
    if (!provider) {
      console.error(`[accounts] email sign-in unavailable: ${providerError ?? "no provider"}`);
      return res.status(503).json({ error: "email sign-in is temporarily unavailable" });
    }
    let base;
    try { base = publicBaseUrl(req, env); } catch (err) {
      console.error(`[accounts] email sign-in unavailable: ${err.message}`);
      return res.status(503).json({ error: "email sign-in is temporarily unavailable" });
    }
    try {
      const xff = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
      const r = await startMagicLink(pool, { email, ip: xff || req.socket?.remoteAddress, ua: req.headers["user-agent"],
        publicUrl: base, provider, env });
      onStart?.(r);
    } catch (err) {
      console.error(`[accounts] magic link start failed: ${err.message}`);
      return res.status(503).json({ error: "email sign-in is temporarily unavailable" });
    }
    res.status(202).json(ACCEPTED); // identical for new, existing, and rate-limited addresses
  });

  app.get("/api/v2/auth/email/verify", (req, res) => {
    const token = String(req.query.token || "");
    if (!looksLikeToken(token)) return page(res, 400, "Sign-in link", `<h1>Sign-in link</h1><p>${INVALID}</p>`);
    page(res, 200, "Confirm sign-in",
      `<h1>Sign in to PilotLog</h1><p>Press the button to finish signing in on this device.</p>` +
      `<form method="post" action="/api/v2/auth/email/verify">` +
      `<input type="hidden" name="token" value="${token}"><button type="submit">Sign in</button></form>`);
  });

  app.post("/api/v2/auth/email/verify", express.urlencoded({ extended: false, limit: "2kb" }), async (req, res) => {
    const wantsHtml = !req.is("application/json");
    const token = String(req.body?.token || "");
    const xff = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
    const meta = { ip: xff || req.socket?.remoteAddress || null, ua: req.headers["user-agent"] || null };
    let r;
    try {
      r = await verifyMagicLink(pool, { token, currentStudentId: req.accountV2?.studentId ?? null, ...meta });
    } catch (err) {
      console.error(`[accounts] magic link verify failed: ${err.message}`);
      return wantsHtml ? page(res, 500, "Sign-in", "<p>Something went wrong. Try again.</p>") : res.status(500).json({ error: "verify failed" });
    }
    if (!r.ok) {
      if (r.reason === "signed_in_as_other") {
        const msg = "You're already signed in to a different PilotLog account. Sign out first, then use a new link.";
        return wantsHtml ? page(res, 409, "Sign-in", `<p>${msg}</p>`) : res.status(409).json({ error: msg });
      }
      return wantsHtml ? page(res, 400, "Sign-in link", `<p>${INVALID}</p>`) : res.status(400).json({ error: INVALID });
    }
    // Rotate: a sign-in always gets a fresh session; any current session for the same student is revoked.
    if (req.accountV2) await revokeSession(pool, { idHash: req.accountV2.session.idHash, reason: "rotate:signin", ...meta });
    const s = await createSession(pool, { studentId: r.studentId, reason: r.created ? "signup:email" : "signin:email", ...meta });
    res.append("Set-Cookie", sessionCookie(s.token, { expiresAt: s.expiresAt, env }));
    res.set("Cache-Control", "no-store");
    if (wantsHtml) return res.redirect(303, safeRedirectPath(env));
    res.json({ ok: true, studentId: r.studentId, created: r.created });
  });
}
