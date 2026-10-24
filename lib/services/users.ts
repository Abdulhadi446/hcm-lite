import "server-only";
import { randomBytes } from "node:crypto";
import { hashPassword } from "@/lib/auth";
import { nowIso, queryAll, queryOne, run } from "@/lib/db";
import { ApiError } from "@/lib/guards";
import { logAudit } from "./audit";
import { duplicateError, notFound } from "./http";

export type UserRole = "admin" | "hr" | "employee";

export type UserRow = {
  id: number;
  name: string;
  email: string;
  role: UserRole;
  employeeId: number | null;
  active: boolean;
  mustChangePassword: boolean;
  createdAt: string;
};

type UserDbRow = {
  id: number;
  name: string;
  email: string;
  role: UserRole;
  employee_id: number | null;
  active: number;
  must_change_password: number;
  created_at: string;
};

const PASSWORD_ALPHABET =
  "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";

/** 12-char temporary password (no ambiguous 0/O/1/l/I). */
export function generateTempPassword(length = 12): string {
  const bytes = randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i += 1) {
    out += PASSWORD_ALPHABET[bytes[i] % PASSWORD_ALPHABET.length];
  }
  return out;
}

function mapUser(row: UserDbRow): UserRow {
  return {
    id: Number(row.id),
    name: row.name,
    email: row.email,
    role: row.role,
    employeeId: row.employee_id === null ? null : Number(row.employee_id),
    active: Number(row.active) === 1,
    mustChangePassword: Number(row.must_change_password) === 1,
    createdAt: row.created_at,
  };
}

const USER_COLUMNS =
  "id, name, email, role, employee_id, active, must_change_password, created_at";

export function listUsers(filter: { role?: string } = {}): UserRow[] {
  const rows = filter.role
    ? queryAll<UserDbRow>(
        `SELECT ${USER_COLUMNS} FROM users WHERE role = ? ORDER BY created_at DESC, id DESC`,
        filter.role
      )
    : queryAll<UserDbRow>(
        `SELECT ${USER_COLUMNS} FROM users ORDER BY created_at DESC, id DESC`
      );
  return rows.map(mapUser);
}

export function getUser(id: number): UserRow {
  const row = queryOne<UserDbRow>(`SELECT ${USER_COLUMNS} FROM users WHERE id = ?`, id);
  if (!row) throw notFound();
  return mapUser(row);
}

function assertEmailFree(email: string): void {
  const clash = queryOne<{ id: number }>("SELECT id FROM users WHERE lower(email) = lower(?)", email);
  if (clash) throw duplicateError("email");
}

export function createUser(
  input: { name: string; email: string; role: "admin" | "hr"; password?: string },
  actorId: number
): { user: UserRow; temporaryPassword: string } {
  const email = input.email.trim().toLowerCase();
  assertEmailFree(email);

  const generated = !input.password;
  const temporaryPassword = input.password ?? generateTempPassword();

  const result = run(
    "INSERT INTO users (email, password_hash, name, role, employee_id, must_change_password, active, created_at) VALUES (?, ?, ?, ?, NULL, ?, 1, ?)",
    email,
    hashPassword(temporaryPassword),
    input.name.trim(),
    input.role,
    generated ? 1 : 0,
    nowIso()
  );
  const user = getUser(Number(result.lastInsertRowid));
  logAudit({
    actorId,
    action: "create",
    entity: "user",
    entityId: user.id,
    after: { ...user, passwordGenerated: generated },
  });
  return { user, temporaryPassword };
}

export function updateUser(id: number, patch: { active?: boolean }, actorId: number): UserRow {
  const before = getUser(id);
  if (patch.active === undefined) return before;

  if (!patch.active && id === actorId) {
    throw new ApiError(400, "cannot_deactivate_self");
  }

  run("UPDATE users SET active = ? WHERE id = ?", patch.active ? 1 : 0, id);
  const after = getUser(id);
  logAudit({
    actorId,
    action: patch.active ? "update" : "deactivate",
    entity: "user",
    entityId: id,
    before,
    after,
  });
  return after;
}

export function resetUserPassword(
  id: number,
  actorId: number
): { temporaryPassword: string } {
  const before = getUser(id);
  const temporaryPassword = generateTempPassword();
  run(
    "UPDATE users SET password_hash = ?, must_change_password = 1 WHERE id = ?",
    hashPassword(temporaryPassword),
    id
  );
  logAudit({
    actorId,
    action: "reset_password",
    entity: "user",
    entityId: id,
    before,
    after: { ...before, mustChangePassword: true },
  });
  return { temporaryPassword };
}
