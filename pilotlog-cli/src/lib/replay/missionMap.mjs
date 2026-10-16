/**
 * Mission Map — vertical §61.109(a) checklist with complete / in_progress / locked.
 */
import { evaluate61109a } from '../checkride/requirements.mjs';
import { readinessScore } from '../checkride/insights.mjs';

const MILESTONES = [
  { key: 'firstSolo', label: 'First Solo', from: (req, entries) => {
    const solo = entries.some((e) => Number(e.solo) > 0);
    return solo
      ? { status: 'complete', detail: 'Solo time logged' }
      : { status: 'locked', detail: 'No solo flights yet' };
  }},
  { key: 'soloXC', label: 'Solo XC', from: (req) => statusFromReq(req.requirements.soloXC, { unlockIf: req.requirements.soloTime?.actual > 0 || req.requirements.soloXC?.actual > 0 }) },
  { key: 'night3', label: 'Night 3 hr', from: (req) => statusFromReq(req.requirements.nightTraining) },
  { key: 'nightXC', label: 'Night XC + 10 ldgs', from: (req) => {
    const xc = req.requirements.nightXC;
    const ldg = req.requirements.nightFullStops;
    const to = req.requirements.nightTakeoffs;
    if (xc.met && ldg.met && to.met) return { status: 'complete', detail: 'Night XC + 10 T/O & landings' };
    if (req.requirements.nightTraining.actual > 0 || ldg.actual > 0) {
      return { status: 'in_progress', detail: `${ldg.actual}/10 night landings · XC ${xc.met ? 'done' : 'needed'}` };
    }
    return { status: 'locked', detail: 'Start night training' };
  }},
  { key: 'instrument', label: '3 hr Instrument', from: (req) => statusFromReq(req.requirements.instrument) },
  { key: 'prep60', label: '3 hr Prep (60 days)', from: (req) => statusFromReq(req.requirements.checkridePrep) },
  { key: 'solo10', label: '10 hr Solo', from: (req) => statusFromReq(req.requirements.soloTime) },
  { key: 'total40', label: '40 hr Total', from: (req) => statusFromReq(req.requirements.totalTime) },
  { key: 'checkride', label: 'Checkride', from: (req) => {
    if (req.allMet) return { status: 'in_progress', detail: 'Requirements met — schedule checkride' };
    return { status: 'locked', detail: `${req.metCount}/${req.totalCount} §61.109 items` };
  }},
];

function statusFromReq(r, { unlockIf = true } = {}) {
  if (!r) return { status: 'locked', detail: '—' };
  if (r.met) return { status: 'complete', detail: `${r.actual} / ${r.required} ${r.unit}` };
  if (r.actual > 0 || unlockIf) return { status: 'in_progress', detail: `${r.actual} / ${r.required} ${r.unit}` };
  return { status: 'locked', detail: `Need ${r.required} ${r.unit}` };
}

export function buildMissionMap(entries, checkrideState = {}, { asOf } = {}) {
  const req = evaluate61109a(entries, { asOf, testDate: checkrideState.testDate });
  // Gate later milestones: once a prior incomplete exists, subsequent stay locked if zero progress
  const items = [];
  let lockRest = false;
  for (const m of MILESTONES) {
    let item = m.from(req, entries);
    if (lockRest && item.status === 'in_progress' && !String(item.detail).match(/\d/) ) {
      item = { status: 'locked', detail: item.detail };
    }
    // Soft lock: checkride always locked until allMet; prep locked until instrument started or near end
    if (m.key === 'prep60' && req.requirements.instrument.actual <= 0 && req.requirements.totalTime.pct < 70) {
      if (item.status !== 'complete') item = { status: 'locked', detail: 'Opens near checkride' };
    }
    items.push({
      key: m.key,
      label: m.label,
      status: item.status,
      detail: item.detail,
    });
    if (item.status === 'locked' && m.key !== 'checkride') {
      // don't hard-lock everything after first lock — only aesthetic sequence for zeros
    }
  }

  const cr = checkrideState.cr || null;
  const score = cr ? readinessScore(cr) : {
    pct: Math.round((req.metCount / Math.max(1, req.totalCount)) * 100),
  };

  const next = items.find((i) => i.status === 'in_progress') || items.find((i) => i.status === 'locked');
  const nextReq = next && req.requirements[next.key === 'solo10' ? 'soloTime' : next.key === 'total40' ? 'totalTime' : next.key === 'night3' ? 'nightTraining' : next.key === 'instrument' ? 'instrument' : next.key === 'prep60' ? 'checkridePrep' : next.key === 'soloXC' ? 'soloXC' : null];

  return {
    regulation: req.regulation,
    items,
    readinessPct: score.pct ?? 0,
    onTrack: (score.pct ?? 0) >= 40,
    nextMilestone: next
      ? {
          label: next.label,
          detail: next.detail,
          pct: nextReq?.pct ?? (next.status === 'complete' ? 100 : 0),
          actual: nextReq?.actual,
          required: nextReq?.required,
          unit: nextReq?.unit,
        }
      : null,
    requirements: req,
  };
}
