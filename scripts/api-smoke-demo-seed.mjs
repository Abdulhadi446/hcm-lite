#!/usr/bin/env node
/**
 * Demo seed smoke test: API flow + Admin UI flow on fresh databases.
 *
 *   node scripts/api-smoke-demo-seed.mjs
 *
 * Because a `next dev` process can hold the main `.next` lock, this script
 * builds and starts a production server from an isolated copy in
 * `/tmp/opencode` (hard-link copy when the filesystem allows it). It cleans up
 * its servers, work directory and SQLite files afterwards.
 *
 * API server:  http://localhost:3012  -> ./.tmp/seed.db
 * UI server:   http://localhost:3013  -> ./.tmp/seed-ui.db
 */
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { chromium } from "playwright-core";

const REPO = process.cwd();
const PORT = Number(process.env.PORT || 3012);
const UI_PORT = Number(process.env.UI_PORT || 3013);
const BASE = process.env.BASE_URL || `http://localhost:${PORT}`;
const UI_BASE = process.env.UI_BASE_URL || `http://localhost:${UI_PORT}`;
const DB_FILE = path.resolve(REPO, process.env.SMOKE_DB || "./.tmp/seed.db");
const UI_DB_FILE = path.resolve(REPO, process.env.SMOKE_UI_DB || "./.tmp/seed-ui.db");
const WORK_ROOT = "/tmp/opencode";
const WORK_DIR = path.join(WORK_ROOT, `demo-seed-${process.pid}`);
const LOG_DIR = path.resolve(REPO, ".agent-logs");
const SHOT_DIR = path.join(LOG_DIR, "shots");
const STAMP = new Date().toISOString().replace(/[:.]/g, "-");
const BUILD_LOG = path.join(LOG_DIR, `seed-build-${STAMP}.log`);
const API_LOG = path.join(LOG_DIR, `seed-api-server-${STAMP}.log`);
const UI_LOG = path.join(LOG_DIR, `seed-ui-server-${STAMP}.log`);

const ADMIN = { name: "Demo Admin", email: "admin@hcm.local", password: "admin12345" };
const HR = { name: "Hira HR", email: "hr@hcm.local" };
const COMPANY = "Seed Demo Co";
const DEMO_PASSWORD = "Demo@12345";
const EMPLOYEE_EMAILS = [
  "ayesha.khan@hcm.demo",
  "bilal.ahmed@hcm.demo",
  "hina.siddiqui@hcm.demo",
  "usman.raza@hcm.demo",
  "sana.malik@hcm.demo",
  "imran.sheikh@hcm.demo",
];

let failed = false;
let apiServer = null;
let uiServer = null;
let browser = null;

function check(name, cond, detail) {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${detail ? `  — ${detail}` : ""}`);
  if (!cond) failed = true;
  return !!cond;
}

async function request(base, urlPath, { method = "GET", body, cookie } = {}) {
  const headers = {};
  if (cookie) headers.cookie = cookie;
  let payload;
  if (body !== undefined) {
    headers["content-type"] = "application/json";
    payload = JSON.stringify(body);
  }
  const res = await fetch(base + urlPath, {
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

async function login(base, email, password) {
  const result = await request(base, "/api/auth/login", {
    method: "POST",
    body: { email, password },
  });
  return { ...result, cookie: cookieFrom(result.res) };
}

function removeDatabase(file) {
  for (const suffix of ["", "-wal", "-shm"]) {
    fs.rmSync(file + suffix, { force: true });
  }
}

async function setup(base) {
  return request(base, "/api/setup", {
    method: "POST",
    body: {
      companyName: COMPANY,
      adminName: ADMIN.name,
      adminEmail: ADMIN.email,
      adminPassword: ADMIN.password,
    },
  });
}

// ------------------------------------------------------------ isolated build

function createIsolatedCopy() {
  fs.mkdirSync(WORK_ROOT, { recursive: true });
  fs.rmSync(WORK_DIR, { recursive: true, force: true });

  // Preferred: hard-link copy of the whole repo (cheap, keeps node_modules).
  const hardlink = spawnSync("cp", ["-al", `${REPO}/.`, WORK_DIR], {
    encoding: "utf8",
  });

  if (hardlink.status === 0) {
    // The copy shares inodes with the main repo's .next; unlink it here so the
    // production build is independent and never disturbs a running dev server.
    fs.rmSync(path.join(WORK_DIR, ".next"), { recursive: true, force: true });
    return;
  }

  // /tmp is often a different filesystem, where hard links are impossible.
  fs.rmSync(WORK_DIR, { recursive: true, force: true });
  fs.mkdirSync(WORK_DIR, { recursive: true });
  const rsync = spawnSync(
    "rsync",
    [
      "-a",
      "--exclude",
      ".git",
      "--exclude",
      ".next",
      "--exclude",
      "node_modules",
      "--exclude",
      ".tmp",
      "--exclude",
      ".agent-logs",
      `${REPO}/`,
      `${WORK_DIR}/`,
    ],
    { encoding: "utf8" }
  );
  if (rsync.status !== 0) {
    throw new Error(`Could not copy the repo to ${WORK_DIR}: ${rsync.stderr}`);
  }

  // Turbopack refuses to compile packages that live outside its workspace
  // root, so a symlinked node_modules is not enough — copy it for real.
  const modules = spawnSync(
    "cp",
    ["-a", "--reflink=auto", path.join(REPO, "node_modules"), path.join(WORK_DIR, "node_modules")],
    { encoding: "utf8" }
  );
  if (modules.status !== 0) {
    throw new Error(`Could not copy node_modules to ${WORK_DIR}: ${modules.stderr}`);
  }
}

function buildIsolatedCopy() {
  fs.mkdirSync(LOG_DIR, { recursive: true });
  const nextBin = path.join(WORK_DIR, "node_modules/next/dist/bin/next");
  const logFd = fs.openSync(BUILD_LOG, "a");
  console.log(`Building isolated copy in ${WORK_DIR} (log: ${BUILD_LOG})`);
  const result = spawnSync(process.execPath, [nextBin, "build"], {
    cwd: WORK_DIR,
    env: {
      ...process.env,
      DATABASE_URL: DB_FILE,
      NEXT_TELEMETRY_DISABLED: "1",
    },
    stdio: ["ignore", logFd, logFd],
    timeout: 10 * 60 * 1000,
  });
  fs.closeSync(logFd);
  if (result.status !== 0) {
    throw new Error(`next build failed (status ${result.status}); see ${BUILD_LOG}`);
  }
}

function startServer({ port, dbFile, logPath }) {
  fs.mkdirSync(path.dirname(dbFile), { recursive: true });
  removeDatabase(dbFile);

  const log = fs.createWriteStream(logPath, { flags: "a" });
  const child = spawn(
    process.execPath,
    [path.join(WORK_DIR, "node_modules/next/dist/bin/next"), "start", "-p", String(port)],
    {
      cwd: WORK_DIR,
      env: {
        ...process.env,
        DATABASE_URL: dbFile,
        NEXT_TELEMETRY_DISABLED: "1",
      },
      stdio: ["ignore", "pipe", "pipe"],
    }
  );
  child.stdout.pipe(log);
  child.stderr.pipe(log);
  child.on("exit", (code) => {
    if (code && code !== 0) console.error(`[server:${port}] exited with ${code}; see ${logPath}`);
  });
  return { child, log, port, dbFile };
}

async function stopServer(server) {
  if (!server) return;
  const { child, log } = server;
  if (!child.killed) {
    child.kill("SIGTERM");
    await new Promise((resolve) => {
      const timer = setTimeout(() => {
        child.kill("SIGKILL");
        resolve();
      }, 5000);
      child.once("exit", () => {
        clearTimeout(timer);
        resolve();
      });
    });
  }
  log?.end();
}

async function waitForServer(base) {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    try {
      const { res } = await request(base, "/api/setup/status");
      if (res.ok) return true;
    } catch {
      /* retry */
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return false;
}

function previousMonth(monthIso) {
  const [year, month] = monthIso.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 2, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

// --------------------------------------------------------------- API checks

async function runApiPhase() {
  apiServer = startServer({ port: PORT, dbFile: DB_FILE, logPath: API_LOG });
  if (!(await waitForServer(BASE))) throw new Error(`API server did not start; see ${API_LOG}`);

  const setupResult = await setup(BASE);
  check(
    "fresh DB: setup creates the Admin -> 201",
    setupResult.res.status === 201 && setupResult.json?.ok === true,
    `status=${setupResult.res.status}`
  );

  const adminLogin = await login(BASE, ADMIN.email, ADMIN.password);
  const adminCookie = adminLogin.cookie;
  check(
    "Admin login -> 200 + cookie",
    adminLogin.res.status === 200 &&
      adminLogin.json?.user?.role === "admin" &&
      !!adminCookie,
    `status=${adminLogin.res.status}`
  );

  const emptyStatus = await request(BASE, "/api/demo/seed", { cookie: adminCookie });
  check(
    "GET /api/demo/seed before seeding -> employees 0, seeded false",
    emptyStatus.res.status === 200 &&
      emptyStatus.json?.employees === 0 &&
      emptyStatus.json?.seeded === false,
    JSON.stringify(emptyStatus.json)
  );

  const seedResult = await request(BASE, "/api/demo/seed", {
    method: "POST",
    cookie: adminCookie,
  });
  const created = seedResult.json?.created;
  check(
    "POST /api/demo/seed -> 201",
    seedResult.res.status === 201,
    `status=${seedResult.res.status} ${seedResult.text.slice(0, 200)}`
  );
  check(
    "created counts: 4 departments, 5 designations, 6 employees, 3 leave, 2 payroll, 2 announcements",
    created?.departments === 4 &&
      created?.designations === 5 &&
      created?.employees === 6 &&
      created?.leaveRequests === 3 &&
      created?.payrollRuns === 2 &&
      created?.announcements === 2,
    JSON.stringify(created)
  );
  check(
    "created attendance rows > 0",
    typeof created?.attendanceDays === "number" && created.attendanceDays > 0,
    `attendanceDays=${created?.attendanceDays}`
  );
  check(
    "credentials: 6 logins, every password Demo@12345",
    Array.isArray(seedResult.json?.credentials) &&
      seedResult.json.credentials.length === 6 &&
      seedResult.json.credentials.every((item) => item.password === DEMO_PASSWORD),
    `${seedResult.json?.credentials?.length ?? 0} credentials`
  );

  const employeeLogins = await Promise.all(
    EMPLOYEE_EMAILS.map((email) => login(BASE, email, DEMO_PASSWORD))
  );
  check(
    "all six sample employees can log in without a password change",
    employeeLogins.every(
      (result) =>
        result.res.status === 200 &&
        result.json?.user?.role === "employee" &&
        result.json?.user?.mustChangePassword === false
    ),
    employeeLogins
      .map((result) => `${result.json?.user?.email ?? "?"}:${result.res.status}`)
      .join(", ")
  );

  const status = await request(BASE, "/api/demo/seed", { cookie: adminCookie });
  check(
    "GET status after seeding -> employees 6, seeded true",
    status.res.status === 200 && status.json?.employees === 6 && status.json?.seeded === true,
    JSON.stringify(status.json)
  );

  const secondSeed = await request(BASE, "/api/demo/seed", {
    method: "POST",
    cookie: adminCookie,
  });
  check(
    "second seed -> 409 not_empty",
    secondSeed.res.status === 409 && secondSeed.json?.error === "not_empty",
    `status=${secondSeed.res.status} ${secondSeed.text.slice(0, 120)}`
  );

  const hrCreated = await request(BASE, "/api/users", {
    method: "POST",
    cookie: adminCookie,
    body: { name: HR.name, email: HR.email, role: "hr" },
  });
  const hrLogin = await login(BASE, HR.email, hrCreated.json?.temporaryPassword);
  const hrSeed = await request(BASE, "/api/demo/seed", {
    method: "POST",
    cookie: hrLogin.cookie,
  });
  check(
    "HR seed attempt -> 403",
    hrSeed.res.status === 403,
    `status=${hrSeed.res.status}`
  );

  const today = new Date().toISOString().slice(0, 10);
  const currentMonth = today.slice(0, 7);
  const prevMonth = previousMonth(currentMonth);
  const summary = await request(
    BASE,
    `/api/dashboard/summary?from=${prevMonth}-01&to=${today}`,
    { cookie: adminCookie }
  );
  check(
    "dashboard summary: non-zero headcount, attendanceRate, payrollCost",
    summary.res.status === 200 &&
      summary.json?.kpis?.headcount > 0 &&
      summary.json?.kpis?.attendanceRate > 0 &&
      summary.json?.kpis?.payrollCost > 0,
    JSON.stringify({
      headcount: summary.json?.kpis?.headcount,
      attendanceRate: summary.json?.kpis?.attendanceRate,
      payrollCost: summary.json?.kpis?.payrollCost,
    })
  );

  const payslips = await request(BASE, "/api/payroll/payslips", { cookie: adminCookie });
  const payslipItems = payslips.json?.items ?? [];
  const paidEmployees = new Set(payslipItems.map((item) => item.employeeId));
  const paidMonths = new Set(payslipItems.map((item) => item.month));
  check(
    "payslips cover every employee and both seeded months",
    payslipItems.length > 0 &&
      paidEmployees.size === 6 &&
      paidMonths.has(prevMonth) &&
      paidMonths.has(currentMonth),
    `${payslipItems.length} payslips, ${paidEmployees.size} employees, months=${[...paidMonths].join(",")}`
  );

  const runs = await request(BASE, "/api/payroll/runs", { cookie: adminCookie });
  const runItems = runs.json?.items ?? [];
  check(
    "payroll runs: previous month finalized + current month draft",
    runItems.length === 2 &&
      runItems.some((run) => run.month === prevMonth && run.status === "finalized") &&
      runItems.some((run) => run.month === currentMonth && run.status === "draft"),
    runItems.map((run) => `${run.month}:${run.status}`).join(", ")
  );

  const balances = await request(BASE, "/api/leave/balances", { cookie: adminCookie });
  const balanceItems = balances.json?.items ?? [];
  const usedDays = balanceItems.reduce((total, item) => total + Number(item.used || 0), 0);
  const pendingDays = balanceItems.reduce((total, item) => total + Number(item.pending || 0), 0);
  check(
    "leave balances: 2 approved used days + 2 pending days",
    balances.res.status === 200 && usedDays === 2 && pendingDays === 2,
    `used=${usedDays} pending=${pendingDays}`
  );

  const announcements = await request(BASE, "/api/announcements", { cookie: adminCookie });
  const announcementItems = announcements.json?.items ?? [];
  check(
    "announcements: 2 rows, one pinned, authored by the admin",
    announcementItems.length === 2 &&
      announcementItems.filter((item) => item.pinned).length === 1 &&
      announcementItems.every((item) => item.authorRole === "admin"),
    announcementItems.map((item) => `${item.title}${item.pinned ? " (pinned)" : ""}`).join(" | ")
  );

  const corrections = await request(BASE, "/api/attendance/corrections?status=pending", {
    cookie: adminCookie,
  });
  check(
    "attendance corrections: 2 pending",
    (corrections.json?.items ?? []).length === 2,
    `${(corrections.json?.items ?? []).length} pending`
  );

  const board = await request(BASE, `/api/attendance?month=${currentMonth}`, {
    cookie: adminCookie,
  });
  const boardSummary = board.json?.summary;
  check(
    "attendance board has a mixed current-month status summary",
    board.res.status === 200 &&
      boardSummary?.present > 0 &&
      boardSummary?.late > 0 &&
      boardSummary?.halfDay > 0 &&
      boardSummary?.missingCheckout > 0 &&
      boardSummary?.absent > 0,
    JSON.stringify(boardSummary)
  );

  // ---------------------------------------------------- dataset summary
  const db = new DatabaseSync(DB_FILE, { readOnly: true });
  try {
    const attendanceMix = db
      .prepare("SELECT status, COUNT(*) AS count FROM attendance GROUP BY status ORDER BY status")
      .all();
    const payrollTotals = db
      .prepare(
        `SELECT r.month, r.status, COUNT(p.id) AS employees,
                ROUND(SUM(p.gross), 2) AS gross,
                ROUND(SUM(p.deductions), 2) AS deductions,
                ROUND(SUM(p.tax), 2) AS tax,
                ROUND(SUM(p.net), 2) AS net
           FROM payroll_runs r
           LEFT JOIN payslips p ON p.run_id = r.id
          GROUP BY r.id
          ORDER BY r.month`
      )
      .all();
    const employees = db.prepare("SELECT COUNT(*) AS count FROM employees").get();
    const leave = db
      .prepare("SELECT status, COUNT(*) AS count FROM leave_requests GROUP BY status")
      .all();
    const holidays = db
      .prepare("SELECT date, name FROM holidays ORDER BY date")
      .all();

    console.log("\nSeeded dataset summary");
    console.log(`  employees: ${employees.count}`);
    console.log(
      `  attendance: ${attendanceMix.map((row) => `${row.status}=${row.count}`).join(", ")}`
    );
    console.log(
      `  leave: ${leave.map((row) => `${row.status}=${row.count}`).join(", ")}`
    );
    console.log(
      `  holidays: ${holidays.map((row) => `${row.date} ${row.name}`).join(", ")}`
    );
    for (const run of payrollTotals) {
      console.log(
        `  payroll ${run.month} (${run.status}): ${run.employees} payslips, gross=${run.gross}, deductions=${run.deductions}, tax=${run.tax}, net=${run.net}`
      );
    }
  } finally {
    db.close();
  }

  await stopServer(apiServer);
  apiServer = null;
}

// ------------------------------------------------------------------ UI flow

async function measureOverflow(page) {
  return page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
    bodyScrollWidth: document.body.scrollWidth,
  }));
}

async function uiRound({ label, width, height, shotPrefix }) {
  uiServer = startServer({ port: UI_PORT, dbFile: UI_DB_FILE, logPath: UI_LOG });
  if (!(await waitForServer(UI_BASE))) {
    throw new Error(`UI server did not start; see ${UI_LOG}`);
  }

  const setupResult = await setup(UI_BASE);
  if (setupResult.res.status !== 201) {
    throw new Error(`UI setup failed: ${setupResult.res.status} ${setupResult.text}`);
  }

  const context = await browser.newContext({ viewport: { width, height } });
  await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: UI_BASE });
  const loginResult = await context.request.post(`${UI_BASE}/api/auth/login`, { data: ADMIN });
  if (!loginResult.ok()) throw new Error(`UI admin login failed: ${loginResult.status()}`);

  const page = await context.newPage();
  await page.goto(`${UI_BASE}/organization?tab=company`, { waitUntil: "networkidle" });
  await page.getByText("0 employees", { exact: true }).waitFor();
  const trigger = page.getByRole("button", { name: "Load sample data" });
  await trigger.waitFor();
  check(`${label}: sample card renders with an enabled button`, await trigger.isEnabled());

  const before = await measureOverflow(page);
  check(
    `${label}: organization page has no horizontal overflow before seeding`,
    before.scrollWidth <= before.clientWidth,
    `scrollWidth=${before.scrollWidth} clientWidth=${before.clientWidth}`
  );
  await page.screenshot({
    path: path.join(SHOT_DIR, `${shotPrefix}-company-${width}.png`),
    fullPage: true,
  });

  await trigger.click();
  const confirmDialog = page.getByRole("dialog");
  await confirmDialog.getByText("Load sample data?").waitFor();
  await confirmDialog.getByRole("button", { name: "Load sample data" }).click();

  await page.getByRole("heading", { name: "Sample data loaded" }).waitFor();
  await page.getByText("Employee logins").waitFor();
  await page.getByText("ayesha.khan@hcm.demo").waitFor();
  check(
    `${label}: credentials dialog lists the demo password`,
    (await page.getByText(DEMO_PASSWORD, { exact: true }).count()) >= 1
  );
  check(
    `${label}: credentials table renders six copy buttons`,
    (await page.getByRole("button", { name: /^Copy password for / }).count()) === 6
  );

  const dialogOverflow = await measureOverflow(page);
  check(
    `${label}: no horizontal overflow with the credentials dialog open`,
    dialogOverflow.scrollWidth <= dialogOverflow.clientWidth,
    `scrollWidth=${dialogOverflow.scrollWidth} clientWidth=${dialogOverflow.clientWidth}`
  );
  // Let the success toast auto-dismiss so the screenshot shows the dialog UI.
  await page.waitForTimeout(4200);
  await page.screenshot({
    path: path.join(SHOT_DIR, `${shotPrefix}-dialog-${width}.png`),
  });

  await page.getByRole("button", { name: "Close" }).last().click();
  await page.reload({ waitUntil: "networkidle" });
  await page.getByText("Sample data already loaded").waitFor();
  const reloadedTrigger = page.getByRole("button", { name: "Load sample data" });
  check(
    `${label}: after reload the button is disabled and the loaded note is shown`,
    (await reloadedTrigger.isDisabled()) &&
      (await page.getByText("Sample data already loaded").count()) === 1
  );

  await context.close();
  await stopServer(uiServer);
  uiServer = null;
}

async function runUiPhase() {
  fs.mkdirSync(SHOT_DIR, { recursive: true });
  browser = await chromium.launch({
    executablePath: "/usr/bin/chromium",
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });

  await uiRound({
    label: "1440px",
    width: 1440,
    height: 900,
    shotPrefix: "seed",
  });

  // Fresh database for the second viewport so the button is enabled again.
  removeDatabase(UI_DB_FILE);
  await uiRound({
    label: "375px",
    width: 375,
    height: 812,
    shotPrefix: "seed",
  });
}

async function main() {
  fs.mkdirSync(LOG_DIR, { recursive: true });
  fs.mkdirSync(SHOT_DIR, { recursive: true });

  createIsolatedCopy();
  buildIsolatedCopy();

  try {
    await runApiPhase();
  } finally {
    await stopServer(apiServer);
    apiServer = null;
  }

  await runUiPhase();

  if (failed) {
    console.error("\nSome checks failed.");
    process.exitCode = 1;
  } else {
    console.log("\nAll demo seed checks passed.");
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await browser?.close();
    } catch {
      /* ignore */
    }
    await stopServer(apiServer);
    await stopServer(uiServer);
    fs.rmSync(WORK_DIR, { recursive: true, force: true });
    removeDatabase(DB_FILE);
    removeDatabase(UI_DB_FILE);
    console.log(`Cleaned up ${WORK_DIR} and the smoke databases.`);
  });
