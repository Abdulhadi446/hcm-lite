import "server-only";
import type { SessionUser } from "@/lib/auth";
import { nowIso, queryAll, queryOne, run } from "@/lib/db";
import { ApiError } from "@/lib/guards";
import { monthRange, todayIso, workingDaysBetween } from "@/lib/dates";
import { logAudit } from "./audit";
import { ApiFieldError, fieldError, notFound } from "./http";
import { ensureDefaultLeaveTypes } from "./org";
import {
  holidaySet,
  notify,
  round2,
  settingsOrThrow,
  userForEmployee,
} from "./shared";

// ---------------------------------------------------------------- types

export type LeaveBalance = {
  employeeId: number;
  leaveTypeId: number;
  typeName: string;
  quota: number;
  used: number;
  pending: number;
  remaining: number | null;
};

export type LeaveRequestStatus = "pending" | "approved" | "rejected" | "cancelled";

export type LeaveRequestRow = {
  id: number;
  employeeId: number;
  employeeName: string;
  departmentName: string | null;
  leaveTypeName: string;
  startDate: string;
  endDate: string;
  days: number;
  reason: string | null;
  status: LeaveRequestStatus;
  reviewComment: string | null;
  createdAt: string;
};

type LeaveTypeRow = { id: number; name: string; quota_days: number; paid: number };

type LeaveRequestDbRow = {
  id: number;
  employee_id: number;
  employee_name: string;
  department_name: string | null;
  leave_type_name: string;
  start_date: string;
  end_date: string;
  days: number;
  reason: string | null;
  status: LeaveRequestStatus;
  review_comment: string | null;
  created_at: string;
};

const REQUEST_SELECT = `SELECT r.id, r.employee_id, e.full_name AS employee_name,
  d.name AS department_name, lt.name AS leave_type_name,
  r.start_date, r.end_date, r.days, r.reason, r.status, r.review_comment, r.created_at
  FROM leave_requests r
  JOIN employees e ON e.id = r.employee_id
  LEFT JOIN departments d ON d.id = e.department_id
  JOIN leave_types lt ON lt.id = r.leave_type_id`;

function mapRequest(row: LeaveRequestDbRow): LeaveRequestRow {
  return {
    id: Number(row.id),
    employeeId: Number(row.employee_id),
    employeeName: row.employee_name,
    departmentName: row.department_name ?? null,
    leaveTypeName: row.leave_type_name,
    startDate: row.start_date,
    endDate: row.end_date,
    days: round2(Number(row.days)),
    reason: row.reason,
    status: row.status,
    reviewComment: row.review_comment,
    createdAt: row.created_at,
  };
}

function requestById(id: number): LeaveRequestRow {
  const row = queryOne<LeaveRequestDbRow>(`${REQUEST_SELECT} WHERE r.id = ?`, id);
  if (!row) throw notFound();
  return mapRequest(row);
}

function requireEmployeeId(user: SessionUser): number {
  if (user.employeeId === null) {
    throw new ApiError(400, "no_employee_profile");
  }
  return user.employeeId;
}

function currentYearRange(): { start: string; end: string } {
  const year = todayIso().slice(0, 4);
  return { start: `${year}-01-01`, end: `${year}-12-31` };
}

// ------------------------------------------------------------- balances

export function listBalances(
  user: SessionUser,
  filter: { employeeId?: number } = {}
): { items: LeaveBalance[] } {
  ensureDefaultLeaveTypes();

  const types = queryAll<LeaveTypeRow>(
    "SELECT id, name, quota_days, paid FROM leave_types ORDER BY id"
  );
  const year = currentYearRange();

  let employees: Array<{ id: number; code: string }>;

  if (user.role === "employee") {
    if (user.employeeId === null) return { items: [] };
    employees = queryAll<{ id: number; code: string }>(
      "SELECT id, code FROM employees WHERE id = ?",
      user.employeeId
    );
  } else if (filter.employeeId !== undefined) {
    employees = queryAll<{ id: number; code: string }>(
      "SELECT id, code FROM employees WHERE id = ?",
      filter.employeeId
    );
    if (employees.length === 0) throw notFound();
  } else {
    employees = queryAll<{ id: number; code: string }>(
      "SELECT id, code FROM employees ORDER BY code COLLATE NOCASE"
    );
  }

  const totals = queryAll<{
    employee_id: number;
    leave_type_id: number;
    used: number;
    pending: number;
  }>(
    `SELECT employee_id, leave_type_id,
            SUM(CASE WHEN status = 'approved' THEN days ELSE 0 END) AS used,
            SUM(CASE WHEN status = 'pending' THEN days ELSE 0 END) AS pending
       FROM leave_requests
      WHERE start_date >= ? AND start_date <= ? AND status IN ('approved', 'pending')
      GROUP BY employee_id, leave_type_id`,
    year.start,
    year.end
  );

  const totalsByKey = new Map(
    totals.map((row) => [`${row.employee_id}:${row.leave_type_id}`, row])
  );

  const items: LeaveBalance[] = [];
  for (const employee of employees) {
    for (const type of types) {
      const total = totalsByKey.get(`${employee.id}:${type.id}`);
      const used = round2(Number(total?.used ?? 0));
      const pending = round2(Number(total?.pending ?? 0));
      const quota = round2(Number(type.quota_days));
      items.push({
        employeeId: Number(employee.id),
        leaveTypeId: Number(type.id),
        typeName: type.name,
        quota,
        used,
        pending,
        remaining: quota > 0 ? round2(quota - used - pending) : null,
      });
    }
  }

  return { items };
}

// ------------------------------------------------------------- requests

export function createLeaveRequest(
  user: SessionUser,
  input: {
    leaveTypeId: number;
    startDate: string;
    endDate: string;
    reason: string;
  }
): LeaveRequestRow {
  const employeeId = requireEmployeeId(user);

  const type = queryOne<LeaveTypeRow>(
    "SELECT id, name, quota_days, paid FROM leave_types WHERE id = ?",
    input.leaveTypeId
  );
  if (!type) throw fieldError("leaveTypeId", "Unknown leave type");

  if (input.endDate < input.startDate) {
    throw fieldError("endDate", "End date must be on or after the start date");
  }

  const settings = settingsOrThrow();
  const days = workingDaysBetween(
    input.startDate,
    input.endDate,
    settings.weekendDays,
    holidaySet()
  );
  if (days === 0) {
    throw new ApiError(400, "Selected range has no working days");
  }

  const overlap = queryOne<{ id: number }>(
    `SELECT id FROM leave_requests
      WHERE employee_id = ? AND status IN ('pending', 'approved')
        AND start_date <= ? AND end_date >= ?
      LIMIT 1`,
    employeeId,
    input.endDate,
    input.startDate
  );
  if (overlap) throw new ApiError(422, "overlap");

  const quota = round2(Number(type.quota_days));
  if (quota > 0 && Number(type.paid) === 1) {
    const year = currentYearRange();
    const totals = queryOne<{ used: number; pending: number }>(
      `SELECT
         SUM(CASE WHEN status = 'approved' THEN days ELSE 0 END) AS used,
         SUM(CASE WHEN status = 'pending' THEN days ELSE 0 END) AS pending
       FROM leave_requests
       WHERE employee_id = ? AND leave_type_id = ?
         AND start_date >= ? AND start_date <= ?
         AND status IN ('approved', 'pending')`,
      employeeId,
      type.id,
      year.start,
      year.end
    );
    const used = round2(Number(totals?.used ?? 0));
    const pending = round2(Number(totals?.pending ?? 0));
    const remaining = round2(quota - used - pending);
    if (days > remaining) {
      throw new ApiFieldError(422, "insufficient_balance", {
        extra: { remaining },
      });
    }
  }

  const result = run(
    `INSERT INTO leave_requests
       (employee_id, leave_type_id, start_date, end_date, days, reason, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)`,
    employeeId,
    type.id,
    input.startDate,
    input.endDate,
    days,
    input.reason,
    nowIso()
  );

  const request = requestById(Number(result.lastInsertRowid));
  logAudit({
    actorId: user.id,
    action: "create",
    entity: "leave_request",
    entityId: request.id,
    after: request,
  });
  return request;
}

export function listLeaveRequests(
  user: SessionUser,
  filter: { status?: string; employeeId?: number; month?: string } = {}
): { items: LeaveRequestRow[] } {
  const where: string[] = [];
  const args: Array<string | number> = [];

  if (user.role === "employee") {
    if (user.employeeId === null) return { items: [] };
    where.push("r.employee_id = ?");
    args.push(user.employeeId);
  } else if (filter.employeeId !== undefined) {
    where.push("r.employee_id = ?");
    args.push(filter.employeeId);
  }

  if (filter.status) {
    where.push("r.status = ?");
    args.push(filter.status);
  }

  if (filter.month) {
    const { start, end } = monthRange(filter.month);
    where.push("r.start_date <= ? AND r.end_date >= ?");
    args.push(end, start);
  }

  const rows = queryAll<LeaveRequestDbRow>(
    `${REQUEST_SELECT} ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
     ORDER BY r.created_at DESC, r.id DESC`,
    ...args
  );
  return { items: rows.map(mapRequest) };
}

export function reviewLeaveRequest(
  actor: SessionUser,
  id: number,
  input: { action: "approve" | "reject"; comment?: string }
): LeaveRequestRow {
  if (actor.role !== "hr") throw new ApiError(403, "forbidden");

  const before = requestById(id);
  if (before.status !== "pending") throw new ApiError(409, "not_pending");

  const status: LeaveRequestStatus = input.action === "approve" ? "approved" : "rejected";
  run(
    "UPDATE leave_requests SET status = ?, reviewed_by = ?, review_comment = ? WHERE id = ?",
    status,
    actor.id,
    input.comment ?? null,
    id
  );

  const after = requestById(id);
  logAudit({
    actorId: actor.id,
    action: "update",
    entity: "leave_request",
    entityId: id,
    before,
    after,
  });

  const verb = status === "approved" ? "approved" : "rejected";
  notify(
    userForEmployee(before.employeeId),
    `Leave ${verb}`,
    `Your ${before.leaveTypeName} leave ${before.startDate} → ${before.endDate} (${before.days} day${
      before.days === 1 ? "" : "s"
    }) was ${verb}.${input.comment ? ` Comment: ${input.comment}` : ""}`
  );

  return after;
}

export function cancelLeaveRequest(actor: SessionUser, id: number): LeaveRequestRow {
  const before = requestById(id);
  if (actor.employeeId === null || actor.employeeId !== before.employeeId) {
    throw new ApiError(403, "forbidden");
  }

  const cancellable =
    before.status === "pending" ||
    (before.status === "approved" && before.startDate > todayIso());
  if (!cancellable) throw new ApiError(409, "cannot_cancel");

  run("UPDATE leave_requests SET status = 'cancelled' WHERE id = ?", id);
  const after = requestById(id);
  logAudit({
    actorId: actor.id,
    action: "update",
    entity: "leave_request",
    entityId: id,
    before,
    after,
  });
  return after;
}
