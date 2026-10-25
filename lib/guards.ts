import { getSessionUser, type Role, type SessionUser } from "./auth";
import { queryOne } from "./db";

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = "ApiError";
  }
}

export type RequireUserOptions = {
  /**
   * Auth endpoints that must stay usable while a temporary password is still
   * pending (me / change-password / logout) opt out of the forced change.
   */
  allowPasswordChangePending?: boolean;
};

/**
 * Throws ApiError(401) when there is no valid, active session, and
 * ApiError(403 password_change_required) while a password change is pending.
 */
export async function requireUser(options: RequireUserOptions = {}): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) throw new ApiError(401, "Unauthorized");
  if (!options.allowPasswordChangePending) mustChangePassword(user);
  return user;
}

/** Throws ApiError(401) for missing session, ApiError(403) for wrong role. */
export async function requireRole(...roles: Role[]): Promise<SessionUser> {
  const user = await requireUser();
  if (!roles.includes(user.role)) {
    throw new ApiError(403, "Forbidden");
  }
  return user;
}

/**
 * Data scope helper per contract: an employee is scoped to their own id,
 * all other roles get null (meaning "all rows allowed").
 */
export function scopeEmployeeId(user: SessionUser): number | null {
  return user.role === "employee" ? user.employeeId : null;
}

/**
 * When must_change_password is set, block access with 403
 * password_change_required. Enforced by `requireUser`; the auth endpoints can
 * opt out via `requireUser({ allowPasswordChangePending: true })`.
 */
export function mustChangePassword(user: SessionUser): void {
  if (user.mustChangePassword) {
    throw new ApiError(403, "password_change_required");
  }
}

/** Map a thrown error to a JSON response. ApiError -> its status/message. */
export function apiError(err: unknown): Response {
  if (err instanceof ApiError) {
    return Response.json({ error: err.message }, { status: err.status });
  }
  console.error("[api] unhandled error:", err);
  return Response.json({ error: "Internal server error" }, { status: 500 });
}

/** Convenience for the currently initialized company name. */
export function getCompanyName(): string {
  return (
    queryOne<{ company_name: string }>("SELECT company_name FROM settings WHERE id = 1")
      ?.company_name ?? ""
  );
}
