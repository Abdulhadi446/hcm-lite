#!/usr/bin/env bash
# Wipe the deployed SQLite database on tests2 so the live URL starts at the
# first-run setup wizard again (fresh, empty install — exactly what judges see).
# Usage: ./scripts/reset-deployed-db.sh
set -euo pipefail
ssh tests2 'set -e
  DB=/home/ubuntu/hcm-lite/data/hcm.db
  pid=$(cat /home/ubuntu/hcm-lite/app.pid 2>/dev/null || true)
  [ -n "${pid:-}" ] && kill "$pid" 2>/dev/null || true
  sleep 1
  rm -f "$DB" "$DB-shm" "$DB-wal"
  export PATH=/opt/node22/bin:$PATH
  cd /home/ubuntu/hcm-lite/app
  nohup node_modules/.bin/next start -p 3200 >> /home/ubuntu/hcm-lite/logs/app.log 2>&1 &
  echo $! > /home/ubuntu/hcm-lite/app.pid
  sleep 5
  curl -s -o /dev/null -w "local health: %{http_code}\n" http://localhost:3200/'
echo "reset done -> https://hcm-lite.thetrillioniar.me should show the setup wizard"
