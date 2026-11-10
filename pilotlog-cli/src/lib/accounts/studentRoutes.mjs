/**
 * studentRoutes.mjs — per-student scoping for the cockpit, checkride, replay tracks, radio practice and
 * AI-coach usage (PR #11's requireStudent/studentData, rebuilt on accounts v2 sessions).
 *
 * Registered by readApi ONLY when registerAccountsV2() reports enabled (PILOTLOG_ACCOUNTS_V2=true + Postgres),
 * and BEFORE the legacy cockpit/checkride routes, so in v2 mode these handlers answer first. With the flag
 * off nothing here is mounted and the legacy single-user file/wallet behaviour is untouched.
 *
 *   signed in  (req.accountV2)  → reads/writes only that student's student_docs rows.
 *                                 ?demo=1 is ignored so a session is never switched to SAMPLE data.
 *   signed out                  → GETs return SAMPLE (demo) data, writes return 401
 * The student id comes only from the server-side session; no route takes a student id from the client.
 */
import crypto from "node:crypto";
import { createStudentStore } from "./studentStore.mjs";
import { createStudentData, sanitizeRadioAttempt } from "./studentData.mjs";
import { sameOriginWritesV2 } from "./http.mjs";
import { computeCheckride, ENDORSEMENT_CATALOG, sanitizeEndorsement, ACS_STATUSES, isValidAcsTask } from "../checkride/index.mjs";
import { demoData } from "../checkride/insights.mjs";
import { sanitizeEntry } from "../cockpit/entries.mjs";
import { settingsFor, sanitizeSettings } from "../cockpit/settings.mjs";
import { DEMO_USER, formatPilotChip } from "../cockpit/profile.mjs";
import { instructorBriefing } from "../cockpit/briefing.mjs";
import { getStationWeather } from "../weather/fetch.mjs";
import { buildTrack } from "../replay/tracks.mjs";
import { parseTrack } from "../replay/parse.mjs";
import { detectEvents } from "../replay/events.mjs";
import { renderCheckridePage } from "../../checkrideView.mjs";
import { sanitizeFlightDetails } from "../../checkrideRoutes.mjs";
import { SCENARIOS } from "../../../../public/js/atc-engine.js";

export const ENTRY_ID_RE = /^[0-9a-f]{16}$/;
const SCENARIO_IDS = SCENARIOS.map((s) => s.id);
const SIGN_IN_REQUIRED = { error: "sign in required", signIn: "/signin" };

/** Display chip for a signed-in student (name from settings if set, else a neutral label). */
export function studentUser(settings, studentId) {
  const chip = formatPilotChip(settings?.pilotName || "");
  return {
    name: chip?.name || "STUDENT PILOT", initials: chip?.initials || "SP", role: "PRIVATE PILOT STUDENT", sample: false,
    account: { signedIn: true, studentId },
  };
}

export function registerStudentRoutes(app, { pool, escapeHtml, env = process.env, data: injected = null }) {
  const data = injected ?? createStudentData(createStudentStore({ pool, env }));
  const st = (req) => (req.accountV2?.studentId ? { id: req.accountV2.studentId } : null);
  const guard = sameOriginWritesV2({ env });
  const wrap = (fn) => async (req, res, next) => {
    try { await fn(req, res, next); } catch (err) {
      console.error(`[student] ${req.method} ${req.path}: ${err.message}`);
      if (!res.headersSent) res.status(500).json({ error: "request failed" });
    }
  };
  /** Writes: same-origin + signed-in, else 401. */
  const write = (fn) => [guard, wrap(async (req, res, next) => {
    const s = st(req);
    if (!s) return res.status(401).json(SIGN_IN_REQUIRED);
    res.set("Cache-Control", "no-store");
    return fn(req, res, s, next);
  })];
  // Sample data only when there is no session. ?demo=1 must not replace a signed-in logbook.
  const isDemo = (req) => !st(req);

  async function studentState(s, asOf) {
    const [entries, store] = await Promise.all([data.entries(s), data.checkride(s)]);
    return { entries, store, cr: computeCheckride(entries, store, { asOf }) };
  }

  /** Page context for cockpit HTML pages (passed to registerCockpitRoutes as accounts.loadContext). */
  async function loadContext(req) {
    const s = st(req);
    if (!s) {
      const d = demoData();
      const cr = computeCheckride(d.entries, d.store);
      const weather = await getStationWeather({ demo: true });
      const settings = settingsFor({ demo: true });
      const briefing = instructorBriefing(cr, { instructorName: settings.instructorName });
      return { demo: true, entries: d.entries, cr, weather, briefing, settings, rates: d.store.rates,
        user: { ...DEMO_USER, account: { signedIn: !!s } }, getTrack: async () => null };
    }
    const settings = await data.settings(s);
    const { entries, store, cr } = await studentState(s);
    const weather = await getStationWeather({ icao: settings.homeAirport, force: req.query.refresh === "1" });
    const briefing = instructorBriefing(cr, { instructorName: settings.instructorName });
    return { demo: false, entries, cr, weather, briefing, settings, rates: store.rates, user: studentUser(settings, s.id),
      getTrack: async (entryId) => (ENTRY_ID_RE.test(entryId) ? (await data.tracks(s))[entryId] || null : null) };
  }

  // Global switching of the single-user wallet cache would let one visitor change what another sees.
  // In v2 mode wallets are identities (/api/v2/auth/wallet/*), so the legacy connect endpoint is closed.
  app.post("/wallet/connect", (_req, res) => res.status(410).json({ error: "Wallet connect moved to sign-in. Use /signin, then link your wallet from Account.", signIn: "/signin" }));

  // ── settings + weather ──
  app.get("/api/weather", wrap(async (req, res) => {
    const demo = isDemo(req);
    const icao = demo ? "" : (await data.settings(st(req))).homeAirport;
    res.json(await getStationWeather({ icao, demo, force: req.query.refresh === "1" }));
  }));
  app.get("/api/cockpit/settings", wrap(async (req, res) => {
    res.set("Cache-Control", "no-store");
    if (isDemo(req)) return res.json({ demo: true, signedIn: !!st(req), settings: settingsFor({ demo: true }), rates: demoData().store.rates });
    const s = st(req);
    res.json({ demo: false, signedIn: true, settings: await data.settings(s), rates: (await data.checkride(s)).rates });
  }));
  app.put("/api/cockpit/settings", ...write(async (req, res, s) => {
    const body = req.body || {};
    let next, rates = null;
    try {
      next = sanitizeSettings(body, await data.settings(s));
      if (body.rates && (body.rates.aircraftRate !== undefined || body.rates.instructorRate !== undefined)) {
        const cur = await data.checkride(s);
        const a = body.rates.aircraftRate ?? cur.rates?.aircraftRate, i = body.rates.instructorRate ?? cur.rates?.instructorRate;
        if (!(Number(a) >= 0 && Number(a) < 10000) || !(Number(i) >= 0 && Number(i) < 10000)) throw new Error("rates must be numbers between 0 and 10000");
        rates = { aircraftRate: Number(a), instructorRate: Number(i), aircraftLabel: next.aircraftLabel || cur.rates?.aircraftLabel || "" };
        cur.rates = rates;
        await data.saveCheckride(s, cur);
      }
    } catch (err) { return res.status(400).json({ ok: false, error: String(err.message || err) }); }
    res.json({ ok: true, settings: await data.saveSettings(s, next), rates });
  }));

  // ── logbook entries ──
  app.get("/api/cockpit/entries", wrap(async (req, res) => {
    res.set("Cache-Control", "no-store");
    if (isDemo(req)) return res.json({ demo: true, signedIn: !!st(req), entries: demoData().entries });
    res.json({ demo: false, signedIn: true, entries: await data.entries(st(req)) });
  }));
  app.post("/api/cockpit/entries", ...write(async (req, res, s) => {
    let body;
    try { body = sanitizeEntry(req.body || {}); } catch (err) { return res.status(400).json({ error: err.message }); }
    const entries = await data.entries(s);
    if (entries.length >= 5000) return res.status(400).json({ error: "logbook is full" });
    const entry = { id: crypto.randomBytes(8).toString("hex"), ...body, dual: body.dual ?? (body.solo ? 0 : body.totalTime),
      solo: body.solo ?? 0, from: body.from || "", to: body.to || body.from || "", createdAt: new Date().toISOString() };
    entries.push(entry);
    await data.saveEntries(s, entries);
    res.status(201).json(entry);
  }));
  app.put("/api/cockpit/entries/:id", ...write(async (req, res, s) => {
    const entries = await data.entries(s);
    const i = ENTRY_ID_RE.test(req.params.id) ? entries.findIndex((e) => e.id === req.params.id) : -1;
    if (i < 0) return res.status(404).json({ error: "unknown entry" });
    let patch;
    try { patch = sanitizeEntry(req.body || {}, { partial: true }); } catch (err) { return res.status(400).json({ error: err.message }); }
    entries[i] = { ...entries[i], ...patch, updatedAt: new Date().toISOString() };
    await data.saveEntries(s, entries);
    res.json(entries[i]);
  }));
  app.delete("/api/cockpit/entries/:id", ...write(async (req, res, s) => {
    const entries = await data.entries(s);
    const next = entries.filter((e) => e.id !== req.params.id);
    if (next.length === entries.length) return res.status(404).json({ error: "unknown entry" });
    await data.saveEntries(s, next);
    res.json({ ok: true });
  }));

  // ── replay tracks (sample + parse stay on the legacy handlers: they hold no student data) ──
  app.post("/api/cockpit/tracks/parse", (req, res) => { // stateless preview; registered first so it never hits :entryId
    try {
      const parsed = parseTrack(req.body?.text || "", req.body?.filename || "");
      res.json({ format: parsed.format, pointCount: parsed.points.length, events: detectEvents(parsed.points), points: parsed.points.slice(0, 5) });
    } catch (err) { res.status(400).json({ error: String(err.message || err) }); }
  });
  app.get("/api/cockpit/tracks/:entryId", wrap(async (req, res, next) => {
    if (req.params.entryId === "sample") return next();
    const s = st(req);
    if (!s) return res.status(401).json(SIGN_IN_REQUIRED);
    const t = ENTRY_ID_RE.test(req.params.entryId) ? (await data.tracks(s))[req.params.entryId] : null;
    if (!t) return res.status(404).json({ error: "no track" });
    res.set("Cache-Control", "no-store").json(t);
  }));
  app.post("/api/cockpit/tracks/:entryId", ...write(async (req, res, s) => {
    if (!ENTRY_ID_RE.test(req.params.entryId)) return res.status(400).json({ error: "invalid entry id" });
    if (!(await data.entries(s)).some((e) => e.id === req.params.entryId)) return res.status(404).json({ error: "unknown entry" });
    const body = req.body || {};
    const text = body.text || body.gpx || body.csv || "";
    if (!text) return res.status(400).json({ error: "missing track text" });
    let track;
    try { track = buildTrack(req.params.entryId, text, body.filename || body.name || ""); } catch (err) { return res.status(400).json({ error: String(err.message || err) }); }
    const all = await data.tracks(s);
    all[req.params.entryId] = track;
    await data.saveTracks(s, all);
    res.status(201).json({ id: track.id, entryId: track.entryId, stats: track.stats, events: track.events, format: track.format });
  }));

  // ── radio practice history ──
  app.get("/api/cockpit/radio/attempts", wrap(async (req, res) => {
    const s = st(req);
    if (!s) return res.status(401).json(SIGN_IN_REQUIRED);
    res.set("Cache-Control", "no-store").json({ attempts: await data.radio(s) });
  }));
  app.post("/api/cockpit/radio/attempts", ...write(async (req, res, s) => {
    let a;
    try { a = sanitizeRadioAttempt(req.body || {}, SCENARIO_IDS); } catch (err) { return res.status(400).json({ error: err.message }); }
    res.status(201).json(await data.addRadioAttempt(s, a));
  }));

  // ── AI-coach usage (read-only; recordUsage is server-side only) ──
  app.get("/api/cockpit/usage", wrap(async (req, res) => {
    const s = st(req);
    if (!s) return res.status(401).json(SIGN_IN_REQUIRED);
    res.set("Cache-Control", "no-store").json(await data.store.usage(s.id));
  }));

  // ── checkride ──
  const crUpdate = (fn) => write(async (req, res, s) => {
    const store = await data.checkride(s);
    try { await fn(req, store, s); } catch (err) { return res.status(400).json({ ok: false, error: err.message }); }
    await data.saveCheckride(s, store);
    res.json({ ok: true });
  });
  app.get("/api/checkride", wrap(async (req, res) => {
    res.set("Cache-Control", "no-store");
    const asOf = req.query.asOf ? String(req.query.asOf) : undefined;
    if (isDemo(req)) { const d = demoData(); return res.json({ ...computeCheckride(d.entries, d.store, { asOf }), demo: true }); }
    res.json((await studentState(st(req), asOf)).cr);
  }));
  app.put("/api/checkride/rates", ...crUpdate((req, s) => {
    const a = Number(req.body?.aircraftRate), i = Number(req.body?.instructorRate);
    if (!(a >= 0 && a < 10000) || !(i >= 0 && i < 10000)) throw new Error("rates must be numbers between 0 and 10000");
    s.rates = { aircraftRate: a, instructorRate: i, aircraftLabel: String(req.body?.aircraftLabel ?? s.rates?.aircraftLabel ?? "").slice(0, 40) };
  }));
  app.put("/api/checkride/test-date", ...crUpdate((req, s) => {
    const d = req.body?.testDate;
    if (d && !/^\d{4}-\d{2}-\d{2}$/.test(String(d))) throw new Error("testDate must be YYYY-MM-DD");
    s.testDate = d || null;
  }));
  app.put("/api/checkride/endorsements/:key", ...crUpdate((req, s) => {
    if (!ENDORSEMENT_CATALOG.some((c) => c.key === req.params.key)) throw new Error("unknown endorsement");
    s.endorsements[req.params.key] = sanitizeEndorsement(req.body);
  }));
  app.put("/api/checkride/acs/:taskId", ...crUpdate((req, s) => {
    if (!isValidAcsTask(req.params.taskId)) throw new Error("unknown ACS task");
    if (!ACS_STATUSES.includes(req.body?.status)) throw new Error("invalid status");
    s.acs[req.params.taskId] = { status: req.body.status, updatedAt: new Date().toISOString() };
  }));
  app.put("/api/checkride/flights/:entryId", ...crUpdate(async (req, s, student) => {
    if (!(await data.entries(student)).some((e) => e.id === req.params.entryId)) throw new Error("unknown flight");
    s.flights[req.params.entryId] = sanitizeFlightDetails(req.body);
  }));
  app.get("/checkride", wrap(async (req, res) => {
    if (isDemo(req)) {
      const d = demoData();
      return res.type("html").send(renderCheckridePage(computeCheckride(d.entries, d.store), escapeHtml, { entries: d.entries, demo: true }));
    }
    const { entries, cr } = await studentState(st(req));
    res.set("Cache-Control", "no-store").type("html").send(renderCheckridePage(cr, escapeHtml, { entries }));
  }));

  return { loadContext, data };
}
