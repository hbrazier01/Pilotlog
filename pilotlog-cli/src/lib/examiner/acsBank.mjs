/**
 * Private Pilot (Airplane) ACS oral-exam bank (FAA-S-ACS-6, knowledge elements).
 * Templates use {aircraft} and {airport}; both come from the student's own Settings with
 * generic fallbacks, so nothing here is tied to one pilot, airframe or field.
 * keyPoints drive the deterministic grader: each point is a list of accepted synonyms/regexes.
 */
export const ACS_AREAS = Object.freeze([
  { id: 'I', title: 'Preflight Preparation' },
  { id: 'II', title: 'Preflight Procedures' },
  { id: 'III', title: 'Airport & Seaplane Base Ops' },
  { id: 'VI', title: 'Navigation' },
  { id: 'VII', title: 'Slow Flight & Stalls' },
  { id: 'IX', title: 'Emergency Operations' },
  { id: 'XI', title: 'Night Operations' },
]);

const q = (id, area, task, acs, text, keyPoints, model) => Object.freeze({ id, area, task, acs, text, keyPoints, model });

export const QUESTIONS = Object.freeze([
  q('docs-arrow', 'I', 'Pilot Qualifications / Airworthiness', 'PA.I.B.K1',
    'Before we fly the {aircraft} today, what documents must be on board, and where do you find them?',
    [['airworthiness'], ['registration'], ['operating limitation', 'poh', 'afm', 'flight manual', 'placard'], ['weight and balance', 'w&b', 'weight & balance']],
    'Airworthiness certificate, registration, operating limitations (POH/AFM, placards, markings) and the current weight & balance — 14 CFR 91.203 and 91.9.'),
  q('inspections', 'I', 'Airworthiness Requirements', 'PA.I.B.K1',
    'Walk me through the inspections that must be current for the {aircraft} to be airworthy.',
    [['annual'], ['100.hour', '100 hour', 'hundred hour', 'for hire'], ['transponder', '24 month', '24-month'], ['elt', 'emergency locator'], ['ad', 'airworthiness directive'], ['pitot', 'static', 'vor check', 'ifr']],
    'Annual (91.409), 100-hour if for hire/instruction, transponder every 24 calendar months (91.413), ELT 12 months/battery (91.207), applicable ADs; VOR 30 days and pitot-static/altimeter 24 months only for IFR.'),
  q('currency', 'I', 'Pilot Qualifications', 'PA.I.A.K2',
    'What do you need to carry a passenger, and what extra is needed to carry one at night?',
    [['three', '3'], ['takeoff', 'landing'], ['90 days', 'ninety'], ['full stop', 'full-stop'], ['night', 'hour after sunset', '1 hour']],
    '3 takeoffs and landings in the preceding 90 days in the same category/class (and type if required); for night, 3 to a full stop between 1 hr after sunset and 1 hr before sunrise — 14 CFR 61.57.'),
  q('weather-sources', 'I', 'Weather Information', 'PA.I.C.K1',
    'You are planning a cross-country from {airport}. Where do you get an official weather briefing and what products do you look at?',
    [['1800wxbrief', 'flight service', 'fss', 'leidos', 'briefing'], ['metar'], ['taf'], ['airmet', 'sigmet', 'g-airmet'], ['pirep'], ['winds aloft', 'fb', 'winds']],
    'Official source: Flight Service (1800wxbrief); review METARs, TAFs, AIRMETs/SIGMETs, PIREPs, winds/temps aloft, prog charts and NOTAMs — 14 CFR 91.103.'),
  q('airspace-d', 'I', 'National Airspace System', 'PA.I.E.K1',
    'What are the entry and equipment requirements for Class D airspace, and what are the VFR weather minimums?',
    [['two-way', 'two way', 'radio communication', 'establish communication'], ['3 ', 'three mile', '3sm', '3 sm', '3 statute'], ['500', 'below'], ['1,000', '1000', 'above'], ['2,000', '2000', 'horizontal']],
    'Establish two-way radio communication before entry; 3 SM visibility and 500 below / 1,000 above / 2,000 horizontal from clouds (91.155); 1,000 ft ceiling to operate in the surface area.'),
  q('perf-density', 'I', 'Performance and Limitations', 'PA.I.F.K1',
    'It is a hot afternoon at {airport}. How does density altitude affect the {aircraft}\'s performance, and how would you account for it?',
    [['density altitude', 'thinner', 'less dense'], ['longer', 'takeoff roll', 'takeoff distance'], ['climb'], ['poh', 'performance chart', 'afm', 'koch'], ['lean', 'mixture', 'power']],
    'High DA = less dense air: less power and lift, longer takeoff roll, reduced climb rate. Use the POH performance charts, lean for best power if appropriate, and plan margins — PA.I.F.K1/K2.'),
  q('wb', 'I', 'Performance and Limitations', 'PA.I.F.K3',
    'What happens if the {aircraft} is loaded with the CG aft of the limit?',
    [['unstable', 'instability', 'less stable'], ['stall', 'spin'], ['recover', 'recovery'], ['elevator', 'control authority']],
    'Aft CG reduces longitudinal stability, makes stall/spin recovery harder or impossible, and can exceed elevator authority; forward CG raises stall speed and needs more tail-down force.'),
  q('ifr-fuel', 'I', 'Cross-Country Flight Planning', 'PA.I.D.K1',
    'What is the minimum fuel reserve for a VFR flight by day and by night?',
    [['30 minute', 'thirty minute', '30 min'], ['45 minute', 'forty-five', '45 min'], ['normal cruis', 'cruise']],
    'Enough to reach the first point of intended landing plus 30 minutes at normal cruise by day, 45 minutes at night — 14 CFR 91.151.'),
  q('preflight', 'II', 'Preflight Assessment', 'PA.II.A.K1',
    'During preflight of the {aircraft} you find something you are not sure about. How do you decide whether it is safe to fly?',
    [['poh', 'checklist', 'afm'], ['mel', 'kinds of operation', 'equipment list', '91.213'], ['inoperative', 'placard'], ['mechanic', 'a&p', 'maintenance'], ['pic', 'pilot in command', 'responsib']],
    'The PIC is responsible for airworthiness (91.7). Check the POH and kinds-of-operations equipment list; for inoperative equipment use 91.213(d) — remove or deactivate and placard "INOPERATIVE", or have a mechanic evaluate.'),
  q('imsafe', 'II', 'Preflight Assessment / ADM', 'PA.II.A.R1',
    'How do you assess your own fitness to fly before a lesson?',
    [['imsafe', 'illness'], ['medication'], ['stress'], ['alcohol', '8 hour', 'bottle'], ['fatigue'], ['emotion', 'eating']],
    'IMSAFE: Illness, Medication, Stress, Alcohol (8 hours, 0.04), Fatigue, Emotion/Eating — plus PAVE for the whole flight.'),
  q('lights', 'III', 'Communications / Light Signals', 'PA.III.A.K3',
    'You lose your radio inbound to {airport}. What do steady green, flashing green and steady red light gun signals mean while airborne?',
    [['steady green', 'cleared to land'], ['flashing green', 'return for landing'], ['steady red', 'give way', 'continue circling']],
    'Airborne: steady green = cleared to land; flashing green = return for landing; steady red = give way and continue circling; flashing red = airport unsafe; alternating red/green = exercise extreme caution — AIM 4-3-13.'),
  q('runway-inc', 'III', 'Runway Incursion Avoidance', 'PA.III.B.K2',
    'What markings and signs tell you that you are about to enter a runway, and what do you do at them?',
    [['hold short', 'hold-short'], ['solid'], ['dashed'], ['red', 'mandatory'], ['clearance', 'cleared', 'readback', 'read back']],
    'Runway holding position markings — two solid and two dashed yellow lines, solid side toward you — and red mandatory signs. Stop and do not cross without an explicit ATC clearance; read back all hold-short instructions.'),
  q('lost', 'VI', 'Lost Procedures', 'PA.VI.D.K1',
    'You become disoriented on a solo cross-country. What do you do?',
    [['climb'], ['communicat', 'atc', 'flight service', '121.5', 'ask'], ['confess', 'admit'], ['conserve', 'power', 'fuel'], ['comply', 'landmark', 'gps', 'vor']],
    'The 5 Cs: Climb, Communicate (ATC/FSS, 121.5), Confess, Comply — and Conserve fuel. Use GPS/VOR and prominent landmarks; consider a precautionary landing early.'),
  q('stall', 'VII', 'Power-Off Stalls', 'PA.VII.C.K1',
    'What causes a stall, and how do you recover in the {aircraft}?',
    [['critical angle', 'angle of attack', 'aoa'], ['reduce', 'lower the nose', 'pitch down', 'forward pressure'], ['level', 'wings'], ['power', 'full power', 'add power'], ['any airspeed', 'any attitude']],
    'A stall occurs when the critical angle of attack is exceeded — at any airspeed or attitude. Recover: reduce AoA (forward pressure), level the wings, add power as needed, return to the desired flight path.'),
  q('spin', 'VII', 'Spin Awareness', 'PA.VII.D.K1',
    'What is required for a spin to develop, and what is the PARE recovery?',
    [['stall'], ['yaw', 'uncoordinated'], ['power', 'idle'], ['aileron', 'neutral'], ['rudder', 'opposite'], ['elevator', 'forward']],
    'A spin needs a stall plus yaw (uncoordinated flight). PARE: Power idle, Ailerons neutral, Rudder full opposite, Elevator forward; neutralize rudder when rotation stops and recover from the dive — always follow the POH.'),
  q('engine-fail', 'IX', 'Emergency Approach and Landing', 'PA.IX.B.K1',
    'Your engine quits at 3,000 AGL in the {aircraft}. Walk me through your actions.',
    [['best glide', 'glide'], ['field', 'landing site', 'spot'], ['checklist', 'restart', 'cause'], ['mayday', '7700', '121.5', 'declare'], ['secure', 'fuel off', 'mixture', 'master']],
    'Aviate first: pitch for best glide, pick a field, run the restart checklist (fuel, mixture, mags, carb heat/alternate air as applicable), declare (MAYDAY, 7700), then secure the engine and brief passengers per the POH.'),
  q('fire', 'IX', 'Systems and Equipment Malfunctions', 'PA.IX.C.K1',
    'You smell burning insulation in flight. What is your likely problem and what do you do?',
    [['electrical'], ['master', 'avionics', 'off'], ['checklist', 'poh'], ['vent', 'fresh air', 'cabin heat'], ['land', 'nearest']],
    'Likely an electrical fire: follow the POH checklist — master/avionics off, vents per POH, extinguisher if needed — and land as soon as practical.'),
  q('night-vision', 'XI', 'Night Preparation', 'PA.XI.A.K1',
    'How do you protect and use your night vision on a night flight from {airport}?',
    [['30 minute', 'adapt'], ['red light', 'dim'], ['off-center', 'scan', 'peripheral', 'off center'], ['oxygen', 'hypoxia', '5,000', '5000'], ['bright light', 'flash']],
    'Allow ~30 minutes to dark-adapt, use dim/red lighting, avoid bright lights, scan with off-center viewing, and remember mild hypoxia affects night vision above ~5,000 ft.'),
  q('night-equip', 'XI', 'Night Preparation', 'PA.XI.A.K2',
    'What equipment does the {aircraft} need for VFR night flight?',
    [['position light', 'nav light', 'navigation light'], ['anticollision', 'beacon', 'strobe'], ['landing light', 'for hire'], ['electrical', 'power source'], ['fuse', 'spare']],
    'Day VFR equipment plus position lights, approved anticollision lights, a landing light if for hire, an adequate electrical source, and spare fuses if accessible — 14 CFR 91.205(c). Mnemonic FLAPS.'),
]);

export const areaTitle = (id) => ACS_AREAS.find((a) => a.id === id)?.title || id;
export const questionById = (id) => QUESTIONS.find((x) => x.id === id) || null;

export function personalize(text, { aircraft, airport } = {}) {
  let t = String(text);
  if (!aircraft) t = t.replace(/\bthe \{aircraft\}('s)?/g, (_, s) => `your training airplane${s || ''}`);
  return t.replaceAll('{aircraft}', aircraft || 'your training airplane').replaceAll('{airport}', airport || 'your home airport');
}
