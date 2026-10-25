#!/usr/bin/env node
/**
 * HCM Lite — adversarial security / data-integrity acceptance probe.
 *
 * Run against a THROWAWAY database (fresh install) on an isolated port:
 *
 *   DATABASE_URL=file:./.tmp/accept-sec.db npx next start -p 3032
 *   BASE_URL=http://127.0.0.1:3032 DATABASE_URL=file:./.tmp/accept-sec.db \
 *     node scripts/acceptance-security.mjs
 *
 * It creates its own admin/HR/two employees, drives the real API, checks the
 * SQLite file directly for spoofed writes, and emits a machine-readable report
 * under .agent-logs/acceptance-security-<stamp>/.
 *
 * The script never patches product code. It only reads + probes.
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { DatabaseSync } from "node:sqlite";

const BASE = (process.env.BASE_URL || "http://127.0.0.1:3032").replace(/\/$/, "");
const DB_FILE =
  process.env.ACCEPT_DB ||
  (process.env.DATABASE_URL || "file:./.tmp/accept-sec.db").replace(/^file:/, "");
const STAMP = new Date().toISOString().replace(/[:.]/g, "-");
const OUT_DIR = path.resolve(process.cwd(), ".agent-logs", `acceptance-security-${STAMP}`);
fs.mkdirSync(OUT_DIR, { recursive: true });

const P = {
  admin: "AdminPass!23",
  hr: "HrPass!23",
  a: "AlicePass!23",
  b: "BobPass!23",
  a2: "AlicePass!23x",
  b2: "BobPass!23x",
};
const EMAIL = {
  admin: "admin@acme.test",
  hr: "hr@acme.test",
  a: "alice@acme.test",
  b: "bob@acme.test",
  sqli: "sqli@acme.test",
  xss: "xss@acme.test",
};
const TODAY = (() => {
  const d = new Date();
  const p = (n) => (n < 10 ? `0${n}` : String(n));
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
})();
const MONTH = TODAY.slice(0, 7);

// ------------------------------------------------------------------ reporting

const results = []; // {group, probe, request, expected, actual, verdict, note}
const captured = []; // every response body, for leakage scanning
const state = {};
const counters = { PASS: 0, FAIL: 0, WARN: 0, SKIP: 0 };

function snippet(text, max = 220) {
  if (text === undefined || text === null) return "";
  let s = String(text).replace(/\s+/g, " ").trim();
  if (s.length > max) s = `${s.slice(0, max)}…`;
  return s;
}

function record({ group, probe, request, expected, status, body, verdict, note }) {
  if (verdict === "PASS") counters.PASS++;
  else if (verdict === "FAIL") counters.FAIL++;
  else if (verdict === "WARN") counters.WARN++;
  else counters.SKIP++;
  const row = {
    group,
    probe,
    request,
    expected,
    actual: `${status ?? "-"} ${snippet(body)}`,
    verdict,
    note: note || "",
  };
  results.push(row);
  const mark = verdict === "FAIL" ? "✗" : verdict === "WARN" ? "▲" : verdict === "SKIP" ? "○" : "✓";
  console.log(`${mark} [${group}] ${probe} → ${row.actual}`);
}

// ------------------------------------------------------------------- http core

function parseCookie(setCookies) {
  for (const raw of setCookies || []) {
    const m = /(?:^|;\s*)hcm_session=([^;]+)/.exec(raw);
    if (m) return `hcm_session=${m[1]}`;
  }
  return null;
}

async function call(method, urlPath, opts = {}) {
  const headers = { ...(opts.headers || {}) };
  if (opts.cookie) headers.cookie = opts.cookie;
  let body;
  if (opts.raw !== undefined) {
    body = opts.raw;
  } else if (opts.body !== undefined) {
    headers["content-type"] ??= "application/json";
    body = JSON.stringify(opts.body);
  }
  let res;
  try {
    res = await fetch(BASE + urlPath, {
      method,
      headers,
      body,
      redirect: "manual",
      signal: AbortSignal.timeout(20000),
    });
  } catch (err) {
    return { status: 0, text: `fetch_error: ${err?.message || err}`, json: null, setCookies: [] };
  }
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* non-JSON (PDF, HTML) */
  }
  const setCookies = typeof res.headers.getSetCookie === "function" ? res.headers.getSetCookie() : [];
  captured.push({
    method,
    path: urlPath,
    status: res.status,
    contentType: res.headers.get("content-type") || "",
    text,
  });
  return { status: res.status, text, json, setCookies, headers: res.headers };
}

function rec(group, probe, request, expected, res, verdict, note) {
  record({
    group,
    probe,
    request,
    expected,
    status: res?.status,
    body: res?.json ? JSON.stringify(res.json) : res?.text,
    verdict,
    note,
  });
}

function expectStatus(res, allowed) {
  return allowed.includes(res.status);
}

function expectNo500(res) {
  return res.status !== 0 && res.status < 500;
}

function hasSqlError(text) {
  return /SQLITE_|SqliteError|syntax error|no such (table|column)|unrecognized token/i.test(String(text));
}

function findByKeyDeep(value, key) {
  if (!value || typeof value !== "object") return false;
  if (Array.isArray(value)) return value.some((v) => findByKeyDeep(v, key));
  if (Object.prototype.hasOwnProperty.call(value, key)) return true;
  return Object.values(value).some((v) => findByKeyDeep(v, key));
}

function has1024FloatArray(value) {
  if (!value || typeof value !== "object") return false;
  if (Array.isArray(value)) {
    if (value.length === 1024 && value.every((n) => typeof n === "number" && Number.isFinite(n))) {
      return true;
    }
    return value.some(has1024FloatArray);
  }
  return Object.values(value).some(has1024FloatArray);
}

// ------------------------------------------------------------------- sqlite

let db = null;
function openDb() {
  try {
    db = new DatabaseSync(path.resolve(process.cwd(), DB_FILE), { readOnly: true });
  } catch (err) {
    console.log(`! could not open sqlite read-only: ${err.message}`);
    db = null;
  }
}
function sqlAll(sql, ...params) {
  if (!db) return [];
  try {
    return db.prepare(sql).all(...params);
  } catch (err) {
    console.log(`! sqlite read failed: ${err.message}`);
    return [];
  }
}
function sqlOne(sql, ...params) {
  const rows = sqlAll(sql, ...params);
  return rows[0];
}

// ------------------------------------------------------------- .env / JWT

function readEnvSecretRaw() {
  for (const file of [".env.local", ".env"]) {
    try {
      const text = fs.readFileSync(path.resolve(process.cwd(), file), "utf8");
      for (const line of text.split("\n")) {
        const m = /^\s*AUTH_SECRET\s*=\s*(.*)\s*$/.exec(line);
        if (m) return m[1].replace(/^['"]|['"]$/g, "").trim();
      }
    } catch {
      /* ignore */
    }
  }
  return (process.env.AUTH_SECRET || "").trim();
}
const AUTH_SECRET_RAW = readEnvSecretRaw();
const AUTH_SECRET = AUTH_SECRET_RAW || "hcm-lite-dev-secret"; // lib/auth.ts fallback
const DEV_FALLBACK_SECRET = "hcm-lite-dev-secret";

function b64url(input) {
  return Buffer.from(input).toString("base64url");
}
function signJwt(payload, secret, header = { alg: "HS256", typ: "JWT" }) {
  const h = b64url(JSON.stringify(header));
  const p = b64url(JSON.stringify(payload));
  const sig = crypto.createHmac("sha256", secret).update(`${h}.${p}`).digest("base64url");
  return `${h}.${p}.${sig}`;
}

// ================================================================== phases

async function main() {
  openDb();

  // ---------------------------------------------------------------- preflight
  const status0 = await call("GET", "/api/setup/status");
  if (status0.json?.initialized !== false) {
    record({
      group: "setup",
      probe: "database must be a fresh install",
      request: "GET /api/setup/status",
      expected: "initialized=false",
      status: status0.status,
      body: status0.json ? JSON.stringify(status0.json) : status0.text,
      verdict: "SKIP",
      note: "DB already initialized — delete .tmp/accept-sec.db* and restart on a fresh DB.",
    });
    return finish(3);
  }
  rec("setup", "fresh install detected", "GET /api/setup/status", "200 {initialized:false}", status0, "PASS");

  // ------------------------------------------------------------------- setup
  const setup = await call("POST", "/api/setup", {
    body: {
      companyName: "Acme Security",
      adminName: "Ada Admin",
      adminEmail: EMAIL.admin,
      adminPassword: P.admin,
      officeStart: "09:00",
    },
  });
  rec("setup", "create admin (first run)", "POST /api/setup", "201", setup, expectStatus(setup, [201]) ? "PASS" : "FAIL");

  const adminLogin = await call("POST", "/api/auth/login", { body: { email: EMAIL.admin, password: P.admin } });
  state.admin = parseCookie(adminLogin.setCookies);
  rec("setup", "admin login", "POST /api/auth/login", "200 + Set-Cookie", adminLogin,
    adminLogin.status === 200 && !!state.admin ? "PASS" : "FAIL");

  // AUTH_SECRET configuration + the code's hardcoded fallback.
  // lib/auth.ts: authSecret() = process.env.AUTH_SECRET || "hcm-lite-dev-secret".
  record({
    group: "authn",
    probe: "AUTH_SECRET is configured (no hardcoded fallback in use)",
    request: "read AUTH_SECRET from environment/.env",
    expected: "a non-default secret is set",
    status: 200,
    body: AUTH_SECRET_RAW ? "AUTH_SECRET is set" : "AUTH_SECRET is UNSET → hcm-lite-dev-secret fallback is active",
    verdict: AUTH_SECRET_RAW ? "PASS" : "FAIL",
    note: AUTH_SECRET_RAW ? "" : "lib/auth.ts:16-18 falls back to a constant that ships in the repo.",
  });

  const now0 = Math.floor(Date.now() / 1000);
  const fallbackForged = signJwt(
    { sub: "1", name: "Ada Admin", email: EMAIL.admin, role: "admin", employeeId: null, iat: now0, exp: now0 + 7200 },
    DEV_FALLBACK_SECRET
  );
  {
    const me = await call("GET", "/api/auth/me", { cookie: `hcm_session=${fallbackForged}` });
    const users = await call("GET", "/api/users", { cookie: `hcm_session=${fallbackForged}` });
    const acceptedAsAdmin =
      me.status === 200 && me.json?.user?.role === "admin" && users.status === 200;
    rec("authn", "JWT forged with public fallback secret is rejected", "GET /api/auth/me + /api/users with hcm-lite-dev-secret JWT", "401",
      me.status === 401 ? me : { status: me.status, json: { me: me.json, usersStatus: users.status } },
      acceptedAsAdmin ? "FAIL" : "PASS",
      acceptedAsAdmin ? "CRITICAL: forged admin session accepted — full auth bypass." : "");
  }

  // cookie attribute policy
  const rawCookie = (adminLogin.setCookies || []).find((c) => c.startsWith("hcm_session=")) || "";
  const httpOnly = /httponly/i.test(rawCookie);
  const sameSiteLax = /samesite=lax/i.test(rawCookie);
  const pathRoot = /path=\//i.test(rawCookie);
  record({
    group: "secrets",
    probe: "session cookie attributes",
    request: "Set-Cookie from POST /api/auth/login",
    expected: "HttpOnly; SameSite=Lax; Path=/",
    status: 200,
    body: rawCookie.replace(/hcm_session=[^;]+/, "hcm_session=<redacted>"),
    verdict: httpOnly && sameSiteLax && pathRoot ? "PASS" : "FAIL",
    note: /secure/i.test(rawCookie) ? "Secure is also set (next start = production)" : "Secure flag NOT set",
  });

  const setSettings = await call("PATCH", "/api/settings", {
    cookie: state.admin,
    body: {
      companyName: "Acme Security",
      officeLat: 24.8607,
      officeLng: 67.0011,
      radiusM: 500,
      graceMinutes: 15,
      weekendDays: "sat,sun",
    },
  });
  rec("setup", "set geofence + office settings", "PATCH /api/settings", "200", setSettings,
    expectStatus(setSettings, [200]) ? "PASS" : "FAIL");

  const hrCreate = await call("POST", "/api/users", {
    cookie: state.admin,
    body: { name: "Hana HR", email: EMAIL.hr, role: "hr", password: P.hr },
  });
  rec("setup", "admin creates HR login", "POST /api/users", "201", hrCreate,
    expectStatus(hrCreate, [201]) ? "PASS" : "FAIL");
  state.hr = (await call("POST", "/api/auth/login", { body: { email: EMAIL.hr, password: P.hr } }))
    .setCookies;
  state.hr = parseCookie(state.hr || []);

  const dept = await call("POST", "/api/departments", { cookie: state.admin, body: { name: "Engineering" } });
  state.deptId = dept.json?.department?.id;
  rec("setup", "create department", "POST /api/departments", "201", dept,
    expectStatus(dept, [201]) && !!state.deptId ? "PASS" : "FAIL");

  const leaveType = await call("POST", "/api/leave-types", {
    cookie: state.admin,
    body: { name: "Annual", quotaDays: 20, paid: true },
  });
  state.leaveTypeId = leaveType.json?.leaveType?.id;
  rec("setup", "create leave type", "POST /api/leave-types", "201", leaveType,
    expectStatus(leaveType, [201]) && !!state.leaveTypeId ? "PASS" : "FAIL");

  async function createEmployee({ code, name, email, password, salary = 120000, joinDate = "2026-01-05" }) {
    return call("POST", "/api/employees", {
      cookie: state.hr,
      body: {
        code,
        fullName: name,
        email,
        address: "1 Test Street",
        departmentId: state.deptId,
        joinDate,
        status: "active",
        basicSalary: salary,
        password,
      },
    });
  }

  const empA = await createEmployee({ code: "EMP-A", name: "Alice Anderson", email: EMAIL.a, password: P.a });
  state.a = { id: empA.json?.employee?.id, employeeId: empA.json?.employee?.id };
  rec("setup", "HR creates employee A", "POST /api/employees", "201 + employee id", empA,
    expectStatus(empA, [201]) && !!state.a.id ? "PASS" : "FAIL");

  const empB = await createEmployee({ code: "EMP-B", name: "Bob Brown", email: EMAIL.b, password: P.b });
  state.b = { id: empB.json?.employee?.id };
  rec("setup", "HR creates employee B", "POST /api/employees", "201 + employee id", empB,
    expectStatus(empB, [201]) && !!state.b.id ? "PASS" : "FAIL");

  async function loginAndChange(email, password, nextPassword) {
    const login = await call("POST", "/api/auth/login", { body: { email, password } });
    let cookie = parseCookie(login.setCookies);
    const me1 = await call("GET", "/api/auth/me", { cookie });
    const changed = await call("POST", "/api/auth/change-password", {
      cookie,
      body: { currentPassword: password, newPassword: nextPassword },
    });
    cookie = parseCookie(changed.setCookies) || cookie;
    const me2 = await call("GET", "/api/auth/me", { cookie });
    return { login, me1, changed, me2, cookie };
  }

  const aFlow = await loginAndChange(EMAIL.a, P.a, P.a2);
  state.a.cookie = aFlow.cookie;
  rec("setup", "employee A login + forced password change", "POST /api/auth/change-password", "200 and mustChangePassword→false", aFlow.changed,
    aFlow.changed.status === 200 && aFlow.me2.json?.user?.mustChangePassword === false ? "PASS" : "FAIL",
    `before=${aFlow.me1.json?.user?.mustChangePassword} after=${aFlow.me2.json?.user?.mustChangePassword}`);
  rec("setup", "employee A session after change", "GET /api/auth/me", "200 own user", aFlow.me2,
    aFlow.me2.json?.user?.employeeId === state.a.id ? "PASS" : "FAIL");

  const bFlow = await loginAndChange(EMAIL.b, P.b, P.b2);
  state.b.cookie = bFlow.cookie;
  rec("setup", "employee B login + forced password change", "POST /api/auth/change-password", "200", bFlow.changed,
    bFlow.changed.status === 200 ? "PASS" : "FAIL");

  // --------------------------------------------------- attendance + face data
  const bCheckIn = await call("POST", "/api/attendance/check-in", { cookie: state.b.cookie });
  state.b.attendanceId = bCheckIn.json?.attendance?.id;
  rec("data", "B web check-in", "POST /api/attendance/check-in", "201", bCheckIn,
    expectStatus(bCheckIn, [201]) ? "PASS" : "FAIL");

  const emb = Array(1024).fill(0.05); // L2 norm ≈ 1.6, passes the 0.5–100 shape gate

  const enrollChallenge = await call("POST", "/api/attendance/face/challenge", {
    cookie: state.a.cookie,
    body: { purpose: "enroll" },
  });
  rec("data", "A requests face enrol challenge", "POST /api/attendance/face/challenge", "200/201", enrollChallenge,
    expectStatus(enrollChallenge, [200, 201]) ? "PASS" : "FAIL");

  const enroll = await call("POST", "/api/attendance/face/enroll", {
    cookie: state.a.cookie,
    body: { challengeId: enrollChallenge.json?.challengeId, embedding: emb },
  });
  rec("data", "A enrols synthetic face template", "POST /api/attendance/face/enroll", "201 template meta only", enroll,
    expectStatus(enroll, [201]) && !findByKeyDeep(enroll.json, "embedding") ? "PASS" : "FAIL",
    `response=${snippet(enroll.text)}`);

  // identity spoof #1: face punch with employeeId of B in the body
  const punchChallenge = await call("POST", "/api/attendance/face/challenge", {
    cookie: state.a.cookie,
    body: { purpose: "check-in" },
  });
  const spoofFace = await call("POST", "/api/attendance/face/check-in", {
    cookie: state.a.cookie,
    body: {
      challengeId: punchChallenge.json?.challengeId,
      embedding: emb,
      location: { latitude: 24.8607, longitude: 67.0011, accuracy: 5 },
      employeeId: state.b.id, // ← attacker-controlled, must be ignored
    },
  });
  const spoofFaceRowEmployee = spoofFace.json?.attendance?.employeeId;
  rec("identity", "face punch body employeeId=B cannot punch for B", "POST /api/attendance/face/check-in {employeeId:B}", "A's row (or rejected)", spoofFace,
    expectStatus(spoofFace, [200, 201]) && spoofFaceRowEmployee === state.a.id ? "PASS" : "FAIL",
    `row.employeeId=${spoofFaceRowEmployee} expected=${state.a.id}`);

  // identity spoof #2: web check-in with employeeId of B in the body
  const beforeSpoof = sqlOne("SELECT COUNT(*) AS c FROM attendance WHERE employee_id = ? AND date = ?", state.b.id, TODAY);
  const spoofWeb = await call("POST", "/api/attendance/check-in", {
    cookie: state.a.cookie,
    body: { employeeId: state.b.id },
  });
  const afterSpoof = sqlOne("SELECT COUNT(*) AS c FROM attendance WHERE employee_id = ? AND date = ?", state.b.id, TODAY);
  rec("identity", "web check-in body employeeId=B ignored/rejected", "POST /api/attendance/check-in {employeeId:B}", "A's row or 409; B row unchanged", spoofWeb,
    expectStatus(spoofWeb, [201, 409]) && Number(beforeSpoof?.c) === Number(afterSpoof?.c) ? "PASS" : "FAIL",
    `B attendance rows ${beforeSpoof?.c}→${afterSpoof?.c}`);

  const aCheckOut = await call("POST", "/api/attendance/check-out", { cookie: state.a.cookie });
  rec("data", "A web check-out", "POST /api/attendance/check-out", "200", aCheckOut,
    expectStatus(aCheckOut, [200]) ? "PASS" : "FAIL");
  const bCheckOut = await call("POST", "/api/attendance/check-out", { cookie: state.b.cookie });
  rec("data", "B web check-out", "POST /api/attendance/check-out", "200", bCheckOut,
    expectStatus(bCheckOut, [200]) ? "PASS" : "FAIL");

  // SQLite cross-check for the identity probes
  const aRow = sqlOne("SELECT * FROM attendance WHERE employee_id = ? AND date = ?", state.a.id, TODAY);
  const bRow = sqlOne("SELECT * FROM attendance WHERE employee_id = ? AND date = ?", state.b.id, TODAY);
  const spoofClean =
    !!aRow &&
    aRow.source === "camera" &&
    !!bRow &&
    bRow.source === "web" &&
    Number(bRow.id) === Number(state.b.attendanceId);
  rec("identity", "SQLite: spoofed punch wrote A's camera row, not B's", "SELECT attendance WHERE date=today", "A camera row; B unchanged web row",
    { status: 200, json: { a: { id: aRow?.id, emp: aRow?.employee_id, source: aRow?.source }, b: { id: bRow?.id, emp: bRow?.employee_id, source: bRow?.source } } },
    spoofClean ? "PASS" : "FAIL");

  const correction = await call("POST", "/api/attendance/corrections", {
    cookie: state.a.cookie,
    body: { date: TODAY, requestedCheckIn: "09:00", requestedCheckOut: "18:00", reason: "Pending correction before payroll finalize" },
  });
  state.correctionId = correction.json?.correction?.id;
  rec("data", "A pending attendance correction (for lock test)", "POST /api/attendance/corrections", "201", correction,
    expectStatus(correction, [201]) ? "PASS" : "FAIL");

  const leaveA = await call("POST", "/api/leave/requests", {
    cookie: state.a.cookie,
    body: { leaveTypeId: state.leaveTypeId, startDate: "2026-11-02", endDate: "2026-11-03", reason: "Family event" },
  });
  state.a.leaveId = leaveA.json?.request?.id;
  rec("data", "A leave request", "POST /api/leave/requests", "201", leaveA,
    expectStatus(leaveA, [201]) ? "PASS" : "FAIL");

  const leaveB = await call("POST", "/api/leave/requests", {
    cookie: state.b.cookie,
    body: { leaveTypeId: state.leaveTypeId, startDate: "2026-11-04", endDate: "2026-11-05", reason: "Personal" },
  });
  state.b.leaveId = leaveB.json?.request?.id;
  rec("data", "B leave request", "POST /api/leave/requests", "201", leaveB,
    expectStatus(leaveB, [201]) ? "PASS" : "FAIL");

  const runCreate = await call("POST", "/api/payroll/runs", { cookie: state.hr, body: { month: MONTH } });
  state.runId = runCreate.json?.run?.id;
  state.payslipA = (runCreate.json?.payslips || []).find((p) => Number(p.employeeId) === Number(state.a.id));
  state.payslipB = (runCreate.json?.payslips || []).find((p) => Number(p.employeeId) === Number(state.b.id));
  rec("data", "HR creates payroll draft", "POST /api/payroll/runs", "201 + payslips", runCreate,
    expectStatus(runCreate, [201]) && !!state.runId && !!state.payslipA?.id && !!state.payslipB?.id ? "PASS" : "FAIL",
    `run=${state.runId} payslips=${runCreate.json?.payslips?.length}`);

  const finalize = await call("POST", `/api/payroll/runs/${state.runId}/finalize`, { cookie: state.admin });
  rec("data", "admin finalizes payroll (locks month)", "POST /api/payroll/runs/:id/finalize", "200 finalized", finalize,
    expectStatus(finalize, [200]) && finalize.json?.run?.status === "finalized" ? "PASS" : "FAIL");

  const notifB = await call("GET", "/api/notifications", { cookie: state.b.cookie });
  state.b.notificationId = notifB.json?.items?.[0]?.id;
  rec("data", "B receives payslip notification", "GET /api/notifications", "200 items with unread notification", notifB,
    expectStatus(notifB, [200]) && !!state.b.notificationId ? "PASS" : "FAIL");

  // ------------------------------------------------------------- 1. AuthN
  const protectedRoutes = [
    ["GET", "/api/employees"],
    ["GET", "/api/employees/1"],
    ["GET", "/api/employees/1/overview"],
    ["GET", "/api/attendance"],
    ["GET", "/api/attendance/me"],
    ["GET", "/api/attendance/face/status"],
    ["GET", "/api/attendance/face/verifications"],
    ["GET", "/api/attendance/corrections"],
    ["POST", "/api/attendance/check-in"],
    ["POST", "/api/attendance/check-out"],
    ["POST", "/api/attendance/face/challenge", { purpose: "check-in" }],
    ["POST", "/api/attendance/face/enroll", { challengeId: "x", embedding: [] }],
    ["GET", "/api/leave/requests"],
    ["GET", "/api/leave/balances"],
    ["GET", "/api/payroll/runs"],
    ["GET", "/api/payroll/payslips"],
    ["GET", "/api/payroll/payslips/1/pdf"],
    ["POST", "/api/ai/chat", { messages: [{ role: "user", content: "hi" }] }],
    ["POST", "/api/ai/smart-leave", { text: "sick leave tomorrow" }],
    ["GET", "/api/ai/logs"],
    ["GET", "/api/audit-logs"],
    ["GET", "/api/notifications"],
    ["GET", "/api/announcements"],
    ["GET", "/api/users"],
    ["GET", "/api/settings"],
    ["GET", "/api/dashboard/summary"],
    ["GET", "/api/dashboard/employee"],
    ["GET", "/api/demo/seed"],
  ];
  for (const [method, p, body] of protectedRoutes) {
    const res = await call(method, p, { body });
    rec("authn", `no cookie → ${method} ${p}`, `${method} ${p}`, "401", res,
      res.status === 401 ? "PASS" : "FAIL", res.status === 500 ? "500 leaked" : "");
  }

  // tampered / forged / expired / alg:none JWTs
  const tokenA = (state.a.cookie || "").slice("hcm_session=".length);
  const tampered = tokenA.slice(0, -3) + (tokenA.slice(-3) === "AAA" ? "BBB" : "AAA");
  const now = Math.floor(Date.now() / 1000);
  const forged = signJwt(
    { sub: "1", name: "Ada Admin", email: EMAIL.admin, role: "admin", employeeId: null, iat: now, exp: now + 7200 },
    "attacker-secret"
  );
  const expired = signJwt(
    { sub: "1", name: "Ada Admin", email: EMAIL.admin, role: "admin", employeeId: null, iat: now - 7200, exp: now - 3600 },
    AUTH_SECRET
  );
  const none = `${b64url(JSON.stringify({ alg: "none", typ: "JWT" }))}.${b64url(
    JSON.stringify({ sub: "1", role: "admin", exp: now + 7200 })
  )}.`;
  for (const [label, token] of [
    ["tampered signature", tampered],
    ["JWT signed with attacker secret", forged],
    ["expired JWT (correct secret)", expired],
    ["alg:none JWT", none],
  ]) {
    const res = await call("GET", "/api/auth/me", { cookie: `hcm_session=${token}` });
    rec("authn", label, "GET /api/auth/me", "401, not 500", res, res.status === 401 ? "PASS" : "FAIL");
  }

  // ------------------------------------------------------------- 2. AuthZ
  async function zprobe(group, method, p, cookie, body, allowedExpected = [403]) {
    const res = await call(method, p, { cookie, body });
    rec(group, `${method} ${p}`, `${method} ${p}`, `${allowedExpected.join("/")}`, res,
      expectStatus(res, allowedExpected) ? "PASS" : "FAIL");
    return res;
  }

  await zprobe("authz", "GET", "/api/users", state.a.cookie);
  await zprobe("authz", "POST", "/api/users", state.a.cookie, { name: "X", email: "x@x.test", role: "hr" });
  await zprobe("authz", "GET", "/api/audit-logs", state.a.cookie);
  await zprobe("authz", "POST", "/api/payroll/runs", state.a.cookie, { month: MONTH });
  await zprobe("authz", "GET", "/api/payroll/runs", state.a.cookie);
  await zprobe("authz", "POST", "/api/employees", state.a.cookie, { code: "X", fullName: "X", email: "x@x.test", joinDate: "2026-01-01", basicSalary: 1 });
  await zprobe("authz", "GET", "/api/dashboard/summary", state.a.cookie);
  await zprobe("authz", "PATCH", `/api/leave/requests/${state.a.leaveId}`, state.a.cookie, { action: "approve" });
  await zprobe("authz", "GET", "/api/attendance", state.a.cookie);
  await zprobe("authz", "GET", "/api/settings", state.a.cookie);
  await zprobe("authz", "POST", "/api/announcements", state.a.cookie, { title: "x", body: "y" });
  await zprobe("authz", "GET", "/api/demo/seed", state.a.cookie);
  await zprobe("authz", "GET", "/api/employees/export", state.a.cookie);
  await zprobe("authz", "POST", "/api/employees/import?dryRun=1", state.a.cookie);

  {
    const res = await call("GET", `/api/attendance?employeeId=${state.b.id}`, { cookie: state.a.cookie });
    rec("idor", "A reads B attendance board via ?employeeId", `GET /api/attendance?employeeId=${state.b.id}`, "403", res,
      expectStatus(res, [403]) ? "PASS" : "FAIL");
  }

  // employee requesting another employee's face feed is scoped (own rows) or 403
  {
    const res = await call("GET", `/api/attendance/face/verifications?employeeId=${state.b.id}`, { cookie: state.a.cookie });
    const bFeed = await call("GET", "/api/attendance/face/verifications", { cookie: state.b.cookie });
    const ownIds = new Set((res.json?.items || []).map((i) => i.id));
    const bIds = (bFeed.json?.items || []).map((i) => i.id);
    const leaked = bIds.filter((id) => ownIds.has(id));
    rec("authz", "employee face feed ?employeeId=B is scoped", "GET /api/attendance/face/verifications?employeeId=B",
      "403 or only own rows", res,
      (expectStatus(res, [403]) || leaked.length === 0) ? "PASS" : "FAIL",
      `status=${res.status} own=${ownIds.size} overlapWithB=${leaked.length}`);
  }

  // admin → HR-only write routes
  await zprobe("authz", "POST", "/api/employees", state.admin, { code: "EMP-Z", fullName: "Zed", email: "zed@acme.test", joinDate: "2026-01-01", basicSalary: 1000 });
  await zprobe("authz", "POST", "/api/payroll/runs", state.admin, { month: MONTH });
  await zprobe("authz", "PATCH", `/api/leave/requests/${state.a.leaveId}`, state.admin, { action: "approve" });
  await zprobe("authz", "PATCH", `/api/attendance/corrections/${state.correctionId}`, state.admin, { action: "approve" });
  await zprobe("authz", "DELETE", `/api/payroll/runs/${state.runId}`, state.admin);

  // HR → admin-only
  await zprobe("authz", "GET", "/api/audit-logs", state.hr);
  await zprobe("authz", "GET", "/api/users", state.hr);
  await zprobe("authz", "POST", "/api/users", state.hr, { name: "X", email: "x2@x.test", role: "admin" });
  await zprobe("authz", "PATCH", "/api/settings", state.hr, { companyName: "Hijacked" });
  await zprobe("authz", "POST", `/api/payroll/runs/${state.runId}/finalize`, state.hr);
  await zprobe("authz", "GET", "/api/ai/logs", state.hr);
  await zprobe("authz", "GET", "/api/demo/seed", state.hr);
  await zprobe("authz", "POST", "/api/users/1/reset-password", state.hr);

  // -------------------------------------------------------------- 3. IDOR
  async function idorProbe(probe, p, asCookie, allowedExpected, validator) {
    const res = await call("GET", p, { cookie: asCookie });
    const ok = expectStatus(res, allowedExpected) && (validator ? validator(res) : true);
    rec("idor", probe, `GET ${p}`, `${allowedExpected.join("/")} and no B data`, res, ok ? "PASS" : "FAIL");
    return res;
  }

  await idorProbe("A reads B employee record", `/api/employees/${state.b.id}`, state.a.cookie, [403, 404],
    (r) => r.json?.employee?.employeeId !== state.b.id && r.json?.employee?.id !== state.b.id);
  await idorProbe("A reads B employee overview", `/api/employees/${state.b.id}/overview`, state.a.cookie, [403, 404]);
  {
    const res = await call("PATCH", `/api/employees/${state.b.id}`, { cookie: state.a.cookie, body: { phone: "+1" } });
    rec("idor", "A patches B employee record", `PATCH /api/employees/${state.b.id}`, "403", res,
      expectStatus(res, [403]) ? "PASS" : "FAIL");
  }
  await idorProbe("A reads B payslip PDF", `/api/payroll/payslips/${state.payslipB.id}/pdf`, state.a.cookie, [403, 404],
    (r) => !/pdf/i.test(r.headers?.get("content-type") || ""));
  await idorProbe("A reads own payslip PDF (control)", `/api/payroll/payslips/${state.payslipA.id}/pdf`, state.a.cookie, [200],
    (r) => /pdf/i.test(r.headers?.get("content-type") || ""));
  await idorProbe("A reads payroll run detail", `/api/payroll/runs/${state.runId}`, state.a.cookie, [403, 404]);

  {
    const res = await call("GET", `/api/leave/requests?employeeId=${state.b.id}`, { cookie: state.a.cookie });
    const items = res.json?.items || [];
    const clean = items.every((i) => Number(i.employeeId) === Number(state.a.id));
    rec("idor", "A lists B leave via ?employeeId", `GET /api/leave/requests?employeeId=${state.b.id}`, "200 own rows only / 403", res,
      expectStatus(res, [200, 403]) && clean ? "PASS" : "FAIL", `items=${items.length} employees=${[...new Set(items.map((i) => i.employeeId))]}`);
  }
  {
    const res = await call("GET", `/api/leave/balances?employeeId=${state.b.id}`, { cookie: state.a.cookie });
    const items = res.json?.items || [];
    const clean = items.every((i) => Number(i.employeeId) === Number(state.a.id));
    rec("idor", "A lists B leave balances via ?employeeId", `GET /api/leave/balances?employeeId=${state.b.id}`, "200 own rows only / 403", res,
      expectStatus(res, [200, 403]) && clean ? "PASS" : "FAIL", `items=${items.length}`);
  }
  {
    const res = await call("GET", `/api/payroll/payslips?employeeId=${state.b.id}`, { cookie: state.a.cookie });
    const items = res.json?.items || [];
    const clean = items.every((i) => Number(i.employeeId) === Number(state.a.id));
    rec("idor", "A lists B payslips via ?employeeId", `GET /api/payroll/payslips?employeeId=${state.b.id}`, "200 own rows only / 403", res,
      expectStatus(res, [200, 403]) && clean ? "PASS" : "FAIL", `items=${items.length}`);
  }
  {
    const res = await call("POST", `/api/leave/requests/${state.b.leaveId}/cancel`, { cookie: state.a.cookie });
    rec("idor", "A cancels B leave request", `POST /api/leave/requests/${state.b.leaveId}/cancel`, "403", res,
      expectStatus(res, [403]) ? "PASS" : "FAIL");
  }
  {
    const res = await call("POST", `/api/notifications/${state.b.notificationId}/read`, { cookie: state.a.cookie });
    rec("idor", "A marks B notification read", `POST /api/notifications/${state.b.notificationId}/read`, "404", res,
      expectStatus(res, [404]) ? "PASS" : "FAIL");
  }

  // ------------------------------------------------- 5. biometric leakage
  const faceEndpoints = captured.filter((c) =>
    /\/api\/(employees|attendance|audit-logs)/.test(c.path) && c.contentType.includes("json")
  );
  const embLeaks = faceEndpoints.filter((c) => /"embedding"\s*:/.test(c.text));
  const vecLeaks = [];
  for (const c of captured) {
    if (!c.contentType.includes("json")) continue;
    try {
      if (has1024FloatArray(JSON.parse(c.text))) vecLeaks.push(c.path);
    } catch {
      /* ignore */
    }
  }
  rec("biometric", "no `embedding` key in any JSON response", "scan of all captured JSON responses", "0 occurrences",
    { status: 200, json: { occurrences: embLeaks.length, paths: [...new Set(embLeaks.map((c) => c.path))] } },
    embLeaks.length === 0 ? "PASS" : "FAIL");
  rec("biometric", "no 1024-length float vector in any JSON response", "deep scan of all captured JSON responses", "0 occurrences",
    { status: 200, json: { occurrences: vecLeaks.length, paths: [...new Set(vecLeaks)] } },
    vecLeaks.length === 0 ? "PASS" : "FAIL");
  {
    const rows = sqlAll(
      "SELECT id, action, entity, before_json, after_json FROM audit_logs WHERE entity = 'face_template'"
    );
    const bad = rows.filter(
      (r) => /"embedding"/.test(`${r.before_json || ""}${r.after_json || ""}`) || /\d{3,}\.\d{3,}/.test(`${r.before_json || ""}${r.after_json || ""}`)
    );
    rec("biometric", "face enrolment audit rows contain no vector payload", "SELECT audit_logs WHERE entity='face_template'", "metadata only",
      { status: 200, json: { rows: rows.length, suspicious: bad.length, sample: rows[0]?.after_json } },
      rows.length > 0 && bad.length === 0 ? "PASS" : rows.length === 0 ? "WARN" : "FAIL");
  }
  {
    const apiRes = await call("GET", "/api/employees", { cookie: state.hr });
    const statusRes = await call("GET", "/api/attendance/face/status", { cookie: state.a.cookie });
    const auditRes = await call("GET", "/api/audit-logs", { cookie: state.admin });
    const joined = `${apiRes.text}\n${statusRes.text}\n${auditRes.text}`;
    rec("biometric", "targeted endpoints never expose templates", "GET /api/employees + face/status + audit-logs", "no embedding/vector",
      { status: 200, json: { employeesEmbedding: /"embedding"\s*:/.test(apiRes.text), statusEmbedding: /"embedding"\s*:/.test(statusRes.text), auditEmbedding: /"embedding"\s*:/.test(auditRes.text) } },
      !/"embedding"\s*:/.test(joined) ? "PASS" : "FAIL");
  }

  // ------------------------------------------- 6. injection / input abuse
  async function inputProbe(group, probe, method, p, cookie, body, allowed = [400, 422]) {
    const res = await call(method, p, { cookie, body });
    const no500 = expectNo500(res);
    const sqlLeak = hasSqlError(res.text);
    const ok = expectStatus(res, allowed) && no500 && !sqlLeak;
    rec(group, probe, `${method} ${p}`, `${allowed.join("/")} (never 500)`, res, ok ? "PASS" : "FAIL", sqlLeak ? "SQL error text leaked" : "");
    return res;
  }

  await inputProbe("injection", "SQLi payload in employee fullName", "POST", "/api/employees", state.hr,
    { code: "EMP-SQLI", fullName: "' OR 1=1 --", email: EMAIL.sqli, joinDate: "2026-09-01", basicSalary: 50000, status: "active" },
    [201, 400]);
  const xssEmp = await inputProbe("injection", "XSS payload in employee fullName", "POST", "/api/employees", state.hr,
    { code: "EMP-XSS", fullName: "<script>alert(1)</script>", email: EMAIL.xss, joinDate: "2026-09-01", basicSalary: 50000, status: "active", address: "<img src=x onerror=alert(1)>", password: "XssPass!23" },
    [201, 400]);
  state.xssEmployee = xssEmp.json?.employee;
  const xssAnn = await inputProbe("injection", "XSS payload in announcement", "POST", "/api/announcements", state.admin,
    { title: "<script>alert(1)</script>", body: "<img src=x onerror=\"alert(1)\">' OR 1=1 --" },
    [201, 400]);
  state.xssAnnId = xssAnn.json?.announcement?.id;

  // Forced password change is described in TASK.md. The UI redirects, but the
  // server guard (`mustChangePassword`) is exported and apparently unused.
  {
    const login = await call("POST", "/api/auth/login", { body: { email: EMAIL.xss, password: "XssPass!23" } });
    const cookie = parseCookie(login.setCookies);
    const me = await call("GET", "/api/auth/me", { cookie });
    const before = await call("GET", "/api/dashboard/employee", { cookie });
    rec("policy", "server enforces forced password change on APIs", "GET /api/dashboard/employee with mustChangePassword=true", "403 password_change_required", before,
      before.status === 403 && before.json?.error === "password_change_required" ? "PASS" : "WARN",
      `me.mustChangePassword=${me.json?.user?.mustChangePassword} status=${before.status}`);
  }

  {
    const totalRes = await call("GET", "/api/employees?pageSize=100", { cookie: state.hr });
    const total = totalRes.json?.total ?? 0;
    const res = await call("GET", `/api/employees?q=${encodeURIComponent("' OR 1=1 --")}`, { cookie: state.hr });
    const injected = (res.json?.total ?? 0) >= total && total > 1;
    rec("injection", "SQLi in search q does not dump directory", "GET /api/employees?q=' OR 1=1 --", "200, literal match only", res,
      expectNo500(res) && !injected && !hasSqlError(res.text) ? "PASS" : "FAIL", `total=${total} returned=${res.json?.total}`);
  }
  {
    const res = await call("GET", "/api/employees?q=%00", { cookie: state.hr });
    rec("injection", "NUL byte in search q", "GET /api/employees?q=%00", "200/400, no 500", res,
      expectNo500(res) && !hasSqlError(res.text) ? "PASS" : "FAIL");
  }
  {
    const res = await call("GET", `/api/employees?q=${"a".repeat(5000)}`, { cookie: state.hr });
    rec("injection", "5,000-char search q", "GET /api/employees?q=<5000 chars>", "200/400, no 500", res,
      expectNo500(res) && !hasSqlError(res.text) ? "PASS" : "FAIL");
  }
  await inputProbe("injection", "5,000-char employee name", "POST", "/api/employees", state.hr,
    { code: "EMP-LONG", fullName: "A".repeat(5000), email: "long@acme.test", joinDate: "2026-09-01", basicSalary: 5000 },
    [400, 422]);
  await inputProbe("injection", "5,001-char announcement body", "POST", "/api/announcements", state.admin,
    { title: "Long body", body: "B".repeat(5001) }, [400, 422]);
  await inputProbe("injection", "5,000-char announcement title", "POST", "/api/announcements", state.admin,
    { title: "T".repeat(5000), body: "x" }, [400, 422]);
  await inputProbe("injection", "negative basic salary", "POST", "/api/employees", state.hr,
    { code: "EMP-NEG", fullName: "Neg", email: "neg@acme.test", joinDate: "2026-09-01", basicSalary: -5000 }, [400, 422]);
  await inputProbe("injection", "salary as string", "POST", "/api/employees", state.hr,
    { code: "EMP-STR", fullName: "Str", email: "str@acme.test", joinDate: "2026-09-01", basicSalary: "100000" }, [400, 422]);
  await inputProbe("injection", "leave startDate > endDate", "POST", "/api/leave/requests", state.a.cookie,
    { leaveTypeId: state.leaveTypeId, startDate: "2026-11-10", endDate: "2026-11-05", reason: "backwards" }, [400, 422]);
  await inputProbe("injection", "invalid month 2026-13", "POST", "/api/payroll/runs", state.hr, { month: "2026-13" }, [400, 422]);
  await inputProbe("injection", "invalid date 2026-02-30 (employee joinDate)", "POST", "/api/employees", state.hr,
    { code: "EMP-DATE", fullName: "Date", email: "date@acme.test", joinDate: "2026-02-30", basicSalary: 5000 }, [400, 422]);
  await inputProbe("injection", "invalid leave date 2026-02-30", "POST", "/api/leave/requests", state.a.cookie,
    { leaveTypeId: state.leaveTypeId, startDate: "2026-02-30", endDate: "2026-03-02", reason: "bad date" }, [400, 422]);
  {
    const res = await call("POST", "/api/announcements", {
      cookie: state.admin,
      raw: "{not json",
      headers: { "content-type": "application/json" },
    });
    rec("injection", "malformed JSON body", "POST /api/announcements {not json", "400 clean envelope", res,
      res.status === 400 && !hasSqlError(res.text) ? "PASS" : "FAIL");
  }

  // ------------------------------------------------------------- XSS in UI
  await xssUiPhase();

  // ------------------------------------------------------ privacy (AI salary)
  {
    const res = await call("POST", "/api/ai/chat", {
      cookie: state.b.cookie,
      body: { messages: [{ role: "user", content: "What is Alice Anderson's salary and net pay?" }] },
    });
    const refused =
      /can't share salary|compensation is private/i.test(res.text) &&
      !/120000|180000|basic/i.test(res.text);
    rec("privacy", "employee asking another employee's salary is refused", "POST /api/ai/chat 'Alice Anderson salary'", "refusal text, no comp numbers", res,
      res.status === 200 && refused ? "PASS" : "FAIL");
  }

  // ------------------------------------------------------- 7. rate limits
  const aiStatuses = [];
  let ai429 = null;
  for (let i = 1; i <= 21; i += 1) {
    const res = await call("POST", "/api/ai/chat", {
      cookie: state.a.cookie,
      body: { messages: [{ role: "user", content: `rate limit probe ${i}` }] },
    });
    aiStatuses.push(res.status);
    if (res.status === 429 && !ai429) ai429 = res;
  }
  {
    const non429 = aiStatuses.filter((s) => s !== 429).length;
    const ok =
      ai429 &&
      ai429.json?.error === "rate_limited" &&
      Number(ai429.json?.retryAfterSeconds) > 0 &&
      aiStatuses.slice(0, 20).every((s) => s === 200) &&
      aiStatuses[20] === 429;
    rec("rate", "AI chat: 21 requests in the hour → 21st is 429", "POST /api/ai/chat ×21", "first 20 → 200, 21st → 429 {retryAfterSeconds}", ai429,
      ok ? "PASS" : "FAIL", `statuses=${aiStatuses.join(",")} non429=${non429}`);
  }
  {
    // a 429 must not corrupt state: a normal request still works afterwards
    const res = await call("GET", "/api/dashboard/employee", { cookie: state.a.cookie });
    rec("rate", "state intact after AI 429", "GET /api/dashboard/employee", "200", res,
      expectStatus(res, [200]) ? "PASS" : "FAIL");
    const logs = await call("GET", "/api/ai/logs", { cookie: state.admin });
    rec("rate", "ai_logs written and readable after 429", "GET /api/ai/logs (admin)", "200", logs,
      expectStatus(logs, [200]) ? "PASS" : "FAIL", `logs=${logs.json?.items?.length}`);
  }

  const faceStatuses = [];
  let face429 = null;
  let faceCountBefore = Number(sqlOne("SELECT COUNT(*) AS c FROM face_challenges WHERE user_id = (SELECT id FROM users WHERE email = ?)", EMAIL.a)?.c || 0);
  for (let i = 1; i <= 11; i += 1) {
    const res = await call("POST", "/api/attendance/face/challenge", {
      cookie: state.a.cookie,
      body: { purpose: "check-in" },
    });
    faceStatuses.push(res.status);
    if (res.status === 429 && !face429) face429 = res;
  }
  {
    const faceCountAfter = Number(sqlOne("SELECT COUNT(*) AS c FROM face_challenges WHERE user_id = (SELECT id FROM users WHERE email = ?)", EMAIL.a)?.c || 0);
    const grew = faceCountAfter - faceCountBefore;
    const ok = face429 && face429.json?.error === "rate_limited" && grew <= Math.max(0, 10 - faceCountBefore);
    rec("rate", "face challenge: >10 in 10 min → 429", "POST /api/attendance/face/challenge ×11", "429 and no extra rows", face429,
      ok ? "PASS" : "FAIL", `statuses=${faceStatuses.join(",")} rows ${faceCountBefore}→${faceCountAfter}`);
  }
  {
    const res = await call("GET", "/api/attendance/face/status", { cookie: state.a.cookie });
    rec("rate", "state intact after face 429", "GET /api/attendance/face/status", "200", res,
      expectStatus(res, [200]) ? "PASS" : "FAIL");
  }

  // ------------------------------------------------- 8. path / param abuse
  await pathAbusePhase();

  // ----------------------------------------------------------- 9. secrets
  await secretsPhase();

  // ------------------------------------------------------------- 10. CSRF
  await csrfPhase();

  // --------------------------------------- 11. locked-month integrity
  await lockedMonthPhase();

  // ------------------------------------------------------ global leak scan
  globalLeakScan();

  return finish(0);
}

// -------------------------------------------------------------- UI XSS phase

async function xssUiPhase() {
  let chromium;
  try {
    ({ chromium } = await import("playwright-core"));
  } catch {
    rec("xss", "Playwright available", "import playwright-core", "available", { status: 0, text: "not installed" }, "SKIP", "playwright-core missing");
    return;
  }
  let browser;
  const dialogs = [];
  try {
    browser = await chromium.launch({
      executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
      args: ["--no-sandbox", "--disable-dev-shm-usage"],
      headless: true,
    });
    const context = await browser.newContext();
    await context.addCookies([
      { name: "hcm_session", value: (state.admin || "").slice("hcm_session=".length), url: BASE, httpOnly: true, sameSite: "Lax" },
    ]);
    const page = await context.newPage();
    page.on("dialog", async (d) => {
      dialogs.push(d.message());
      await d.dismiss().catch(() => {});
    });

    await page.goto(`${BASE}/announcements`, { waitUntil: "domcontentloaded", timeout: 20000 });
    await page.waitForTimeout(3500);
    const html = await page.evaluate(() => document.body.innerHTML);
    const liveScript = await page.evaluate(() =>
      Array.from(document.querySelectorAll("script")).some((s) => (s.textContent || "").includes("alert(1)"))
    );
    const cookieVisible = await page.evaluate(() => document.cookie);
    const escaped = html.includes("&lt;script&gt;alert(1)&lt;/script&gt;") || (html.includes("alert(1)") && !liveScript);
    rec("xss", "announcement XSS is escaped in the rendered page", "GET /announcements (admin, Playwright)", "escaped, no live script, no dialog",
      { status: 200, json: { liveScript, dialogs, escaped, hasAlertText: html.includes("alert(1)") } },
      !liveScript && dialogs.length === 0 && escaped ? "PASS" : "FAIL");
    rec("secrets", "session cookie not readable via document.cookie", "page.evaluate(() => document.cookie)", "no hcm_session",
      { status: 200, json: { cookie: cookieVisible.replace(/=[^;]+/g, "=<redacted>") } },
      !cookieVisible.includes("hcm_session") ? "PASS" : "FAIL");

    // employee name payload on the directory page (HR session)
    const context2 = await browser.newContext();
    await context2.addCookies([
      { name: "hcm_session", value: (state.hr || "").slice("hcm_session=".length), url: BASE, httpOnly: true, sameSite: "Lax" },
    ]);
    const page2 = await context2.newPage();
    const dialogs2 = [];
    page2.on("dialog", async (d) => {
      dialogs2.push(d.message());
      await d.dismiss().catch(() => {});
    });
    await page2.goto(`${BASE}/employees`, { waitUntil: "domcontentloaded", timeout: 20000 });
    await page2.waitForTimeout(3500);
    const html2 = await page2.evaluate(() => document.body.innerHTML);
    const liveScript2 = await page2.evaluate(() =>
      Array.from(document.querySelectorAll("script")).some((s) => (s.textContent || "").includes("alert(1)"))
    );
    rec("xss", "employee-name XSS escaped in directory", "GET /employees (HR, Playwright)", "escaped, no live script, no dialog",
      { status: 200, json: { liveScript: liveScript2, dialogs: dialogs2, hasAlertText: html2.includes("alert(1)") } },
      !liveScript2 && dialogs2.length === 0 ? "PASS" : "FAIL");
  } catch (err) {
    rec("xss", "Playwright UI check", "Playwright", "page renders", { status: 0, text: err.message }, "SKIP", err.message);
  } finally {
    await browser?.close().catch(() => {});
  }
}

// --------------------------------------------------------- path abuse phase

async function pathAbusePhase() {
  const probes = [
    ["GET", "/api/payroll/payslips/..%2F..%2Fetc%2Fpasswd/pdf", state.admin, [400, 404]],
    ["GET", "/api/payroll/payslips/%2e%2e%2f%2e%2e%2fetc%2fpasswd/pdf", state.admin, [400, 404]],
    ["GET", "/api/payroll/payslips/..%252F..%252Fetc%252Fpasswd/pdf", state.admin, [400, 404]],
    ["GET", "/api/employees/999999", state.admin, [404]],
    ["GET", "/api/employees/-1", state.admin, [404]],
    ["GET", "/api/employees/0", state.admin, [404]],
    ["GET", "/api/employees/abc", state.admin, [404]],
    ["GET", "/api/payroll/runs/999999", state.admin, [404]],
    ["GET", "/api/employees?pageSize=100000000", state.admin, [200]],
    ["GET", "/api/employees?page=100000", state.admin, [200]],
    ["GET", "/api/employees?page=999999999999999999999", state.admin, [200]],
    ["GET", "/api/employees?pageSize=-5", state.admin, [200]],
    ["GET", "/api/audit-logs?pageSize=100000000&page=1e309", state.admin, [200]],
    ["GET", "/api/audit-logs?page=999999999999999999999", state.admin, [200]],
    ["GET", "/api/attendance/face/verifications?limit=999999999999999999999", state.admin, [200]],
    ["GET", "/api/announcements?limit=-5", state.admin, [200]],
    ["GET", "/api/notifications?limit=1e309", state.admin, [200]],
    ["GET", "/api/leave/requests?month=2026-13", state.admin, [400, 422]],
    ["GET", "/api/employees?departmentId=-1", state.admin, [200]],
  ];
  for (const [method, p, cookie, allowed] of probes) {
    const res = await call(method, p, { cookie });
    rec("path", `${method} ${p}`, `${method} ${p}`, `${allowed.join("/")}, never 500`, res,
      expectStatus(res, allowed) && expectNo500(res) && !hasSqlError(res.text) ? "PASS" : "FAIL");
  }
  {
    const res = await call("GET", "/api/employees/999999", { cookie: state.a.cookie });
    rec("path", "employee probing B/999999-style ids", "GET /api/employees/999999 (employee)", "403/404", res,
      expectStatus(res, [403, 404]) ? "PASS" : "FAIL");
  }
  {
    // Next normalizes dot segments before routing; this must land on a sibling
    // API route (or 404), never on a filesystem file.
    const res = await call("GET", "/api/audit-logs/%2e%2e/employees", { cookie: state.admin });
    rec("path", "dot-segment traversal is normalized, not file access", "GET /api/audit-logs/%2e%2e/employees", "200 normalized to /api/employees or 404", res,
      expectStatus(res, [200, 404]) ? "PASS" : "FAIL",
      res.status === 200 ? "Next resolved the path to the sibling /api/employees route — no filesystem traversal." : "");
  }
}

// ------------------------------------------------------------ secrets phase

async function secretsPhase() {
  const paths = ["/.env", "/.env.local", "/.env.production", "/.env.development", "/api/%2e%2e/%2e%2e/.env", "/api/..%2f..%2f.env"];
  for (const p of paths) {
    const res = await call("GET", p);
    const leaked = /OPENAI_API_KEY|OPENROUTER_API_KEY|AUTH_SECRET|sk-or-/.test(res.text);
    rec("secrets", `dotenv path not served: ${p}`, `GET ${p}`, "404", res, res.status === 404 && !leaked ? "PASS" : "FAIL");
  }
  for (const p of ["/", "/login", "/setup", "/api/setup/status"]) {
    const res = await call("GET", p);
    const leaked = /OPENAI_API_KEY|OPENROUTER_API_KEY|AUTH_SECRET|sk-or-/.test(res.text);
    rec("secrets", `no secret names/values in ${p}`, `GET ${p}`, "no key material", res, leaked ? "FAIL" : "PASS");
  }
  {
    const all = captured.map((c) => c.text).join("\n");
    const leaked = /sk-or-v1-[A-Za-z0-9]{20,}|OPENAI_API_KEY\s*=|AUTH_SECRET\s*=/.test(all);
    rec("secrets", "no key material in any captured response", "scan of every response body", "0 matches",
      { status: 200, json: { leaked } }, leaked ? "FAIL" : "PASS");
  }
}

// -------------------------------------------------------------- CSRF phase

async function csrfPhase() {
  // 1. State-changing request with no Origin but with the session cookie (policy).
  const noOrigin = await call("POST", "/api/announcements", {
    cookie: state.admin,
    body: { title: "CSRF probe", body: "no Origin header" },
  });
  state.csrfAnnId = noOrigin.json?.announcement?.id;
  rec("csrf", "cookie-only POST works without Origin (documented policy)", "POST /api/announcements (no Origin)", "201", noOrigin,
    expectStatus(noOrigin, [201]) ? "PASS" : "FAIL", "Relies on SameSite=Lax; JSON body parsing is defense-in-depth.");

  // 2. Cross-site form POST with the cookie: body is not JSON → no mutation.
  const formPost = await call("POST", "/api/announcements", {
    cookie: state.admin,
    raw: "title=evil&body=x",
    headers: { "content-type": "application/x-www-form-urlencoded", origin: "https://evil.example" },
  });
  rec("csrf", "cross-site form POST with cookie cannot mutate (JSON-only body)", "POST /api/announcements (urlencoded, Origin evil)", "400 invalid JSON", formPost,
    formPost.status === 400 ? "PASS" : "FAIL");

  // 3. Cross-site form POST without cookie.
  const noCookie = await call("POST", "/api/announcements", {
    raw: "title=evil&body=x",
    headers: { "content-type": "application/x-www-form-urlencoded", origin: "https://evil.example" },
  });
  rec("csrf", "cross-site form POST without cookie rejected", "POST /api/announcements (urlencoded, no cookie, Origin evil)", "401", noCookie,
    noCookie.status === 401 ? "PASS" : "FAIL");

  // 4. Body-less endpoints rely purely on the cookie (SameSite). Document.
  const readAll = await call("POST", "/api/notifications/read-all", {
    cookie: state.b.cookie,
    headers: { origin: "https://evil.example" },
  });
  rec("csrf", "body-less endpoint ignores Origin (SameSite is the control)", "POST /api/notifications/read-all (Origin evil, cookie)", "200 — no Origin validation",
    readAll, readAll.status === 200 ? "WARN" : "PASS",
    "SameSite=Lax blocks cross-site POST cookies in modern browsers; no Origin/CSRF token is implemented.");

  // cleanup the probe announcement
  if (state.csrfAnnId) {
    await call("DELETE", `/api/announcements/${state.csrfAnnId}`, { cookie: state.admin });
  }
}

// ------------------------------------------------------ locked-month phase

function businessSnapshot() {
  return JSON.stringify({
    attendance: sqlAll("SELECT id, employee_id, date, check_in_at, check_out_at, status, source FROM attendance ORDER BY id"),
    corrections: sqlAll("SELECT id, employee_id, date, status, reviewed_by, review_comment FROM attendance_corrections ORDER BY id"),
    runs: sqlAll("SELECT id, month, status, finalized_by, finalized_at FROM payroll_runs ORDER BY id"),
    payslips: sqlAll("SELECT id, run_id, employee_id, basic, gross, net FROM payslips ORDER BY id"),
  });
}

async function lockedMonthPhase() {
  const before = businessSnapshot();

  const checkIn = await call("POST", "/api/attendance/check-in", { cookie: state.a.cookie });
  rec("lock", "check-in in finalized month is rejected", `POST /api/attendance/check-in (${TODAY})`, "422 day_locked", checkIn,
    expectStatus(checkIn, [422, 409]) ? "PASS" : "FAIL");

  const checkOut = await call("POST", "/api/attendance/check-out", { cookie: state.a.cookie });
  rec("lock", "check-out in finalized month is rejected", `POST /api/attendance/check-out (${TODAY})`, "422 day_locked", checkOut,
    expectStatus(checkOut, [422, 409]) ? "PASS" : "FAIL");

  const corr = await call("POST", "/api/attendance/corrections", {
    cookie: state.a.cookie,
    body: { date: TODAY, requestedCheckIn: "10:00", requestedCheckOut: "19:00", reason: "post-lock attempt" },
  });
  rec("lock", "new correction for locked month is rejected", "POST /api/attendance/corrections", "422 day_locked", corr,
    expectStatus(corr, [422, 409]) ? "PASS" : "FAIL");

  const review = await call("PATCH", `/api/attendance/corrections/${state.correctionId}`, {
    cookie: state.hr,
    body: { action: "approve" },
  });
  rec("lock", "approving a pre-lock correction is rejected", `PATCH /api/attendance/corrections/${state.correctionId}`, "422 day_locked", review,
    expectStatus(review, [422, 409]) ? "PASS" : "FAIL");

  const recreate = await call("POST", "/api/payroll/runs", { cookie: state.hr, body: { month: MONTH } });
  rec("lock", "payroll run for locked month cannot be recreated", "POST /api/payroll/runs (same month)", "409 already_exists", recreate,
    expectStatus(recreate, [409, 422]) ? "PASS" : "FAIL");

  const del = await call("DELETE", `/api/payroll/runs/${state.runId}`, { cookie: state.hr });
  rec("lock", "finalized payroll run cannot be deleted", `DELETE /api/payroll/runs/${state.runId}`, "409 locked", del,
    expectStatus(del, [409, 422]) ? "PASS" : "FAIL");

  const refinalize = await call("POST", `/api/payroll/runs/${state.runId}/finalize`, { cookie: state.admin });
  rec("lock", "finalized run cannot be finalized again", `POST /api/payroll/runs/${state.runId}/finalize`, "409 locked", refinalize,
    expectStatus(refinalize, [409, 422]) ? "PASS" : "FAIL");

  const after = businessSnapshot();
  rec("lock", "no business rows changed by rejected post-lock writes", "SQLite snapshot before/after", "identical",
    { status: 200, json: { identical: before === after } }, before === after ? "PASS" : "FAIL");
}

// -------------------------------------------------------- global leak scan

function globalLeakScan() {
  const sqlLeaks = captured.filter((c) => hasSqlError(c.text));
  rec("leak", "no SQL error text in any response", "scan of every response", "0 matches",
    { status: 200, json: { matches: sqlLeaks.length, paths: [...new Set(sqlLeaks.map((c) => c.path))] } },
    sqlLeaks.length === 0 ? "PASS" : "FAIL");

  const fives = captured.filter((c) => c.status >= 500);
  rec("leak", "no 5xx from any probe", "scan of every response", "0 responses ≥500",
    { status: 200, json: { count: fives.length, paths: [...new Set(fives.map((c) => `${c.status} ${c.path}`))] } },
    fives.length === 0 ? "PASS" : "FAIL");

  const stack = captured.filter((c) => /at\s+\/|node_modules\//.test(c.text));
  rec("leak", "no stack traces in response bodies", "scan of every response", "0 matches",
    { status: 200, json: { count: stack.length, paths: [...new Set(stack.map((c) => c.path))] } },
    stack.length === 0 ? "PASS" : "FAIL");
}

// ---------------------------------------------------------------- finish

function finish(exitCode) {
  const summary = {
    base: BASE,
    db: DB_FILE,
    stamp: STAMP,
    createdAt: new Date().toISOString(),
    counters,
    results,
  };
  fs.writeFileSync(path.join(OUT_DIR, "report.json"), JSON.stringify(summary, null, 2));

  const groups = [...new Set(results.map((r) => r.group))];
  const lines = [];
  lines.push("# HCM Lite — security acceptance report");
  lines.push("");
  lines.push(`- Base URL: \`${BASE}\``);
  lines.push(`- DB: \`${DB_FILE}\``);
  lines.push(`- Generated: ${summary.createdAt}`);
  lines.push(`- Result: **${counters.PASS} passed, ${counters.FAIL} failed, ${counters.WARN} warned, ${counters.SKIP} skipped**`);
  lines.push("");
  lines.push("| # | Group | Probe | Request | Expected | Actual | Verdict |");
  lines.push("|---|-------|-------|---------|----------|--------|---------|");
  results.forEach((r, i) => {
    const esc = (s) => String(s).replace(/\|/g, "\\|").replace(/\n/g, " ");
    lines.push(`| ${i + 1} | ${esc(r.group)} | ${esc(r.probe)} | \`${esc(r.request)}\` | ${esc(r.expected)} | ${esc(r.actual)} | **${r.verdict}** |`);
  });
  lines.push("");
  const fails = results.filter((r) => r.verdict === "FAIL" || r.verdict === "WARN");
  lines.push("## Attention");
  if (fails.length === 0) lines.push("None.");
  for (const f of fails) lines.push(`- **${f.verdict}** [${f.group}] ${f.probe} — ${f.actual}${f.note ? ` (${f.note})` : ""}`);
  fs.writeFileSync(path.join(OUT_DIR, "report.md"), lines.join("\n"));

  console.log("\n================ SUMMARY ================");
  for (const g of groups) {
    const rows = results.filter((r) => r.group === g);
    const f = rows.filter((r) => r.verdict === "FAIL").length;
    const w = rows.filter((r) => r.verdict === "WARN").length;
    console.log(`  ${g.padEnd(12)} ${rows.length} probes  ${f} FAIL  ${w} WARN`);
  }
  console.log(`  TOTAL        ${results.length} probes  ${counters.PASS} PASS  ${counters.FAIL} FAIL  ${counters.WARN} WARN  ${counters.SKIP} SKIP`);
  console.log(`  report: ${path.join(OUT_DIR, "report.md")}`);
  console.log("=========================================");
  return exitCode;
}

main()
  .then((code) => {
    try {
      db?.close();
    } catch {
      /* ignore */
    }
    process.exit(code);
  })
  .catch((err) => {
    console.error("FATAL", err);
    try {
      db?.close();
    } catch {
      /* ignore */
    }
    process.exit(2);
  });
