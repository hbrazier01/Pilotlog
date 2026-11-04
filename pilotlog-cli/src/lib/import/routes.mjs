/**
 * routes.mjs — /api/v2/import/* (IE-4 lean v1). Registered only when PILOTLOG_ACCOUNTS_V2 and
 * PILOTLOG_PAPER_IMPORT are on and Postgres is configured; every route needs a v2 session.
 * Writes are covered by the PR-2 /api/v2 same-origin guard.
 *
 *   POST  /api/v2/import/batches                                  → {id}
 *   POST  /api/v2/import/batches/:id/pages?page_type=&spread=&rotation=   (raw image body, ≤ 12 MB)
 *   POST  /api/v2/import/pages/:id/extract                        → runs the configured extractor (manual|fixture)
 *   GET   /api/v2/import/pages/:id                                → rows + per-cell confidence + validation
 *   GET   /api/v2/import/pages/:id/image                          → the student's own image (no-store)
 *   PATCH /api/v2/import/pages/:id/rows/:row   {cells, cfiSigned?}
 *   PUT   /api/v2/import/pages/:id/footer      {this_page, forwarded, to_date}
 *   POST  /api/v2/import/pages/:id/confirm                        → flights (source=paper_import) or 422 + issues
 *   GET   /import                                                 → capture/review stub page
 */
import express from "express";
import { createBatch, addPage, extractPage, getPage, updateRow, setFooter, confirmPage, ImportError } from "./service.mjs";

export function paperImportEnabled(env = process.env) {
  const v = String(env.PILOTLOG_PAPER_IMPORT ?? "").trim().toLowerCase();
  return v === "true" || v === "1";
}

export function registerPaperImportRoutes(app, { pool, env = process.env, store, extractor }) {
  const wrap = (fn) => async (req, res) => {
    res.set("Cache-Control", "no-store");
    if (!req.accountV2) return res.status(401).json({ error: "not signed in" });
    try { await fn(req, res, req.accountV2.studentId); } catch (err) {
      if (err instanceof ImportError) return res.status(err.status).json({ error: err.message });
      console.error(`[import] ${req.method} failed: ${err.message}`);
      if (!res.headersSent) res.status(500).json({ error: "import request failed" });
    }
  };
  const rawImage = express.raw({ type: ["image/jpeg", "image/png", "image/heic", "image/webp"], limit: "12mb" });

  app.post("/api/v2/import/batches", wrap(async (req, res, studentId) => res.status(201).json(await createBatch(pool, { studentId, extractor }))));
  app.post("/api/v2/import/batches/:id/pages", rawImage, wrap(async (req, res, studentId) => {
    const spread = req.query.spread === undefined ? null : Number.parseInt(String(req.query.spread), 10);
    res.status(201).json(await addPage(pool, { studentId, batchId: req.params.id, image: Buffer.isBuffer(req.body) ? req.body : null,
      contentType: String(req.headers["content-type"] || "").split(";")[0].trim(), pageType: String(req.query.page_type || ""),
      spreadIndex: Number.isFinite(spread) ? spread : null, rotation: Number(req.query.rotation || 0), store }));
  }));
  app.post("/api/v2/import/pages/:id/extract", wrap(async (req, res, studentId) => res.json(await extractPage(pool, { studentId, pageId: req.params.id, extractor, store }))));
  app.get("/api/v2/import/pages/:id", wrap(async (req, res, studentId) => res.json(await getPage(pool, { studentId, pageId: req.params.id }))));
  app.get("/api/v2/import/pages/:id/image", wrap(async (req, res, studentId) => {
    const { rows } = await pool.query(`SELECT image_key, content_type FROM import_pages WHERE id = $1 AND student_id = $2`, [req.params.id, studentId]);
    const img = rows.length ? await store.get(rows[0].image_key) : null;
    if (!img) return res.status(404).json({ error: "page not found" });
    res.set("Content-Type", rows[0].content_type).set("X-Content-Type-Options", "nosniff").set("Content-Disposition", "inline").send(img);
  }));
  app.patch("/api/v2/import/pages/:id/rows/:row", wrap(async (req, res, studentId) => {
    const row = Number.parseInt(req.params.row, 10);
    if (!Number.isInteger(row) || row < 0 || row > 63) return res.status(400).json({ error: "bad row" });
    res.json(await updateRow(pool, { studentId, pageId: req.params.id, rowIndex: row, cells: req.body?.cells, cfiSigned: req.body?.cfiSigned }));
  }));
  app.put("/api/v2/import/pages/:id/footer", wrap(async (req, res, studentId) => res.json(await setFooter(pool, { studentId, pageId: req.params.id, footer: req.body }))));
  app.post("/api/v2/import/pages/:id/confirm", wrap(async (req, res, studentId) => {
    const r = await confirmPage(pool, { studentId, pageId: req.params.id });
    res.status(r.ok ? 200 : 422).json(r);
  }));

  app.get("/import", (req, res) => {
    res.set("Cache-Control", "no-store").set("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; img-src 'self' blob:; frame-ancestors 'none'")
      .type("html").send(STUB_PAGE);
  });
}

// Minimal stub. The guided camera overlay is a TODO; its design is documented in docs/paper-import.md.
const STUB_PAGE = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>Import paper logbook</title>
<style>body{font-family:system-ui,sans-serif;max-width:40rem;margin:2rem auto;padding:0 1rem;color:#0f172a}
.steps li{margin:.4rem 0}.note{background:#fef3c7;padding:.75rem 1rem;border-radius:.5rem}</style></head><body>
<h1>Import your paper logbook</h1>
<p class="note">Preview. Imported entries are marked <b>student-imported</b>. They are not CFI-signed records.</p>
<ol class="steps"><li>Photograph the <b>left page</b> of a spread, flat and with all four corners visible.</li>
<li>Then photograph the <b>right page</b> of the same spread.</li>
<li>Check every amber cell against the photo, then confirm the page.</li></ol>
<p>Camera capture with an alignment overlay is coming. For now, use the API (<code>/api/v2/import</code>).</p>
</body></html>`;
