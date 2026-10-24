import "server-only";
import { queryAll, queryOne, run } from "@/lib/db";
import { ApiError } from "@/lib/guards";
import { isValidWeekendDays } from "@/lib/validation";
import { logAudit } from "./audit";
import { ApiFieldError, duplicateError, fieldError, notFound } from "./http";

// ---------------------------------------------------------------- types

export type Settings = {
  companyName: string;
  officeStart: string;
  graceMinutes: number;
  halfDayMinutes: number;
  weekendDays: string;
  officeLat: number | null;
  officeLng: number | null;
  radiusM: number;
};

export type SettingsPatch = Partial<Settings>;

export type Department = { id: number; name: string; employeeCount: number };

export type Designation = {
  id: number;
  name: string;
  departmentId: number | null;
  departmentName: string | null;
};

export type LeaveType = { id: number; name: string; quotaDays: number; paid: boolean };

export type Holiday = { id: number; date: string; name: string };

type SettingsRow = {
  company_name: string;
  office_start: string;
  grace_minutes: number;
  half_day_minutes: number;
  weekend_days: string;
  office_lat: number | null;
  office_lng: number | null;
  radius_m: number;
};

// ------------------------------------------------------------- settings

function mapSettings(row: SettingsRow): Settings {
  return {
    companyName: row.company_name,
    officeStart: row.office_start,
    graceMinutes: Number(row.grace_minutes),
    halfDayMinutes: Number(row.half_day_minutes),
    weekendDays: row.weekend_days,
    officeLat: row.office_lat === null ? null : Number(row.office_lat),
    officeLng: row.office_lng === null ? null : Number(row.office_lng),
    radiusM: Number(row.radius_m),
  };
}

function readSettingsRow(): SettingsRow {
  const row = queryOne<SettingsRow>(
    "SELECT company_name, office_start, grace_minutes, half_day_minutes, weekend_days, office_lat, office_lng, radius_m FROM settings WHERE id = 1"
  );
  if (!row) throw new ApiError(409, "not_initialized");
  return row;
}

export function getSettings(): Settings {
  return mapSettings(readSettingsRow());
}

export function updateSettings(patch: SettingsPatch, actorId: number): Settings {
  const before = getSettings();
  const next: Settings = { ...before };

  if (patch.companyName !== undefined) next.companyName = patch.companyName.trim();
  if (patch.officeStart !== undefined) next.officeStart = patch.officeStart;
  if (patch.graceMinutes !== undefined) next.graceMinutes = patch.graceMinutes;
  if (patch.halfDayMinutes !== undefined) next.halfDayMinutes = patch.halfDayMinutes;
  if (patch.radiusM !== undefined) next.radiusM = patch.radiusM;

  if (patch.weekendDays !== undefined) {
    const normalized = patch.weekendDays
      .split(",")
      .map((d) => d.trim().toLowerCase())
      .filter(Boolean)
      .join(",");
    if (!isValidWeekendDays(normalized)) {
      throw fieldError("weekendDays", "Weekend days must be day names like sat,sun");
    }
    next.weekendDays = normalized;
  }

  // officeLat / officeLng are both-or-neither. `null` clears the pair.
  if (patch.officeLat !== undefined || patch.officeLng !== undefined) {
    const lat = patch.officeLat !== undefined ? patch.officeLat : before.officeLat;
    const lng = patch.officeLng !== undefined ? patch.officeLng : before.officeLng;
    if ((lat === null) !== (lng === null)) {
      throw fieldError("officeLat", "Provide both office latitude and longitude, or neither");
    }
    next.officeLat = lat;
    next.officeLng = lng;
  }

  run(
    "UPDATE settings SET company_name = ?, office_start = ?, grace_minutes = ?, half_day_minutes = ?, weekend_days = ?, office_lat = ?, office_lng = ?, radius_m = ? WHERE id = 1",
    next.companyName,
    next.officeStart,
    next.graceMinutes,
    next.halfDayMinutes,
    next.weekendDays,
    next.officeLat,
    next.officeLng,
    next.radiusM
  );

  const after = getSettings();
  logAudit({
    actorId,
    action: "update",
    entity: "settings",
    entityId: 1,
    before,
    after,
  });
  return after;
}

// ---------------------------------------------------------- departments

export function listDepartments(): Department[] {
  return queryAll<{ id: number; name: string; employee_count: number }>(
    `SELECT d.id, d.name, COUNT(e.id) AS employee_count
       FROM departments d
       LEFT JOIN employees e ON e.department_id = d.id
      GROUP BY d.id, d.name
      ORDER BY d.name COLLATE NOCASE`
  ).map((row) => ({
    id: Number(row.id),
    name: row.name,
    employeeCount: Number(row.employee_count),
  }));
}

function departmentById(id: number): { id: number; name: string } {
  const row = queryOne<{ id: number; name: string }>(
    "SELECT id, name FROM departments WHERE id = ?",
    id
  );
  if (!row) throw notFound();
  return { id: Number(row.id), name: row.name };
}

function assertDepartmentNameFree(name: string, excludeId?: number): void {
  const clash = queryOne<{ id: number }>(
    "SELECT id FROM departments WHERE lower(name) = lower(?) AND id <> ?",
    name,
    excludeId ?? 0
  );
  if (clash) throw duplicateError("name");
}

export function createDepartment(input: { name: string }, actorId: number): Department {
  const name = input.name.trim();
  assertDepartmentNameFree(name);
  const result = run("INSERT INTO departments (name) VALUES (?)", name);
  const id = Number(result.lastInsertRowid);
  const department: Department = { id, name, employeeCount: 0 };
  logAudit({ actorId, action: "create", entity: "department", entityId: id, after: department });
  return department;
}

export function updateDepartment(
  id: number,
  input: { name: string },
  actorId: number
): Department {
  const before = departmentById(id);
  const name = input.name.trim();
  assertDepartmentNameFree(name, id);
  run("UPDATE departments SET name = ? WHERE id = ?", name, id);
  const after: Department = {
    id,
    name,
    employeeCount: countEmployeesByDepartment(id),
  };
  logAudit({ actorId, action: "update", entity: "department", entityId: id, before, after });
  return after;
}

function countEmployeesByDepartment(departmentId: number): number {
  return Number(
    queryOne<{ c: number }>(
      "SELECT COUNT(*) AS c FROM employees WHERE department_id = ?",
      departmentId
    )?.c ?? 0
  );
}

function countEmployeesByDesignation(designationId: number): number {
  return Number(
    queryOne<{ c: number }>(
      "SELECT COUNT(*) AS c FROM employees WHERE designation_id = ?",
      designationId
    )?.c ?? 0
  );
}

export function deleteDepartment(id: number, actorId: number): void {
  const before = departmentById(id);
  if (countEmployeesByDepartment(id) > 0) {
    throw new ApiError(409, "in_use");
  }
  run("DELETE FROM departments WHERE id = ?", id);
  logAudit({ actorId, action: "delete", entity: "department", entityId: id, before });
}

// --------------------------------------------------------- designations

export function listDesignations(): Designation[] {
  return queryAll<{
    id: number;
    name: string;
    department_id: number | null;
    department_name: string | null;
  }>(
    `SELECT g.id, g.name, g.department_id, d.name AS department_name
       FROM designations g
       LEFT JOIN departments d ON d.id = g.department_id
      ORDER BY g.name COLLATE NOCASE`
  ).map((row) => ({
    id: Number(row.id),
    name: row.name,
    departmentId: row.department_id === null ? null : Number(row.department_id),
    departmentName: row.department_name ?? null,
  }));
}

function designationById(id: number): Designation {
  const row = queryOne<{
    id: number;
    name: string;
    department_id: number | null;
    department_name: string | null;
  }>(
    `SELECT g.id, g.name, g.department_id, d.name AS department_name
       FROM designations g
       LEFT JOIN departments d ON d.id = g.department_id
      WHERE g.id = ?`,
    id
  );
  if (!row) throw notFound();
  return {
    id: Number(row.id),
    name: row.name,
    departmentId: row.department_id === null ? null : Number(row.department_id),
    departmentName: row.department_name ?? null,
  };
}

function assertDepartmentExists(departmentId: number | null | undefined): void {
  if (departmentId === null || departmentId === undefined) return;
  const row = queryOne<{ id: number }>("SELECT id FROM departments WHERE id = ?", departmentId);
  if (!row) throw fieldError("departmentId", "Unknown department");
}

function assertDesignationNameFree(
  name: string,
  departmentId: number | null | undefined,
  excludeId?: number
): void {
  const clash = queryOne<{ id: number }>(
    "SELECT id FROM designations WHERE lower(name) = lower(?) AND COALESCE(department_id, 0) = ? AND id <> ?",
    name,
    departmentId ?? 0,
    excludeId ?? 0
  );
  if (clash) throw duplicateError("name");
}

export function createDesignation(
  input: { name: string; departmentId?: number | null },
  actorId: number
): Designation {
  const name = input.name.trim();
  const departmentId = input.departmentId ?? null;
  assertDepartmentExists(departmentId);
  assertDesignationNameFree(name, departmentId);
  const result = run(
    "INSERT INTO designations (name, department_id) VALUES (?, ?)",
    name,
    departmentId
  );
  const designation = designationById(Number(result.lastInsertRowid));
  logAudit({
    actorId,
    action: "create",
    entity: "designation",
    entityId: designation.id,
    after: designation,
  });
  return designation;
}

export function updateDesignation(
  id: number,
  input: { name: string; departmentId?: number | null },
  actorId: number
): Designation {
  const before = designationById(id);
  const name = input.name.trim();
  const departmentId =
    input.departmentId === undefined ? before.departmentId : input.departmentId;
  assertDepartmentExists(departmentId);
  assertDesignationNameFree(name, departmentId, id);
  run(
    "UPDATE designations SET name = ?, department_id = ? WHERE id = ?",
    name,
    departmentId,
    id
  );
  const after = designationById(id);
  logAudit({ actorId, action: "update", entity: "designation", entityId: id, before, after });
  return after;
}

export function deleteDesignation(id: number, actorId: number): void {
  const before = designationById(id);
  if (countEmployeesByDesignation(id) > 0) {
    throw new ApiError(409, "in_use");
  }
  run("DELETE FROM designations WHERE id = ?", id);
  logAudit({ actorId, action: "delete", entity: "designation", entityId: id, before });
}

// ----------------------------------------------------------- leave types

/**
 * Seed the four contract defaults once — only when the table is completely
 * empty. Idempotent, called from `GET /api/leave-types` and leave balances.
 */
export function ensureDefaultLeaveTypes(): void {
  const row = queryOne<{ c: number }>("SELECT COUNT(*) AS c FROM leave_types");
  if (Number(row?.c ?? 0) > 0) return;
  const defaults: Array<[string, number, number]> = [
    ["Annual", 14, 1],
    ["Sick", 8, 1],
    ["Casual", 10, 1],
    ["Unpaid", 0, 0],
  ];
  for (const [name, quota, paid] of defaults) {
    run(
      "INSERT OR IGNORE INTO leave_types (name, quota_days, paid) VALUES (?, ?, ?)",
      name,
      quota,
      paid
    );
  }
}

export function listLeaveTypes(): LeaveType[] {
  ensureDefaultLeaveTypes();
  return queryAll<{ id: number; name: string; quota_days: number; paid: number }>(
    "SELECT id, name, quota_days, paid FROM leave_types ORDER BY id"
  ).map((row) => ({
    id: Number(row.id),
    name: row.name,
    quotaDays: Number(row.quota_days),
    paid: Number(row.paid) === 1,
  }));
}

function leaveTypeById(id: number): LeaveType {
  const row = queryOne<{ id: number; name: string; quota_days: number; paid: number }>(
    "SELECT id, name, quota_days, paid FROM leave_types WHERE id = ?",
    id
  );
  if (!row) throw notFound();
  return {
    id: Number(row.id),
    name: row.name,
    quotaDays: Number(row.quota_days),
    paid: Number(row.paid) === 1,
  };
}

function assertLeaveTypeNameFree(name: string, excludeId?: number): void {
  const clash = queryOne<{ id: number }>(
    "SELECT id FROM leave_types WHERE lower(name) = lower(?) AND id <> ?",
    name,
    excludeId ?? 0
  );
  if (clash) throw duplicateError("name");
}

export function createLeaveType(
  input: { name: string; quotaDays: number; paid: boolean },
  actorId: number
): LeaveType {
  const name = input.name.trim();
  assertLeaveTypeNameFree(name);
  const result = run(
    "INSERT INTO leave_types (name, quota_days, paid) VALUES (?, ?, ?)",
    name,
    input.quotaDays,
    input.paid ? 1 : 0
  );
  const leaveType = leaveTypeById(Number(result.lastInsertRowid));
  logAudit({
    actorId,
    action: "create",
    entity: "leave_type",
    entityId: leaveType.id,
    after: leaveType,
  });
  return leaveType;
}

export function updateLeaveType(
  id: number,
  input: Partial<{ name: string; quotaDays: number; paid: boolean }>,
  actorId: number
): LeaveType {
  const before = leaveTypeById(id);
  const name = input.name === undefined ? before.name : input.name.trim();
  if (input.name !== undefined) assertLeaveTypeNameFree(name, id);
  const quotaDays = input.quotaDays === undefined ? before.quotaDays : input.quotaDays;
  const paid = input.paid === undefined ? before.paid : input.paid;
  run(
    "UPDATE leave_types SET name = ?, quota_days = ?, paid = ? WHERE id = ?",
    name,
    quotaDays,
    paid ? 1 : 0,
    id
  );
  const after = leaveTypeById(id);
  logAudit({ actorId, action: "update", entity: "leave_type", entityId: id, before, after });
  return after;
}

export function deleteLeaveType(id: number, actorId: number): void {
  const before = leaveTypeById(id);
  const inUse = Number(
    queryOne<{ c: number }>(
      "SELECT COUNT(*) AS c FROM leave_requests WHERE leave_type_id = ?",
      id
    )?.c ?? 0
  );
  if (inUse > 0) throw new ApiError(409, "in_use");
  run("DELETE FROM leave_types WHERE id = ?", id);
  logAudit({ actorId, action: "delete", entity: "leave_type", entityId: id, before });
}

// ------------------------------------------------------------- holidays

export function listHolidays(year?: number): Holiday[] {
  const rows = year
    ? queryAll<{ id: number; date: string; name: string }>(
        "SELECT id, date, name FROM holidays WHERE date LIKE ? ORDER BY date",
        `${year}-%`
      )
    : queryAll<{ id: number; date: string; name: string }>(
        "SELECT id, date, name FROM holidays ORDER BY date"
      );
  return rows.map((row) => ({ id: Number(row.id), date: row.date, name: row.name }));
}

export function createHoliday(
  input: { date: string; name: string },
  actorId: number
): Holiday {
  const clash = queryOne<{ id: number }>(
    "SELECT id FROM holidays WHERE date = ?",
    input.date
  );
  if (clash) throw new ApiFieldError(409, "duplicate", { field: "date" });
  const result = run(
    "INSERT INTO holidays (date, name) VALUES (?, ?)",
    input.date,
    input.name.trim()
  );
  const holiday = {
    id: Number(result.lastInsertRowid),
    date: input.date,
    name: input.name.trim(),
  };
  logAudit({ actorId, action: "create", entity: "holiday", entityId: holiday.id, after: holiday });
  return holiday;
}

export function deleteHoliday(id: number, actorId: number): void {
  const before = queryOne<{ id: number; date: string; name: string }>(
    "SELECT id, date, name FROM holidays WHERE id = ?",
    id
  );
  if (!before) throw notFound();
  run("DELETE FROM holidays WHERE id = ?", id);
  logAudit({ actorId, action: "delete", entity: "holiday", entityId: id, before });
}
