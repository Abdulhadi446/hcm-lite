import "server-only";
import type { SessionUser } from "@/lib/auth";
import { getDb, nowIso, queryAll, queryOne, run } from "@/lib/db";
import { ApiError } from "@/lib/guards";
import { monthRange, todayIso } from "@/lib/dates";
import { logAudit } from "./audit";
import { notFound } from "./http";
import {
  holidaySet,
  isMonthLocked,
  monthWorkingDates,
  notify,
  round2,
  settingsOrThrow,
  userForEmployee,
  workingDates,
} from "./shared";
import { getSettings } from "./org";

// ---------------------------------------------------------------- types

export type PayrollRunStatus = "draft" | "finalized";

export type PayrollRun = {
  id: number;
  month: string;
  status: PayrollRunStatus;
  workingDays: number;
  employeeCount: number;
  totalGross: number;
  totalNet: number;
  finalizedAt: string | null;
};

export type PayslipRow = {
  id: number;
  runId: number;
  employeeId: number;
  employeeName: string;
  employeeCode: string;
  departmentName: string | null;
  month: string;
  basic: number;
  hra: number;
  medical: number;
  gross: number;
  perDay: number;
  workingDays: number;
  absentDays: number;
  unpaidDays: number;
  halfDays: number;
  deductions: number;
  tax: number;
  net: number;
};

type EmployeeForPayroll = {
  id: number;
  code: string;
  full_name: string;
  join_date: string | null;
  exit_date: string | null;
  status: string;
  basic_salary: number;
};

type PayslipDbRow = {
  id: number;
  run_id: number;
  employee_id: number;
  employee_name: string;
  employee_code: string;
  department_name: string | null;
  month: string;
  working_days: number;
  basic: number;
  hra: number;
  medical: number;
  gross: number;
  per_day: number;
  absent_days: number;
  unpaid_days: number;
  half_days: number;
  deductions: number;
  tax: number;
  net: number;
};

const PAYSLIP_SELECT = `SELECT p.id, p.run_id, p.employee_id, e.full_name AS employee_name,
  e.code AS employee_code, d.name AS department_name, r.month, p.working_days,
  p.basic, p.hra, p.medical, p.gross, p.per_day, p.absent_days, p.unpaid_days,
  p.half_days, p.deductions, p.tax, p.net
  FROM payslips p
  JOIN payroll_runs r ON r.id = p.run_id
  JOIN employees e ON e.id = p.employee_id
  LEFT JOIN departments d ON d.id = e.department_id`;

function mapPayslip(row: PayslipDbRow): PayslipRow {
  return {
    id: Number(row.id),
    runId: Number(row.run_id),
    employeeId: Number(row.employee_id),
    employeeName: row.employee_name,
    employeeCode: row.employee_code,
    departmentName: row.department_name ?? null,
    month: row.month,
    basic: round2(Number(row.basic)),
    hra: round2(Number(row.hra)),
    medical: round2(Number(row.medical)),
    gross: round2(Number(row.gross)),
    perDay: round2(Number(row.per_day)),
    workingDays: Number(row.working_days),
    absentDays: round2(Number(row.absent_days)),
    unpaidDays: round2(Number(row.unpaid_days)),
    halfDays: round2(Number(row.half_days)),
    deductions: round2(Number(row.deductions)),
    tax: round2(Number(row.tax)),
    net: round2(Number(row.net)),
  };
}

// ---------------------------------------------------------- tax + math

/** Annual slabs from TASK.md / M5 contract, monthly = annualTax / 12. */
export function monthlyTax(grossMonthly: number): number {
  const annual = grossMonthly * 12;
  let annualTax = 0;
  if (annual <= 600_000) annualTax = 0;
  else if (annual <= 1_200_000) annualTax = 0.05 * (annual - 600_000);
  else if (annual <= 2_400_000) annualTax = 30_000 + 0.15 * (annual - 1_200_000);
  else if (annual <= 3_600_000) annualTax = 210_000 + 0.25 * (annual - 2_400_000);
  else annualTax = 510_000 + 0.35 * (annual - 3_600_000);
  return round2(annualTax / 12);
}

type ComputedPayslip = {
  employeeId: number;
  workingDays: number;
  basic: number;
  hra: number;
  medical: number;
  gross: number;
  perDay: number;
  absentDays: number;
  unpaidDays: number;
  halfDays: number;
  deductions: number;
  tax: number;
  net: number;
};

type DayOutcome = "present" | "absent" | "half" | "unpaid" | "paid_leave";

function computeAbsenceDays(
  employeeId: number,
  eligibleDates: string[],
  cutoff: string | null
): { absentDays: number; unpaidDays: number; halfDays: number } {
  let absentDays = 0;
  let unpaidDays = 0;
  let halfDays = 0;
  if (!cutoff) return { absentDays, unpaidDays, halfDays };

  const dates = eligibleDates.filter((date) => date <= cutoff);
  if (dates.length === 0) return { absentDays, unpaidDays, halfDays };
  const from = dates[0];
  const to = dates[dates.length - 1];

  const attendanceRows = queryAll<{ date: string; status: string | null; check_in_at: string | null }>(
    `SELECT date, status, check_in_at FROM attendance
      WHERE employee_id = ? AND date >= ? AND date <= ?`,
    employeeId,
    from,
    to
  );
  const attendanceByDate = new Map(attendanceRows.map((row) => [row.date, row]));

  const leaveRows = queryAll<{
    start_date: string;
    end_date: string;
    paid: number;
  }>(
    `SELECT lr.start_date, lr.end_date, lt.paid
       FROM leave_requests lr
       JOIN leave_types lt ON lt.id = lr.leave_type_id
      WHERE lr.employee_id = ? AND lr.status = 'approved'
        AND lr.start_date <= ? AND lr.end_date >= ?`,
    employeeId,
    to,
    from
  );
  const leavePaidByDate = new Map<string, boolean>();
  for (const leave of leaveRows) {
    const start = leave.start_date < from ? from : leave.start_date;
    const end = leave.end_date > to ? to : leave.end_date;
    const paid = Number(leave.paid) === 1;
    let cursor = new Date(`${start}T00:00:00Z`).getTime();
    const endMs = new Date(`${end}T00:00:00Z`).getTime();
    while (cursor <= endMs) {
      const date = new Date(cursor).toISOString().slice(0, 10);
      leavePaidByDate.set(date, (leavePaidByDate.get(date) ?? false) || paid);
      cursor += 24 * 60 * 60 * 1000;
    }
  }

  for (const date of dates) {
    const attendance = attendanceByDate.get(date);
    let outcome: DayOutcome;
    if (attendance) {
      const status = attendance.status ?? (attendance.check_in_at ? "present" : "absent");
      if (status === "half_day") outcome = "half";
      else if (status === "absent") outcome = "absent";
      else outcome = "present";
    } else if (leavePaidByDate.has(date)) {
      outcome = leavePaidByDate.get(date) ? "paid_leave" : "unpaid";
    } else {
      outcome = "absent";
    }
    if (outcome === "absent") absentDays += 1;
    else if (outcome === "unpaid") unpaidDays += 1;
    else if (outcome === "half") halfDays += 1;
  }

  return { absentDays, unpaidDays, halfDays };
}

// ------------------------------------------------------------ run CRUD

type RunDbRow = {
  id: number;
  month: string;
  status: PayrollRunStatus;
  working_days: number;
  finalized_at: string | null;
  employee_count?: number;
  total_gross?: number;
  total_net?: number;
};

function mapRun(row: RunDbRow): PayrollRun {
  return {
    id: Number(row.id),
    month: row.month,
    status: row.status,
    workingDays: Number(row.working_days),
    employeeCount: Number(row.employee_count ?? 0),
    totalGross: round2(Number(row.total_gross ?? 0)),
    totalNet: round2(Number(row.total_net ?? 0)),
    finalizedAt: row.finalized_at,
  };
}

function runById(id: number): PayrollRun {
  const row = queryOne<RunDbRow>(
    `SELECT r.id, r.month, r.status, r.working_days, r.finalized_at,
       (SELECT COUNT(*) FROM payslips p WHERE p.run_id = r.id) AS employee_count,
       (SELECT COALESCE(SUM(p.gross), 0) FROM payslips p WHERE p.run_id = r.id) AS total_gross,
       (SELECT COALESCE(SUM(p.net), 0) FROM payslips p WHERE p.run_id = r.id) AS total_net
     FROM payroll_runs r WHERE r.id = ?`,
    id
  );
  if (!row) throw notFound();
  return mapRun(row);
}

export function listRuns(): { items: PayrollRun[] } {
  const rows = queryAll<RunDbRow>(
    `SELECT r.id, r.month, r.status, r.working_days, r.finalized_at,
       (SELECT COUNT(*) FROM payslips p WHERE p.run_id = r.id) AS employee_count,
       (SELECT COALESCE(SUM(p.gross), 0) FROM payslips p WHERE p.run_id = r.id) AS total_gross,
       (SELECT COALESCE(SUM(p.net), 0) FROM payslips p WHERE p.run_id = r.id) AS total_net
     FROM payroll_runs r
     ORDER BY r.month DESC, r.id DESC`
  );
  return { items: rows.map(mapRun) };
}

export function getRun(id: number): { run: PayrollRun; payslips: PayslipRow[] } {
  const run = runById(id);
  const payslips = queryAll<PayslipDbRow>(
    `${PAYSLIP_SELECT} WHERE p.run_id = ? ORDER BY e.full_name COLLATE NOCASE`,
    id
  ).map(mapPayslip);
  return { run, payslips };
}

export function createRun(
  month: string,
  actor: SessionUser
): { run: PayrollRun; payslips: PayslipRow[] } {
  if (actor.role !== "hr" && actor.role !== "admin") {
    throw new ApiError(403, "forbidden");
  }
  const existing = queryOne<{ id: number }>("SELECT id FROM payroll_runs WHERE month = ?", month);
  if (existing) throw new ApiError(409, "already_exists");

  const settings = getSettings();
  const holidays = holidaySet();
  const { start: monthStart, end: monthEnd } = monthRange(month);
  const monthDates = monthWorkingDates(month, settings, holidays);
  const totalWorkingDays = monthDates.length;

  const employees = queryAll<EmployeeForPayroll>(
    `SELECT id, code, full_name, join_date, exit_date, status, basic_salary
       FROM employees WHERE basic_salary > 0 ORDER BY code COLLATE NOCASE`
  );

  const today = todayIso();
  const current = today.slice(0, 7);
  const computed: ComputedPayslip[] = [];

  for (const employee of employees) {
    const joinDate = employee.join_date ?? monthStart;
    const exitDate = employee.exit_date;
    if (joinDate > monthEnd) continue;
    if (exitDate && exitDate < monthStart) continue;
    if (employee.status === "exited" && !exitDate) continue;

    const eligibleStart = joinDate > monthStart ? joinDate : monthStart;
    const eligibleEnd = exitDate && exitDate < monthEnd ? exitDate : monthEnd;
    if (eligibleStart > eligibleEnd) continue;

    const eligibleDates = workingDates(eligibleStart, eligibleEnd, settings, holidays);
    if (eligibleDates.length === 0) continue;

    const basic = round2(Number(employee.basic_salary));
    const gross = round2(basic * 1.5);
    const ratio = totalWorkingDays > 0 ? eligibleDates.length / totalWorkingDays : 0;
    // Daily rate is derived from the month's total working days, so every
    // employee in the run shares the same per-day rate. Proration happens on
    // grossForMonth, never on the denominator used for deductions.
    const perDayExact = totalWorkingDays > 0 ? gross / totalWorkingDays : 0;
    const grossForMonth = round2(perDayExact * eligibleDates.length);

    const cutoff =
      month > current ? null : month === current ? today : eligibleEnd;

    const { absentDays, unpaidDays, halfDays } = computeAbsenceDays(
      Number(employee.id),
      eligibleDates,
      cutoff
    );
    const deductionDays = absentDays + unpaidDays + halfDays * 0.5;
    const deductions = round2(deductionDays * perDayExact);
    const tax = monthlyTax(gross);

    const basicForMonth = round2(basic * ratio);
    const hraForMonth = round2(basic * 0.4 * ratio);
    const medicalForMonth = round2(grossForMonth - basicForMonth - hraForMonth);

    computed.push({
      employeeId: Number(employee.id),
      workingDays: eligibleDates.length,
      basic: basicForMonth,
      hra: hraForMonth,
      medical: medicalForMonth,
      gross: grossForMonth,
      perDay: round2(perDayExact),
      absentDays,
      unpaidDays,
      halfDays,
      deductions,
      tax,
      net: round2(grossForMonth - deductions - tax),
    });
  }

  const db = getDb();
  let runId = 0;
  db.exec("BEGIN IMMEDIATE;");
  try {
    const result = run(
      "INSERT INTO payroll_runs (month, status, working_days, created_by) VALUES (?, 'draft', ?, ?)",
      month,
      totalWorkingDays,
      actor.id
    );
    runId = Number(result.lastInsertRowid);
    for (const payslip of computed) {
      run(
        `INSERT INTO payslips (run_id, employee_id, working_days, basic, hra, medical, gross, per_day,
           absent_days, unpaid_days, half_days, deductions, tax, net)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        runId,
        payslip.employeeId,
        payslip.workingDays,
        payslip.basic,
        payslip.hra,
        payslip.medical,
        payslip.gross,
        payslip.perDay,
        payslip.absentDays,
        payslip.unpaidDays,
        payslip.halfDays,
        payslip.deductions,
        payslip.tax,
        payslip.net
      );
    }
    db.exec("COMMIT;");
  } catch (err) {
    db.exec("ROLLBACK;");
    throw err;
  }

  const summary = runById(runId);
  logAudit({
    actorId: actor.id,
    action: "create",
    entity: "payroll_run",
    entityId: runId,
    after: summary,
  });

  return getRun(runId);
}

export function finalizeRun(id: number, actor: SessionUser): PayrollRun {
  if (actor.role !== "admin") throw new ApiError(403, "forbidden");
  const before = runById(id);
  if (before.status === "finalized") throw new ApiError(409, "locked");

  run(
    "UPDATE payroll_runs SET status = 'finalized', finalized_by = ?, finalized_at = ? WHERE id = ?",
    actor.id,
    nowIso(),
    id
  );

  const after = runById(id);
  logAudit({
    actorId: actor.id,
    action: "finalize",
    entity: "payroll_run",
    entityId: id,
    before,
    after,
  });

  const payslips = queryAll<{ employee_id: number; net: number }>(
    "SELECT employee_id, net FROM payslips WHERE run_id = ?",
    id
  );
  for (const payslip of payslips) {
    notify(
      userForEmployee(Number(payslip.employee_id)),
      `Payslip available — ${after.month}`,
      `Your payslip for ${after.month} is ready. Net pay: ${round2(Number(payslip.net)).toFixed(2)}.`
    );
  }

  return after;
}

export function deleteRun(id: number, actor: SessionUser): { ok: true } {
  if (actor.role !== "hr") throw new ApiError(403, "forbidden");
  const before = runById(id);
  if (before.status === "finalized" || isMonthLocked(before.month)) {
    throw new ApiError(409, "locked");
  }
  run("DELETE FROM payroll_runs WHERE id = ?", id);
  logAudit({
    actorId: actor.id,
    action: "delete",
    entity: "payroll_run",
    entityId: id,
    before,
  });
  return { ok: true };
}

// -------------------------------------------------------------- payslips

export function listPayslips(
  user: SessionUser,
  filter: { employeeId?: number } = {}
): { items: PayslipRow[] } {
  const where: string[] = [];
  const args: Array<string | number> = [];

  if (user.role === "employee") {
    if (user.employeeId === null) return { items: [] };
    where.push("p.employee_id = ?");
    args.push(user.employeeId);
  } else if (filter.employeeId !== undefined) {
    where.push("p.employee_id = ?");
    args.push(filter.employeeId);
  }

  const rows = queryAll<PayslipDbRow>(
    `${PAYSLIP_SELECT} ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
     ORDER BY r.month DESC, e.full_name COLLATE NOCASE`,
    ...args
  );
  return { items: rows.map(mapPayslip) };
}

export function payslipForPdf(
  id: number,
  user: SessionUser
): { payslip: PayslipRow; companyName: string } {
  const row = queryOne<PayslipDbRow>(`${PAYSLIP_SELECT} WHERE p.id = ?`, id);
  if (!row) throw notFound();
  const payslip = mapPayslip(row);
  if (user.role === "employee" && user.employeeId !== payslip.employeeId) {
    throw new ApiError(403, "forbidden");
  }
  return { payslip, companyName: getSettings().companyName };
}
