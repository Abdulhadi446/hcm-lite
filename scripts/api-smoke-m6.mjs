#!/usr/bin/env node
/**
 * M6 API smoke test — dashboards & analytics.
 *
 *   npx next build
 *   node scripts/api-smoke-m6.mjs
 *
 * Starts its own production server on port 3007 against a fresh
 * `./.tmp/m6.db` (override with PORT / SMOKE_DB), seeds 2 departments,
 * 5 employees, attendance (through approved corrections, i.e. the real API),
 * one approved leave request and one finalized payroll run, then asserts every
 * KPI against hand-computed expectations.
 *
 * The hand math below assumes the padded attendance window is September 2026
 * (22 working days, Sat/Sun weekend, no holidays in that month).
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const PORT = Number(process.env.PORT || 3007);
const BASE = process.env.BASE_URL || `http://localhost:${PORT}`;
const DB_FILE = path.resolve(process.cwd(), process.env.SMOKE_DB || "./.tmp/m6.db");
const REUSE_SERVER = process.env.SMOKE_REUSE_SERVER === "1";
const LOG_DIR = path.resolve(process.cwd(), ".agent-logs");
const STAMP = new Date().toISOString().replace(/[:.]/g, "-");
const SERVER_LOG = path.join(LOG_DIR, `m6-smoke-server-${STAMP}.log`);

const ADMIN = { name: "Smoke Admin", email: "admin@hcm.local", password: "admin12345" };
const COMPANY = "M6 Smoke Co";
const HR = { name: "Hana HR", email: "hr@hcm.local", password: "hrpass12345" };
const DEFAULT_EMPLOYEE_PASSWORD = "empPass1234";

// Hand-picked numbers so every KPI can be verified on paper.
const FIXED_FROM = "2026-09-01";
const FIXED_TO = "2026-09-30";
const PAYROLL_MONTH = "2027-01";
const HOLIDAY = { date: "2027-03-01", name: "Foundation Day" };

const EMPLOYEES = [
  // engineering: E1 + E2
  { key: "e1", code: "EMP601", fullName: "Ayesha Malik", dept: "Engineering", basicSalary: 50000, joinDate: "2025-09-30" },
  { key: "e2", code: "EMP602", fullName: "Bilal Ahmed", dept: "Engineering", basicSalary: 20000, joinDate: "2024-09-30" },
  // operations: E3 + E4 + E5
  { key: "e3", code: "EMP603", fullName: "Chen Wei", dept: "Operations", basicSalary: 40000, joinDate: "2023-09-30" },
  { key: "e4", code: "EMP604", fullName: "Danish Iqbal", dept: "Operations", basicSalary: 100000, joinDate: "2022-09-30" },
  { key: "e5", code: "EMP605", fullName: "Ella Novak", dept: "Operations", basicSalary: 80000, joinDate: "2026-09-30" },
];

// 5 present / 2 late / 1 half_day across E1+E2 in September 2026.
const ATTENDANCE_SEED = [
  { emp: "e1", date: "2026-09-01", checkIn: "09:00", checkOut: "18:00" },
  { emp: "e1", date: "2026-09-02", checkIn: "09:45", checkOut: "18:00" },
  { emp: "e1", date: "2026-09-03", checkIn: "09:00", checkOut: "12:00" },
  { emp: "e1", date: "2026-09-04", checkIn: "08:55", checkOut: "18:05" },
  { emp: "e1", date: "2026-09-09", checkIn: "09:05", checkOut: "18:10" },
  { emp: "e2", date: "2026-09-01", checkIn: "09:00", checkOut: "17:30" },
  { emp: "e2", date: "2026-09-07", checkIn: "09:10", checkOut: "18:00" },
  { emp: "e2", date: "2026-09-08", checkIn: "10:15", checkOut: "18:00" },
];

// Expected net pay for PAYROLL_MONTH (future month → no absence deductions):
// net = basic * 1.5 - monthlyTax(basic * 1.5).
const EXPECTED_PAYSLIPS = {
  e1: 73750, // 75,000 gross − 1,250 tax
  e2: 30000, // 30,000 gross − 0 tax
  e3: 59500, // 60,000 gross − 500 tax
  e4: 140000, // 150,000 gross − 10,000 tax
  e5: 114500, // 120,000 gross − 5,500 tax
};
const EXPECTED_PAYROLL_TOTAL = 417750;

let failed = false;
let server = null;
let serverLog = null;

function check(name, cond, detail) {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${detail ? `  — ${detail}` : ""}`);
  if (!cond) failed = true;
  return !!cond;
}

function expectKpi(name, expected, got) {
  const ok =
    typeof expected === "number" && typeof got === "number"
      ? Math.abs(expected - got) < 1e-9
      : expected === got;
  return check(`kpi.${name}`, ok, `expected=${JSON.stringify(expected)} got=${JSON.stringify(got)}`);
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
  return { ...result, cookie: cookieFrom(result.res) };
}

function todayIso() {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function seedMinutes(seed) {
  const [inH, inM] = seed.checkIn.split(":").map(Number);
  const [outH, outM] = seed.checkOut.split(":").map(Number);
  return outH * 60 + outM - (inH * 60 + inM);
}

/**
 * Expected attendance status for a correction seed, mirroring the M3 rules:
 * worked < 300 min => half_day, check-in after 09:15 => late, else present.
 */
function seedStatus(seed) {
  if (seedMinutes(seed) < 300) return "half_day";
  const [inH, inM] = seed.checkIn.split(":").map(Number);
  return inH * 60 + inM > 9 * 60 + 15 ? "late" : "present";
}

/** Independent working-day count (weekends + supplied holidays skipped). */
function workingDaysLocal(from, to, holidays = []) {
  const set = new Set(holidays);
  let count = 0;
  for (let ms = Date.parse(`${from}T00:00:00Z`); ms <= Date.parse(`${to}T00:00:00Z`); ms += 86_400_000) {
    const date = new Date(ms);
    const weekday = date.getUTCDay();
    const iso = date.toISOString().slice(0, 10);
    if (weekday === 0 || weekday === 6) continue;
    if (set.has(iso)) continue;
    count += 1;
  }
  return count;
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
    if (server && server.exitCode !== null) return false;
    try {
      const res = await fetch(`${BASE}/api/setup/status`);
      if (res.ok) return true;
    } catch {
      /* retry */
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return false;
}

async function portIsBusy() {
  try {
    await fetch(`${BASE}/api/setup/status`, { signal: AbortSignal.timeout(1000) });
    return true;
  } catch {
    return false;
  }
}

const state = { departments: {}, employees: {}, cookies: {} };
const steps = [];
const today = todayIso();
const currentMonth = today.slice(0, 7);

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
  check("fresh DB: setup creates the Admin -> 201", res.status === 201 && json?.ok === true, `status=${res.status}`);
  const session = await login(ADMIN.email, ADMIN.password);
  state.adminCookie = session.cookie;
  check(
    "Admin login -> 200 + cookie",
    session.res.status === 200 && session.json?.user?.role === "admin" && !!state.adminCookie,
    `status=${session.res.status}`
  );
});

steps.push(async () => {
  const created = await request("/api/users", {
    method: "POST",
    cookie: state.adminCookie,
    body: { name: HR.name, email: HR.email, role: "hr", password: HR.password },
  });
  const session = await login(HR.email, HR.password);
  state.hrCookie = session.cookie;
  check(
    "Admin creates HR (password set) + HR logs in",
    created.res.status === 201 && session.res.status === 200 && session.json?.user?.role === "hr",
    `create=${created.res.status} login=${session.res.status}`
  );
});

steps.push(async () => {
  for (const name of ["Engineering", "Operations"]) {
    const { res, json } = await request("/api/departments", {
      method: "POST",
      cookie: state.adminCookie,
      body: { name },
    });
    if (json?.department?.id) state.departments[name] = json.department.id;
    check(`create department ${name} -> 201`, res.status === 201 && !!state.departments[name], `status=${res.status}`);
  }
});

steps.push(async () => {
  for (const employee of EMPLOYEES) {
    const { res, json } = await request("/api/employees", {
      method: "POST",
      cookie: state.hrCookie,
      body: {
        code: employee.code,
        fullName: employee.fullName,
        email: `${employee.key}@hcm.local`,
        departmentId: state.departments[employee.dept],
        joinDate: employee.joinDate,
        status: "active",
        basicSalary: employee.basicSalary,
        password: DEFAULT_EMPLOYEE_PASSWORD,
      },
    });
    if (json?.employee?.id) state.employees[employee.key] = json.employee.id;
    const session = await login(`${employee.key}@hcm.local`, DEFAULT_EMPLOYEE_PASSWORD);
    state.cookies[employee.key] = session.cookie;
    check(
      `seed employee ${employee.code} (${employee.dept}) + login`,
      res.status === 201 && !!state.employees[employee.key] && session.res.status === 200,
      `create=${res.status} login=${session.res.status} id=${state.employees[employee.key]}`
    );
  }
});

// --------------------------------------------------- attendance via API

steps.push(async () => {
  let ok = true;
  for (const seed of ATTENDANCE_SEED) {
    const created = await request("/api/attendance/corrections", {
      method: "POST",
      cookie: state.cookies[seed.emp],
      body: {
        date: seed.date,
        requestedCheckIn: seed.checkIn,
        requestedCheckOut: seed.checkOut,
        reason: `M6 smoke seed ${seed.date}`,
      },
    });
    const correctionId = created.json?.correction?.id;
    const approved = await request(`/api/attendance/corrections/${correctionId}`, {
      method: "PATCH",
      cookie: state.hrCookie,
      body: { action: "approve" },
    });
    if (created.res.status !== 201 || approved.res.status !== 200) {
      ok = false;
      console.log(
        `  correction ${seed.emp} ${seed.date}: create=${created.res.status} approve=${approved.res.status}`
      );
    }
  }
  check(
    `attendance seeded through ${ATTENDANCE_SEED.length} approved corrections`,
    ok,
    `${ATTENDANCE_SEED.length} rows`
  );
});

steps.push(async () => {
  const { res, json } = await request("/api/attendance?date=2026-09-02", { cookie: state.hrCookie });
  const row = (json?.items ?? []).find((item) => item.employeeId === state.employees.e1);
  check(
    "correction approval produced a `late` day for a 09:45 check-in",
    res.status === 200 && row?.status === "late",
    `status=${row?.status}`
  );
});

// current-month rows so the personal dashboard has data of its own
steps.push(async () => {
  let ok = true;
  for (const key of ["e1", "e2"]) {
    const created = await request("/api/attendance/corrections", {
      method: "POST",
      cookie: state.cookies[key],
      body: {
        date: today,
        requestedCheckIn: "09:00",
        requestedCheckOut: "18:00",
        reason: "M6 smoke current-month seed",
      },
    });
    const approved = await request(`/api/attendance/corrections/${created.json?.correction?.id}`, {
      method: "PATCH",
      cookie: state.hrCookie,
      body: { action: "approve" },
    });
    if (created.res.status !== 201 || approved.res.status !== 200) ok = false;
  }
  check("current-month attendance seeded for E1 + E2", ok, `date=${today}`);
});

// -------------------------------------------------------------- leave

steps.push(async () => {
  const types = await request("/api/leave-types", { cookie: state.adminCookie });
  const annual = (types.json?.items ?? []).find((item) => item.name === "Annual");
  state.annualLeaveTypeId = annual?.id;
  check(
    "leave types exist (Annual quota 14) for the utilization denominator",
    types.res.status === 200 && annual?.quotaDays === 14,
    `quota=${annual?.quotaDays} sum=${(types.json?.items ?? [])
      .filter((item) => item.quotaDays > 0)
      .reduce((total, item) => total + item.quotaDays, 0)}`
  );
});

steps.push(async () => {
  const created = await request("/api/leave/requests", {
    method: "POST",
    cookie: state.cookies.e3,
    body: {
      leaveTypeId: state.annualLeaveTypeId,
      startDate: "2026-09-10",
      endDate: "2026-09-11",
      reason: "M6 smoke approved leave",
    },
  });
  const days = created.json?.request?.days;
  const approved = await request(`/api/leave/requests/${created.json?.request?.id}`, {
    method: "PATCH",
    cookie: state.hrCookie,
    body: { action: "approve" },
  });
  check(
    "E3 leave 10–11 Sep approved -> 2 leave days",
    created.res.status === 201 && days === 2 && approved.res.status === 200,
    `days=${days} approve=${approved.res.status}`
  );
});

steps.push(async () => {
  const created = await request("/api/leave/requests", {
    method: "POST",
    cookie: state.cookies.e4,
    body: {
      leaveTypeId: state.annualLeaveTypeId,
      startDate: "2026-11-02",
      endDate: "2026-11-03",
      reason: "M6 smoke pending leave",
    },
  });
  state.pendingLeaveId = created.json?.request?.id;
  check("E4 leave left pending (for the pendingLeaves KPI)", created.res.status === 201, `status=${created.res.status}`);
});

// ------------------------------------------------------------ holidays

steps.push(async () => {
  const { res } = await request("/api/holidays", {
    method: "POST",
    cookie: state.adminCookie,
    body: HOLIDAY,
  });
  check(`holiday ${HOLIDAY.date} created`, res.status === 201, `status=${res.status}`);
});

// ------------------------------------------------------------- payroll

steps.push(async () => {
  const created = await request("/api/payroll/runs", {
    method: "POST",
    cookie: state.hrCookie,
    body: { month: PAYROLL_MONTH },
  });
  state.runId = created.json?.run?.id;
  const detailed = await request(`/api/payroll/runs/${state.runId}`, { cookie: state.adminCookie });
  const nets = new Map(
    (detailed.json?.payslips ?? []).map((payslip) => [payslip.employeeName, payslip.net])
  );
  const finalized = await request(`/api/payroll/runs/${state.runId}/finalize`, {
    method: "POST",
    cookie: state.adminCookie,
  });

  check(
    `${PAYROLL_MONTH} payroll run created then finalized`,
    created.res.status === 201 &&
      detailed.res.status === 200 &&
      finalized.res.status === 200 &&
      finalized.json?.run?.status === "finalized",
    `create=${created.res.status} finalize=${finalized.res.status}`
  );

  for (const employee of EMPLOYEES) {
    const expected = EXPECTED_PAYSLIPS[employee.key];
    const got = nets.get(employee.fullName);
    check(
      `payslip net for ${employee.code}`,
      Math.abs(Number(got) - expected) < 1e-9,
      `expected=${expected} got=${got}`
    );
  }
  check(
    "run total net equals the hand-computed payroll cost",
    Math.abs(Number(detailed.json?.run?.totalNet) - EXPECTED_PAYROLL_TOTAL) < 1e-9,
    `expected=${EXPECTED_PAYROLL_TOTAL} got=${detailed.json?.run?.totalNet}`
  );
});

steps.push(async () => {
  const created = await request("/api/attendance/corrections", {
    method: "POST",
    cookie: state.cookies.e5,
    body: {
      date: "2026-10-05",
      requestedCheckIn: "09:00",
      requestedCheckOut: "18:00",
      reason: "M6 smoke pending correction",
    },
  });
  state.pendingCorrectionId = created.json?.correction?.id;
  check("E5 correction left pending (for the openCorrections KPI)", created.res.status === 201, `status=${created.res.status}`);
});

// ----------------------------------------------------- summary asserts

steps.push(async () => {
  const { res, json } = await request(
    `/api/dashboard/summary?from=${FIXED_FROM}&to=${FIXED_TO}`,
    { cookie: state.hrCookie }
  );
  check(
    "HR GET /api/dashboard/summary -> 200",
    res.status === 200 && json?.scope?.role === "hr",
    `status=${res.status} scope=${JSON.stringify(json?.scope)}`
  );
  if (res.status !== 200) return;
  state.summary = json;

  const kpis = json.kpis;
  console.log("\n  Hand-computed KPI table (1–30 Sep 2026, 5 employees, 22 working days)");
  expectKpi("headcount", 5, kpis.headcount);
  expectKpi("workingDays", 22, kpis.workingDays);
  expectKpi("presentDays", 5, kpis.presentDays);
  expectKpi("lateDays", 2, kpis.lateDays);
  expectKpi("halfDays", 1, kpis.halfDays);
  expectKpi("onLeaveDays", 2, kpis.onLeaveDays);
  expectKpi("absentDays", 100, kpis.absentDays);
  expectKpi("attendanceRate", 9.1, kpis.attendanceRate);
  expectKpi("latePct", 25, kpis.latePct);
  expectKpi("absenteeismRate", 90.9, kpis.absenteeismRate);
  expectKpi("attritionRate", 0, kpis.attritionRate);
  expectKpi("leaveUtilization", 1.3, kpis.leaveUtilization);
  expectKpi("payrollCost (range has no finalized run)", 0, kpis.payrollCost);
  expectKpi("avgTenureMonths", 24, kpis.avgTenureMonths);
  expectKpi("newHires", 1, kpis.newHires);
  expectKpi("openCorrections", 1, kpis.openCorrections);
  expectKpi("pendingLeaves", 1, kpis.pendingLeaves);
  expectKpi("pending.corrections", 1, json.pending?.corrections);
  expectKpi("pending.leaves", 1, json.pending?.leaves);
  expectKpi("scope.from", FIXED_FROM, json.scope?.from);
  expectKpi("scope.to", FIXED_TO, json.scope?.to);
  expectKpi("scope.departmentId", null, json.scope?.departmentId);
});

steps.push(async () => {
  const summary = state.summary;
  if (!summary) return check("trend asserts skipped (no summary)", false);

  const trend = summary.trend ?? [];
  expectKpi("trend.length (working days with people)", 22, trend.length);

  const byDate = new Map(trend.map((point) => [point.date, point]));
  const sep1 = byDate.get("2026-09-01");
  const sep2 = byDate.get("2026-09-02");
  const sep10 = byDate.get("2026-09-10");
  const sep30 = byDate.get("2026-09-30");

  check(
    "trend 1 Sep: 2 present, 0 late, 2 absent (4 employed, 2 checked in)",
    sep1?.present === 2 && sep1?.late === 0 && sep1?.absent === 2,
    JSON.stringify(sep1)
  );
  check(
    "trend 2 Sep: 0 present, 1 late, 3 absent",
    sep2?.present === 0 && sep2?.late === 1 && sep2?.absent === 3,
    JSON.stringify(sep2)
  );
  check(
    "trend 10 Sep: 4 employed, 1 on approved leave -> 3 absent",
    sep10?.present === 0 && sep10?.late === 0 && sep10?.absent === 3,
    JSON.stringify(sep10)
  );
  check(
    "trend 30 Sep: joiner (E5) is employed that day -> 5 absent",
    sep30?.present === 0 && sep30?.late === 0 && sep30?.absent === 5,
    JSON.stringify(sep30)
  );
});

steps.push(async () => {
  const summary = state.summary;
  if (!summary) return check("byDepartment asserts skipped", false);
  const departments = new Map((summary.byDepartment ?? []).map((row) => [row.departmentName, row]));
  const engineering = departments.get("Engineering");
  const operations = departments.get("Operations");

  expectKpi("byDepartment.count", 2, summary.byDepartment?.length);
  check(
    "Engineering: headcount 2, 8/44 attended -> 18.2%, 2/8 late -> 25%",
    engineering?.headcount === 2 &&
      engineering?.attendanceRate === 18.2 &&
      engineering?.latePct === 25,
    JSON.stringify(engineering)
  );
  check(
    "Operations: headcount 3, 2 leave/66 -> 3%, 0% late",
    operations?.headcount === 3 && operations?.attendanceRate === 3 && operations?.latePct === 0,
    JSON.stringify(operations)
  );
  check(
    "byDepartment sorted by headcount desc",
    summary.byDepartment?.[0]?.departmentName === "Operations",
    summary.byDepartment?.map((row) => row.departmentName).join(",")
  );
});

steps.push(async () => {
  const summary = state.summary;
  if (!summary) return check("recentHires / holidays asserts skipped", false);
  const newest = summary.recentHires?.[0];
  check(
    "recentHires starts with the 30 Sep 2026 joiner",
    newest?.id === state.employees.e5 && newest?.joinDate === "2026-09-30",
    JSON.stringify(newest)
  );
  check(
    "upcomingHolidays lists the seeded 2027-03-01 holiday",
    (summary.upcomingHolidays ?? []).some((holiday) => holiday.date === HOLIDAY.date),
    JSON.stringify(summary.upcomingHolidays)
  );
});

steps.push(async () => {
  const { res, json } = await request(
    `/api/dashboard/summary?from=${FIXED_FROM}&to=${FIXED_TO}&departmentId=${state.departments.Engineering}`,
    { cookie: state.adminCookie }
  );
  check("Admin + department filter -> 200", res.status === 200, `status=${res.status}`);
  if (res.status !== 200) return;
  expectKpi("dept.headcount", 2, json.kpis.headcount);
  expectKpi("dept.presentDays", 5, json.kpis.presentDays);
  expectKpi("dept.lateDays", 2, json.kpis.lateDays);
  expectKpi("dept.halfDays", 1, json.kpis.halfDays);
  expectKpi("dept.onLeaveDays", 0, json.kpis.onLeaveDays);
  expectKpi("dept.absentDays", 36, json.kpis.absentDays);
  expectKpi("dept.attendanceRate", 18.2, json.kpis.attendanceRate);
  expectKpi("dept.latePct", 25, json.kpis.latePct);
  expectKpi("dept.absenteeismRate", 81.8, json.kpis.absenteeismRate);
  expectKpi("dept.byDepartment.length", 1, json.byDepartment.length);
});

steps.push(async () => {
  const { res, json } = await request(
    `/api/dashboard/summary?from=${PAYROLL_MONTH}-01&to=${PAYROLL_MONTH}-31`,
    { cookie: state.adminCookie }
  );
  check("payroll-month summary -> 200", res.status === 200, `status=${res.status}`);
  if (res.status !== 200) return;
  expectKpi("payrollCost (finalized run, 5 payslips)", EXPECTED_PAYROLL_TOTAL, json.kpis.payrollCost);
  expectKpi("payrollLabel", "Period", json.kpis.payrollLabel);
  expectKpi("payroll headcount", 5, json.kpis.headcount);
  expectKpi("payroll workingDays", 21, json.kpis.workingDays);

  const multi = await request(
    `/api/dashboard/summary?from=2026-12-01&to=${PAYROLL_MONTH}-31`,
    { cookie: state.adminCookie }
  );
  expectKpi("multi-month payrollCost (same total)", EXPECTED_PAYROLL_TOTAL, multi.json?.kpis?.payrollCost);
  expectKpi("multi-month payrollLabel", "YTD", multi.json?.kpis?.payrollLabel);
});

steps.push(async () => {
  const { res, json } = await request("/api/dashboard/summary?from=2020-01-01&to=2020-01-31", {
    cookie: state.adminCookie,
  });
  check("zero-data range -> 200 with real zeros (fresh-install path)", res.status === 200, `status=${res.status}`);
  if (res.status !== 200) return;
  expectKpi("empty.headcount", 0, json.kpis.headcount);
  expectKpi("empty.attendanceRate", 0, json.kpis.attendanceRate);
  expectKpi("empty.absentDays", 0, json.kpis.absentDays);
  expectKpi("empty.trend length", 0, json.trend.length);
  expectKpi("empty.byDepartment length", 0, json.byDepartment.length);
  expectKpi("empty.recentHires length", 0, json.recentHires.length);
});

steps.push(async () => {
  const { res, json } = await request("/api/dashboard/summary?from=2026-09-01&to=not-a-date", {
    cookie: state.adminCookie,
  });
  check("bad date -> 400", res.status === 400, `status=${res.status} ${JSON.stringify(json)}`);

  const inverted = await request("/api/dashboard/summary?from=2026-09-30&to=2026-09-01", {
    cookie: state.adminCookie,
  });
  check("from > to -> 400", inverted.res.status === 400, `status=${inverted.res.status}`);
});

// --------------------------------------------------- employee endpoint

steps.push(async () => {
  const workingDaysToDate = workingDaysLocal(`${currentMonth}-01`, today, [HOLIDAY.date]);

  // E1's own seeded rows in the current month (+ today's 09:00–18:00 row).
  const e1RowsInMonth = ATTENDANCE_SEED.filter(
    (seed) => seed.emp === "e1" && seed.date.startsWith(currentMonth)
  );
  const presentThisMonth = e1RowsInMonth.filter((seed) => seedStatus(seed) === "present").length + 1;
  const lateThisMonth = e1RowsInMonth.filter((seed) => seedStatus(seed) === "late").length;
  const halfThisMonth = e1RowsInMonth.filter((seed) => seedStatus(seed) === "half_day").length;
  const attendedThisMonth = presentThisMonth + lateThisMonth + halfThisMonth;
  const expectedAbsent = Math.max(0, workingDaysToDate - attendedThisMonth);
  const expectedRate = Math.round((attendedThisMonth / workingDaysToDate) * 1000) / 10;

  const mondayMs = Date.parse(`${today}T00:00:00Z`) - ((new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7) * 86_400_000;
  const weekStart = new Date(mondayMs).toISOString().slice(0, 10);
  const weekMinutes =
    540 + // today: 09:00–18:00
    e1RowsInMonth
      .filter((seed) => seed.date >= weekStart && seed.date <= today)
      .reduce((total, seed) => total + seedMinutes(seed), 0);
  const expectedHours = Math.round((weekMinutes / 60 + Number.EPSILON) * 100) / 100;

  const { res, json } = await request("/api/dashboard/employee", { cookie: state.cookies.e1 });
  check("Employee GET /api/dashboard/employee -> 200", res.status === 200, `status=${res.status}`);
  if (res.status !== 200) return;

  expectKpi("me.employeeId (own only)", state.employees.e1, json.me?.employeeId);
  expectKpi("me.month", currentMonth, json.me?.month);
  expectKpi("me.workingDays (month to date)", workingDaysToDate, json.me?.workingDays);
  expectKpi("me.presentDays (own rows only)", presentThisMonth, json.me?.presentDays);
  expectKpi("me.lateDays (own rows only)", lateThisMonth, json.me?.lateDays);
  expectKpi("me.absentDays", expectedAbsent, json.me?.absentDays);
  expectKpi("me.attendanceRate", expectedRate, json.me?.attendanceRate);
  expectKpi("me.hoursThisWeek", expectedHours, json.me?.hoursThisWeek);
  expectKpi("leaveBalances.length (4 default types)", 4, json.leaveBalances?.length);
  check(
    "leaveBalances only contain the caller",
    (json.leaveBalances ?? []).every((item) => item.employeeId === state.employees.e1),
    JSON.stringify(json.leaveBalances?.[0])
  );
  const annual = (json.leaveBalances ?? []).find((item) => item.typeName === "Annual");
  check(
    "Annual balance untouched for E1 (quota 14, used 0)",
    annual?.quota === 14 && annual?.used === 0 && annual?.remaining === 14,
    JSON.stringify(annual)
  );
  check(
    "lastPayslip is E1's own finalized Jan 2027 net",
    json.lastPayslip?.net === EXPECTED_PAYSLIPS.e1 && json.lastPayslip?.month === PAYROLL_MONTH,
    JSON.stringify(json.lastPayslip)
  );
  check(
    "upcomingHolidays present for the employee",
    (json.upcomingHolidays ?? []).some((holiday) => holiday.date === HOLIDAY.date),
    JSON.stringify(json.upcomingHolidays)
  );
});

steps.push(async () => {
  const asEmployee = await request(`/api/dashboard/summary?from=${FIXED_FROM}&to=${FIXED_TO}`, {
    cookie: state.cookies.e1,
  });
  const anonymousSummary = await request(`/api/dashboard/summary?from=${FIXED_FROM}&to=${FIXED_TO}`);
  const anonymousEmployee = await request("/api/dashboard/employee");
  check(
    "Employee GET /api/dashboard/summary -> 403 (company scope is Admin/HR only)",
    asEmployee.res.status === 403,
    `status=${asEmployee.res.status} ${JSON.stringify(asEmployee.json)}`
  );
  check(
    "anonymous summary -> 401 and anonymous employee -> 401",
    anonymousSummary.res.status === 401 && anonymousEmployee.res.status === 401,
    `summary=${anonymousSummary.res.status} employee=${anonymousEmployee.res.status}`
  );
});

steps.push(async () => {
  const adminSelf = await request("/api/dashboard/employee", { cookie: state.adminCookie });
  check(
    "Admin without an employee profile gets empty personal data, not an error",
    adminSelf.res.status === 200 &&
      adminSelf.json?.me?.employeeId === null &&
      adminSelf.json?.leaveBalances?.length === 0 &&
      adminSelf.json?.lastPayslip === null,
    `status=${adminSelf.res.status} me=${JSON.stringify(adminSelf.json?.me)}`
  );
});

steps.push(async () => {
  // Leaves the seeded DB usable for the Playwright screenshot pass.
  const changed = await request("/api/auth/change-password", {
    method: "POST",
    cookie: state.cookies.e1,
    body: { currentPassword: DEFAULT_EMPLOYEE_PASSWORD, newPassword: "emp1pass4567" },
  });
  check("E1 changes password (so /dashboard renders for the screenshot pass)", changed.res.status === 200, `status=${changed.res.status}`);
});

// ----------------------------------------------------------------- main

async function main() {
  if (!REUSE_SERVER) {
    if (await portIsBusy()) {
      console.error(
        `FAIL  ${BASE} is already in use — stop the other server (stale smoke run?) and retry.`
      );
      process.exit(1);
    }
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

  console.log(failed ? "\nSMOKE M6: FAIL" : "\nSMOKE M6: ALL PASS");
  process.exit(failed ? 1 : 0);
}

main();
