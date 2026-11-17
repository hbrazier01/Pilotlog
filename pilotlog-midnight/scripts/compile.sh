#!/bin/sh
# Compile contract/cfi_endorse.compact with Compact 0.36.0 (language 0.28) for ONE WebAuthn environment.
#   CFI_ENV_NAME=staging CFI_RP_ID=... CFI_ORIGIN=https://... COMPACTC=/path/to/compactc npm run compile         # full: zkir + keys (gitignored)
#   ... npm run compile:skip-zk                                                                                 # JS only (committed)
# Without CFI_RP_ID/CFI_ORIGIN the environment recorded in contract/env.json is reused.
set -eu
cd "$(dirname "$0")/.."
node scripts/gen-contract.mjs   # template -> cfi_endorse.compact (env vars, else contract/env.json)
cd contract
COMPACTC="${COMPACTC:-compactc}"
"$COMPACTC" --version | grep -q '^0\.36\.' || { echo "need compactc 0.36.x (got $("$COMPACTC" --version))" >&2; exit 1; }
if [ "${SKIP_ZK:-}" = "1" ]; then "$COMPACTC" --skip-zk cfi_endorse.compact managed; else "$COMPACTC" cfi_endorse.compact managed; fi
cp env.json managed/env.json
