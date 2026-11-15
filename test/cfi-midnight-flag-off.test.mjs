// Guard: the isolated CFI-on-Midnight module (pilotlog-midnight/) must not change the main app.
// With PILOTLOG_CFI_MIDNIGHT absent (the default) there are no new routes, boot-time behaviour, DDL
// or dependencies, because the app never imports the module or reads the flag at all.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const APP_DIRS = ['pilotlog-cli/src', 'pilotlog-cli/scripts', 'bin', 'src', 'public', 'scripts'];

function* walk(dir) {
  let entries;
  try { entries = readdirSync(dir); } catch { return; }
  for (const name of entries) {
    if (name === 'node_modules' || name.startsWith('.')) continue;
    const p = path.join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) yield* walk(p);
    else if (/\.(m?js|cjs|ts|html)$/.test(name)) yield p;
  }
}

test('app code never imports pilotlog-midnight or reads PILOTLOG_CFI_MIDNIGHT', () => {
  const offenders = [];
  for (const d of APP_DIRS) {
    for (const f of walk(path.join(ROOT, d))) {
      const s = readFileSync(f, 'utf8');
      if (/pilotlog-midnight|PILOTLOG_CFI_MIDNIGHT|midnight-cfi|cfi_endorse/.test(s)) offenders.push(path.relative(ROOT, f));
    }
  }
  assert.deepEqual(offenders, []);
});

test('root package does not depend on the module or its toolchain', () => {
  const pkg = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  const deps = { ...pkg.dependencies, ...pkg.devDependencies, ...pkg.optionalDependencies };
  assert.equal(pkg.workspaces, undefined, 'no npm workspaces: `npm ci` at the root must not install the module');
  for (const name of Object.keys(deps)) assert.ok(!/midnight-cfi|compact-runtime|ledger-v9|testkit-js|midnight-js/.test(name), `unexpected root dependency ${name}`);
  for (const [name, cmd] of Object.entries(pkg.scripts)) assert.ok(!/pilotlog-midnight/.test(cmd), `root script ${name} references the module`);
});

test('the production image excludes the module', () => {
  const lines = readFileSync(path.join(ROOT, '.dockerignore'), 'utf8').split('\n').map((l) => l.trim());
  assert.ok(lines.includes('pilotlog-midnight'));
});

test('module gate is off by default and only "1" enables it', async () => {
  const { isEnabled, assertEnabled, FLAG } = await import('../pilotlog-midnight/src/flag.mjs');
  assert.equal(FLAG, 'PILOTLOG_CFI_MIDNIGHT');
  assert.equal(isEnabled({}), false);
  for (const v of ['true', 'yes', '0', '', 'on']) assert.equal(isEnabled({ [FLAG]: v }), false, v);
  assert.equal(isEnabled({ [FLAG]: '1' }), true);
  assert.throws(() => assertEnabled({}), (e) => e.code === 'CFI_MIDNIGHT_DISABLED');
});

test('module key material and prover keys are gitignored', () => {
  const gi = readFileSync(path.join(ROOT, 'pilotlog-midnight/.gitignore'), 'utf8');
  for (const p of ['contract/managed/keys/', 'preview/.state/', 'seed.hex', 'node_modules']) assert.ok(gi.includes(p), p);
});
