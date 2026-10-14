/**
 * requirements.mjs — 14 CFR §61.109(a) aeronautical experience model (PPL ASEL).
 *
 * Text verified against eCFR, 14 CFR 61.109 (current, as amended by
 * Amdt. 61-157, 89 FR 92485, Nov. 21, 2024):
 *   https://www.ecfr.gov/current/title-14/section-61.109
 *
 * Pure computation. Entries are logbook entries (data/entries.json) optionally
 * merged with per-flight "details" stored by the Checkride Tracker
 * (data/checkride.json → flights[entryId]) so anchored/hashed entries are
 * never rewritten.
 *
 * Per-flight detail fields used here (all optional):
 *   xcDistanceNm        total distance of a cross-country flight (NM)
 *   fullStopPoints      number of points with full-stop landings on the flight
 *   longestLegNm        longest straight-line segment between takeoff/landing (NM)
 *   towerFullStops      full-stop T/O+landings at an airport with operating tower
 *   nightTakeoffs       night takeoffs (night landings use entry.nightLandings)
 *   nightFullStops      night full-stop landings in the pattern (defaults to nightLandings)
 *   checkridePrep       true if the flight was dual prep for the practical test
 */

const n = (v) => Number(v) || 0;
const r1 = (v) => Math.round(v * 10) / 10;

export const PPL_ASEL_MINIMUMS = {
  totalTime: 40,          // §61.109(a)  at least 40 hours of flight time
  dualReceived: 20,       // §61.109(a)  at least 20 hours of flight training from an authorized instructor
  soloTime: 10,           // §61.109(a), (a)(5)  10 hours solo
  dualXC: 3,              // §61.109(a)(1)  3 hours of cross-country flight training
  nightTraining: 3,       // §61.109(a)(2)  3 hours of night flight training
  nightXCNm: 100,         // §61.109(a)(2)(i)  one night XC of OVER 100 NM total distance
  nightTakeoffs: 10,      // §61.109(a)(2)(ii)  10 takeoffs ...
  nightFullStops: 10,     // §61.109(a)(2)(ii)  ... and 10 landings to a full stop (pattern) at an airport
  instrument: 3,          // §61.109(a)(3)  3 hours solely by reference to instruments
  checkridePrep: 3,       // §61.109(a)(4)  3 hours prep within preceding 2 calendar months of the test month
  checkridePrepMonths: 2, // §61.109(a)(4)
  soloXC: 5,              // §61.109(a)(5)(i)  5 hours solo cross-country
  longXCNm: 150,          // §61.109(a)(5)(ii) one solo XC of 150 NM total distance,
  longXCPoints: 3,        //                    full-stop landings at three points,
  longXCLegNm: 50,        //                    one segment straight-line > 50 NM
  soloTowerOps: 3,        // §61.109(a)(5)(iii) 3 takeoffs + 3 full-stop landings at a towered airport
};

export function isDual(e) { return n(e.dual ?? e.dualReceived) > 0; }
export function isSolo(e) { return n(e.solo) > 0; }
export function xcHours(e) { return n(e.xc ?? e.crossCountry); }
export function totalHours(e) { return n(e.totalTime ?? e.total); }

/**
 * First day of the month that opens the §61.109(a)(4) window.
 * "within the preceding 2 calendar months from the month of the test":
 * for a test in March, prep flown on/after Jan 1 counts (Jan, Feb + March).
 */
export function prepWindowStart(testDate, months = 2) {
  const d = new Date(testDate);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - months, 1));
}

function req(key, label, cite, required, actual, unit = 'hours', note) {
  const met = actual >= required;
  const deficit = met ? 0 : (unit === 'hours' ? r1(required - actual) : Math.ceil(required - actual));
  const pct = required ? Math.min(100, Math.round((actual / required) * 100)) : 100;
  return { key, label, regulation: `14 CFR §${cite}`, required, actual: unit === 'hours' ? r1(actual) : actual, unit, met, deficit, pct, ...(note ? { note } : {}) };
}

function flag(key, label, cite, met, note) {
  return { key, label, regulation: `14 CFR §${cite}`, required: 1, actual: met ? 1 : 0, unit: 'event', met, deficit: met ? 0 : 1, pct: met ? 100 : 0, ...(note ? { note } : {}) };
}

/**
 * evaluate61109a(entries, { asOf, testDate, minimums })
 * entries: logbook entries already merged with checkride flight details.
 */
export function evaluate61109a(entries, { asOf, testDate, minimums } = {}) {
  const m = { ...PPL_ASEL_MINIMUMS, ...minimums };
  const asOfDate = new Date(asOf || Date.now());
  const test = testDate ? new Date(testDate) : asOfDate;
  const flown = entries.filter(e => !e.date || new Date(e.date) <= asOfDate);

  let total = 0, dual = 0, solo = 0, dualXC = 0, soloXC = 0, nightDual = 0, instrument = 0;
  let nightTO = 0, nightFS = 0, soloTower = 0, prep = 0;
  let nightXCFlight = null, longSoloXCFlight = null;
  const windowStart = prepWindowStart(test, m.checkridePrepMonths);

  for (const e of flown) {
    const t = totalHours(e), x = xcHours(e), d = n(e.dual ?? e.dualReceived), s = n(e.solo);
    total += t; dual += d; solo += s;
    if (d > 0 && x > 0) dualXC += Math.min(x, d);               // (a)(1) XC flight *training*
    if (s > 0 && x > 0) soloXC += Math.min(x, s);               // (a)(5)(i)
    if (n(e.soloXC) > 0 && !(s > 0 && x > 0)) soloXC += n(e.soloXC);
    const night = n(e.night);
    if (night > 0 && d > 0) {                                   // (a)(2) night flight *training*
      nightDual += Math.min(night, d);
      nightTO += n(e.nightTakeoffs ?? e.nightLandings);
      nightFS += n(e.nightFullStops ?? e.nightLandings);
      if (x > 0 && n(e.xcDistanceNm) > m.nightXCNm && !nightXCFlight) nightXCFlight = e; // (a)(2)(i) "over 100"
    }
    instrument += Math.min(n(e.simulatedInstrument) + n(e.actualInstrument), t || Infinity); // (a)(3)
    if (s > 0) soloTower += n(e.towerFullStops);               // (a)(5)(iii)
    if (s > 0 && x > 0 && !longSoloXCFlight                     // (a)(5)(ii)
        && n(e.xcDistanceNm) >= m.longXCNm
        && n(e.fullStopPoints) >= m.longXCPoints
        && n(e.longestLegNm) > m.longXCLegNm) longSoloXCFlight = e;
    if (d > 0 && e.checkridePrep && e.date) {                   // (a)(4)
      const fd = new Date(e.date);
      if (fd >= windowStart && fd <= test) prep += d;
    }
  }

  const requirements = {
    totalTime:    req('totalTime', 'Total flight time', '61.109(a)', m.totalTime, total),
    dualReceived: req('dualReceived', 'Flight training from an authorized instructor', '61.109(a)', m.dualReceived, dual),
    soloTime:     req('soloTime', 'Solo flight time', '61.109(a)(5)', m.soloTime, solo),
    dualXC:       req('dualXC', 'Cross-country flight training', '61.109(a)(1)', m.dualXC, dualXC),
    nightTraining: req('nightTraining', 'Night flight training', '61.109(a)(2)', m.nightTraining, nightDual),
    nightXC:      flag('nightXC', `Night XC over ${m.nightXCNm} NM total distance`, '61.109(a)(2)(i)', !!nightXCFlight,
                    nightXCFlight ? `${nightXCFlight.date}: ${n(nightXCFlight.xcDistanceNm)} NM` : 'Log XC distance (NM) on the night XC flight'),
    nightTakeoffs: req('nightTakeoffs', 'Night takeoffs', '61.109(a)(2)(ii)', m.nightTakeoffs, nightTO, 'count'),
    nightFullStops: req('nightFullStops', 'Night full-stop landings (pattern)', '61.109(a)(2)(ii)', m.nightFullStops, nightFS, 'count'),
    instrument:   req('instrument', 'Flight solely by reference to instruments', '61.109(a)(3)', m.instrument, instrument),
    checkridePrep: req('checkridePrep', `Checkride prep within ${m.checkridePrepMonths} calendar months of test`, '61.109(a)(4)', m.checkridePrep, prep, 'hours',
                    `Window: ${windowStart.toISOString().slice(0, 10)} → ${test.toISOString().slice(0, 10)} (mark flights as checkride prep)`),
    soloXC:       req('soloXC', 'Solo cross-country time', '61.109(a)(5)(i)', m.soloXC, soloXC),
    longSoloXC:   flag('longSoloXC', `Solo XC ≥${m.longXCNm} NM, full stops at ${m.longXCPoints} points, one leg >${m.longXCLegNm} NM`, '61.109(a)(5)(ii)', !!longSoloXCFlight,
                    longSoloXCFlight ? `${longSoloXCFlight.date}: ${n(longSoloXCFlight.xcDistanceNm)} NM, ${n(longSoloXCFlight.fullStopPoints)} points, longest leg ${n(longSoloXCFlight.longestLegNm)} NM` : 'Log distance, full-stop points and longest leg on the flight'),
    soloTowerOps: req('soloTowerOps', 'Solo full-stop T/O & landings at towered airport', '61.109(a)(5)(iii)', m.soloTowerOps, soloTower, 'count'),
  };
  const list = Object.values(requirements);
  return {
    regulation: '14 CFR §61.109(a)',
    source: 'https://www.ecfr.gov/current/title-14/section-61.109',
    asOf: asOfDate.toISOString(),
    testDate: test.toISOString().slice(0, 10),
    requirements,
    metCount: list.filter(x => x.met).length,
    totalCount: list.length,
    allMet: list.every(x => x.met),
  };
}
