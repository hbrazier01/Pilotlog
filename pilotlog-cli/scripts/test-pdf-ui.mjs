import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoDir = path.resolve(scriptDir, "../..");
const readApi = path.join(repoDir, "pilotlog-cli/src/readApi.mjs");
const port = 18878;

async function startServer(pdfEnabled) {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "pilotlog-pdf-ui-"));
  const env = { ...process.env, PORT: String(port), PILOTLOG_HOME: dataDir };
  delete env.DATABASE_URL;
  if (pdfEnabled) env.PILOTLOG_ENABLE_PDF = "true";
  else delete env.PILOTLOG_ENABLE_PDF;

  const server = spawn(process.execPath, [readApi], {
    cwd: repoDir,
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  const collect = (chunk) => { output += chunk.toString(); };
  server.stdout.on("data", collect);
  server.stderr.on("data", collect);

  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`server did not start: ${output}`));
    }, 10_000);
    const onOutput = (chunk) => {
      output += chunk.toString();
      if (output.includes("pilotlog-read-api listening")) {
        clearTimeout(timeout);
        resolve();
      }
    };
    server.stdout.on("data", onOutput);
    server.stderr.on("data", onOutput);
    server.once("exit", (code, signal) => {
      clearTimeout(timeout);
      reject(new Error(`server exited before start (${code ?? signal}): ${output}`));
    });
  });

  return {
    baseUrl: `http://127.0.0.1:${port}`,
    async stop() {
      server.kill("SIGTERM");
      await new Promise((resolve) => server.once("exit", resolve));
      await fs.rm(dataDir, { recursive: true, force: true });
    },
  };
}

async function checkHtml(baseUrl, shouldShowPdf) {
  for (const route of ["/export/sale-packet/html", "/verify/airworthy/html"]) {
    const response = await fetch(`${baseUrl}${route}`);
    assert.equal(response.status, 200, `${route} should render successfully`);
    const html = await response.text();
    const hasPdfLink = html.includes("/export/sale-packet/pdf") && html.includes("Download PDF");
    assert.equal(hasPdfLink, shouldShowPdf, `${route} PDF UI should match feature flag`);
  }
}

const disabled = await startServer(false);
try {
  await checkHtml(disabled.baseUrl, false);
  const pdfResponse = await fetch(`${disabled.baseUrl}/export/sale-packet/pdf`);
  assert.equal(pdfResponse.status, 404, "PDF endpoint should remain gated when disabled");
} finally {
  await disabled.stop();
}

const enabled = await startServer(true);
try {
  await checkHtml(enabled.baseUrl, true);
} finally {
  await enabled.stop();
}

console.log("PDF UI and server gate checks passed (unset and PILOTLOG_ENABLE_PDF=true)");
