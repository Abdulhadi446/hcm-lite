import { NextResponse } from "next/server";
import { signSession, setSessionCookie, verifyPassword, hashPassword, type Role } from "@/lib/auth";
import { run, queryOne } from "@/lib/db";
import { requireUser, apiError } from "@/lib/guards";
import { changePasswordSchema, parseBody } from "@/lib/validation";

export async function POST(request: Request) {
  try {
    const parsed = await parseBody(request, changePasswordSchema);
    if (!parsed.ok) return parsed.response;

    // The forced-change endpoint itself must stay reachable while pending.
    const user = await requireUser({ allowPasswordChangePending: true });
    const { currentPassword, newPassword } = parsed.data;

    const row = queryOne<{ password_hash: string }>(
      "SELECT password_hash FROM users WHERE id = ?",
      user.id
    );
    if (!row || !verifyPassword(currentPassword, row.password_hash)) {
      return Response.json({ error: "invalid_credentials" }, { status: 401 });
    }

    run(
      "UPDATE users SET password_hash = ?, must_change_password = 0 WHERE id = ?",
      hashPassword(newPassword),
      user.id
    );

    // Re-issue the session cookie so existing tokens remain part of the flow
    // (identity claims don't change, but this keeps the cookie fresh).
    const token = await signSession({ ...user, role: user.role as Role });
    const res = NextResponse.json({ ok: true });
    setSessionCookie(res, token);
    return res;
  } catch (err) {
    return apiError(err);
  }
}
