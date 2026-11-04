/**
 * postmark.mjs — Postmark transactional email via plain fetch (no SDK).
 * POST https://api.postmarkapp.com/email with X-Postmark-Server-Token. The token is read by the
 * caller from env and is never logged; error messages never include the message body (magic links).
 */
export const POSTMARK_URL = "https://api.postmarkapp.com/email";

export function createPostmarkProvider({ token, from, fetchImpl = globalThis.fetch, timeoutMs = 10_000 }) {
  if (!token) throw new Error("postmark: POSTMARK_SERVER_TOKEN is not set");
  if (!from) throw new Error("postmark: from address required");
  return {
    name: "postmark",
    async send({ to, subject, text, html }) {
      const res = await fetchImpl(POSTMARK_URL, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "X-Postmark-Server-Token": token,
        },
        body: JSON.stringify({ From: from, To: to, Subject: subject, TextBody: text, HtmlBody: html, MessageStream: "outbound" }),
        signal: AbortSignal.timeout(timeoutMs),
      });
      let data = null;
      try { data = await res.json(); } catch { /* non-JSON error body */ }
      if (!res.ok || (data && data.ErrorCode && data.ErrorCode !== 0)) {
        // Only status + Postmark ErrorCode: no token, no recipient, no body.
        throw new Error(`postmark send failed: HTTP ${res.status} ErrorCode ${data?.ErrorCode ?? "n/a"}`);
      }
      return { id: data?.MessageID ?? null };
    },
  };
}
