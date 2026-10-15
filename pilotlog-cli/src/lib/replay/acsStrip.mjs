/** ACS skill-area strip with percentages for the replay dashboard. */
export function acsSkillStrip(acs) {
  const groups = [
    { key: 'preflight', label: 'Preflight Procedures', areas: ['I', 'II'], icon: 'pre' },
    { key: 'tol', label: 'Takeoffs & Landings', areas: ['IV'], icon: 'rwy' },
    { key: 'maneuvers', label: 'Maneuvers', areas: ['V', 'VII'], icon: 'ac' },
    { key: 'xc', label: 'Cross-Country', areas: ['VI'], icon: 'xc' },
    { key: 'night', label: 'Night Operations', areas: ['XI'], icon: 'night' },
    { key: 'inst', label: 'Instrument Basics', areas: ['VIII'], icon: 'inst' },
  ];
  const byArea = Object.fromEntries((acs?.areas || []).map((a) => [a.area, a]));
  return groups.map((g) => {
    let proficient = 0, total = 0;
    for (const code of g.areas) {
      const a = byArea[code];
      if (!a) continue;
      for (const t of a.tasks || []) {
        total++;
        if (t.status === 'proficient') proficient++;
      }
    }
    const pct = total ? Math.round((proficient / total) * 100) : 0;
    let level = 'Developing';
    if (pct >= 80) level = 'Mastered';
    else if (pct >= 60) level = 'Proficient';
    else if (pct >= 40) level = 'Building';
    return { ...g, pct, proficient, total, level };
  });
}
