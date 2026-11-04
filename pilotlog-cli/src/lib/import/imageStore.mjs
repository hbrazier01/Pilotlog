/**
 * imageStore.mjs — pluggable store for page images. v1 ships a local-disk store only.
 * Interface: { name, put(buffer, {contentType}) → key, get(key) → Buffer|null, delete(key) }.
 * Keys are random (never derived from content or student), files are 0600 under a 0700 dir.
 * An object-store implementation (private bucket, SSE) can be added behind the same interface.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { randomBytes } from "node:crypto";

const KEY_RE = /^img_[0-9a-f]{32}$/;

export function createLocalImageStore({ dir }) {
  if (!dir) throw new Error("local image store needs a directory");
  const file = (key) => { if (!KEY_RE.test(key)) throw new Error("invalid image key"); return path.join(dir, key); };
  return {
    name: "local",
    async put(buf) {
      await fs.mkdir(dir, { recursive: true, mode: 0o700 });
      const key = `img_${randomBytes(16).toString("hex")}`;
      await fs.writeFile(file(key), buf, { mode: 0o600, flag: "wx" });
      return key;
    },
    async get(key) { try { return await fs.readFile(file(key)); } catch (e) { if (e.code === "ENOENT") return null; throw e; } },
    async delete(key) { await fs.rm(file(key), { force: true }); },
  };
}

export function createMemoryImageStore() {
  const m = new Map();
  return { name: "memory", async put(buf) { const k = `img_${randomBytes(16).toString("hex")}`; m.set(k, Buffer.from(buf)); return k; },
    async get(k) { return m.get(k) ?? null; }, async delete(k) { m.delete(k); }, _map: m };
}

export function selectImageStore(env = process.env) {
  const kind = String(env.PILOTLOG_IMPORT_STORE || "local").trim();
  if (kind === "local") return createLocalImageStore({ dir: env.PILOTLOG_IMPORT_DIR || path.resolve("data/import-images") });
  throw new Error(`unknown PILOTLOG_IMPORT_STORE ${kind}`);
}
