#!/usr/bin/env bash
# Polls <url>/healthz until it answers 200 (allows for a Cloud Run + Neon cold start).
set -euo pipefail
URL="${1:?usage: healthcheck.sh <base-url>}"
for i in $(seq 1 30); do
  if curl -fsS --max-time 10 "$URL/healthz" >/dev/null; then
    echo "healthy: $URL"
    exit 0
  fi
  echo "waiting for $URL/healthz ($i/30)"
  sleep 5
done
echo "unhealthy: $URL" >&2
exit 1
