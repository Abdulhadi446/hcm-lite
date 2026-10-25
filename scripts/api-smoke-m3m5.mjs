#!/usr/bin/env node
/**
 * M3 (attendance) + M4 (leave) + M5 (payroll) API smoke test.
 *
 * Fresh DB:
 *   rm -f .tmp/m3m5.db*
 *   DATABASE_URL=./.tmp/m3m5.db PORT=3003 npx next start
 *   BASE_URL=http://localhost:3003 node scripts/api-smoke-m3m5.mjs
 *
 * No dependencies. Exits non-zero when any step fails.
 */
import path from "node:path";

const BASE = process.env.BASE_URL || "http://localhost:3003";
const DB_FILE = path.resolve(process.cwd(), process.env.SMOKE_DB || "./.tmp/m3m5.db");

const ADMIN = { name: "Smoke Admin", email: "admin@hcm.local", password: "admin12345" };
const COMPANY = "M3-M5 Smoke Co";
const HR = { name: "HR Manager", email: "hr@hcm.local", password: "hrpass12345" };

const EMP1 = {
  code: "ATT001",
  fullName: "Attendance One",
  email: "att1@hcm.local",
  joinDate: "2026-01-05",
  basicSalary: 60000,
  password: "attpass12345",
};
const EMP2 = {
  code: "MID002",
  fullName: "Mid Joiner",
  email: "mid2@hcm.local",
  joinDate: "2026-09-14",
  basicSalary: 100000,
  password: "midpass12345",
};
const EMP3 = {
  code: "SLB003",
  fullName: "Slab Emp",
  email: "slb3@hcm.local",
  joinDate: "2026-01-05",
  basicSalary: 50000,
  password: "slbpass12345",
};
const EMP4 = {
  code: "PRJ004",
  fullName: "Prorated Absentee",
  email: "prj4@hcm.local",
  joinDate: "2026-09-16",
  basicSalary: 250000,
  password: "prjpass12345",
};

// Hand-computed payroll expectations for 2026-09 (22 working days, sat/sun weekend).
const EXPECT = {
  totalWorkingDays: 22,
  e2: {
    eligibleDays: 13,
    // Run-wide daily rate: full gross / month working days (not eligible days).
    perDay: 6818.18,
    gross: 88636.36,
    tax: 10000,
    net: 78636.36,
  },
  e4: {
    eligibleDays: 11,
    perDay: 17045.45,
    gross: 187500,
    deductions: 187500,
    tax: 68750,
    // No clamping: gross − deductions − tax (all 11 eligible days are unpaid).
    net: -68750,
  },
  e3: { gross: 75000, tax: 1250, net: 73750 },
  e1: {
    absentDays: 20,
    halfDays: 1,
    deductions: 83863.64,
    tax: 2000,
    net: 4136.36,
  },
};

let failed = false;

function check(name, cond, detail) {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${detail ? `  — ${detail}` : ""}`);
  if (!cond) failed = true;
  return !!cond;
}

function round2(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function workingDays(startIso, endIso, holidayDates = []) {
  const holidays = new Set(holidayDates);
  let cursor = Date.parse(`${startIso}T00:00:00Z`);
  const end = Date.parse(`${endIso}T00:00:00Z`);
  let count = 0;
  while (cursor <= end) {
    const date = new Date(cursor);
    const iso = date.toISOString().slice(0, 10);
    const weekday = date.getUTCDay();
    if (weekday !== 0 && weekday !== 6 && !holidays.has(iso)) count += 1;
    cursor += 24 * 60 * 60 * 1000;
  }
  return count;
}

async function request(urlPath, { method = "GET", body, cookie, form } = {}) {
  const headers = {};
  if (cookie) headers.cookie = cookie;
  let payload;
  if (form) {
    payload = form;
  } else if (body !== undefined) {
    headers["content-type"] = "application/json";
    payload = JSON.stringify(body);
  }
  const res = await fetch(BASE + urlPath, { method, headers, body: payload, redirect: "manual" });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* binary/non-JSON */
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

const state = {};
const steps = [];

// ---------------------------------------------------------------- boot

steps.push(async () => {
  for (let i = 0; i < 30; i += 1) {
    try {
      const { res } = await request("/api/setup/status");
      if (res.ok) return "server up";
    } catch {
      /* retry */
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return `server did not respond on ${BASE}`;
});

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
  check("setup creates admin on fresh DB -> 201", res.status === 201 && json?.ok === true,
    `status=${res.status} ${JSON.stringify(json)}`);
});

steps.push(async () => {
  const result = await login(ADMIN.email, ADMIN.password);
  state.adminCookie = result.cookie;
  check("admin login -> 200", result.res.status === 200 && !!state.adminCookie,
    `status=${result.res.status}`);
});

steps.push(async () => {
  const { res } = await request("/api/settings", {
    method: "PATCH",
    cookie: state.adminCookie,
    body: {
      officeStart: "09:00",
      graceMinutes: 15,
      halfDayMinutes: 300,
      weekendDays: "sat,sun",
    },
  });
  check("settings: 09:00 start, 15 min grace, 300 min half-day, sat/sun weekend",
    res.status === 200, `status=${res.status}`);
});

steps.push(async () => {
  const dept = await request("/api/departments", {
    method: "POST",
    cookie: state.adminCookie,
    body: { name: "Operations" },
  });
  state.departmentId = dept.json?.department?.id;
  const desig = await request("/api/designations", {
    method: "POST",
    cookie: state.adminCookie,
    body: { name: "Analyst", departmentId: state.departmentId },
  });
  state.designationId = desig.json?.designation?.id;
  check("department + designation created", dept.res.status === 201 && desig.res.status === 201,
    `dept=${state.departmentId} desig=${state.designationId}`);
});

steps.push(async () => {
  const { res, json } = await request("/api/holidays", {
    method: "POST",
    cookie: state.adminCookie,
    body: { date: "2026-11-06", name: "Smoke Holiday" },
  });
  check("holiday 2026-11-06 created", res.status === 201 && json?.holiday?.date === "2026-11-06",
    `status=${res.status}`);
});

steps.push(async () => {
  const { res, json } = await request("/api/users", {
    method: "POST",
    cookie: state.adminCookie,
    body: { name: HR.name, email: HR.email, role: "hr", password: HR.password },
  });
  check("HR user created (explicit password, mustChangePassword=false)",
    res.status === 201 && json?.user?.mustChangePassword === false,
    `status=${res.status}`);
});

steps.push(async () => {
  const result = await login(HR.email, HR.password);
  state.hrCookie = result.cookie;
  check("HR login -> 200", result.res.status === 200 && !!state.hrCookie,
    `status=${result.res.status}`);
});

// ----------------------------------------------------------- employees

async function createEmployee(spec, key) {
  const { res, json } = await request("/api/employees", {
    method: "POST",
    cookie: state.hrCookie,
    body: {
      code: spec.code,
      fullName: spec.fullName,
      email: spec.email,
      departmentId: state.departmentId,
      designationId: state.designationId,
      joinDate: spec.joinDate,
      status: "active",
      basicSalary: spec.basicSalary,
      password: spec.password,
    },
  });
  state[key] = json?.employee?.id;
  return { res, json };
}

steps.push(async () => {
  const one = await createEmployee(EMP1, "emp1");
  const two = await createEmployee(EMP2, "emp2");
  const three = await createEmployee(EMP3, "emp3");
  const four = await createEmployee(EMP4, "emp4");
  check("four employees registered (ATT001, MID002, SLB003, PRJ004)",
    one.res.status === 201 && two.res.status === 201 && three.res.status === 201 && four.res.status === 201,
    `ids=${state.emp1},${state.emp2},${state.emp3},${state.emp4}`);
});

steps.push(async () => {
  const one = await login(EMP1.email, EMP1.password);
  const two = await login(EMP2.email, EMP2.password);
  const three = await login(EMP3.email, EMP3.password);
  const four = await login(EMP4.email, EMP4.password);
  state.emp1Cookie = one.cookie;
  state.emp2Cookie = two.cookie;
  state.emp3Cookie = three.cookie;
  state.emp4Cookie = four.cookie;
  check("all four employees can log in", !!state.emp1Cookie && !!state.emp2Cookie && !!state.emp3Cookie && !!state.emp4Cookie,
    `statuses=${one.res.status},${two.res.status},${three.res.status},${four.res.status}`);
});

// ---------------------------------------------------------- attendance

steps.push(async () => {
  const first = await request("/api/attendance/check-in", {
    method: "POST",
    cookie: state.emp1Cookie,
  });
  const duplicate = await request("/api/attendance/check-in", {
    method: "POST",
    cookie: state.emp1Cookie,
  });
  check("check-in -> 201, duplicate check-in -> 409 already_checked_in",
    first.res.status === 201 &&
      first.json?.attendance?.checkInAt &&
      first.json?.attendance?.status === "missing_checkout" &&
      duplicate.res.status === 409 &&
      duplicate.json?.error === "already_checked_in",
    `first=${first.res.status} duplicate=${duplicate.res.status}/${duplicate.json?.error}`);
});

steps.push(async () => {
  const out = await request("/api/attendance/check-out", {
    method: "POST",
    cookie: state.emp1Cookie,
  });
  const again = await request("/api/attendance/check-out", {
    method: "POST",
    cookie: state.emp1Cookie,
  });
  const attendance = out.json?.attendance;
  check("check-out immediately -> half_day (worked < 5h), duplicate -> 409 already_checked_out",
    out.res.status === 200 &&
      attendance?.status === "half_day" &&
      typeof attendance?.workedMinutes === "number" &&
      attendance.workedMinutes < 300 &&
      again.res.status === 409 &&
      again.json?.error === "already_checked_out",
    `status=${attendance?.status} worked=${attendance?.workedMinutes} again=${again.res.status}`);
});

async function fileCorrection(cookie, date, checkIn, checkOut, reason) {
  return request("/api/attendance/corrections", {
    method: "POST",
    cookie,
    body: {
      date,
      requestedCheckIn: checkIn,
      requestedCheckOut: checkOut,
      reason,
    },
  });
}

steps.push(async () => {
  const first = await fileCorrection(state.emp1Cookie, "2026-09-02", "09:16", "18:00", "Late arrival");
  state.correctionLate = first.json?.correction?.id;
  const second = await fileCorrection(state.emp1Cookie, "2026-09-03", "09:00", "13:00", "Half day");
  state.correctionHalf = second.json?.correction?.id;
  check("employee files two corrections (2026-09-02, 2026-09-03) -> 201 pending",
    first.res.status === 201 &&
      first.json?.correction?.status === "pending" &&
      second.res.status === 201,
    `ids=${state.correctionLate},${state.correctionHalf}`);
});

steps.push(async () => {
  const pending = await request("/api/attendance/corrections?status=pending", {
    cookie: state.hrCookie,
  });
  check("HR sees pending correction inbox",
    pending.res.status === 200 &&
      pending.json?.items?.some((item) => item.id === state.correctionLate),
    `items=${pending.json?.items?.length}`);
});

steps.push(async () => {
  const approveLate = await request(`/api/attendance/corrections/${state.correctionLate}`, {
    method: "PATCH",
    cookie: state.hrCookie,
    body: { action: "approve", comment: "Approved" },
  });
  const approveHalf = await request(`/api/attendance/corrections/${state.correctionHalf}`, {
    method: "PATCH",
    cookie: state.hrCookie,
    body: { action: "approve" },
  });
  check("HR approves corrections -> approved",
    approveLate.res.status === 200 &&
      approveLate.json?.correction?.status === "approved" &&
      approveHalf.res.status === 200,
    `statuses=${approveLate.res.status},${approveHalf.res.status}`);
});

steps.push(async () => {
  const boardLate = await request("/api/attendance?date=2026-09-02", {
    cookie: state.hrCookie,
  });
  const row1 = boardLate.json?.items?.find((item) => item.employeeId === state.emp1);
  const row3 = boardLate.json?.items?.find((item) => item.employeeId === state.emp3);
  const row2 = boardLate.json?.items?.find((item) => item.employeeId === state.emp2);
  check("board 2026-09-02: 09:16 check-in = late; missing row = absent; pre-join excluded",
    boardLate.res.status === 200 &&
      row1?.status === "late" &&
      row3?.status === "absent" &&
      !row2 &&
      boardLate.json?.summary?.late >= 1,
    `emp1=${row1?.status} emp3=${row3?.status} emp2=${row2 ? row2.status : "excluded"}`);
});

steps.push(async () => {
  const me = await request("/api/attendance/me?month=2026-09", {
    cookie: state.emp1Cookie,
  });
  const dayLate = me.json?.days?.find((day) => day.date === "2026-09-02");
  const dayHalf = me.json?.days?.find((day) => day.date === "2026-09-03");
  const expectedAbsent = workingDays("2026-09-01", "2026-09-30") - 2;
  check("month history: late + half_day (worked 4h < 5h), 20 absent working days",
    me.res.status === 200 &&
      dayLate?.status === "late" &&
      dayHalf?.status === "half_day" &&
      dayHalf?.workedMinutes === 240 &&
      me.json?.summary?.late === 1 &&
      me.json?.summary?.halfDay === 1 &&
      me.json?.summary?.absent === expectedAbsent,
    `late=${me.json?.summary?.late} half=${me.json?.summary?.halfDay} absent=${me.json?.summary?.absent} expectedAbsent=${expectedAbsent}`);
});

// --------------------------------------------------------------- leave

steps.push(async () => {
  const types = await request("/api/leave-types", { cookie: state.adminCookie });
  const annual = types.json?.items?.find((item) => item.name === "Annual");
  state.annualId = annual?.id;
  state.casualId = types.json?.items?.find((item) => item.name === "Casual")?.id;
  state.unpaidId = types.json?.items?.find((item) => item.name === "Unpaid")?.id;
  check("default leave types seeded (Annual 14, Unpaid present)",
    types.res.status === 200 && annual?.quotaDays === 14 && !!state.unpaidId,
    `annual=${state.annualId} quota=${annual?.quotaDays} unpaid=${state.unpaidId}`);
});

steps.push(async () => {
  const { res, json } = await request("/api/leave/requests", {
    method: "POST",
    cookie: state.emp1Cookie,
    body: {
      leaveTypeId: state.annualId,
      startDate: "2026-11-05",
      endDate: "2026-11-09",
      reason: "Family event",
    },
  });
  state.leave1 = json?.request?.id;
  check("leave Thu-Mon spanning weekend + holiday -> 2 working days only",
    res.status === 201 && json?.request?.days === 2,
    `status=${res.status} days=${json?.request?.days} (expected 2)`);
});

steps.push(async () => {
  const { res, json } = await request("/api/leave/balances", { cookie: state.emp1Cookie });
  const annual = json?.items?.find((item) => item.leaveTypeId === state.annualId);
  check("balance before approval: quota 14, used 0, pending 2, remaining 12",
    res.status === 200 &&
      annual?.quota === 14 &&
      annual?.used === 0 &&
      annual?.pending === 2 &&
      annual?.remaining === 12,
    `quota=${annual?.quota} used=${annual?.used} pending=${annual?.pending} remaining=${annual?.remaining}`);
});

steps.push(async () => {
  const overlap = await request("/api/leave/requests", {
    method: "POST",
    cookie: state.emp1Cookie,
    body: {
      leaveTypeId: state.annualId,
      startDate: "2026-11-09",
      endDate: "2026-11-10",
      reason: "Overlap attempt",
    },
  });
  check("overlapping request -> 422 overlap",
    overlap.res.status === 422 && overlap.json?.error === "overlap",
    `status=${overlap.res.status} error=${overlap.json?.error}`);
});

steps.push(async () => {
  const over = await request("/api/leave/requests", {
    method: "POST",
    cookie: state.emp1Cookie,
    body: {
      leaveTypeId: state.annualId,
      startDate: "2026-12-01",
      endDate: "2026-12-31",
      reason: "Too much",
    },
  });
  check("over-balance request -> 422 insufficient_balance remaining=12",
    over.res.status === 422 &&
      over.json?.error === "insufficient_balance" &&
      over.json?.remaining === 12,
    `status=${over.res.status} error=${over.json?.error} remaining=${over.json?.remaining}`);
});

steps.push(async () => {
  const weekendOnly = await request("/api/leave/requests", {
    method: "POST",
    cookie: state.emp1Cookie,
    body: {
      leaveTypeId: state.annualId,
      startDate: "2026-11-07",
      endDate: "2026-11-08",
      reason: "Weekend",
    },
  });
  check("weekend-only range -> 400 (0 working days)",
    weekendOnly.res.status === 400 && typeof weekendOnly.json?.error === "string",
    `status=${weekendOnly.res.status} error=${weekendOnly.json?.error}`);
});

steps.push(async () => {
  const created = await request("/api/leave/requests", {
    method: "POST",
    cookie: state.emp1Cookie,
    body: {
      leaveTypeId: state.annualId,
      startDate: "2026-12-14",
      endDate: "2026-12-15",
      reason: "Cancel me",
    },
  });
  const id = created.json?.request?.id;
  const cancelled = await request(`/api/leave/requests/${id}/cancel`, {
    method: "POST",
    cookie: state.emp1Cookie,
  });
  check("employee cancels own pending request -> cancelled",
    created.res.status === 201 &&
      cancelled.res.status === 200 &&
      cancelled.json?.request?.status === "cancelled",
    `create=${created.res.status} cancel=${cancelled.res.status}/${cancelled.json?.request?.status}`);
});

steps.push(async () => {
  const approve = await request(`/api/leave/requests/${state.leave1}`, {
    method: "PATCH",
    cookie: state.hrCookie,
    body: { action: "approve", comment: "Enjoy" },
  });
  const balances = await request("/api/leave/balances", { cookie: state.emp1Cookie });
  const annual = balances.json?.items?.find((item) => item.leaveTypeId === state.annualId);
  check("HR approves leave -> approved; balance used 2, pending 0, remaining 12",
    approve.res.status === 200 &&
      approve.json?.request?.status === "approved" &&
      annual?.used === 2 &&
      annual?.pending === 0 &&
      annual?.remaining === 12,
    `status=${approve.json?.request?.status} used=${annual?.used} pending=${annual?.pending} remaining=${annual?.remaining}`);
});

steps.push(async () => {
  const created = await request("/api/leave/requests", {
    method: "POST",
    cookie: state.emp1Cookie,
    body: {
      leaveTypeId: state.annualId,
      startDate: "2026-12-21",
      endDate: "2026-12-22",
      reason: "Admin write test",
    },
  });
  state.leave3 = created.json?.request?.id;
  const adminPatch = await request(`/api/leave/requests/${state.leave3}`, {
    method: "PATCH",
    cookie: state.adminCookie,
    body: { action: "approve" },
  });
  const rejected = await request(`/api/leave/requests/${state.leave3}`, {
    method: "PATCH",
    cookie: state.hrCookie,
    body: { action: "reject", comment: "Team busy" },
  });
  check("admin PATCH leave -> 403; HR reject with comment -> rejected",
    adminPatch.res.status === 403 &&
      rejected.res.status === 200 &&
      rejected.json?.request?.status === "rejected" &&
      rejected.json?.request?.reviewComment === "Team busy",
    `admin=${adminPatch.res.status} hr=${rejected.res.status}/${rejected.json?.request?.status}`);
});

// ------------------------------------------- payroll attendance coverage

async function leaveAndApprove(cookie, leaveTypeId, startDate, endDate, reason) {
  const created = await request("/api/leave/requests", {
    method: "POST",
    cookie,
    body: { leaveTypeId, startDate, endDate, reason },
  });
  const id = created.json?.request?.id;
  const approve = await request(`/api/leave/requests/${id}`, {
    method: "PATCH",
    cookie: state.hrCookie,
    body: { action: "approve" },
  });
  return { created, approve };
}

steps.push(async () => {
  const e2 = await leaveAndApprove(
    state.emp2Cookie,
    state.annualId,
    "2026-09-14",
    "2026-09-30",
    "Paid leave covering eligible days"
  );
  check("E2 paid leave covers all 13 eligible Sep working days",
    e2.created.res.status === 201 &&
      e2.created.json?.request?.days === 13 &&
      e2.approve.res.status === 200,
    `days=${e2.created.json?.request?.days} approve=${e2.approve.res.status}`);
});

steps.push(async () => {
  const annual = await leaveAndApprove(
    state.emp3Cookie,
    state.annualId,
    "2026-09-01",
    "2026-09-18",
    "Annual remainder"
  );
  const casual = await leaveAndApprove(
    state.emp3Cookie,
    state.casualId,
    "2026-09-21",
    "2026-09-30",
    "Casual remainder"
  );
  check("E3 paid leaves cover 14 Annual + 8 Casual Sep working days",
    annual.created.json?.request?.days === 14 &&
      casual.created.json?.request?.days === 8 &&
      annual.approve.res.status === 200 &&
      casual.approve.res.status === 200,
    `annual=${annual.created.json?.request?.days} casual=${casual.created.json?.request?.days}`);
});

steps.push(async () => {
  // E4 joins 2026-09-16 (11 eligible working days): 8 absent + 3 unpaid leave.
  const unpaid = await leaveAndApprove(
    state.emp4Cookie,
    state.unpaidId,
    "2026-09-28",
    "2026-09-30",
    "Unpaid leave"
  );
  check("E4 unpaid leave covers 3 Sep working days (2026-09-28..30)",
    unpaid.created.res.status === 201 &&
      unpaid.created.json?.request?.days === 3 &&
      unpaid.approve.res.status === 200,
    `days=${unpaid.created.json?.request?.days} approve=${unpaid.approve.res.status}`);
});

// -------------------------------------------------------------- payroll

steps.push(async () => {
  const { res, json } = await request("/api/payroll/runs", {
    method: "POST",
    cookie: state.hrCookie,
    body: { month: "2026-09" },
  });
  state.runId = json?.run?.id;
  state.payslips = json?.payslips ?? [];
  check("HR creates 2026-09 draft run -> 201, 22 working days, 4 employees",
    res.status === 201 &&
      json?.run?.status === "draft" &&
      json?.run?.workingDays === EXPECT.totalWorkingDays &&
      json?.run?.employeeCount === 4,
    `status=${res.status} workingDays=${json?.run?.workingDays} employees=${json?.run?.employeeCount}`);
});

steps.push(async () => {
  const { res, json } = await request("/api/payroll/runs", {
    method: "POST",
    cookie: state.hrCookie,
    body: { month: "2026-09" },
  });
  check("duplicate run for same month -> 409 already_exists",
    res.status === 409 && json?.error === "already_exists",
    `status=${res.status} error=${json?.error}`);
});

steps.push(async () => {
  const e2 = state.payslips.find((slip) => slip.employeeId === state.emp2);
  state.e2Payslip = e2;
  check("mid-month joiner proration: gross 150000 × 13/22 = 88636.36, perDay 150000/22 = 6818.18, tax 10000, net 78636.36",
    e2?.workingDays === EXPECT.e2.eligibleDays &&
      e2?.gross === EXPECT.e2.gross &&
      e2?.tax === EXPECT.e2.tax &&
      e2?.net === EXPECT.e2.net &&
      e2?.perDay === EXPECT.e2.perDay &&
      e2?.deductions === 0 &&
      e2?.absentDays === 0,
    `workingDays=${e2?.workingDays} gross=${e2?.gross} (exp ${EXPECT.e2.gross}) tax=${e2?.tax} (exp ${EXPECT.e2.tax}) net=${e2?.net} (exp ${EXPECT.e2.net}) perDay=${e2?.perDay} (exp ${EXPECT.e2.perDay})`);
});

steps.push(async () => {
  const e4 = state.payslips.find((slip) => slip.employeeId === state.emp4);
  const expectedNet = round2(
    EXPECT.e4.gross - EXPECT.e4.deductions - EXPECT.e4.tax
  );
  check("mid-month joiner with absences: perDay 375000/22 = 17045.45, gross 187500, deductions 11 × perDay = 187500, net -68750 (no clamp)",
    e4?.workingDays === EXPECT.e4.eligibleDays &&
      e4?.perDay === EXPECT.e4.perDay &&
      e4?.gross === EXPECT.e4.gross &&
      e4?.deductions === EXPECT.e4.deductions &&
      e4?.tax === EXPECT.e4.tax &&
      e4?.net === expectedNet &&
      e4?.net === round2(e4.gross - e4.deductions - e4.tax) &&
      Math.abs(e4.workingDays * e4.perDay - e4.gross) <= 0.1,
    `workingDays=${e4?.workingDays} perDay=${e4?.perDay} gross=${e4?.gross} deductions=${e4?.deductions} tax=${e4?.tax} net=${e4?.net}`);
});

steps.push(async () => {
  const e3 = state.payslips.find((slip) => slip.employeeId === state.emp3);
  check("tax slab crossing (annual 900k): gross 75000, tax 1250, net 73750",
    e3?.gross === EXPECT.e3.gross &&
      e3?.tax === EXPECT.e3.tax &&
      e3?.net === EXPECT.e3.net &&
      e3?.deductions === 0,
    `gross=${e3?.gross} tax=${e3?.tax} net=${e3?.net}`);
});

steps.push(async () => {
  const e1 = state.payslips.find((slip) => slip.employeeId === state.emp1);
  check("full-month employee: 20 absent + 1 half-day -> deductions 83863.64, tax 2000, net 4136.36",
    e1?.absentDays === EXPECT.e1.absentDays &&
      e1?.halfDays === EXPECT.e1.halfDays &&
      e1?.deductions === EXPECT.e1.deductions &&
      e1?.tax === EXPECT.e1.tax &&
      e1?.net === EXPECT.e1.net,
    `absent=${e1?.absentDays} half=${e1?.halfDays} deductions=${e1?.deductions} (exp ${EXPECT.e1.deductions}) tax=${e1?.tax} net=${e1?.net} (exp ${EXPECT.e1.net})`);
});

steps.push(async () => {
  const sumGross = round2(state.payslips.reduce((total, slip) => total + slip.gross, 0));
  const sumNet = round2(state.payslips.reduce((total, slip) => total + slip.net, 0));
  const { res, json } = await request(`/api/payroll/runs/${state.runId}`, {
    cookie: state.hrCookie,
  });
  check("run totals equal sum of payslips",
    res.status === 200 &&
      json?.run?.totalGross === sumGross &&
      json?.run?.totalNet === sumNet &&
      json?.payslips?.length === 4,
    `gross=${json?.run?.totalGross}/${sumGross} net=${json?.run?.totalNet}/${sumNet}`);
});

steps.push(async () => {
  const finalize = await request(`/api/payroll/runs/${state.runId}/finalize`, {
    method: "POST",
    cookie: state.adminCookie,
  });
  const again = await request(`/api/payroll/runs/${state.runId}/finalize`, {
    method: "POST",
    cookie: state.adminCookie,
  });
  check("admin finalizes run, second finalize -> 409 locked",
    finalize.res.status === 200 &&
      finalize.json?.run?.status === "finalized" &&
      !!finalize.json?.run?.finalizedAt &&
      again.res.status === 409 &&
      again.json?.error === "locked",
    `finalize=${finalize.res.status}/${finalize.json?.run?.status} again=${again.res.status}/${again.json?.error}`);
});

steps.push(async () => {
  const lockedCorrection = await fileCorrection(
    state.emp2Cookie,
    "2026-09-15",
    "09:00",
    "18:00",
    "After finalize"
  );
  check("correction for finalized month -> 422 day_locked",
    lockedCorrection.res.status === 422 && lockedCorrection.json?.error === "day_locked",
    `status=${lockedCorrection.res.status} error=${lockedCorrection.json?.error}`);
});

steps.push(async () => {
  const del = await request(`/api/payroll/runs/${state.runId}`, {
    method: "DELETE",
    cookie: state.hrCookie,
  });
  check("delete finalized run -> 409 locked",
    del.res.status === 409 && del.json?.error === "locked",
    `status=${del.res.status} error=${del.json?.error}`);
});

steps.push(async () => {
  const employeeScoped = await request("/api/payroll/payslips", {
    cookie: state.emp2Cookie,
  });
  const items = employeeScoped.json?.items ?? [];
  check("employee payslip list is own-only (1 slip, 2026-09, net 78636.36)",
    employeeScoped.res.status === 200 &&
      items.length === 1 &&
      items[0]?.employeeId === state.emp2 &&
      items[0]?.month === "2026-09" &&
      items[0]?.net === EXPECT.e2.net,
    `items=${items.length} net=${items[0]?.net}`);
});

steps.push(async () => {
  const hrList = await request(`/api/payroll/payslips?employeeId=${state.emp2}`, {
    cookie: state.hrCookie,
  });
  check("HR payslip list filtered by employeeId -> 1",
    hrList.res.status === 200 && hrList.json?.items?.length === 1,
    `items=${hrList.json?.items?.length}`);
});

steps.push(async () => {
  const pdf = await fetch(`${BASE}/api/payroll/payslips/${state.e2Payslip.id}/pdf`, {
    headers: { cookie: state.emp2Cookie },
  });
  const bytes = new Uint8Array(await pdf.arrayBuffer());
  const magic = String.fromCharCode(...bytes.slice(0, 4));
  const disposition = pdf.headers.get("content-disposition") ?? "";
  check("payslip PDF -> application/pdf, %PDF magic, filename payslip-2026-09-MID002.pdf",
    pdf.status === 200 &&
      (pdf.headers.get("content-type") ?? "").startsWith("application/pdf") &&
      magic === "%PDF" &&
      disposition.includes("payslip-2026-09-MID002.pdf"),
    `status=${pdf.status} magic=${magic} disposition=${disposition}`);
});

steps.push(async () => {
  const forbidden = await fetch(`${BASE}/api/payroll/payslips/${state.e2Payslip.id}/pdf`, {
    headers: { cookie: state.emp3Cookie },
  });
  check("another employee's payslip PDF -> 403", forbidden.status === 403,
    `status=${forbidden.status}`);
});

steps.push(async () => {
  const { res, json } = await request("/api/payroll/runs", {
    method: "POST",
    cookie: state.hrCookie,
    body: { month: "2026-08" },
  });
  const del = await request(`/api/payroll/runs/${json?.run?.id}`, {
    method: "DELETE",
    cookie: state.hrCookie,
  });
  const gone = await request(`/api/payroll/runs/${json?.run?.id}`, {
    cookie: state.hrCookie,
  });
  check("draft run can be deleted -> {ok:true}, then 404",
    res.status === 201 &&
      del.res.status === 200 &&
      del.json?.ok === true &&
      gone.res.status === 404,
    `create=${res.status} delete=${del.res.status} get=${gone.res.status}`);
});

steps.push(async () => {
  const employeeBoard = await request("/api/attendance?date=2026-09-02", {
    cookie: state.emp1Cookie,
  });
  const employeeRun = await request("/api/payroll/runs", {
    method: "POST",
    cookie: state.emp1Cookie,
    body: { month: "2026-07" },
  });
  const employeeBalances = await request(
    `/api/leave/balances?employeeId=${state.emp3}`,
    { cookie: state.emp1Cookie }
  );
  const ownBalances = employeeBalances.json?.items ?? [];
  check("employee blocked from HR board/run-create; balances forced to self",
    employeeBoard.res.status === 403 &&
      employeeRun.res.status === 403 &&
      ownBalances.every((item) => item.employeeId === state.emp1),
    `board=${employeeBoard.res.status} run=${employeeRun.res.status} balanceEmployeeIds=${[...new Set(ownBalances.map((i) => i.employeeId))].join(",")}`);
});

// ------------------------------------------------------------- DB checks

steps.push(async () => {
  const { DatabaseSync } = await import("node:sqlite");
  const db = new DatabaseSync(DB_FILE);
  try {
    const att = db
      .prepare(
        "SELECT status, source FROM attendance WHERE employee_id = ? AND date = '2026-09-02'"
      )
      .get(state.emp1);
    const notificationCount = Number(
      db.prepare("SELECT COUNT(*) AS c FROM notifications").get().c
    );
    const e2User = db
      .prepare("SELECT id FROM users WHERE employee_id = ?")
      .get(state.emp2);
    const e2PayslipNotifications = Number(
      db
        .prepare(
          "SELECT COUNT(*) AS c FROM notifications WHERE user_id = ? AND title LIKE 'Payslip%'"
        )
        .get(e2User.id).c
    );
    const leaveNotifications = Number(
      db
        .prepare("SELECT COUNT(*) AS c FROM notifications WHERE title LIKE 'Leave%'")
        .get().c
    );
    const auditActions = db
      .prepare("SELECT action, entity, COUNT(*) AS c FROM audit_logs GROUP BY action, entity")
      .all()
      .map((row) => `${row.action}:${row.entity}`);
    const hasFinalizeAudit = auditActions.includes("finalize:payroll_run");
    const hasCorrectionAudit = auditActions.includes("update:attendance_correction");
    const hasLeaveAudit = auditActions.includes("update:leave_request");

    check("DB: correction upsert wrote source=correction status=late",
      att?.status === "late" && att?.source === "correction",
      `status=${att?.status} source=${att?.source}`);
    check("DB: notifications for leave decisions + payslip finalize",
      notificationCount >= 4 && e2PayslipNotifications >= 1 && leaveNotifications >= 2,
      `total=${notificationCount} e2Payslip=${e2PayslipNotifications} leave=${leaveNotifications}`);
    check("DB: audit rows for leave, correction and payroll finalize",
      hasFinalizeAudit && hasCorrectionAudit && hasLeaveAudit,
      `hasFinalize=${hasFinalizeAudit} hasCorrection=${hasCorrectionAudit} hasLeave=${hasLeaveAudit}`);
  } finally {
    db.close();
  }
});

// ------------------------------------------------------------------ main

async function main() {
  const up = await steps[0]();
  if (up !== "server up") {
    console.log(`FAIL  server up — ${up}`);
    process.exit(1);
  }
  console.log("PASS  server up");
  for (const step of steps.slice(1)) {
    try {
      await step();
    } catch (err) {
      console.error("FAIL  step threw:", err);
      failed = true;
    }
  }
  console.log(failed ? "\nSMOKE: FAIL" : "\nSMOKE: ALL PASS");
  process.exit(failed ? 1 : 0);
}

main();
