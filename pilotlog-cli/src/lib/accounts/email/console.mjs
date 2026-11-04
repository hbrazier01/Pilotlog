/**
 * console.mjs — dev-only email provider: prints the message (including the magic link) to stdout.
 * Never selected when NODE_ENV=production (see index.mjs).
 */
export function createConsoleProvider({ log = console.log } = {}) {
  return {
    name: "console",
    async send({ to, subject, text }) {
      log(`[email:console] to=${to} subject=${JSON.stringify(subject)}\n${text}`);
      return { id: null };
    },
  };
}
