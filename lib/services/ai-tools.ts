import "server-only";
import { z } from "zod";
import type { SessionUser } from "@/lib/auth";
import { queryAll } from "@/lib/db";
import { isIsoDate, monthRange, todayIso, workingDaysBetween } from "@/lib/dates";
import { listEmployees, toScope } from "./employees";
import { board, myMonth } from "./attendance";
import { listBalances, listLeaveRequests } from "./leave";
import { listPayslips } from "./payroll";
import { getSettings, listHolidays, listLeaveTypes } from "./org";
import type { AiToolDefinition } from "@/lib/ai/client";

/**
 * M7 tool layer: JSON schemas + dispatcher.
 *
 * Every tool receives the caller's `SessionUser` and reuses the existing
 * services, so an Employee always gets their own slice of company-wide data.
 * Results are compact JSON (≤ 2 KB) — enough for the model, cheap on tokens.
 */

const LIMIT = 2048;

function jsonWithinBudget(value: unknown, limit = LIMIT): string {
  const full = JSON.stringify(value);
  if (full.length <= limit) return full;
  const record = value as { items?: unknown[] } | null;
  if (record && Array.isArray(record.items)) {
    for (let n = record.items.length - 1; n >= 0; n -= 1) {
      const candidate = JSON.stringify({
        ...record,
        items: record.items.slice(0, n),
        truncated: true,
      });
      if (candidate.length <= limit) return candidate;
    }
  }
  return JSON.stringify({
    truncated: true,
    note: "Result too large; ask a narrower question.",
  });
}

function compactName(value: string | null | undefined): string {
  return String(value ?? "").trim();
}

// --------------------------------------------------------------- helpers

function headcountFor(session: SessionUser): { active: number; probation: number; total: number } {
  const scope = toScope(session);
  const active = listEmployees({ status: "active", pageSize: 1 }, scope).total;
  const probation = listEmployees({ status: "probation", pageSize: 1 }, scope).total;
  return { active, probation, total: active + probation };
}

function monthsInRange(from: string, to: string): string[] {
  if (!isIsoDate(from) || !isIsoDate(to) || from > to) return [];
  const months: string[] = [];
  const [fy, fm] = from.split("-").map(Number);
  const [ty, tm] = to.split("-").map(Number);
  let year = fy;
  let month = fm;
  while (year < ty || (year === ty && month <= tm)) {
    months.push(`${year}-${String(month).padStart(2, "0")}`);
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
    if (months.length > 12) break;
  }
  return months;
}

function emptySummary() {
  return {
    present: 0,
    late: 0,
    halfDay: 0,
    absent: 0,
    onLeave: 0,
    missingCheckout: 0,
    hoursThisWeek: 0,
    lateThisMonth: 0,
  };
}

function attendanceRate(present: number, late: number, half: number, onLeave: number, expected: number): number {
  if (expected <= 0) return 0;
  return Math.round(((present + late + half + onLeave) / expected) * 1000) / 10;
}

// ------------------------------------------------------------- zod args

const headcountArgs = z.object({
  departmentId: z.number().int().positive().optional(),
});

const attendanceArgs = z.object({
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).optional(),
  from: z.string().optional(),
  to: z.string().optional(),
});

const lateArgs = z.object({
  date: z.string().optional(),
});

const leaveSummaryArgs = z.object({
  status: z.enum(["pending", "approved", "rejected", "cancelled"]).optional(),
});

const myBalanceArgs = z.object({
  employeeId: z.number().int().positive().optional(),
});

const payrollArgs = z.object({
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).optional(),
  employeeId: z.number().int().positive().optional(),
});

const searchArgs = z.object({
  query: z.string().trim().min(1).max(80),
});

const policyArgs = z.object({});

type HeadcountArgs = z.infer<typeof headcountArgs>;
type AttendanceArgs = z.infer<typeof attendanceArgs>;
type LateArgs = z.infer<typeof lateArgs>;
type LeaveSummaryArgs = z.infer<typeof leaveSummaryArgs>;
type MyBalanceArgs = z.infer<typeof myBalanceArgs>;
type PayrollArgs = z.infer<typeof payrollArgs>;
type SearchArgs = z.infer<typeof searchArgs>;

// ----------------------------------------------------------- tool bodies

function toolHeadcount(args: HeadcountArgs, session: SessionUser) {
  if (session.role === "employee") {
    const own = listEmployees({ pageSize: 1 }, toScope(session)).items[0];
    return {
      scope: "self",
      you: own
        ? {
            name: own.fullName,
            code: own.code,
            department: own.departmentName,
            status: own.status,
          }
        : null,
      note: "Employees only see their own headcount slice.",
    };
  }

  const totals = headcountFor(session);
  const { items } = listEmployees(
    { pageSize: 100, departmentId: args.departmentId ?? null },
    toScope(session)
  );
  const byDepartment = new Map<string, number>();
  for (const employee of items) {
    if (employee.status !== "active" && employee.status !== "probation") continue;
    const key = compactName(employee.departmentName) || "Unassigned";
    byDepartment.set(key, (byDepartment.get(key) ?? 0) + 1);
  }
  return {
    active: totals.active,
    probation: totals.probation,
    total: totals.total,
    departmentId: args.departmentId ?? null,
    byDepartment: Array.from(byDepartment.entries())
      .map(([department, count]) => ({ department, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 12),
    asOf: todayIso(),
  };
}

function toolAttendance(args: AttendanceArgs, session: SessionUser) {
  const today = todayIso();
  let from = args.from && isIsoDate(args.from) ? args.from : undefined;
  let to = args.to && isIsoDate(args.to) ? args.to : undefined;
  const month = args.month ?? (from ? from.slice(0, 7) : today.slice(0, 7));

  if (!from && !to) {
    const bounds = monthRange(month);
    from = bounds.start;
    to = bounds.end;
  }
  if (!from) from = `${month}-01`;
  if (!to) to = monthRange(month).end;
  if (from > to) [from, to] = [to, from];

  const months = monthsInRange(from, to);
  const summary = emptySummary();

  for (const monthKey of months) {
    const part =
      session.role === "employee"
        ? myMonth(session, monthKey).summary
        : board(session, { month: monthKey }).summary;
    summary.present += part.present;
    summary.late += part.late;
    summary.halfDay += part.halfDay;
    summary.absent += part.absent;
    summary.onLeave += part.onLeave;
    summary.missingCheckout += part.missingCheckout;
    summary.hoursThisWeek = part.hoursThisWeek;
    summary.lateThisMonth = part.lateThisMonth;
  }

  const settings = getSettings();
  const holidays = listHolidays().map((holiday) => holiday.date);
  const workingDays = workingDaysBetween(from, to, settings.weekendDays, holidays);
  const people =
    session.role === "employee" && session.employeeId !== null
      ? 1
      : headcountFor(session).total;

  return {
    from,
    to,
    scope: session.role === "employee" ? "self" : "company",
    ...summary,
    attendanceRate: attendanceRate(
      summary.present,
      summary.late,
      summary.halfDay,
      summary.onLeave,
      people * workingDays
    ),
  };
}

function toolLateComers(args: LateArgs, session: SessionUser) {
  const date = args.date && isIsoDate(args.date) ? args.date : todayIso();

  if (session.role === "employee") {
    const day = myMonth(session, date.slice(0, 7)).days.find((entry) => entry.date === date);
    return {
      date,
      scope: "self",
      late: day?.status === "late",
      checkInAt: day?.checkInAt ?? null,
    };
  }

  const rows = board(session, { date }).items.filter((row) => row.status === "late");
  return {
    date,
    count: rows.length,
    items: rows.slice(0, 20).map((row) => ({
      name: row.fullName,
      department: row.departmentName,
      checkInAt: row.checkInAt,
    })),
    truncated: rows.length > 20,
  };
}

function toolLeaveSummary(args: LeaveSummaryArgs, session: SessionUser) {
  const { items } = listLeaveRequests(session, { status: args.status });
  const counts = { pending: 0, approved: 0, rejected: 0, cancelled: 0 };
  for (const item of items) {
    counts[item.status] += 1;
  }
  const pending = items
    .filter((item) => item.status === "pending")
    .slice(0, 5)
    .map((item) => ({
      employee: item.employeeName,
      type: item.leaveTypeName,
      from: item.startDate,
      to: item.endDate,
      days: item.days,
    }));
  return {
    scope: session.role === "employee" ? "self" : "company",
    statusFilter: args.status ?? "all",
    counts,
    totalRequests: items.length,
    pendingSample: pending,
  };
}

function toolMyLeaveBalance(args: MyBalanceArgs, session: SessionUser) {
  const employeeId =
    session.role === "employee" ? session.employeeId : args.employeeId ?? session.employeeId;

  if (employeeId === null) {
    return {
      error: "no_employee_profile",
      message: "This account has no employee profile, so there is no leave balance.",
    };
  }

  const { items } = listBalances(session, { employeeId });
  return {
    employeeId,
    balances: items.map((balance) => ({
      type: balance.typeName,
      quota: balance.quota,
      used: balance.used,
      pending: balance.pending,
      remaining: balance.remaining,
    })),
  };
}

function toolPayrollSummary(args: PayrollArgs, session: SessionUser) {
  const employeeId =
    session.role === "employee" ? session.employeeId : args.employeeId;
  const { items } = listPayslips(session, employeeId ? { employeeId } : {});

  if (session.role === "employee") {
    const own = items
      .filter((slip) => !args.month || slip.month === args.month)
      .slice(0, 6)
      .map((slip) => ({
        month: slip.month,
        net: slip.net,
        gross: slip.gross,
        deductions: slip.deductions,
        tax: slip.tax,
      }));
    return {
      scope: "self",
      employeeId: session.employeeId,
      month: args.month ?? null,
      payslips: own,
      note: own.length === 0 ? "No payslip has been generated for you yet." : undefined,
    };
  }

  const filtered = args.month ? items.filter((slip) => slip.month === args.month) : items;
  if (employeeId) {
    return {
      scope: "employee",
      employeeId,
      month: args.month ?? null,
      payslips: filtered.slice(0, 6).map((slip) => ({
        month: slip.month,
        employee: slip.employeeName,
        net: slip.net,
        gross: slip.gross,
      })),
    };
  }

  const byMonth = new Map<string, { count: number; net: number; gross: number }>();
  for (const slip of filtered) {
    const entry = byMonth.get(slip.month) ?? { count: 0, net: 0, gross: 0 };
    entry.count += 1;
    entry.net += slip.net;
    entry.gross += slip.gross;
    byMonth.set(slip.month, entry);
  }
  return {
    scope: "company",
    months: Array.from(byMonth.entries())
      .sort((a, b) => (a[0] < b[0] ? 1 : -1))
      .slice(0, 4)
      .map(([month, entry]) => ({
        month,
        employeeCount: entry.count,
        totalNet: Math.round(entry.net * 100) / 100,
        totalGross: Math.round(entry.gross * 100) / 100,
      })),
  };
}

function toolSearchEmployees(args: SearchArgs, session: SessionUser) {
  const { items, total } = listEmployees(
    { q: args.query, pageSize: 8 },
    toScope(session)
  );
  return {
    query: args.query,
    total,
    items: items.map((employee) => ({
      id: employee.id,
      name: employee.fullName,
      code: employee.code,
      department: employee.departmentName,
      designation: employee.designationName,
      status: employee.status,
    })),
  };
}

function toolPolicy() {
  const settings = getSettings();
  const year = todayIso().slice(0, 4);
  return {
    company: settings.companyName,
    officeStart: settings.officeStart,
    graceMinutes: settings.graceMinutes,
    halfDayMinutes: settings.halfDayMinutes,
    weekendDays: settings.weekendDays,
    leaveTypes: listLeaveTypes().map((type) => ({
      id: type.id,
      name: type.name,
      quotaDays: type.quotaDays,
      paid: type.paid,
    })),
    holidays: listHolidays(Number(year)).slice(0, 12).map((holiday) => ({
      date: holiday.date,
      name: holiday.name,
    })),
  };
}

// --------------------------------------------------------------- schemas

export const AI_TOOLS: AiToolDefinition[] = [
  {
    type: "function",
    function: {
      name: "get_headcount",
      description:
        "Current headcount (active + probation employees), optionally filtered by department. Employees get only their own slice.",
      parameters: {
        type: "object",
        properties: {
          departmentId: { type: "number", description: "Optional department id filter." },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_attendance_summary",
      description:
        "Attendance counts (present, late, half day, absent, on leave) plus attendance rate for a month or date range.",
      parameters: {
        type: "object",
        properties: {
          month: { type: "string", description: "Month like 2026-09. Defaults to the current month." },
          from: { type: "string", description: "Start date YYYY-MM-DD." },
          to: { type: "string", description: "End date YYYY-MM-DD." },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_late_comers",
      description: "List employees whose check-in was late on a given date (default today).",
      parameters: {
        type: "object",
        properties: {
          date: { type: "string", description: "Date YYYY-MM-DD. Defaults to today." },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_leave_summary",
      description: "Leave request counts by status, plus a short sample of pending requests.",
      parameters: {
        type: "object",
        properties: {
          status: {
            type: "string",
            enum: ["pending", "approved", "rejected", "cancelled"],
            description: "Optional status filter.",
          },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_my_leave_balance",
      description:
        "The caller's own leave balances. Employees always get their own balance; HR/Admin may pass employeeId.",
      parameters: {
        type: "object",
        properties: {
          employeeId: { type: "number", description: "Only honored for HR/Admin callers." },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_payroll_summary",
      description:
        "Payroll totals by month for HR/Admin. An Employee only ever receives their own payslip figures.",
      parameters: {
        type: "object",
        properties: {
          month: { type: "string", description: "Month like 2026-09. Optional." },
          employeeId: { type: "number", description: "Only honored for HR/Admin callers." },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_employees",
      description: "Search employees by name, code or email. Returns names and departments (no salary).",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Name, employee code or email fragment." },
        },
        required: ["query"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_policy",
      description:
        "Company policy: office hours, grace period, half-day threshold, weekend days, leave types with quotas, and holidays.",
      parameters: { type: "object", properties: {}, additionalProperties: false },
    },
  },
];

// ------------------------------------------------------------ dispatcher

type ToolHandler = (args: unknown, session: SessionUser) => unknown;

const HANDLERS: Record<
  string,
  { schema: z.ZodType; handler: ToolHandler }
> = {
  get_headcount: {
    schema: headcountArgs,
    handler: (args, session) => toolHeadcount(args as HeadcountArgs, session),
  },
  get_attendance_summary: {
    schema: attendanceArgs,
    handler: (args, session) => toolAttendance(args as AttendanceArgs, session),
  },
  get_late_comers: {
    schema: lateArgs,
    handler: (args, session) => toolLateComers(args as LateArgs, session),
  },
  get_leave_summary: {
    schema: leaveSummaryArgs,
    handler: (args, session) => toolLeaveSummary(args as LeaveSummaryArgs, session),
  },
  get_my_leave_balance: {
    schema: myBalanceArgs,
    handler: (args, session) => toolMyLeaveBalance(args as MyBalanceArgs, session),
  },
  get_payroll_summary: {
    schema: payrollArgs,
    handler: (args, session) => toolPayrollSummary(args as PayrollArgs, session),
  },
  search_employees: {
    schema: searchArgs,
    handler: (args, session) => toolSearchEmployees(args as SearchArgs, session),
  },
  get_policy: {
    schema: policyArgs,
    handler: toolPolicy,
  },
};

export type ToolTrace = { name: string; ms: number };

export type ToolRun = { name: string; ms: number; content: string };

function parseArgs(rawArgs: string): unknown {
  if (!rawArgs || !rawArgs.trim()) return {};
  try {
    return JSON.parse(rawArgs);
  } catch {
    return null;
  }
}

/** Schema-validate args, run the handler, and return compact JSON. */
export async function dispatchTool(
  name: string,
  rawArgs: string,
  session: SessionUser
): Promise<ToolRun> {
  const started = Date.now();
  const entry = HANDLERS[name];
  if (!entry) {
    return {
      name,
      ms: Date.now() - started,
      content: JSON.stringify({ error: "unknown_tool", name }),
    };
  }

  const parsed = parseArgs(rawArgs);
  if (parsed === null) {
    return {
      name,
      ms: Date.now() - started,
      content: JSON.stringify({ error: "invalid_tool_arguments" }),
    };
  }

  const validated = entry.schema.safeParse(parsed);
  if (!validated.success) {
    return {
      name,
      ms: Date.now() - started,
      content: JSON.stringify({
        error: "invalid_tool_arguments",
        issues: validated.error.issues.map((issue) => issue.message).slice(0, 3),
      }),
    };
  }

  try {
    const result = entry.handler(validated.data, session);
    return { name, ms: Date.now() - started, content: jsonWithinBudget(result) };
  } catch (err) {
    return {
      name,
      ms: Date.now() - started,
      content: JSON.stringify({
        error: "tool_failed",
        message: err instanceof Error ? err.message.slice(0, 200) : "unknown",
      }),
    };
  }
}

/** Convenience helper for callers that only need the JSON string. */
export async function runTool(
  name: string,
  rawArgs: string,
  session: SessionUser
): Promise<string> {
  return (await dispatchTool(name, rawArgs, session)).content;
}

// ------------------------------------------------------- salary privacy

const SALARY_RE =
  /\b(salary|salaries|pay|payslips?|ctc|package|compensation|net\s*pay|gross\s*pay|earnings?|income)\b/i;

const EVERYONE_RE =
  /\b(everyone|everybody|all\s+(employees|staff|people)|whole\s+team|entire\s+team|company[-\s]?wide|others?|colleagues?|team)\b/i;

export const SALARY_REFUSAL =
  "I can't share salary or payslip details for other employees — compensation is private. I can help with your own payslip, leave balance or attendance instead.";

/**
 * Post-check from the contract: an Employee probing someone else's salary is
 * refused before any model call (and before any tool could run).
 */
export function refuseIfSalaryProbe(text: string, session: SessionUser): string | null {
  if (session.role !== "employee") return null;
  const lower = text.toLowerCase();
  if (!SALARY_RE.test(lower)) return null;

  if (EVERYONE_RE.test(lower)) return SALARY_REFUSAL;

  const others = queryAll<{ id: number; full_name: string; code: string }>(
    "SELECT id, full_name, code FROM employees"
  ).filter((employee) => Number(employee.id) !== session.employeeId);

  for (const employee of others) {
    const full = employee.full_name.toLowerCase();
    const first = full.split(/\s+/)[0] ?? "";
    const code = employee.code.toLowerCase();
    const ownName =
      session.name.toLowerCase() === full ||
      session.name.toLowerCase().split(/\s+/)[0] === first;

    if (ownName) continue;
    if (full && lower.includes(full)) return SALARY_REFUSAL;
    if (code && lower.includes(code)) return SALARY_REFUSAL;
    if (first.length >= 3 && new RegExp(`\\b${first.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(lower)) {
      return SALARY_REFUSAL;
    }
  }
  return null;
}
