/**
 * flag.mjs — feature flag for accounts v2 (students + identities).
 * Default OFF. Only the exact strings "true" or "1" enable it, so runtime behaviour on main
 * is unchanged unless an operator opts in.
 */
export function accountsV2Enabled(env = process.env) {
  const v = String(env.PILOTLOG_ACCOUNTS_V2 ?? "").trim().toLowerCase();
  return v === "true" || v === "1";
}
