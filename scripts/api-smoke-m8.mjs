#!/usr/bin/env node
/**
 * M8 API smoke test — announcements, notifications and the audit viewer.
 *
 *   npx next build
 *   node scripts/api-smoke-m8.mjs
 *
 * Starts its own production server on port 3005 against a fresh
 * `./.tmp/m8.db` (override with PORT / SMOKE_DB), then tears it down.
 * No dependencies. Exits non-zero when any step fails.
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const PORT = Number(process.env.PORT || 3005);
const BASE = process.env.BASE_URL || `http://localhost:${PORT}`;
const DB_FILE = path.resolve(process.cwd(), process.env.SMOKE_DB || "./.tmp/m8.db");
const REUSE_SERVER = process.env.SMOKE_REUSE_SERVER === "1";
const LOG_DIR = path.resolve(process.cwd(), ".agent-logs");
const STAMP = new Date().toISOString().replace(/[:.]/g, "-");
const SERVER_LOG = path.join(LOG_DIR, `m8-smoke-server-${STAMP}.log`);

const ADMIN = { name: "Smoke Admin", email: "admin@hcm.local", password: "admin12345" };
const COMPANY = "M8 Smoke Co";
const HR = { name: "Hana HR", email: "hr@hcm.local", password: "hrpass12345" };
const EMPLOYEE = {
  code: "EMP801",
  fullName: "Ali Khan",
  email: "ali@hcm.local",
  password: "tempPass1234",
};

let failed = false;
let server = null;
let serverLog = null;

function check(name, cond, detail) {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${detail ? `  — ${detail}` : ""}`);
  if (!cond) failed = true;
  return !!cond;
}

async function request(urlPath, { method = "GET", body, cookie } = {}) {
  const headers = {};
  if (cookie) headers.cookie = cookie;
  let payload;
  if (body !== undefined) {
    headers["content-type"] = "application/json";
    payload = JSON.stringify(body);
  }
  const res = await fetch(BASE + urlPath, { method, headers, body: payload, redirect: "manual" });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* non-JSON */
  }
  return { res, json, text };
}

function cookieFrom(res) {
  const list = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
  const raw = list.find((value) => value.startsWith("hcm_session="));
  if (!raw) return "";
  const pair = raw.split(";")[0];
  return pair.endsWith("=") ? "" : pair;
}

async function login(email, password) {
  const result = await request("/api/auth/login", { method: "POST", body: { email, password } });
  let cookie = cookieFrom(result.res);
  // Forced first-login password change: the server blocks every non-auth API
  // with 403 password_change_required until it is completed, so finish it here.
  if (
    result.json?.user?.mustChangePassword === true &&
    result.json?.user?.role === "employee" &&
    cookie
  ) {
    const next = `${password}x`;
    const changed = await request("/api/auth/change-password", {
      method: "POST",
      cookie,
      body: { currentPassword: password, newPassword: next },
    });
    if (changed.res.status === 200) {
      const again = await request("/api/auth/login", { method: "POST", body: { email, password: next } });
      cookie = cookieFrom(again.res) || cookie;
    }
  }
  return { ...result, cookie };
}

function startServer() {
  fs.mkdirSync(LOG_DIR, { recursive: true });
  fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });
  for (const suffix of ["", "-wal", "-shm"]) {
    fs.rmSync(DB_FILE + suffix, { force: true });
  }

  serverLog = fs.createWriteStream(SERVER_LOG, { flags: "a" });
  server = spawn(
    process.execPath,
    ["node_modules/next/dist/bin/next", "start", "-p", String(PORT)],
    {
      cwd: process.cwd(),
      env: { ...process.env, DATABASE_URL: DB_FILE },
      stdio: ["ignore", "pipe", "pipe"],
    }
  );
  server.stdout.pipe(serverLog);
  server.stderr.pipe(serverLog);
  server.on("exit", (code) => {
    if (code && code !== 0) console.error(`[server] exited with ${code}; see ${SERVER_LOG}`);
  });
}

async function stopServer() {
  if (!server || server.killed) return;
  server.kill("SIGTERM");
  await new Promise((resolve) => {
    const timer = setTimeout(resolve, 5000);
    server.once("exit", () => {
      clearTimeout(timer);
      resolve();
    });
  });
  serverLog?.end();
}

async function waitForServer() {
  for (let i = 0; i < 120; i += 1) {
    try {
      const { res } = await request("/api/setup/status");
      if (res.ok) return true;
    } catch {
      /* retry */
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return false;
}

const state = {};
const steps = [];
const today = new Date().toISOString().slice(0, 10);

// --------------------------------------------------------------- setup

steps.push(async () => {
  const { res, json } = await request("/api/setup", {
    method: "POST",
    body: {
      companyName: COMPANY,
      adminName: ADMIN.name,
      adminEmail: ADMIN.email,
      adminPassword: ADMIN.password,
    },
  });
  check(
    "fresh DB: setup creates the Admin -> 201",
    res.status === 201 && json?.ok === true,
    `status=${res.status}`
  );
});

steps.push(async () => {
  const result = await login(ADMIN.email, ADMIN.password);
  state.adminCookie = result.cookie;
  check(
    "Admin login -> 200 + cookie",
    result.res.status === 200 && result.json?.user?.role === "admin" && !!state.adminCookie,
    `status=${result.res.status}`
  );
});

steps.push(async () => {
  const created = await request("/api/users", {
    method: "POST",
    cookie: state.adminCookie,
    body: { name: HR.name, email: HR.email, role: "hr" },
  });
  const temp = created.json?.temporaryPassword;
  const firstLogin = await login(HR.email, temp);
  state.hrCookie = firstLogin.cookie;
  const change = await request("/api/auth/change-password", {
    method: "POST",
    cookie: state.hrCookie,
    body: { currentPassword: temp, newPassword: HR.password },
  });
  const relogin = await login(HR.email, HR.password);
  state.hrCookie = relogin.cookie || state.hrCookie;
  check(
    "Admin creates HR + HR sets password and logs in",
    created.res.status === 201 &&
      change.res.status === 200 &&
      relogin.res.status === 200 &&
      relogin.json?.user?.role === "hr",
    `create=${created.res.status} change=${change.res.status} login=${relogin.res.status}`
  );
});

steps.push(async () => {
  const created = await request("/api/employees", {
    method: "POST",
    cookie: state.hrCookie,
    body: {
      code: EMPLOYEE.code,
      fullName: EMPLOYEE.fullName,
      email: EMPLOYEE.email,
      joinDate: "2026-01-05",
      status: "active",
      basicSalary: 50000,
      password: EMPLOYEE.password,
    },
  });
  state.employeeId = created.json?.employee?.id;
  const employeeLogin = await login(EMPLOYEE.email, EMPLOYEE.password);
  state.employeeCookie = employeeLogin.cookie;
  check(
    "HR registers employee with a login; employee logs in",
    created.res.status === 201 &&
      !!state.employeeId &&
      employeeLogin.res.status === 200 &&
      employeeLogin.json?.user?.role === "employee",
    `create=${created.res.status} login=${employeeLogin.res.status}`
  );
});

// ------------------------------------------------------- announcements

steps.push(async () => {
  const first = await request("/api/announcements", {
    method: "POST",
    cookie: state.hrCookie,
    body: { title: "Smoke: flexible Friday", body: "Core hours end at 3pm on Fridays.", pinned: false },
  });
  state.firstId = first.json?.announcement?.id;
  const pinnedPost = await request("/api/announcements", {
    method: "POST",
    cookie: state.hrCookie,
    body: { title: "Smoke: all-hands", body: "All-hands on Monday at 10:00.", pinned: true },
  });
  state.pinnedId = pinnedPost.json?.announcement?.id;
  const third = await request("/api/announcements", {
    method: "POST",
    cookie: state.hrCookie,
    body: { title: "Smoke: temp notice", body: "This one gets deleted by its author.", pinned: false },
  });
  state.thirdId = third.json?.announcement?.id;
  const adminPost = await request("/api/announcements", {
    method: "POST",
    cookie: state.adminCookie,
    body: { title: "Smoke: admin note", body: "Posted by the Admin account.", pinned: false },
  });
  state.adminPostId = adminPost.json?.announcement?.id;
  check(
    "HR posts 3 announcements, Admin posts 1 -> 201 each",
    first.res.status === 201 &&
      pinnedPost.res.status === 201 &&
      third.res.status === 201 &&
      adminPost.res.status === 201 &&
      !!state.firstId &&
      !!state.pinnedId &&
      !!state.thirdId &&
      !!state.adminPostId,
    `statuses=${[first, pinnedPost, third, adminPost].map((r) => r.res.status).join(",")}`
  );
});

steps.push(async () => {
  const { res, json } = await request("/api/announcements", { cookie: state.employeeCookie });
  const items = json?.items ?? [];
  check(
    "Employee GET /api/announcements -> sees every post",
    res.status === 200 && items.length === 4,
    `status=${res.status} count=${items.length}`
  );
  state.employeeSeesFirst = items.some((item) => item.id === state.firstId);
});

steps.push(async () => {
  const { res } = await request("/api/announcements", {
    method: "POST",
    cookie: state.employeeCookie,
    body: { title: "Not allowed", body: "Employees cannot post." },
  });
  check("Employee POST /api/announcements -> 403", res.status === 403, `status=${res.status}`);
});

steps.push(async () => {
  const { res, json } = await request("/api/announcements", { cookie: state.employeeCookie });
  const items = json?.items ?? [];
  check(
    "Pin ordering -> pinned post first, then newest",
    res.status === 200 &&
      items[0]?.id === state.pinnedId &&
      items[0]?.pinned === true &&
      items[1]?.id === state.adminPostId &&
      items[2]?.id === state.thirdId,
    `order=${items.map((item) => `${item.id}${item.pinned ? "*" : ""}`).join(",")}`
  );
});

steps.push(async () => {
  const { res, json } = await request(`/api/announcements/${state.adminPostId}`, {
    method: "PATCH",
    cookie: state.hrCookie,
    body: { title: "HR cannot edit this" },
  });
  check(
    "HR PATCH an Admin’s announcement -> 403 (author-or-admin)",
    res.status === 403,
    `status=${res.status} ${JSON.stringify(json)}`
  );
});

steps.push(async () => {
  const { res, json } = await request(`/api/announcements/${state.firstId}`, {
    method: "PATCH",
    cookie: state.adminCookie,
    body: { title: "Smoke: flexible Friday (updated)" },
  });
  check(
    "Admin PATCH an announcement -> 200 with the new title",
    res.status === 200 && json?.announcement?.title === "Smoke: flexible Friday (updated)",
    `status=${res.status} title=${json?.announcement?.title}`
  );
});

steps.push(async () => {
  const { res } = await request(`/api/announcements/${state.thirdId}`, {
    method: "DELETE",
    cookie: state.hrCookie,
  });
  const list = await request("/api/announcements", { cookie: state.employeeCookie });
  const gone = !(list.json?.items ?? []).some((item) => item.id === state.thirdId);
  check(
    "HR deletes their own announcement -> 200; employee list drops it",
    res.status === 200 && gone && list.json?.items?.length === 3,
    `status=${res.status} count=${list.json?.items?.length}`
  );
});

// -------------------------------------------------------- notifications

steps.push(async () => {
  const { res, json } = await request("/api/notifications", { cookie: state.employeeCookie });
  const items = json?.items ?? [];
  state.employeeNotificationId = items[0]?.id;
  check(
    "Employee GET /api/notifications -> own items + unread count",
    res.status === 200 &&
      items.length >= 4 &&
      json?.unread >= 4 &&
      items.every((item) => item.type === "announcement"),
    `status=${res.status} items=${items.length} unread=${json?.unread}`
  );
});

steps.push(async () => {
  const adminNotifications = await request("/api/notifications", { cookie: state.adminCookie });
  const adminItemId = adminNotifications.json?.items?.[0]?.id;
  const { res } = await request(`/api/notifications/${adminItemId}/read`, {
    method: "POST",
    cookie: state.employeeCookie,
  });
  check(
    "Employee cannot mark someone else’s notification read -> 404",
    res.status === 404,
    `status=${res.status}`
  );
});

steps.push(async () => {
  const before = await request("/api/notifications", { cookie: state.employeeCookie });
  const target = before.json?.items?.[0];
  const { res, json } = await request(`/api/notifications/${target?.id}/read`, {
    method: "POST",
    cookie: state.employeeCookie,
  });
  check(
    "POST /api/notifications/[id]/read -> readAt set, unread decremented",
    res.status === 200 &&
      typeof json?.notification?.readAt === "string" &&
      json?.unread === before.json.unread - 1,
    `status=${res.status} unread=${json?.unread} was=${before.json?.unread}`
  );
});

steps.push(async () => {
  const { res, json } = await request("/api/notifications/read-all", {
    method: "POST",
    cookie: state.employeeCookie,
  });
  const after = await request("/api/notifications", { cookie: state.employeeCookie });
  check(
    "POST /api/notifications/read-all -> unread 0 and every item read",
    res.status === 200 &&
      json?.unread === 0 &&
      after.json?.unread === 0 &&
      (after.json?.items ?? []).every((item) => item.readAt !== null),
    `status=${res.status} updated=${json?.updated} unread=${after.json?.unread}`
  );
});

// ---------------------------------------------------------------- audit

steps.push(async () => {
  const { res, json } = await request(
    "/api/audit-logs?entity=announcement&page=1&pageSize=50",
    { cookie: state.adminCookie }
  );
  const items = json?.items ?? [];
  const created = items.filter((row) => row.action === "create");
  const updated = items.find((row) => row.action === "update");
  const deleted = items.find((row) => row.action === "delete");
  check(
    "Admin GET /api/audit-logs?entity=announcement -> create/update/delete rows",
    res.status === 200 &&
      created.length === 4 &&
      !!updated &&
      !!deleted &&
      json?.total >= 6,
    `status=${res.status} total=${json?.total} create=${created.length} update=${!!updated} delete=${!!deleted}`
  );
  check(
    "Update audit row has before AND after snapshots (old + new title)",
    !!updated &&
      typeof updated.beforeJson === "string" &&
      typeof updated.afterJson === "string" &&
      updated.beforeJson.includes("flexible Friday") &&
      updated.afterJson.includes("(updated)"),
    `before=${updated?.beforeJson?.slice(0, 60)} after=${updated?.afterJson?.slice(0, 60)}`
  );
  check(
    "Delete audit row keeps the before snapshot",
    !!deleted && typeof deleted.beforeJson === "string" && deleted.beforeJson.includes("temp notice"),
    `before=${deleted?.beforeJson?.slice(0, 60)}`
  );
  check(
    "Audit actor join gives name + role",
    items.every((row) => row.actorName && ["admin", "hr", "employee"].includes(row.actorRole)),
    `sample=${items[0]?.actorName}/${items[0]?.actorRole}`
  );
});

steps.push(async () => {
  const byActor = await request("/api/audit-logs?actor=hana&entity=announcement", {
    cookie: state.adminCookie,
  });
  const byRange = await request(
    `/api/audit-logs?entity=announcement&from=${today}&to=${today}&page=1&pageSize=2`,
    { cookie: state.adminCookie }
  );
  check(
    "Audit filters: actor search (case-insensitive) finds the HR rows",
    byActor.res.status === 200 &&
      byActor.json?.total >= 4 &&
      (byActor.json?.items ?? []).every((row) => row.actorName === HR.name),
    `status=${byActor.res.status} total=${byActor.json?.total}`
  );
  check(
    "Audit filters: date range + pagination honour pageSize",
    byRange.res.status === 200 &&
      byRange.json?.total >= 6 &&
      byRange.json?.items?.length === 2 &&
      byRange.json?.page === 1 &&
      byRange.json?.pageSize === 2,
    `status=${byRange.res.status} total=${byRange.json?.total} items=${byRange.json?.items?.length}`
  );
});

steps.push(async () => {
  const hr = await request("/api/audit-logs", { cookie: state.hrCookie });
  const employee = await request("/api/audit-logs", { cookie: state.employeeCookie });
  const anonymous = await request("/api/audit-logs");
  check(
    "Non-admin GET /api/audit-logs -> HR 403, Employee 403, anonymous 401",
    hr.res.status === 403 && employee.res.status === 403 && anonymous.res.status === 401,
    `hr=${hr.res.status} employee=${employee.res.status} anonymous=${anonymous.res.status}`
  );
});

steps.push(async () => {
  const anonymous = await request("/api/announcements");
  const anonymousNotifications = await request("/api/notifications");
  check(
    "Anonymous reads are rejected (401 announcements + notifications)",
    anonymous.res.status === 401 && anonymousNotifications.res.status === 401,
    `announcements=${anonymous.res.status} notifications=${anonymousNotifications.res.status}`
  );
});

// ----------------------------------------------------------------- main

async function main() {
  if (!REUSE_SERVER) {
    startServer();
    const up = await waitForServer();
    if (!up) {
      console.error(`FAIL  server did not start on ${BASE}; see ${SERVER_LOG}`);
      await stopServer();
      process.exit(1);
    }
    console.log(`PASS  server up on ${BASE} (db ${path.relative(process.cwd(), DB_FILE)})`);
  }

  try {
    for (const step of steps) {
      try {
        await step();
      } catch (err) {
        console.error("FAIL  step threw:", err);
        failed = true;
      }
    }
  } finally {
    if (!REUSE_SERVER) await stopServer();
  }

  console.log(failed ? "\nSMOKE M8: FAIL" : "\nSMOKE M8: ALL PASS");
  process.exit(failed ? 1 : 0);
}

main();
