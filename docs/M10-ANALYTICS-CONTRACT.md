# M10 contract — analytics depth (#18) + AI dashboard summary (#20)

Closes the two gaps left against the official brief. Formulas come from the brief (Section 7); they must live
in `lib/services/analytics.ts` only.

## 1. Metric corrections (existing fields)

`attendanceRate` (company **and** per department) must become:

```
numerator   = present + late + missing_checkout + 0.5 × half_day
denominator = expected working days − approved on-leave days
```

i.e. a `missing_checkout` row counts as present, a half day counts 0.5, and approved leave is removed from the
denominator instead of being added to the numerator. `absenteeismRate` = `absent ÷ expected working days`
(the leave-adjusted denominator), still expressed as a percentage. Keep `latePct` = `late ÷ (present + late)`.

`missing_checkout` days must be counted from `attendance.status` (the existing status model), not inferred.

## 2. New KPI fields on `DashboardKpis`

| field | definition |
|---|---|
| `avgSalary: number` | mean monthly gross (`1.5 × basic_salary`) over the in-scope roster with `basic_salary > 0`; 2 dp |
| `attritionYtd: number` | employees with `exit_date` in the current calendar year ÷ average headcount `(start-of-year + current) / 2`, × 100, 1 dp |

## 3. New `MetricsResult.insights` block

```ts
export type LateComerRow = {
  employeeId: number; name: string; code: string;
  departmentName: string | null; lateDays: number;
};
export type LeaveTypeRow = {
  leaveTypeId: number; typeName: string;
  approvedDays: number; entitlementDays: number; utilization: number; // %
};
export type PayrollDeptRow = {
  departmentId: number | null; departmentName: string;
  headcount: number; payrollCost: number; avgSalary: number;
};
export type InsightLists = {
  topLateComers: LateComerRow[];     // ≤ 5, lateDays desc, then name asc
  leaveByType: LeaveTypeRow[];       // capped types only for entitlement; ordered by approvedDays desc
  payrollByDepartment: PayrollDeptRow[];
};
```

- `topLateComers` — `attendance.status = 'late'` within `[from, to]`, scoped by `departmentId`.
- `leaveByType` — approved leave days overlapping `[from, to]` grouped by leave type; `entitlementDays = quota_days × headcount` for `quota_days > 0` (0 → `utilization` 0, `entitlementDays` 0).
- `payrollByDepartment` — latest **finalized** payroll run in range, else the latest draft (same rule as `payrollCost`); `payrollCost` = Σ payslip `gross`, `avgSalary` = mean `gross`, grouped by the employee's current department.

`GET /api/dashboard/summary` returns them unchanged under `insights` (additive — no existing field may be removed
or renamed). `GET /api/dashboard/employee` is not changed.

## 4. AI dashboard summary (#20)

`GET /api/ai/summary?from&to&departmentId` — Admin + HR only (employee → 403).

1. Compute metrics **server-side** with the same `computeMetrics({from,to,departmentId})` (never accept KPI JSON
   from the client).
2. Send a compact JSON of the KPIs + insight lists to the model with an instruction to return **3–5 short insight
   bullets** (≤ 200 characters each, plain text, no markdown, no salary of a named individual unless the caller is
   Admin/HR, which they are — but never invent numbers that are not in the payload).
3. Response: `{ ok: true, insights: string[], aiGenerated: true, fallback: false, model, generatedAt }`.
   - AI unavailable / timeout / unparseable → **deterministic fallback derived from the same metrics**
     (`fallback: true`, `aiGenerated: false`), still 3–5 bullets, still HTTP 200.
4. Guardrails reused from `/api/ai/chat`: 15 s `AbortSignal.timeout`, 20 requests/user/hour → `429 {error:"rate_limited", retryAfterSeconds}`, one `ai_logs` row per call, API key read server-side only.
5. Never include another employee's individual salary in the bullets (aggregate payroll cost only).

UI: `components/ai/dashboard-summary.tsx` (`"use client"`, props `{ rangeQuery: string }`) — a "Summarize"
button, loading lines, bullet list, **AI-GENERATED** badge (or "Generated without AI — rules-based" when
fallback), inline error + retry, no layout shift.

## 5. Not in scope

Gender split (no gender column — do not add one now), per-department attendance trend series, attrition risk
score, absence anomaly flags, late-penalty rule. Documented as not done in the README.
