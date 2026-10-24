# Current Task

## Task
M0 — Foundation (schema, auth, scope guards, app shell)

## Description
Per TASK.md: SQLite schema + migrations, settings singleton, first-run Admin creation,
JWT login (bcrypt, httpOnly cookie), `requireRole` / data-scope helpers, role-based app shell.
Acceptance: can create Admin on empty DB, log in as Admin, see Admin menu; wrong-role API call returns 403.

## Status
- [x] In progress

## Notes
- UI lane complete: globals.css theme tokens, layout.tsx, page.tsx root redirect, lib/nav.ts, components/app-shell.tsx, components/page-placeholder.tsx, dashboard page, all 11 placeholder pages, setup/login/change-password pages.
- Logs: ./.agent-logs/
- Decisions: OpenRouter free model, tests2 deploy, no bonus camera until 25 features ship, ~6h budget.
- Still depends on backend lane: /api/setup/status, /api/setup, /api/auth/login, /api/auth/me, /api/auth/logout, /api/auth/change-password. Until then, /login 401 redirect path verifies shell.
