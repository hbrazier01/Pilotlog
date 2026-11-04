/**
 * service.mjs — paper logbook import drafts (IE-4 lean v1).
 * Flow: createBatch → addPage(image) → extractPage (manual/fixture) → updateRow (student edits) → confirmPage.
 * Everything is scoped to the signed-in student; another student's ids behave as not found.
 * Confirmed rows become flights with source='paper_import', imported_by_student_verified=true,
 * verification_status='student_imported' and import_page_id — never 'cfi_signed'.
 */
import { randomBytes, createHash } from "node:crypto";
import { FIELDS, NUMERIC } from "./extractors.mjs";
import { redactCells } from "./redact.mjs";
import { validatePage } from "./validate.mjs";
import { PAGE_TYPES } from "./schema.mjs";

const rid = (p) => `${p}_${randomBytes(12).toString("hex")}`;
export const IMAGE_TYPES = Object.freeze(["image/jpeg", "image/png", "image/heic", "image/webp"]);
const MAGIC = { "image/jpeg": [0xff, 0xd8, 0xff], "image/png": [0x89, 0x50, 0x4e, 0x47] };
export class ImportError extends Error { constructor(status, msg) { super(msg); this.status = status; } }

function normCells(cells) {
  const out = {};
  for (const f of FIELDS) {
    const c = cells?.[f] || {};
    let v = c.v === undefined || c.v === "" ? null : c.v;
    if (v !== null && NUMERIC.includes(f) && typeof v === "string" && /^\s*\d+(\.\d+)?\s*$/.test(v)) v = Number(v);
    out[f] = { v, c: ["high", "med", "low"].includes(c.c) ? c.c : "low", ...(c.reason ? { reason: String(c.reason).slice(0, 200) } : {}),
      ...(c.reviewed ? { reviewed: true } : {}), ...(c.edited ? { edited: true } : {}) };
  }
  return out;
}

export async function createBatch(db, { studentId, extractor }) {
  const id = rid("ib");
  await db.query(`INSERT INTO import_batches (id, student_id, extractor) VALUES ($1, $2, $3)`, [id, studentId, extractor.name]);
  return { id, status: "draft", extractor: extractor.name };
}

async function ownBatch(db, studentId, batchId) {
  const { rows } = await db.query(`SELECT * FROM import_batches WHERE id = $1 AND student_id = $2`, [batchId, studentId]);
  if (!rows.length) throw new ImportError(404, "import batch not found");
  return rows[0];
}
async function ownPage(db, studentId, pageId) {
  const { rows } = await db.query(`SELECT * FROM import_pages WHERE id = $1 AND student_id = $2`, [pageId, studentId]);
  if (!rows.length) throw new ImportError(404, "page not found");
  return rows[0];
}

export async function addPage(db, { studentId, batchId, image, contentType, pageType, spreadIndex = null, rotation = 0, store }) {
  const b = await ownBatch(db, studentId, batchId);
  if (b.status !== "draft") throw new ImportError(409, "batch is not a draft");
  if (!PAGE_TYPES.includes(pageType)) throw new ImportError(400, "unknown page type");
  if (!IMAGE_TYPES.includes(contentType)) throw new ImportError(415, "upload a JPEG, PNG, HEIC, or WebP photo");
  if (!Buffer.isBuffer(image) || image.length < 16) throw new ImportError(400, "empty image");
  const magic = MAGIC[contentType];
  if (magic && !magic.every((x, i) => image[i] === x)) throw new ImportError(415, "file does not look like the declared image type");
  if (![0, 90, 180, 270].includes(Number(rotation))) throw new ImportError(400, "rotation must be 0, 90, 180, or 270");
  const sha = createHash("sha256").update(image).digest("hex");
  const key = await store.put(image, { contentType });
  const id = rid("ip");
  try {
    await db.query(`INSERT INTO import_pages (id, batch_id, student_id, page_type, spread_index, image_key, image_sha256, content_type, rotation_deg)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`, [id, batchId, studentId, pageType, spreadIndex, key, sha, contentType, Number(rotation)]);
  } catch (err) { await store.delete(key).catch(() => {}); throw err; }
  return { id, pageType, status: "draft" };
}

export async function extractPage(db, { studentId, pageId, extractor, store }) {
  const page = await ownPage(db, studentId, pageId);
  if (page.status === "confirmed") throw new ImportError(409, "page already confirmed");
  const image = await store.get(page.image_key);
  const out = await extractor.extract({ page, image });
  const client = await db.connect();
  let redactions = 0;
  try {
    await client.query("BEGIN");
    await client.query(`DELETE FROM import_rows WHERE page_id = $1`, [pageId]);
    for (const r of out.rows || []) {
      const red = redactCells(normCells(r.cells));
      redactions += red.redactions;
      await client.query(`INSERT INTO import_rows (page_id, row_index, cells) VALUES ($1,$2,$3)`, [pageId, r.row_index, JSON.stringify({ ...red.cells, _meta: { cfi_signed: r.cfi_signed ?? null } })]);
    }
    if (out.footer) await client.query(`UPDATE import_pages SET footer = $2 WHERE id = $1`, [pageId, JSON.stringify(out.footer)]);
    await client.query(`UPDATE import_pages SET status = 'extracted' WHERE id = $1`, [pageId]);
    await client.query("COMMIT");
  } catch (err) { await client.query("ROLLBACK").catch(() => {}); throw err; } finally { client.release(); }
  return { rows: (out.rows || []).length, redactions };
}

function rowsOut(rows) {
  return rows.map((r) => { const { _meta, ...cells } = r.cells; return { row_index: r.row_index, cells, cfi_signed: _meta?.cfi_signed ?? null, flight_id: r.flight_id }; });
}

export async function getPage(db, { studentId, pageId }) {
  const page = await ownPage(db, studentId, pageId);
  const { rows } = await db.query(`SELECT * FROM import_rows WHERE page_id = $1 ORDER BY row_index`, [pageId]);
  const out = rowsOut(rows);
  return { id: page.id, batchId: page.batch_id, pageType: page.page_type, spreadIndex: page.spread_index, status: page.status,
    rotation: page.rotation_deg, footer: page.footer, rows: out, validation: validatePage(out, page.footer) };
}

/** Student edit. `cells` is a partial {field: {v?, reviewed?}}; edited values become high + reviewed. */
export async function updateRow(db, { studentId, pageId, rowIndex, cells, cfiSigned }) {
  const page = await ownPage(db, studentId, pageId);
  if (page.status === "confirmed") throw new ImportError(409, "page already confirmed");
  const { rows } = await db.query(`SELECT cells FROM import_rows WHERE page_id = $1 AND row_index = $2`, [pageId, rowIndex]);
  const cur = rows[0]?.cells || { _meta: {} };
  const next = { ...cur };
  for (const [f, patch] of Object.entries(cells || {})) {
    if (!FIELDS.includes(f)) throw new ImportError(400, `unknown field ${f}`);
    const c = { ...(cur[f] || { v: null, c: "low" }) };
    if (Object.hasOwn(patch, "v")) { c.v = patch.v === "" ? null : patch.v; c.c = "high"; c.edited = true; c.reviewed = true; delete c.reason; }
    if (patch.reviewed === true) c.reviewed = true;
    next[f] = c;
  }
  const { _meta, ...plain } = next;
  const red = redactCells(normCells(plain));
  const meta = { ..._meta, ...(typeof cfiSigned === "boolean" ? { cfi_signed: cfiSigned } : {}) };
  await db.query(`INSERT INTO import_rows (page_id, row_index, cells) VALUES ($1,$2,$3)
    ON CONFLICT (page_id, row_index) DO UPDATE SET cells = EXCLUDED.cells, updated_at = now()`,
    [pageId, rowIndex, JSON.stringify({ ...red.cells, _meta: meta })]);
  return { ok: true, redactions: red.redactions };
}

export async function setFooter(db, { studentId, pageId, footer }) {
  await ownPage(db, studentId, pageId);
  const clean = {};
  for (const k of ["this_page", "forwarded", "to_date"]) {
    if (!footer?.[k]) continue;
    clean[k] = {};
    for (const f of NUMERIC) if (footer[k][f] !== undefined && footer[k][f] !== null && footer[k][f] !== "") clean[k][f] = Number(footer[k][f]);
  }
  await db.query(`UPDATE import_pages SET footer = $2 WHERE id = $1`, [pageId, JSON.stringify(clean)]);
  return { ok: true };
}

const blank = (cells) => Object.values(cells).every((c) => c?.v === null || c?.v === undefined);

/** Confirm one page: blocks on validation errors; writes one flight per non-blank row, atomically. */
export async function confirmPage(db, { studentId, pageId }) {
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const p = await client.query(`SELECT * FROM import_pages WHERE id = $1 AND student_id = $2 FOR UPDATE`, [pageId, studentId]);
    if (!p.rows.length) throw new ImportError(404, "page not found");
    const page = p.rows[0];
    if (page.status === "confirmed") throw new ImportError(409, "page already confirmed");
    if (!["flight_full", "flight_left"].includes(page.page_type)) throw new ImportError(400, "only flight pages (full, or the left half that owns the row) create flights in v1");
    const { rows } = await client.query(`SELECT * FROM import_rows WHERE page_id = $1 ORDER BY row_index`, [pageId]);
    const out = rowsOut(rows);
    const v = validatePage(out, page.footer);
    if (v.blocking) { await client.query("ROLLBACK"); return { ok: false, validation: v }; }
    const flights = [];
    for (const r of out) {
      if (blank(r.cells)) continue;
      const g = (f) => r.cells[f]?.v ?? null;
      const id = rid("pf");
      const entry = { source: "paper_import", importPageId: pageId, rowIndex: r.row_index, cells: r.cells, cfiSignedOnPaper: r.cfi_signed,
        dual: g("dual"), sim: g("sim"), sel: g("sel"), instrument: g("instrument"), takeoffs: g("takeoffs"), aircraftType: g("aircraft_type") };
      await client.query(
        `INSERT INTO flights (id, wallet_address, student_id, aircraft_ident, date, total_time, pic_time, xc_time, night_time,
           landings_day, route_from, route_to, remarks, verification_status, entry_json, source, imported_by_student_verified, import_page_id)
         VALUES ($1, NULL, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'student_imported', $13, 'paper_import', true, $14)`,
        [id, studentId, g("aircraft_ident"), g("date"), g("total"), g("pic") ?? 0, g("xc") ?? 0, g("night") ?? 0, g("landings") ?? 0,
          g("from"), g("to"), g("remarks"), JSON.stringify(entry), pageId]);
      await client.query(`UPDATE import_rows SET flight_id = $3 WHERE page_id = $1 AND row_index = $2`, [pageId, r.row_index, id]);
      flights.push(id);
    }
    await client.query(`UPDATE import_pages SET status = 'confirmed', confirmed_at = now() WHERE id = $1`, [pageId]);
    await client.query("COMMIT");
    return { ok: true, flights, validation: v };
  } catch (err) { await client.query("ROLLBACK").catch(() => {}); throw err; } finally { client.release(); }
}
