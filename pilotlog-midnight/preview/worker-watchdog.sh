#!/usr/bin/env bash
# Keep the staging prover/relayer worker alive on the box. Restarts it when it exits, or when its heartbeat
# (written by worker.mjs) shows no successful claim for 60 s outside a bounded job/startup window.
# Usage (same env as worker.mjs): nohup preview/worker-watchdog.sh >> /tmp/cfi-worker.log 2>&1 &
cd "$(dirname "$0")"
export CFI_WORKER_HEARTBEAT=${CFI_WORKER_HEARTBEAT:-/tmp/cfi-worker.heartbeat}
export PROOF_SERVER_RECYCLE=${PROOF_SERVER_RECYCLE:-1}
while true; do
  rm -f "$CFI_WORKER_HEARTBEAT"
  node worker.mjs & pid=$!
  echo "$(date -u +%FT%TZ) WATCHDOG: started worker pid $pid"
  sleep 15
  while kill -0 $pid 2>/dev/null; do
    if [ -f "$CFI_WORKER_HEARTBEAT" ]; then
      stale=$(node -e 'const h=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));const now=Date.now();console.log(now>Math.max(h.at+60000,h.busyUntil)?1:0)' "$CFI_WORKER_HEARTBEAT" 2>/dev/null || echo 0)
      if [ "$stale" = "1" ]; then echo "$(date -u +%FT%TZ) WATCHDOG: worker $pid hung (no claim for 60 s); restarting ($(ps -o %cpu=,rss= -p $pid | awk "{printf \"cpu=%s%% rss=%dMB\", \$1, \$2/1024}"))"; kill $pid; sleep 3; kill -9 $pid 2>/dev/null; break; fi
    fi
    sleep 10
  done
  wait $pid 2>/dev/null; echo "$(date -u +%FT%TZ) WATCHDOG: worker $pid exited ($?); restarting in 5 s"
  sleep 5
done
