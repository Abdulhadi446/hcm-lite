# HCM Lite

An AI-assisted Human Capital Management web app: three roles, nine modules, and an assistant that
answers **only** from the data in your database via tool calling.

**Live demo:** https://hcm-lite.thetrillioniar.me — opens on the first-run setup wizard, with an empty database.

Built for the Saylani Hackathon (24 Oct 2026).

---

## The problem

A real HR team needs one place for people, attendance, leave, payroll and reports — where each role
sees exactly what it should. Off-the-shelf HRMS products are heavy, and demo data hides the part that
matters: whether the numbers are computed correctly from the records the user just created.

HCM Lite starts **empty**. Admin sets up the company, HR registers employees (registration creates
their login), employees check in and request leave, HR approves and runs payroll, Admin finalizes and
the month locks. Every dashboard number and every AI answer is derived from those rows — nothing is
seeded, nothing is hardcoded.

## Roles

| Role | Creates | Reads | Deliberately cannot |
|---|---|---|---|
| **Admin** | Company settings, departments, designations, leave types, holidays, HR logins, announcements | Everything, company-wide dashboards, audit log | Register employees, approve leave, edit drafts |
| **HR** | Employees + their logins, attendance corrections approval, leave approvals, payroll drafts, CSV imports/exports, announcements | Company-wide dashboards, all employee records | Change company settings, finalize payroll, see the audit log, edit a finalized month |
| **Employee** | Own check-in/out, own leave requests, own correction requests, own phone/address | Only their own attendance, leave, payslips, profile | See anyone else's salary or records; every route re-checks this server-side |

## Modules

1. **Auth & access** — bcrypt passwords, signed JWT cookie (`hcm_session`), forced password change on
   first sign-in for HR-created accounts, role + data-scope guards on every API route.
2. **Org setup** — company name, office hours + grace, weekend days, leave types with quotas, holidays,
   departments, designations, HR logins.
3. **Employees** — registration (creates the login), directory with server-side search/filter/sort/page,
   Employee 360 (profile, attendance, leave, payslips, account), own contact edit, CSV dry-run import + export.
4. **Attendance** — web check-in/check-out stamped by the server, one record per employee per day,
   status rules, employee month calendar, HR daily board, correction requests with approval.
5. **Leave** — apply, cancel, working-day math, quota + overlap validation, approval inbox with comments,
   balances per type.
6. **Payroll lite** — salary structure, monthly draft with proration, deductions, tax slabs, Admin
   finalization that locks the month, payslip PDF, notification on payslip.
7. **Dashboards** — role-scoped KPIs and trends, all computed in SQL from the live tables.
8. **AI assistant** — chat with tool calling, dashboard summary, smart leave (sentence → validated
   pre-filled form), policy Q&A, rate limit, timeout fallback, `ai_logs`, and an "AI-generated" label.
9. **Comms & audit** — announcements, in-app notifications, and an append-only audit log with
   before/after snapshots of every create/update/approve/finalize.

## Business rules (single source of truth: `lib/services/*`)

**Attendance** — office start 09:00, grace 15 min; a check-in after **09:15** is `late`. Worked time
under **5 h** is `half_day`. A day with no record and no approved leave is `absent`; a check-in without
a check-out is `missing_checkout`. Weekends (Sat–Sun) and holidays are never counted as working days.

**Leave** — entitlements: annual 14, sick 8, casual 10, unpaid unlimited. Only working days consume
balance. Overlapping requests or requests that exceed the remaining balance are rejected with `422`.

**Payroll** — `gross = 1.5 × basic` (HRA 40 %, medical 10 % of basic), `perDay = gross ÷ working days`.
Absent days and unpaid leave are deducted in full, half days at 0.5. Joiners and leavers are prorated by
eligible working days. Tax is computed on `gross × 12`:

| Annual gross | Tax |
|---|---|
| 0 – 600,000 | 0 |
| 600,001 – 1,200,000 | 5 % of the excess over 600,000 |
| 1,200,001 – 2,400,000 | 30,000 + 15 % of the excess over 1,200,000 |
| 2,400,001 – 3,600,000 | 210,000 + 25 % of the excess over 2,400,000 |
| above 3,600,000 | 510,000 + 35 % of the excess over 3,600,000 |

Monthly tax is the annual figure ÷ 12. Floating point is rounded only at the last step, so a payslip
always reproduces from its inputs. Admin finalization writes an audit entry and freezes the month:
no more attendance corrections, no payroll edits, no re-finalization.

## Stack

- **Next.js 16** App Router (React 19, Turbopack, Cache Components), TypeScript, Tailwind v4
- **shadcn/ui** on **Base UI** primitives (the `base-nova` style — `render={...}` instead of `asChild`)
- **SQLite** via the built-in `node:sqlite` `DatabaseSync` driver — no native build step, WAL mode,
  schema applied idempotently from `lib/schema.sql`
- **jose** (HS256 JWT in an httpOnly cookie) + **bcryptjs**
- **zod** for every request body
- **recharts** for dashboard charts, **pdf-lib** for payslips, **date-fns** for dates, **sonner** for toasts
- **OpenRouter** (OpenAI-compatible) with a free model — the API key never leaves the server

## Architecture

```
app/
  api/…                  route handlers; auth + role + scope enforced per route
  (app)/…                authenticated pages (server components gate on getSessionUser())
lib/
  db.ts  schema.sql      SQLite singleton, WAL, helpers (queryAll/queryOne/run)
  auth.ts  guards.ts     JWT session, requireUser/requireRole/scopeEmployeeId, ApiError
  validation.ts          zod schemas
  services/              ALL business logic + SQL (attendance, leave, payroll, employees, org,
                         users, analytics, comms, ai-tools, audit) — never duplicated in the UI
  dates.ts               working-day math (weekend + holiday aware)
components/…             UI per area (employees, org, attendance, leave, payroll, …) + ui/ primitives
scripts/                 API smoke tests, Playwright checks, deploy helpers
docs/                    frozen contracts per milestone (schema, endpoints, permissions, rules)
```

Rule of thumb used throughout: **routes own permissions, services own rules, pages own presentation.**
Employees readonly paths (`/api/attendance/me`, `/api/leave/requests`, `/api/payroll/payslips`) are scoped
by `scopeEmployeeId()`, so an employee id in a query string can never widen scope.

## Run locally

Requires **Node 22+** (for `node:sqlite`).

```bash
npm install
cp .env.example .env      # fill in OPENAI_API_KEY; AUTH_SECRET strongly recommended
npm run dev               # http://localhost:3000
```

Open the app: it redirects to `/setup`, where you create the company and the first Admin account.
Then, as Admin, add departments, designations, leave types and holidays, and create an HR login
(Organization → Logins). Sign in as HR to register employees — each registration returns a one-time
temporary password that the employee must change on first sign-in.

### Sample data (exploring or judging)

A fresh install is empty by design. To populate a realistic dataset in one click, sign in as
**Admin → Organization → Company → Load sample data**. It creates 4 departments, 5 designations,
6 employees (logins `firstname.lastname@hcm.demo` / `Demo@12345`), 30 weekdays of attendance with a realistic mix of
present / late / half-day / missing-checkout / absent, three leave requests, a finalized previous
month plus a draft current month of payroll, announcements and pending corrections. The endpoint is
Admin-only (`POST /api/demo/seed`) and refuses to run once employees exist.

### Environment

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | SQLite path, e.g. `file:./dev.db` (also accepts an absolute path) |
| `AUTH_SECRET` | HS256 secret for session JWTs; generate with `openssl rand -base64 32` |
| `OPENAI_API_KEY` | OpenRouter (or any OpenAI-compatible) key — server-side only |
| `OPENAI_BASE_URL` | Defaults to `https://openrouter.ai/api/v1` |
| `OPENAI_MODEL` | Defaults to `openrouter/free` (verified to support tool calling) |
| `COMPANY_NAME`, `ADMIN_EMAIL`, `ADMIN_PASSWORD` | Optional first-run bypass; leave unset to always start with the setup wizard |

## AI assistant

`POST /api/ai/chat` sends the conversation plus a tool schema to the model. The model picks a tool, the
backend executes it **with the caller's scope**, feeds the result back, and the model answers. Tools:
`get_headcount`, `get_attendance_summary`, `get_late_comers`, `get_leave_summary`,
`get_my_leave_balance`, `get_payroll_summary`, `search_employees`, `get_policy`.

Guardrails: 20 requests per user per hour, 15 s timeout with a friendly fallback bubble, every call
logged to `ai_logs`, all answers labelled **AI-generated**, and an employee asking about someone else's
salary is refused before the model is even called. The key is read from the server environment only.

## Deployment

Hosted on `tests2` behind a Cloudflare named tunnel (`hcm-lite`), with a persistent SQLite file at
`/home/ubuntu/hcm-lite/data/hcm.db`.

```bash
./scripts/deploy-tests2.sh    # local build check → push → remote git reset + npm ci + build + restart → health check
./scripts/reset-deployed-db.sh  # wipe the live DB → back to the first-run setup wizard
./scripts/deployed-check.mjs    # Playwright: setup → login → dashboard → every nav page, 1440 + 375
```

The remote host needs Node 22 (`/opt/node22`) because of `node:sqlite`; the tunnel config lives at
`~/.cloudflared/hcm-lite.yml`.

## Verification

- `scripts/api-smoke.mjs` — auth, setup, password change, logout
- `scripts/api-smoke-m2.mjs` — org CRUD, users, employees, search/paging, CSV import/export, RBAC, audit rows
- `scripts/api-smoke-m3m5.mjs` — attendance status rules, leave working-day math + 422s, payroll numbers
  (proration, deductions, tax slabs), finalize lock, payslip PDF magic bytes
- `scripts/api-smoke-m6.mjs` — dashboard KPIs, filters and role scoping
- `scripts/api-smoke-m7a.mjs` — AI tools, salary refusal, rate limiting, `ai_logs`
- `scripts/api-smoke-m8.mjs` — announcements, notifications, audit viewer permissions
- `scripts/api-smoke-demo-seed.mjs` — sample-data loader (API + UI, 1440/375)
- `scripts/e2e-full.mjs` — the whole journey from an empty database through the UI (18 checks)
- `scripts/deployed-check.mjs` — live URL walkthrough with Playwright (desktop + 375 px screenshots)

Each smoke script boots `next start` on its own port against a throwaway SQLite file, so they can run
without touching `dev.db`.

## Scope

Shipped: the nine modules above, end to end, from an empty database.

Not shipped (out of scope by decision): camera/geofence attendance, email/SMS delivery, multi-company
tenancy, recruitment, performance, documents, org chart, mobile app, and editing a finalized payroll run.
