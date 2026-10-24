# Current Task

## Task
M0 — Foundation (schema, auth, scope guards, app shell)

## Description
Per TASK.md: SQLite schema + migrations, settings singleton, first-run Admin creation,
JWT login (bcrypt, httpOnly cookie), `requireRole` / data-scope helpers, role-based app shell.
Acceptance: can create Admin on empty DB, log in as Admin, see Admin menu; wrong-role API call returns 403.

## Status
- [ ] In progress

## Notes
- Logs: ./.agent-logs/
- Decisions: OpenRouter free model, tests2 deploy, no bonus camera until 25 features ship, ~6h budget.
