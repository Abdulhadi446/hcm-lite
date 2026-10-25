# Current Task

## Task
Submission push — full test pass, redeploy, judge-facing docs

## Description
Everything is built; this pass is (1) run the whole verification suite locally, (2) redeploy to
tests2 and re-verify the live URL from a fresh install, (3) ship the last page of the brief:
5-minute demo script + README (first Admin, AI key, done/not-done, judging checklist).

## Lanes
- [x] M6 metrics/dashboards vs `docs/M10-ANALYTICS-CONTRACT.md`; `scripts/api-smoke-m6.mjs` → ALL PASS
- [x] Employee dashboard widgets: check-in card, `h / 40h` week bar, ask-the-assistant card
- [x] `docs/DEMO.md` → 300 s script (14 steps, all five judge beats, cheat sheet + breakage plan)
- [x] `README.md` → first-Admin steps, AI-key section, done/not-done (bonus honest), judging checklist
- [ ] Full local suite (fix-3 lane, running): api-smoke* / acceptance-* / e2e-full + tsc/eslint/build
- [ ] Redeploy to tests2 + live re-verification + `deployed-check.mjs`

## Previous milestone status
All nine modules are shipped and verified locally.

## Status
- [x] M0 auth/setup/shell, M1 org, M2 employees, M3 attendance, M4 leave, M5 payroll + payslip PDF
- [x] M6 dashboards/analytics (`lib/services/analytics.ts` is the only KPI source)
- [x] M7 AI assistant (OpenRouter, 8 tools, salary refusal, rate limit, `ai_logs`)
- [x] M8 announcements / notifications / audit trail
- [x] Sample-data loader (Admin → Organization → Company → *Load sample data*)
- [x] `npm run build` and `npx tsc --noEmit` clean; `npx eslint .` 0 errors
- [x] `scripts/e2e-full.mjs` — 18/18 checks from an empty database through the UI
- [x] Live: https://hcm-lite.thetrillioniar.me (tunnel `hcm-lite` → tests2:3200)

## Face-verified attendance (backend lane)
- [x] Schema: `face_templates`, `face_challenges`, `face_verifications` +
  `attendance.verification_method` (`lib/schema.sql`, idempotent `ensureColumn` in `lib/db.ts`)
- [x] `lib/services/face.ts`: cosine match (`FACE_MATCH_THRESHOLD`, default 0.62), embedding shape
  gate (1024 finite floats, L2 norm 0.5–100), single-use 120 s challenges with 10/10 min rate
  limit, enroll/delete, geofenced verify-and-punch via the existing attendance service
  (`source='camera'`, `verification_method='face'`), `face_verifications` on every attempt,
  audit on success; embeddings never stored outside `face_templates` or returned/logged
- [x] Routes: `GET /api/attendance/face/status`, `POST /api/attendance/face/challenge`,
  `POST|DELETE /api/attendance/face/enroll`, `POST /api/attendance/face/check-in|check-out`,
  `GET /api/attendance/face/verifications`
- [x] `scripts/api-smoke-face.mjs` — 42 checks from a fresh DB with synthetic embeddings
  (all pass; log in `.agent-logs/`)
- [ ] Frontend `/face-check-in` (separate lane)

## Notes
- Verification scripts: `scripts/api-smoke*.mjs`, `scripts/e2e-full.mjs`,
  `scripts/deployed-check.mjs`, `scripts/api-smoke-demo-seed.mjs`. Logs in `.agent-logs/`.
- Reset the deployed instance to an empty install: `bash scripts/reset-deployed-db.sh`.
- Restart the deployed server without rebuilding: `ssh tests2 'bash ~/hcm-lite/restart.sh'`
  (kills every `next-server`, starts one on 3200, prints the health status).
- Demo script: `docs/DEMO.md`. Judge fast path: setup wizard → Load sample data → dashboard/AI/audit.
