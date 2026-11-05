/**
 * studentStore.mjs — per-student documents + AI-coach usage ledger (ported from PR #11 feature/student-accounts).
 * Accounts v2 only: Postgres `student_docs` / `student_usage` (schemaV2 accounts_v2_003). v2 requires Postgres,
 * so PR #11's JSON-file backend is not ported. Every call takes an explicit, validated studentId: there is
 * no "current student" global, so a caller can only ever touch the student it names.
 */
import { isValidStudentId } from "./ids.mjs";

export const DOC_KINDS = Object.freeze(["settings", "checkride", "tracks", "entries", "radio", "meta"]);
const MAX_DOC_BYTES = 8 * 1024 * 1024;
export const monthKey = (d = new Date()) => d.toISOString().slice(0, 7);
const assertId = (id) => { if (!isValidStudentId(id)) throw new Error("invalid student id"); };
const assertKind = (k) => { if (!DOC_KINDS.includes(k)) throw new Error("unknown doc kind"); };

export function coachCapUsd(env = process.env) {
  const v = Number(env.COACH_MONTHLY_CAP_USD);
  return Number.isFinite(v) && v >= 0 ? v : 1;
}

export function createStudentStore({ pool, env = process.env }) {
  if (!pool) throw new Error("student store requires Postgres (accounts v2)");
  return {
    backend: "pg",
    async get(id, kind) {
      assertId(id); assertKind(kind);
      const { rows } = await pool.query("SELECT doc FROM student_docs WHERE student_id = $1 AND kind = $2", [id, kind]);
      return rows.length ? rows[0].doc : null;
    },
    async put(id, kind, doc) {
      assertId(id); assertKind(kind);
      if (doc === undefined) throw new Error("doc required");
      const json = JSON.stringify(doc);
      if (Buffer.byteLength(json) > MAX_DOC_BYTES) throw new Error("document too large");
      await pool.query(
        `INSERT INTO student_docs (student_id, kind, doc) VALUES ($1, $2, $3)
         ON CONFLICT (student_id, kind) DO UPDATE SET doc = EXCLUDED.doc, updated_at = now()`, [id, kind, json]);
    },
    /** Insert only if absent (legacy migration). Returns true if written. */
    async putIfAbsent(id, kind, doc) {
      assertId(id); assertKind(kind);
      const r = await pool.query(`INSERT INTO student_docs (student_id, kind, doc) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
        [id, kind, JSON.stringify(doc)]);
      return r.rowCount === 1;
    },
    /** Usage ledger for the AI coach cap. Server-side only — there is no public write route. */
    async recordUsage(id, { inputTokens = 0, outputTokens = 0, usd = 0 } = {}, when = new Date()) {
      assertId(id);
      const d = { i: Math.round(Number(inputTokens)), o: Math.round(Number(outputTokens)), u: Math.round(Number(usd) * 1e6) };
      for (const [k, v] of Object.entries(d)) if (!Number.isFinite(v) || v < 0 || v > 1e12) throw new Error(`usage ${k} invalid`);
      const { rows } = await pool.query(
        `INSERT INTO student_usage (student_id, month, input_tokens, output_tokens, usd_micros, requests) VALUES ($1,$2,$3,$4,$5,1)
         ON CONFLICT (student_id, month) DO UPDATE SET input_tokens = student_usage.input_tokens + EXCLUDED.input_tokens,
           output_tokens = student_usage.output_tokens + EXCLUDED.output_tokens, usd_micros = student_usage.usd_micros + EXCLUDED.usd_micros,
           requests = student_usage.requests + 1, updated_at = now()
         RETURNING input_tokens, output_tokens, usd_micros, requests`, [id, monthKey(when), d.i, d.o, d.u]);
      return rows[0];
    },
    async usage(id, { month = monthKey(), capUsd = coachCapUsd(env) } = {}) {
      assertId(id);
      const { rows } = await pool.query(
        "SELECT input_tokens, output_tokens, usd_micros, requests FROM student_usage WHERE student_id = $1 AND month = $2", [id, month]);
      const r = rows[0] || { input_tokens: 0, output_tokens: 0, usd_micros: 0, requests: 0 };
      const usd = Number(r.usd_micros) / 1e6;
      return { month, inputTokens: Number(r.input_tokens), outputTokens: Number(r.output_tokens), usdMicros: Number(r.usd_micros),
        requests: Number(r.requests), usd, capUsd, remainingUsd: Math.max(0, capUsd - usd), overCap: usd >= capUsd };
    },
  };
}
