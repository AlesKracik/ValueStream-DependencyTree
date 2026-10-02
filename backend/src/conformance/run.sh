#!/usr/bin/env bash
# Runs the entities conformance replay against a throwaway MongoDB container.
# Usage (from the code repo root): bash backend/src/conformance/run.sh
set -euo pipefail
NAME=vs-conformance-mongo
PORT=${CONFORMANCE_MONGO_PORT:-27018}
if ! docker ps --format '{{.Names}}' | grep -qx "$NAME"; then
  docker rm -f "$NAME" >/dev/null 2>&1 || true
  docker run -d --rm --name "$NAME" -p "$PORT:27017" mongo:latest >/dev/null
  for _ in $(seq 1 30); do
    docker exec "$NAME" mongosh --quiet --eval 'db.runCommand({ping:1}).ok' >/dev/null 2>&1 && break
    sleep 1
  done
fi
export CONFORMANCE_MONGO_URI=${CONFORMANCE_MONGO_URI:-mongodb://127.0.0.1:$PORT}
cd "$(dirname "$0")/../.."
npx vitest run --config vitest.conformance.config.ts "$@"
