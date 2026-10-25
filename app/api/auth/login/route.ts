import { NextResponse } from "next/server";
import { queryOne } from "@/lib/db";
import { verifyPassword, signSession, setSessionCookie, type Role } from "@/lib/auth";
import { loginSchema, parseBody } from "@/lib/validation";
import { apiError } from "@/lib/guards";
import { logAudit } from "@/lib/services/audit";

function toSessionUser(row: Record<string, unknown>, companyName: string) {
  return {
    id: row.id as number,
    name: row.name as string,
    email: row.email as string,
    role: row.role as Role,
    employeeId: row.employee_id === null ? null : Number(row.employee_id),
    mustChangePassword: Number(row.must_change_password) === 1,
    companyName,
  };
}

export async function POST(request: Request) {
  try {
    const parsed = await parseBody(request, loginSchema);
    if (!parsed.ok) return parsed.response;

    const { email, password } = parsed.data;
    const row = queryOne<Record<string, unknown>>(
      "SELECT * FROM users WHERE email = ?",
      email
    );

    // Same error for unknown email and wrong password.
    if (!row) {
      return Response.json({ error: "invalid_credentials" }, { status: 401 });
    }

    if (!verifyPassword(password, row.password_hash as string)) {
      return Response.json({ error: "invalid_credentials" }, { status: 401 });
    }

    if (!row.active) {
      return Response.json({ error: "account_inactive" }, { status: 403 });
    }

    const sessionUser = toSessionUser(
      row,
      queryOne<{ company_name: string }>("SELECT company_name FROM settings WHERE id = 1")?.company_name ?? ""
    );

    const token = await signSession(sessionUser);
    logAudit({
      actorId: sessionUser.id,
      action: "login",
      entity: "user",
      entityId: sessionUser.id,
      after: { email: sessionUser.email, role: sessionUser.role },
    });
    const res = NextResponse.json({ user: sessionUser });
    setSessionCookie(res, token);
    return res;
  } catch (err) {
    return apiError(err);
  }
}
