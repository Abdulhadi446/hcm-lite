import "server-only";
import type { SessionUser } from "@/lib/auth";
import { queryAll, queryOne } from "@/lib/db";
import { isIsoDate, isoToUtcMs, todayIso } from "@/lib/dates";
import { monthRange } from "@/lib/dates";
import { listBalances, type LeaveBalance } from "./leave";
import {
  dateRange,
  holidaySet,
  isWeekendDate,
  minutesBetween,
  round2,
  settingsOrThrow,
  weekStartIso,
  workingDates,
} from "./shared";

/**
 * M6 analytics. Every KPI in the product is computed here and nowhere else —
 * pages and API routes only format/forward the numbers (see
 * docs/M6-M8-CONTRACT.md §M6 for the normative formulas).
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const MONTH_MS = 30.4375 * DAY_MS;

function round1(value: number): number {
  return Math.round((value + Number.EPSILON) * 10) / 10;
}

/** Percentage with 1 decimal; 0 when the denominator is empty. */
function pct(numerator: number, denominator: number): number {
  if (!Number.isFinite(denominator) || denominator <= 0) return 0;
  return round1((numerator / denominator) * 100);
}

// ---------------------------------------------------------------- types

export type MetricsInput = {
  from?: string;
  to?: string;
  departmentId?: number | null;
  employeeId?: number | null;
};

export type DashboardKpis = {
  headcount: number;
  workingDays: number;
  presentDays: number;
  lateDays: number;
  halfDays: number;
  onLeaveDays: number;
  absentDays: number;
  attendedDays: number;
  expectedDays: number;
  newHires: number;
  attendanceRate: number;
  latePct: number;
  absenteeismRate: number;
  attritionRate: number;
  leaveUtilization: number;
  payrollCost: number;
  payrollLabel: string;
  avgTenureMonths: number;
  openCorrections: number;
  pendingLeaves: number;
};

export type TrendPoint = { date: string; present: number; late: number; absent: number };

export type DepartmentBreakdown = {
  departmentId: number | null;
  departmentName: string;
  headcount: number;
  attendanceRate: number;
  latePct: number;
};

export type RecentHire = {
  id: number;
  name: string;
  code: string;
  departmentName: string | null;
  joinDate: string;
};

export type HolidayItem = { id: number; date: string; name: string };

export type TodaySnapshot = {
  date: string;
  isWorkingDay: boolean;
  headcount: number;
  present: number;
  late: number;
  halfDay: number;
  onLeave: number;
  absent: number;
};

export type MetricsResult = {
  scope: {
    from: string;
    to: string;
    departmentId: number | null;
    employeeId: number | null;
  };
  kpis: DashboardKpis;
  today: TodaySnapshot;
  trend: TrendPoint[];
  byDepartment: DepartmentBreakdown[];
  pending: { leaves: number; corrections: number };
  recentHires: RecentHire[];
  upcomingHolidays: HolidayItem[];
};

type RosterRow = {
  id: number;
  join_date: string | null;
  exit_date: string | null;
  department_id: number | null;
  department_name: string | null;
};

type AttendanceRow = {
  employee_id: number;
  date: string;
  status: string | null;
  check_in_at: string | null;
  check_out_at: string | null;
};

type DayCounts = { present: number; late: number; half: number };

function emptyDay(): DayCounts {
  return { present: 0, late: 0, half: 0 };
}

// ------------------------------------------------------------- helpers

/** Employee status used by the attendance board: NULL + checkout means present. */
function normalizedStatus(row: AttendanceRow): "present" | "late" | "half_day" | null {
  const status = row.status ?? (row.check_out_at && row.check_in_at ? "present" : null);
  if (status === "present" || status === "late" || status === "half_day") return status;
  return null;
}

function scopeFilter(
  departmentId: number | null | undefined,
  employeeId: number | null | undefined,
  alias = "e"
): { sql: string; args: Array<string | number> } {
  const parts: string[] = [];
  const args: Array<string | number> = [];
  if (departmentId !== undefined && departmentId !== null) {
    parts.push(`${alias}.department_id = ?`);
    args.push(Number(departmentId));
  }
  if (employeeId !== undefined && employeeId !== null) {
    parts.push(`${alias}.id = ?`);
    args.push(Number(employeeId));
  }
  return { sql: parts.length ? ` AND ${parts.join(" AND ")}` : "", args };
}

/**
 * Contract headcount roster: active/probation, joined on or before `to`, and
 * still employed during the window (exit_date null or >= from).
 */
function activeRoster(
  from: string,
  to: string,
  departmentId?: number | null,
  employeeId?: number | null
): RosterRow[] {
  const filter = scopeFilter(departmentId, employeeId);
  return queryAll<RosterRow>(
    `SELECT e.id, e.join_date, e.exit_date, e.department_id, d.name AS department_name
       FROM employees e
       LEFT JOIN departments d ON d.id = e.department_id
      WHERE e.status IN ('active', 'probation')
        AND (e.join_date IS NULL OR e.join_date <= ?)
        AND (e.exit_date IS NULL OR e.exit_date >= ?)${filter.sql}
      ORDER BY e.full_name COLLATE NOCASE`,
    to,
    from,
    ...filter.args
  );
}

function attendanceRowsIn(
  from: string,
  to: string,
  departmentId?: number | null,
  employeeId?: number | null
): AttendanceRow[] {
  const filter = scopeFilter(departmentId, employeeId);
  return queryAll<AttendanceRow>(
    `SELECT a.employee_id, a.date, a.status, a.check_in_at, a.check_out_at
       FROM attendance a
       JOIN employees e ON e.id = a.employee_id
      WHERE a.date >= ? AND a.date <= ?${filter.sql}`,
    from,
    to,
    ...filter.args
  );
}

type LeaveSlice = {
  byEmployee: Map<number, Set<string>>;
  byDate: Map<string, number>;
};

/** Approved leave days that fall inside the window, weekends/holidays skipped. */
function leaveSlices(
  from: string,
  to: string,
  rosterIds: Set<number>,
  weekendDays: string,
  holidays: Set<string>,
  departmentId?: number | null,
  employeeId?: number | null
): LeaveSlice {
  const filter = scopeFilter(departmentId, employeeId);
  const rows = queryAll<{ employee_id: number; start_date: string; end_date: string }>(
    `SELECT lr.employee_id, lr.start_date, lr.end_date
       FROM leave_requests lr
       JOIN employees e ON e.id = lr.employee_id
      WHERE lr.status = 'approved'
        AND lr.start_date <= ? AND lr.end_date >= ?${filter.sql}`,
    to,
    from,
    ...filter.args
  );

  const byEmployee = new Map<number, Set<string>>();
  const byDate = new Map<string, number>();

  for (const row of rows) {
    const employeeIdValue = Number(row.employee_id);
    if (!rosterIds.has(employeeIdValue)) continue;
    const start = row.start_date < from ? from : row.start_date;
    const end = row.end_date > to ? to : row.end_date;
    for (const day of dateRange(start, end)) {
      if (isWeekendDate(day, weekendDays) || holidays.has(day)) continue;
      let days = byEmployee.get(employeeIdValue);
      if (!days) {
        days = new Set<string>();
        byEmployee.set(employeeIdValue, days);
      }
      if (days.has(day)) continue;
      days.add(day);
      byDate.set(day, (byDate.get(day) ?? 0) + 1);
    }
  }

  return { byEmployee, byDate };
}

function countPending(
  table: "leave_requests" | "attendance_corrections",
  departmentId?: number | null,
  employeeId?: number | null
): number {
  const filter = scopeFilter(departmentId, employeeId);
  const row = queryOne<{ c: number }>(
    `SELECT COUNT(*) AS c
       FROM ${table} t
       JOIN employees e ON e.id = t.employee_id
      WHERE t.status = 'pending'${filter.sql}`,
    ...filter.args
  );
  return Number(row?.c ?? 0);
}

function exitsInRange(
  from: string,
  to: string,
  departmentId?: number | null,
  employeeId?: number | null
): number {
  const filter = scopeFilter(departmentId, employeeId);
  const row = queryOne<{ c: number }>(
    `SELECT COUNT(*) AS c
       FROM employees e
      WHERE e.exit_date IS NOT NULL AND e.exit_date >= ? AND e.exit_date <= ?${filter.sql}`,
    from,
    to,
    ...filter.args
  );
  return Number(row?.c ?? 0);
}

/** Date-based headcount at an instant (used for the attrition denominator). */
function headcountOn(
  date: string,
  departmentId?: number | null,
  employeeId?: number | null
): number {
  const filter = scopeFilter(departmentId, employeeId);
  const row = queryOne<{ c: number }>(
    `SELECT COUNT(*) AS c
       FROM employees e
      WHERE (e.join_date IS NULL OR e.join_date <= ?)
        AND (e.exit_date IS NULL OR e.exit_date >= ?)${filter.sql}`,
    date,
    date,
    ...filter.args
  );
  return Number(row?.c ?? 0);
}

/**
 * Leave utilization = approved leave days this year ÷ total entitlement.
 * Entitlement is the quota sum of every capped (quota_days > 0) leave type
 * multiplied by headcount, so the ratio compares like with like.
 */
function leaveUtilization(
  rosterIds: Set<number>,
  headcount: number,
  departmentId?: number | null,
  employeeId?: number | null
): number {
  const year = todayIso().slice(0, 4);
  const quotaRow = queryOne<{ quota: number; types: number }>(
    `SELECT COALESCE(SUM(quota_days), 0) AS quota, COUNT(*) AS types
       FROM leave_types WHERE quota_days > 0`
  );
  const quotaSum = Number(quotaRow?.quota ?? 0);
  const entitled = quotaSum * headcount;
  if (entitled <= 0) return 0;

  const filter = scopeFilter(departmentId, employeeId);
  const rows = queryAll<{ employee_id: number; days: number }>(
    `SELECT lr.employee_id, lr.days
       FROM leave_requests lr
       JOIN employees e ON e.id = lr.employee_id
      WHERE lr.status = 'approved'
        AND lr.start_date >= ? AND lr.start_date <= ?${filter.sql}`,
    `${year}-01-01`,
    `${year}-12-31`,
    ...filter.args
  );
  const used = rows.reduce(
    (total, row) => (rosterIds.has(Number(row.employee_id)) ? total + Number(row.days ?? 0) : total),
    0
  );
  return pct(used, entitled);
}

function payrollTotal(
  from: string,
  to: string,
  departmentId?: number | null,
  employeeId?: number | null
): { total: number; multiMonth: boolean } {
  const fromMonth = from.slice(0, 7);
  const toMonth = to.slice(0, 7);
  const filter = scopeFilter(departmentId, employeeId);
  const row = queryOne<{ total: number }>(
    `SELECT COALESCE(SUM(p.net), 0) AS total
       FROM payslips p
       JOIN payroll_runs r ON r.id = p.run_id
       JOIN employees e ON e.id = p.employee_id
      WHERE r.status = 'finalized'
        AND r.month >= ? AND r.month <= ?${filter.sql}`,
    fromMonth,
    toMonth,
    ...filter.args
  );
  return { total: round2(Number(row?.total ?? 0)), multiMonth: fromMonth !== toMonth };
}

// ------------------------------------------------------------- metrics

export function computeMetrics(input: MetricsInput = {}): MetricsResult {
  const settings = settingsOrThrow();
  const holidays = holidaySet();
  const today = todayIso();

  const from = isIsoDate(input.from) ? input.from : monthRange(today.slice(0, 7)).start;
  const to = isIsoDate(input.to) ? input.to : monthRange(today.slice(0, 7)).end;
  const departmentId = input.departmentId ?? null;
  const employeeId = input.employeeId ?? null;

  const roster = activeRoster(from, to, departmentId, employeeId);
  const rosterIds = new Set(roster.map((row) => Number(row.id)));
  const headcount = roster.length;

  const workingDayList = workingDates(from, to, settings, holidays);
  const workingDays = workingDayList.length;

  const attendance = attendanceRowsIn(from, to, departmentId, employeeId);
  const byEmployee = new Map<number, DayCounts>();
  const byDate = new Map<string, DayCounts>();

  for (const row of attendance) {
    const id = Number(row.employee_id);
    if (!rosterIds.has(id)) continue;
    const status = normalizedStatus(row);
    if (!status) continue;

    const employeeCounts = byEmployee.get(id) ?? emptyDay();
    const dateCounts = byDate.get(row.date) ?? emptyDay();
    if (status === "present") {
      employeeCounts.present += 1;
      dateCounts.present += 1;
    } else if (status === "late") {
      employeeCounts.late += 1;
      dateCounts.late += 1;
    } else {
      employeeCounts.half += 1;
      dateCounts.half += 1;
    }
    byEmployee.set(id, employeeCounts);
    byDate.set(row.date, dateCounts);
  }

  const leave = leaveSlices(
    from,
    to,
    rosterIds,
    settings.weekendDays,
    holidays,
    departmentId,
    employeeId
  );

  let presentDays = 0;
  let lateDays = 0;
  let halfDays = 0;
  for (const counts of byEmployee.values()) {
    presentDays += counts.present;
    lateDays += counts.late;
    halfDays += counts.half;
  }

  let onLeaveDays = 0;
  for (const days of leave.byEmployee.values()) onLeaveDays += days.size;

  let absentDays = 0;
  for (const id of rosterIds) {
    const counts = byEmployee.get(id) ?? emptyDay();
    const attended =
      counts.present + counts.late + counts.half + (leave.byEmployee.get(id)?.size ?? 0);
    absentDays += Math.max(0, workingDays - attended);
  }

  const expectedDays = headcount * workingDays;
  const attendedDays = presentDays + lateDays + halfDays + onLeaveDays;
  const attendanceRate = pct(attendedDays, expectedDays);
  const latePct = pct(lateDays, presentDays + lateDays + halfDays);
  const absenteeismRate = pct(absentDays, expectedDays);

  const exits = exitsInRange(from, to, departmentId, employeeId);
  const headcountAtFrom = headcountOn(from, departmentId, employeeId);
  const headcountAtTo = headcountOn(to, departmentId, employeeId);
  const averageHeadcount = (headcountAtFrom + headcountAtTo) / 2;
  const attritionRate = pct(exits, averageHeadcount);

  const tenures = roster.filter((row) => row.join_date);
  const avgTenureMonths =
    tenures.length > 0
      ? round1(
          tenures.reduce(
            (total, row) => total + (isoToUtcMs(to) - isoToUtcMs(row.join_date as string)) / MONTH_MS,
            0
          ) / tenures.length
        )
      : 0;

  const newHires = roster.filter(
    (row) => row.join_date !== null && row.join_date >= from && row.join_date <= to
  ).length;

  const utilization = leaveUtilization(rosterIds, headcount, departmentId, employeeId);
  const payroll = payrollTotal(from, to, departmentId, employeeId);
  const pendingLeaves = countPending("leave_requests", departmentId, employeeId);
  const openCorrections = countPending("attendance_corrections", departmentId, employeeId);

  const kpis: DashboardKpis = {
    headcount,
    workingDays,
    presentDays,
    lateDays,
    halfDays,
    onLeaveDays,
    absentDays,
    attendedDays,
    expectedDays,
    newHires,
    attendanceRate,
    latePct,
    absenteeismRate,
    attritionRate,
    leaveUtilization: utilization,
    payrollCost: payroll.total,
    payrollLabel: payroll.multiMonth ? "YTD" : "Period",
    avgTenureMonths,
    openCorrections,
    pendingLeaves,
  };

  // Trend stops at today so future days never read as absences, and empty
  // company days (no one employed yet) are skipped so a fresh install has a
  // genuinely empty series.
  const trendEnd = to < today ? to : today;
  const trend: TrendPoint[] = [];
  for (const day of workingDayList) {
    if (day > trendEnd) break;
    const dayHeadcount = roster.filter(
      (row) =>
        (!row.join_date || row.join_date <= day) && (!row.exit_date || row.exit_date >= day)
    ).length;
    if (dayHeadcount === 0) continue;
    const counts = byDate.get(day) ?? emptyDay();
    const onLeave = leave.byDate.get(day) ?? 0;
    const attended = counts.present + counts.late + counts.half + onLeave;
    trend.push({
      date: day,
      present: counts.present,
      late: counts.late,
      absent: Math.max(0, dayHeadcount - attended),
    });
  }

  // Department breakdown (only departments that have people in scope).
  const departments = new Map<
    number | null,
    { name: string; ids: Set<number> }
  >();
  for (const row of roster) {
    const key = row.department_id === null ? null : Number(row.department_id);
    const entry = departments.get(key) ?? {
      name: row.department_name ?? "Unassigned",
      ids: new Set<number>(),
    };
    entry.ids.add(Number(row.id));
    departments.set(key, entry);
  }

  const byDepartment: DepartmentBreakdown[] = [...departments.entries()]
    .map(([key, entry]) => {
      let attended = 0;
      let deptPresent = 0;
      let deptLate = 0;
      let deptHalf = 0;
      let deptLeave = 0;
      for (const id of entry.ids) {
        const counts = byEmployee.get(id) ?? emptyDay();
        attended += counts.present + counts.late + counts.half;
        deptPresent += counts.present;
        deptLate += counts.late;
        deptHalf += counts.half;
        deptLeave += leave.byEmployee.get(id)?.size ?? 0;
      }
      const deptHeadcount = entry.ids.size;
      return {
        departmentId: key,
        departmentName: entry.name,
        headcount: deptHeadcount,
        attendanceRate: pct(attended + deptLeave, deptHeadcount * workingDays),
        latePct: pct(deptLate, deptPresent + deptLate + deptHalf),
      };
    })
    .sort((a, b) => b.headcount - a.headcount || a.departmentName.localeCompare(b.departmentName));

  const recentFilter = scopeFilter(departmentId, employeeId);
  const recentHires = queryAll<{
    id: number;
    code: string;
    full_name: string;
    join_date: string;
    department_name: string | null;
  }>(
    `SELECT e.id, e.code, e.full_name, e.join_date, d.name AS department_name
       FROM employees e
       LEFT JOIN departments d ON d.id = e.department_id
      WHERE e.join_date IS NOT NULL AND e.join_date <= ?
        AND e.status IN ('active', 'probation')${recentFilter.sql}
      ORDER BY e.join_date DESC, e.id DESC
      LIMIT 5`,
    to,
    ...recentFilter.args
  ).map((row) => ({
    id: Number(row.id),
    name: row.full_name,
    code: row.code,
    departmentName: row.department_name ?? null,
    joinDate: row.join_date,
  }));

  const holidayAnchor = from > today ? from : today;
  const upcomingHolidays = queryAll<{ id: number; date: string; name: string }>(
    "SELECT id, date, name FROM holidays WHERE date >= ? ORDER BY date LIMIT 5",
    holidayAnchor
  ).map((row) => ({ id: Number(row.id), date: row.date, name: row.name }));

  return {
    scope: { from, to, departmentId, employeeId },
    kpis,
    today: todaySnapshot(today, settings.weekendDays, holidays, departmentId, employeeId),
    trend,
    byDepartment,
    pending: { leaves: pendingLeaves, corrections: openCorrections },
    recentHires,
    upcomingHolidays,
  };
}

/**
 * Headcount/attendance for a single day. Used by the "today" KPI cards so the
 * page never recomputes a KPI itself.
 */
function todaySnapshot(
  date: string,
  weekendDays: string,
  holidays: Set<string>,
  departmentId?: number | null,
  employeeId?: number | null
): TodaySnapshot {
  const isWorkingDay = !isWeekendDate(date, weekendDays) && !holidays.has(date);
  if (!isWorkingDay) {
    return {
      date,
      isWorkingDay: false,
      headcount: 0,
      present: 0,
      late: 0,
      halfDay: 0,
      onLeave: 0,
      absent: 0,
    };
  }

  const filter = scopeFilter(departmentId, employeeId);
  const dayHeadcount = Number(
    queryOne<{ c: number }>(
      `SELECT COUNT(*) AS c FROM employees e
        WHERE e.status IN ('active', 'probation')
          AND (e.join_date IS NULL OR e.join_date <= ?)
          AND (e.exit_date IS NULL OR e.exit_date >= ?)${filter.sql}`,
      date,
      date,
      ...filter.args
    )?.c ?? 0
  );

  const attendance = queryAll<AttendanceRow>(
    `SELECT a.employee_id, a.date, a.status, a.check_in_at, a.check_out_at
       FROM attendance a
       JOIN employees e ON e.id = a.employee_id
      WHERE a.date = ?
        AND (e.join_date IS NULL OR e.join_date <= ?)
        AND (e.exit_date IS NULL OR e.exit_date >= ?)${filter.sql}`,
    date,
    date,
    date,
    ...filter.args
  );

  let present = 0;
  let late = 0;
  let halfDay = 0;
  for (const row of attendance) {
    const status = normalizedStatus(row);
    if (!status) continue;
    if (status === "present") present += 1;
    else if (status === "late") late += 1;
    else halfDay += 1;
  }

  const onLeave = Number(
    queryOne<{ c: number }>(
      `SELECT COUNT(DISTINCT lr.employee_id) AS c
         FROM leave_requests lr
         JOIN employees e ON e.id = lr.employee_id
        WHERE lr.status = 'approved'
          AND lr.start_date <= ? AND lr.end_date >= ?
          AND (e.join_date IS NULL OR e.join_date <= ?)
          AND (e.exit_date IS NULL OR e.exit_date >= ?)${filter.sql}`,
      date,
      date,
      date,
      date,
      ...filter.args
    )?.c ?? 0
  );

  return {
    date,
    isWorkingDay: true,
    headcount: dayHeadcount,
    present,
    late,
    halfDay,
    onLeave,
    absent: Math.max(0, dayHeadcount - present - late - halfDay - onLeave),
  };
}

// ---------------------------------------------------------- employee view

export type LastPayslip = {
  id: number;
  month: string;
  net: number;
  gross: number;
  tax: number;
  deductions: number;
};

export type EmployeeDashboard = {
  me: {
    employeeId: number | null;
    month: string;
    workingDays: number;
    attendanceRate: number;
    presentDays: number;
    lateDays: number;
    halfDays: number;
    onLeaveDays: number;
    absentDays: number;
    hoursThisWeek: number;
  };
  leaveBalances: LeaveBalance[];
  lastPayslip: LastPayslip | null;
  upcomingHolidays: HolidayItem[];
};

/** Personal dashboard: always scoped to the caller's own employee id. */
export function employeeDashboard(user: SessionUser): EmployeeDashboard {
  const employeeId = user.employeeId === null ? null : Number(user.employeeId);
  const today = todayIso();
  const month = today.slice(0, 7);
  const { start } = monthRange(month);

  let metrics: MetricsResult | null = null;
  if (employeeId !== null) {
    // Month to date: future days must not read as absences on a personal card.
    metrics = computeMetrics({ from: start, to: today, employeeId });
  }

  let minutesThisWeek = 0;
  if (employeeId !== null) {
    const rows = queryAll<{ check_in_at: string | null; check_out_at: string | null }>(
      `SELECT check_in_at, check_out_at FROM attendance
        WHERE employee_id = ? AND date >= ? AND date <= ?`,
      employeeId,
      weekStartIso(),
      today
    );
    minutesThisWeek = rows.reduce(
      (total, row) => total + (minutesBetween(row.check_in_at, row.check_out_at) ?? 0),
      0
    );
  }

  const leaveBalances = employeeId === null ? [] : listBalances(user).items;

  const payslip =
    employeeId === null
      ? undefined
      : queryOne<{
          id: number;
          month: string;
          net: number;
          gross: number;
          tax: number;
          deductions: number;
        }>(
          `SELECT p.id, r.month, p.net, p.gross, p.tax, p.deductions
             FROM payslips p
             JOIN payroll_runs r ON r.id = p.run_id
            WHERE p.employee_id = ? AND r.status = 'finalized'
            ORDER BY r.month DESC, p.id DESC
            LIMIT 1`,
          employeeId
        );

  const upcomingHolidays = queryAll<{ id: number; date: string; name: string }>(
    "SELECT id, date, name FROM holidays WHERE date >= ? ORDER BY date LIMIT 3",
    today
  ).map((row) => ({ id: Number(row.id), date: row.date, name: row.name }));

  return {
    me: {
      employeeId,
      month,
      workingDays: metrics?.kpis.workingDays ?? 0,
      attendanceRate: metrics?.kpis.attendanceRate ?? 0,
      presentDays: metrics?.kpis.presentDays ?? 0,
      lateDays: metrics?.kpis.lateDays ?? 0,
      halfDays: metrics?.kpis.halfDays ?? 0,
      onLeaveDays: metrics?.kpis.onLeaveDays ?? 0,
      absentDays: metrics?.kpis.absentDays ?? 0,
      hoursThisWeek: round2(minutesThisWeek / 60),
    },
    leaveBalances,
    lastPayslip: payslip
      ? {
          id: Number(payslip.id),
          month: payslip.month,
          net: round2(Number(payslip.net)),
          gross: round2(Number(payslip.gross)),
          tax: round2(Number(payslip.tax)),
          deductions: round2(Number(payslip.deductions)),
        }
      : null,
    upcomingHolidays,
  };
}
