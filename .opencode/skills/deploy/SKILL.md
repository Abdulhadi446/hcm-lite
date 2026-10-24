---
name: deploy
description: Deploy to tests2 via SSH with cloudflared tunnel. Use when deploying.
---

# Deploy

Target: tests2 (Oracle box) exposed via cloudflared tunnel.

1. Ensure `npm run build` passes locally; log to ./.agent-logs/.
2. Commit and push to main.
3. SSH to tests2 and pull latest:
   `ssh tests2 "cd ~/app && git pull && npm ci && npm run build"`
4. Start/restart app on tests2 (pm2 or nohup) on a port (e.g. 3000).
5. Expose via cloudflared tunnel:
   `ssh tests2 "cloudflared tunnel --url http://localhost:3000"` (or configured named tunnel).
6. Capture the public URL and verify core flow.
7. Log all steps/output to ./.agent-logs/deploy-<timestamp>.log.
