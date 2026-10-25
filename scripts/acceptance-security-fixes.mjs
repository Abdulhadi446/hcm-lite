#!/usr/bin/env node
/**
 * Security-fix acceptance probe (dependency-free: Node built-ins only).
 *
 * Proves:
 *  1. A JWT signed with the old public fallback ("hcm-lite-dev-secret") is 401.
 *  2. A real session still works after the server is restarted against the
 *     same SQLite database (the generated secret is persisted).
 *  3. A huge `page` on /api/employees and /api/audit-logs returns 400, not 500.
 *  4. A pending-password user is 403 on normal APIs but can read /api/auth/me
 *     and change the password, after which normal APIs work again.
 *  5. Successful logins leave a `login` row in the audit log.
 *
 * Two modes:
 *  - Attach to a running server:
 *      BASE_URL=http://127.0.0.1:3034 DATABASE_URL=file:./.tmp/sec2.db \
 *        node scripts/acceptance-security-fixes.mjs
 *    The restart check boots a second `next start` process (RESTART_PORT,
 *    default BASE port + 1) against the same database and validates the cookie.
 *  - Self-managed (no BASE_URL): deletes the DB, starts/stops its own server
 *    with `next start` on PORT (default 3034), including a real restart.
 *
 * Requirements: a production build already exists in the current directory.
 */
import { spawn } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const PORT = Number(process.env.PORT || 3034);
const EXTERNAL = Boolean(process.env.BASE_URL);
const BASE = (process.env.BASE_URL || `http://127.0.0.1:${PORT}`).replace(/\/$/, "");
const RESTART_PORT = Number(process.env.RESTART_PORT || PORT + 1);
const DB_URL = process.env.DATABASE_URL || "file:./.tmp/lane-sec4.db";
const DB_PATH = path.resolve(process.cwd(), DB_URL.replace(/^file:/, ""));

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "admin@accept.test";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "AdminPass!23";
const NEW_PASSWORD = "ChangedPass!23";
const RUN = Date.now().toString(36);
const HR_EMAIL = `hr.${RUN}@accept.test`;
const EMP_EMAIL = `pending.${RUN}@accept.test`;
const EMP_CODE = `EMP-${RUN.toUpperCase()}`;

const checks = [];
const serverLog = [];
const children = new Set();

function check(name, ok, detail = "") {
  checks.push({ name, ok: Boolean(ok) });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  [${detail}]` : ""}`);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// --------------------------------------------------------------- HTTP helpers

async function request(method, pathname, { cookie, body, base = BASE } = {}) {
  const headers = {};
  if (cookie) headers.cookie = cookie;
  let payload;
  if (body !== undefined) {
    headers["content-type"] = "application/json";
    payload = JSON.stringify(body);
  }
  const res = await fetch(base + pathname, {
    method,
    headers,
    body: payload,
    redirect: "manual",
    signal: AbortSignal.timeout(20000),
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* non-JSON */
  }
  const setCookies =
    typeof res.headers.getSetCookie === "function" ? res.headers.getSetCookie() : [];
  return { status: res.status, text, json, setCookies };
}

function sessionCookie(res) {
  for (const raw of res.setCookies || []) {
    const match = /(?:^|;\s*)hcm_session=([^;]+)/.exec(raw);
    if (match) return `hcm_session=${match[1]}`;
  }
  return null;
}

// ------------------------------------------------------------------- JWT sign

function b64url(input) {
  return Buffer.from(input).toString("base64url");
}

function signJwt(payload, secret) {
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = b64url(JSON.stringify(payload));
  const signature = crypto
    .createHmac("sha256", secret)
    .update(`${header}.${body}`)
    .digest("base64url");
  return `${header}.${body}.${signature}`;
}

// -------------------------------------------------------------- server control

function startServer(port) {
  const nextBin = path.resolve(process.cwd(), "node_modules/next/dist/bin/next");
  const child = spawn(process.execPath, [nextBin, "start", "-p", String(port)], {
    cwd: process.cwd(),
    env: { ...process.env, DATABASE_URL: DB_URL, NODE_ENV: "production" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  children.add(child);
  child.stdout.on("data", (data) => serverLog.push(String(data)));
  child.stderr.on("data", (data) => serverLog.push(String(data)));
  child.once("exit", () => children.delete(child));
  return child;
}

async function stopServer(child) {
  if (!child || child.exitCode !== null) return;
  await new Promise((resolve) => {
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      resolve();
    }, 5000);
    child.once("exit", () => {
      clearTimeout(timer);
      resolve();
    });
    child.kill("SIGTERM");
  });
}

async function waitReady(base, timeoutMs = 60000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const res = await fetch(`${base}/api/setup/status`, {
        signal: AbortSignal.timeout(2000),
      });
      if (res.ok) return;
    } catch {
      /* not up yet */
    }
    await sleep(250);
  }
  throw new Error(
    `server on ${base} did not become ready. Tail:\n${serverLog.slice(-25).join("")}`
  );
}

function resetDatabase() {
  for (const suffix of ["", "-wal", "-shm"]) {
    try {
      fs.rmSync(DB_PATH + suffix, { force: true });
    } catch {
      /* ignore */
    }
  }
}

// --------------------------------------------------------------------- checks

async function main() {
  let primary = null;
  let restart = null;

  try {
    if (!EXTERNAL) {
      resetDatabase();
      primary = startServer(PORT);
      await waitReady(BASE);
    }

    // Fresh install (or reuse an existing one in external mode).
    const status = await request("GET", "/api/setup/status");
    let adminCookie = null;
    if (status.json?.initialized === false) {
      const setup = await request("POST", "/api/setup", {
        body: {
          companyName: "Acceptance Security",
          adminName: "Accept Admin",
          adminEmail: ADMIN_EMAIL,
          adminPassword: ADMIN_PASSWORD,
          officeStart: "09:00",
        },
      });
      check("setup creates the first admin", setup.status === 201, `status=${setup.status}`);
    }

    const adminLogin = await request("POST", "/api/auth/login", {
      body: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
    });
    adminCookie = sessionCookie(adminLogin);
    check(
      "real admin login succeeds",
      adminLogin.status === 200 && Boolean(adminCookie),
      `status=${adminLogin.status}`
    );
    if (!adminCookie) throw new Error("cannot continue without an admin session");

    // 1. The old hardcoded secret must no longer be accepted.
    const now = Math.floor(Date.now() / 1000);
    const forged = signJwt(
      {
        sub: "1",
        name: "Forged Admin",
        email: ADMIN_EMAIL,
        role: "admin",
        employeeId: null,
        iat: now,
        exp: now + 3600,
      },
      "hcm-lite-dev-secret"
    );
    const forgedMe = await request("GET", "/api/auth/me", {
      cookie: `hcm_session=${forged}`,
    });
    check(
      'forged token signed with "hcm-lite-dev-secret" is rejected by /api/auth/me',
      forgedMe.status === 401,
      `status=${forgedMe.status}`
    );
    const forgedUsers = await request("GET", "/api/users", {
      cookie: `hcm_session=${forged}`,
    });
    check(
      'forged token signed with "hcm-lite-dev-secret" is rejected by /api/users',
      forgedUsers.status === 401,
      `status=${forgedUsers.status}`
    );

    // 2. Absurd pagination must be a 400, never a SQLite 500.
    const hugePage = "999999999999999999999";
    const employeesHuge = await request("GET", `/api/employees?page=${hugePage}`, {
      cookie: adminCookie,
    });
    check(
      "GET /api/employees?page=<huge> returns 400 (not 500)",
      employeesHuge.status === 400 && Boolean(employeesHuge.json?.fields?.page),
      `status=${employeesHuge.status} body=${employeesHuge.text.slice(0, 120)}`
    );
    const auditHuge = await request("GET", `/api/audit-logs?page=${hugePage}`, {
      cookie: adminCookie,
    });
    check(
      "GET /api/audit-logs?page=<huge> returns 400 (not 500)",
      auditHuge.status === 400 && Boolean(auditHuge.json?.fields?.page),
      `status=${auditHuge.status} body=${auditHuge.text.slice(0, 120)}`
    );

    // Merely large values are clamped, not rejected.
    const clamped = await request("GET", "/api/employees?page=100000&pageSize=100000", {
      cookie: adminCookie,
    });
    check(
      "large page/pageSize values are clamped to safe bounds",
      clamped.status === 200 && clamped.json?.page === 10000 && clamped.json?.pageSize === 100,
      `status=${clamped.status} page=${clamped.json?.page} pageSize=${clamped.json?.pageSize}`
    );
    const auditClamped = await request("GET", "/api/audit-logs?pageSize=100000", {
      cookie: adminCookie,
    });
    check(
      "large audit pageSize is clamped to 100",
      auditClamped.status === 200 && auditClamped.json?.pageSize === 100,
      `status=${auditClamped.status} pageSize=${auditClamped.json?.pageSize}`
    );

    // 3. Pending-password enforcement.
    const hrCreate = await request("POST", "/api/users", {
      cookie: adminCookie,
      body: { name: "Accept HR", email: HR_EMAIL, role: "hr", password: "HrPass!23x" },
    });
    check("admin creates an HR login", hrCreate.status === 201, `status=${hrCreate.status}`);

    const hrLogin = await request("POST", "/api/auth/login", {
      body: { email: HR_EMAIL, password: "HrPass!23x" },
    });
    const hrCookie = sessionCookie(hrLogin);
    check(
      "HR login succeeds",
      hrLogin.status === 200 && Boolean(hrCookie),
      `status=${hrLogin.status}`
    );

    const employeeCreate = await request("POST", "/api/employees", {
      cookie: hrCookie,
      body: {
        code: EMP_CODE,
        fullName: "Pending Password",
        email: EMP_EMAIL,
        joinDate: "2026-01-05",
        status: "active",
        basicSalary: 50000,
      },
    });
    const tempPassword = employeeCreate.json?.temporaryPassword;
    check(
      "HR creates an employee with a temporary password",
      employeeCreate.status === 201 && typeof tempPassword === "string" && tempPassword.length >= 8,
      `status=${employeeCreate.status}`
    );

    const empLogin = await request("POST", "/api/auth/login", {
      body: { email: EMP_EMAIL, password: tempPassword },
    });
    let empCookie = sessionCookie(empLogin);
    check(
      "employee logs in with the temporary password",
      empLogin.status === 200 && Boolean(empCookie),
      `status=${empLogin.status}`
    );

    const pendingApi = await request("GET", "/api/attendance/me", { cookie: empCookie });
    check(
      "pending-password user is 403 password_change_required on /api/attendance/me",
      pendingApi.status === 403 && pendingApi.json?.error === "password_change_required",
      `status=${pendingApi.status} body=${pendingApi.text.slice(0, 120)}`
    );

    const pendingMe = await request("GET", "/api/auth/me", { cookie: empCookie });
    check(
      "pending-password user can still GET /api/auth/me",
      pendingMe.status === 200 && pendingMe.json?.user?.mustChangePassword === true,
      `status=${pendingMe.status} mustChangePassword=${pendingMe.json?.user?.mustChangePassword}`
    );

    const change = await request("POST", "/api/auth/change-password", {
      cookie: empCookie,
      body: { currentPassword: tempPassword, newPassword: NEW_PASSWORD },
    });
    empCookie = sessionCookie(change) || empCookie;
    check(
      "pending-password user can change the password",
      change.status === 200,
      `status=${change.status} body=${change.text.slice(0, 120)}`
    );

    const afterChange = await request("GET", "/api/attendance/me", { cookie: empCookie });
    check(
      "after the password change /api/attendance/me returns 200",
      afterChange.status === 200,
      `status=${afterChange.status}`
    );

    // 4. Successful login is audited.
    const auditLogs = await request(
      "GET",
      "/api/audit-logs?entity=user&pageSize=100",
      { cookie: adminCookie }
    );
    const loginRows = (auditLogs.json?.items || []).filter(
      (row) => row.action === "login" && row.entity === "user"
    );
    check(
      "successful login writes a login row to the audit log",
      auditLogs.status === 200 && loginRows.length > 0,
      `status=${auditLogs.status} loginRows=${loginRows.length}`
    );

    // 5. Restart persistence: a brand-new server process must accept the
    //    existing session because the generated secret lives in SQLite.
    if (EXTERNAL) {
      restart = startServer(RESTART_PORT);
      const restartBase = `http://127.0.0.1:${RESTART_PORT}`;
      await waitReady(restartBase);
      const meAfterRestart = await request("GET", "/api/auth/me", {
        cookie: adminCookie,
        base: restartBase,
      });
      check(
        "real session survives a server restart with the same database",
        meAfterRestart.status === 200,
        `restartStatus=${meAfterRestart.status}`
      );
      await stopServer(restart);
      restart = null;
    } else {
      await stopServer(primary);
      primary = null;
      primary = startServer(PORT);
      await waitReady(BASE);
      const meAfterRestart = await request("GET", "/api/auth/me", { cookie: adminCookie });
      check(
        "real session survives a full server restart with the same database",
        meAfterRestart.status === 200,
        `restartStatus=${meAfterRestart.status}`
      );
    }
  } catch (err) {
    check("acceptance run completed without an unexpected error", false, String(err));
    if (serverLog.length) {
      console.error("\n--- server log tail ---\n" + serverLog.slice(-40).join(""));
    }
  } finally {
    for (const child of [...children]) {
      await stopServer(child);
    }
  }

  const passed = checks.filter((entry) => entry.ok).length;
  console.log(`\n${passed}/${checks.length} checks passed`);
  if (passed !== checks.length) {
    console.log("FAILED:");
    for (const entry of checks.filter((item) => !item.ok)) console.log(`  - ${entry.name}`);
  }
  process.exit(passed === checks.length ? 0 : 1);
}

void main();
