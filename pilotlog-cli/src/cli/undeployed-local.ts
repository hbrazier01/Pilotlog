import { loadEntries, saveEntries } from "../store.js";
import { loadProfile, saveProfile } from "../profileStore.js";
import { loadWalletSession, clearWalletSession } from "../walletSession.js";
import { loadMidnameIdentity, saveMidnameIdentity, clearMidnameIdentity } from "../midnameStore.js";
import { validateMidname, resolveMidnameIdentity, printMidnameCard } from "../midnameResolver.js";
import { loadAttestations, saveAttestations } from "../attestationStore.js";
import { loadInstructors, saveInstructors } from "../instructorStore.js";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

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
  console.log("  report [--out <path>]          Pilot report (currency, certs, hours)");
  console.log("  trust-report [--out <path>]    Buyer-facing trust dossier (provenance, compliance, risk)");
  console.log("");
  console.log("  passport                       Pilot identity + trust level + unlock chain");
  console.log("  dashboard                      Pilot journey overview (progression + readiness + guidance)");
  console.log("  journey                        Visual pilot progression timeline");
  console.log("  milestones                     Milestone achievement tracker");
  console.log("  whats-next                     Personalized next-step guidance");
  console.log("  readiness                      Readiness status at a glance");
  console.log("  mentor                         Smart Aviation Mentor — insights, trends, guidance");
  console.log("");
  console.log("  profile get");
  console.log('  profile set --fullName "H B" --email "you@example.com" --phone "555-555-5555" [--phase student_ppl|ppl_complete|instrument_training|instrument_rated|commercial|cfi]');
  console.log("");
  console.log('  medical set --kind Medical --class 3 --issued 2026-01-01 --expires 2028-01-31');
  console.log('  medical set --kind BasicMed --cmec 2026-02-01 --course 2026-02-01');
  console.log("  medical set --kind None");
  console.log("");
  console.log("  proficiency set --flightReview 2026-02-10 --ipc 2026-03-15");
  console.log("");
  console.log('  cert add --type "Private Pilot" [--issued 2025-01-15] [--number "1234567"]');
  console.log("  cert list");
  console.log('  rating add --type "Instrument Rating" [--issued 2025-06-01]');
  console.log("  rating list");
  console.log("");
  console.log('  endorse add --text "Solo endorsement..." --date 2026-03-01');
  console.log("  endorse list");
  console.log("");
  console.log("  midname set --midname pilot.night  Resolve & store Midnames identity");
  console.log("  midname get                        Display stored identity card");
  console.log("  midname clear                      Remove stored identity");
  console.log("");
  console.log("  attest request --flight <id> [--instructor <id>] [--type flight_verified]");
  console.log("  attest list                        List all attestation requests");
  console.log("  attest verify --id <id> [--remarks '...']  Mark attestation as CFI Verified");
  console.log("  attest reject --id <id> [--remarks '...']  Reject attestation request");
  console.log("");
  console.log("  instructor add --name 'John Smith' [--cert 'CFI-12345'] [--midname pilot.cfi]");
  console.log("  instructor list                    List registered instructors");
  console.log("");
  console.log("  wallet status                      Show connected wallet session");
  console.log("  wallet disconnect                  Clear wallet session (safe logout)");
  console.log("  wallet reset                       Force-clear session + all linked data");
}

// -------------------- FLIGHTS --------------------
if (command === "add") {
  // flags already parsed (args.slice(1))
  const walletSession = loadWalletSession();
  const pilotId = walletSession?.address || undefined;

  if (!pilotId) {
    console.warn("Warning: no wallet connected — entry will be marked unverified.");
  }

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

    ...(pilotId ? { pilotId } : { unverified: true }),
  };

  const entries = loadEntries();
  entries.push(entry);
  saveEntries(entries);

  console.log("Flight added:", entry.id);
} else if (command === "list") {
  const entries = loadEntries();
  if (!entries.length) {
    console.log("No flights logged yet.");
  } else {
    console.log(`${"DATE".padEnd(12)}${"FROM".padEnd(6)}${"TO".padEnd(6)}${"TOTAL".padEnd(7)}${"PIC".padEnd(6)}REMARKS`);
    console.log("─".repeat(72));
    for (const e of (entries as any[])) {
      const date = String(e.date || "").slice(0, 10).padEnd(12);
      const from = String(e.from || e.aircraftId || "").padEnd(6);
      const to = String(e.to || "").padEnd(6);
      const total = String(Number(e.total || e.totalTime || 0).toFixed(1)).padEnd(7);
      const pic = String(Number(e.pic || 0).toFixed(1)).padEnd(6);
      const remarks = String(e.remarks || "").slice(0, 40);
      console.log(`${date}${from}${to}${total}${pic}${remarks}`);
    }
    console.log(`\n${entries.length} flight(s) total.`);
  }
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

    if (flags["phase"] !== undefined) {
      const validPhases = ["student_ppl", "ppl_complete", "instrument_training", "instrument_rated", "commercial", "cfi"];
      if (!validPhases.includes(flags["phase"])) {
        console.error(`profile set: --phase must be one of: ${validPhases.join(" | ")}`);
        process.exit(1);
      }
      profile.pilotPhase = flags["phase"] as any;
    }

    saveProfile(profile);
    console.log("Profile updated.");
    console.log({ ...profile.pilot, pilotPhase: profile.pilotPhase });
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

// -------------------- CERTIFICATES --------------------
else if (command === "cert") {
  const profile = loadProfile();

  if (sub === "add") {
    const type = str("type", "");
    if (!type.trim()) {
      console.error('cert add: required --type "..."');
      process.exit(1);
    }
    const issued = str("issued", "") || undefined;
    const number = str("number", "") || undefined;
    profile.certificates.push({ type, ...(issued ? { issued } : {}), ...(number ? { number } : {}) });
    saveProfile(profile);
    console.log("Certificate added:", type);
  } else if (sub === "list" || !sub) {
    if (!profile.certificates.length) {
      console.log("No certificates on file.");
    } else {
      for (const c of profile.certificates) {
        console.log(`  ${c.type}${c.number ? ` [#${c.number}]` : ""}${c.issued ? ` — issued ${c.issued}` : ""}`);
      }
    }
  } else {
    usage();
  }
}

// -------------------- RATINGS --------------------
else if (command === "rating") {
  const profile = loadProfile();

  if (sub === "add") {
    const type = str("type", "");
    if (!type.trim()) {
      console.error('rating add: required --type "..."');
      process.exit(1);
    }
    const issued = str("issued", "") || undefined;
    profile.ratings.push({ type, ...(issued ? { issued } : {}) });
    saveProfile(profile);
    console.log("Rating added:", type);
  } else if (sub === "list" || !sub) {
    if (!profile.ratings.length) {
      console.log("No ratings on file.");
    } else {
      for (const r of profile.ratings) {
        console.log(`  ${r.type}${r.issued ? ` — issued ${r.issued}` : ""}`);
      }
    }
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

// -------------------- REPORT --------------------
else if (command === "report") {
  // Resolve script path relative to this file's location (works whether run from source or dist)
  const thisFile = fileURLToPath(import.meta.url);
  const pkgRoot = path.resolve(path.dirname(thisFile), "../../..");
  const scriptPath = path.join(pkgRoot, "scripts", "generate-pilot-report.mjs");
  const dataDir = process.env.PILOTLOG_HOME || process.env.PILOTLOG_DIR || path.resolve(process.cwd(), "data");

  const extraArgs: string[] = [];
  if (flags["out"]) extraArgs.push("--out", flags["out"]);

  const res = spawnSync(process.execPath, [scriptPath, ...extraArgs], {
    stdio: "inherit",
    env: { ...process.env, PILOTLOG_HOME: dataDir },
  });

  process.exit(res.status ?? 1);
}

// -------------------- TRUST REPORT --------------------
else if (command === "trust-report") {
  const thisFile = fileURLToPath(import.meta.url);
  const pkgRoot = path.resolve(path.dirname(thisFile), "../../..");
  const scriptPath = path.join(pkgRoot, "scripts", "generate-trust-report.mjs");
  const dataDir = process.env.PILOTLOG_HOME || process.env.PILOTLOG_DIR || path.resolve(process.cwd(), "data");

  const extraArgs: string[] = [];
  if (flags["out"]) extraArgs.push("--out", flags["out"]);

  const res = spawnSync(process.execPath, [scriptPath, ...extraArgs], {
    stdio: "inherit",
    env: { ...process.env, PILOTLOG_HOME: dataDir },
  });

  process.exit(res.status ?? 1);
}

// -------------------- JOURNEY / DASHBOARD --------------------
else if (command === "passport" || command === "dashboard" || command === "journey" || command === "milestones" || command === "whats-next" || command === "readiness" || command === "mentor") {
  const thisFile = fileURLToPath(import.meta.url);
  const pkgRoot = path.resolve(path.dirname(thisFile), "../../..");
  const scriptPath = path.join(pkgRoot, "scripts", "pilot-journey.mjs");
  const dataDir = process.env.PILOTLOG_HOME || process.env.PILOTLOG_DIR || path.resolve(process.cwd(), "data");

  const viewMap: Record<string, string> = {
    passport:    "passport",
    dashboard:   "dashboard",
    journey:     "timeline",
    milestones:  "milestones",
    "whats-next": "whats-next",
    readiness:   "readiness",
    mentor:      "mentor",
  };

  const res = spawnSync(process.execPath, [scriptPath, viewMap[command] || "dashboard"], {
    stdio: "inherit",
    env: { ...process.env, PILOTLOG_HOME: dataDir },
  });

  process.exit(res.status ?? 1);
}

// -------------------- MIDNAMES IDENTITY --------------------
else if (command === "midname") {
  if (sub === "set") {
    const midname = str("midname", "");
    if (!midname.trim()) {
      console.error('midname set: required --midname "pilot.night"');
      process.exit(1);
    }

    const validationError = validateMidname(midname);
    if (validationError) {
      console.error(`midname set: invalid domain — ${validationError}`);
      process.exit(1);
    }

    const walletSession = loadWalletSession();
    const walletAddress = walletSession?.address ?? null;
    const coinPublicKey = walletSession?.coinPublicKey ?? null;

    if (!walletSession) {
      console.warn("No wallet session found. Connect/create wallet first.");
      console.warn("Midname will be resolved but cannot be verified against your wallet.");
    }

    console.log(`Resolving ${midname} on preprod...`);
    const result = await resolveMidnameIdentity(midname, walletAddress, coinPublicKey);

    if ("error" in result) {
      console.error(`midname set: resolution failed — ${result.error}`);
      process.exit(1);
    }

    saveMidnameIdentity(result);
    console.log("Midnames identity stored.");
    printMidnameCard(result);
  } else if (!sub || sub === "get") {
    const identity = loadMidnameIdentity();
    if (!identity) {
      console.log("No Midnames identity on file. Use: midname set --midname pilot.night");
    } else {
      printMidnameCard(identity);
    }
  } else if (sub === "clear") {
    clearMidnameIdentity();
    console.log("Midnames identity cleared.");
  } else {
    usage();
  }
}

// -------------------- INSTRUCTOR VERIFICATION --------------------
else if (command === "attest") {
  const attestations = loadAttestations();
  const entries = loadEntries();
  const instructors = loadInstructors();
  const walletSession = loadWalletSession();
  const pilotId = walletSession?.address || "unknown";

  if (sub === "request") {
    const flightId = str("flight", "");
    if (!flightId.trim()) {
      console.error('attest request: required --flight <entry-id>');
      process.exit(1);
    }

    const flight = (entries as any[]).find((e: any) => e.id === flightId || e.id.startsWith(flightId));
    if (!flight) {
      console.error(`attest request: flight "${flightId}" not found. Use "pilotlog list" to see entry IDs.`);
      process.exit(1);
    }

    const instructorId = str("instructor", instructors[0]?.id || "");
    const type = (str("type", "flight_verified") as any);

    const attestation = {
      id: randomUUID(),
      type,
      pilotId,
      instructorId,
      flightId: flight.id,
      createdAt: new Date().toISOString(),
      status: "pending" as const,
    };

    attestations.push(attestation);
    saveAttestations(attestations);

    console.log(`CFI Review requested for flight: ${flight.from || "?"} → ${flight.to || "?"} on ${String(flight.date).slice(0, 10)}`);
    console.log(`Attestation ID: ${attestation.id}`);
    console.log(`Status: Pending Instructor Review`);

  } else if (sub === "list" || !sub) {
    if (!attestations.length) {
      console.log("No attestation requests on file. Use: pilotlog attest request --flight <id>");
    } else {
      console.log(`${"ID".slice(0, 8).padEnd(10)}${"TYPE".padEnd(22)}${"STATUS".padEnd(20)}FLIGHT`);
      console.log("─".repeat(72));
      for (const a of (attestations as any[])) {
        const shortId = String(a.id).slice(0, 8);
        const type = String(a.type).padEnd(22);
        const status = String(a.status).padEnd(20);
        const flight = (entries as any[]).find((e: any) => e.id === a.flightId);
        const flightLabel = flight
          ? `${flight.from || "?"}→${flight.to || "?"} ${String(flight.date).slice(0, 10)}`
          : a.flightId?.slice(0, 16) || "unknown";
        console.log(`${shortId}  ${type}${status}${flightLabel}`);
      }
      const pending  = attestations.filter((a: any) => a.status === "pending").length;
      const verified = attestations.filter((a: any) => a.status === "verified").length;
      console.log(`\n${attestations.length} total  |  ${pending} pending  |  ${verified} CFI Verified`);
    }

  } else if (sub === "verify") {
    const id = str("id", "");
    if (!id.trim()) {
      console.error('attest verify: required --id <attestation-id>');
      process.exit(1);
    }
    const idx = attestations.findIndex((a: any) => a.id === id || a.id.startsWith(id));
    if (idx === -1) {
      console.error(`attest verify: attestation "${id}" not found.`);
      process.exit(1);
    }
    const remarks = str("remarks", "");
    (attestations as any[])[idx].status = "verified";
    (attestations as any[])[idx].verifiedAt = new Date().toISOString();
    if (remarks) (attestations as any[])[idx].remarks = remarks;

    // Increment instructor verification count
    const instructorId = (attestations as any[])[idx].instructorId;
    const instrIdx = instructors.findIndex((i: any) => i.id === instructorId);
    if (instrIdx !== -1) {
      (instructors as any[])[instrIdx].verificationCount = ((instructors as any[])[instrIdx].verificationCount || 0) + 1;
      saveInstructors(instructors);
    }

    saveAttestations(attestations);
    console.log(`Flight Verified — attestation ${id.slice(0, 8)} marked as CFI Verified.`);
    if (remarks) console.log(`Remarks: ${remarks}`);

  } else if (sub === "reject") {
    const id = str("id", "");
    if (!id.trim()) {
      console.error('attest reject: required --id <attestation-id>');
      process.exit(1);
    }
    const idx = attestations.findIndex((a: any) => a.id === id || a.id.startsWith(id));
    if (idx === -1) {
      console.error(`attest reject: attestation "${id}" not found.`);
      process.exit(1);
    }
    const remarks = str("remarks", "");
    (attestations as any[])[idx].status = "rejected";
    if (remarks) (attestations as any[])[idx].remarks = remarks;
    saveAttestations(attestations);
    console.log(`Attestation ${id.slice(0, 8)} rejected.`);

  } else {
    usage();
  }
}

// -------------------- INSTRUCTOR MANAGEMENT --------------------
else if (command === "instructor") {
  const instructors = loadInstructors();

  if (sub === "add") {
    const name = str("name", "");
    if (!name.trim()) {
      console.error('instructor add: required --name "..."');
      process.exit(1);
    }
    const certNumber = str("cert", "") || undefined;
    const midname    = str("midname", "") || undefined;

    const instructor = {
      id: randomUUID(),
      name,
      ...(certNumber ? { certNumber } : {}),
      ...(midname ? { midname } : {}),
      verificationCount: 0,
      reputationScore: 0,
      addedAt: new Date().toISOString(),
    };

    instructors.push(instructor);
    saveInstructors(instructors);
    console.log(`Instructor added: ${name} (${instructor.id.slice(0, 8)})`);
    if (certNumber) console.log(`Certificate: ${certNumber}`);

  } else if (sub === "list" || !sub) {
    if (!instructors.length) {
      console.log('No instructors on file. Use: pilotlog instructor add --name "John Smith"');
    } else {
      console.log(`${"NAME".padEnd(24)}${"CERT".padEnd(16)}${"VERIFICATIONS".padEnd(16)}ID`);
      console.log("─".repeat(72));
      for (const i of (instructors as any[])) {
        const name = String(i.name).padEnd(24);
        const cert = String(i.certNumber || "—").padEnd(16);
        const count = String(i.verificationCount || 0).padEnd(16);
        const id = String(i.id).slice(0, 8);
        console.log(`${name}${cert}${count}${id}`);
      }
    }

  } else {
    usage();
  }
}

// -------------------- WALLET --------------------
else if (command === "wallet") {
  if (!sub || sub === "status") {
    const session = loadWalletSession();
    if (!session) {
      console.log("No wallet connected.");
      console.log("Connect via: npm run wallet:connect");
    } else {
      console.log("Wallet session active:");
      console.log(`  Address:       ${session.address}`);
      console.log(`  CoinPublicKey: ${session.coinPublicKey.slice(0, 20)}…`);
      console.log(`  Connected at:  ${session.connectedAt}`);
      console.log("");
      console.log("  To disconnect: pilotlog wallet disconnect");
      console.log("  To reset:      pilotlog wallet reset");
    }
  } else if (sub === "disconnect") {
    const session = loadWalletSession();
    if (!session) {
      console.log("No wallet session to disconnect.");
    } else {
      clearWalletSession();
      console.log("Wallet disconnected.");
      console.log(`  Cleared session for: ${session.address}`);
      console.log("  Flight entries are preserved. Reconnect with: npm run wallet:connect");
    }
  } else if (sub === "reset") {
    const session = loadWalletSession();
    clearWalletSession();
    if (session) {
      console.log("Wallet session cleared (force reset).");
      console.log(`  Address was: ${session.address}`);
    } else {
      console.log("No session was active. State reset complete.");
    }
    console.log("  WARNING: New wallet connections will create a fresh pilot identity.");
    console.log("  Existing flight entries remain but will be unlinked from prior wallet.");
  } else {
    console.error(`wallet: unknown subcommand "${sub}"`);
    console.error("  Usage: pilotlog wallet [status|disconnect|reset]");
    process.exit(1);
  }
}

else {
  usage();
}
