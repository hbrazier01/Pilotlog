/** test.mjs — in-memory email provider for tests. Inspect `outbox`; set `failNext` to simulate errors. */
export function createTestProvider() {
  const p = {
    name: "test",
    outbox: [],
    failNext: false,
    async send(msg) {
      if (p.failNext) { p.failNext = false; throw new Error("test provider: simulated failure"); }
      p.outbox.push({ ...msg, at: new Date() });
      return { id: `test-${p.outbox.length}` };
    },
  };
  return p;
}
