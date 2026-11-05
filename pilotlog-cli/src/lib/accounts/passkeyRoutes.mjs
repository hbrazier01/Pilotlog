/**
 * passkeyRoutes.mjs — HTTP for passkey (WebAuthn) registration + sign-in (PR-4).
 * Registered by registerAccountsV2() only when PILOTLOG_ACCOUNTS_V2 is on and Postgres is configured.
 *
 *   POST   /api/v2/auth/passkey/register/options   (signed in)  → PublicKeyCredentialCreationOptionsJSON
 *   POST   /api/v2/auth/passkey/register/verify    (signed in)  {response, nickname?} → {ok, id}
 *   POST   /api/v2/auth/passkey/login/options      {email?}     → PublicKeyCredentialRequestOptionsJSON (identical shape for any email)
 *   POST   /api/v2/auth/passkey/login/verify       {response}   → sets __Host-pl_sid
 *   GET    /api/v2/auth/passkeys                   (signed in)  → {passkeys:[…]}
 *   DELETE /api/v2/auth/passkeys/:id               (signed in)  → {ok} | 409 last method
 *
 * Writes are covered by PR-2's same-origin guard on /api/v2. RP config errors fail closed (503).
 */
import { rpConfig } from "./passkeys.mjs";
import { registrationOptions, verifyRegistration, authenticationOptions, verifyAuthentication,
  listPasskeys, deletePasskey } from "./passkeys.mjs";
import { createSession, revokeSession } from "./sessions.mjs";
import { sessionCookie } from "./http.mjs";
import { clientMeta } from "./clientIp.mjs";
import { checkChallengeLimit, sendRateLimited } from "./challengeLimits.mjs";

const meta = (req, env = process.env) => clientMeta(req, env);
const SIGNIN_FAILED = "Passkey sign-in failed. Try again or use another sign-in method.";

export function registerPasskeyRoutes(app, { pool, env = process.env }) {
  const rp = (req, res) => {
    try { return rpConfig(req, env); } catch (err) {
      console.error(`[accounts] passkeys unavailable: ${err.message}`);
      res.status(503).json({ error: "passkey sign-in is temporarily unavailable" });
      return null;
    }
  };
  const authed = (req, res) => {
    if (req.accountV2) return req.accountV2.studentId;
    res.status(401).json({ error: "not signed in" }); return null;
  };
  const wrap = (fn) => async (req, res) => {
    res.set("Cache-Control", "no-store");
    try { await fn(req, res); } catch (err) {
      console.error(`[accounts] passkey route failed: ${err.message}`);
      if (!res.headersSent) res.status(500).json({ error: "passkey request failed" });
    }
  };

  app.post("/api/v2/auth/passkey/register/options", wrap(async (req, res) => {
    const studentId = authed(req, res); if (!studentId) return;
    const cfg = rp(req, res); if (!cfg) return;
    const m = meta(req, env);
    const lim = await checkChallengeLimit(pool, { purposes: ["webauthn-register"], subject: studentId, route: "passkey_register_options", env, ...m });
    if (!lim.ok) return sendRateLimited(res, lim.retryAfterSec);
    res.json(await registrationOptions(pool, { studentId, rp: cfg, ...m }));
  }));

  app.post("/api/v2/auth/passkey/register/verify", wrap(async (req, res) => {
    const studentId = authed(req, res); if (!studentId) return;
    const cfg = rp(req, res); if (!cfg) return;
    const r = await verifyRegistration(pool, { studentId, response: req.body?.response, rp: cfg,
      nickname: typeof req.body?.nickname === "string" ? req.body.nickname : null, ...meta(req, env) });
    if (!r.ok) return res.status(r.reason === "duplicate_credential" ? 409 : 400).json({ error: "passkey registration failed" });
    res.json({ ok: true, id: r.credentialId });
  }));

  app.post("/api/v2/auth/passkey/login/options", wrap(async (req, res) => {
    const cfg = rp(req, res); if (!cfg) return;
    const email = typeof req.body?.email === "string" ? req.body.email : null;
    const m = meta(req, env);
    // Per-IP only: login challenges share one subject, and the email hint must not change the response.
    const lim = await checkChallengeLimit(pool, { purposes: ["webauthn-auth"], route: "passkey_login_options", env, ...m });
    if (!lim.ok) return sendRateLimited(res, lim.retryAfterSec);
    res.json(await authenticationOptions(pool, { rp: cfg, email, ...m }));
  }));

  app.post("/api/v2/auth/passkey/login/verify", wrap(async (req, res) => {
    const cfg = rp(req, res); if (!cfg) return;
    const m = meta(req, env);
    const r = await verifyAuthentication(pool, { response: req.body?.response, rp: cfg, ...m });
    if (!r.ok) return res.status(400).json({ error: SIGNIN_FAILED });
    if (req.accountV2 && req.accountV2.studentId !== r.studentId)
      return res.status(409).json({ error: "You're already signed in to a different PilotLog account. Sign out first." });
    if (req.accountV2) await revokeSession(pool, { idHash: req.accountV2.session.idHash, reason: "rotate:signin", ...m });
    const s = await createSession(pool, { studentId: r.studentId, reason: "signin:passkey", ...m });
    res.append("Set-Cookie", sessionCookie(s.token, { expiresAt: s.expiresAt, env }));
    res.json({ ok: true, studentId: r.studentId });
  }));

  app.get("/api/v2/auth/passkeys", wrap(async (req, res) => {
    const studentId = authed(req, res); if (!studentId) return;
    res.json({ passkeys: await listPasskeys(pool, studentId) });
  }));

  app.delete("/api/v2/auth/passkeys/:id", wrap(async (req, res) => {
    const studentId = authed(req, res); if (!studentId) return;
    const r = await deletePasskey(pool, { studentId, credentialId: req.params.id, ...meta(req, env) });
    if (r.ok) return res.json({ ok: true });
    if (r.reason === "last_method")
      return res.status(409).json({ error: "This is your only way to sign in. Add and verify an email or another passkey first." });
    res.status(404).json({ error: "passkey not found" });
  }));
}
