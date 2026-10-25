import "server-only";
import type { Role } from "@/lib/auth";
import { nowIso, queryAll, queryOne, run } from "@/lib/db";
import { normalizePage, normalizePageSize } from "./http";

export type AuditAction =
  | "create"
  | "update"
  | "delete"
  | "deactivate"
  | "reset_password"
  | "login"
  | "import";

export type AuditEntity =
  | "settings"
  | "department"
  | "designation"
  | "leave_type"
  | "holiday"
  | "user"
  | "employee";

const MAX_STRING = 400;
const MAX_JSON = 4000;
const SENSITIVE_KEYS = new Set([
  "password",
  "password_hash",
  "passwordHash",
  "temporaryPassword",
  "currentPassword",
  "newPassword",
]);

/** JSON snapshot with secrets dropped and long strings/values truncated. */
export function auditSnapshot(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  try {
    const seen = new WeakSet<object>();
    const json = JSON.stringify(value, (key, raw) => {
      if (SENSITIVE_KEYS.has(key)) return "[redacted]";
      if (typeof raw === "string" && raw.length > MAX_STRING) {
        return `${raw.slice(0, MAX_STRING)}…[truncated ${raw.length}]`;
      }
      if (typeof raw === "bigint") return String(raw);
      if (typeof raw === "object" && raw !== null) {
        if (seen.has(raw)) return "[circular]";
        seen.add(raw);
      }
      return raw;
    });
    if (!json) return null;
    return json.length > MAX_JSON ? `${json.slice(0, MAX_JSON)}…[truncated]` : json;
  } catch {
    return null;
  }
}

/**
 * Write an audit row. Never throws: a broken audit write must not roll back a
 * successful business mutation.
 */
export function logAudit(input: {
  actorId: number | null;
  action: AuditAction | string;
  entity: AuditEntity | string;
  entityId?: number | string | null;
  before?: unknown;
  after?: unknown;
}): void {
  try {
    if (input.actorId === null || input.actorId === undefined) return;
    const entityId =
      input.entityId === null || input.entityId === undefined
        ? null
        : Number(input.entityId);
    run(
      "INSERT INTO audit_logs (actor_user_id, action, entity, entity_id, before_json, after_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      input.actorId,
      input.action,
      input.entity,
      entityId === null || Number.isNaN(entityId) ? null : entityId,
      auditSnapshot(input.before),
      auditSnapshot(input.after),
      nowIso()
    );
  } catch (err) {
    console.error("[audit] failed to write audit row:", err);
  }
}

// --------------------------------------------------------------- reading

export type AuditRow = {
  id: number;
  actorName: string;
  actorRole: Role;
  action: string;
  entity: string;
  entityId: number | null;
  beforeJson: string | null;
  afterJson: string | null;
  ip: string | null;
  createdAt: string;
};

export type AuditFilters = {
  entity?: string;
  actor?: string;
  actorId?: number;
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
};

type AuditDbRow = {
  id: number;
  actor_name: string | null;
  actor_role: Role | null;
  action: string;
  entity: string;
  entity_id: number | null;
  before_json: string | null;
  after_json: string | null;
  created_at: string;
};

const DEFAULT_PAGE_SIZE = 20;

/**
 * Filtered, paginated audit feed for the Admin viewer. `actor` is a
 * case-insensitive search over the actor's name and email.
 */
export function listAuditLogs(filters: AuditFilters = {}): {
  items: AuditRow[];
  total: number;
  page: number;
  pageSize: number;
  entities: string[];
} {
  const page = normalizePage(filters.page ?? 1);
  const pageSize = normalizePageSize(filters.pageSize ?? DEFAULT_PAGE_SIZE);

  const where: string[] = [];
  const params: (string | number)[] = [];

  if (filters.entity) {
    where.push("a.entity = ?");
    params.push(filters.entity);
  }
  if (filters.actorId) {
    where.push("a.actor_user_id = ?");
    params.push(filters.actorId);
  }
  if (filters.actor) {
    const like = `%${filters.actor.trim().toLowerCase()}%`;
    where.push("(lower(u.name) LIKE ? OR lower(u.email) LIKE ?)");
    params.push(like, like);
  }
  if (filters.from) {
    where.push("a.created_at >= ?");
    params.push(`${filters.from}T00:00:00.000Z`);
  }
  if (filters.to) {
    where.push("a.created_at <= ?");
    params.push(`${filters.to}T23:59:59.999Z`);
  }

  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const fromSql = "FROM audit_logs a LEFT JOIN users u ON u.id = a.actor_user_id";

  const total = Number(
    queryOne<{ c: number }>(`SELECT COUNT(*) AS c ${fromSql} ${whereSql}`, ...params)?.c ?? 0
  );

  const rows = queryAll<AuditDbRow>(
    `SELECT a.id, u.name AS actor_name, u.role AS actor_role, a.action, a.entity,
            a.entity_id, a.before_json, a.after_json, a.created_at
       ${fromSql} ${whereSql}
      ORDER BY a.created_at DESC, a.id DESC
      LIMIT ? OFFSET ?`,
    ...params,
    pageSize,
    (page - 1) * pageSize
  );

  const entities = queryAll<{ entity: string }>(
    "SELECT DISTINCT entity FROM audit_logs ORDER BY entity COLLATE NOCASE"
  ).map((row) => row.entity);

  return {
    items: rows.map((row) => ({
      id: Number(row.id),
      actorName: row.actor_name ?? "Deleted user",
      actorRole: row.actor_role ?? "employee",
      action: row.action,
      entity: row.entity,
      entityId: row.entity_id === null ? null : Number(row.entity_id),
      beforeJson: row.before_json,
      afterJson: row.after_json,
      ip: null,
      createdAt: row.created_at,
    })),
    total,
    page,
    pageSize,
    entities,
  };
}
