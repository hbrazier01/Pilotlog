/**
 * legacyGuard.mjs: closes the legacy single-user write routes in readApi.mjs.
 *
 * The legacy routes (/entries*, /attestations*, /anchor/*, /verify/anchor, /profile/*, /identity/*, /wallet/*,
 * /deployment, and the flag-off /api/cockpit/* and /api/checkride/* handlers) act on a process-global wallet
 * cache or global files. They have no authentication: a wallet "connect" is a freely asserted address, and an
 * Origin header is not identity. So every one of them is CLOSED (410) with accounts v2 ON and OFF. Reads are
 * unaffected. With accounts on, per-student writes live under /api/cockpit/*, /api/checkride/* (mounted
 * earlier by registerStudentRoutes) and /api/v2/*, and are answered before this guard runs.
 *
 * Exceptions: stateless endpoints that change no server state (STATELESS_POSTS).
 */
const WRITE = new Set(["POST", "PUT", "PATCH", "DELETE"]);
export const STATELESS_POSTS = Object.freeze(new Set(["/api/cockpit/tracks/parse"]));

export function closeLegacyWrites({ accountsEnabled }) {
  const message = accountsEnabled
    ? "This legacy endpoint is disabled while accounts are on. Sign in to make changes."
    : "Saving is disabled until student accounts launch. Existing data is read-only.";
  return (req, res, next) => {
    if (!WRITE.has(req.method)) return next();
    if (req.path.startsWith("/api/v2/")) return next();
    if (req.method === "POST" && STATELESS_POSTS.has(req.path)) return next();
    res.status(410).json({ error: message, readOnly: true, ...(accountsEnabled ? { signIn: "/signin" } : {}) });
  };
}

/**
 * Defence in depth for POST /entries if it is ever re-opened: write only for the server-side wallet session;
 * a caller-supplied wallet must equal it and never selects an identity on its own.
 */
export function legacyWriteWallet(sessionWallet, bodyWallet) {
  const s = sessionWallet ? String(sessionWallet) : null;
  if (!s) return { ok: false, status: 400, error: "Wallet not connected — connect your wallet before logging a flight" };
  if (bodyWallet != null && bodyWallet !== "" && String(bodyWallet) !== s)
    return { ok: false, status: 403, error: "walletAddress does not match the connected wallet" };
  return { ok: true, wallet: s };
}
