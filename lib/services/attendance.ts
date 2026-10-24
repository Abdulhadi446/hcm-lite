import "server-only";
import type { SessionUser } from "@/lib/auth";
import { nowIso, queryAll, queryOne, run } from "@/lib/db";
import { ApiError } from "@/lib/guards";
import { isIsoDate, monthRange, todayIso } from "@/lib/dates";
import { logAudit } from "./audit";
import { fieldError, notFound } from "./http";
import {
  assertDayUnlocked,
  combineLocalDateTime,
  dateRange,
  holidaySet,
  isWeekendDate,
  localMinutesOfDay,
  minutesBetween,
  notify,
  parseHhMm,
  round2,
  settingsOrThrow,
  userForEmployee,
  weekStartIso,
} from "./shared";
import type { Settings } from "./org";

// ---------------------------------------------------------------- types

export type StoredAttendanceStatus = "present" | "late" | "half_day" | "missing_checkout";
export type AttendanceStatus =
  | StoredAttendanceStatus
  | "absent"
  | "on_leave"
  | "weekend"
  | "holiday"
  | "upcoming";

export type Attendance = {
  id: number;
  employeeId: number;
  date: string;
  checkInAt: string | null;
  checkOutAt: string | null;
  status: AttendanceStatus;
  workedMinutes: number | null;
};

export type AttendanceDay = {
  date: string;
  status: AttendanceStatus;
  checkInAt: string | null;
  checkOutAt: string | null;
  workedMinutes: number | null;
};

export type AttendanceSummary = {
  present: number;
  late: number;
  halfDay: number;
  absent: number;
  onLeave: number;
  missingCheckout: number;
  hoursThisWeek: number;
  lateThisMonth: number;
};

export type BoardRow = {
  employeeId: number;
  code: string;
  fullName: string;
  departmentName: string | null;
  date: string;
  status: AttendanceStatus;
  checkInAt: string | null;
  checkOutAt: string | null;
  leaveTypeName: string | null;
};

export type Correction = {
  id: number;
  employeeId: number;
  employeeName: string;
  employeeCode: string;
  date: string;
  requestedCheckIn: string;
  requestedCheckOut: string;
  reason: string;
  status: "pending" | "approved" | "rejected";
  reviewComment: string | null;
  reviewedByName: string | null;
  createdAt: string;
};

type AttendanceRow = {
  id: number;
  employee_id: number;
  date: string;
  check_in_at: string | null;
  check_out_at: string | null;
  status: string | null;
};

function mapAttendance(row: AttendanceRow): Attendance {
  return {
    id: Number(row.id),
    employeeId: Number(row.employee_id),
    date: row.date,
    checkInAt: row.check_in_at,
    checkOutAt: row.check_out_at,
    status: (row.status ?? (row.check_out_at ? "present" : "missing_checkout")) as AttendanceStatus,
    workedMinutes: minutesBetween(row.check_in_at, row.check_out_at),
  };
}

function requireEmployeeId(user: SessionUser): number {
  if (user.employeeId === null) {
    throw new ApiError(400, "no_employee_profile");
  }
  return user.employeeId;
}

// --------------------------------------------------------- status rules

/**
 * Contract M3 status model:
 * missing_checkout > half_day (worked < half_day_minutes) > late (after grace) > present.
 */
export function computeStatus(
  checkInAt: string | null,
  checkOutAt: string | null,
  settings: Settings
): StoredAttendanceStatus {
  if (!checkOutAt) return "missing_checkout";
  const worked = minutesBetween(checkInAt, checkOutAt) ?? 0;
  if (worked < settings.halfDayMinutes) return "half_day";
  const checkInMinutes = checkInAt ? localMinutesOfDay(checkInAt) : 0;
  const officeStart = parseHhMm(settings.officeStart) ?? 9 * 60;
  if (checkInMinutes > officeStart + settings.graceMinutes) return "late";
  return "present";
}

function rowFor(employeeId: number, date: string): AttendanceRow | undefined {
  return queryOne<AttendanceRow>(
    "SELECT id, employee_id, date, check_in_at, check_out_at, status FROM attendance WHERE employee_id = ? AND date = ?",
    employeeId,
    date
  );
}

// ------------------------------------------------------------ check in/out

export function checkIn(user: SessionUser): Attendance {
  const employeeId = requireEmployeeId(user);
  const date = todayIso();
  assertDayUnlocked(date);

  if (rowFor(employeeId, date)) {
    throw new ApiError(409, "already_checked_in");
  }

  const result = run(
    `INSERT INTO attendance (employee_id, date, check_in_at, check_out_at, status, source, note)
     VALUES (?, ?, ?, NULL, 'missing_checkout', 'web', NULL)`,
    employeeId,
    date,
    nowIso()
  );
  const attendance = mapAttendance(rowFor(employeeId, date)!);
  logAudit({
    actorId: user.id,
    action: "create",
    entity: "attendance",
    entityId: Number(result.lastInsertRowid),
    after: attendance,
  });
  return attendance;
}

export function checkOut(user: SessionUser): Attendance {
  const employeeId = requireEmployeeId(user);
  const date = todayIso();
  assertDayUnlocked(date);

  const row = rowFor(employeeId, date);
  if (!row) throw new ApiError(409, "not_checked_in");
  if (row.check_out_at) throw new ApiError(409, "already_checked_out");

  const checkOutAt = nowIso();
  const status = computeStatus(row.check_in_at, checkOutAt, settingsOrThrow());
  run(
    "UPDATE attendance SET check_out_at = ?, status = ? WHERE id = ?",
    checkOutAt,
    status,
    row.id
  );
  const after = mapAttendance(rowFor(employeeId, date)!);
  logAudit({
    actorId: user.id,
    action: "update",
    entity: "attendance",
    entityId: row.id,
    before: mapAttendance(row),
    after,
  });
  return after;
}

// ------------------------------------------------------------ my month

function leaveCoverage(
  employeeId: number,
  startIso: string,
  endIso: string
): Map<string, string> {
  const coverage = new Map<string, string>();
  const rows = queryAll<{ start_date: string; end_date: string; name: string }>(
    `SELECT lr.start_date, lr.end_date, lt.name
       FROM leave_requests lr
       JOIN leave_types lt ON lt.id = lr.leave_type_id
      WHERE lr.employee_id = ? AND lr.status = 'approved'
        AND lr.start_date <= ? AND lr.end_date >= ?`,
    employeeId,
    endIso,
    startIso
  );
  for (const row of rows) {
    const from = row.start_date < startIso ? startIso : row.start_date;
    const to = row.end_date > endIso ? endIso : row.end_date;
    for (const date of dateRange(from, to)) coverage.set(date, row.name);
  }
  return coverage;
}

export function myMonth(
  user: SessionUser,
  month: string
): { days: AttendanceDay[]; summary: AttendanceSummary } {
  const employeeId = requireEmployeeId(user);
  const settings = settingsOrThrow();
  const holidays = holidaySet();
  const { start, end } = monthRange(month);
  const today = todayIso();

  const rows = queryAll<AttendanceRow>(
    `SELECT id, employee_id, date, check_in_at, check_out_at, status
       FROM attendance WHERE employee_id = ? AND date >= ? AND date <= ?`,
    employeeId,
    start,
    end
  );
  const byDate = new Map(rows.map((row) => [row.date, row]));
  const leave = leaveCoverage(employeeId, start, end);

  const days: AttendanceDay[] = dateRange(start, end).map((date) => {
    const row = byDate.get(date);
    if (row) {
      return {
        date,
        status: (row.status ?? (row.check_out_at ? "present" : "missing_checkout")) as AttendanceStatus,
        checkInAt: row.check_in_at,
        checkOutAt: row.check_out_at,
        workedMinutes: minutesBetween(row.check_in_at, row.check_out_at),
      };
    }
    let status: AttendanceStatus;
    if (holidays.has(date)) status = "holiday";
    else if (isWeekendDate(date, settings.weekendDays)) status = "weekend";
    else if (leave.has(date)) status = "on_leave";
    else if (date > today) status = "upcoming";
    else status = "absent";
    return { date, status, checkInAt: null, checkOutAt: null, workedMinutes: null };
  });

  const weekStart = weekStartIso();
  const weekRows = queryAll<{ check_in_at: string | null; check_out_at: string | null }>(
    `SELECT check_in_at, check_out_at FROM attendance
      WHERE employee_id = ? AND date >= ? AND date <= ?`,
    employeeId,
    weekStart,
    today
  );
  const weekMinutes = weekRows.reduce(
    (total, row) => total + (minutesBetween(row.check_in_at, row.check_out_at) ?? 0),
    0
  );

  const summary: AttendanceSummary = {
    present: 0,
    late: 0,
    halfDay: 0,
    absent: 0,
    onLeave: 0,
    missingCheckout: 0,
    hoursThisWeek: round2(weekMinutes / 60),
    lateThisMonth: 0,
  };

  for (const day of days) {
    switch (day.status) {
      case "present":
        summary.present += 1;
        break;
      case "late":
        summary.late += 1;
        break;
      case "half_day":
        summary.halfDay += 1;
        break;
      case "absent":
        summary.absent += 1;
        break;
      case "on_leave":
        summary.onLeave += 1;
        break;
      case "missing_checkout":
        summary.missingCheckout += 1;
        break;
      default:
        break;
    }
  }
  summary.lateThisMonth = summary.late;

  return { days, summary };
}

// ---------------------------------------------------------------- board

type BoardEmployee = {
  id: number;
  code: string;
  full_name: string;
  join_date: string | null;
  exit_date: string | null;
  status: string;
  department_name: string | null;
};

export function board(
  actor: SessionUser,
  params: {
    date?: string;
    month?: string;
    departmentId?: number;
    q?: string;
  }
): { items: BoardRow[]; summary: AttendanceSummary } {
  if (actor.role === "employee") throw new ApiError(403, "forbidden");

  const settings = settingsOrThrow();
  const holidays = holidaySet();
  const today = todayIso();

  const date = params.date;
  const month = params.month ?? (date ? date.slice(0, 7) : today.slice(0, 7));
  const monthBounds = monthRange(month);
  const rangeStart = date ?? monthBounds.start;
  const rangeEnd = date ?? monthBounds.end;

  const where: string[] = [];
  const args: Array<string | number> = [];
  if (params.departmentId !== undefined) {
    where.push("e.department_id = ?");
    args.push(params.departmentId);
  }
  if (params.q?.trim()) {
    const escaped = params.q.trim().replace(/[\\%_]/g, (ch) => `\\${ch}`);
    where.push("(e.full_name LIKE ? ESCAPE '\\' OR e.code LIKE ? ESCAPE '\\')");
    args.push(`%${escaped}%`, `%${escaped}%`);
  }

  const employees = queryAll<BoardEmployee>(
    `SELECT e.id, e.code, e.full_name, e.join_date, e.exit_date, e.status,
            d.name AS department_name
       FROM employees e
       LEFT JOIN departments d ON d.id = e.department_id
      ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
      ORDER BY e.full_name COLLATE NOCASE`,
    ...args
  );

  const attendanceRows = queryAll<AttendanceRow>(
    `SELECT id, employee_id, date, check_in_at, check_out_at, status
       FROM attendance WHERE date >= ? AND date <= ?`,
    rangeStart,
    rangeEnd
  );
  const attendanceByKey = new Map(
    attendanceRows.map((row) => [`${row.employee_id}:${row.date}`, row])
  );

  const leaveRows = queryAll<{
    employee_id: number;
    start_date: string;
    end_date: string;
    name: string;
  }>(
    `SELECT lr.employee_id, lr.start_date, lr.end_date, lt.name
       FROM leave_requests lr
       JOIN leave_types lt ON lt.id = lr.leave_type_id
      WHERE lr.status = 'approved' AND lr.start_date <= ? AND lr.end_date >= ?`,
    rangeEnd,
    rangeStart
  );
  const leaveByKey = new Map<string, string>();
  for (const row of leaveRows) {
    const from = row.start_date < rangeStart ? rangeStart : row.start_date;
    const to = row.end_date > rangeEnd ? rangeEnd : row.end_date;
    for (const day of dateRange(from, to)) {
      leaveByKey.set(`${row.employee_id}:${day}`, row.name);
    }
  }

  const dates = date ? [date] : dateRange(rangeStart, rangeEnd);
  const items: BoardRow[] = [];

  for (const employee of employees) {
    for (const day of dates) {
      const joined = !employee.join_date || employee.join_date <= day;
      const notExited = !employee.exit_date || employee.exit_date >= day;
      if (!joined || !notExited) continue;

      const key = `${employee.id}:${day}`;
      const row = attendanceByKey.get(key);
      const leaveTypeName = leaveByKey.get(key) ?? null;
      let status: AttendanceStatus;

      if (row) {
        status = (row.status ??
          (row.check_out_at ? "present" : "missing_checkout")) as AttendanceStatus;
      } else if (leaveTypeName) {
        status = "on_leave";
      } else if (holidays.has(day)) {
        status = "holiday";
      } else if (isWeekendDate(day, settings.weekendDays)) {
        status = "weekend";
      } else if (day > today) {
        status = "upcoming";
      } else {
        status = "absent";
      }

      items.push({
        employeeId: Number(employee.id),
        code: employee.code,
        fullName: employee.full_name,
        departmentName: employee.department_name ?? null,
        date: day,
        status,
        checkInAt: row?.check_in_at ?? null,
        checkOutAt: row?.check_out_at ?? null,
        leaveTypeName: status === "on_leave" ? leaveTypeName : null,
      });
    }
  }

  const summary: AttendanceSummary = {
    present: 0,
    late: 0,
    halfDay: 0,
    absent: 0,
    onLeave: 0,
    missingCheckout: 0,
    hoursThisWeek: 0,
    lateThisMonth: 0,
  };
  for (const item of items) {
    if (item.status === "present") summary.present += 1;
    else if (item.status === "late") summary.late += 1;
    else if (item.status === "half_day") summary.halfDay += 1;
    else if (item.status === "absent") summary.absent += 1;
    else if (item.status === "on_leave") summary.onLeave += 1;
    else if (item.status === "missing_checkout") summary.missingCheckout += 1;
  }

  return { items, summary };
}

// ---------------------------------------------------------- corrections

type CorrectionDbRow = {
  id: number;
  employee_id: number;
  employee_name: string;
  employee_code: string;
  date: string;
  requested_check_in: string;
  requested_check_out: string;
  reason: string;
  status: "pending" | "approved" | "rejected";
  review_comment: string | null;
  reviewed_by_name: string | null;
  created_at: string;
};

const CORRECTION_SELECT = `SELECT c.id, c.employee_id, e.full_name AS employee_name, e.code AS employee_code,
  c.date, c.requested_check_in, c.requested_check_out, c.reason, c.status,
  c.review_comment, u.name AS reviewed_by_name, c.created_at
  FROM attendance_corrections c
  JOIN employees e ON e.id = c.employee_id
  LEFT JOIN users u ON u.id = c.reviewed_by`;

function mapCorrection(row: CorrectionDbRow): Correction {
  return {
    id: Number(row.id),
    employeeId: Number(row.employee_id),
    employeeName: row.employee_name,
    employeeCode: row.employee_code,
    date: row.date,
    requestedCheckIn: row.requested_check_in,
    requestedCheckOut: row.requested_check_out,
    reason: row.reason,
    status: row.status,
    reviewComment: row.review_comment,
    reviewedByName: row.reviewed_by_name,
    createdAt: row.created_at,
  };
}

export function createCorrection(
  user: SessionUser,
  input: {
    date: string;
    requestedCheckIn: string;
    requestedCheckOut: string;
    reason: string;
  }
): Correction {
  const employeeId = requireEmployeeId(user);
  if (!isIsoDate(input.date)) throw fieldError("date", "Use a valid date (YYYY-MM-DD)");
  const checkInMinutes = parseHhMm(input.requestedCheckIn);
  const checkOutMinutes = parseHhMm(input.requestedCheckOut);
  if (checkInMinutes === null) throw fieldError("requestedCheckIn", "Use a 24-hour time like 09:00");
  if (checkOutMinutes === null) {
    throw fieldError("requestedCheckOut", "Use a 24-hour time like 18:00");
  }
  if (checkOutMinutes <= checkInMinutes) {
    throw fieldError("requestedCheckOut", "Check-out must be after check-in");
  }
  assertDayUnlocked(input.date);

  const result = run(
    `INSERT INTO attendance_corrections
       (employee_id, date, requested_check_in, requested_check_out, reason, status, created_at)
     VALUES (?, ?, ?, ?, ?, 'pending', ?)`,
    employeeId,
    input.date,
    input.requestedCheckIn,
    input.requestedCheckOut,
    input.reason,
    nowIso()
  );
  const correction = queryOne<CorrectionDbRow>(
    `${CORRECTION_SELECT} WHERE c.id = ?`,
    Number(result.lastInsertRowid)
  );
  if (!correction) throw notFound();
  const mapped = mapCorrection(correction);
  logAudit({
    actorId: user.id,
    action: "create",
    entity: "attendance_correction",
    entityId: mapped.id,
    after: mapped,
  });
  return mapped;
}

export function listCorrections(
  user: SessionUser,
  filter: { status?: string } = {}
): { items: Correction[] } {
  const where: string[] = [];
  const args: Array<string | number> = [];

  if (user.role === "employee") {
    if (user.employeeId === null) return { items: [] };
    where.push("c.employee_id = ?");
    args.push(user.employeeId);
  }
  if (filter.status) {
    where.push("c.status = ?");
    args.push(filter.status);
  }

  const rows = queryAll<CorrectionDbRow>(
    `${CORRECTION_SELECT} ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
     ORDER BY c.created_at DESC, c.id DESC`,
    ...args
  );
  return { items: rows.map(mapCorrection) };
}

export function reviewCorrection(
  actor: SessionUser,
  id: number,
  input: { action: "approve" | "reject"; comment?: string }
): Correction {
  if (actor.role !== "hr") throw new ApiError(403, "forbidden");

  const row = queryOne<CorrectionDbRow>(`${CORRECTION_SELECT} WHERE c.id = ?`, id);
  if (!row) throw notFound();
  if (row.status !== "pending") throw new ApiError(409, "already_reviewed");
  assertDayUnlocked(row.date);

  const now = nowIso();
  if (input.action === "approve") {
    const checkInAt = combineLocalDateTime(row.date, row.requested_check_in);
    const checkOutAt = combineLocalDateTime(row.date, row.requested_check_out);
    const status = computeStatus(checkInAt, checkOutAt, settingsOrThrow());
    const before = rowFor(Number(row.employee_id), row.date);
    run(
      `INSERT INTO attendance (employee_id, date, check_in_at, check_out_at, status, source, note)
       VALUES (?, ?, ?, ?, ?, 'correction', ?)
       ON CONFLICT(employee_id, date) DO UPDATE SET
         check_in_at = excluded.check_in_at,
         check_out_at = excluded.check_out_at,
         status = excluded.status,
         source = 'correction',
         note = excluded.note`,
      row.employee_id,
      row.date,
      checkInAt,
      checkOutAt,
      status,
      row.reason
    );
    const after = rowFor(Number(row.employee_id), row.date);
    logAudit({
      actorId: actor.id,
      action: before ? "update" : "create",
      entity: "attendance",
      entityId: after ? Number(after.id) : Number(row.employee_id),
      before: before ? mapAttendance(before) : null,
      after: after ? mapAttendance(after) : null,
    });
  }

  run(
    "UPDATE attendance_corrections SET status = ?, reviewed_by = ?, review_comment = ? WHERE id = ?",
    input.action === "approve" ? "approved" : "rejected",
    actor.id,
    input.comment ?? null,
    id
  );

  const after = queryOne<CorrectionDbRow>(`${CORRECTION_SELECT} WHERE c.id = ?`, id);
  if (!after) throw notFound();
  logAudit({
    actorId: actor.id,
    action: "update",
    entity: "attendance_correction",
    entityId: id,
    before: mapCorrection(row),
    after: mapCorrection(after),
  });

  notify(
    userForEmployee(Number(row.employee_id)),
    `Correction ${after.status}`,
    `Your attendance correction for ${row.date} was ${after.status}.`
  );

  return mapCorrection(after);
}
