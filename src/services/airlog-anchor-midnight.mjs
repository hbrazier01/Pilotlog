/**
 * airlog-anchor-midnight.mjs
 *
 * Real Midnight network anchor for AirLog reports.
 * Spawns anchorEntry.mjs in the midnight-kitties repo as a child process.
 *
 * Returns: { anchored, anchorId, anchoredAt, network, hash }
 * On failure returns: { anchored: false, pending: true }
 */

import { spawn } from "node:child_process";
import path from "node:path";

const ANCHOR_SCRIPT = path.resolve(
  "/Users/admin1/midnight-local-dev/anchorEntry.mjs"
);

const KITTIES_CWD = "/Users/admin1/midnight-local-dev";

const ANCHOR_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Submit a real Midnight anchor transaction for the given report hash.
 *
 * @param {object} opts
 * @param {string} opts.anchorHash  - 64-char hex SHA-256 of the report
 * @param {string} opts.airframeId  - 64-char hex airframe ID
 * @param {number} [opts.hours]     - total flight hours (for tach entry)
 * @returns {Promise<{anchored:boolean, anchorId?:string, anchoredAt?:string, network?:string, hash?:string, pending?:boolean, error?:string}>}
 */
export async function anchorOnMidnight({ anchorHash, airframeId, hours = 0 }) {
  return new Promise((resolve) => {
    let stdout = "";
    let timedOut = false;

    const env = {
      ...process.env,
      ANCHOR_HASH: anchorHash,
      AIRFRAME_ID: airframeId,
      ANCHOR_HOURS: String(hours),
    };

    const child = spawn("node", [ANCHOR_SCRIPT], {
      cwd: KITTIES_CWD,
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
      resolve({ anchored: false, pending: true, error: "anchor timed out" });
    }, ANCHOR_TIMEOUT_MS);

    child.stdout.on("data", (d) => {
      stdout += d.toString();
    });

    child.stderr.on("data", (d) => {
      // Log stderr to server logs for debugging
      process.stderr.write("[midnight-anchor] " + d.toString());
    });

    child.on("close", (code) => {
      clearTimeout(timer);
      if (timedOut) return;

      try {
        const line = stdout.trim().split("\n").pop();
        const result = JSON.parse(line);
        resolve(result);
      } catch {
        resolve({
          anchored: false,
          pending: true,
          error: `anchor process exited ${code}, stdout: ${stdout.slice(0, 200)}`,
        });
      }
    });

    child.on("error", (err) => {
      clearTimeout(timer);
      if (timedOut) return;
      resolve({ anchored: false, pending: true, error: err.message });
    });
  });
}
