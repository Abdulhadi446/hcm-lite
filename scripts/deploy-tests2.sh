#!/usr/bin/env bash
# Deploy HCM Lite to tests2 (Oracle box) behind the `hcm-lite` cloudflared tunnel.
#
# One-time setup already done on tests2:
#   - Node 22 at /opt/node22 (node:sqlite required)
#   - repo cloned to ~/hcm-lite/app, secrets in ~/hcm-lite/app/.env
#   - ~/hcm-lite/deploy.sh does git reset --hard origin/main + npm ci + build + restart on :3200
#   - cloudflared named tunnel `hcm-lite` (9e8c1d46-...) with ~/.cloudflared/hcm-lite.yml
#
# Usage: ./scripts/deploy-tests2.sh
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
TS="$(date +%Y%m%d-%H%M%S)"
LOG=".agent-logs/deploy-$TS.log"
mkdir -p .agent-logs

echo "==> build check (local)" | tee "$LOG"
npm run build >>"$LOG" 2>&1

echo "==> push main" | tee -a "$LOG"
git push origin main 2>&1 | tee -a "$LOG"

echo "==> remote build + restart" | tee -a "$LOG"
ssh tests2 "bash /home/ubuntu/hcm-lite/deploy.sh" 2>&1 | tee -a "$LOG"

echo "==> health check" | tee -a "$LOG"
for i in 1 2 3 4 5; do
  code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 https://hcm-lite.thetrillioniar.me/ || true)
  echo "  attempt $i -> $code" | tee -a "$LOG"
  [ "$code" = "200" ] && break
  sleep 3
done

echo "==> https://hcm-lite.thetrillioniar.me"
echo "log: $LOG"
