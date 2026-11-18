// Staging persistence: the whole app state as ONE JSONB row in the staging Postgres (DATABASE_URL), so a sleep/wake
// or redeploy no longer forgets CFIs, credentials, entries, jobs or caps. Debounced write-through (<= 300 ms after a
// change) plus a final flush on SIGTERM. Synthetic data only; staging only.
//   DATABASE_URL  -> Postgres table cfi_passkey_staging_state (created if missing)
//   CFI_STATE_FILE -> JSON file (tests)
//   neither       -> memory only (lost on restart)
import { readFileSync, writeFileSync, renameSync, existsSync } from 'node:fs';

const ROW = 'state-v1';
export async function openStore({ databaseUrl = process.env.DATABASE_URL, file = process.env.CFI_STATE_FILE, log = console.log } = {}) {
  let backend;
  if (databaseUrl) {
    const { default: pg } = await import('pg');
    const pool = new pg.Pool({ connectionString: databaseUrl, max: 2, idleTimeoutMillis: 30_000, connectionTimeoutMillis: 10_000,
      ssl: /sslmode=require/.test(databaseUrl) ? { rejectUnauthorized: false } : undefined });
    pool.on('error', (e) => console.error('pg pool error', e.message));
    let ready = false;
    const ensure = async () => { if (!ready) { await pool.query('CREATE TABLE IF NOT EXISTS cfi_passkey_staging_state (id text PRIMARY KEY, data jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now())'); ready = true; } };
    backend = {
      kind: 'postgres',
      async load() { await ensure(); const r = await pool.query('SELECT data FROM cfi_passkey_staging_state WHERE id = $1', [ROW]); return r.rows[0]?.data ?? null; },
      async save(json) { await ensure(); await pool.query('INSERT INTO cfi_passkey_staging_state (id, data, updated_at) VALUES ($1, $2::jsonb, now()) ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()', [ROW, json]); },
      close: () => pool.end(),
    };
  } else if (file) {
    backend = {
      kind: 'file',
      async load() { return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : null; },
      async save(json) { writeFileSync(file + '.tmp', json); renameSync(file + '.tmp', file); },
      close: async () => {},
    };
  } else {
    backend = { kind: 'memory', load: async () => null, save: async () => {}, close: async () => {} };
  }
  let snapshot = () => null, last = '', timer = null, saving = Promise.resolve(), lastError = null, savedAt = null;
  const flush = () => {
    clearTimeout(timer); timer = null;
    const json = JSON.stringify(snapshot());
    if (json === last) return saving;
    saving = saving.then(async () => {
      try { await backend.save(json); last = json; lastError = null; savedAt = new Date().toISOString(); } catch (e) { lastError = e.message; console.error('state save failed', e.message); }
    });
    return saving;
  };
  return {
    kind: backend.kind,
    load: () => backend.load(),
    track(fn, initial) { snapshot = fn; last = initial ? JSON.stringify(initial) : ''; },
    changed() { if (!timer && backend.kind !== 'memory') timer = setTimeout(flush, 300); },
    flush,
    status: () => ({ kind: backend.kind, savedAt, lastError }),
    async close() { await flush(); await backend.close(); },
  };
}
