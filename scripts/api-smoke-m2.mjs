#!/usr/bin/env node
/**
 * M1 + M2 API smoke test against a running HCM server and a fresh DB.
 *
 *   DATABASE_URL=./.tmp/m2.db npx next start -p 3002
 *   BASE_URL=http://localhost:3002 node scripts/api-smoke-m2.mjs
 *
 * No dependencies. Exits non-zero when any step fails.
 */
import path from "node:path";

const BASE = process.env.BASE_URL || "http://localhost:3002";
const DB_FILE = path.resolve(process.cwd(), process.env.SMOKE_DB || "./.tmp/m2.db");

const ADMIN = { name: "Smoke Admin", email: "admin@hcm.local", password: "admin12345" };
const COMPANY = "M2 Smoke Co";
const HR = { name: "HR Manager", email: "hr@hcm.local", password: "hrpass12345" };
const EMPLOYEE = {
  code: "EMP001",
  fullName: "Ali Khan",
  email: "ali@hcm.local",
  password: "tempPass1234",
};

let failed = false;

function check(name, cond, detail) {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${detail ? `  — ${detail}` : ""}`);
  if (!cond) failed = true;
  return !!cond;
}

async function request(
  urlPath,
  { method = "GET", body, cookie, form } = {}
) {
  const headers = {};
  if (cookie) headers.cookie = cookie;
  let payload;
  if (form) {
    payload = form;
  } else if (body !== undefined) {
    headers["content-type"] = "application/json";
    payload = JSON.stringify(body);
  }

  const res = await fetch(BASE + urlPath, {
    method,
    headers,
    body: payload,
    redirect: "manual",
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* non-JSON (CSV, etc.) */
  }
  return { res, json, text };
}

function cookieFrom(res) {
  const list = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
  const raw = list.find((value) => value.startsWith("hcm_session="));
  if (!raw) return "";
  const pair = raw.split(";")[0];
  if (pair.endsWith("=")) return "";
  return pair;
}

async function login(email, password) {
  const result = await request("/api/auth/login", {
    method: "POST",
    body: { email, password },
  });
  return { ...result, cookie: cookieFrom(result.res) };
}

function csvEscape(value) {
  const text = value === null || value === undefined ? "" : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function toCsv(rows) {
  return rows.map((cells) => cells.map(csvEscape).join(",")).join("\n") + "\n";
}

const state = {};
const steps = [];

// ---------------------------------------------------------------- setup

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
  check(
    "setup creates first admin (fresh DB) -> 201",
    res.status === 201 && json?.ok === true,
    `status=${res.status} ${JSON.stringify(json)}`
  );
});

steps.push(async () => {
  const result = await login(ADMIN.email, ADMIN.password);
  state.adminCookie = result.cookie;
  check(
    "admin login -> 200 + cookie",
    result.res.status === 200 && !!state.adminCookie && result.json?.user?.role === "admin",
    `status=${result.res.status}`
  );
});

steps.push(async () => {
  const { res, json } = await request("/api/settings", { cookie: state.adminCookie });
  check(
    "GET /api/settings -> {settings}",
    res.status === 200 && json?.settings?.companyName === COMPANY,
    `status=${res.status}`
  );
});

steps.push(async () => {
  const { res, json } = await request("/api/settings", {
    method: "PATCH",
    cookie: state.adminCookie,
    body: {
      officeStart: "09:00",
      graceMinutes: 20,
      halfDayMinutes: 300,
      weekendDays: "sat,sun",
      officeLat: 24.8607,
      officeLng: 67.0011,
      radiusM: 200,
    },
  });
  const settings = json?.settings;
  check(
    "admin PATCH settings -> 200 (grace 20, radius 200)",
    res.status === 200 &&
      settings?.graceMinutes === 20 &&
      settings?.radiusM === 200 &&
      settings?.officeLat === 24.8607,
    `status=${res.status} grace=${settings?.graceMinutes}`
  );
});

steps.push(async () => {
  const { res, json } = await request("/api/settings", {
    method: "PATCH",
    cookie: state.adminCookie,
    body: { officeLat: 24.9, officeLng: null },
  });
  check(
    "settings PATCH lat with lng cleared -> 400 both-or-neither",
    res.status === 400 && typeof json?.error === "string",
    `status=${res.status} error=${json?.error}`
  );
});

// ------------------------------------------------------------------ org

steps.push(async () => {
  const { res, json } = await request("/api/departments", {
    method: "POST",
    cookie: state.adminCookie,
    body: { name: "Engineering" },
  });
  state.departmentId = json?.department?.id;
  check(
    "POST /api/departments -> 201 {department}",
    res.status === 201 &&
      json?.department?.name === "Engineering" &&
      json?.department?.employeeCount === 0,
    `status=${res.status} id=${state.departmentId}`
  );
});

steps.push(async () => {
  const { res, json } = await request("/api/designations", {
    method: "POST",
    cookie: state.adminCookie,
    body: { name: "Software Engineer", departmentId: state.departmentId },
  });
  state.designationId = json?.designation?.id;
  check(
    "POST /api/designations -> 201 {designation}",
    res.status === 201 &&
      json?.designation?.name === "Software Engineer" &&
      json?.designation?.departmentId === state.departmentId,
    `status=${res.status} id=${state.designationId}`
  );
});

steps.push(async () => {
  const { res, json } = await request("/api/leave-types", { cookie: state.adminCookie });
  const items = json?.items ?? [];
  const annual = items.find((item) => item.name === "Annual");
  const sick = items.find((item) => item.name === "Sick");
  const casual = items.find((item) => item.name === "Casual");
  const unpaid = items.find((item) => item.name === "Unpaid");
  check(
    "GET /api/leave-types seeds Annual 14 / Sick 8 / Casual 10 / Unpaid 0",
    res.status === 200 &&
      annual?.quotaDays === 14 &&
      sick?.quotaDays === 8 &&
      casual?.quotaDays === 10 &&
      unpaid?.quotaDays === 0 &&
      unpaid?.paid === false,
    `status=${res.status} items=${items.map((i) => i.name).join(",")}`
  );
});

steps.push(async () => {
  const { res, json } = await request("/api/leave-types", {
    method: "POST",
    cookie: state.adminCookie,
    body: { name: "Study", quotaDays: 5, paid: true },
  });
  state.leaveTypeId = json?.leaveType?.id;
  check(
    "POST /api/leave-types -> 201 {leaveType}",
    res.status === 201 && json?.leaveType?.quotaDays === 5,
    `status=${res.status}`
  );
});

steps.push(async () => {
  const { res, json } = await request("/api/holidays", {
    method: "POST",
    cookie: state.adminCookie,
    body: { date: "2026-12-25", name: "Christmas" },
  });
  state.holidayId = json?.holiday?.id;
  check(
    "POST /api/holidays -> 201 {holiday}",
    res.status === 201 && json?.holiday?.date === "2026-12-25",
    `status=${res.status}`
  );
});

steps.push(async () => {
  const { res, json } = await request("/api/holidays?year=2026", {
    cookie: state.adminCookie,
  });
  check(
    "GET /api/holidays?year=2026 includes the holiday",
    res.status === 200 &&
      Array.isArray(json?.items) &&
      json.items.some((item) => item.date === "2026-12-25"),
    `status=${res.status}`
  );
});

steps.push(async () => {
  const { res, json } = await request("/api/departments", {
    method: "POST",
    cookie: state.adminCookie,
    body: { name: "engineering" },
  });
  check(
    "duplicate department (case-insensitive) -> 409 duplicate field=name",
    res.status === 409 && json?.error === "duplicate" && json?.field === "name",
    `status=${res.status} ${JSON.stringify(json)}`
  );
});

// ----------------------------------------------------------------- users

steps.push(async () => {
  const { res, json } = await request("/api/users", {
    method: "POST",
    cookie: state.adminCookie,
    body: { name: HR.name, email: HR.email, role: "hr" },
  });
  state.hrTemp = json?.temporaryPassword;
  check(
    "admin POST /api/users (HR) -> 201 temp password + mustChangePassword",
    res.status === 201 &&
      typeof state.hrTemp === "string" &&
      state.hrTemp.length >= 8 &&
      json?.user?.role === "hr" &&
      json?.user?.mustChangePassword === true,
    `status=${res.status} temp=${state.hrTemp ? "present" : "missing"}`
  );
});

steps.push(async () => {
  const result = await login(HR.email, state.hrTemp);
  state.hrCookie = result.cookie;
  check(
    "HR login with temp password -> 200 mustChangePassword=true",
    result.res.status === 200 &&
      result.json?.user?.mustChangePassword === true &&
      !!state.hrCookie,
    `status=${result.res.status}`
  );
});

steps.push(async () => {
  const { res } = await request("/api/auth/change-password", {
    method: "POST",
    cookie: state.hrCookie,
    body: { currentPassword: state.hrTemp, newPassword: HR.password },
  });
  const relogin = await login(HR.email, HR.password);
  state.hrCookie = relogin.cookie;
  check(
    "HR change-password -> 200, re-login with new password -> 200",
    res.status === 200 && relogin.res.status === 200 && !!state.hrCookie,
    `change=${res.status} login=${relogin.res.status}`
  );
});

// ------------------------------------------------------------- employees

steps.push(async () => {
  const { res, json } = await request("/api/employees", {
    method: "POST",
    cookie: state.hrCookie,
    body: {
      code: EMPLOYEE.code,
      fullName: EMPLOYEE.fullName,
      email: EMPLOYEE.email,
      phone: "+92 300 1234567",
      address: "Karachi",
      departmentId: state.departmentId,
      designationId: state.designationId,
      joinDate: "2026-01-05",
      status: "active",
      basicSalary: 50000,
      password: EMPLOYEE.password,
    },
  });
  state.employeeId = json?.employee?.id;
  const employee = json?.employee;
  check(
    "HR POST /api/employees -> 201 employee + temp password",
    res.status === 201 &&
      employee?.code === EMPLOYEE.code &&
      employee?.grossSalary === 75000 &&
      employee?.departmentName === "Engineering" &&
      employee?.hasLogin === true &&
      typeof json?.temporaryPassword === "string",
    `status=${res.status} id=${state.employeeId} gross=${employee?.grossSalary}`
  );
});

steps.push(async () => {
  const { res, json } = await request("/api/employees", {
    method: "POST",
    cookie: state.hrCookie,
    body: {
      code: "EMP002",
      fullName: "Sara Ahmed",
      email: "sara@hcm.local",
      departmentId: state.departmentId,
      designationId: state.designationId,
      joinDate: "2026-02-01",
      status: "probation",
      basicSalary: 30000,
    },
  });
  state.secondEmployeeId = json?.employee?.id;
  check(
    "HR registers second employee -> 201",
    res.status === 201 && json?.employee?.grossSalary === 45000,
    `status=${res.status}`
  );
});

steps.push(async () => {
  const { res, json } = await request("/api/employees?q=ALI&page=1&pageSize=10", {
    cookie: state.hrCookie,
  });
  check(
    "HR search q=ALI (case-insensitive) -> total 1",
    res.status === 200 && json?.total === 1 && json?.items?.[0]?.code === EMPLOYEE.code,
    `status=${res.status} total=${json?.total}`
  );
});

steps.push(async () => {
  const page1 = await request("/api/employees?page=1&pageSize=1", {
    cookie: state.hrCookie,
  });
  const page2 = await request("/api/employees?page=2&pageSize=1", {
    cookie: state.hrCookie,
  });
  check(
    "HR pagination pageSize=1 -> 2 pages, total 2",
    page1.json?.total === 2 &&
      page1.json?.items?.length === 1 &&
      page2.json?.items?.length === 1 &&
      page1.json?.items?.[0]?.code !== page2.json?.items?.[0]?.code,
    `p1=${page1.json?.items?.[0]?.code} p2=${page2.json?.items?.[0]?.code}`
  );
});

steps.push(async () => {
  const { res, json } = await request(
    `/api/employees/${state.employeeId}/overview`,
    { cookie: state.hrCookie }
  );
  const annual = json?.leave?.find((row) => row.typeName === "Annual");
  check(
    "HR employee overview 360 -> employee + attendance + leave + payslips",
    res.status === 200 &&
      json?.employee?.id === state.employeeId &&
      json?.attendance?.presentDays === 0 &&
      Array.isArray(json?.attendance?.last30) &&
      annual?.quota === 14 &&
      annual?.remaining === 14 &&
      Array.isArray(json?.payslips),
    `status=${res.status} annual=${annual?.quota}/${annual?.remaining}`
  );
});

// ------------------------------------------------------- employee access

steps.push(async () => {
  const result = await login(EMPLOYEE.email, EMPLOYEE.password);
  state.employeeCookie = result.cookie;
  check(
    "employee login with temp password -> 200 mustChangePassword=true",
    result.res.status === 200 &&
      result.json?.user?.mustChangePassword === true &&
      result.json?.user?.employeeId === state.employeeId,
    `status=${result.res.status}`
  );
});

steps.push(async () => {
  const me = await request(`/api/employees/${state.employeeId}`, {
    cookie: state.employeeCookie,
  });
  const other = await request(`/api/employees/${state.secondEmployeeId}`, {
    cookie: state.employeeCookie,
  });
  const list = await request("/api/employees", { cookie: state.employeeCookie });
  check(
    "employee sees own row only (own=200, other=403, list total=1)",
    me.res.status === 200 &&
      other.res.status === 403 &&
      list.json?.total === 1 &&
      list.json?.items?.[0]?.id === state.employeeId,
    `own=${me.res.status} other=${other.res.status} total=${list.json?.total}`
  );
});

steps.push(async () => {
  const change = await request("/api/auth/change-password", {
    method: "POST",
    cookie: state.employeeCookie,
    body: {
      currentPassword: EMPLOYEE.password,
      newPassword: "employeePass99",
    },
  });
  state.employeeCookie = cookieFrom(change.res) || state.employeeCookie;
  const me = await request("/api/auth/me", { cookie: state.employeeCookie });
  const relogin = await login(EMPLOYEE.email, "employeePass99");
  state.employeeCookie = relogin.cookie;
  check(
    "forced change-password flow -> mustChangePassword=false, new login works",
    change.res.status === 200 &&
      me.json?.user?.mustChangePassword === false &&
      relogin.res.status === 200,
    `change=${change.res.status} me=${JSON.stringify(me.json?.user?.mustChangePassword)} relogin=${relogin.res.status}`
  );
});

steps.push(async () => {
  const { res, json } = await request(`/api/employees/${state.employeeId}`, {
    method: "PATCH",
    cookie: state.employeeCookie,
    body: { phone: "+92 311 7654321", address: "Lahore" },
  });
  check(
    "employee PATCH own phone/address -> 200 updated",
    res.status === 200 &&
      json?.employee?.phone === "+92 311 7654321" &&
      json?.employee?.address === "Lahore",
    `status=${res.status}`
  );
});

steps.push(async () => {
  const { res, json } = await request(`/api/employees/${state.employeeId}`, {
    method: "PATCH",
    cookie: state.employeeCookie,
    body: { basicSalary: 999999 },
  });
  check(
    "employee PATCH own salary -> 403",
    res.status === 403,
    `status=${res.status} ${JSON.stringify(json)}`
  );
});

// ------------------------------------------------------------------ CSV

steps.push(async () => {
  const { res, text } = await request("/api/employees/export", {
    cookie: state.hrCookie,
  });
  const disposition = res.headers.get("content-disposition") ?? "";
  const firstLine = text.split(/\r?\n/)[0] ?? "";
  check(
    "HR export CSV -> text/csv attachment, header + EMP001",
    res.status === 200 &&
      (res.headers.get("content-type") ?? "").startsWith("text/csv") &&
      disposition.includes("employees.csv") &&
      firstLine ===
        "code,full_name,email,phone,address,department,designation,join_date,status,basic_salary" &&
      text.includes("EMP001") &&
      text.includes('"Ali Khan"') === false,
    `status=${res.status} disposition=${disposition}`
  );
});

const IMPORT_CSV = toCsv([
  [
    "code",
    "full_name",
    "email",
    "phone",
    "address",
    "department",
    "designation",
    "join_date",
    "status",
    "basic_salary",
  ],
  [
    "EMP101",
    "Bilal, Ahmed",
    "bilal@hcm.local",
    "+92 300 0000001",
    "House 1, Street 2",
    "Engineering",
    "Software Engineer",
    "2026-02-01",
    "probation",
    "45000",
  ],
  [
    "EMP102",
    "Hina Riaz",
    "hina@hcm.local",
    "",
    "",
    "Engineering",
    "Software Engineer",
    "2026-03-01",
    "active",
    "60000",
  ],
  [
    "EMP103",
    "Bad Row",
    "not-an-email",
    "",
    "",
    "Engineering",
    "Software Engineer",
    "2026-04-01",
    "active",
    "50000",
  ],
]);

function importForm() {
  const form = new FormData();
  form.append("file", new Blob([IMPORT_CSV], { type: "text/csv" }), "employees.csv");
  return form;
}

steps.push(async () => {
  const { res, json } = await request("/api/employees/import?dryRun=1", {
    method: "POST",
    cookie: state.hrCookie,
    form: importForm(),
  });
  const list = await request("/api/employees", { cookie: state.hrCookie });
  check(
    "CSV import dry-run -> total 3, valid 2, errors 1, nothing written",
    res.status === 200 &&
      json?.dryRun === true &&
      json?.total === 3 &&
      json?.valid === 2 &&
      json?.errors?.length === 1 &&
      json?.created?.length === 0 &&
      list.json?.total === 2,
    `status=${res.status} total=${json?.total} valid=${json?.valid} errors=${json?.errors?.length} dbTotal=${list.json?.total}`
  );
});

steps.push(async () => {
  const { res, json } = await request("/api/employees/import?dryRun=0", {
    method: "POST",
    cookie: state.hrCookie,
    form: importForm(),
  });
  const list = await request("/api/employees?q=EMP10", { cookie: state.hrCookie });
  check(
    "CSV real import -> created 2 (quoted comma name parsed), errors 1",
    res.status === 200 &&
      json?.dryRun === false &&
      json?.created?.length === 2 &&
      json?.created?.some((row) => row.fullName === "Bilal, Ahmed") &&
      json?.created?.some((row) => row.grossSalary === 90000) &&
      list.json?.total === 2,
    `status=${res.status} created=${json?.created?.length} errors=${json?.errors?.length}`
  );
});

steps.push(async () => {
  const { res, text } = await request("/api/employees/export", {
    cookie: state.hrCookie,
  });
  check(
    "export CSV escapes embedded commas after import",
    res.status === 200 && text.includes('"Bilal, Ahmed"') && text.includes('"House 1, Street 2"'),
    `status=${res.status}`
  );
});

// ---------------------------------------------------------------- audit

steps.push(async () => {
  const { DatabaseSync } = await import("node:sqlite");
  const db = new DatabaseSync(DB_FILE);
  try {
    const count = Number(db.prepare("SELECT COUNT(*) AS c FROM audit_logs").get().c);
    const importRows = Number(
      db.prepare("SELECT COUNT(*) AS c FROM audit_logs WHERE action = 'import'").get().c
    );
    const employeeUpdates = Number(
      db
        .prepare(
          "SELECT COUNT(*) AS c FROM audit_logs WHERE entity = 'employee' AND action = 'update' AND after_json IS NOT NULL"
        )
        .get().c
    );
    const leaks = Number(
      db
        .prepare(
          "SELECT COUNT(*) AS c FROM audit_logs WHERE COALESCE(before_json,'') LIKE '%password_hash%' OR COALESCE(after_json,'') LIKE '%password_hash%'"
        )
        .get().c
    );
    check(
      "audit_logs has rows, import + employee update snapshots, no secrets",
      count >= 10 && importRows >= 1 && employeeUpdates >= 1 && leaks === 0,
      `count=${count} import=${importRows} employeeUpdates=${employeeUpdates} leaks=${leaks}`
    );
  } finally {
    db.close();
  }
});

// ----------------------------------------------------------- permissions

steps.push(async () => {
  const { res, json } = await request("/api/settings", {
    method: "PATCH",
    cookie: state.hrCookie,
    body: { companyName: "HR Override" },
  });
  check(
    "HR PATCH /api/settings -> 403",
    res.status === 403,
    `status=${res.status} ${JSON.stringify(json)}`
  );
});

steps.push(async () => {
  const { res } = await request("/api/users", {
    method: "POST",
    cookie: state.hrCookie,
    body: { name: "Nope", email: "nope@hcm.local", role: "hr" },
  });
  check("HR POST /api/users -> 403", res.status === 403, `status=${res.status}`);
});

steps.push(async () => {
  const settings = await request("/api/settings", { cookie: state.employeeCookie });
  const exportCsv = await request("/api/employees/export", {
    cookie: state.employeeCookie,
  });
  check(
    "employee GET /api/settings -> 403 and export -> 403",
    settings.res.status === 403 && exportCsv.res.status === 403,
    `settings=${settings.res.status} export=${exportCsv.res.status}`
  );
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
