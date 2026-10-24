# M3 + M4 + M5 contract (attendance, leave, payroll)

Builds on `docs/M0-CONTRACT.md` + `docs/M1-M2-CONTRACT.md` (services layer, ApiError, audit, `lib/dates.ts`).
Numbers come from `TASK.md` §Business rules and must live **only** in services (`lib/services/*`), never in UI.

## M3 Attendance

### Status model (computed, one row per employee per day)
| status | rule |
|---|---|
| `present` | has check-in, check-in ≤ office_start + grace, has check-out, worked ≥ half_day_minutes |
| `late` | has check-in after office_start + grace, worked ≥ half_day_minutes |
| `half_day` | worked < `settings.half_day_minutes` (5 h) — applies with or without late |
| `missing_checkout` | check-in but no check-out |
| `absent` | no attendance row and no approved leave that day |
| `on_leave` | approved leave covers the day and no attendance row |

`attendance.status` denormalised at write time for the row; `absent` is virtual (computed in reports).
Source: `web` (default) | `camera` | `correction`.

### Endpoints
- `POST /api/attendance/check-in` → 201 `{ attendance }`; 409 `already_checked_in`; blocked outside weekends? **No** (weekends allowed but flagged); server stamps `check_in_at`.
- `POST /api/attendance/check-out` → `{ attendance }`; 409 `not_checked_in`; 409 `already_checked_out`; computes `status` + worked minutes.
- `GET /api/attendance/me?month=YYYY-MM` → `{ days: AttendanceDay[], summary: { present, late, halfDay, absent, onLeave, missingCheckout, hoursThisWeek, lateThisMonth } }`
  `AttendanceDay = { date, status, checkInAt, checkOutAt, workedMinutes }` (weekends/holidays marked `weekend`/`holiday`, no row needed).
- `GET /api/attendance?date=YYYY-MM-DD|month=YYYY-MM&departmentId=&q=` (HR/Admin) → `{ items: BoardRow[] , summary }`
  `BoardRow = { employeeId, code, fullName, departmentName, date, status, checkInAt, checkOutAt, leaveTypeName? }` — includes employees with no row as `absent`/`on_leave`.
- `POST /api/attendance/corrections` (employee/HR/Admin self) `{ date, requestedCheckIn "HH:MM", requestedCheckOut "HH:MM", reason }` → 201 `{ correction }`; 422 `{error:"day_locked"}` if the day is in a finalized payroll month.
- `GET /api/attendance/corrections?status=pending` (HR all, employee own) → `{ items }`
- `PATCH /api/attendance/corrections/[id]` (HR) `{ action: "approve"|"reject", comment? }` → `{ correction }`; on approve, upsert the attendance row with `source = "correction"` and recompute status.

## M4 Leave

- `GET /api/leave/types` → reuse `/api/leave-types`.
- `GET /api/leave/balances` — employee: own; HR/Admin: `?employeeId=` or all → `{ items: { employeeId, leaveTypeId, typeName, quota, used, pending, remaining }[] }`
  - `used` = approved days in current calendar year; `remaining = quota - used - pending` (quota 0 = unlimited → `remaining: null`).
- `POST /api/leave/requests` `{ leaveTypeId, startDate, endDate, reason }` → 201 `{ request }`
  - `days` = working days only (skip weekends from settings + `holidays`).
  - 422 `{error:"overlap"}` if it overlaps an existing pending/approved request of that employee.
  - 422 `{error:"insufficient_balance", remaining}` unless the type is unpaid/unlimited.
  - 400 if `days === 0` (all weekend/holiday).
- `GET /api/leave/requests?status=&employeeId=&month=` → employee: own only; HR/Admin: all → `{ items: LeaveRequestRow[] }`
  `LeaveRequestRow = { id, employeeId, employeeName, departmentName, leaveTypeName, startDate, endDate, days, reason, status, reviewComment, createdAt }`
- `PATCH /api/leave/requests/[id]` `{ action: "approve"|"reject", comment? }` (HR only; 403 for employee/admin write) → `{ request }` + notification to the employee.
- `POST /api/leave/requests/[id]/cancel` (owner only, pending or approved-but-future) → `{ request }`.
- Notifications: `notifications(user_id, title, body, read_at, created_at)` — write on approve/reject.

## M5 Payroll

Salary structure per employee = `basic_salary` only; `hra = 0.4 × basic`, `medical = 0.1 × basic`, `gross = basic + hra + medical = 1.5 × basic`.

Monthly run (`month = YYYY-MM`):
1. `workingDays` = count of non-weekend, non-holiday days in the month that fall on/after the employee's join date and on/before exit date (if exited in that month).
2. `perDay = gross / workingDays`.
3. Deductions: `absent + unpaid + 0.5 × halfDays` (days) × `perDay`.
4. Proration: employees who joined mid-month or exited mid-month are prorated — `grossForMonth = gross × (eligibleWorkingDays / totalWorkingDaysInMonth)`.
5. Tax: annual = `gross × 12` → slab → monthly tax = annualTax / 12.
   Slabs: 0–600 000 → 0; 600 001–1 200 000 → 5% of excess over 600 000; 1 200 001–2 400 000 → 30 000 + 15% of excess over 1 200 000; 2 400 001–3 600 000 → 210 000 + 25% over 2 400 000; above 3 600 000 → 510 000 + 35% over 3 600 000.
6. `net = grossForMonth - deductions - tax`, rounded to 2 decimals.

### Endpoints
- `GET /api/payroll/runs` (HR/Admin) → `{ items: { id, month, status, workingDays, employeeCount, totalGross, totalNet, finalizedAt }[] }`
- `POST /api/payroll/runs` (HR) `{ month }` → 201 `{ run, payslips }` — 409 `already_exists`; skips employees with `basic_salary <= 0`; employees included: status active/probation during that month (or exited within it, prorated).
- `GET /api/payroll/runs/[id]` → `{ run, payslips: PayslipRow[] }`
- `POST /api/payroll/runs/[id]/finalize` (Admin only) → `{ run }`; 409 `locked` if already finalized; writes notifications per employee; finalization blocks attendance corrections and payroll edits for that month.
- `DELETE /api/payroll/runs/[id]` (HR, draft only) → `{ ok: true }`
- `GET /api/payroll/payslips` — employee: own; HR/Admin `?employeeId=` → `{ items }`
- `GET /api/payroll/payslips/[id]/pdf` → `application/pdf` (own only for employees). Use `pdf-lib` (already installed). Filename `payslip-YYYY-MM-CODE.pdf`. Content: company name, employee name/code/department, month, basic/HRA/medical/gross, working days, per-day, absences/unpaid/half-day deductions, tax, net, "Generated by HCM Lite" footer.

## UI
- `/attendance` (HR/Admin): date picker + department filter + search; board table with status badges, check-in/out times, quick approve panel for pending corrections; daily summary chips (present / late / on leave / absent / missing checkout).
- `/my-attendance` (employee): check-in / check-out card (server-stamped, shows live status), month calendar with status colors + legend, summary stats (hours this week vs 40, late count), "Request correction" dialog; list of my correction requests with status.
- `/leave` (HR/Admin): tabs **Requests** (filter by status, approve/reject with comment dialog, shows days and balance impact) and **Balances** (per employee, per type).
- `/my-leave` (employee): balance cards (used/quota progress per type), "Apply for leave" dialog (type, start, end, reason, live working-day count), my history with cancel.
- `/payroll` (HR/Admin): month picker, runs list, "Create draft", draft detail table (employee, gross, deductions, tax, net), Admin-only "Finalize & lock" with confirm dialog, payslip PDF links.
- `/payslips` (employee): list of own payslips with month, net, download.
