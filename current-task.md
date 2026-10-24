# Current Task

## Task
M3 + M4 + M5 — backend (attendance, leave, payroll) per `docs/M3-M5-CONTRACT.md`

## Description
Services-first implementation: status/day rules and payroll math live only in `lib/services/*`.
M1/M2 services (`lib/services/org.ts`, `employees.ts`, `users.ts`, `audit.ts`, `http.ts`) and
`lib/dates.ts` are reused. Routes stay thin (parse → guard → service → JSON), `await headers()`
first, no `dynamic`/`runtime` exports.

## Status
- [x] M3 attendance: check-in/out (server stamps, 409s), computed status
      (`present`/`late`/`half_day`/`missing_checkout`), employee month history + summary,
      HR board with virtual `absent`/`on_leave`, corrections create/list/approve
      (approve upserts `source='correction'`), finalized-month `422 day_locked`.
- [x] M4 leave: working days from settings weekends + holidays, quotas/used/pending/remaining
      (quota 0 → remaining null), overlap + insufficient-balance 422s, HR approve/reject with
      notification, owner cancel, role-scoped lists.
- [x] M5 payroll: draft runs (`working_days`, proration for joiners/leavers, absent/unpaid/0.5×half
      deductions, tax slabs, 2-decimal rounding), draft list/detail, admin finalize (lock +
      notifications), draft delete, payslip list + PDF (`pdf-lib`).
- [x] Validation schemas extended (`lib/validation.ts`); no schema column changes needed.
- [x] `scripts/api-smoke-m3m5.mjs` — fresh DB, all rule-level numbers, ALL PASS.
- [x] `npx tsc --noEmit` clean; `npm run build` clean.

## Notes
- Endpoints: `/api/attendance` (+`/me`, `/check-in`, `/check-out`, `/corrections`,
  `/corrections/[id]`), `/api/leave/balances`, `/api/leave/requests` (+`/[id]`, `/[id]/cancel`),
  `/api/payroll/runs` (+`/[id]`, `/[id]/finalize`), `/api/payroll/payslips` (+`/[id]/pdf`).
- Payroll contract numbers used: gross = 1.5 × basic, per-day = gross / eligible working days,
  proration = eligible/total working days, tax slabs per M5 contract, net rounded to 2 dp.
- Smoke expected 2026-09: 22 working days; mid-month joiner (basic 100k, joined Sep 14)
  gross 88,636.36 / tax 10,000 / net 78,636.36; basic 50k employee net 73,750;
  full-month 60k employee (20 absent + 1 half-day) deductions 83,863.64 / net 4,136.36.
- Logs: `.agent-logs/<ts>-build-m3m5.log`, `.agent-logs/<ts>-smoke-m3m5.log`.

---

# M8 — Comms & Audit (complete)

## Status
- [x] `lib/services/comms.ts`: announcements CRUD (pinned-first ordering), notifications
      (own list + unread + mark one/all), exported `createNotification()` for leave/payroll lanes.
- [x] Schema: `announcements.pinned`, `notifications.type`, `notifications.link`
      (+ idempotent `ensureColumn` migration in `lib/db.ts` for existing DBs).
- [x] Routes: `/api/announcements` (+`/[id]`), `/api/notifications` (+`/[id]/read`,
      `/read-all`), `/api/audit-logs` (Admin; entity/actor/actorId/from/to/page/pageSize).
- [x] Audit: announcement create/update/delete write snapshots; viewer joins actor name + role.
- [x] UI: `/announcements` (Admin/HR composer + delete confirm, all roles read),
      `/audit` (Admin-gated table, filters, expandable before/after JSON, pagination),
      notification bell + Sheet in the topbar, dashboard latest-3 announcements.
- [x] `scripts/api-smoke-m8.mjs` — fresh DB + own port 3005, 24 checks ALL PASS.
- [x] `npx tsc --noEmit` clean; screenshots at 1440/375 in `.agent-logs/shots/m8-*.png`;
      375px overflow: none (`scrollWidth === 375` on announcements/audit/dashboard).

## Notes
- Announcement shape for the analytics/dashboard lane: `{ id, title, body, pinned, createdBy,
  authorName, authorRole, createdAt }`; `listAnnouncements(limit)` returns pinned first, then newest.
- New announcements create an `announcement`-type notification for every other active user
  (link `/announcements`).
- Logs: `.agent-logs/m8-tsc-final.log`, `.agent-logs/m8-smoke-*.log`, `.agent-logs/m8-build-*.log`.
