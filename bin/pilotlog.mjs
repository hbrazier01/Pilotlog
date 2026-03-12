#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const invokedAs = process.argv[1]; // may be a symlink in ~/.nvm/.../bin
const realInvokedAs = fs.realpathSync(invokedAs); // resolves to .../lib/node_modules/pilotlog/bin/pilotlog.mjs
const binDir = path.dirname(realInvokedAs);
const pkgRoot = path.resolve(binDir, ".."); // bin/ -> package root

// Your compiled CLI entry
const cliPath = path.join(
  pkgRoot,
  "pilotlog-cli",
  "dist",
  "cli",
  "undeployed-local.js"
);

if (!fs.existsSync(cliPath)) {
  console.error(`pilotlog: CLI not built yet.\nMissing: ${cliPath}`);
  console.error(`Run:\n  npm run build:cli\n(or npx tsc -p pilotlog-cli/tsconfig.build.json)`);
  process.exit(1);
}

const args = process.argv.slice(2);
const res = spawnSync(process.execPath, [cliPath, ...args], {
  stdio: "inherit",
  env: process.env,
});

process.exit(res.status ?? 1);
