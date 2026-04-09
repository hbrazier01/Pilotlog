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
 * Output: compact/contracts/airlog/src/managed/airlog/contract/index.js
 * Served at: /contract/compiled/airlog/index.js
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
import wasm from 'vite-plugin-wasm';

export default defineConfig({
  plugins: [wasm()],
  build: {
    lib: {
      entry: ${JSON.stringify(entryPoint)},
      formats: ['es'],
      fileName: () => 'index.js',
    },
    outDir: ${JSON.stringify(outDir)},
    emptyOutDir: false,
    target: 'esnext',
    minify: false,
    rollupOptions: {
      // Disable tree-shaking so Compact/wasm-bindgen init side-effects are preserved.
      // Without this, Vite eliminates required init functions and leaves broken (void 0)() call sites.
      treeshake: false,
    },
  },
});
`;

fs.writeFileSync(viteConfigPath, viteConfig);

console.log("[bundle-contract] building contract bundle with Vite...");
console.log("  entry:", entryPoint);
console.log("  output:", path.join(outDir, "index.js"));

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

const outFile = path.resolve(outDir, "index.js");
if (fs.existsSync(outFile)) {
  // Post-process: remove Vite tree-shaking artifact `(void 0)();`
  // This occurs when Vite eliminates an init function but leaves the call site behind,
  // resulting in a runtime TypeError. The call is safe to remove — it was a no-op init.
  let bundled = fs.readFileSync(outFile, "utf8");
  const before = (bundled.match(/\(void 0\)\(\);/g) || []).length;
  if (before > 0) {
    bundled = bundled.replace(/\(void 0\)\(\);\n?/g, "");
    fs.writeFileSync(outFile, bundled);
    console.log(`[bundle-contract] stripped ${before} (void 0)() artifact(s)`);
  }

  const stat = fs.statSync(outFile);
  console.log(`[bundle-contract] done — ${(stat.size / 1024).toFixed(1)} KB`);
} else {
  console.error("[bundle-contract] output file not found after build");
  process.exit(1);
}
