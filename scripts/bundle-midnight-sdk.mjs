#!/usr/bin/env node
/**
 * bundle-midnight-sdk.mjs
 *
 * Bundles the browser-side Midnight SDK utilities into a single ESM file.
 * Uses Vite (same as bundle-contract.mjs) to handle WASM/wasm-bindgen imports
 * from @midnight-ntwrk/compact-runtime that plain CDN imports cannot resolve.
 *
 * Input:  src/lib/midnight-browser-sdk.mjs
 * Output: public/js/midnight-sdk.js
 * Served: /js/midnight-sdk.js
 */

import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";

const __dir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dir, "..");

// Vite and Midnight packages both live in pilotlog-cli
const cliPkg = path.resolve(projectRoot, "pilotlog-cli");
const viteBin = path.resolve(cliPkg, "node_modules/.bin/vite");

// Entry point re-exports what the browser save-flight flow needs.
// Must live inside pilotlog-cli so Rolldown resolves packages from its node_modules.
const entryPoint = path.resolve(cliPkg, "src/midnight-browser-sdk.mjs");

// Output directory — served at /js/midnight-sdk.js
const outDir = path.resolve(projectRoot, "public/js");

if (!fs.existsSync(entryPoint)) {
  console.error("[bundle-midnight-sdk] entry not found:", entryPoint);
  process.exit(1);
}

if (!fs.existsSync(viteBin)) {
  console.error("[bundle-midnight-sdk] vite not found in pilotlog-cli — run: npm install");
  process.exit(1);
}

fs.mkdirSync(outDir, { recursive: true });

const viteConfigPath = path.resolve(cliPkg, "vite.midnight-sdk.config.js");
// Plugin to guard wasm.__wbindgen_start() calls.
// wasm-bindgen emits `wasm.__wbindgen_start()` in each *.wasm.js shim.
// When Vite bundles WASM for the browser, __wbindgen_start may not be
// present in the module's export namespace, causing Rollup to tree-shake
// it to `undefined` — which results in `(void 0)()` in the output and a
// TypeError at runtime.  We transform the source to use optional chaining
// so the call is safely skipped when the export is absent.
const wbindgenStartPlugin = `
{
  name: 'guard-wbindgen-start',
  transform(code, id) {
    if (!id.includes('@midnight-ntwrk')) return null;
    if (!code.includes('wasm.__wbindgen_start()')) return null;
    return {
      code: code.replace(/wasm\\.__wbindgen_start\\(\\)/g, 'wasm?.__wbindgen_start?.()'),
      map: null,
    };
  },
}
`;

const viteConfig = `
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [${wbindgenStartPlugin}],
  build: {
    lib: {
      entry: ${JSON.stringify(entryPoint)},
      formats: ['es'],
      fileName: () => 'midnight-sdk.js',
    },
    outDir: ${JSON.stringify(outDir)},
    emptyOutDir: false,
    target: 'es2020',
    minify: false,
    rollupOptions: {
      external: [],
    },
  },
  assetsInclude: ['**/*.wasm'],
  resolve: {
    mainFields: ['browser', 'module', 'main'],
  },
});
`;

fs.writeFileSync(viteConfigPath, viteConfig);

console.log("[bundle-midnight-sdk] building Midnight browser SDK bundle...");
console.log("  entry:", entryPoint);
console.log("  output:", path.join(outDir, "midnight-sdk.js"));

const result = spawnSync(viteBin, ["build", "--config", viteConfigPath], {
  cwd: cliPkg,
  stdio: "inherit",
  env: process.env,
});

fs.rmSync(viteConfigPath, { force: true });

if (result.status !== 0) {
  console.error("[bundle-midnight-sdk] Vite build failed");
  process.exit(1);
}

const outFile = path.resolve(outDir, "midnight-sdk.js");
if (fs.existsSync(outFile)) {
  // Safety net: if the transform plugin didn't catch all occurrences (e.g. a
  // different module path), replace any remaining bare `(void 0)();` calls that
  // were produced by unresolved wasm.__wbindgen_start() references.
  let bundle = fs.readFileSync(outFile, "utf8");
  const before = (bundle.match(/\(void 0\)\(\);/g) || []).length;
  if (before > 0) {
    bundle = bundle.replace(/\(void 0\)\(\);/g, "/* __wbindgen_start skipped — not exported by this wasm module */");
    fs.writeFileSync(outFile, bundle, "utf8");
    console.log(`[bundle-midnight-sdk] post-processed ${before} residual (void 0)() call(s)`);
  }

  const stat = fs.statSync(outFile);
  console.log(`[bundle-midnight-sdk] done — ${(stat.size / 1024).toFixed(1)} KB`);
} else {
  console.error("[bundle-midnight-sdk] output file not found after build");
  process.exit(1);
}
