// WebAuthn environment of the compiled contract (contract/managed/env.json, produced by scripts/compile.sh).
import { readFileSync } from 'node:fs';

export const CONTRACT_ENV = JSON.parse(readFileSync(new URL('../contract/managed/env.json', import.meta.url), 'utf8'));
