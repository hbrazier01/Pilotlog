/**
 * Typed per-student loaders/savers on top of studentStore. All take the session student.
 * Postgres back-compat: if a student has no checkride/entries doc yet, fall back to the existing
 * wallet-scoped rows (pilot_profiles.checkride_json, flights) so prior data shows up on first sign-in.
 */
import { sanitizeSettings, DEFAULT_SETTINGS } from '../cockpit/settings.mjs';
import { EMPTY_STORE } from '../checkride/index.mjs';

const RADIO_MAX = 200;

export function createStudentData(store, { pgReadCheckride = null, pgReadEntries = null } = {}) {
  return {
    store,
    async settings(st) {
      const doc = await store.get(st.id, 'settings');
      try { return sanitizeSettings(doc || {}, DEFAULT_SETTINGS); } catch { return sanitizeSettings({}, DEFAULT_SETTINGS); }
    },
    async saveSettings(st, next) { await store.put(st.id, 'settings', next); return next; },
    async checkride(st) {
      let doc = await store.get(st.id, 'checkride');
      if (doc == null && pgReadCheckride) { try { doc = await pgReadCheckride(st.walletAddress); } catch { doc = null; } }
      return { ...EMPTY_STORE(), ...(doc || {}) };
    },
    async saveCheckride(st, doc) { await store.put(st.id, 'checkride', doc); },
    async entries(st) {
      const doc = await store.get(st.id, 'entries');
      if (Array.isArray(doc)) return doc;
      if (pgReadEntries) { try { const r = await pgReadEntries(st.walletAddress); if (Array.isArray(r)) return r; } catch { /* ignore */ } }
      return [];
    },
    async saveEntries(st, list) { await store.put(st.id, 'entries', list); },
    async tracks(st) { const d = await store.get(st.id, 'tracks'); return d && typeof d === 'object' && !Array.isArray(d) ? d : {}; },
    async saveTracks(st, all) { await store.put(st.id, 'tracks', all); },
    async radio(st) { const d = await store.get(st.id, 'radio'); return Array.isArray(d?.attempts) ? d.attempts : []; },
    async addRadioAttempt(st, attempt) {
      const list = await this.radio(st);
      list.push(attempt);
      await store.put(st.id, 'radio', { attempts: list.slice(-RADIO_MAX) });
      return attempt;
    },
  };
}

export function sanitizeRadioAttempt(input = {}, scenarioIds = null) {
  const scenario = String(input.scenario || '').slice(0, 40);
  if (!/^[a-z0-9_]{2,40}$/.test(scenario)) throw new Error('invalid scenario');
  if (scenarioIds && !scenarioIds.includes(scenario)) throw new Error('unknown scenario');
  const score = Number(input.score);
  if (!Number.isFinite(score) || score < 0 || score > 100) throw new Error('score must be 0–100');
  const steps = input.steps == null ? null : Number(input.steps);
  if (steps != null && (!Number.isInteger(steps) || steps < 0 || steps > 100)) throw new Error('steps invalid');
  const airport = String(input.airport || '').toUpperCase().slice(0, 4);
  if (airport && !/^[A-Z0-9]{3,4}$/.test(airport)) throw new Error('airport invalid');
  return { scenario, score: Math.round(score), steps, airport, at: new Date().toISOString() };
}
