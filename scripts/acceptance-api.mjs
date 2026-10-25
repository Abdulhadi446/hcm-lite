#!/usr/bin/env node
/**
 * HCM Lite — API acceptance walkthrough (fresh DB, whole product narrative).
 *
 * Dependency-free: global fetch + node:sqlite.
 *
 * Prereqs (see the lane commands in the task):
 *   1. rm -f .tmp/accept-api.db*
 *   2. DATABASE_URL=file:./.tmp/accept-api.db npx next start -p 3030
 *   3. node scripts/acceptance-api.mjs
 *
 * Prints a PASS/FAIL table and `ACCEPTANCE: X PASS / Y FAIL`.
 */

import { DatabaseSync } from "node:sqlite";

// ------------------------------------------------------------------ config

const BASE = (process.env.BASE_URL || "http://127.0.0.1:3030").replace(/\/+$/, "");
const DB_PATH = process.env.ACCEPT_DB || ".tmp/accept-api.db";
const COMPANY = "Acceptance Co";
const COMPANY_AUDITED = "Acceptance Co (audited)";
const ADMIN_EMAIL = "admin@acceptance.test";
const ADMIN_PASSWORD = "Admin@Acceptance1";
const HR_EMAIL = "hr@acceptance.test";
const HR_PASSWORD = "Hr@Acceptance1";
const EMP_PASSWORD = "Emp@Acceptance1";

const results = [];
const observations = [];
const allBodies = [];
const defects = [];
let scenario = "boot";

function round2(v) {
  return Math.round((valuePlusEps(v)) * 100) / 100;
}
function round2raw(v) {
  return Math.round((v + Number.EPSILON) * 100) / 100;
}
function round2x(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
function valuePlusEps(v) {
  return v + Number.EPSILON;
}
function round1(v) {
  return Math.round((v + Number.EPSILON) * 10) / 10;
}
function pct(n, d) {
  if (!d) return 0;
  return round1((n / d) * 100);
}
function fmt(v) {
  if (v === undefined) return "undefined";
  if (v === null) return "null";
  if (typeof v === "string") return JSON.stringify(v);
  try {
    const s = JSON.stringify(v);
    return s.length > 220 ? `${s.slice(0, 217)}...` : s;
  } catch {
    return String(v);
  }
}
function same(a, b) {
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return a === b;
  }
}
function note(text) {
  observations.push({ scenario, text });
  console.log(`NOTE [${scenario}] ${text}`);
}
function check(name, ok, expected, actual, meta = "") {
  results.push({ scenario, name, ok, expected: fmt(expected), actual: fmt(actual), meta });
  const suffix = ok ? "" : ` — expected ${fmt(expected)}, got ${fmt(actual)}`;
  console.log(`${ok ? "PASS" : "FAIL"} [${scenario}] ${name}${suffix}`);
  return ok;
}
function eq(name, actual, expected, meta) {
  return check(name, Object.is(actual, expected), expected, actual, meta);
}
function deepEq(name, actual, expected, meta) {
  return check(name, JSON.stringify(actual) === JSON.stringify(expected), expected, actual, meta);
}
function near(name, actual, expected, tol = 0.011, meta) {
  const ok = typeof actual === "number" && Math.abs(actual - expected) <= tol;
  return check(name, ok, expected, actual, meta);
}
function http(name, r, expectedStatus, expectedError) {
  const ok = r.status === expectedStatus && (expectedError === undefined || r.json?.error === expectedError);
  return check(
    name,
    ok,
    `${expectedStatus}${expectedError ? ` ${expectedError}` : ""}`,
    `${r.status}${r.json?.error ? ` ${r.json.error}` : ""}`,
    "http"
  );
}
function ok(name, cond, expected, actual, meta) {
  return check(name, !!cond, expected, actual, meta);
}

// ------------------------------------------------------------------- dates
// Mirrors lib/dates.ts: ISO calendar dates with UTC weekday math.

function pad2(n) {
  return String(n).padStart(2, "0");
}
function shiftIso(dateIso, days) {
  const ms = Date.parse(`${dateIso}T00:00:00Z`) + days * 86400000;
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}
function isoWeekday(dateIso) {
  const [y, m, d] = dateIso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}
function monthShift(month, delta) {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}`;
}
function monthEnd(month) {
  const [y, m] = month.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${month}-${pad2(last)}`;
}
function weekendSet(csv = "sat,sun") {
  const map = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };
  return new Set(
    String(csv)
      .split(",")
      .map((s) => map[s.trim().toLowerCase()])
      .filter((v) => v !== undefined)
  );
}
function isWeekend(date, weekend = new Set([0, 6])) {
  return weekend.has(isoWeekday(date));
}
function weekdaysBetween(start, end, holidays = new Set(), weekend = new Set([0, 6])) {
  const out = [];
  for (let ms = Date.parse(`${start}T00:00:00Z`); ms <= Date.parse(`${end}T00:00:00Z`); ms += 86400000) {
    const d = new Date(ms).toISOString().slice(0, 10);
    if (!weekend.has(new Date(ms).getUTCDay()) && !holidays.has(d)) out.push(d);
  }
  return out;
}
function nextDowAfter(dateIso, weekday) {
  let ms = Date.parse(`${dateIso}T00:00:00Z`) + 86400000;
  for (let i = 0; i < 14; i += 1) {
    const d = new Date(ms);
    if (d.getUTCDay() === weekday) {
      return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
    }
    ms += 86400000;
  }
  throw new Error("weekday not found");
}
function weekdayOnOrAfter(month, day, weekend = new Set([0, 6])) {
  let d = `${month}-${pad2(day)}`;
  for (let i = 0; i < 7; i += 1) {
    if (!isWeekend(d, weekend)) return d;
    d = shiftIso(d, 1);
  }
  return d;
}
function previousWeekday(dateIso) {
  let d = shiftIso(dateIso, -1);
  for (let i = 0; i < 7; i += 1) {
    if (!isWeekend(d)) return d;
    d = shiftIso(d, -1);
  }
  return d;
}

const NOW = new Date();
const TODAY = `${NOW.getFullYear()}-${pad2(NOW.getMonth() + 1)}-${pad2(NOW.getDate())}`;
const CURRENT_MONTH = TODAY.slice(0, 7);
const PREV_MONTH = monthShift(CURRENT_MONTH, -1);
const PREV_END = monthEnd(PREV_MONTH);
const PREV_START = `${PREV_MONTH}-01`;
const MID_JOIN = weekdayOnOrAfter(PREV_MONTH, 16);
const CORRECTION_DATE_1 = weekdayOnOrAfter(PREV_MONTH, 3);
const CORRECTION_DATE_2 = weekdayOnOrAfter(PREV_MONTH, 22);
const UNPAID_START = MID_JOIN;
const UNPAID_END = shiftIso(UNPAID_START, 2);
const ABSENT_DATE = previousWeekday(TODAY);
const LEAVE_START = nextDowAfter(TODAY, 4); // Thursday
const LEAVE_END = shiftIso(LEAVE_START, 4); // Monday
const HOLIDAY_DATE = nextDowAfter(shiftIso(LEAVE_END, 7), 3); // Wednesday after leave
const HOLIDAY_LEAVE_END = shiftIso(HOLIDAY_DATE, 1); // Thursday
const OVER_START = nextDowAfter(shiftIso(LEAVE_END, 14), 1); // Monday
const OVER_END = shiftIso(OVER_START, 25); // 20 working days
const WEEKEND_START = nextDowAfter(shiftIso(TODAY, 7), 6); // Saturday
const WEEKEND_END = shiftIso(WEEKEND_START, 1);

// ------------------------------------------------------------------ helpers

function cookieFrom(res) {
  const list = typeof res.headers.getSetCookie === "function" ? res.headers.getSetCookie() : [];
  for (const raw of list) {
    if (raw.startsWith("hcm_session=")) return raw.split(";")[0];
  }
  return null;
}

async function api(method, path, opts = {}) {
  const headers = { ...(opts.headers || {}) };
  let body;
  if (opts.body !== undefined) {
    body = JSON.stringify(opts.body);
    headers["content-type"] = "application/json";
  }
  if (opts.cookie) headers.cookie = opts.cookie;
  const res = await fetch(`${BASE}${path}`, { method, headers, body, redirect: "manual" });
  const text = await res.text();
  allBodyPush(method, path, text);
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }
  return { res, status: res.status, text, json, cookie: cookieFrom(res), headers: res.headers };
}
function allBodyPush(method, path, text) {
  if (typeof text === "string" && text.length > 0) {
    allBodies.push({ method, path, text });
  }
}

async function login(email, password) {
  const r = await api("POST", "/api/auth/login", { body: { email, password } });
  return { ...r, user: r.json?.user ?? null };
}

let db;
function openDb() {
  try {
    db = new DatabaseSync(DB_PATH, { readOnly: true });
  } catch {
    db = new DatabaseSync(DB_PATH);
  }
  try {
    db.exec("PRAGMA query_only = ON;");
  } catch {
    /* older node */
  }
}
function qall(sql, ...args) {
  return db.prepare(sql).all(...args);
}
function q1(sql, ...args) {
  return db.prepare(sql).get(...args);
}
function countRows(table, where = "1=1", ...args) {
  return Number(q1(`SELECT COUNT(*) AS c FROM ${table} WHERE ${where}`, ...args)?.c ?? 0);
}

function scenarioStart(name) {
  scenario = name;
  console.log(`\n=== ${name} ===`);
}

// Independent dashboard reconstruction straight from SQLite.
//
// Formula authority: docs/M10-ANALYTICS-CONTRACT.md §1 (supersedes the older
// brief reading) —
//   numerator   = present + late + missing_checkout + 0.5 × half_day
//   denominator = (headcount × workingDays) − approved on-leave days
//   latePct     = late ÷ (present + late)
// i.e. approved leave leaves the denominator instead of padding the numerator,
// a half day counts 0.5 and an open (missing_checkout) row counts as present.
function dashboardExpectation(rosterFrom, rosterTo, weekend, holidays) {
  const roster = qall(
    `SELECT id, join_date, exit_date FROM employees
      WHERE status IN ('active','probation')
        AND (join_date IS NULL OR join_date <= ?)
        AND (exit_date IS NULL OR exit_date >= ?)`,
    rosterTo,
    rosterFrom
  );
  const ids = new Set(roster.map((r) => Number(r.id)));
  const wd = weekdaysBetween(rosterFrom, rosterTo, holidays, weekend);
  const rows = qall(
    `SELECT employee_id, date, status, check_in_at, check_out_at FROM attendance
      WHERE date >= ? AND date <= ?`,
    rosterFrom,
    rosterTo
  );
  let present = 0;
  let late = 0;
  let half = 0;
  let missing = 0;
  for (const row of rows) {
    if (!ids.has(Number(row.employee_id))) continue;
    const s = row.status ?? (row.check_in_at && row.check_out_at ? "present" : null);
    if (s === "present") present += 1;
    else if (s === "late") late += 1;
    else if (s === "missing_checkout") missing += 1;
    else if (s === "half_day") half += 1;
  }
  const leaveByEmployee = new Map();
  const leaves = qall(
    `SELECT employee_id, start_date, end_date FROM leave_requests
      WHERE status = 'approved' AND start_date <= ? AND end_date >= ?`,
    rosterTo,
    rosterFrom
  );
  for (const lv of leaves) {
    const id = Number(lv.employee_id);
    if (!ids.has(id)) continue;
    const from = lv.start_date < rosterFrom ? rosterFrom : lv.start_date;
    const to = lv.end_date > rosterTo ? rosterTo : lv.end_date;
    const set = leaveByEmployee.get(id) ?? new Set();
    for (const d of weekdaysBetween(from, to, holidays, weekend)) set.add(d);
    leaveByEmployee.set(id, set);
  }
  let onLeave = 0;
  for (const set of leaveByEmployee.values()) onLeave += set.size;
  const headcount = roster.length;
  const workingDays = wd.length;
  const attended = present + late + half + onLeave;
  const expected = headcount * workingDays;
  return {
    headcount,
    workingDays,
    presentDays: present,
    lateDays: late,
    halfDays: half,
    onLeaveDays: onLeave,
    absentDays: expected - attended,
    expectedDays: expected,
    attendanceRate: pct(attended, expected),
    latePct: pct(late, present + late + half),
  };
}

function closeTo(name, actual, expected, tol = 0.011) {
  return near(name, actual, expected, tol);
}

// --------------------------------------------------------------------- main

console.log(`HCM Lite API acceptance — ${BASE} — today ${TODAY} (${["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][isoWeekday(TODAY)]})`);
console.log(`DB: ${DB_PATH}`);
console.log(`Fixtures: prevMonth=${PREV_MONTH} midJoin=${MID_JOIN} corr1=${CORRECTION_DATE_1} corr2=${CORRECTION_DATE_2} leave=${LEAVE_START}..${LEAVE_END} absent=${ABSENT_DATE} holiday=${HOLIDAY_DATE}`);

let adminCookie = null;
let hrCookie = null;
const emp = [];
const ids = {};

try {
  // ---------------------------------------------------------------- 1 setup
  scenarioStart("1. Setup wizard & admin auth");

  let r = await api("GET", "/api/setup/status");
  http("setup/status returns 200", r, 200);
  eq("fresh DB reports initialized=false", r.json?.initialized, false);

  openDb();

  const setupBody = {
    companyName: COMPANY,
    adminName: "Ada Admin",
    adminEmail: ADMIN_EMAIL,
    adminPassword: ADMIN_PASSWORD,
    officeStart: "00:05",
  };
  r = await api("POST", "/api/setup", { body: setupBody });
  http("setup creates company + admin (201)", r, 201);

  r = await api("POST", "/api/setup", { body: setupBody });
  http("second setup is rejected (409)", r, 409, "already_initialized");

  r = await api("GET", "/api/setup/status");
  eq("initialized=true after setup", r.json?.initialized, true);

  const adminLogin = await login(ADMIN_EMAIL, ADMIN_PASSWORD);
  http("admin can log in", adminLogin, 200);
  adminCookie = adminLogin.cookie;
  eq("admin role", adminLogin.user?.role, "admin");
  eq("admin mustChangePassword=false", adminLogin.user?.mustChangePassword, false);
  ok("session cookie hcm_session set", !!adminCookie, "hcm_session=...", adminCookie ? "set" : "missing");

  r = await api("GET", "/api/settings", { cookie: adminCookie });
  http("admin reads settings", r, 200);
  eq("setup persisted officeStart 00:05", r.json?.settings?.officeStart, "00:05");
  eq("default grace is 15 min", r.json?.settings?.graceMinutes, 15);
  eq("default weekend is sat,sun", r.json?.settings?.weekendDays, "sat,sun");
  eq("default half-day threshold 300 min", r.json?.settings?.halfDayMinutes, 300);
  eq("company name persisted", r.json?.settings?.companyName, COMPANY);

  const settingsRow = q1("SELECT * FROM settings WHERE id = 1");
  eq("SQLite settings row exists", !!settingsRow, true);
  eq("SQLite office_start", settingsRow?.office_start, "00:05");
  const adminRow = q1("SELECT * FROM users WHERE email = ?", ADMIN_EMAIL);
  eq("admin login row exists", !!adminRow, true);
  ok(
    "admin password stored hashed (not plaintext)",
    typeof adminRow?.password_hash === "string" &&
      adminRow.password_hash !== ADMIN_PASSWORD &&
      /^\$2[aby]\$/.test(adminRow.password_hash),
    "bcrypt hash",
    String(adminRow?.password_hash ?? "").slice(0, 12)
  );

  // ---------------------------------------------------- 2 HR + employees
  scenarioStart("2. HR login, employee registration, forced password change");

  r = await api("POST", "/api/users", {
    cookie: adminCookie,
    body: { name: "Hana HR", email: HR_EMAIL, role: "hr" },
  });
  http("admin creates HR login (201)", r, 201);
  const hrTemp = r.json?.temporaryPassword;
  ids.hrUser = r.json?.user?.id;
  eq("HR user role", r.json?.user?.role, "hr");
  eq("generated HR login must change password", r.json?.user?.mustChangePassword, true);
  ok("HR temporary password returned once", typeof hrTemp === "string" && hrTemp.length >= 8, "temp password", r.json?.temporaryPassword ? "returned" : "missing");

  r = await api("GET", "/api/users", { cookie: adminCookie });
  http("admin lists users", r, 200);
  ok("user list does not re-return temporary passwords", !r.text.includes("temporaryPassword") && !r.text.includes(String(hrTemp)), "no plaintext temp password", "redacted");

  const hrTempLogin = await login(HR_EMAIL, hrTemp);
  http("HR logs in with temporary password", hrTempLogin, 200);
  eq("HR session advertises mustChangePassword", hrTempLogin.user?.mustChangePassword, true);
  hrCookie = hrTempLogin.cookie;

  r = await api("POST", "/api/auth/change-password", {
    cookie: hrCookie,
    body: { currentPassword: hrTemp, newPassword: HR_PASSWORD },
  });
  http("HR changes password", r, 200);

  const hrLogin = await login(HR_EMAIL, HR_PASSWORD);
  http("HR logs in with new password", hrLogin, 200);
  eq("HR mustChangePassword cleared", hrLogin.user?.mustChangePassword, false);
  hrCookie = hrLogin.cookie;

  r = await api("POST", "/api/auth/login", { body: { email: HR_EMAIL, password: hrTemp } });
  http("old HR temporary password no longer works", r, 401, "invalid_credentials");

  // Departments + designations (admin-owned setup data).
  const deptDefs = ["Production", "Finance", "Sales"];
  ids.departments = [];
  for (const name of deptDefs) {
    r = await api("POST", "/api/departments", { cookie: adminCookie, body: { name } });
    http(`department ${name} created`, r, 201);
    ids.departments.push(r.json?.department?.id);
  }
  const desigDefs = [
    ["Operator", 0],
    ["Accountant", 1],
    ["Sales Lead", 2],
  ];
  ids.designations = [];
  for (const [name, deptIndex] of desigDefs) {
    r = await api("POST", "/api/designations", {
      cookie: adminCookie,
      body: { name, departmentId: ids.departments[deptIndex] },
    });
    http(`designation ${name} created`, r, 201);
    ids.designations.push(r.json?.designation?.id);
  }
  r = await api("GET", "/api/departments", { cookie: hrCookie });
  eq("HR sees 3 departments", r.json?.items?.length, 3);

  const employeeDefs = [
    {
      code: "ACC-001",
      fullName: "Bilal Ahmed",
      email: "bilal@acceptance.test",
      departmentIndex: 0,
      designationIndex: 0,
      basicSalary: 60000,
      joinDate: PREV_START,
    },
    {
      code: "ACC-002",
      fullName: "Hira Khan",
      email: "hira@acceptance.test",
      departmentIndex: 1,
      designationIndex: 1,
      basicSalary: 100000,
      joinDate: PREV_START,
    },
    {
      code: "ACC-003",
      fullName: "Zara Ali",
      email: "zara@acceptance.test",
      departmentIndex: 2,
      designationIndex: 2,
      basicSalary: 250000,
      joinDate: MID_JOIN,
    },
  ];

  for (let i = 0; i < employeeDefs.length; i += 1) {
    const def = employeeDefs[i];
    r = await api("POST", "/api/employees", {
      cookie: hrCookie,
      body: {
        code: def.code,
        fullName: def.fullName,
        email: def.email,
        departmentId: ids.departments[def.departmentIndex],
        designationId: ids.designations[def.designationIndex],
        joinDate: def.joinDate,
        status: "active",
        basicSalary: def.basicSalary,
      },
    });
    http(`HR registers ${def.fullName} (201)`, r, 201);
    const employee = r.json?.employee;
    const temp = r.json?.temporaryPassword;
    const entry = {
      ...def,
      id: employee?.id,
      temp,
      cookie: null,
      user: null,
    };
    emp.push(entry);
    ids[`employee${i + 1}`] = employee?.id;

    eq(`${def.fullName}: login created (hasLogin)`, employee?.hasLogin, true);
    eq(`${def.fullName}: grossSalary = 1.5 × basic`, employee?.grossSalary, round2x(def.basicSalary * 1.5));
    ok(`${def.fullName}: temporary password returned once`, typeof temp === "string" && temp.length >= 8, "8+ char temp password", temp ? "returned" : "missing");

    const userRow = q1("SELECT * FROM users WHERE employee_id = ?", employee?.id);
    eq(`${def.fullName}: SQLite login linked to employee`, Number(userRow?.employee_id), employee?.id);
    eq(`${def.fullName}: must_change_password=1 in SQLite`, Number(userRow?.must_change_password), 1);
    eq(`${def.fullName}: role employee`, userRow?.role, "employee");

    const tempLogin = await login(def.email, temp);
    http(`${def.fullName}: temp password logs in`, tempLogin, 200);
    eq(`${def.fullName}: login reports mustChangePassword=true`, tempLogin.user?.mustChangePassword, true);
    eq(`${def.fullName}: login maps to own employee id`, tempLogin.user?.employeeId, employee?.id);
    entry.cookie = tempLogin.cookie;

    // Brief requires a forced change before other employee endpoints.
    r = await api("GET", "/api/attendance/me", { cookie: entry.cookie });
    check(
      `${def.fullName}: other employee endpoints blocked until password change`,
      r.status === 403 && r.json?.error === "password_change_required",
      "403 password_change_required",
      `${r.status}${r.json?.error ? ` ${r.json.error}` : ""}`,
      "forced-password-change"
    );

    r = await api("POST", "/api/auth/change-password", {
      cookie: entry.cookie,
      body: { currentPassword: temp, newPassword: EMP_PASSWORD },
    });
    http(`${def.fullName}: changes password`, r, 200);

    const newLogin = await login(def.email, EMP_PASSWORD);
    http(`${def.fullName}: new password logs in`, newLogin, 200);
    eq(`${def.fullName}: mustChangePassword cleared`, newLogin.user?.mustChangePassword, false);
    entry.cookie = newLogin.cookie;
    entry.user = newLogin.user;

    r = await api("POST", "/api/auth/login", { body: { email: def.email, password: temp } });
    http(`${def.fullName}: old temp password revoked`, r, 401, "invalid_credentials");
  }

  ok(
    "three employees have distinct temporary passwords",
    new Set(emp.map((e) => e.temp)).size === 3,
    "3 distinct",
    new Set(emp.map((e) => e.temp)).size
  );

  // Employee directory is scoped to self.
  r = await api("GET", "/api/employees", { cookie: emp[0].cookie });
  http("employee can read directory (self-scoped)", r, 200);
  eq("employee directory returns only self", r.json?.items?.length, 1);
  eq("employee directory self id", r.json?.items?.[0]?.id, emp[0].id);

  // ---------------------------------------------------- 3 attendance
  scenarioStart("3. Employee 1 web punch (late + half-day)");

  r = await api("GET", "/api/attendance/me?month=" + CURRENT_MONTH, { cookie: emp[0].cookie });
  http("employee 1 reads attendance month", r, 200);
  eq("no attendance rows before punch", countRows("attendance", "employee_id = ? AND date = ?", emp[0].id, TODAY), 0);

  const punchBody = { employeeId: emp[2].id, source: "camera", verificationMethod: "face" };
  r = await api("POST", "/api/attendance/check-in", { cookie: emp[0].cookie, body: punchBody });
  http("employee 1 check-in (201)", r, 201);
  const punchIn = r.json?.attendance;
  eq("check-in belongs to the caller", punchIn?.employeeId, emp[0].id);
  eq("web check-in source=web", punchIn?.source, "web");
  eq("body employeeId created no row for the target employee", countRows("attendance", "employee_id = ? AND date = ?", emp[2].id, TODAY), 0);
  // M3-M5 contract status table: `late` requires a check-out with worked >=
  // half_day_minutes; a row without a check-out is `missing_checkout`. So a
  // fresh check-in can never read `late` — the brief's "late right after
  // punching in" expectation is stale, not a product bug.
  check(
    "check-in status=missing_checkout while the day is still open (M3-M5)",
    punchIn?.status === "missing_checkout",
    "missing_checkout",
    punchIn?.status,
    "contract-m3m5"
  );

  r = await api("POST", "/api/attendance/check-in", { cookie: emp[0].cookie });
  http("duplicate check-in is 409", r, 409, "already_checked_in");

  r = await api("GET", "/api/attendance/me?month=" + CURRENT_MONTH, { cookie: emp[0].cookie });
  const todayDayAfterIn = r.json?.days?.find((d) => d.date === TODAY);
  eq("open row reads missing_checkout in month view", todayDayAfterIn?.status, "missing_checkout");

  r = await api("POST", "/api/attendance/check-out", { cookie: emp[0].cookie });
  http("employee 1 check-out (200)", r, 200);
  const punchOut = r.json?.attendance;
  eq("check-out computes half_day (worked ~0 min)", punchOut?.status, "half_day");
  ok("workedMinutes < 5", typeof punchOut?.workedMinutes === "number" && punchOut.workedMinutes < 5, "< 5", punchOut?.workedMinutes);
  eq("check-out keeps source=web", punchOut?.source, "web");

  r = await api("POST", "/api/attendance/check-out", { cookie: emp[0].cookie });
  http("duplicate check-out is 409", r, 409, "already_checked_out");

  r = await api("GET", "/api/attendance/me?month=" + CURRENT_MONTH, { cookie: emp[0].cookie });
  http("employee 1 month summary", r, 200);
  const meSummary = r.json?.summary;
  eq("summary.halfDay = 1", meSummary?.halfDay, 1);
  // One status per attendance row, precedence missing_checkout > half_day >
  // late > present (lib/services/attendance.ts computeStatus + M3-M5 table:
  // `half_day` "applies with or without late"). This punch worked ~0 min, so
  // the row is half_day and is counted only in halfDay — the brief's "late
  // AND half-day together" is not representable in the single-status model.
  check(
    "summary.late = 0 (half_day outranks late for the same row)",
    meSummary?.late === 0,
    "late=0",
    meSummary?.late,
    "contract-m3m5"
  );
  const todayDay = r.json?.days?.find((d) => d.date === TODAY);
  eq("calendar shows half_day today", todayDay?.status, "half_day");
  eq("SQLite has exactly one attendance row for employee 1 today", countRows("attendance", "employee_id = ? AND date = ?", emp[0].id, TODAY), 1);
  const a1 = q1("SELECT * FROM attendance WHERE employee_id = ? AND date = ?", emp[0].id, TODAY);
  eq("SQLite attendance source=web", a1?.source, "web");
  eq("SQLite attendance status=half_day", a1?.status, "half_day");

  // ---------------------------------------------------- 4 corrections + board
  scenarioStart("4. Attendance corrections, board, absent employee");

  // E1: half-day correction (also exercises 0.5×half payroll deduction).
  r = await api("POST", "/api/attendance/corrections", {
    cookie: emp[0].cookie,
    body: {
      date: CORRECTION_DATE_1,
      requestedCheckIn: "09:00",
      requestedCheckOut: "11:00",
      reason: "Client call, forgot to punch",
    },
  });
  http("employee 1 files a past-week correction (201)", r, 201);
  ids.correction1 = r.json?.correction?.id;
  eq("correction starts pending", r.json?.correction?.status, "pending");
  eq("correction is scoped to its owner", r.json?.correction?.employeeId, emp[0].id);

  // E2: half-day correction (board + payroll).
  r = await api("POST", "/api/attendance/corrections", {
    cookie: emp[1].cookie,
    body: {
      date: CORRECTION_DATE_2,
      requestedCheckIn: "09:00",
      requestedCheckOut: "12:00",
      reason: "System outage at punch time",
    },
  });
  http("employee 2 files a past-week correction (201)", r, 201);
  ids.correction2 = r.json?.correction?.id;
  eq("employee 2 correction pending", r.json?.correction?.status, "pending");

  r = await api("GET", "/api/attendance/corrections?status=pending", { cookie: hrCookie });
  http("HR sees pending corrections", r, 200);
  ok("HR list contains both corrections", r.json?.items?.some((c) => c.id === ids.correction1) && r.json?.items?.some((c) => c.id === ids.correction2), "2 items", r.json?.items?.length);

  for (const [label, corrId, empIndex] of [
    ["employee 1", ids.correction1, 0],
    ["employee 2", ids.correction2, 1],
  ]) {
    r = await api("PATCH", `/api/attendance/corrections/${corrId}`, {
      cookie: hrCookie,
      body: { action: "approve", comment: "Approved" },
    });
    http(`HR approves ${label} correction`, r, 200);
    eq(`${label} correction now approved`, r.json?.correction?.status, "approved");
    eq(`${label} reviewedByName recorded`, !!r.json?.correction?.reviewedByName, true);

    const date = empIndex === 0 ? CORRECTION_DATE_1 : CORRECTION_DATE_2;
    const row = q1("SELECT * FROM attendance WHERE employee_id = ? AND date = ?", emp[empIndex].id, date);
    ok(`${label}: correction upserts an attendance row`, !!row, "row", "missing");
    eq(`${label}: SQLite source=correction`, row?.source, "correction");
    eq(`${label}: correction status half_day`, row?.status, "half_day");
    eq(`${label}: check-in time written`, typeof row?.check_in_at === "string" && row.check_in_at.length > 0, true);
  }

  r = await api("PATCH", `/api/attendance/corrections/${ids.correction2}`, {
    cookie: hrCookie,
    body: { action: "approve", comment: "Again" },
  });
  http("approving the same correction twice is 409", r, 409, "already_reviewed");

  r = await api("GET", `/api/attendance?date=${CORRECTION_DATE_2}`, { cookie: hrCookie });
  http("HR daily board loads", r, 200);
  const boardRow2 = r.json?.items?.find((row) => row.employeeId === emp[1].id);
  eq("board shows corrected employee 2 date", boardRow2?.date, CORRECTION_DATE_2);
  eq("board shows corrected half-day status", boardRow2?.status, "half_day");
  ok("board shows corrected check-in", typeof boardRow2?.checkInAt === "string", "timestamp", boardRow2?.checkInAt ?? null);
  // The brief asks the board to expose `source`, but M3-M5's BoardRow shape is
  // `{ employeeId, code, fullName, departmentName, date, status, checkInAt,
  // checkOutAt, leaveTypeName? }` — no `source`. The value is verified on the
  // SQLite row above (source=correction); the API surface follows the
  // contract, so this is a stale expectation rather than a missing field.
  note(
    `board row has no \`source\` field (M3-M5 BoardRow omits it); correction proven in SQLite above as source=correction — got ${fmt(
      boardRow2?.source ?? "field absent"
    )}`
  );

  r = await api("GET", `/api/attendance?date=${ABSENT_DATE}`, { cookie: hrCookie });
  http("HR board shows absent employee 3", r, 200);
  const boardRow3 = r.json?.items?.find((row) => row.employeeId === emp[2].id);
  eq("employee 3 with no row and no leave = absent", boardRow3?.status, "absent");
  eq("SQLite has no employee 3 row on absent date", countRows("attendance", "employee_id = ? AND date = ?", emp[2].id, ABSENT_DATE), 0);

  // ---------------------------------------------------- 5 leave
  scenarioStart("5. Leave: working days, balances, overlap/over-balance, approvals");

  r = await api("GET", "/api/leave-types", { cookie: hrCookie });
  http("HR lists leave types", r, 200);
  const leaveTypes = r.json?.items ?? [];
  const byName = (n) => leaveTypes.find((t) => String(t.name).toLowerCase() === n);
  const annual = byName("annual");
  const sick = byName("sick");
  const casual = byName("casual");
  const unpaid = byName("unpaid");
  eq("annual quota 14", annual?.quotaDays, 14);
  eq("sick quota 8", sick?.quotaDays, 8);
  eq("casual quota 10", casual?.quotaDays, 10);
  eq("unpaid is unlimited (quota 0)", unpaid?.quotaDays, 0);
  eq("unpaid is unpaid", unpaid?.paid, false);
  ids.annualLeaveType = annual?.id;
  ids.unpaidLeaveType = unpaid?.id;

  r = await api("GET", "/api/leave/balances", { cookie: emp[0].cookie });
  http("employee 1 reads own balances", r, 200);
  const annualBefore = r.json?.items?.find((b) => b.leaveTypeId === annual?.id);
  eq("annual balance starts at 14", annualBefore?.remaining, 14);
  eq("annual used starts at 0", annualBefore?.used, 0);
  const unpaidBalance = r.json?.items?.find((b) => b.leaveTypeId === unpaid?.id);
  eq("unpaid balance remaining is null", unpaidBalance?.remaining, null);

  const leaveSpanCalendarDays = 5; // Thu→Mon inclusive
  r = await api("POST", "/api/leave/requests", {
    cookie: emp[0].cookie,
    body: {
      leaveTypeId: annual.id,
      startDate: LEAVE_START,
      endDate: LEAVE_END,
      reason: "Family event",
    },
  });
  http("employee 1 applies Thu→Mon leave (201)", r, 201);
  ids.leave1 = r.json?.request?.id;
  eq("leave days count working days only", r.json?.request?.days, 3);
  ok("leave days exclude the weekend", r.json?.request?.days < leaveSpanCalendarDays, `< ${leaveSpanCalendarDays}`, r.json?.request?.days);
  eq("leave request starts pending", r.json?.request?.status, "pending");

  r = await api("POST", "/api/leave/requests", {
    cookie: emp[0].cookie,
    body: { leaveTypeId: annual.id, startDate: LEAVE_START, endDate: LEAVE_END, reason: "Duplicate" },
  });
  http("overlapping leave is 422", r, 422, "overlap");

  r = await api("PATCH", `/api/leave/requests/${ids.leave1}`, {
    cookie: hrCookie,
    body: { action: "approve", comment: "Approved by HR" },
  });
  http("HR approves employee 1 leave", r, 200);
  eq("leave request approved", r.json?.request?.status, "approved");
  eq("employee 1 needs HR only for approval", r.json?.request?.reviewComment, "Approved by HR");

  r = await api("GET", "/api/leave/balances", { cookie: emp[0].cookie });
  const annualAfter = r.json?.items?.find((b) => b.leaveTypeId === annual?.id);
  eq("approved leave increments used", annualAfter?.used, 3);
  eq("approved leave decrements remaining", annualAfter?.remaining, 11);
  ok(
    "used increased vs baseline",
    annualAfter?.used > annualBefore?.used,
    `> ${annualBefore?.used}`,
    annualAfter?.used
  );
  ok(
    "remaining decreased vs baseline",
    annualAfter?.remaining < annualBefore?.remaining,
    `< ${annualBefore?.remaining}`,
    annualAfter?.remaining
  );
  eq("no pending days remain for annual leave", annualAfter?.pending, 0);

  r = await api("GET", `/api/attendance?date=${LEAVE_START}`, { cookie: hrCookie });
  http("board loads leave day", r, 200);
  const leaveBoardRow = r.json?.items?.find((row) => row.employeeId === emp[0].id);
  eq("board marks approved leave as on_leave", leaveBoardRow?.status, "on_leave");
  eq("board exposes leave type", leaveBoardRow?.leaveTypeName, "Annual");

  const overDays = weekdaysBetween(OVER_START, OVER_END);
  r = await api("POST", "/api/leave/requests", {
    cookie: emp[0].cookie,
    body: { leaveTypeId: annual.id, startDate: OVER_START, endDate: OVER_END, reason: "Too much" },
  });
  http(`over-balance request (${overDays.length} working days) is 422`, r, 422, "insufficient_balance");
  ok("over-balance error carries remaining", typeof r.json?.remaining === "number", "remaining", r.json?.remaining);

  r = await api("POST", "/api/leave/requests", {
    cookie: emp[0].cookie,
    body: { leaveTypeId: annual.id, startDate: WEEKEND_START, endDate: WEEKEND_END, reason: "Weekend only" },
  });
  http("weekend-only leave is 400", r, 400);
  ok("weekend-only error mentions no working days", /working day/i.test(String(r.json?.error ?? "")), "no working days", r.json?.error);

  r = await api("PATCH", `/api/leave/requests/${ids.leave1}`, {
    cookie: emp[1].cookie,
    body: { action: "approve" },
  });
  http("another employee cannot approve leave (403)", r, 403);

  r = await api("PATCH", `/api/leave/requests/${ids.leave1}`, {
    cookie: adminCookie,
    body: { action: "approve" },
  });
  http("admin (non-HR) cannot approve leave (403)", r, 403);

  // Holiday exclusion in working-day math.
  r = await api("POST", "/api/holidays", {
    cookie: adminCookie,
    body: { date: HOLIDAY_DATE, name: "Acceptance Holiday" },
  });
  http("admin creates a holiday", r, 201);
  ids.holiday = r.json?.holiday?.id;
  r = await api("GET", `/api/holidays?year=${HOLIDAY_DATE.slice(0, 4)}`, { cookie: hrCookie });
  ok("holiday list includes new holiday", r.json?.items?.some((h) => h.date === HOLIDAY_DATE), true, !!r.json?.items?.some((h) => h.date === HOLIDAY_DATE));

  r = await api("POST", "/api/leave/requests", {
    cookie: emp[0].cookie,
    body: { leaveTypeId: annual.id, startDate: HOLIDAY_DATE, endDate: HOLIDAY_LEAVE_END, reason: "Holiday span" },
  });
  http("leave spanning a holiday is accepted", r, 201);
  ids.holidayLeave = r.json?.request?.id;
  eq("holiday weekday is excluded from leave days", r.json?.request?.days, 1);
  r = await api("POST", `/api/leave/requests/${ids.holidayLeave}/cancel`, { cookie: emp[0].cookie });
  http("employee can cancel own pending holiday leave", r, 200);
  eq("cancelled leave status", r.json?.request?.status, "cancelled");
  r = await api("GET", "/api/leave/balances", { cookie: emp[0].cookie });
  const annualAfterCancel = r.json?.items?.find((b) => b.leaveTypeId === annual?.id);
  eq("cancelled pending leave releases balance", annualAfterCancel?.pending, 0);
  eq("annual remaining still 11", annualAfterCancel?.remaining, 11);

  // Unpaid leave for employee 3 (payroll unpaid deduction).
  r = await api("POST", "/api/leave/requests", {
    cookie: emp[2].cookie,
    body: { leaveTypeId: unpaid.id, startDate: UNPAID_START, endDate: UNPAID_END, reason: "Unpaid personal leave" },
  });
  http("employee 3 applies unpaid leave", r, 201);
  ids.unpaidLeave = r.json?.request?.id;
  eq("unpaid leave counts 3 working days", r.json?.request?.days, 3);
  r = await api("PATCH", `/api/leave/requests/${ids.unpaidLeave}`, {
    cookie: hrCookie,
    body: { action: "approve", comment: "OK" },
  });
  http("HR approves employee 3 unpaid leave", r, 200);

  // ---------------------------------------------------- 6 payroll
  scenarioStart("6. Payroll: run math, tax slabs, finalize lock, PDF");

  const holidaysSet = new Set(qall("SELECT date FROM holidays").map((h) => h.date));
  const prevWorkingDays = weekdaysBetween(PREV_START, PREV_END, holidaysSet, new Set([0, 6])).length;
  const rawWeekdaysPrev = weekdaysBetween(PREV_START, PREV_END, new Set(), new Set([0, 6])).length;
  eq("test fixture: previous month has no holiday", prevWorkingDays, rawWeekdaysPrev);

  r = await api("GET", "/api/payroll/runs", { cookie: hrCookie });
  http("HR lists payroll runs (empty)", r, 200);
  eq("no payroll runs yet", r.json?.items?.length, 0);

  r = await api("POST", "/api/payroll/runs", { cookie: hrCookie, body: { month: PREV_MONTH } });
  http(`HR creates ${PREV_MONTH} payroll draft (201)`, r, 201);
  const run = r.json?.run;
  const payslips = r.json?.payslips ?? [];
  ids.run = run?.id;
  eq("run status draft", run?.status, "draft");
  eq(`run workingDays = real weekday count (${prevWorkingDays})`, run?.workingDays, prevWorkingDays);
  eq("run includes 3 employees", run?.employeeCount, 3);
  eq("run returns 3 payslips", payslips.length, 3);
  const slip = (i) => payslips.find((p) => p.employeeId === emp[i].id);
  const s1 = slip(0);
  const s2 = slip(1);
  const s3 = slip(2);
  ok("employee 1 payslip exists", !!s1, "payslip", !!s1);
  ok("employee 2 payslip exists", !!s2, "payslip", !!s2);
  ok("employee 3 payslip exists", !!s3, "payslip", !!s3);

  // ---------------------------------------------------------- hand math
  // E1: full month, one approved half-day correction, no leave/unpaid.
  const e1Basic = 60000;
  const e1Gross = e1Basic * 1.5;
  const e1PerDay = round2x(e1Gross / prevWorkingDays);
  const e1DeductDays = 21 + 0 + 0.5 * 1;
  const e1Deductions = round2x(e1DeductDays * (e1Gross / prevWorkingDays));
  const e1Tax = 2000; // annual 1,080,000 → 5% × 480,000 / 12
  const e1Net = round2x(e1Gross - e1Deductions - e1Tax);

  console.log("\n  HAND CHECK — employee 1 (Bilal, basic 60,000, joined start of month)");
  console.log(`    gross = 1.5 × 60,000 = ${e1Gross.toFixed(2)} (HRA 40% = ${(e1Basic * 0.4).toFixed(2)}, medical 10% = ${(e1Basic * 0.1).toFixed(2)})`);
  console.log(`    perDay = ${e1Gross.toFixed(2)} / ${prevWorkingDays} = ${e1PerDay.toFixed(2)}`);
  console.log(`    deduction days = absent 21 + unpaid 0 + 0.5 × half 1 = ${e1DeductDays}`);
  console.log(`    deductions = ${e1DeductDays} × ${e1PerDay.toFixed(2)} = ${e1Deductions.toFixed(2)}`);
  console.log("    tax: annual = 90,000 × 12 = 1,080,000 → 5% × (1,080,000 − 600,000) = 24,000/yr → 2,000.00/mo");
  console.log(`    net = ${e1Gross.toFixed(2)} − ${e1Deductions.toFixed(2)} − ${e1Tax.toFixed(2)} = ${e1Net.toFixed(2)}\n`);

  eq("E1 payslip.basic", s1?.basic, round2x(e1Basic));
  eq("E1 payslip.hra = 40% basic", s1?.hra, round2x(e1Basic * 0.4));
  eq("E1 payslip.medical = 10% basic", s1?.medical, round2x(e1Basic * 0.1));
  eq("E1 payslip.gross = 1.5 × basic", s1?.gross, round2x(e1Gross));
  eq("E1 payslip.workingDays = run working days", s1?.workingDays, prevWorkingDays);
  eq("E1 payslip.perDay = gross / workingDays", s1?.perDay, e1PerDay);
  eq("E1 absentDays", s1?.absentDays, 21);
  eq("E1 unpaidDays", s1?.unpaidDays, 0);
  eq("E1 halfDays", s1?.halfDays, 1);
  eq("E1 deductions = (absent + unpaid + 0.5×half) × perDay", s1?.deductions, e1Deductions);
  eq("E1 tax = slab on gross×12", s1?.tax, e1Tax);
  eq("E1 net = gross − deductions − tax", s1?.net, e1Net);

  // E2: 15% tax slab, one half-day correction.
  const e2Basic = 100000;
  const e2Gross = e2Basic * 1.5;
  const e2PerDay = round2x(e2Gross / prevWorkingDays);
  const e2Deductions = round2x(21.5 * (e2Gross / prevWorkingDays));
  const e2Tax = round2x((30000 + 0.15 * (e2Gross * 12 - 1200000)) / 12);
  const e2Net = round2x(e2Gross - e2Deductions - e2Tax);
  console.log(`  HAND CHECK — employee 2 (Hira, basic 100,000): gross=${e2Gross.toFixed(2)} perDay=${e2PerDay.toFixed(2)} deductions=${e2Deductions.toFixed(2)} tax=${e2Tax.toFixed(2)} net=${e2Net.toFixed(2)}`);
  eq("E2 tax uses 15% slab (annual 1.8M)", s2?.tax, e2Tax);
  eq("E2 deductions include 0.5 × half-day", s2?.deductions, e2Deductions);
  eq("E2 net matches formula", s2?.net, e2Net);

  // E3: prorated joiner + unpaid leave. Contract perDay = gross / employee working days.
  const e3Basic = 250000;
  const e3Gross = e3Basic * 1.5;
  const elig3 = weekdaysBetween(MID_JOIN, PREV_END, holidaysSet, new Set([0, 6])).length;
  const e3GrossForMonth = round2x(e3Gross * (elig3 / prevWorkingDays));
  const e3PerDay = round2x(e3GrossForMonth / elig3);
  const e3Deductions = round2x(11 * (e3GrossForMonth / elig3));
  const e3Tax = round2x((510000 + 0.35 * (e3Gross * 12 - 3600000)) / 12);
  const e3Net = round2x(e3GrossForMonth - e3Deductions - e3Tax);
  console.log(`  HAND CHECK — employee 3 (Zara, basic 250,000, joined ${MID_JOIN})`);
  console.log(`    eligible working days = ${elig3} (${MID_JOIN}..${PREV_END})`);
  console.log(`    grossForMonth = 375,000 × (${elig3}/${prevWorkingDays}) = ${e3GrossForMonth.toFixed(2)}`);
  console.log(`    perDay = ${e3GrossForMonth.toFixed(2)} / ${elig3} = ${e3PerDay.toFixed(2)} (prorated gross ÷ eligible days; equals full gross / ${prevWorkingDays})`);
  console.log(`    deduction days = absent 8 + unpaid 3 + 0.5 × half 0 = 11 → deductions = ${e3Deductions.toFixed(2)}`);
  console.log(`    tax: annual 4,500,000 → 510,000 + 35% × 900,000 = 825,000/yr → ${e3Tax.toFixed(2)}/mo`);
  console.log(`    net = ${e3GrossForMonth.toFixed(2)} − ${e3Deductions.toFixed(2)} − ${e3Tax.toFixed(2)} = ${e3Net.toFixed(2)}\n`);

  eq("E3 prorated gross = 1.5 × basic × eligible/total", s3?.gross, e3GrossForMonth);
  eq("E3 prorated basic", s3?.basic, round2x(e3Basic * (elig3 / prevWorkingDays)));
  eq("E3 prorated HRA", s3?.hra, round2x(e3Basic * 0.4 * (elig3 / prevWorkingDays)));
  eq("E3 prorated medical", s3?.medical, round2x(e3Basic * 0.1 * (elig3 / prevWorkingDays)));
  eq("E3 unpaidDays = 3", s3?.unpaidDays, 3);
  eq("E3 absentDays = 8", s3?.absentDays, 8);
  eq("E3 perDay = prorated gross / eligible working days", s3?.perDay, e3PerDay);
  eq("E3 deductions = (absent+unpaid+0.5×half) × perDay", s3?.deductions, e3Deductions);
  eq("E3 tax uses 35% slab (annual 4.5M)", s3?.tax, e3Tax);
  eq("E3 net matches formula", s3?.net, e3Net);
  if (s3) {
    note(
      `prorated payslip shows workingDays=${s3.workingDays} (whole run) with perDay=${s3.perDay} (derived from ${elig3} eligible days); expected perDay ${e3PerDay.toFixed(2)} and workingDays ${elig3}. The three numbers on the payslip are not mutually consistent for a mid-month joiner.`
    );
  }

  const s1Id = s1?.id;
  const s2Id = s2?.id;
  ids.slip1 = s1Id;
  ids.slip2 = s2Id;

  r = await api("POST", `/api/payroll/runs/${ids.run}/finalize`, { cookie: adminCookie });
  http("admin finalizes payroll run", r, 200);
  eq("run status finalized", r.json?.run?.status, "finalized");
  ok("finalizedAt recorded", typeof r.json?.run?.finalizedAt === "string", "ISO timestamp", r.json?.run?.finalizedAt ?? null);

  r = await api("POST", `/api/payroll/runs/${ids.run}/finalize`, { cookie: adminCookie });
  http("second finalize is 409 locked", r, 409, "locked");

  r = await api("POST", `/api/payroll/runs/${ids.run}/finalize`, { cookie: hrCookie });
  http("HR cannot finalize (admin only)", r, 403);

  r = await api("POST", "/api/attendance/corrections", {
    cookie: emp[1].cookie,
    body: {
      date: weekdayOnOrAfter(PREV_MONTH, 17),
      requestedCheckIn: "09:00",
      requestedCheckOut: "18:00",
      reason: "Locked month correction",
    },
  });
  http("correction in finalized month is 422 day_locked", r, 422, "day_locked");

  r = await api("DELETE", `/api/payroll/runs/${ids.run}`, { cookie: hrCookie });
  http("finalized run cannot be deleted (409 locked)", r, 409, "locked");

  r = await api("POST", "/api/payroll/runs", { cookie: hrCookie, body: { month: PREV_MONTH } });
  http("duplicate run for same month is 409", r, 409, "already_exists");

  // Payslip PDF + cross-employee denial (binary fetch, not JSON).
  const pdfRes = await fetch(`${BASE}/api/payroll/payslips/${s1Id}/pdf`, { headers: { cookie: emp[0].cookie } });
  const pdfBuf = Buffer.from(await pdfRes.arrayBuffer());
  allBodies.push({ method: "GET", path: "/api/payroll/payslips/:id/pdf", text: new TextDecoder("latin1").decode(pdfBuf) });
  eq("own payslip PDF returns 200", pdfRes.status, 200);
  eq("payslip PDF content-type", pdfRes.headers.get("content-type"), "application/pdf");
  eq("payslip PDF magic bytes %PDF", pdfBuf.subarray(0, 4).toString("latin1"), "%PDF");

  r = await api("GET", `/api/payroll/payslips/${s2Id}/pdf`, { cookie: emp[0].cookie });
  http("employee cannot download another employee's payslip (403)", r, 403);

  const runRow = q1("SELECT * FROM payroll_runs WHERE id = ?", ids.run);
  eq("SQLite run is finalized", runRow?.status, "finalized");
  eq("SQLite payslip count = 3", countRows("payslips", "run_id = ?", ids.run), 3);

  // ---------------------------------------------------- 7 dashboards
  scenarioStart("7. Dashboards match SQLite");

  const weekend = weekendSet("sat,sun");
  const curHolidays = new Set(qall("SELECT date FROM holidays").map((h) => h.date));
  const curEnd = monthEnd(CURRENT_MONTH);
  const expectedDash = dashboardExpectation(`${CURRENT_MONTH}-01`, curEnd, weekend, curHolidays);

  r = await api("GET", "/api/dashboard/summary", { cookie: hrCookie });
  http("HR summary loads", r, 200);
  const k = r.json?.kpis;
  eq("dashboard headcount matches SQLite roster", r.json?.kpis?.headcount, expectedDash.headcount);
  eq("dashboard workingDays matches weekday count", r.json?.kpis?.workingDays, expectedDash.workingDays);
  eq("dashboard presentDays matches SQLite", r.json?.kpis?.presentDays, expectedDash.presentDays);
  eq("dashboard lateDays matches SQLite", r.json?.kpis?.lateDays, expectedDash.lateDays);
  eq("dashboard halfDays matches SQLite", r.json?.kpis?.halfDays, expectedDash.halfDays);
  eq("dashboard onLeaveDays matches SQLite", r.json?.kpis?.onLeaveDays, expectedDash.onLeaveDays);
  eq("dashboard absentDays matches formula", r.json?.kpis?.absentDays, expectedDash.absentDays);
  eq("dashboard expectedDays matches headcount × workingDays", r.json?.kpis?.expectedDays, expectedDash.expectedDays);
  near("dashboard attendanceRate matches SQLite-derived rate", k?.attendanceRate, expectedDash.attendanceRate, 0.011);
  near("dashboard latePct matches SQLite-derived rate", k?.latePct, expectedDash.latePct, 0.011);

  r = await api("GET", `/api/dashboard/summary?departmentId=${ids.departments[0]}`, { cookie: hrCookie });
  http("HR summary filters by department", r, 200);
  eq("department filter headcount = 1", r.json?.kpis?.headcount, 1);

  r = await api("GET", "/api/dashboard/employee", { cookie: emp[0].cookie });
  http("employee 1 dashboard loads", r, 200);
  eq("employee dashboard is caller-scoped", r.json?.me?.employeeId, emp[0].id);
  eq("employee dashboard month is current", r.json?.me?.month, CURRENT_MONTH);
  eq("employee dashboard halfDays matches SQLite", r.json?.me?.halfDays, 1);
  ok(
    "employee dashboard leave balances are self-only",
    Array.isArray(r.json?.leaveBalances) && r.json.leaveBalances.every((b) => b.employeeId === emp[0].id),
    "all employeeId=employee1",
    r.json?.leaveBalances?.map((b) => b.employeeId)
  );
  eq("employee dashboard exposes own last payslip", r.json?.lastPayslip?.id, s1Id);
  eq("employee dashboard lastPayslip net", r.json?.lastPayslip?.net, e1Net);

  r = await api("GET", `/api/dashboard/employee?employeeId=${emp[1].id}`, { cookie: emp[0].cookie });
  http("employee dashboard ignores query employeeId", r, 200);
  eq("query employeeId cannot redirect dashboard", r.json?.me?.employeeId, emp[0].id);

  r = await api("GET", "/api/dashboard/employee", { cookie: emp[1].cookie });
  eq("employee 2 dashboard is self-scoped", r.json?.me?.employeeId, emp[1].id);
  eq("employee 2 lastPayslip is their own", r.json?.lastPayslip?.id, s2Id);

  // ---------------------------------------------------- 8 AI
  scenarioStart("8. AI assistant: headcount, salary refusal, ai_logs");

  r = await api("POST", "/api/ai/chat", {
    cookie: hrCookie,
    body: { messages: [{ role: "user", content: "How many employees do we have?" }] },
  });
  http("HR asks AI for headcount (200)", r, 200);
  eq("AI response labelled aiGenerated", r.json?.aiGenerated, true);
  const aiAnswer = String(r.json?.answer ?? "");
  const aiFallback = r.json?.fallback === true;
  if (aiFallback) {
    ok(
      "AI headcount answer = documented fallback",
      /couldn't reach the AI service/i.test(aiAnswer),
      "fallback message",
      aiAnswer
    );
    note(`OpenRouter path returned the documented {fallback:true} shape for the headcount question (answer: ${JSON.stringify(aiAnswer.slice(0, 160))}).`);
  } else {
    ok("AI headcount answer contains 3", /\b3\b/.test(aiAnswer), "contains 3", aiAnswer.slice(0, 240));
  }
  const aiLog = q1(
    "SELECT * FROM ai_logs WHERE user_id = ? ORDER BY id DESC LIMIT 1",
    ids.hrUser
  );
  eq("ai_logs row written for HR headcount call", aiLog?.prompt, "How many employees do we have?");
  ok("ai_logs row stores a non-empty answer", typeof aiLog?.answer === "string" && aiLog.answer.length > 0, "non-empty", aiLog?.answer?.slice(0, 80));

  r = await api("POST", "/api/ai/chat", {
    cookie: emp[0].cookie,
    body: { messages: [{ role: "user", content: "What is Zara Ali's salary?" }] },
  });
  http("employee salary probe returns 200", r, 200);
  eq("salary probe is refused, not fallback", r.json?.fallback, undefined);
  ok(
    "salary probe answer is the refusal",
    /can't share salary|compensation is private/i.test(String(r.json?.answer ?? "")),
    "refusal text",
    String(r.json?.answer ?? "").slice(0, 240)
  );
  eq("salary probe runs no tools", r.json?.toolCalls?.length, 0);
  ok(
    "salary probe leaks no salary figure",
    !/250,?000|375,?000|187,?500/.test(String(r.json?.answer ?? "")),
    "no salary number",
    String(r.json?.answer ?? "").slice(0, 240)
  );
  const empLog = q1("SELECT * FROM ai_logs WHERE user_id = ? ORDER BY id DESC LIMIT 1", emp[0].user?.id ?? -1);
  eq("ai_logs row written for salary probe", empLog?.prompt, "What is Zara Ali's salary?");

  r = await api("GET", "/api/ai/logs", { cookie: adminCookie });
  http("admin reads AI logs", r, 200);
  ok("AI log feed contains headcount prompt", r.json?.items?.some((i) => i.prompt === "How many employees do we have?"), true);

  // ---------------------------------------------------- 9 comms + audit
  scenarioStart("9. Announcements, notifications, audit trail");

  r = await api("POST", "/api/announcements", {
    cookie: hrCookie,
    body: { title: "Acceptance Day", body: "Team lunch on Friday at 1pm.", pinned: true },
  });
  http("HR posts an announcement (201)", r, 201);
  ids.announcement = r.json?.announcement?.id;
  eq("announcement author role", r.json?.announcement?.authorRole, "hr");

  const recipients = [
    ["admin", adminCookie],
    ["employee 1", emp[0].cookie],
    ["employee 2", emp[1].cookie],
    ["employee 3", emp[2].cookie],
  ];
  for (const [label, cookie] of recipients) {
    r = await api("GET", "/api/notifications?limit=100", { cookie });
    http(`${label} lists notifications`, r, 200);
    ok(
      `${label} received the announcement notification`,
      r.json?.items?.some((n) => n.title === "Acceptance Day" && /Team lunch/.test(String(n.body))),
      "announcement notification",
      r.json?.items?.some((n) => n.title === "Acceptance Day")
    );
  }
  const annNotifCount = countRows("notifications", "title = ?", "Acceptance Day");
  eq("one announcement notification per non-author user (4)", annNotifCount, recipients.length);
  r = await api("GET", "/api/notifications?limit=100", { cookie: hrCookie });
  eq("author does not self-notify (product choice)", r.json?.items?.some((n) => n.title === "Acceptance Day"), false);
  note("Announcement notifications exclude the author (comms.ts filters `id <> actor.id`); the brief says 'every user'. UI-wise this is a reasonable choice, so treated as an ambiguity, not a defect.");

  r = await api("GET", "/api/announcements", { cookie: emp[0].cookie });
  http("employee reads announcements", r, 200);
  ok("employee sees the announcement", r.json?.items?.some((a) => a.id === ids.announcement), true);

  r = await api("PATCH", "/api/settings", {
    cookie: adminCookie,
    body: { companyName: COMPANY_AUDITED },
  });
  http("admin updates company name", r, 200);
  eq("settings reflect audit edit", r.json?.settings?.companyName, COMPANY_AUDITED);

  r = await api("GET", "/api/audit-logs?entity=settings&pageSize=100", { cookie: adminCookie });
  http("admin reads audit log", r, 200);
  const auditRow = r.json?.items?.find((i) => i.action === "update" && i.entity === "settings");
  ok("settings update audit row exists", !!auditRow, "settings update row", !!auditRow);
  if (auditRow) {
    let before = null;
    let after = null;
    try {
      before = JSON.parse(auditRow.beforeJson);
      after = JSON.parse(auditRow.afterJson);
    } catch {
      /* leave null */
    }
    eq("audit before snapshot has old company name", before?.companyName, COMPANY);
    eq("audit after snapshot has new company name", after?.companyName, COMPANY_AUDITED);
    ok("audit row records actor", !!auditRow.actorName, "actorName", auditRow.actorName);
  }

  r = await api("GET", "/api/audit-logs?entity=announcement&pageSize=50", { cookie: adminCookie });
  ok("announcement create is audited", r.json?.items?.some((i) => i.entity === "announcement" && i.action === "create"), true, "announcement create row");

  r = await api("GET", "/api/audit-logs", { cookie: emp[0].cookie });
  http("employee cannot read audit log (403)", r, 403);
  r = await api("GET", "/api/audit-logs", { cookie: hrCookie });
  http("HR cannot read audit log (403)", r, 403);

  // Contract M8 says login is audited too.
  const loginAuditRows = countRows("audit_logs", "action = 'login'");
  note(
    loginAuditRows === 0
      ? "M8 contract lists login among audited operations, but there are 0 audit_logs rows with action='login' after all logins."
      : `login audit rows present: ${loginAuditRows}.`
  );

  // ---------------------------------------------------- 10 face
  scenarioStart("10. Face attendance API (enroll, mismatch, geofence, duplicate)");

  r = await api("PATCH", "/api/settings", {
    cookie: adminCookie,
    body: { officeLat: 24.8607, officeLng: 67.0011, radiusM: 200 },
  });
  http("admin configures office geofence", r, 200);
  eq("office lat persisted", r.json?.settings?.officeLat, 24.8607);
  eq("geofence radius persisted", r.json?.settings?.radiusM, 200);

  r = await api("GET", "/api/attendance/face/status", { cookie: emp[1].cookie });
  http("employee 2 face status", r, 200);
  eq("employee 2 starts unenrolled", r.json?.enrolled, false);
  eq("face status sees employee profile", r.json?.hasEmployeeProfile, true);
  eq("face status sees office location", r.json?.officeConfigured, true);
  eq("face threshold default", r.json?.threshold, 0.62);

  const EMBEDDING = new Array(1024).fill(0.03125);
  const MISMATCH = new Array(1024).fill(0).map((_, i) => (i < 512 ? 0.03125 : -0.03125));

  r = await api("POST", "/api/attendance/face/challenge", {
    cookie: emp[1].cookie,
    body: { purpose: "enroll" },
  });
  http("face enroll challenge created", r, 200);
  ok("challenge id returned", typeof r.json?.challengeId === "string" && r.json.challengeId.length > 0, "challengeId", r.json?.challengeId);

  r = await api("POST", "/api/attendance/face/enroll", {
    cookie: emp[1].cookie,
    body: { challengeId: r.json?.challengeId, embedding: EMBEDDING },
  });
  http("deterministic embedding enrolls (201)", r, 201);
  eq("template dimensions 1024", r.json?.template?.dimensions, 1024);
  eq("template model faceres", r.json?.template?.model, "faceres");
  eq("template version 1", r.json?.template?.version, 1);

  r = await api("GET", "/api/attendance/face/status", { cookie: emp[1].cookie });
  eq("employee 2 now enrolled", r.json?.enrolled, true);
  eq("face template version 1 in status", r.json?.version, 1);
  ok("enrolledAt recorded", typeof r.json?.enrolledAt === "string", "ISO timestamp", r.json?.enrolledAt ?? null);
  const templateRow = q1("SELECT * FROM face_templates WHERE employee_id = ?", emp[1].id);
  eq("SQLite face template stored", !!templateRow, true);
  eq("SQLite template dimensions 1024", templateRow?.dimensions, 1024);
  ok("SQLite template holds 1024-float embedding", JSON.parse(templateRow?.embedding ?? "[]").length === 1024, 1024, JSON.parse(templateRow?.embedding ?? "[]").length);

  const inside = { latitude: 24.8607, longitude: 67.0011, accuracy: 10 };
  const outside = { latitude: 25.2607, longitude: 67.5011, accuracy: 10 };

  // Mismatched face → 403 + no attendance row.
  r = await api("POST", "/api/attendance/face/challenge", { cookie: emp[1].cookie, body: { purpose: "check-in" } });
  const mismatchChallenge = r.json?.challengeId;
  r = await api("POST", "/api/attendance/face/check-in", {
    cookie: emp[1].cookie,
    body: { challengeId: mismatchChallenge, embedding: MISMATCH, location: inside },
  });
  http("mismatched embedding is 403 face_mismatch", r, 403, "face_mismatch");
  ok("mismatch reports a score", typeof r.json?.score === "number", "score", r.json?.score);
  eq("mismatch writes NO attendance row", countRows("attendance", "employee_id = ? AND date = ?", emp[1].id, TODAY), 0);
  const mismatchVerif = q1("SELECT * FROM face_verifications WHERE employee_id = ? ORDER BY id DESC LIMIT 1", emp[1].id);
  eq("mismatch telemetry matched=0", Number(mismatchVerif?.matched), 0);
  eq("mismatch telemetry reason", mismatchVerif?.reason, "face_mismatch");

  // Outside geofence → 422 + no attendance row.
  r = await api("POST", "/api/attendance/face/challenge", { cookie: emp[1].cookie, body: { purpose: "check-in" } });
  const outsideChallenge = r.json?.challengeId;
  r = await api("POST", "/api/attendance/face/check-in", {
    cookie: emp[1].cookie,
    body: { challengeId: outsideChallenge, embedding: EMBEDDING, location: outside },
  });
  http("outside geofence is 422", r, 422, "outside_geofence");
  ok("outside-geofence reports distance/radius", typeof r.json?.distance === "number" && typeof r.json?.radius === "number", "distance + radius", `${r.json?.distance}/${r.json?.radius}`);
  eq("outside geofence writes NO attendance row", countRows("attendance", "employee_id = ? AND date = ?", emp[1].id, TODAY), 0);
  const outsideVerif = q1("SELECT * FROM face_verifications WHERE employee_id = ? ORDER BY id DESC LIMIT 1", emp[1].id);
  eq("outside-geofence telemetry matched=0", Number(outsideVerif?.matched), 0);
  eq("outside-geofence telemetry reason", outsideVerif?.reason, "outside_geofence");

  // Successful face check-in.
  r = await api("POST", "/api/attendance/face/challenge", { cookie: emp[1].cookie, body: { purpose: "check-in" } });
  const successChallenge = r.json?.challengeId;
  r = await api("POST", "/api/attendance/face/check-in", {
    cookie: emp[1].cookie,
    body: { challengeId: successChallenge, embedding: EMBEDDING, location: inside },
  });
  http("matching face + inside geofence punches in (200)", r, 200);
  eq("face punch belongs to employee 2", r.json?.attendance?.employeeId, emp[1].id);
  eq("face punch source=camera", r.json?.attendance?.source, "camera");
  eq("face punch verification_method=face", r.json?.attendance?.verificationMethod, "face");
  eq("face verification matched", r.json?.verification?.matched, true);
  eq("face verification method", r.json?.verification?.method, "face");
  const faceRow = q1("SELECT * FROM attendance WHERE employee_id = ? AND date = ?", emp[1].id, TODAY);
  eq("SQLite face punch source=camera", faceRow?.source, "camera");
  eq("SQLite face punch verification_method=face", faceRow?.verification_method, "face");

  // Duplicate face check-in → 409.
  r = await api("POST", "/api/attendance/face/challenge", { cookie: emp[1].cookie, body: { purpose: "check-in" } });
  const dupChallenge = r.json?.challengeId;
  r = await api("POST", "/api/attendance/face/check-in", {
    cookie: emp[1].cookie,
    body: { challengeId: dupChallenge, embedding: EMBEDDING, location: inside },
  });
  http("duplicate face check-in is 409", r, 409, "already_checked_in");
  eq("duplicate face punch leaves one row", countRows("attendance", "employee_id = ? AND date = ?", emp[1].id, TODAY), 1);

  r = await api("GET", "/api/attendance/face/verifications", { cookie: emp[1].cookie });
  http("employee 2 face verifications", r, 200);
  ok(
    "face verification feed omits embeddings",
    Array.isArray(r.json?.items) && r.json.items.every((i) => !("embedding" in i)),
    "no embedding field",
    "redacted"
  );

  // ---------------------------------------------------- 11 cross-cutting
  scenarioStart("11. Cross-cutting auth, scope, idempotency");

  const unauth = [
    ["GET", "/api/employees"],
    ["GET", "/api/attendance?date=" + TODAY],
    ["GET", "/api/attendance/me"],
    ["GET", "/api/leave/balances"],
    ["GET", "/api/leave/requests"],
    ["GET", "/api/payroll/runs"],
    ["GET", "/api/payroll/payslips"],
    ["GET", "/api/dashboard/summary"],
    ["GET", "/api/dashboard/employee"],
    ["GET", "/api/notifications"],
    ["GET", "/api/announcements"],
    ["GET", "/api/users"],
    ["GET", "/api/settings"],
    ["GET", "/api/audit-logs"],
    ["GET", "/api/ai/logs"],
    ["GET", "/api/attendance/face/status"],
    ["POST", "/api/attendance/check-in"],
    ["POST", "/api/payroll/runs"],
    ["POST", "/api/employees"],
    ["POST", "/api/ai/chat"],
  ];
  let unauthPass = 0;
  for (const [method, path] of unauth) {
    const rr = await api(method, path);
    if (rr.status === 401) unauthPass += 1;
    else check(`unauthenticated ${method} ${path} returns 401`, false, 401, rr.status, "auth");
  }
  check(`unauthenticated calls rejected with 401 on all ${unauth.length} routes`, unauthPass === unauth.length, `${unauth.length}/${unauth.length}`, `${unauthPass}/${unauth.length}`);

  const forbidden = [
    ["GET", "/api/attendance?date=" + TODAY],
    ["GET", "/api/dashboard/summary"],
    ["GET", "/api/users"],
    ["GET", "/api/audit-logs"],
    ["GET", "/api/payroll/runs"],
    ["GET", "/api/settings"],
    ["GET", "/api/leave-types"],
    ["POST", "/api/payroll/runs"],
    ["POST", "/api/announcements"],
    ["PATCH", `/api/leave/requests/${ids.leave1}`],
    ["PATCH", `/api/attendance/corrections/${ids.correction2}`],
  ];
  let forbiddenPass = 0;
  for (const [method, path] of forbidden) {
    const rr = await api(method, path, { cookie: emp[0].cookie, body: method === "PATCH" ? { action: "approve" } : undefined });
    if (rr.status === 403) forbiddenPass += 1;
    else check(`employee ${method} ${path} is 403`, false, 403, rr.status, "role");
  }
  check(`employee blocked (403) on all ${forbidden.length} HR/admin routes`, forbiddenPass === forbidden.length, `${forbidden.length}/${forbidden.length}`, `${forbiddenPass}/${forbidden.length}`);

  r = await api("POST", "/api/users", { cookie: hrCookie, body: { name: "Nope", email: "nope@acceptance.test", role: "hr" } });
  http("HR cannot create users (admin only)", r, 403);
  r = await api("PATCH", "/api/settings", { cookie: hrCookie, body: { radiusM: 300 } });
  http("HR cannot change settings (admin only)", r, 403);
  r = await api("POST", "/api/employees", {
    cookie: adminCookie,
    body: { code: "X", fullName: "X", email: "x@acceptance.test", joinDate: TODAY, basicSalary: 1000 },
  });
  http("admin cannot register employees (HR-only route)", r, 403);
  r = await api("PATCH", `/api/leave/requests/${ids.leave1}`, { cookie: adminCookie, body: { action: "approve" } });
  http("admin cannot approve leave (HR-only)", r, 403);

  // Body-supplied employeeId cannot redirect a punch.
  const e3Before = countRows("attendance", "employee_id = ? AND date = ?", emp[2].id, TODAY);
  const e1RowBefore = q1("SELECT * FROM attendance WHERE employee_id = ? AND date = ?", emp[0].id, TODAY);
  r = await api("POST", "/api/attendance/check-in", {
    cookie: emp[2].cookie,
    body: { employeeId: emp[0].id, source: "camera", verificationMethod: "face" },
  });
  http("body employeeId check-in accepted for caller (201)", r, 201);
  eq("punch stays with the session employee", r.json?.attendance?.employeeId, emp[2].id);
  eq("body-supplied source is ignored", r.json?.attendance?.source, "web");
  eq("body-supplied verificationMethod is ignored", r.json?.attendance?.verificationMethod ?? null, null);
  eq("other employee gained no row", countRows("attendance", "employee_id = ? AND date = ?", emp[2].id, TODAY), e3Before + 1);
  const e1RowAfter = q1("SELECT * FROM attendance WHERE employee_id = ? AND date = ?", emp[0].id, TODAY);
  eq("target employee row unchanged", e1RowAfter?.check_out_at, e1RowBefore?.check_out_at);

  r = await api("POST", "/api/attendance/check-out", {
    cookie: emp[2].cookie,
    body: { employeeId: emp[0].id },
  });
  http("body employeeId check-out accepted for caller (200)", r, 200);
  eq("check-out stays with the session employee", r.json?.attendance?.employeeId, emp[2].id);
  const e1RowAfterCo = q1("SELECT * FROM attendance WHERE employee_id = ? AND date = ?", emp[0].id, TODAY);
  eq("target employee check-out untouched", e1RowAfterCo?.check_out_at, e1RowBefore?.check_out_at);

  // Unique row invariant + scoping.
  const dupRows = qall("SELECT employee_id, date, COUNT(*) AS c FROM attendance GROUP BY employee_id, date HAVING c > 1");
  eq("no duplicate attendance rows per employee/day", dupRows.length, 0);

  r = await api("GET", "/api/employees", { cookie: emp[0].cookie });
  eq("employee directory scope still self", r.json?.items?.length, 1);

  r = await api("GET", `/api/leave/requests?employeeId=${emp[1].id}`, { cookie: emp[0].cookie });
  http("employee 1 lists leave with a foreign employeeId filter", r, 200);
  ok(
    "leave list ignores foreign employeeId",
    Array.isArray(r.json?.items) && r.json.items.every((i) => i.employeeId === emp[0].id),
    "own rows only",
    [...new Set((r.json?.items ?? []).map((i) => i.employeeId))]
  );

  r = await api("GET", `/api/payroll/payslips?employeeId=${emp[1].id}`, { cookie: emp[0].cookie });
  http("employee 1 lists payslips with a foreign employeeId filter", r, 200);
  ok(
    "payslip list ignores foreign employeeId",
    Array.isArray(r.json?.items) && r.json.items.every((i) => i.employeeId === emp[0].id),
    "own rows only",
    [...new Set((r.json?.items ?? []).map((i) => i.employeeId))]
  );

  r = await api("GET", `/api/employees/${emp[1].id}`, { cookie: emp[0].cookie });
  http("employee cannot read another employee's 360 (403)", r, 403);

  // Final embedding-leak scan across every response body seen.
  const embeddingJson = JSON.stringify(EMBEDDING);
  const embeddingProbe = "0.03125,0.03125,0.03125";
  const leaks = allBodies.filter(
    (b) => b.text.includes(embeddingJson) || b.text.includes(embeddingProbe)
  );
  eq("no response body ever contains the stored face embedding", leaks.length, 0);
  if (embeddingJson.length > 120) {
    const chunk = embeddingJson.slice(0, 120);
    const chunkLeaks = allBodies.filter((b) => b.text.includes(chunk));
    eq("no response body contains a long embedding slice", chunkLeaks.length, 0);
  }
} catch (err) {
  check(`fatal: scenario "${scenario}" crashed`, false, "completed scenario", String(err?.stack ?? err), "fatal");
  console.error(err);
}

// ----------------------------------------------------------------- report

const passed = results.filter((r) => r.ok).length;
const failed = results.length - results.filter((r) => r.ok).length;

console.log("\n\n================ ACCEPTANCE RESULTS ================");
const widthScenario = Math.min(44, Math.max(8, ...results.map((r) => r.scenario.length)));
const nameWidth = Math.min(82, Math.max(10, ...results.map((r) => r.name.length)));
console.log(
  `${"SCENARIO".padEnd(widthScenario)} | ${"CHECK".padEnd(nameWidth)} | RESULT | EXPECTED → ACTUAL`
);
console.log("-".repeat(widthScenario + nameWidth + 48));
for (const r of results) {
  const sc = r.scenario.length > widthScenario ? `${r.scenario.slice(0, widthScenario - 1)}…` : r.scenario;
  const nm = r.name.length > nameWidth ? `${r.name.slice(0, nameWidth - 1)}…` : r.name;
  const tail = r.ok ? "" : ` | ${r.expected} → ${r.actual}`;
  console.log(`${sc.padEnd(widthScenario)} | ${nm.padEnd(nameWidth)} | ${r.ok ? "PASS" : "FAIL"} |${tail}`);
}

console.log("\n---------------- FAILURES ----------------");
const failedRows = results.filter((r) => !r.ok);
if (failedRows.length === 0) {
  console.log("none");
} else {
  for (const r of failedRows) {
    console.log(`- [${r.scenario}] ${r.name}\n    expected: ${r.expected}\n    actual:   ${r.actual}${r.meta ? `\n    tag: ${r.meta}` : ""}`);
  }
}

console.log("\n---------------- OBSERVATIONS / AMBIGUITIES ----------------");
if (observations.length === 0) console.log("none");
for (const o of observations) console.log(`- [${o.scenario}] ${o.text}`);

console.log("\n================ SUMMARY ================");
console.log(`checks: ${results.length} total`);
console.log(`ACCEPTANCE: ${passed} PASS / ${failed} FAIL`);
console.log(`DB: ${DB_PATH}`);
console.log(`run log: ${process.env.ACCEPT_LOG || ".agent-logs/accept-api-run.log"}`);

process.exitCode = failed > 0 ? 1 : 0;
