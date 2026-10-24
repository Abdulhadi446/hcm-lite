# M6 + M7 + M8 contract (dashboards, AI, comms & audit)

Builds on M0–M5. All KPI/AI numbers come from SQL over the same tables the CRUD uses — **never** hardcoded, never cached across requests.

## M6 Dashboards & analytics

Shared filter: `?from=YYYY-MM-DD&to=YYYY-MM-DD&departmentId=` (default = current month). Role scope: Employee is always forced to their own `employeeId`; HR/Admin see the whole company (department filter optional).

### Formulas (implement once in `lib/services/analytics.ts`, export `computeMetrics({from,to,departmentId,employeeId?})`)
- `headcount` = employees with status in (`active`,`probation`) and join_date ≤ to and (exit_date is null or ≥ from).
- `workingDays` = non-weekend, non-holiday days between from..to (clamp to month for money KPIs).
- `presentDays` = attendance rows in range with status `present`; `lateDays` = `late`; `halfDays` = `half_day`; `onLeaveDays` = approved leave days in range.
- `absentDays` = workingDays − (present + late + half + onLeave) summed per employee, floored at 0.
- `attendanceRate` = (present + late + half + onLeave) / (headcount × workingDays) × 100, 1 decimal.
- `latePct` = late / (present + late + half) × 100.
- `absenteeismRate` = absent / (headcount × workingDays) × 100.
- `attritionRate` = exits in range / avg(headcount at from, headcount at to) × 100 (0 when denominator 0).
- `leaveUtilization` = (approved leave days used this year) / (sum of quotas for non-unlimited types) × 100.
- `payrollCost` = sum of `net_pay` over finalized+runs in range (label "YTD" when range covers multiple months).
- `avgTenureMonths`, `openCorrections`, `pendingLeaves` for HR widgets.

### Endpoints
- `GET /api/dashboard/summary?from&to&departmentId` → `{ scope, kpis: {...}, trend: { date, present, late, absent }[], byDepartment: { departmentName, headcount, attendanceRate, latePct }[], pending: { leaves, corrections }, recentHires: [...] }`
- `GET /api/dashboard/employee` → `{ me: { attendanceRate, presentDays, lateDays, absentDays, hoursThisWeek }, leaveBalances: [...], lastPayslip: {...} | null, upcomingHolidays: [...] }`
- Reuse these routes for the `/dashboard` page — **no duplicate KPI math in the page components**.

### UI
- `/dashboard` switches by role: Admin/HR share the KPI grid (headcount, attendance rate, absent today, late %, on leave today, payroll cost) + trend chart + department table + pending-approval cards that deep-link to `/leave?status=pending` and `/attendance`. Employee sees personal KPI cards + leave balance bars + next holiday + payslip shortcut.
- Reuse `components/attendance-trend-chart.tsx` shape (client, recharts) for the trend; add `components/dashboard/*` for new widgets.
- Filters (date range + department) as a small client bar that pushes query params; skeletons while loading; empty state when no data yet.

## M7 AI assistant

`lib/ai/client.ts` — OpenAI-compatible `fetch` to `${OPENAI_BASE_URL}/chat/completions` (default `https://openrouter.ai/api/v1`), `Authorization: Bearer ${OPENAI_API_KEY}`, `HTTP-Referer`/`X-Title: HCM Lite`, model from `AI_MODEL` env (default `openai/gpt-4o-mini`-style free model id, configurable). `import "server-only"`. No SDK needed — plain fetch + `AbortSignal.timeout(15000)`.

### Tools (`lib/services/ai-tools.ts`) — every tool receives the caller's `SessionUser` and reuses services; an Employee calling a company-wide tool gets their own slice.
`get_headcount`, `get_attendance_summary(dateRange?)`, `get_late_comers(date)`, `get_leave_summary(status?)`, `get_my_leave_balance`, `get_payroll_summary(month)` (Employee → own payslip only), `search_employees(query)`, `get_policy()` (settings + leave types + holiday list).
Tool JSON schemas in the same file; dispatcher validates args with zod and returns compact JSON (≤ 2 KB) so the model can answer.

### Behaviour
- Salary privacy: `get_payroll_summary` for an Employee returns only their own net pay; if a tool result would expose another employee's salary, the system prompt instructs refusal. Add a post-check: if the question matches salary-of-other patterns and the caller is an Employee, refuse without calling the model.
- Rate limit: 20 requests/user/hour — count `ai_logs` rows for the user in the last hour; 429 `rate_limited` with `retryAfter`.
- Timeout/error → `{ answer: "I couldn't reach the AI service. Please try again in a moment.", fallback: true }` with HTTP 200 so the UI shows a friendly bubble; log the failure.
- Every call writes `ai_logs(user_id, role, prompt, tool_calls_json, answer, model, latency_ms, ok, created_at)`.
- Answers are returned with `aiGenerated: true`; UI renders an "AI-generated" badge + disclaimer.

### Endpoints
- `POST /api/ai/chat` `{ messages: [{role,content}] }` → `{ answer, toolCalls: [{name, args}], aiGenerated: true, fallback?: true }` (non-streaming, max 4 tool iterations).
- `POST /api/ai/smart-leave` `{ text }` → `{ ok: true, parsed: { leaveTypeId, leaveTypeName, startDate, endDate, days, reason } }` or `{ ok: false, message }` — result is fed into the existing `/my-leave` apply dialog for the user to confirm; never auto-submits.
- `POST /api/ai/summary` → dashboard narrative: 2–3 sentence summary built from `computeMetrics` + one model call (Admin/HR only).
- `GET /api/ai/logs` (Admin) → `{ items }` for the AI activity table.

### UI
- `/ai` page: chat with message list, suggested prompts (chips: "Who was late today?", "Headcount by department", "My leave balance", "Attendance rate this month"), tool-call trace line under each answer (collapsed), rate-limit and fallback states, "AI-generated" badge.
- Floating `Ask AI` button already in the shell → `/ai`.
- Smart-leave box on `/my-leave` ("Describe your leave in a sentence") → prefills dialog.

## M8 Comms & audit

- `GET/POST /api/announcements` (Admin/HR post; all read; pinned first), `PATCH/DELETE /api/announcements/[id]` (author or Admin).
- `GET /api/notifications` → own, newest first, `{ items, unread }`; `POST /api/notifications/[id]/read`; `POST /api/notifications/read-all`.
- Notification type strings: `leave_approved`, `leave_rejected`, `payslip_ready`, `announcement`, `correction_approved`, `correction_rejected`. `body` short, `link` = route to open.
- `GET /api/audit-logs?entity=&actorId=&from=&to=&page=` (Admin only) → `{ items, total, page, pageSize }`; `AuditRow = { id, actorName, actorRole, action, entity, entityId, beforeJson, afterJson, ip, createdAt }`.
- Audit writes (service `lib/services/audit.ts`, already exists) on every create/update/approve/reject/finalize/login — verify coverage with a smoke script asserting log rows appear after a mutation.

### UI
- `/announcements` (Admin/HR: composer card with title/body/pin + list with delete; Employee: read-only list).
- Notifications bell in the topbar → Sheet with unread dot, mark-all-read, click navigates to `link`.
- `/audit` (Admin): filterable table (actor, action, entity, date), row expand showing before/after JSON diff, pagination.
- Employee dashboard shows latest announcements.

## Verification per milestone
- `scripts/api-smoke-m3.mjs` … `-m8.mjs` following the existing pattern (port 3003+, isolated `DATABASE_URL`), asserting the rule-level numbers (e.g. a leave request spanning a weekend counts only working days; a 5 h+15 m late day is `late`; a prorated joiner's tax and net match hand-computed values).
- Each lane runs `npx tsc --noEmit` (or the project's lint/type script) + its own smoke, not the whole suite.
