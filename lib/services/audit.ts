import "server-only";
import { nowIso, run } from "@/lib/db";

export type AuditAction =
  | "create"
  | "update"
  | "delete"
  | "deactivate"
  | "reset_password"
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
