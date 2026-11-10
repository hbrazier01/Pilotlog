/**
 * email/index.mjs — choose the email provider for accounts v2.
 *
 *   PILOTLOG_EMAIL_PROVIDER = postmark | console | test   (optional)
 *   POSTMARK_SERVER_TOKEN   = Postmark server token       (read here, never logged)
 *   PILOTLOG_EMAIL_FROM     = sender (default "PilotLog <support@digitalaviationpool.com>"). A bare
 *                             address gets the "PilotLog" display name added, so the provider's
 *                             sender-signature name (e.g. a person's name) is never shown instead.
 *
 * Rules:
 * - Not production (NODE_ENV != "production"): default console; "postmark" without a token falls
 *   back to console with a warning; "test" allowed.
 * - Production: always Postmark. A missing token, or asking for console/test, FAILS CLOSED
 *   (throws EmailConfigError) so magic links are never printed to production logs.
 */
import { createPostmarkProvider } from "./postmark.mjs";
import { createConsoleProvider } from "./console.mjs";
import { createTestProvider } from "./test.mjs";

export const DEFAULT_FROM_ADDRESS = "support@digitalaviationpool.com";
export const DEFAULT_FROM_NAME = "PilotLog";
export const DEFAULT_FROM = `${DEFAULT_FROM_NAME} <${DEFAULT_FROM_ADDRESS}>`;

/** "a@b" -> "PilotLog <a@b>"; a value that already has a display name ("Name <a@b>") is kept as is. */
export function formatFrom(value) {
  const v = String(value || "").trim();
  if (!v) return DEFAULT_FROM;
  if (/<[^<>@\s]+@[^<>\s]+>\s*$/.test(v)) return v;
  return `${DEFAULT_FROM_NAME} <${v}>`;
}

export class EmailConfigError extends Error {
  constructor(msg) { super(msg); this.name = "EmailConfigError"; }
}

export function selectEmailProvider(env = process.env, { fetchImpl, log = console.log, warn = console.warn } = {}) {
  const isProd = String(env.NODE_ENV || "").trim().toLowerCase() === "production";
  const requested = String(env.PILOTLOG_EMAIL_PROVIDER || "").trim().toLowerCase();
  const token = env.POSTMARK_SERVER_TOKEN || "";
  const from = formatFrom(env.PILOTLOG_EMAIL_FROM);

  if (requested && !["postmark", "console", "test"].includes(requested)) {
    throw new EmailConfigError(`unknown PILOTLOG_EMAIL_PROVIDER "${requested}" (use postmark, console, or test)`);
  }
  if (isProd) {
    if (requested === "console" || requested === "test") {
      throw new EmailConfigError(`PILOTLOG_EMAIL_PROVIDER=${requested} is not allowed in production`);
    }
    if (!token) throw new EmailConfigError("NODE_ENV=production but POSTMARK_SERVER_TOKEN is not set; email sign-in disabled");
    return createPostmarkProvider({ token, from, fetchImpl });
  }
  if (requested === "test") return createTestProvider();
  if (requested === "postmark") {
    if (token) return createPostmarkProvider({ token, from, fetchImpl });
    warn("[email] PILOTLOG_EMAIL_PROVIDER=postmark but POSTMARK_SERVER_TOKEN is not set; using console (dev only)");
  }
  return createConsoleProvider({ log });
}
