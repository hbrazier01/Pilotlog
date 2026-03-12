import { loadEntries, saveEntries } from "../store.js";
import { loadProfile, saveProfile } from "../profileStore.js";
import { randomUUID } from "node:crypto";

const args = process.argv.slice(2);

// Simple flag parser: --key value  (and supports --flag true)
function parseFlags(argv: string[]) {
  const flags: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const val = argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : "true";
      flags[key] = val;
      if (val !== "true") i++;
    }
  }
  return flags;
}

const command = args[0];
const sub = args[1];

const flags = parseFlags(args.slice(1)); // parse everything after command

const num = (k: string, d = 0) => (flags[k] !== undefined ? Number(flags[k]) : d);
const str = (k: string, d = "") => (flags[k] !== undefined ? String(flags[k]) : d);

function usage() {
  console.log("pilotlog commands:");
  console.log('  add --from KAPA --to KADS --total 1.3 --pic 1.3 --remarks "XC hop"');
  console.log("  list");
  console.log("  totals");
  console.log("");
  console.log("  profile get");
  console.log('  profile set --fullName "H B" --email "you@example.com" --phone "555-555-5555"');
  console.log("");
  console.log('  medical set --kind Medical --class 3 --issued 2026-01-01 --expires 2028-01-31');
  console.log('  medical set --kind BasicMed --cmec 2026-02-01 --course 2026-02-01');
  console.log("  medical set --kind None");
  console.log("");
  console.log("  proficiency set --flightReview 2026-02-10 --ipc 2026-03-15");
  console.log("");
  console.log('  endorse add --text "Solo endorsement..." --date 2026-03-01');
  console.log("  endorse list");
}

// -------------------- FLIGHTS --------------------
if (command === "add") {
  // flags already parsed (args.slice(1))
  const entry = {
    id: randomUUID(),
    date: str("date", new Date().toISOString()),

    aircraftType: str("aircraftType", "SR20"),
    aircraftIdent: str("aircraftIdent", "N123AB"),

    from: str("from", "KAPA"),
    to: str("to", "KAPA"),

    total: num("total", 1.0),
    pic: num("pic", 1.0),
    dual: num("dual", 0),
    xc: num("xc", 0),
    night: num("night", 0),
    actualInstrument: num("actualInstrument", 0),
    simulatedInstrument: num("simulatedInstrument", 0),

    approaches: num("approaches", 0),
    holds: num("holds", 0),
    intercepts: num("intercepts", 0),

    dayLandings: num("dayLandings", 0),
    nightLandings: num("nightLandings", 0),

    remarks: str("remarks", ""),
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
    (acc, e: any) => {
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
}

// -------------------- PROFILE --------------------
else if (command === "profile") {
  const profile = loadProfile();

  if (sub === "get" || !sub) {
    console.log(profile);
  } else if (sub === "set") {
    const fullName = str("fullName", profile.pilot.fullName || "");
    const email = str("email", profile.pilot.email || "");
    const phone = str("phone", profile.pilot.phone || "");

    profile.pilot.fullName = fullName;
    profile.pilot.email = email;
    profile.pilot.phone = phone;

    saveProfile(profile);
    console.log("Profile updated.");
    console.log(profile.pilot);
  } else {
    usage();
  }
}

// -------------------- MEDICAL / BASICMED --------------------
else if (command === "medical") {
  const profile = loadProfile();

  if (sub === "set") {
    const kind = str("kind", profile.medical.kind) as any;

    if (kind !== "None" && kind !== "Medical" && kind !== "BasicMed") {
      console.error('medical set: --kind must be one of: None | Medical | BasicMed');
      process.exit(1);
    }

    profile.medical.kind = kind;

    // Reset fields when switching kinds (keep it simple/clean)
    if (kind === "None") {
      profile.medical.class = null;
      profile.medical.issued = null;
      profile.medical.expires = null;
      profile.medical.basicMed.cmecDate = null;
      profile.medical.basicMed.onlineCourseDate = null;
    }

    if (kind === "Medical") {
      const clsRaw = flags["class"];
      if (clsRaw !== undefined) {
        if (clsRaw !== "1" && clsRaw !== "2" && clsRaw !== "3") {
          console.error("medical set: --class must be 1, 2, or 3");
          process.exit(1);
        }
        profile.medical.class = clsRaw as any;
      }
      if (flags["issued"] !== undefined) profile.medical.issued = String(flags["issued"]);
      if (flags["expires"] !== undefined) profile.medical.expires = String(flags["expires"]);
      // Clear BasicMed fields
      profile.medical.basicMed.cmecDate = null;
      profile.medical.basicMed.onlineCourseDate = null;
    }

    if (kind === "BasicMed") {
      if (flags["cmec"] !== undefined) profile.medical.basicMed.cmecDate = String(flags["cmec"]);
      if (flags["course"] !== undefined) profile.medical.basicMed.onlineCourseDate = String(flags["course"]);
      // Clear Medical fields
      profile.medical.class = null;
      profile.medical.issued = null;
      profile.medical.expires = null;
    }

    saveProfile(profile);
    console.log("Medical updated.");
    console.log(profile.medical);
  } else {
    usage();
  }
}

// -------------------- PROFICIENCY --------------------
else if (command === "proficiency") {
  const profile = loadProfile();

  if (sub === "set") {
    if (flags["flightReview"] !== undefined) profile.proficiency.flightReviewDate = String(flags["flightReview"]);
    if (flags["ipc"] !== undefined) profile.proficiency.ipcDate = String(flags["ipc"]);

    saveProfile(profile);
    console.log("Proficiency updated.");
    console.log(profile.proficiency);
  } else {
    usage();
  }
}

// -------------------- ENDORSEMENTS --------------------
else if (command === "endorse") {
  const profile = loadProfile();

  if (sub === "add") {
    const text = str("text", "");
    if (!text.trim()) {
      console.error('endorse add: required --text "..."');
      process.exit(1);
    }
    const date = str("date", new Date().toISOString().slice(0, 10)); // YYYY-MM-DD

    profile.endorsements.push({ date, text });
    saveProfile(profile);

    console.log("Endorsement added.");
  } else if (sub === "list" || !sub) {
    console.log(profile.endorsements);
  } else {
    usage();
  }
}

else {
  usage();
}
