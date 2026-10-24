import "server-only";
import type { SqlValue } from "node:sqlite";
import { hashPassword, type Role, type SessionUser } from "@/lib/auth";
import { getDb, nowIso, queryAll, queryOne, run } from "@/lib/db";
import { ApiError, scopeEmployeeId } from "@/lib/guards";
import { isIsoDate, todayIso } from "@/lib/dates";
import { logAudit } from "./audit";
import { ensureDefaultLeaveTypes } from "./org";
import { ApiFieldError, duplicateError, fieldError, notFound } from "./http";
import { generateTempPassword } from "./users";

// ---------------------------------------------------------------- types

export type EmployeeStatus = "active" | "probation" | "exited";

export type Employee = {
  id: number;
  code: string;
  fullName: string;
  email: string;
  phone: string | null;
  address: string | null;
  departmentId: number | null;
  departmentName: string | null;
  designationId: number | null;
  designationName: string | null;
  joinDate: string | null;
  status: EmployeeStatus;
  exitDate: string | null;
  basicSalary: number;
  grossSalary: number;
  hasLogin: boolean;
};

export type Scope = { role: Role; employeeId: number | null };

export type EmployeeFilters = {
  q?: string;
  departmentId?: number | null;
  status?: string | null;
  page?: number;
  pageSize?: number;
  sort?: string | null;
};

export type EmployeeInput = {
  code: string;
  fullName: string;
  email: string;
  phone?: string | null;
  address?: string | null;
  departmentId?: number | null;
  designationId?: number | null;
  joinDate: string;
  status: EmployeeStatus;
  basicSalary: number;
  password?: string;
};

export type EmployeePatch = Partial<Omit<EmployeeInput, "code">> & {
  exitDate?: string | null;
};

export type ImportRow = { row: number; values: Record<string, string> };
export type ImportError = { row: number; field: string; reason: string };

export type ImportResult = {
  dryRun: boolean;
  total: number;
  valid: number;
  errors: ImportError[];
  created: Employee[];
};

export const MAX_IMPORT_ROWS = 500;

const STATUSES: EmployeeStatus[] = ["active", "probation", "exited"];

type EmployeeDbRow = {
  id: number;
  code: string;
  full_name: string;
  email: string;
  phone: string | null;
  address: string | null;
  department_id: number | null;
  designation_id: number | null;
  join_date: string | null;
  status: EmployeeStatus;
  exit_date: string | null;
  basic_salary: number;
  department_name: string | null;
  designation_name: string | null;
  has_login: number;
};

const EMPLOYEE_COLUMNS = `e.id, e.code, e.full_name, e.email, e.phone, e.address,
  e.department_id, e.designation_id, e.join_date, e.status, e.exit_date, e.basic_salary,
  d.name AS department_name, g.name AS designation_name,
  (SELECT COUNT(*) FROM users u WHERE u.employee_id = e.id) AS has_login`;

const EMPLOYEE_FROM = `FROM employees e
  LEFT JOIN departments d ON d.id = e.department_id
  LEFT JOIN designations g ON g.id = e.designation_id`;

export function toScope(user: SessionUser): Scope {
  return { role: user.role, employeeId: scopeEmployeeId(user) };
}

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function mapEmployee(row: EmployeeDbRow): Employee {
  const basicSalary = round2(Number(row.basic_salary) || 0);
  return {
    id: Number(row.id),
    code: row.code,
    fullName: row.full_name,
    email: row.email,
    phone: row.phone,
    address: row.address,
    departmentId: row.department_id === null ? null : Number(row.department_id),
    departmentName: row.department_name ?? null,
    designationId: row.designation_id === null ? null : Number(row.designation_id),
    designationName: row.designation_name ?? null,
    joinDate: row.join_date,
    status: row.status,
    exitDate: row.exit_date,
    basicSalary,
    grossSalary: round2(basicSalary * 1.5),
    hasLogin: Number(row.has_login) > 0,
  };
}

function employeeRowById(id: number): EmployeeDbRow {
  const row = queryOne<EmployeeDbRow>(
    `SELECT ${EMPLOYEE_COLUMNS} ${EMPLOYEE_FROM} WHERE e.id = ?`,
    id
  );
  if (!row) throw notFound();
  return row;
}

// ------------------------------------------------------------- queries

export function listEmployees(
  filters: EmployeeFilters,
  scope: Scope
): { items: Employee[]; total: number; page: number; pageSize: number } {
  const page = Math.max(1, Math.floor(Number(filters.page) || 1));
  const pageSize = Math.min(100, Math.max(1, Math.floor(Number(filters.pageSize) || 20)));

  if (scope.role === "employee") {
    if (scope.employeeId === null) {
      return { items: [], total: 0, page, pageSize };
    }
    const row = queryOne<EmployeeDbRow>(
      `SELECT ${EMPLOYEE_COLUMNS} ${EMPLOYEE_FROM} WHERE e.id = ?`,
      scope.employeeId
    );
    return { items: row ? [mapEmployee(row)] : [], total: row ? 1 : 0, page: 1, pageSize };
  }

  const where: string[] = [];
  const params: SqlValue[] = [];

  const q = filters.q?.trim();
  if (q) {
    const escaped = q.replace(/[\\%_]/g, (ch) => `\\${ch}`);
    const like = `%${escaped}%`;
    where.push(
      "(e.full_name LIKE ? ESCAPE '\\' OR e.code LIKE ? ESCAPE '\\' OR e.email LIKE ? ESCAPE '\\')"
    );
    params.push(like, like, like);
  }

  if (filters.departmentId !== undefined && filters.departmentId !== null) {
    where.push("e.department_id = ?");
    params.push(Number(filters.departmentId));
  }

  const status = filters.status?.trim();
  if (status && STATUSES.includes(status as EmployeeStatus)) {
    where.push("e.status = ?");
    params.push(status);
  }

  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const total = Number(
    queryOne<{ c: number }>(
      `SELECT COUNT(*) AS c FROM employees e ${whereSql}`,
      ...params
    )?.c ?? 0
  );

  const sortMap: Record<string, string> = {
    name: "e.full_name",
    code: "e.code",
    joinDate: "e.join_date",
  };
  const rawSort = (filters.sort ?? "name").trim();
  const desc = rawSort.startsWith("-");
  const sortKey = desc ? rawSort.slice(1) : rawSort;
  const column = sortMap[sortKey] ?? "e.full_name";
  const direction = desc ? "DESC" : "ASC";
  const orderBy =
    column === "e.join_date"
      ? `e.join_date IS NULL ASC, e.join_date ${direction}, e.id ASC`
      : `${column} ${direction}, e.id ASC`;

  const rows = queryAll<EmployeeDbRow>(
    `SELECT ${EMPLOYEE_COLUMNS} ${EMPLOYEE_FROM} ${whereSql} ORDER BY ${orderBy} LIMIT ? OFFSET ?`,
    ...params,
    pageSize,
    (page - 1) * pageSize
  );

  return {
    items: rows.map(mapEmployee),
    total,
    page,
    pageSize,
  };
}

export function getEmployee(id: number, scope: Scope): Employee {
  if (scope.role === "employee") {
    if (scope.employeeId === null || scope.employeeId !== id) {
      throw new ApiError(403, "forbidden");
    }
  }
  return mapEmployee(employeeRowById(id));
}

// -------------------------------------------------------- validation

function assertCodeFree(code: string): void {
  const clash = queryOne<{ id: number }>(
    "SELECT id FROM employees WHERE lower(code) = lower(?)",
    code
  );
  if (clash) throw duplicateError("code");
}

function assertEmployeeEmailFree(email: string, excludeEmployeeId?: number): void {
  const clash = queryOne<{ id: number }>(
    "SELECT id FROM employees WHERE lower(email) = lower(?) AND id <> ?",
    email,
    excludeEmployeeId ?? 0
  );
  if (clash) throw duplicateError("email");
}

function assertLoginEmailFree(email: string, excludeUserId?: number): void {
  const clash = queryOne<{ id: number }>(
    "SELECT id FROM users WHERE lower(email) = lower(?) AND id <> ?",
    email,
    excludeUserId ?? 0
  );
  if (clash) throw duplicateError("email");
}

function assertDepartmentExists(departmentId: number | null | undefined): void {
  if (departmentId === null || departmentId === undefined) return;
  const row = queryOne<{ id: number }>("SELECT id FROM departments WHERE id = ?", departmentId);
  if (!row) throw fieldError("departmentId", "Unknown department");
}

function assertDesignationExists(designationId: number | null | undefined): void {
  if (designationId === null || designationId === undefined) return;
  const row = queryOne<{ id: number }>("SELECT id FROM designations WHERE id = ?", designationId);
  if (!row) throw fieldError("designationId", "Unknown designation");
}

function assertStatus(status: string): asserts status is EmployeeStatus {
  if (!STATUSES.includes(status as EmployeeStatus)) {
    throw fieldError("status", "Status must be active, probation or exited");
  }
}

function assertJoinDate(joinDate: string): void {
  if (!isIsoDate(joinDate)) {
    throw fieldError("joinDate", "Join date must be a valid date (YYYY-MM-DD)");
  }
}

// ----------------------------------------------------------- mutations

export function createEmployee(
  input: EmployeeInput,
  actor: SessionUser
): { employee: Employee; temporaryPassword: string } {
  if (actor.role !== "hr" && actor.role !== "admin") {
    throw new ApiError(403, "forbidden");
  }

  const code = input.code.trim();
  const fullName = input.fullName.trim();
  const email = input.email.trim().toLowerCase();
  const joinDate = input.joinDate;
  assertJoinDate(joinDate);
  assertStatus(input.status);
  if (!(input.basicSalary > 0)) {
    throw fieldError("basicSalary", "Basic salary must be greater than 0");
  }
  if (input.password !== undefined && input.password.length < 8) {
    throw fieldError("password", "Password must be at least 8 characters");
  }
  assertDepartmentExists(input.departmentId);
  assertDesignationExists(input.designationId);
  assertCodeFree(code);
  assertEmployeeEmailFree(email);
  assertLoginEmailFree(email);

  const temporaryPassword = input.password || generateTempPassword();
  const db = getDb();
  let employeeId = 0;

  db.exec("BEGIN IMMEDIATE;");
  try {
    const result = run(
      `INSERT INTO employees (code, full_name, email, phone, address, department_id,
        designation_id, join_date, status, exit_date, basic_salary, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)`,
      code,
      fullName,
      email,
      input.phone ?? null,
      input.address ?? null,
      input.departmentId ?? null,
      input.designationId ?? null,
      joinDate,
      input.status,
      input.basicSalary,
      nowIso()
    );
    employeeId = Number(result.lastInsertRowid);

    run(
      `INSERT INTO users (email, password_hash, name, role, employee_id,
        must_change_password, active, created_at)
       VALUES (?, ?, ?, 'employee', ?, 1, 1, ?)`,
      email,
      hashPassword(temporaryPassword),
      fullName,
      employeeId,
      nowIso()
    );

    db.exec("COMMIT;");
  } catch (err) {
    db.exec("ROLLBACK;");
    throw err;
  }

  const employee = mapEmployee(employeeRowById(employeeId));
  logAudit({
    actorId: actor.id,
    action: "create",
    entity: "employee",
    entityId: employee.id,
    after: { ...employee, loginCreated: true },
  });
  return { employee, temporaryPassword };
}

export function updateEmployee(
  id: number,
  patch: EmployeePatch,
  actor: SessionUser
): Employee {
  if (actor.role === "employee") {
    if (actor.employeeId === null || actor.employeeId !== id) {
      throw new ApiError(403, "forbidden");
    }
    const allowed = new Set(["phone", "address"]);
    for (const key of Object.keys(patch)) {
      if ((patch as Record<string, unknown>)[key] !== undefined && !allowed.has(key)) {
        throw new ApiError(403, "forbidden");
      }
    }
  } else if (actor.role !== "hr" && actor.role !== "admin") {
    throw new ApiError(403, "forbidden");
  }

  const before = mapEmployee(employeeRowById(id));
  assertDepartmentExists(patch.departmentId);
  assertDesignationExists(patch.designationId);
  if (patch.joinDate !== undefined) assertJoinDate(patch.joinDate);
  if (patch.status !== undefined) assertStatus(patch.status);
  if (patch.basicSalary !== undefined && !(patch.basicSalary > 0)) {
    throw fieldError("basicSalary", "Basic salary must be greater than 0");
  }
  if (patch.password !== undefined && patch.password.length < 8) {
    throw fieldError("password", "Password must be at least 8 characters");
  }

  let email = before.email;
  if (patch.email !== undefined) {
    email = patch.email.trim().toLowerCase();
    assertEmployeeEmailFree(email, id);
    const linked = queryOne<{ id: number }>(
      "SELECT id FROM users WHERE employee_id = ?",
      id
    );
    assertLoginEmailFree(email, linked ? Number(linked.id) : undefined);
  }

  const sets: string[] = [];
  const params: SqlValue[] = [];
  const set = (column: string, value: SqlValue) => {
    sets.push(`${column} = ?`);
    params.push(value);
  };

  if (patch.fullName !== undefined) set("full_name", patch.fullName.trim());
  if (patch.email !== undefined) set("email", email);
  if (patch.phone !== undefined) set("phone", patch.phone);
  if (patch.address !== undefined) set("address", patch.address);
  if (patch.departmentId !== undefined) set("department_id", patch.departmentId);
  if (patch.designationId !== undefined) set("designation_id", patch.designationId);
  if (patch.joinDate !== undefined) set("join_date", patch.joinDate);
  if (patch.status !== undefined) set("status", patch.status);
  if (patch.exitDate !== undefined) {
    if (patch.exitDate !== null && !isIsoDate(patch.exitDate)) {
      throw fieldError("exitDate", "Exit date must be a valid date (YYYY-MM-DD)");
    }
    set("exit_date", patch.exitDate);
  }
  if (patch.basicSalary !== undefined) set("basic_salary", patch.basicSalary);

  if (sets.length > 0) {
    run(
      `UPDATE employees SET ${sets.join(", ")} WHERE id = ?`,
      ...params,
      id
    );
  }

  // Changing an employee's email keeps their login usable.
  if (patch.email !== undefined) {
    run("UPDATE users SET email = ? WHERE employee_id = ?", email, id);
  }

  let passwordReset = false;
  if (patch.password !== undefined) {
    run(
      "UPDATE users SET password_hash = ?, must_change_password = 1 WHERE employee_id = ?",
      hashPassword(patch.password),
      id
    );
    passwordReset = true;
  }

  const after = mapEmployee(employeeRowById(id));
  logAudit({
    actorId: actor.id,
    action: "update",
    entity: "employee",
    entityId: id,
    before,
    after,
  });
  if (passwordReset) {
    logAudit({
      actorId: actor.id,
      action: "reset_password",
      entity: "employee",
      entityId: id,
      before: { hasLogin: before.hasLogin },
      after: { hasLogin: after.hasLogin, mustChangePassword: true },
    });
  }
  return after;
}

// ------------------------------------------------------------ overview

export function employeeOverview(
  id: number,
  scope: Scope
): {
  employee: Employee;
  attendance: {
    presentDays: number;
    lateDays: number;
    absentDays: number;
    last30: { date: string; status: string }[];
  };
  leave: { typeName: string; quota: number; used: number; remaining: number }[];
  payslips: { id: number; month: string; net: number }[];
} {
  const employee = getEmployee(id, scope);

  const attendanceRow = queryOne<{ present: number; late: number; absent: number }>(
    `SELECT
       SUM(CASE WHEN status IN ('present','late','half_day') OR (status IS NULL AND check_in_at IS NOT NULL) THEN 1 ELSE 0 END) AS present,
       SUM(CASE WHEN status = 'late' THEN 1 ELSE 0 END) AS late,
       SUM(CASE WHEN status = 'absent' THEN 1 ELSE 0 END) AS absent
     FROM attendance
     WHERE employee_id = ? AND date >= date('now', '-30 day')`,
    id
  );

  const last30 = queryAll<{ date: string; status: string }>(
    "SELECT date, status FROM attendance WHERE employee_id = ? ORDER BY date DESC LIMIT 30",
    id
  ).map((row) => ({ date: row.date, status: row.status ?? "" }));

  ensureDefaultLeaveTypes();
  const year = todayIso().slice(0, 4);
  const leave = queryAll<{ name: string; quota_days: number; used: number }>(
    `SELECT lt.name, lt.quota_days,
            COALESCE(SUM(CASE WHEN lr.status = 'approved' THEN lr.days ELSE 0 END), 0) AS used
       FROM leave_types lt
       LEFT JOIN leave_requests lr
         ON lr.leave_type_id = lt.id
        AND lr.employee_id = ?
        AND lr.start_date >= ? AND lr.start_date <= ?
      GROUP BY lt.id, lt.name, lt.quota_days
      ORDER BY lt.id`,
    id,
    `${year}-01-01`,
    `${year}-12-31`
  ).map((row) => {
    const quota = round2(Number(row.quota_days) || 0);
    const used = round2(Number(row.used) || 0);
    return {
      typeName: row.name,
      quota,
      used,
      remaining: quota > 0 ? round2(Math.max(0, quota - used)) : 0,
    };
  });

  const payslips = queryAll<{ id: number; month: string; net: number }>(
    `SELECT p.id, r.month, p.net
       FROM payslips p
       JOIN payroll_runs r ON r.id = p.run_id
      WHERE p.employee_id = ?
      ORDER BY r.month DESC`,
    id
  ).map((row) => ({ id: Number(row.id), month: row.month, net: round2(Number(row.net) || 0) }));

  return {
    employee,
    attendance: {
      presentDays: Number(attendanceRow?.present ?? 0),
      lateDays: Number(attendanceRow?.late ?? 0),
      absentDays: Number(attendanceRow?.absent ?? 0),
      last30,
    },
    leave,
    payslips,
  };
}

// ---------------------------------------------------------------- CSV

/** Minimal RFC-4180-ish parser: quoted fields, embedded commas/newlines, `""`. */
export function parseCsv(text: string): string[][] {
  const src = String(text ?? "").replace(/^\uFEFF/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (ch !== "\r") {
      field += ch;
    }
  }
  row.push(field);
  rows.push(row);

  // Drop trailing blank lines.
  while (rows.length > 0 && rows[rows.length - 1].every((cell) => cell.trim() === "")) {
    rows.pop();
  }
  return rows;
}

const CSV_COLUMNS = [
  "code",
  "full_name",
  "email",
  "phone",
  "address",
  "department",
  "designation",
  "join_date",
  "status",
  "basic_salary",
];

const REQUIRED_CSV_COLUMNS = ["code", "full_name", "email", "join_date", "status", "basic_salary"];

/** Header row -> `ImportRow[]`. Throws 400 for bad headers / too many rows. */
export function csvToImportRows(text: string): ImportRow[] {
  const table = parseCsv(text);
  if (table.length === 0) {
    throw new ApiFieldError(400, "CSV file is empty", { field: "file" });
  }
  const header = table[0].map((cell) => cell.trim().toLowerCase());
  const missing = REQUIRED_CSV_COLUMNS.filter((column) => !header.includes(column));
  if (missing.length > 0) {
    throw new ApiFieldError(400, `CSV is missing column: ${missing.join(", ")}`, {
      field: "file",
    });
  }

  const body = table.slice(1).filter((cells) => cells.some((cell) => cell.trim() !== ""));
  if (body.length > MAX_IMPORT_ROWS) {
    throw new ApiFieldError(400, `too_many_rows: maximum ${MAX_IMPORT_ROWS} rows per import`, {
      field: "file",
    });
  }

  return body.map((cells, index) => {
    const values: Record<string, string> = {};
    for (const column of CSV_COLUMNS) {
      const cellIndex = header.indexOf(column);
      values[column] = cellIndex >= 0 ? (cells[cellIndex] ?? "").trim() : "";
    }
    return { row: index + 2, values };
  });
}

function csvEscape(value: unknown): string {
  const text = value === null || value === undefined ? "" : String(value);
  if (/[",\r\n]/.test(text) || /^\s|\s$/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

export function exportCsv(): string {
  const rows = queryAll<EmployeeDbRow>(
    `SELECT ${EMPLOYEE_COLUMNS} ${EMPLOYEE_FROM} ORDER BY e.code COLLATE NOCASE`
  ).map((row) => {
    const employee = mapEmployee(row);
    return [
      employee.code,
      employee.fullName,
      employee.email,
      employee.phone ?? "",
      employee.address ?? "",
      employee.departmentName ?? "",
      employee.designationName ?? "",
      employee.joinDate ?? "",
      employee.status,
      employee.basicSalary.toFixed(2),
    ];
  });

  return [CSV_COLUMNS, ...rows]
    .map((cells) => cells.map(csvEscape).join(","))
    .join("\r\n")
    .concat("\r\n");
}

/**
 * Validate + (optionally) create imported employees. No logins are created for
 * CSV imports — the contract returns no temporary passwords for this path.
 */
export function importEmployees(
  rows: ImportRow[],
  actor: SessionUser,
  dryRun: boolean
): ImportResult {
  if (actor.role !== "hr" && actor.role !== "admin") {
    throw new ApiError(403, "forbidden");
  }

  const departments = new Map<string, number>();
  for (const row of queryAll<{ id: number; name: string }>(
    "SELECT id, name FROM departments"
  )) {
    departments.set(row.name.trim().toLowerCase(), Number(row.id));
  }

  const designations = queryAll<{ id: number; name: string; department_id: number | null }>(
    "SELECT id, name, department_id FROM designations"
  ).map((row) => ({
    id: Number(row.id),
    name: row.name.trim().toLowerCase(),
    departmentId: row.department_id === null ? null : Number(row.department_id),
  }));

  const existingCodes = new Set(
    queryAll<{ code: string }>("SELECT code FROM employees").map((row) =>
      row.code.trim().toLowerCase()
    )
  );
  const existingEmails = new Set(
    queryAll<{ email: string }>("SELECT email FROM employees").map((row) =>
      row.email.trim().toLowerCase()
    )
  );

  const fileCodes = new Set<string>();
  const fileEmails = new Set<string>();
  const errors: ImportError[] = [];
  const prepared: Array<{ row: ImportRow; input: EmployeeInput }> = [];

  for (const row of rows) {
    const values = row.values;
    const addError = (field: string, reason: string) =>
      errors.push({ row: row.row, field, reason });

    const code = (values.code ?? "").trim();
    const fullName = (values.full_name ?? "").trim();
    const email = (values.email ?? "").trim().toLowerCase();
    const joinDate = (values.join_date ?? "").trim();
    const status = (values.status ?? "").trim().toLowerCase();
    const salaryRaw = (values.basic_salary ?? "").trim();
    const departmentName = (values.department ?? "").trim();
    const designationName = (values.designation ?? "").trim();
    const phone = (values.phone ?? "").trim();
    const address = (values.address ?? "").trim();

    const before = errors.length;

    if (!code) addError("code", "Employee code is required");
    if (!fullName) addError("full_name", "Full name is required");
    if (!email) {
      addError("email", "Email is required");
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      addError("email", "Enter a valid email address");
    }
    if (!joinDate) {
      addError("join_date", "Join date is required");
    } else if (!isIsoDate(joinDate)) {
      addError("join_date", "Join date must be YYYY-MM-DD");
    }
    if (!status) {
      addError("status", "Status is required");
    } else if (!STATUSES.includes(status as EmployeeStatus)) {
      addError("status", "Status must be active, probation or exited");
    }
    const salary = Number(salaryRaw);
    if (!salaryRaw) {
      addError("basic_salary", "Basic salary is required");
    } else if (!Number.isFinite(salary) || salary <= 0) {
      addError("basic_salary", "Basic salary must be greater than 0");
    }

    let departmentId: number | null = null;
    if (departmentName) {
      const found = departments.get(departmentName.toLowerCase());
      if (found === undefined) addError("department", `Unknown department: ${departmentName}`);
      else departmentId = found;
    }

    let designationId: number | null = null;
    if (designationName) {
      const matches = designations.filter(
        (item) =>
          item.name === designationName.toLowerCase() &&
          (departmentId === null || item.departmentId === departmentId)
      );
      const fallback = matches.length
        ? matches
        : designations.filter((item) => item.name === designationName.toLowerCase());
      if (fallback.length === 0) {
        addError("designation", `Unknown designation: ${designationName}`);
      } else {
        designationId = fallback[0].id;
      }
    }

    if (code) {
      const key = code.toLowerCase();
      if (existingCodes.has(key)) addError("code", `Employee code already exists: ${code}`);
      else if (fileCodes.has(key)) addError("code", `Duplicate employee code in file: ${code}`);
      fileCodes.add(key);
    }
    if (email) {
      const key = email.toLowerCase();
      if (existingEmails.has(key)) addError("email", `Email already exists: ${email}`);
      else if (fileEmails.has(key)) addError("email", `Duplicate email in file: ${email}`);
      fileEmails.add(key);
    }

    if (errors.length === before) {
      prepared.push({
        row,
        input: {
          code,
          fullName,
          email,
          phone: phone || null,
          address: address || null,
          departmentId,
          designationId,
          joinDate,
          status: status as EmployeeStatus,
          basicSalary: round2(salary),
        },
      });
    }
  }

  // Duplicate-within-file rows are reported but still "valid" for insertion
  // count purposes only if they pass every other check — `prepared` excludes
  // any row that produced an error, including duplicates.
  if (dryRun) {
    return {
      dryRun: true,
      total: rows.length,
      valid: prepared.length,
      errors,
      created: [],
    };
  }

  const created: Employee[] = [];
  const db = getDb();
  db.exec("BEGIN IMMEDIATE;");
  try {
    for (const item of prepared) {
      db.exec("SAVEPOINT import_row;");
      try {
        const result = run(
          `INSERT INTO employees (code, full_name, email, phone, address, department_id,
            designation_id, join_date, status, exit_date, basic_salary, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)`,
          item.input.code,
          item.input.fullName,
          item.input.email,
          item.input.phone ?? null,
          item.input.address ?? null,
          item.input.departmentId ?? null,
          item.input.designationId ?? null,
          item.input.joinDate,
          item.input.status,
          item.input.basicSalary,
          nowIso()
        );
        created.push(mapEmployee(employeeRowById(Number(result.lastInsertRowid))));
        db.exec("RELEASE import_row;");
      } catch (err) {
        db.exec("ROLLBACK TO import_row;");
        db.exec("RELEASE import_row;");
        errors.push({
          row: item.row.row,
          field: "row",
          reason: err instanceof Error ? err.message : "Row could not be imported",
        });
      }
    }
    db.exec("COMMIT;");
  } catch (err) {
    db.exec("ROLLBACK;");
    throw err;
  }

  logAudit({
    actorId: actor.id,
    action: "import",
    entity: "employee",
    entityId: null,
    after: {
      total: rows.length,
      imported: created.length,
      failed: rows.length - created.length,
      ids: created.map((employee) => employee.id),
    },
  });

  return {
    dryRun: false,
    total: rows.length,
    valid: created.length,
    errors,
    created,
  };
}
