# HCM Lite — 6-minute demo script

Live: https://hcm-lite.thetrillioniar.me · Repo: https://github.com/Abdulhadi446/hcm-lite

Reset to a truly empty install before presenting: `bash scripts/reset-deployed-db.sh` (≈20 s).

**Fast path (judged demo, 30 s):** after the setup wizard, as Admin open **Organization → Company →
Load sample data**. It seeds 6 employees (`…@demo.hcm` / `Demo@12345`), 30 weekdays of attendance,
leave history, a finalized September payroll plus an October draft, announcements and pending
corrections — then jump straight to steps 10–12 (dashboard, AI, audit) or use it as a fallback if
live data entry runs out of time. Add `?status=pending` to `/leave` to show the approval queue.
Everything below is created live, in this order, in one browser window. Have a second tab on
`/audit` — it is the "prove it" tab.

| # | Time | Do | Say |
|---|---|---|---|
| 1 | 0:00 | Open the URL. Wizard: company **Zaitoon Textiles**, office 09:00, grace 15, half-day 5 h, weekend Sat/Sun → Continue → admin `admin@zaitoon.test` / `Admin@12345` → **Create company**. | "Fresh install ships empty — no seed data. The Admin sets the company up first, and those values drive every calculation downstream." |
| 2 | 0:40 | Organization → add departments *Production*, *Sales*; leave types are already seeded (annual 14, sick 8, casual 10, unpaid ∞). | "Policy lives in one place: attendance rules, leave quotas, holidays, logins." |
| 3 | 1:10 | Employees → Register employee: Bilal Khan, Production, designation Operator, basic salary 60,000, joined first of this month. Show the **salary preview** (gross = 1.5 × basic) and the one-time credential dialog. Add a second employee, Hira, Sales, 100,000. | "Registering an employee creates their login in the same step — HR never touches the database." |
| 4 | 2:00 | Sign out → sign in as **HR** → Attendance board. | "HR sees the whole company for today: who is in, who is late, who is on leave, who has no record." |
| 5 | 2:20 | Sign in as **Bilal** (employee) → My Attendance → Check in. Back as HR: the board now shows him present. | "Check-in is server-stamped — the browser clock cannot fake it." |
| 6 | 2:50 | As Bilal: My Leave → apply annual leave next Mon–Tue, reason "family event". Shows **2 working days**, not 4 calendar days. | "Quotas and working days are computed from company policy, weekends and holidays excluded." |
| 7 | 3:20 | As HR: Leave → approve with a comment. Then try applying leave that overlaps → **422 overlap** (optional, if time). | "Approval is HR-only, notifies the employee, and updates the balance immediately." |
| 8 | 3:50 | As Admin/HR: Payroll → month picker → **Create draft**. Show per-employee gross, absences deducted, tax slab, net. Then **Finalize & lock** (Admin), and try an attendance correction for that month → blocked. | "Gross is 1.5 × basic, per-day is gross ÷ working days, absences and half-days are deducted, tax uses the annualised slab. Finalizing locks the month." |
| 9 | 4:40 | Open a payslip PDF. | "Downloadable payslip, generated server-side." |
| 10 | 5:00 | Dashboard: KPI cards, trend chart, department breakdown; switch the date range and department filter. | "Every number here is derived from the rows we just created." |
| 11 | 5:25 | AI Assistant: "Who was late today?" → answer with tool trace. Then "How many leave days do I have left?" as the employee. Then as employee ask "What is Hira's salary?" → refusal. | "Tool calling, not guessing: the model can only see what these tools return, scoped to the caller's role. Answers carry an AI-generated label." |
| 12 | 5:50 | Audit tab: show the leave approval and the payroll finalize with before/after values. | "Every write is audited with actor, entity and diff — the numbers are defensible." |

## If something breaks on stage
- Server not answering: `ssh tests2 'export PATH=/opt/node22/bin:$PATH; cd ~/hcm-lite/app; nohup node_modules/.bin/next start -p 3200 >> ~/hcm-lite/logs/app.log 2>&1 & echo $! > ~/hcm-lite/app.pid'`
- Want a clean slate mid-demo: `bash scripts/reset-deployed-db.sh`, then redo step 1 (≈40 s).
- AI answer slow or rate-limited: the UI shows the fallback/limit state; say "the assistant degrades gracefully — the data screens never depend on it."
