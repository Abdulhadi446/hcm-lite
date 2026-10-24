#!/usr/bin/env bash
# Run the full Playwright journey (scripts/e2e-full.mjs) against a throwaway
# production server on its own port and a fresh SQLite database.
#
#   ./scripts/run-e2e.sh
#
# Requires a clean `npm run build` (this script runs it) and a free port 3011.
set -euo pipefail

PORT="${E2E_PORT:-3011}"
DB="${E2E_DB:-./.tmp/e2e.db}"
LOG_DIR="./.agent-logs"
mkdir -p "$LOG_DIR" .tmp
STAMP="$(date +%Y%m%d-%H%M%S)"
BUILD_LOG="$LOG_DIR/$STAMP-e2e-build.log"
SERVER_LOG="$LOG_DIR/$STAMP-e2e-server.log"

echo "==> build ($BUILD_LOG)"
npm run build >"$BUILD_LOG" 2>&1

echo "==> fresh database $DB"
rm -f "$DB" "$DB-shm" "$DB-wal"

echo "==> server on :$PORT ($SERVER_LOG)"
DATABASE_URL="file:$DB" nohup node_modules/.bin/next start -p "$PORT" >"$SERVER_LOG" 2>&1 &
SERVER_PID=$!
cleanup() { kill -9 "$SERVER_PID" 2>/dev/null || true; }
trap cleanup EXIT

for _ in $(seq 1 60); do
  if curl -sf "http://localhost:$PORT/api/setup/status" >/dev/null 2>&1; then break; fi
  sleep 1
done
curl -sf "http://localhost:$PORT/api/setup/status" >/dev/null || {
  echo "server did not start — see $SERVER_LOG"
  exit 1
}

echo "==> journey"
BASE_URL="http://localhost:$PORT" node scripts/e2e-full.mjs
