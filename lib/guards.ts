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

/** Throws ApiError(401) when there is no valid, active session. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) throw new ApiError(401, "Unauthorized");
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
 * Guard for future routes: when must_change_password is set, block access with
 * 403 password_change_required. Do NOT apply this to /api/auth/me, /logout or
 * /change-password themselves.
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
