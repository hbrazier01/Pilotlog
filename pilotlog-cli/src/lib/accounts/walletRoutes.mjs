/**
 * walletRoutes.mjs — /api/v2/auth/wallet/* (PR-5). Registered only with PILOTLOG_ACCOUNTS_V2 on + Postgres.
 *   POST /api/v2/auth/wallet/challenge    {address, intent:'login'|'link', provider?} → {nonce, message, …}
 *   POST /api/v2/auth/wallet/verify-login {address, nonce, signature}  → session (__Host-pl_sid); unknown wallet → new student
 *   POST /api/v2/auth/wallet/link         {address, nonce, signature}  (signed in) → {ok} | 409 linked to another student
 * Legacy /wallet/connect and PR #11's /api/auth/* are untouched (cut over in PR-13). Writes use the PR-2 same-origin guard.
 */
import { issueWalletChallenge, walletLogin, walletLink } from "./walletIdentity.mjs";
import { createSession, revokeSession } from "./sessions.mjs";
import { sessionCookie } from "./http.mjs";

const meta = (req) => {
  const xff = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  return { ip: xff || req.socket?.remoteAddress || null, ua: req.headers["user-agent"] || null };
};
const str = (v) => (typeof v === "string" ? v.trim() : "");
function domainOf(req, env) {
  try { if (env.PILOTLOG_PUBLIC_URL) return new URL(env.PILOTLOG_PUBLIC_URL).host; } catch { /* fall through */ }
  return String(req.headers.host || "pilotlog").slice(0, 100);
}

export function registerWalletRoutes(app, { pool, env = process.env }) {
  const wrap = (fn) => async (req, res) => {
    res.set("Cache-Control", "no-store");
    try { await fn(req, res); } catch (err) {
      console.error(`[accounts] wallet route failed: ${err.message}`);
      if (!res.headersSent) res.status(500).json({ error: "wallet request failed" });
    }
  };

  app.post("/api/v2/auth/wallet/challenge", wrap(async (req, res) => {
    const intent = str(req.body?.intent) || "login";
    if (intent === "link" && !req.accountV2) return res.status(401).json({ error: "not signed in" });
    try {
      res.json(await issueWalletChallenge(pool, { address: str(req.body?.address), intent,
        provider: req.body?.provider, studentId: req.accountV2?.studentId ?? null, domain: domainOf(req, env), env, ...meta(req) }));
    } catch (err) { res.status(400).json({ error: err.message }); }
  }));

  app.post("/api/v2/auth/wallet/verify-login", wrap(async (req, res) => {
    const m = meta(req);
    const r = await walletLogin(pool, { address: str(req.body?.address), nonce: str(req.body?.nonce), signature: req.body?.signature, env, ...m });
    if (!r.ok) return res.status(401).json({ error: "Wallet sign-in failed. Request a new challenge and sign again." });
    if (req.accountV2 && req.accountV2.studentId !== r.studentId)
      return res.status(409).json({ error: "You're already signed in to a different PilotLog account. Sign out first." });
    if (req.accountV2) await revokeSession(pool, { idHash: req.accountV2.session.idHash, reason: "rotate:signin", ...m });
    const s = await createSession(pool, { studentId: r.studentId, reason: r.created ? "signup:wallet" : "signin:wallet", ...m });
    res.append("Set-Cookie", sessionCookie(s.token, { expiresAt: s.expiresAt, env }));
    res.json({ ok: true, studentId: r.studentId, created: r.created, claimed: r.claimed });
  }));

  app.post("/api/v2/auth/wallet/link", wrap(async (req, res) => {
    if (!req.accountV2) return res.status(401).json({ error: "not signed in" });
    const r = await walletLink(pool, { studentId: req.accountV2.studentId, address: str(req.body?.address),
      nonce: str(req.body?.nonce), signature: req.body?.signature, env, ...meta(req) });
    if (r.ok) return res.json({ ok: true, alreadyLinked: r.alreadyLinked, claimed: r.claimed });
    if (r.reason === "conflict")
      return res.status(409).json({ error: "This wallet is already linked to another PilotLog account. Merging accounts isn't available yet." });
    res.status(401).json({ error: "Wallet link failed. Request a new challenge and sign again." });
  }));
}
