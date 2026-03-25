/**
 * build-trust-report.mjs
 * Compiles aircraft provenance, maintenance chronology, and risk indicators
 * into a buyer-facing trust dossier.
 */

const RISK_WEIGHTS = {
  overdueItem: 25,
  hashMismatch: 30,
  maintenanceGapOver365: 15,
  missingAnnualRecord: 20,
  noReturnToService: 10,
  unanchoredRecords: 10,
};

function daysBetween(a, b) {
  return Math.round((new Date(b) - new Date(a)) / 86400000);
}

function daysUntil(dateStr) {
  if (!dateStr) return null;
  const d = new Date(String(dateStr).slice(0, 10));
  if (isNaN(d)) return null;
  return Math.round((d - Date.now()) / 86400000);
}

function complianceStatus(days) {
  if (days === null) return { status: "unknown", color: "gray" };
  if (days < 0) return { status: "overdue", color: "red" };
  if (days <= 30) return { status: "due_soon", color: "red" };
  if (days <= 90) return { status: "upcoming", color: "yellow" };
  return { status: "current", color: "green" };
}

export function buildTrustReport({ aircraft, entries, maintenance, verification }) {
  const now = new Date().toISOString();
  const primaryAircraft = aircraft[0] || null;

  // ── Provenance ──────────────────────────────────────────────────────────────
  const provenance = primaryAircraft
    ? {
        ident: primaryAircraft.ident,
        type: primaryAircraft.type,
        serialNumber: primaryAircraft.serialNumber || null,
        manufactureYear: primaryAircraft.manufactureYear || null,
        registrationDate: primaryAircraft.registrationDate || null,
        totalTimeInService: primaryAircraft.totalTimeInService || null,
        engineType: primaryAircraft.engineType || null,
        engineSerial: primaryAircraft.engineSerial || null,
        propType: primaryAircraft.propType || null,
        propSerial: primaryAircraft.propSerial || null,
      }
    : null;

  // ── Maintenance Chronology ───────────────────────────────────────────────────
  const sorted = [...maintenance].sort(
    (a, b) => new Date(a.date) - new Date(b.date)
  );

  const chronology = sorted.map((m, i) => {
    const prev = sorted[i - 1];
    const gapDays = prev ? daysBetween(prev.date, m.date) : null;
    return {
      id: m.id,
      date: String(m.date).slice(0, 10),
      category: m.category,
      description: m.description,
      performedBy: m.performedBy || null,
      mechanic: m.mechanic || null,
      totalAirframeHours: m.totalAirframeHours || null,
      returnToService: m.returnToService || false,
      documents: m.documents || [],
      gapDaysFromPrevious: gapDays,
    };
  });

  // ── Compliance Calendar ──────────────────────────────────────────────────────
  const complianceCalendar = [];
  if (primaryAircraft) {
    const items = [
      { label: "Annual Inspection", dateKey: "annualDue" },
      { label: "Transponder Check", dateKey: "transponderDue" },
      { label: "Pitot-Static Check", dateKey: "pitotStaticDue" },
      { label: "ELT Battery", dateKey: "eltBatteryDue" },
    ];
    for (const item of items) {
      const dateStr = primaryAircraft[item.dateKey] || null;
      const days = daysUntil(dateStr);
      const cs = complianceStatus(days);
      complianceCalendar.push({
        label: item.label,
        dueDate: dateStr,
        daysUntilDue: days,
        status: cs.status,
        color: cs.color,
      });
    }
  }

  // ── Risk Indicators ──────────────────────────────────────────────────────────
  const riskFlags = [];
  let riskScore = 0;

  // Overdue compliance items
  const overdueItems = complianceCalendar.filter((c) => c.status === "overdue");
  for (const item of overdueItems) {
    riskFlags.push({
      severity: "high",
      code: "OVERDUE_COMPLIANCE",
      detail: `${item.label} is overdue (${item.dueDate})`,
    });
    riskScore += RISK_WEIGHTS.overdueItem;
  }

  // Hash integrity mismatch
  const currentHash = verification?.currentHash || null;
  const anchorHash = verification?.anchorHash || null;
  const anchored = verification?.anchored || false;
  if (anchored && anchorHash && currentHash && anchorHash !== currentHash) {
    riskFlags.push({
      severity: "critical",
      code: "HASH_MISMATCH",
      detail: "Current record hash does not match the anchored hash — records may have been modified after anchoring.",
    });
    riskScore += RISK_WEIGHTS.hashMismatch;
  }

  // Maintenance gaps > 365 days
  for (const event of chronology) {
    if (event.gapDaysFromPrevious !== null && event.gapDaysFromPrevious > 365) {
      riskFlags.push({
        severity: "medium",
        code: "MAINTENANCE_GAP",
        detail: `Gap of ${event.gapDaysFromPrevious} days before ${event.date} (${event.category})`,
      });
      riskScore += RISK_WEIGHTS.maintenanceGapOver365;
    }
  }

  // No annual inspection in maintenance records
  const hasAnnual = maintenance.some((m) => m.category === "annual-inspection");
  if (!hasAnnual && maintenance.length > 0) {
    riskFlags.push({
      severity: "medium",
      code: "NO_ANNUAL_RECORD",
      detail: "No annual inspection found in maintenance records.",
    });
    riskScore += RISK_WEIGHTS.missingAnnualRecord;
  }

  // Any maintenance without return-to-service
  const noRts = maintenance.filter(
    (m) => m.returnToService === false && m.category !== "inspection-discrepancy"
  );
  if (noRts.length > 0) {
    riskFlags.push({
      severity: "low",
      code: "NO_RETURN_TO_SERVICE",
      detail: `${noRts.length} maintenance record(s) missing return-to-service sign-off.`,
    });
    riskScore += RISK_WEIGHTS.noReturnToService;
  }

  // Unanchored records
  if (!anchored) {
    riskFlags.push({
      severity: "low",
      code: "UNANCHORED_RECORDS",
      detail: "Records have not been anchored to a blockchain network. Integrity is not independently verifiable.",
    });
    riskScore += RISK_WEIGHTS.unanchoredRecords;
  }

  const riskLevel =
    riskScore >= 50 ? "high" : riskScore >= 20 ? "medium" : "low";

  // ── Trust Score (0–100) ──────────────────────────────────────────────────────
  const trustScore = Math.max(0, 100 - riskScore);

  // ── Summary ──────────────────────────────────────────────────────────────────
  return {
    generated: now,
    reportType: "airlog-trust-report",
    trustScore,
    riskLevel,
    riskFlags,
    provenance,
    complianceCalendar,
    maintenanceChronology: chronology,
    integrityVerification: {
      anchored,
      anchorHash,
      anchorTime: verification?.anchorTime || null,
      anchorNetwork: verification?.anchorNetwork || null,
      currentHash,
      hashMatch: anchored && anchorHash && currentHash ? anchorHash === currentHash : null,
    },
    logbookSnapshot: {
      totalEntries: entries.length,
      totalHours: entries.reduce((s, e) => s + Number(e.total || 0), 0),
    },
  };
}
