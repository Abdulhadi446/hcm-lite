# M0 contract (frozen — both lanes build against this)

## Stack facts
- Next.js 16.4.2 App Router, React 19.3, TypeScript, Tailwind v4, `cacheComponents: true`.
- DB: SQLite via `node:sqlite` (`DatabaseSync`), file `./dev.db` (path from `DATABASE_URL`), WAL mode, foreign keys on.
- Passwords: bcryptjs (cost 10). Session: JWT HS256 via `jose`, cookie `hcm_session`, 7 days, httpOnly, sameSite=lax, path=/, secure in prod.
- `AUTH_SECRET` env with a dev fallback. `OPENAI_*` reserved for M7.

## Roles
`type Role = "admin" | "hr" | "employee"`

## Tables (snake_case, integer ids)
- `settings(id=1, company_name, office_start "09:00", grace_minutes 15, half_day_minutes 300, weekend_days "sat,sun", office_lat, office_lng, radius_m 150, created_at)`
- `users(id, email UNIQUE, password_hash, name, role, employee_id NULL, must_change_password 0|1, active 1, created_at)`
- `employees(id, code UNIQUE, full_name, email UNIQUE, phone, address, department_id, designation_id, join_date, status "active|probation|exited", exit_date, basic_salary, created_at)`
- `departments(id, name UNIQUE)`, `designations(id, name, department_id NULL)`
- `leave_types(id, name UNIQUE, quota_days, paid 0|1)`
- `holidays(id, date UNIQUE, name)`
- `attendance(id, employee_id, date UNIQUE(employee_id,date), check_in_at, check_out_at, status, source "web|camera|correction", note)`
- `attendance_corrections(id, employee_id, date, requested_check_in, requested_check_out, reason, status "pending|approved|rejected", reviewed_by, review_comment, created_at)`
- `leave_requests(id, employee_id, leave_type_id, start_date, end_date, days, reason, status "pending|approved|rejected|cancelled", reviewed_by, review_comment, created_at)`
- `payroll_runs(id, month "YYYY-MM" UNIQUE, status "draft|finalized", working_days, created_by, finalized_by, finalized_at)`
- `payslips(id, run_id, employee_id, basic, hra, medical, gross, per_day, absent_days, unpaid_days, half_days, deductions, tax, net, UNIQUE(run_id,employee_id))`
- `announcements(id, title, body, created_by, created_at)`
- `notifications(id, user_id, title, body, read_at, created_at)`
- `audit_logs(id, actor_user_id, action, entity, entity_id, before_json, after_json, created_at)`
- `ai_logs(id, user_id, prompt, tools_json, answer, created_at)`

Timestamps: ISO-8601 text (`new Date().toISOString()`). Dates: `YYYY-MM-DD`.

## API (JSON, errors `{error: string}` with proper status)
- `GET /api/setup/status` → `{ initialized: boolean }`
- `POST /api/setup` `{companyName, adminName, adminEmail, adminPassword}` → 201 `{ok:true}`; 409 if already initialized; 400 validation.
- `POST /api/auth/login` `{email,password}` → 200 `{user: SessionUser}` + cookie; 401; 403 inactive.
- `POST /api/auth/logout` → 200 `{ok:true}`, clears cookie.
- `GET /api/auth/me` → 200 `{user: SessionUser}` | 401.
- `POST /api/auth/change-password` `{currentPassword,newPassword}` → 200 `{ok:true}` (sets must_change_password=0, re-issues cookie).

```ts
type SessionUser = { id: number; name: string; email: string; role: Role;
  employeeId: number | null; mustChangePassword: boolean; companyName: string }
```

## Server helpers (`lib/auth.ts`, `lib/guards.ts`)
```ts
getSessionUser(): Promise<SessionUser | null>
requireUser(): Promise<SessionUser>              // throws ApiError(401)
requireRole(...roles: Role[]): Promise<SessionUser>  // ApiError(403)
scopeEmployeeId(user): number | null             // employee -> own id, null => all
apiError(err): Response                          // maps ApiError -> {error}
```
`ApiError` class with `status`. Every future HR/Admin route uses `requireRole`; every employee-scoped query filters by `scopeEmployeeId`.

## UI routes (designer lane owns)
- `/` server component: `!initialized` → `/setup`; no session → `/login`; session → `/dashboard`.
- `/setup` (locked if initialized → `/login`), `/login`, `/change-password` (forced when `mustChangePassword`).
- `/(app)/dashboard` role-aware placeholder with KPI cards (static zeros in M0, wired later).
- `/(app)/...` shell: sidebar menus by role, topbar with user + logout, responsive at 375px.
  - Admin: Dashboard, Employees, Attendance, Leave, Payroll, Organization, Announcements, Audit, AI Assistant
  - HR: Dashboard, Employees, Attendance, Leave, Payroll, Announcements, AI Assistant
  - Employee: Dashboard, My Attendance, My Leave, Payslips, Announcements, AI Assistant
- Create placeholder pages for every menu path so nothing 404s; later milestones replace their content. Do not restyle later.

## Ownership (parallel writers)
- Backend lane: `lib/db.ts`, `lib/schema.sql`, `lib/auth.ts`, `lib/guards.ts`, `lib/validation.ts`, `app/api/**`, `scripts/**`, `package.json` (no more dep changes without asking).
- UI lane: `app/layout.tsx`, `app/globals.css`, `app/page.tsx`, `app/login/**`, `app/setup/**`, `app/change-password/**`, `app/(app)/**`, `components/**`.
- Nobody edits the other lane's files. Both may add files only in their own scope.
