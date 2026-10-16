/**
 * Build next-lesson briefing text from weakest ACS areas + hour deficits.
 */
import { nextLesson, briefText } from '../checkride/insights.mjs';

export function weakestAcsFocus(cr, limit = 3) {
  const tasks = (cr.acs?.areas || []).flatMap((a) =>
    a.tasks.map((t) => ({ ...t, area: a.area, areaTitle: a.title }))
  );
  const introduced = tasks.filter((t) => t.status === 'introduced');
  const notStarted = tasks.filter((t) => t.status === 'not_started' && !['I', 'XII'].includes(t.area));
  const items = [];
  for (const t of introduced.slice(0, 2)) {
    items.push({
      kind: 'ACS',
      code: t.id,
      text: t.title,
      sub: `${t.areaTitle} · introduced → proficient`,
    });
  }
  for (const t of notStarted) {
    if (items.length >= limit) break;
    if (items.some((i) => i.code === t.id)) continue;
    items.push({ kind: 'ACS', code: t.id, text: t.title, sub: `New: ${t.areaTitle}` });
  }
  if (!items.length) return nextLesson(cr);
  return items.slice(0, limit);
}

export function instructorBriefing(cr, { updatedAt = null, instructorName = '' } = {}) {
  const focus = weakestAcsFocus(cr);
  const text = briefText(focus, { name: instructorName });
  const spoken = focus.length
    ? `For your next lesson, focus on ${focus.map((f) => f.text).join(', ')}. ${focus[0]?.sub || ''}`
    : text;
  return {
    focus,
    text,
    spoken,
    updatedAt: updatedAt || new Date().toISOString(),
    badge: 'AI',
  };
}

export function minutesAgoLabel(iso, now = new Date()) {
  if (!iso) return 'just now';
  const ms = Math.max(0, now.getTime() - new Date(iso).getTime());
  const m = Math.round(ms / 60000);
  if (m < 1) return 'just now';
  if (m === 1) return '1 min ago';
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  return h === 1 ? '1 hr ago' : `${h} hrs ago`;
}
