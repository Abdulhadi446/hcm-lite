import "server-only";
import { DatabaseSync, type SqlValue, type RunResult } from "node:sqlite";
import bcrypt from "bcryptjs";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export type Row = Record<string, null | string | number | bigint | Uint8Array>;

const HERE = path.dirname(fileURLToPath(import.meta.url));

function createDb(): DatabaseSync {
  const raw = process.env.DATABASE_URL || "./dev.db";
  const file = raw.replace(/^file:/, "").trim() || "./dev.db";
  const abs = path.isAbsolute(file)
    ? file
    : path.resolve(/*turbopackIgnore: true*/ process.cwd(), file);
  fs.mkdirSync(path.dirname(abs), { recursive: true });

  const db = new DatabaseSync(abs);
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA foreign_keys = ON;");

  const schema = fs.readFileSync(path.join(HERE, "schema.sql"), "utf8");
  db.exec(schema);
  ensureColumn(db, "announcements", "pinned", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn(db, "notifications", "type", "TEXT");
  ensureColumn(db, "notifications", "link", "TEXT");
  ensureColumn(db, "attendance", "verification_method", "TEXT");
  return db;
}

/** Idempotent additive migration for databases created before a column existed. */
function ensureColumn(db: DatabaseSync, table: string, column: string, definition: string): void {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  if (!columns.some((entry) => entry.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

const globalForDb = globalThis as unknown as { __hcmDb?: DatabaseSync };

/** Cached singleton (survives HMR). Applies lib/schema.sql idempotently. */
export function getDb(): DatabaseSync {
  if (!globalForDb.__hcmDb) {
    globalForDb.__hcmDb = createDb();
  }
  return globalForDb.__hcmDb;
}

export function queryAll<T = Row>(sql: string, ...params: SqlValue[]): T[] {
  return getDb().prepare(sql).all(...params) as T[];
}

export function queryOne<T = Row>(sql: string, ...params: SqlValue[]): T | undefined {
  return getDb().prepare(sql).get(...params) as T | undefined;
}

export function run(sql: string, ...params: SqlValue[]): RunResult {
  return getDb().prepare(sql).run(...params);
}

export function nowIso(): string {
  return new Date().toISOString();
}

/**
 * First-run env bypass: if ADMIN_EMAIL + ADMIN_PASSWORD are set and the app is
 * not yet initialized, create the company + admin automatically. Idempotent.
 */
export function ensureEnvAdmin(): void {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password) return;

  const db = getDb();
  const initialized = db.prepare("SELECT id FROM settings WHERE id = 1").get();
  if (initialized) return;

  const companyName = process.env.COMPANY_NAME || "HCM Lite";
  const passwordHash = bcrypt.hashSync(password, 10);
  const adminEmail = email.toLowerCase();

  db.exec("BEGIN IMMEDIATE;");
  try {
    db.prepare(
      "INSERT INTO settings (id, company_name, created_at) VALUES (1, ?, ?)"
    ).run(companyName, nowIso());
    const existing = db.prepare("SELECT id FROM users WHERE email = ?").get(adminEmail);
    if (!existing) {
      db.prepare(
        "INSERT INTO users (email, password_hash, name, role, must_change_password, active, created_at) VALUES (?, ?, ?, 'admin', 0, 1, ?)"
      ).run(adminEmail, passwordHash, process.env.ADMIN_NAME || "Admin", nowIso());
    }
    db.exec("COMMIT;");
  } catch (err) {
    db.exec("ROLLBACK;");
    throw err;
  }
}
