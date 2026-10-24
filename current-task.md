# Current Task

## Task
M9 — final integration, live verification, handoff

## Description
All nine modules are shipped and verified locally. This phase is about the deployment being
demo-ready: clean build, lint, live walkthrough, sample-data fallback, docs.

## Status
- [x] M0 auth/setup/shell, M1 org, M2 employees, M3 attendance, M4 leave, M5 payroll + payslip PDF
- [x] M6 dashboards/analytics (`lib/services/analytics.ts` is the only KPI source)
- [x] M7 AI assistant (OpenRouter, 8 tools, salary refusal, rate limit, `ai_logs`)
- [x] M8 announcements / notifications / audit trail
- [x] Sample-data loader (Admin → Organization → Company → *Load sample data*)
- [x] `npm run build` and `npx tsc --noEmit` clean; `npx eslint .` 0 errors
- [x] `scripts/e2e-full.mjs` — 18/18 checks from an empty database through the UI
- [x] Live: https://hcm-lite.thetrillioniar.me (tunnel `hcm-lite` → tests2:3200)

## Notes
- Verification scripts: `scripts/api-smoke*.mjs`, `scripts/e2e-full.mjs`,
  `scripts/deployed-check.mjs`, `scripts/api-smoke-demo-seed.mjs`. Logs in `.agent-logs/`.
- Reset the deployed instance to an empty install: `bash scripts/reset-deployed-db.sh`.
- Restart the deployed server without rebuilding: `ssh tests2 'bash ~/hcm-lite/restart.sh'`
  (kills every `next-server`, starts one on 3200, prints the health status).
- Demo script: `docs/DEMO.md`. Judge fast path: setup wizard → Load sample data → dashboard/AI/audit.
