import { loadEntries, saveEntries } from "../store.js";
import { randomUUID } from "node:crypto";

const args = process.argv.slice(2);
const command = args[0];

if (command === "add") {
  // Simple flag parser: --key value
  const flags: Record<string, string> = {};
  for (let i = 1; i < args.length; i++) {
    const a = args[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const val =
        args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : "true";
      flags[key] = val;
      if (val !== "true") i++;
    }
  }

  const num = (k: string, d = 0) =>
    flags[k] !== undefined ? Number(flags[k]) : d;
  const str = (k: string, d = "") =>
    flags[k] !== undefined ? String(flags[k]) : d;

  const entry = {
    id: randomUUID(),
    date: str("date", new Date().toISOString()),

    aircraftType: str("aircraftType", "SR20"),
    aircraftIdent: str("aircraftIdent", "N123AB"),

    from: str("from", "KAPA"),
    to: str("to", "KAPA"),

    total: num("total", 1.5),
    pic: num("pic", 1.5),
    dual: num("dual", 0),
    xc: num("xc", 0),
    night: num("night", 0),

    actualInstrument: num("actualInstrument", 0),
    simulatedInstrument: num("simulatedInstrument", 0),

    // IFR currency fields
    approaches: num("approaches", 0),
    holds: num("holds", 0),
    intercepts: num("intercepts", 0),

    dayLandings: num("dayLandings", 3),
    nightLandings: num("nightLandings", 0),

    remarks: str("remarks", "Local pattern work"),
  };

  const entries = loadEntries();
  entries.push(entry);
  saveEntries(entries);

  console.log("Flight added:", entry.id);
} else if (command === "list") {
  const entries = loadEntries();
  console.log(entries);
} else if (command === "totals") {
  const entries = loadEntries();

  const totals = entries.reduce(
    (acc, e) => {
      acc.total += e.total || 0;
      acc.pic += e.pic || 0;
      acc.dual += e.dual || 0;
      acc.xc += e.xc || 0;
      acc.night += e.night || 0;
      acc.actualInstrument += e.actualInstrument || 0;
      acc.simulatedInstrument += e.simulatedInstrument || 0;

      acc.approaches += e.approaches || 0;
      acc.holds += e.holds || 0;
      acc.intercepts += e.intercepts || 0;

      acc.dayLandings += e.dayLandings || 0;
      acc.nightLandings += e.nightLandings || 0;
      return acc;
    },
    {
      total: 0,
      pic: 0,
      dual: 0,
      xc: 0,
      night: 0,
      actualInstrument: 0,
      simulatedInstrument: 0,

      approaches: 0,
      holds: 0,
      intercepts: 0,

      dayLandings: 0,
      nightLandings: 0,
    }
  );

  console.log("TOTALS");
  console.log(JSON.stringify(totals, null, 2));
} else {
  console.log("pilotlog commands:");
  console.log(
    '  add --from KAPA --to KADS --total 1.3 --pic 1.3 --remarks "XC hop"'
  );
  console.log(
    '      --approaches 2 --holds 1 --intercepts 1 --simulatedInstrument 1.0'
  );
  console.log("  list");
  console.log("  totals");
}
