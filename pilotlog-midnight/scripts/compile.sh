#!/bin/sh
# Compile contract/cfi_endorse.compact with Compact 0.36.0 (language 0.28).
#   COMPACTC=/path/to/compactc-0.36.0/compactc npm run compile          # full: zkir + prover/verifier keys (~4 min, ~235 MB/circuit, gitignored)
#   COMPACTC=... npm run compile:skip-zk                                 # JS only (what tests need; committed)
set -eu
cd "$(dirname "$0")/../contract"
COMPACTC="${COMPACTC:-compactc}"
"$COMPACTC" --version | grep -q '^0\.36\.' || { echo "need compactc 0.36.x (got $("$COMPACTC" --version))" >&2; exit 1; }
if [ "${SKIP_ZK:-}" = "1" ]; then "$COMPACTC" --skip-zk cfi_endorse.compact managed; else "$COMPACTC" cfi_endorse.compact managed; fi
