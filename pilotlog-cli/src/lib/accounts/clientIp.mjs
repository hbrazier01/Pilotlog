/**
 * clientIp.mjs — client IP for v2 rate limits and audit, without trusting client-supplied X-Forwarded-For.
 *
 * PILOTLOG_TRUSTED_PROXY_HOPS (default 1): how many proxies in front of us append to X-Forwarded-For.
 * The client IP is the entry `hops` positions from the RIGHT (the one our nearest trusted proxy saw).
 * Anything to its left was supplied by the client and is ignored. hops=0 → ignore XFF entirely.
 * If XFF has fewer entries than `hops`, or the chosen entry isn't a valid IP, fall back to the socket peer.
 *
 * Railway: its edge *overwrites* X-Forwarded-For and X-Real-IP (Railway staff on Central Station; the public
 * Specs & Limits page documents X-Real-IP as the client IP). With hops=1 that yields the edge-set entry.
 * PILOTLOG_CLIENT_IP_HEADER=x-real-ip opts into reading that header instead (only safe when every path to the
 * listener goes through the edge: no private-network callers, no TCP proxy).
 */
import { isIP } from "node:net";

function normalize(raw) {
  let s = String(raw ?? "").trim();
  if (!s) return null;
  if (s.startsWith("[")) { const e = s.indexOf("]"); s = e > 0 ? s.slice(1, e) : s; }        // [v6]:port
  else if (/^\d{1,3}(\.\d{1,3}){3}:\d+$/.test(s)) s = s.slice(0, s.lastIndexOf(":"));      // v4:port
  if (s.toLowerCase().startsWith("::ffff:") && isIP(s.slice(7)) === 4) s = s.slice(7);
  return isIP(s) ? s.toLowerCase() : null;
}

export function trustedHops(env = process.env) {
  const n = Number.parseInt(String(env.PILOTLOG_TRUSTED_PROXY_HOPS ?? "1").trim(), 10);
  return Number.isInteger(n) && n >= 0 && n <= 10 ? n : 1;
}

export function clientIp(req, env = process.env) {
  const socketIp = normalize(req.socket?.remoteAddress) ?? null;
  const header = String(env.PILOTLOG_CLIENT_IP_HEADER || "").trim().toLowerCase();
  if (header === "x-real-ip") return normalize(req.headers?.["x-real-ip"]) ?? socketIp;
  const hops = trustedHops(env);
  if (hops === 0) return socketIp;
  const raw = req.headers?.["x-forwarded-for"];
  const list = (Array.isArray(raw) ? raw.join(",") : String(raw ?? "")).split(",").map((s) => s.trim()).filter(Boolean);
  if (list.length < hops) return socketIp;
  return normalize(list[list.length - hops]) ?? socketIp;
}

/** { ip, ua } for audit and rate limits. */
export function clientMeta(req, env = process.env) {
  return { ip: clientIp(req, env), ua: req.headers?.["user-agent"] || null };
}
