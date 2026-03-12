export function canonicalizeRecords(aircraft, entries) {
  const normalizedAircraft = {
    ident: String(aircraft.ident || "").trim().toUpperCase(),
    type: String(aircraft.type || "").trim().toUpperCase(),
  };

  const normalizedEntries = [...entries]
    .map((e) => ({
      id: String(e.id || "").trim(),
      date: String(e.date || "").trim(),
      aircraftType: String(e.aircraftType || "").trim().toUpperCase(),
      aircraftIdent: String(e.aircraftIdent || "").trim().toUpperCase(),
      from: String(e.from || "").trim().toUpperCase(),
      to: String(e.to || "").trim().toUpperCase(),
      total: Number(e.total || 0),
      pic: Number(e.pic || 0),
      dual: Number(e.dual || 0),
      xc: Number(e.xc || 0),
      night: Number(e.night || 0),
      actualInstrument: Number(e.actualInstrument || 0),
      simulatedInstrument: Number(e.simulatedInstrument || 0),
      approaches: Number(e.approaches || 0),
      holds: Number(e.holds || 0),
      intercepts: Number(e.intercepts || 0),
      dayLandings: Number(e.dayLandings || 0),
      nightLandings: Number(e.nightLandings || 0),
      remarks: String(e.remarks || "").trim(),
    }))
    .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));

  return JSON.stringify({
    aircraft: normalizedAircraft,
    entries: normalizedEntries,
  });
}
