/**
 * Per-student document store.
 *   Postgres (DATABASE_URL): students / student_docs / student_usage (see db.mjs migrate()).
 *   JSON fallback:            <DATA_DIR>/students/<studentId>/<kind>.json  (+ usage.json)
 * Every call takes an explicit studentId (validated); there is no "current student" global.
 */
import fs from 'node:fs';
import path from 'node:path';
import { isValidStudentId } from './identity.mjs';

export const DOC_KINDS = Object.freeze(['settings', 'checkride', 'tracks', 'entries', 'radio', 'meta']);
const MAX_DOC_BYTES = 8 * 1024 * 1024;

function assertId(id) { if (!isValidStudentId(id)) throw new Error('invalid student id'); }
function assertKind(k) { if (!DOC_KINDS.includes(k)) throw new Error('unknown doc kind'); }
export const monthKey = (d = new Date()) => d.toISOString().slice(0, 7);

function fileBackend(dataDir) {
  const root = path.join(dataDir, 'students');
  const dir = (id) => { assertId(id); return path.join(root, id); };
  const readJson = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };
  const writeJson = (f, v) => {
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f + '.tmp', JSON.stringify(v, null, 2));
    fs.renameSync(f + '.tmp', f);
  };
  return {
    kind: 'file',
    root,
    async ensureStudent(id, { walletAddress, provider }) {
      const f = path.join(dir(id), 'student.json');
      const cur = readJson(f);
      const now = new Date().toISOString();
      writeJson(f, { id, walletAddress, provider, createdAt: cur?.createdAt || now, lastSeenAt: now });
    },
    async get(id, kind) { return readJson(path.join(dir(id), `${kind}.json`)); },
    async put(id, kind, doc) { writeJson(path.join(dir(id), `${kind}.json`), doc); },
    async getUsage(id, month) {
      const all = readJson(path.join(dir(id), 'usage.json')) || {};
      return all[month] || null;
    },
    async addUsage(id, month, d) {
      const f = path.join(dir(id), 'usage.json');
      const all = readJson(f) || {};
      const c = all[month] || { inputTokens: 0, outputTokens: 0, usdMicros: 0, requests: 0 };
      all[month] = { inputTokens: c.inputTokens + d.inputTokens, outputTokens: c.outputTokens + d.outputTokens, usdMicros: c.usdMicros + d.usdMicros, requests: c.requests + 1 };
      writeJson(f, all);
      return all[month];
    },
  };
}

function pgBackend(pool) {
  return {
    kind: 'pg',
    async ensureStudent(id, { walletAddress, provider }) {
      await pool.query(
        `INSERT INTO students (id, wallet_address, provider) VALUES ($1, $2, $3)
         ON CONFLICT (id) DO UPDATE SET last_seen_at = NOW()`, [id, walletAddress, provider]);
    },
    async get(id, kind) {
      const { rows } = await pool.query('SELECT doc FROM student_docs WHERE student_id = $1 AND kind = $2', [id, kind]);
      return rows.length ? rows[0].doc : null;
    },
    async put(id, kind, doc) {
      await pool.query(
        `INSERT INTO student_docs (student_id, kind, doc) VALUES ($1, $2, $3)
         ON CONFLICT (student_id, kind) DO UPDATE SET doc = EXCLUDED.doc, updated_at = NOW()`, [id, kind, JSON.stringify(doc)]);
    },
    async getUsage(id, month) {
      const { rows } = await pool.query('SELECT input_tokens, output_tokens, usd_micros, requests FROM student_usage WHERE student_id = $1 AND month = $2', [id, month]);
      if (!rows.length) return null;
      const r = rows[0];
      return { inputTokens: Number(r.input_tokens), outputTokens: Number(r.output_tokens), usdMicros: Number(r.usd_micros), requests: Number(r.requests) };
    },
    async addUsage(id, month, d) {
      const { rows } = await pool.query(
        `INSERT INTO student_usage (student_id, month, input_tokens, output_tokens, usd_micros, requests) VALUES ($1, $2, $3, $4, $5, 1)
         ON CONFLICT (student_id, month) DO UPDATE SET
           input_tokens = student_usage.input_tokens + EXCLUDED.input_tokens,
           output_tokens = student_usage.output_tokens + EXCLUDED.output_tokens,
           usd_micros = student_usage.usd_micros + EXCLUDED.usd_micros,
           requests = student_usage.requests + 1, updated_at = NOW()
         RETURNING input_tokens, output_tokens, usd_micros, requests`, [id, month, d.inputTokens, d.outputTokens, d.usdMicros]);
      const r = rows[0];
      return { inputTokens: Number(r.input_tokens), outputTokens: Number(r.output_tokens), usdMicros: Number(r.usd_micros), requests: Number(r.requests) };
    },
  };
}

export const DEFAULT_MONTHLY_CAP_USD = Number(process.env.COACH_MONTHLY_CAP_USD || 1);

export function createStudentStore({ dataDir, pool = null } = {}) {
  const b = pool ? pgBackend(pool) : fileBackend(dataDir);
  return {
    backend: b.kind,
    async ensureStudent(id, info) { assertId(id); return b.ensureStudent(id, info); },
    async get(id, kind) { assertId(id); assertKind(kind); return b.get(id, kind); },
    async put(id, kind, doc) {
      assertId(id); assertKind(kind);
      if (doc === undefined) throw new Error('doc required');
      if (Buffer.byteLength(JSON.stringify(doc)) > MAX_DOC_BYTES) throw new Error('document too large');
      return b.put(id, kind, doc);
    },
    /** Usage ledger for the future AI coach cap. Server-side only — no public write route. */
    async recordUsage(id, { inputTokens = 0, outputTokens = 0, usd = 0 } = {}, when = new Date()) {
      assertId(id);
      const d = { inputTokens: Math.round(Number(inputTokens)), outputTokens: Math.round(Number(outputTokens)), usdMicros: Math.round(Number(usd) * 1e6) };
      for (const [k, v] of Object.entries(d)) if (!Number.isFinite(v) || v < 0 || v > 1e12) throw new Error(`${k} invalid`);
      return b.addUsage(id, monthKey(when), d);
    },
    async usage(id, { month = monthKey(), capUsd = DEFAULT_MONTHLY_CAP_USD } = {}) {
      assertId(id);
      const u = (await b.getUsage(id, month)) || { inputTokens: 0, outputTokens: 0, usdMicros: 0, requests: 0 };
      const usd = u.usdMicros / 1e6;
      return { month, ...u, usd, capUsd, remainingUsd: Math.max(0, capUsd - usd), overCap: usd >= capUsd };
    },
  };
}
