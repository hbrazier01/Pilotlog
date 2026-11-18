// Feature gate. Everything in this package refuses to run unless PILOTLOG_CFI_MIDNIGHT=1.
// The main app (pilotlog-cli/src/readApi.mjs) never imports this package, so the flag cannot
// change routes, boot behaviour or DDL there; see test/cfi-midnight-flag-off.test.mjs at the repo root.
export const FLAG = 'PILOTLOG_CFI_MIDNIGHT';

export function isEnabled(env = process.env) {
  return env[FLAG] === '1';
}

export function assertEnabled(env = process.env) {
  if (!isEnabled(env)) {
    const err = new Error(`${FLAG} is not set to 1; CFI Midnight signing is disabled (default).`);
    err.code = 'CFI_MIDNIGHT_DISABLED';
    throw err;
  }
}
