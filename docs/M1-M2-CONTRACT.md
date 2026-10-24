# M1 + M2 contract (frozen — backend and UI build against this)

Everything from `docs/M0-CONTRACT.md` still applies (auth, roles, `ApiError`, `apiError`, `scopeEmployeeId`).
New: a services layer under `lib/services/*.ts`. **Routes are thin**: parse → validate → call service → return JSON.
The same services will be used by the AI tools in M7, so keep them free of HTTP concerns.

## Conventions
- All routes: `try { ... } catch (err) { return apiError(err); }`
- Validation failures → `400 { error, fields?: Record<string,string> }`.
- Duplicates → `409 { error: "duplicate", field: "code" | "email" | "name" }`.
- Not found → `404 { error: "not_found" }`.
- List responses: `{ items: T[], total: number, page: number, pageSize: number }`.
- Every mutation writes an audit row: `audit_logs(actor_user_id, action, entity, entity_id, before_json, after_json)`.
  Actions: `create`, `update`, `delete`, `deactivate`, `reset_password`, `import`.
- `lib/services/audit.ts`: `logAudit({ actorId, action, entity, entityId, before?, after? })` (never throws).

## Permissions
| Route group | admin | hr | employee |
|---|---|---|---|
| settings GET | ✓ | ✓ | — |
| settings PATCH | ✓ | — | — |
| departments / designations / leave-types / holidays (all verbs) | ✓ | GET only | — |
| users (create HR/Admin accounts, deactivate, reset) | ✓ | — | — |
| employees GET list | all | all | own row only |
| employees POST / PATCH | — | ✓ | own `phone`, `address` only |
| employees import / export | — | ✓ | — |
| employee overview (360) | all | all | own only |

## Shapes
```ts
type Employee = {
  id: number; code: string; fullName: string; email: string; phone: string | null;
  address: string | null; departmentId: number | null; departmentName: string | null;
  designationId: number | null; designationName: string | null;
  joinDate: string | null; status: "active" | "probation" | "exited"; exitDate: string | null;
  basicSalary: number; grossSalary: number; // gross = 1.5 × basic
  hasLogin: boolean;
};
type Settings = {
  companyName: string; officeStart: string; graceMinutes: number; halfDayMinutes: number;
  weekendDays: string; officeLat: number | null; officeLng: number | null; radiusM: number;
};
type Department = { id: number; name: string; employeeCount: number };
type Designation = { id: number; name: string; departmentId: number | null; departmentName: string | null };
type LeaveType = { id: number; name: string; quotaDays: number; paid: boolean };
type Holiday = { id: number; date: string; name: string };
type UserRow = { id: number; name: string; email: string; role: "admin" | "hr" | "employee";
  employeeId: number | null; active: boolean; mustChangePassword: boolean; createdAt: string };
```

## Endpoints

### `GET /api/settings` → `{ settings: Settings }`
### `PATCH /api/settings` (admin) body partial
`{ companyName?, officeStart "HH:MM", graceMinutes 0..120, halfDayMinutes 60..720, weekendDays "sat,sun", officeLat?, officeLng?, radiusM 20..5000 }`
→ `{ settings }`. Validate lat ∈ [-90,90], lng ∈ [-180,180], both-or-neither.

### Departments
- `GET /api/departments` → `{ items: Department[] }` (with employeeCount)
- `POST /api/departments` (admin) `{ name }` → 201 `{ department }`
- `PATCH /api/departments/[id]` (admin) `{ name }` → `{ department }`
- `DELETE /api/departments/[id]` (admin) → `{ ok: true }`; 409 `{error:"in_use"}` if employees reference it

### Designations — same shape at `/api/designations`, body `{ name, departmentId? }`

### Leave types
- `GET /api/leave-types` → `{ items: LeaveType[] }`
- `POST /api/leave-types` (admin) `{ name, quotaDays, paid }` → 201 `{ leaveType }`
- `PATCH /api/leave-types/[id]` (admin) → `{ leaveType }`
- `DELETE /api/leave-types/[id]` (admin) → `{ ok: true }`; 409 `in_use` if referenced by leave requests
- Seed on first run (setup): Annual 14 paid, Sick 8 paid, Casual 10 paid, Unpaid 0 not-paid (0 = unlimited).

### Holidays
- `GET /api/holidays?year=` → `{ items: Holiday[] }` sorted by date
- `POST /api/holidays` (admin) `{ date "YYYY-MM-DD", name }` → 201 `{ holiday }`; 409 duplicate date
- `DELETE /api/holidays/[id]` (admin) → `{ ok: true }`

### Users (login management, admin only)
- `GET /api/users?role=` → `{ items: UserRow[] }`
- `POST /api/users` (admin) `{ name, email, role: "admin"|"hr", password? }` → 201 `{ user: UserRow, temporaryPassword }`
  (min 8 chars; generated when omitted; `mustChangePassword = 1` only when password was generated)
- `PATCH /api/users/[id]` (admin) `{ active?: boolean }` → `{ user }`; block self-deactivation with 400 `{error:"cannot_deactivate_self"}`
- `POST /api/users/[id]/reset-password` (admin) → `{ temporaryPassword }`, sets `must_change_password = 1`

### Employees
- `GET /api/employees?q=&departmentId=&status=&page=1&pageSize=20&sort=name|code|joinDate`
  → `{ items: Employee[], total, page, pageSize }`. `q` matches name/code/email (LIKE, case-insensitive).
  Employees are scoped: an `employee` role only ever gets their own row.
- `POST /api/employees` (HR) body:
  `{ code, fullName, email, phone?, address?, departmentId?, designationId?, joinDate, status, basicSalary, password? }`
  → 201 `{ employee: Employee, temporaryPassword }`.
  Creates the employee **and** a `users` row (`role: employee`, `employee_id`, `must_change_password = 1`).
  Validations: basicSalary > 0, valid email, joinDate ISO, known department/designation, unique code/email (409).
- `GET /api/employees/[id]` → `{ employee }` (employee → own only, else 403 `forbidden`)
- `PATCH /api/employees/[id]` (HR) same fields as POST minus `code`; also accepts `status`, `exitDate`.
  An `employee` may PATCH only `{ phone, address }` on their own row; anything else → 403.
- `GET /api/employees/[id]/overview` → Employee 360:
```ts
{ employee: Employee,
  attendance: { presentDays: number; lateDays: number; absentDays: number; last30: { date: string; status: string }[] },
  leave: { typeName: string; quota: number; used: number; remaining: number }[],
  payslips: { id: number; month: string; net: number }[] }
```
(counts computed from tables; empty arrays until M3–M6 exist — the query must not fail on empty tables.)
- `POST /api/employees/import?dryRun=1|0` (HR) — multipart `file` (CSV, header row):
  `code,full_name,email,phone,address,department,designation,join_date,status,basic_salary`
  → `{ dryRun: boolean, total: number, valid: number, errors: { row: number; field: string; reason: string }[], created: Employee[] }`
  Row checks: required fields, unique code/email (against DB **and** within the file), valid email, known department (by name),
  ISO `join_date`, `status` ∈ active|probation|exited, `basic_salary > 0`.
  `dryRun=1` writes nothing. Real import is all-or-nothing per row (partial success allowed, errors reported).
- `GET /api/employees/export` → `text/csv` attachment `employees.csv`, same columns as the import format.

## Services (`lib/services/`)
- `employees.ts`: `listEmployees(filters, scope)`, `getEmployee(id, scope)`, `createEmployee(input, actor)`,
  `updateEmployee(id, patch, actor)`, `employeeOverview(id, scope)`, `importEmployees(rows, actor, dryRun)`, `exportCsv()`.
- `org.ts`: settings get/update, departments/designations/leave-types/holidays CRUD.
- `users.ts`: list/create/update/reset.
- `audit.ts`: `logAudit(...)`.
- Shared helpers in `lib/dates.ts` (`todayIso()`, `isIsoDate()`, `workingDaysBetween(start, end, weekendDays, holidayDates)`) — M3–M6 will reuse.

## UI pages (owned by UI lanes)
- `/organization` — tabs: **Company** (settings form, admin editable / HR read-only), **Departments**, **Designations**, **Leave types**, **Holidays**, **Logins** (admin only). Inline tables with add-row dialogs, edit and delete with confirm; 403-safe (hide write actions for HR).
- `/employees` — header with "Add employee" + "Import CSV" + "Export"; search input (debounced), department + status filters, sortable table, pagination, empty state ("No employees yet — HR registers the first one").
- `/employees/[id]` — Employee 360: profile card, edit form (HR) / contact-only (own), attendance summary, leave balances, payslips list, account status + reset password (HR/Admin).
- `/employees/new` — registration form (job details + salary + optional temp password); shows the temp password once on success with copy button.
- `/employees/import` — CSV upload, dry-run preview table of errors (row/field/reason), then "Import N rows".
- Employees must see **only** their own data; a link from their dashboard to their profile is fine.
