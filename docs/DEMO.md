# HCM Lite — 5-minute demo script (300 s)

**Live:** https://hcm-lite.thetrillioniar.me · **Repo:** https://github.com/Abdulhadi446/hcm-lite

Everything below is done live, in one browser window, in the order the brief asks for.
Total on stage: **300 s** — the *Seconds* column reads `duration · running clock`.

## Cheat sheet (one screen)

| | |
|---|---|
| **Live URL** | https://hcm-lite.thetrillioniar.me |
| **Repo** | https://github.com/Abdulhadi446/hcm-lite |
| **Reset to a fresh install** | `bash scripts/reset-deployed-db.sh` (≈20 s) → the app then opens at `/setup` |
| **Logins you create live** | Admin `admin@zaitoon.test` / `Admin@12345` · HR `hr@zaitoon.test` / `Hr@12345` · Employee `bilal@zaitoon.test` gets a **one-time password** at registration (change forced on first sign-in) |
| **Sample-data fast path** | Admin → **Organization → Company → Load sample data** → 6 employees, logins `firstname.lastname@hcm.demo` / `Demo@12345` → jump to steps **9–14** |
| **Handy URLs** | `/dashboard` · `/leave?status=pending` (approval queue) · `/payroll` · `/audit` · `/ai` |
| **Second tab** | keep `/audit` open in a second tab — it is the "prove it" tab |

**Beat map:** ① setup `0:00–1:10` · ② people + password + check-in `1:10–2:15` · ③ smart leave →
approve `2:15–3:00` · ④ dashboard Summarize → assistant → payroll → finalize `3:00–4:05` ·
⑤ payslip → salary refusal → audit `4:05–5:00`.

**Fast path (if live data entry runs short):** right after the setup wizard, as Admin click
**Organization → Company → Load sample data**. It seeds 6 employees, 30 weekdays of attendance,
leave history, a finalized previous month plus a current draft of payroll, announcements and
pending corrections — then jump straight to steps 9–14. Use it as the fallback, not the plan.

## The script

| # | Seconds | Do | Say |
|---|---|---|---|
| 1 | 35 · 0:35 | Open the URL on a reset install → `/setup` step 1: company **Zaitoon Textiles**, day starts **09:00** (the 15-minute grace period is applied automatically) → **Continue** → step 2: admin `admin@zaitoon.test` / `Admin@12345` → **Create company**. | "Fresh install — no seed data. The Admin creates the company first, and those office hours drive every calculation downstream." |
| 2 | 20 · 0:55 | Organization → **Company**: show weekend / grace / half-day rules and set the office **location** (**Use my location** → lat/lng) → save → add departments **Production**, **Sales**. | "Weekends, grace and the office location live in one place — and departments drive every breakdown you'll see later." |
| 3 | 15 · 1:10 | Glance at **Leave types** (annual 14, sick 8, casual 10, unpaid ∞) → **Logins** → create the HR login `hr@zaitoon.test` with password `Hr@12345` (leave the password blank and a one-time password is generated instead). | "Quotas are policy, not code — and one screen creates the HR login. Nobody touches the database." |
| 4 | 30 · 1:40 | Sign out → sign in as **HR** → Employees → Register **Bilal Khan** (email `bilal@zaitoon.test`, Production, Operator, basic 60,000) and show the **salary preview** (gross = 1.5 × basic) and the **one-time password** dialog → register **Hira Yousaf** (`hira@zaitoon.test`, Sales, 100,000). | "HR registers people; registration creates the login in the same step and hands out a one-time password." |
| 5 | 20 · 2:00 | Sign out → sign in as **Bilal** (`bilal@zaitoon.test`) with the temporary password → forced **change password** → set a new one. | "First sign-in forces a password change — a temporary credential never stays alive." |
| 6 | 15 · 2:15 | As Bilal: **My Attendance → Check in**. Switch to the HR tab: the attendance board now shows him **Present**. | "The punch is stamped by the server, not the browser clock — and HR sees the day live." |
| 7 | 25 · 2:40 | As Bilal: **My Leave** → in **Describe your leave** type plain words: `annual leave next Monday and Tuesday, family event` → **Fill form** → the **Apply for leave** dialog opens **pre-filled** (type, dates, reason, **2 working days**) → review → **Send request**. | "A sentence in, a validated form out — quotas, weekends and working-day math applied before you confirm." |
| 8 | 20 · 3:00 | As HR: **Leave → pending** → **Approve** with a comment → Bilal's balance drops by 2 days. | "Approval is HR-only, notifies the employee, and updates the balance immediately." |
| 9 | 20 · 3:20 | As HR: **Dashboard** — KPI cards, trend, department breakdown → click **Summarize** → 3–5 insight bullets appear, labelled AI-generated (rules-based fallback if the AI is down). | "One click turns today's numbers into sentences — and it says plainly that the writing is AI-generated." |
| 10 | 20 · 3:40 | **AI Assistant** → ask `Who is on leave today?` → the answer comes back with its tool trace. | "Tool calling, not guessing: the model only sees what the tool returns, scoped to the caller's role." |
| 11 | 25 · 4:05 | HR → **Payroll** → month picker → **Create draft** → per-employee gross, absence deduction, tax slab, net → sign in as **Admin** → **Finalize & lock**. | "Gross = 1.5 × basic, per-day = gross ÷ working days, tax from the annualised slab. Only Admin finalizes — the month then locks." |
| 12 | 20 · 4:25 | As Bilal: **Payslips** → open this month's slip → **Download** the PDF. | "Generated server-side, downloadable, and reproducible from its own inputs." |
| 13 | 15 · 4:40 | Still Bilal → **AI Assistant** → ask `What is Hira's salary?` → **refused**. | "Compensation is refused before the model is even called — role scope is enforced in code, not in the prompt." |
| 14 | 20 · 5:00 | As **Admin** → **Audit** → the password change, the leave approval and the payroll finalize, each with actor and before/after diff. | "Every write is audited with actor, entity and diff — the numbers on the dashboard are defensible." |
| | **300** | **Total — 5:00** | |

## If something breaks on stage

- **Server not answering:**
  `ssh tests2 'export PATH=/opt/node22/bin:$PATH; cd ~/hcm-lite/app; nohup node_modules/.bin/next start -p 3200 >> ~/hcm-lite/logs/app.log 2>&1 & echo $! > ~/hcm-lite/app.pid'`
- **Want a clean slate mid-demo:** `bash scripts/reset-deployed-db.sh`, then redo step 1 (≈40 s).
- **Run out of time:** stay signed in as the Admin from step 1 → Organization → Company →
  **Load sample data** → jump to steps 9–14. The six seeded employees sign in as
  `firstname.lastname@hcm.demo` / `Demo@12345` (e.g. `ayesha.khan@hcm.demo`); add `?status=pending`
  to `/leave` to show the approval queue.
- **Smart leave or Summarize is slow / rate-limited:** the UI shows the fallback state and the form has
  a **Fill manually** button — say "the assistant degrades gracefully; the data screens never depend
  on it", fill the same form by hand, and keep going.
- **AI answer slow:** same line — the assistant degrades gracefully, the dashboards never depend on it.
