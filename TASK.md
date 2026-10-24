# TASK — HCM Lite (Saylani Hackathon, 24 Oct 2026)

## Problem summary
Web HCM for a real HR team: three roles (Admin / HR / Employee), each with its own menu, data scope and dashboard, plus an AI assistant that answers **only from data in the DB** via tool calling. Nothing is pre-loaded — a fresh install starts empty. Admin sets up the company, HR registers employees (registration creat2es their login), employees check in and request leave, HR approves and runs payroll, Admin finalizes. Judges do a fresh install during judging and check that dashboards and AI answers match the records they just created.

9 modules, 25 functionalities: M1 Auth & Access · M2 Org Setup · M3 Employees · M4 Attendance · M5 Leave · M6 Payroll Lite · M7 Dashboards · M8 AI Assistant · M9 Comms & Audit.

## Locked decisions
- Stack: Next.js 16 App Router + Tailwind + shadcn/ui, API routes, SQLite on disk (`dev.db`).
- AI: OpenRouter free model via OpenAI-compatible client (`OPENAI_BASE_URL=https://openrouter.ai/api/v1`), key server-only.
- Host: tests2 via SSH + cloudflared (persistent disk keeps SQLite alive), see `.opencode/skills/deploy`.
- Bonus camera/geofence: **not now** — only if all 25 core functions are shipped and demo-ready.
- Budget: ~6 hours → M0–M8 required, M9 kept to build + README + deploy + demo rehearsal.

## Core flow (end-to-end)
1. **First run** → company name + Admin account (or `ADMIN_EMAIL` / `ADMIN_PASSWORD`) → JWT login (bcrypt).
2. **Admin setup** → office hours, grace, weekend, office lat/lng + radius, departments, designations, leave types + quotas, holidays; creates HR login.
3. **HR registers employee** → job details + salary → temp password login, forced password change on first sign-in.
4. **Daily use** → Employee web check-in/out (server stamps time; one record/day, second check-in = 409), views calendar, applies/cancels leave, requests attendance correction, downloads payslip, edits own phone/address.
5. **HR ops** → daily attendance board, approve corrections, approve/reject leave with comment (working days only, overlap/over-balance = 422), create monthly payroll draft.
6. **Payroll** → gross = 1.5 × basic (HRA 40%, medical 10%), per-day deductions for absent/unpaid/0.5 × half-day, prorate joiners/leavers, tax slab on gross × 12. Admin finalizes → month locked → payslip PDF.
7. **Dashboards** → all KPIs computed server-side from the DB, filterable by date range + department, scoped per role.
8. **AI** → chat panel → `POST /ai/chat` → model picks a tool → backend runs it **with the caller's scope** → model writes the answer. Plus dashboard summary, smart leave (sentence → validated JSON → pre-filled form), policy Q&A. 20 req/user/hr, 15 s timeout, friendly fallback, `ai_logs`, "AI-generated" label.
9. **Comms & audit** → announcements on dashboards, in-app notifications, audit log (actor / action / entity / before-after JSON).

## Milestones (small, ordered)
| # | Milestone | Done when |
|---|---|---|
| M0 | Foundation | SQLite schema + migrations, `settings` singleton, auth (bcrypt + JWT cookie), `requireRole` / data-scope guard helpers, app shell with role menus |
| M1 | First-run + org setup | Setup wizard creates Admin; Admin CRUD for company settings, departments, designations, leave types/quotas, holidays, HR logins |
| M2 | Employees | HR register (creates login + temp password), directory with server search/filter/paging, Employee 360, own-profile edit, CSV dry-run import + export |
| M3 | Attendance | Check-in/out, 409 on duplicate, status rules (late > 09:15, half_day < 5 h, absent, missing_checkout), calendar, daily board, correction request/approve |
| M4 | Leave | Apply/cancel, working-day math, quota + overlap validation, approval inbox with comment, balance + history |
| M5 | Payroll | Salary structures, monthly run draft, deductions + tax + proration, Admin finalize/lock, payslip PDF, notification on payslip |
| M6 | Dashboards | Admin / HR / Employee KPIs, trends, dept breakdowns, filters — numbers match the DB |
| M7 | AI assistant | Tools reuse services + scope, chat, dashboard summary, smart leave, policy Q&A, refusal on other people's salary, rate limit / timeout / logs |
| M8 | Comms & audit | Announcements (Admin/HR post, all read), notifications, audit log viewer, audit writes on create/update/approve/finalize |
| M9 | Ship | Empty/loading/error states, responsive 375px+, `npm run build` clean, README, deploy, 5-min demo rehearsal |

## Out of scope
- Mobile app, camera/face attendance, geofence check (bonus only — revisit after M9 if time remains)
- Bonus extras: attrition risk score, absence anomaly flags, late-penalty rule, Roman Urdu, dark mode/PWA
- Email/SMS delivery, real statutory/tax compliance, multi-company tenancy, i18n, recruitment, performance, documents, org chart
- Editing a finalized payroll run; deleting audit entries; password self-reset by email

## Definition of done
- Hosted URL opens at first-run setup, works from empty with no dummy data.
- All 25 checklist functions work end to end; every API enforces role + data scope server-side (Employee reads only own rows, never salary of others; AI refuses).
- Attendance/leave/payroll states derive from the M2 rules; finalized payroll is immutable.
- Dashboard KPIs and AI answers match records created live; filters work.
- AI key server-only, ~20 req/user/hr, 15 s timeout with friendly fallback, `ai_logs` written, answers labelled "AI-generated".
- `npm run build` passes; README covers stack, run steps, first Admin, AI key, done/not-done; repo pushed; live link + 5-min demo script.
