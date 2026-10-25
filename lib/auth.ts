import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { queryOne, run } from "./db";

export type Role = "admin" | "hr" | "employee";

export type SessionUser = {
  id: number;
  name: string;
  email: string;
  role: Role;
  employeeId: number | null;
  mustChangePassword: boolean;
  companyName: string;
};

export const SESSION_COOKIE = "hcm_session";
export const SESSION_MAX_AGE = 7 * 24 * 60 * 60; // 7 days in seconds

const SECRET_NAME = "jwt_signing_key";
const MIN_ENV_SECRET_LENGTH = 32;
let cachedSecret: Uint8Array | null = null;
let warnedAboutGeneratedSecret = false;

/**
 * Resolve the JWT signing secret.
 *
 * - Use AUTH_SECRET when it is set and at least 32 characters long.
 * - Otherwise generate a random 32-byte secret once per installation, persist
 *   it in SQLite (`app_secrets`) and reuse it across restarts.
 *
 * There is deliberately no hardcoded fallback: a secret shipped in source could
 * be used by anyone to forge an admin session.
 */
export function authSecret(): Uint8Array {
  if (cachedSecret) return cachedSecret;

  const envSecret = process.env.AUTH_SECRET;
  if (envSecret && envSecret.length >= MIN_ENV_SECRET_LENGTH) {
    cachedSecret = new TextEncoder().encode(envSecret);
    return cachedSecret;
  }

  cachedSecret = new TextEncoder().encode(readOrCreateGeneratedSecret());
  if (!warnedAboutGeneratedSecret) {
    warnedAboutGeneratedSecret = true;
    console.warn(
      "[auth] AUTH_SECRET is unset or shorter than 32 characters; using a generated secret stored in the database. Set AUTH_SECRET in production."
    );
  }
  return cachedSecret;
}

function readOrCreateGeneratedSecret(): string {
  run(
    "CREATE TABLE IF NOT EXISTS app_secrets (name TEXT PRIMARY KEY, value TEXT NOT NULL, created_at TEXT NOT NULL)"
  );

  const existing = queryOne<{ value: string }>(
    "SELECT value FROM app_secrets WHERE name = ?",
    SECRET_NAME
  );
  if (existing?.value) return existing.value;

  const generated = randomBytes(32).toString("hex");
  run(
    "INSERT OR IGNORE INTO app_secrets (name, value, created_at) VALUES (?, ?, ?)",
    SECRET_NAME,
    generated,
    new Date().toISOString()
  );

  // A concurrent first boot may have inserted its own secret between the read
  // and the insert; always return the row that actually won.
  return (
    queryOne<{ value: string }>("SELECT value FROM app_secrets WHERE name = ?", SECRET_NAME)
      ?.value ?? generated
  );
}

// ---------- Passwords ----------
export function hashPassword(plain: string): string {
  return bcrypt.hashSync(plain, 10);
}

export function verifyPassword(plain: string, hash: string): boolean {
  return bcrypt.compareSync(plain, hash);
}

// ---------- JWT ----------
export async function signSession(user: {
  id: number;
  name: string;
  email: string;
  role: Role;
  employeeId: number | null;
}): Promise<string> {
  return new SignJWT({
    sub: String(user.id),
    name: user.name,
    email: user.email,
    role: user.role,
    employeeId: user.employeeId,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(authSecret());
}

export async function verifySession(token: string): Promise<{
  id: number;
  name: string;
  email: string;
  role: Role;
  employeeId: number | null;
} | null> {
  try {
    const { payload } = await jwtVerify(token, authSecret());
    const id = Number(payload.sub);
    if (!Number.isFinite(id)) return null;
    return {
      id,
      name: String(payload.name ?? ""),
      email: String(payload.email ?? ""),
      role: (payload.role as Role) ?? "employee",
      employeeId:
        payload.employeeId === null || payload.employeeId === undefined
          ? null
          : Number(payload.employeeId),
    };
  } catch {
    return null;
  }
}

/**
 * Read the session from cookies, verify the JWT, and re-check the user row is
 * still active (users who are deleted/deactivated lose access immediately).
 */
export async function getSessionUser(): Promise<SessionUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const claims = await verifySession(token);
  if (!claims) return null;

  const row = queryOne(
    "SELECT id, name, email, role, employee_id, must_change_password, active, password_hash FROM users WHERE id = ?",
    claims.id
  );
  if (!row || !row.active) return null;

  const companyName = queryOne<{ company_name: string }>("SELECT company_name FROM settings WHERE id = 1")?.company_name ?? "";

  return {
    id: row.id as number,
    name: (row.name as string) ?? "",
    email: (row.email as string) ?? "",
    role: (row.role as Role) ?? "employee",
    employeeId: row.employee_id === null ? null : Number(row.employee_id),
    mustChangePassword: Number(row.must_change_password) === 1,
    companyName,
  };
}

// ---------- Response cookie helpers ----------
export function setSessionCookie(res: NextResponse, token: string): void {
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE,
    secure: process.env.NODE_ENV === "production",
  });
}

export function clearSessionCookie(res: NextResponse): void {
  res.cookies.set(SESSION_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
    secure: process.env.NODE_ENV === "production",
  });
}
