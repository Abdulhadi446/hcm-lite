import { ensureEnvAdmin, getDb, nowIso } from "@/lib/db";
import { hashPassword } from "@/lib/auth";
import { setupSchema, parseBody } from "@/lib/validation";
import { apiError } from "@/lib/guards";

export async function POST(request: Request) {
  try {
    const parsed = await parseBody(request, setupSchema);
    if (!parsed.ok) return parsed.response;

    // Idempotent env-bypass: if ADMIN_EMAIL/ADMIN_PASSWORD are set and this
    // request wins the init, the env admin is already created by the time we
    // check; otherwise the posted admin is created below.
    ensureEnvAdmin();

    const { companyName, adminName, adminEmail, adminPassword } = parsed.data;
    const db = getDb();

    const existing = db
      .prepare("SELECT id FROM settings WHERE id = 1")
      .get();
    if (existing) {
      return Response.json({ error: "already_initialized" }, { status: 409 });
    }

    db.exec("BEGIN IMMEDIATE;");
    try {
      db.prepare(
        "INSERT INTO settings (id, company_name, created_at) VALUES (1, ?, ?)"
      ).run(companyName, nowIso());

      db.prepare(
        "INSERT INTO users (email, password_hash, name, role, must_change_password, active, created_at) VALUES (?, ?, ?, 'admin', 0, 1, ?)"
      ).run(adminEmail, hashPassword(adminPassword), adminName, nowIso());

      db.exec("COMMIT;");
    } catch (err) {
      db.exec("ROLLBACK;");
      throw err;
    }

    return Response.json({ ok: true }, { status: 201 });
  } catch (err) {
    return apiError(err);
  }
}
