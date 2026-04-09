#!/usr/bin/env node
/**
 * bundle-contract.mjs
 *
 * Bundles the AirLog compiled contract (index.js) with @midnight-ntwrk/compact-runtime
 * into a browser-compatible ESM file using Vite.
 *
 * Vite handles WebAssembly ESM imports (wasm-bindgen --target bundler output)
 * that esbuild cannot process directly.
 *
 * Output: compact/contracts/airlog/src/managed/airlog/contract/index.browser.js
 * Served at: /contract/compiled/airlog/index.browser.js
 */

import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";

const __dir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dir, "..");

const contractDir = path.resolve(
  projectRoot,
  "compact/contracts/airlog/src/managed/airlog/contract"
);

const entryPoint = path.resolve(contractDir, "index.js");
const outDir = contractDir; // served via same /contract/compiled/airlog/ static route
const contractPkgRoot = path.resolve(projectRoot, "compact/contracts/airlog");
const viteBin = path.resolve(contractPkgRoot, "node_modules/.bin/vite");

if (!fs.existsSync(entryPoint)) {
  console.error("[bundle-contract] entry not found:", entryPoint);
  process.exit(1);
}

if (!fs.existsSync(viteBin)) {
  console.error("[bundle-contract] vite not found:", viteBin);
  process.exit(1);
}

// Write vite config inside the contract package (where vite is installed)
const viteConfigPath = path.resolve(contractPkgRoot, "vite.browser-bundle.config.js");
const viteConfig = `
import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    lib: {
      entry: ${JSON.stringify(entryPoint)},
      formats: ['es'],
      fileName: () => 'index.browser.js',
    },
    outDir: ${JSON.stringify(outDir)},
    emptyOutDir: false,
    target: 'es2020',
    minify: false,
  },
  assetsInclude: ['**/*.wasm'],
});
`;

fs.writeFileSync(viteConfigPath, viteConfig);

console.log("[bundle-contract] building contract bundle with Vite...");
console.log("  entry:", entryPoint);
console.log("  output:", path.join(outDir, "index.browser.js"));

const result = spawnSync(
  viteBin,
  ["build", "--config", viteConfigPath],
  {
    cwd: contractPkgRoot,
    stdio: "inherit",
    env: process.env,
  }
);

// Cleanup config
fs.rmSync(viteConfigPath, { force: true });

if (result.status !== 0) {
  console.error("[bundle-contract] Vite build failed");
  process.exit(1);
}

const outFile = path.resolve(outDir, "index.browser.js");
if (fs.existsSync(outFile)) {
  const stat = fs.statSync(outFile);
  console.log(`[bundle-contract] done — ${(stat.size / 1024).toFixed(1)} KB`);
} else {
  console.error("[bundle-contract] output file not found after build");
  process.exit(1);
}
