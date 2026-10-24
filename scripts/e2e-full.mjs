#!/usr/bin/env node
/**
 * Comprehensive end-to-end Playwright run for HCM Lite.
 *
 * Runs against a FRESH database and creates every record through the UI.
 * Start the app first (see scripts/run-e2e.sh):
 *   BASE_URL=http://localhost:3011 node scripts/e2e-full.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright-core";

const BASE_URL = (process.env.BASE_URL || "http://localhost:3011").replace(/\/$/, "");
const SHOTS_DIR = path.resolve("./.agent-logs/shots");
fs.mkdirSync(SHOTS_DIR, { recursive: true });

const COMPANY = "E2E Textiles";
const ADMIN_EMAIL = "admin@e2e.test";
const ADMIN_PASSWORD = "Admin@12345";
const HR_EMAIL = "hr@e2e.test";
const HR_PASSWORD = "Hr@123456";
const BILAL_PASSWORD = "Bilal@12345";

const EMPLOYEES = {
  bilal: { code: "EMP-001", name: "Bilal Ahmed", email: "bilal@e2e.test", dept: "Production", desig: "Operator", salary: "60000" },
  hira: { code: "EMP-002", name: "Hira Khan", email: "hira@e2e.test", dept: "Sales", desig: "Executive", salary: "100000" },
  zara: { code: "EMP-003", name: "Zara Ali", email: "zara@e2e.test", dept: "Sales", desig: "Executive", salary: "45000" },
};

// ------------------------------------------------------------------ dates
function iso(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
const NOW = new Date();
const TODAY = iso(NOW);
const FIRST_OF_MONTH = `${TODAY.slice(0, 8)}01`;
const YESTERDAY = iso(new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate() - 1));

function nextWeekday(day) {
  const d = new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate(), 12);
  for (let i = 0; i < 14; i += 1) {
    d.setDate(d.getDate() + 1);
    if (d.getDay() === day) return d;
  }
  return d;
}
const leaveStartDate = nextWeekday(1); // Monday
const leaveEndDate = new Date(leaveStartDate.getFullYear(), leaveStartDate.getMonth(), leaveStartDate.getDate() + 1);
const LEAVE_START = iso(leaveStartDate);
const LEAVE_END = iso(leaveEndDate);
const holidayDate = new Date(leaveEndDate.getFullYear(), leaveEndDate.getMonth(), leaveEndDate.getDate() + 21);
const HOLIDAY_DATE = iso(holidayDate);
const HOLIDAY_NAME = "E2E Founders Day";

// --------------------------------------------------------------- results
const results = [];
let currentStep = "boot";
let browser;
let appPage;
let fatal = false;

let stepStartedAt = Date.now();

function assert(cond, message) {
  if (!cond) throw new Error(message);
}

async function shot(page, step, error) {
  const slug = String(step).replace(/[^a-z0-9]+/gi, "-").slice(0, 50) || "step";
  const file = path.join(SHOTS_DIR, `e2e-${slug}-${Date.now()}.png`);
  try {
    await page.screenshot({ path: file, fullPage: true });
  } catch {
    /* ignore */
  }
  return file;
}

function indent(text) {
  return String(text)
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 400);
}

// ------------------------------------------------------------ browser log
const consoleErrors = [];
const pageErrors = [];
const http5xx = [];

function watch(page) {
  page.on("console", (msg) => {
    if (msg.type() !== "error") return;
    const text = msg.text();
    // Ignore browser-level noise that is not an app failure.
    if (/Failed to load resource: the server responded with a status of (401|403|422)/.test(text)) return;
    consoleErrors.push({ step: currentStep, text: indent(text), url: page.url() });
  });
  page.on("pageerror", (err) => {
    pageErrors.push({ step: currentStep, text: indent(err.message), stack: indent(err.stack || "") });
  });
  page.on("response", (res) => {
    if (res.status() >= 500) {
      http5xx.push({ step: currentStep, status: res.status(), url: res.url() });
    }
  });
}

// --------------------------------------------------------------- helpers
function dialogOf(page) {
  return page.getByRole("dialog").last();
}

async function waitText(page, text, opts = {}) {
  const { exact = false, timeout = 20000, scope = page } = opts;
  const loc = scope.getByText(text, { exact }).first();
  await loc.waitFor({ state: "visible", timeout });
  return loc;
}

async function chooseOption(page, trigger, optionName) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await trigger.click();
    const option = page.getByRole("option", { name: optionName, exact: true }).first();
    try {
      await option.waitFor({ state: "visible", timeout: attempt === 0 ? 5000 : 10000 });
      await option.click();
      return;
    } catch (err) {
      if (attempt === 2) throw err;
      const expanded = await trigger.getAttribute("aria-expanded").catch(() => null);
      if (expanded === "true") await trigger.click().catch(() => {});
      await page.waitForTimeout(400);
    }
  }
}

async function signIn(page, email, password, expected = "/dashboard") {
  await page.goto(`${BASE_URL}/login`, { waitUntil: "domcontentloaded" });
  await page.getByLabel("Work email").waitFor({ state: "visible", timeout: 20000 });
  await page.getByLabel("Work email").fill(email);
  await page.getByLabel("Password").fill(password);
  const responsePromise = page.waitForResponse(
    (res) => res.url().endsWith("/api/auth/login") && res.request().method() === "POST",
    { timeout: 30000 },
  );
  await page.getByRole("button", { name: /^Sign in/ }).click();
  const response = await responsePromise;
  if (expected) {
    await page.waitForURL(`**${expected}`, { timeout: 30000 });
    await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
  }
  return response;
}

async function signOut(page, name) {
  const header = page.locator("header");
  const trigger = header.getByRole("button", { name: new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")) });
  await trigger.first().click();
  const item = page.getByRole("menuitem", { name: /Sign out/ }).first();
  if (await item.count()) {
    await item.click();
  } else {
    await page.getByText("Sign out", { exact: true }).first().click();
  }
  await page.waitForURL("**/login", { timeout: 20000 });
}

async function goto(page, route, heading) {
  await page.goto(`${BASE_URL}${route}`, { waitUntil: "domcontentloaded" });
  if (heading) {
    await page.getByRole("heading", { name: heading }).first().waitFor({ state: "visible", timeout: 25000 });
  }
  await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
}

async function step(id, label, fn) {
  if (fatal) {
    results.push({ step: `${id} ${label}`, status: "skip", detail: "skipped after fatal failure", ms: 0 });
    console.log(`⏭️  ${id} ${label} — skipped`);
    return;
  }
  currentStep = `${id} ${label}`;
  stepStartedAt = Date.now();
  try {
    const outcome = await fn();
    const detail = typeof outcome === "string" ? outcome : outcome?.detail ?? "ok";
    const status = typeof outcome === "object" && outcome?.status ? outcome.status : "pass";
    results.push({ step: currentStep, status, detail, ms: Date.now() - stepStartedAt });
    const icon = status === "warn" ? "⚠️ " : "✅";
    console.log(`${icon} ${currentStep} — ${indent(detail)}`);
  } catch (err) {
    const message = indent(err?.message || err);
    const screenshot = await shot(appPage, currentStep);
    results.push({
      step: currentStep,
      status: "fail",
      detail: `${message} (screenshot: ${screenshot})`,
      ms: Date.now() - stepStartedAt,
    });
    console.log(`❌ ${currentStep} — ${message}`);
    console.log(`   screenshot: ${screenshot}`);
  }
}

// ------------------------------------------------------------------ setup
async function main() {
  browser = await chromium.launch({
    executablePath: "/usr/bin/chromium",
    args: ["--no-sandbox"],
  });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  appPage = page;
  page.setDefaultTimeout(20000);
  page.setDefaultNavigationTimeout(40000);
  watch(page);

  const state = { passwords: {}, bilalId: null };

  // 1 ----------------------------------------------------------- setup
  await step("1", "Setup wizard", async () => {
    await page.goto(`${BASE_URL}/setup`, { waitUntil: "domcontentloaded" });
    await waitText(page, "Set up your company", { timeout: 30000 });
    await page.locator("input#companyName").fill(COMPANY);
    await page.locator("input#officeStart").fill("09:00");
    await page.getByRole("button", { name: /Continue/ }).click();
    await waitText(page, "Create admin account");
    await page.locator("#adminName").fill("E2E Admin");
    await page.locator("#adminEmail").fill(ADMIN_EMAIL);
    await page.locator("#adminPassword").fill(ADMIN_PASSWORD);
    await page.getByRole("button", { name: /Create admin account/ }).click();
    await page.waitForURL("**/login?setup=success", { timeout: 30000 });
    await waitText(page, "Sign in");
    assert(page.url().includes("/login"), "expected the login page after setup");
    return `${COMPANY} created; admin ${ADMIN_EMAIL}; landed on /login`;
  });

  // 2 ----------------------------------------------------------- login
  await step("2", "Login guards", async () => {
    await page.goto(`${BASE_URL}/login`, { waitUntil: "domcontentloaded" });
    await page.getByLabel("Work email").fill(ADMIN_EMAIL);
    await page.getByLabel("Password").fill("wrong-password-123");
    const wrongResp = page.waitForResponse(
      (res) => res.url().endsWith("/api/auth/login") && res.request().method() === "POST",
    );
    await page.getByRole("button", { name: /^Sign in/ }).click();
    const response = await wrongResp;
    assert(response.status() === 401, `wrong password returned ${response.status()}`);
    await waitText(page, "Sign in failed");
    assert(page.url().includes("/login"), "wrong password must not navigate away from /login");
    await page.getByLabel("Password").fill(ADMIN_PASSWORD);
    await page.getByRole("button", { name: /^Sign in/ }).click();
    await page.waitForURL("**/dashboard", { timeout: 30000 });
    await page.getByRole("heading", { name: "Dashboard" }).waitFor({ state: "visible" });
    // Fresh install: the admin dashboard's empty state must not send Admin to
    // the HR-only registration page (which would bounce them back).
    const emptyCta = page.getByRole("link", { name: "View employees", exact: true });
    await emptyCta.waitFor({ state: "visible", timeout: 20000 });
    const ctaHref = await emptyCta.getAttribute("href");
    assert(ctaHref === "/employees", `admin empty-state CTA should go to /employees, got ${ctaHref}`);
    return "wrong password → 401 + error, stayed on /login; correct password → /dashboard; admin empty-state CTA → /employees";
  });

  // 3 ----------------------------------------------------------- org
  await step("3", "Organization setup", async () => {
    await goto(page, "/organization", "Organization");
    // Company tab is the default; verify the rules the workflow depends on.
    await waitText(page, "Company profile");
    const grace = await page.locator("#graceMinutes").inputValue();
    const halfDay = await page.locator("#halfDayMinutes").inputValue();
    const officeStart = await page.locator("#officeStart").inputValue();
    assert(grace === "15", `grace minutes expected 15, got ${grace}`);
    assert(halfDay === "300", `half-day minutes expected 300, got ${halfDay}`);
    assert(officeStart === "09:00", `office start expected 09:00, got ${officeStart}`);
    for (const day of ["Sat", "Sun"]) {
      const pressed = await page.getByRole("button", { name: day, exact: true }).getAttribute("aria-pressed");
      assert(pressed === "true", `${day} must be a weekend day (aria-pressed=${pressed})`);
    }

    async function addDepartment(name) {
      await page.getByRole("tab", { name: "Departments" }).click();
      await page.getByRole("button", { name: "Add department" }).first().click();
      const dialog = dialogOf(page);
      await dialog.locator("#departmentName").fill(name);
      await dialog.getByRole("button", { name: "Create department" }).click();
      await dialog.waitFor({ state: "hidden" });
      await page.getByRole("cell", { name, exact: true }).first().waitFor({ state: "visible" });
    }
    await addDepartment("Production");
    await addDepartment("Sales");

    async function addDesignation(name, department) {
      await page.getByRole("tab", { name: "Designations" }).click();
      await page.getByRole("button", { name: "Add designation" }).first().click();
      const dialog = dialogOf(page);
      await dialog.locator("#designationName").fill(name);
      await chooseOption(page, dialog.locator("#designationDepartment"), department);
      await dialog.getByRole("button", { name: "Create designation" }).click();
      await dialog.waitFor({ state: "hidden" });
      await waitText(page, name);
    }
    await addDesignation("Operator", "Production");
    await addDesignation("Executive", "Sales");

    await page.getByRole("tab", { name: "Leave types" }).click();
    for (const type of ["Annual", "Sick", "Casual", "Unpaid"]) {
        await page.getByRole("cell", { name: type, exact: true }).first().waitFor({ state: "visible" });
    }

    await page.getByRole("tab", { name: "Holidays" }).click();
    await page.getByRole("button", { name: "Add holiday" }).first().click();
    const holidayDialog = dialogOf(page);
    await holidayDialog.locator("#holidayDate").fill(HOLIDAY_DATE);
    await holidayDialog.locator("#holidayName").fill(HOLIDAY_NAME);
    await holidayDialog.getByRole("button", { name: "Add holiday" }).click();
    await holidayDialog.waitFor({ state: "hidden" });
    await waitText(page, HOLIDAY_NAME);

    // Persistence across a full reload.
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.getByRole("heading", { name: "Organization" }).waitFor({ state: "visible" });
    await page.getByRole("tab", { name: "Departments" }).click();
    await page.getByRole("cell", { name: "Production", exact: true }).first().waitFor({ state: "visible" });
    await page.getByRole("cell", { name: "Sales", exact: true }).first().waitFor({ state: "visible" });
    await page.getByRole("tab", { name: "Holidays" }).click();
    await waitText(page, HOLIDAY_NAME);

    return "9:00 start, 15 min grace, 300 min half-day, Sat/Sun; Production + Sales + Operator/Executive; 4 leave types; holiday persisted after reload";
  });

  // 9a --------------------------------------------------------- HR login
  await step("9a", "Create HR login", async () => {
    await page.getByRole("tab", { name: "Logins" }).click();
    await page.getByRole("button", { name: "Add HR login" }).first().click();
    const dialog = dialogOf(page);
    await dialog.locator("#hrName").fill("Hina HR");
    await dialog.locator("#hrEmail").fill(HR_EMAIL);
    await dialog.locator("#hrPassword").fill(HR_PASSWORD);
    await dialog.getByRole("button", { name: "Create login" }).click();
    await waitText(page, "HR login created");
    const email = await dialog.getByText(HR_EMAIL).innerText();
    assert(email.includes(HR_EMAIL), "credential dialog must show the HR email");
    await dialog.getByRole("button", { name: "Done" }).click();
    await page.getByRole("cell", { name: HR_EMAIL, exact: true }).waitFor({ state: "visible" });
    return `Admin created ${HR_EMAIL} from Organization → Logins`;
  });

  // 9b --------------------------------------------------------- HR read-only
  await step("9b", "HR access + read-only org", async () => {
    await signOut(page, "E2E Admin");
    await signIn(page, HR_EMAIL, HR_PASSWORD);
    await goto(page, "/organization", "Organization");
    await waitText(page, "View only");
    assert((await page.getByRole("tab", { name: "Logins" }).count()) === 0, "HR must not see the Logins tab");
    await page.getByRole("tab", { name: "Departments" }).click();
    assert((await page.getByRole("button", { name: "Add department" }).count()) === 0, "HR must not see Add department");
    await page.getByRole("tab", { name: "Company" }).click();
    const disabled = await page.locator("#graceMinutes").isDisabled();
    assert(disabled, "HR company settings must be read-only");
    await page.goto(`${BASE_URL}/audit`, { waitUntil: "domcontentloaded" });
    await page.waitForURL("**/dashboard", { timeout: 20000 });
    const auditLinks = await page.locator('aside a[href="/audit"]').count();
    assert(auditLinks === 0, "HR nav must not contain Audit");
    return "HR signed in; Organization is view-only (no Logins tab / no Add department / disabled fields); /audit redirected to /dashboard";
  });

  // 4 ----------------------------------------------------------- employees
  await step("4", "Register 3 employees", async () => {
    async function register(employee, joinDate) {
      await page.goto(`${BASE_URL}/employees/new`, { waitUntil: "domcontentloaded" });
      await page.locator("#emp-code").waitFor({ state: "visible" });
      await page.locator("#emp-code").fill(employee.code);
      await page.locator("#emp-name").fill(employee.name);
      await page.locator("#emp-email").fill(employee.email);
      await page.locator("#emp-phone").fill("+92 300 0000000");
      await chooseOption(page, page.locator("#emp-department"), employee.dept);
      await page.locator("#emp-designation").click();
      const desigOption = page.getByRole("option", { name: employee.desig, exact: true }).first();
      await desigOption.waitFor({ state: "visible", timeout: 10000 });
      await desigOption.click();
      await page.locator("#emp-join-date").fill(joinDate);
      await page.locator("#emp-salary").fill(employee.salary);
      await page.getByRole("button", { name: "Register employee" }).click();

      const dialog = dialogOf(page);
      await waitText(page, "Employee registered", { scope: dialog, timeout: 30000 });
      const password = (await dialog.locator("code").innerText()).trim();
      assert(password.length >= 8, `temp password for ${employee.name} was not shown`);
      await dialog.getByRole("button", { name: "View employee profile" }).click();
      await page.waitForURL(/\/employees\/\d+$/, { timeout: 20000 });
      return password;
    }

    state.passwords.bilal = await register(EMPLOYEES.bilal, FIRST_OF_MONTH);
    state.passwords.hira = await register(EMPLOYEES.hira, FIRST_OF_MONTH);
    state.passwords.zara = await register(EMPLOYEES.zara, TODAY);

    await goto(page, "/employees", "Employees");
    await waitText(page, "3 employees in the directory");
    for (const employee of Object.values(EMPLOYEES)) {
      await page.getByRole("link", { name: employee.name }).waitFor({ state: "visible" });
    }
    const rows = await page.locator("tbody tr").count();
    assert(rows === 3, `employee list expected 3 rows, got ${rows}`);

    const bilalLink = page.getByRole("link", { name: "Bilal Ahmed" }).first();
    state.bilalId = Number((await bilalLink.getAttribute("href")).split("/").pop());
    await bilalLink.click();
    await page.waitForURL(/\/employees\/\d+$/, { timeout: 20000 });
    await waitText(page, "Production · Operator");
    await waitText(page, "Gross salary");
    await waitText(page, "90,000");
    await waitText(page, "Leave balances");
    await waitText(page, "Annual");
    await waitText(page, "14 days remaining");
    return `3 employees + temp passwords captured; list shows 3 rows; 360 shows salary, Production · Operator, leave balances`;
  });

  // 5 ----------------------------------------------------------- employee auth
  await step("5", "Employee auth + forced password change", async () => {
    await signOut(page, "Hina HR");
    await signIn(page, EMPLOYEES.bilal.email, state.passwords.bilal, "/change-password");
    await waitText(page, "Change password");
    await page.locator("#currentPassword").fill(state.passwords.bilal);
    await page.locator("#newPassword").fill(BILAL_PASSWORD);
    await page.locator("#confirmPassword").fill(BILAL_PASSWORD);
    await page.getByRole("button", { name: "Change password" }).click();
    await waitText(page, "Password changed", { timeout: 20000 });
    await page.waitForURL("**/dashboard", { timeout: 20000 });
    await page.getByRole("heading", { name: "Dashboard" }).waitFor({ state: "visible" });
    const navTexts = await page.locator("aside nav a").allInnerTexts();
    const exact = navTexts.map((t) => t.trim());
    for (const forbidden of ["Attendance", "Payroll", "Organization", "Audit"]) {
      assert(!exact.includes(forbidden), `employee nav must not include ${forbidden}`);
    }
    for (const href of ["/attendance", "/payroll", "/organization", "/audit"]) {
      assert((await page.locator(`aside a[href="${href}"]`).count()) === 0, `employee nav must not link ${href}`);
    }
    assert(exact.includes("My Attendance") && exact.includes("My Leave"), "employee nav must include My Attendance and My Leave");
    return `Bilal changed the temp password, landed on /dashboard; nav: ${exact.join(", ")}`;
  });

  // 6 ----------------------------------------------------------- check-in
  await step("6", "Employee check-in", async () => {
    await goto(page, "/my-attendance", "My attendance");
    const checkIn = page.getByRole("button", { name: "Check in", exact: true });
    await checkIn.waitFor({ state: "visible" });
    const punch = page.waitForResponse(
      (res) => res.url().endsWith("/api/attendance/check-in") && res.request().method() === "POST",
    );
    await checkIn.click();
    const response = await punch;
    assert(response.ok(), `check-in failed with ${response.status()}`);
    await page.getByRole("button", { name: "Check out", exact: true }).waitFor({ state: "visible", timeout: 20000 });
    await waitText(page, /Checked in at/);
    const cell = page.locator(`[title^="${TODAY} ·"]`).first();
    await cell.waitFor({ state: "visible", timeout: 20000 });
    const title = await cell.getAttribute("title");
    assert(title.includes(TODAY), `calendar day title missing today: ${title}`);
    return `checked in; button became Check out; calendar cell "${title}"`;
  });

  // 7 ----------------------------------------------------------- LRBAC
  await step("7", "Employee route + API guards", async () => {
    const checks = [];
    for (const route of ["/audit", "/payroll", "/employees", "/organization"]) {
      await page.goto(`${BASE_URL}${route}`, { waitUntil: "domcontentloaded" });
      await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
      const finalUrl = new URL(page.url());
      assert(finalUrl.pathname !== route, `${route} was not redirected for an employee (stayed on ${finalUrl.pathname})`);
      checks.push(`${route}→${finalUrl.pathname}`);
    }
    await page.goto(`${BASE_URL}/audit`, { waitUntil: "domcontentloaded" });
    await page.waitForURL("**/dashboard", { timeout: 20000 });
    assert((await page.getByText("Audit log").count()) === 0, "employee must not see the audit log UI");
    await page.goto(`${BASE_URL}/payroll`, { waitUntil: "domcontentloaded" });
    await page.waitForURL("**/payslips", { timeout: 20000 });
    assert((await page.getByText("Create draft").count()) === 0, "employee must not see payroll draft controls");
    const auditStatus = await page.evaluate(async () => {
      const res = await fetch("/api/audit-logs", { cache: "no-store" });
      return res.status;
    });
    assert([401, 403].includes(auditStatus), `/api/audit-logs returned ${auditStatus}, expected 401/403`);
    return `${checks.join(", ")}; /api/audit-logs → ${auditStatus}`;
  });

  // 8 ----------------------------------------------------------- leave
  await step("8", "Leave apply + approval + balance", async () => {
    await goto(page, "/my-leave", "My leave");
    await page.getByRole("button", { name: "Apply for leave" }).first().click();
    const dialog = dialogOf(page);
    await waitText(page, "Apply for leave", { scope: dialog });
    await dialog.locator("#leave-start").fill(LEAVE_START);
    await dialog.locator("#leave-end").fill(LEAVE_END);
    const dialogText = (await dialog.innerText()).replace(/\s+/g, " ");
    assert(/Working days\s*2 days/.test(dialogText), `expected 2 working days in the dialog, got "${dialogText.slice(0, 300)}"`);
    await dialog.locator("#leave-reason").fill("Family event out of town (E2E)");
    await dialog.getByRole("button", { name: "Send request" }).click();
    await dialog.waitFor({ state: "hidden" });
    await waitText(page, "Leave request sent");

    const row = page.locator("tbody tr").filter({ hasText: "Annual" }).first();
    await row.waitFor({ state: "visible", timeout: 20000 });
    const rowText = await row.innerText();
    assert(/Pending/i.test(rowText), `new leave request should be pending: ${rowText}`);
    assert(/\b2\b/.test(rowText), `new leave request should show 2 days: ${rowText}`);

    await signOut(page, "Bilal Ahmed");
    await signIn(page, HR_EMAIL, HR_PASSWORD);
    await goto(page, "/leave", "Leave");
    await page.getByRole("button", { name: "Approve leave for Bilal Ahmed" }).click();
    const review = dialogOf(page);
    await waitText(page, "Approve leave", { scope: review });
    await review.locator("#leave-review-comment").fill("Approved for E2E");
    await review.getByRole("button", { name: "Approve", exact: true }).click();
    await review.waitFor({ state: "hidden" });
    await waitText(page, "Leave approved");

    await signOut(page, "Hina HR");
    await signIn(page, EMPLOYEES.bilal.email, BILAL_PASSWORD);
    await goto(page, "/my-leave", "My leave");
    const approvedRow = page.locator("tbody tr").filter({ hasText: "Annual" }).first();
    await approvedRow.waitFor({ state: "visible", timeout: 20000 });
    const approvedText = await approvedRow.innerText();
    assert(/Approved/i.test(approvedText), `leave should be approved: ${approvedText}`);
    assert(/Approved for E2E/.test(approvedText), `review comment missing: ${approvedText}`);
    const annualCard = page.locator('[data-slot="card"]').filter({ hasText: "Annual" }).first();
    const cardText = await annualCard.innerText();
    assert(/12\s*days left/.test(cardText.replace(/\s+/g, " ")), `Annual balance should be 12 days left: ${cardText}`);
    assert(/2 used/.test(cardText), `Annual card should show 2 used: ${cardText}`);
    return `applied ${LEAVE_START} → ${LEAVE_END} (2 days), HR approved with comment, balance 14→12`;
  });

  // 10 ---------------------------------------------------------- correction
  await step("10", "Attendance correction request + approval", async () => {
    await goto(page, "/my-attendance", "My attendance");
    await page.getByRole("button", { name: "Request correction" }).first().click();
    const dialog = dialogOf(page);
    await dialog.locator("#correction-date").fill(YESTERDAY);
    await dialog.locator("#correction-in").fill("09:00");
    await dialog.locator("#correction-out").fill("18:00");
    await dialog.locator("#correction-reason").fill("Forgot to check out yesterday (E2E)");
    await dialog.getByRole("button", { name: "Send request" }).click();
    await dialog.waitFor({ state: "hidden" });
    await waitText(page, "Correction request sent to HR");
    const requestCard = page.locator('[data-slot="card"]').filter({ hasText: "Your requests" }).first();
    await waitText(page, "Forgot to check out yesterday (E2E)", { scope: requestCard });
    await waitText(page, "Pending", { scope: requestCard });

    await signOut(page, "Bilal Ahmed");
    await signIn(page, HR_EMAIL, HR_PASSWORD);
    await goto(page, "/attendance", "Attendance");
    await waitText(page, "Pending corrections");
    await waitText(page, "Forgot to check out yesterday (E2E)");
    await page.getByRole("button", { name: "Approve", exact: true }).click();
    const review = dialogOf(page);
    await waitText(page, "Approve correction", { scope: review });
    await review.getByRole("button", { name: "Approve", exact: true }).click();
    await review.waitFor({ state: "hidden" });
    await waitText(page, "Correction approved");

    const dateInput = page.locator('input[aria-label="Attendance date"]');
    await dateInput.fill(YESTERDAY);
    await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
    const row = page.locator("tbody tr").filter({ hasText: "Bilal Ahmed" }).first();
    await row.waitFor({ state: "visible", timeout: 20000 });
    const rowText = await row.innerText();
    assert(/09:00/.test(rowText) && /18:00/.test(rowText), `board should show corrected times: ${rowText}`);
    assert(/Present/i.test(rowText), `corrected day should be present: ${rowText}`);
    return `Bilal requested ${YESTERDAY} 09:00→18:00; HR approved; board shows 09:00 / 18:00 Present`;
  });

  // 11 ---------------------------------------------------------- payroll
  await step("11", "Payroll draft, finalize, PDF, lock", async () => {
    // HR creates the current-month draft.
    await goto(page, "/payroll", "Payroll");
    await page.getByRole("button", { name: "Create draft" }).first().click();
    await waitText(page, "Draft payroll for", { timeout: 30000 });
    await page.getByRole("cell", { name: "Bilal Ahmed" }).first().waitFor({ state: "visible", timeout: 20000 });
    const bodyText = await page.locator("main").innerText();
    for (const name of ["Bilal Ahmed", "Hira Khan", "Zara Ali"]) {
      assert(bodyText.includes(name), `payroll table missing ${name}`);
    }
    const headers = await page.locator("thead th").allInnerTexts();
    for (const header of ["Gross", "Deductions", "Tax", "Net"]) {
      assert(headers.some((h) => h.trim() === header), `payroll table missing ${header} column`);
    }
    const totalsCells = await page.locator("tfoot tr td").allInnerTexts();
    assert(totalsCells.length >= 5, `expected a totals row with gross/deductions/tax/net, got ${totalsCells.join(" | ")}`);
    const money = (cell) => Number(String(cell).replace(/[^0-9.]/g, ""));
    const totalGross = money(totalsCells[1]);
    const totalDeductions = money(totalsCells[2]);
    const totalTax = money(totalsCells[3]);
    const totalNet = money(totalsCells[4]);
    assert(totalGross > 0, `total gross must be non-zero: ${totalsCells.join(" | ")}`);
    assert(totalDeductions > 0, `total deductions must be non-zero: ${totalsCells.join(" | ")}`);
    assert(totalTax > 0, `total tax must be non-zero: ${totalsCells.join(" | ")}`);
    assert(totalNet > 0, `total net must be non-zero: ${totalsCells.join(" | ")}`);
    const rows = await page.locator("tbody tr").count();
    assert(rows === 3, `payroll should list 3 employees, got ${rows}`);

    // Admin finalizes and downloads a payslip.
    await signOut(page, "Hina HR");
    await signIn(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await goto(page, "/payroll", "Payroll");
    await page.getByRole("button", { name: /Finalize & lock/ }).first().click();
    const confirm = dialogOf(page);
    await confirm.getByRole("button", { name: /Finalize & lock/ }).click();
    await confirm.waitFor({ state: "hidden" });
    await waitText(page, "Payroll finalized and locked", { timeout: 30000 });
    await waitText(page, "Finalized");
    assert((await page.getByRole("button", { name: /Finalize & lock/ }).count()) === 0, "finalized run must not offer Finalize");

    const run = await page.evaluate(async () => {
      const res = await fetch("/api/payroll/runs", { cache: "no-store" });
      const body = await res.json();
      const current = new Date().toISOString().slice(0, 7);
      return body.items.find((item) => item.month === current) ?? body.items[0];
    });
    const secondAttempt = await page.evaluate(async (id) => {
      const res = await fetch(`/api/payroll/runs/${id}/finalize`, { method: "POST" });
      return { status: res.status, body: await res.json().catch(() => ({})) };
    }, run.id);
    assert(secondAttempt.status === 409, `second finalize must be blocked with 409, got ${secondAttempt.status}`);

    const pdfLink = page.locator('a[aria-label="Download payslip PDF"]').first();
    await pdfLink.waitFor({ state: "visible", timeout: 20000 });
    const pdfHref = await pdfLink.getAttribute("href");
    const pdf = await page.evaluate(async (url) => {
      const res = await fetch(url);
      const contentType = res.headers.get("content-type") || "";
      const bytes = new Uint8Array(await res.arrayBuffer());
      const magic = String.fromCharCode(...bytes.slice(0, 4));
      return { status: res.status, contentType, magic, length: bytes.length };
    }, pdfHref);
    assert(pdf.status === 200, `payslip PDF returned ${pdf.status}`);
    assert(pdf.magic === "%PDF", `payslip PDF magic was "${pdf.magic}"`);
    assert(pdf.contentType.toLowerCase().includes("application/pdf"), `payslip content-type was ${pdf.contentType}`);
    assert(pdf.length > 1000, `payslip PDF is suspiciously small (${pdf.length} bytes)`);

    // Locked month rejects a new correction — as the employee.
    await signOut(page, "E2E Admin");
    await signIn(page, EMPLOYEES.bilal.email, BILAL_PASSWORD);
    await goto(page, "/my-attendance", "My attendance");
    await page.getByRole("button", { name: "Request correction" }).first().click();
    const lockedDialog = dialogOf(page);
    await lockedDialog.locator("#correction-date").fill(TODAY);
    await lockedDialog.locator("#correction-in").fill("09:30");
    await lockedDialog.locator("#correction-out").fill("18:30");
    await lockedDialog.locator("#correction-reason").fill("Post-lock attempt (E2E)");
    await lockedDialog.getByRole("button", { name: "Send request" }).click();
    await waitText(page, "locked payroll month", { timeout: 20000 });
    await lockedDialog.getByRole("button", { name: "Cancel" }).click();
    return `draft listed 3 employees, gross/net totals > 0; Admin locked; 2nd finalize 409; PDF ${pdf.magic}/${pdf.contentType} (${pdf.length}B); locked-month correction rejected`;
  });

  // 12 ---------------------------------------------------------- dashboard
  await step("12", "Admin dashboard KPIs, trend, filters", async () => {
    await signOut(page, "Bilal Ahmed");
    await signIn(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await goto(page, "/dashboard", "Dashboard");
    await waitText(page, "Headcount");
    const trendCard = page.locator('[data-slot="card"]').filter({ hasText: "Attendance trend" }).first();
    await trendCard.locator("svg path").first().waitFor({ state: "visible", timeout: 20000 });

    async function kpi(label) {
      return page.evaluate((wanted) => {
        const nodes = Array.from(document.querySelectorAll("p"));
        const labelNode = nodes.find((n) => n.textContent.trim() === wanted);
        const card = labelNode?.closest("div.rounded-xl");
        const paragraphs = card ? Array.from(card.querySelectorAll("p")) : [];
        return paragraphs[1]?.textContent.trim() ?? null;
      }, label);
    }

    const headcount = await kpi("Headcount");
    const attendance = await kpi("Attendance rate");
    const headcountNum = Number(String(headcount).replace(/[^0-9.]/g, ""));
    const attendanceNum = Number(String(attendance).replace(/[^0-9.]/g, ""));
    assert(headcountNum > 0, `headcount KPI should be non-zero, got ${headcount}`);
    assert(attendanceNum > 0, `attendance rate should be non-zero, got ${attendance}`);

    const trendPaths = await trendCard.locator("svg path").count();
    assert(trendPaths > 0, "attendance trend did not render an svg path");
    await waitText(page, "By department");
    await page.getByRole("cell", { name: "Production", exact: true }).first().waitFor({ state: "visible" });
    await page.getByRole("cell", { name: "Sales", exact: true }).first().waitFor({ state: "visible" });

    // Date preset changes the computed numbers.
    await page.getByRole("button", { name: "Last 30 days" }).click();
    await page.waitForURL(/from=/, { timeout: 20000 });
    await page.waitForLoadState("networkidle", { timeout: 20000 }).catch(() => {});
    await page.waitForFunction(
      (previous) => {
        const nodes = Array.from(document.querySelectorAll("p"));
        const labelNode = nodes.find((n) => n.textContent.trim() === "Attendance rate");
        const card = labelNode?.closest("div.rounded-xl");
        const value = card?.querySelectorAll("p")?.[1]?.textContent.trim();
        return value && value !== previous;
      },
      attendance,
      { timeout: 30000 },
    );
    const presetAttendance = await kpi("Attendance rate");

    // Department filter changes the numbers too.
    await chooseOption(page, page.getByRole("combobox", { name: "Filter by department" }), "Production");
    await page.waitForURL(/departmentId=/, { timeout: 20000 });
    await page.waitForLoadState("networkidle", { timeout: 20000 }).catch(() => {});
    await page.waitForFunction(
      (previous) => {
        const nodes = Array.from(document.querySelectorAll("p"));
        const labelNode = nodes.find((n) => n.textContent.trim() === "Headcount");
        const card = labelNode?.closest("div.rounded-xl");
        const value = card?.querySelectorAll("p")?.[1]?.textContent.trim();
        return value === "1";
      },
      null,
      { timeout: 30000 },
    );
    const productionHeadcount = await kpi("Headcount");
    const productionAttendance = await kpi("Attendance rate");
    return `headcount ${headcount}, attendance ${attendance}, trend paths ${trendPaths}; last-30 → ${presetAttendance}; Production → headcount ${productionHeadcount}, attendance ${productionAttendance}`;
  });

  // 13 ---------------------------------------------------------- announcements
  await step("13", "Announcements + notifications", async () => {
    await signOut(page, "E2E Admin");
    await signIn(page, HR_EMAIL, HR_PASSWORD);
    await goto(page, "/announcements", "Announcements");
    await page.locator("#announcement-title").fill("Eid holidays");
    await page.locator("#announcement-body").fill("The office will be closed for Eid. Enjoy the break!");
    await page.getByRole("checkbox", { name: "Pin this announcement" }).click();
    await page.getByRole("button", { name: "Post announcement" }).click();
    await waitText(page, "Announcement posted");
    await waitText(page, "Eid holidays");
    await waitText(page, "Pinned");

    await signOut(page, "Hina HR");
    await signIn(page, EMPLOYEES.bilal.email, BILAL_PASSWORD);
    await goto(page, "/announcements", "Announcements");
    await waitText(page, "Eid holidays");
    await waitText(page, "Pinned");

    await goto(page, "/dashboard", "Dashboard");
    const announcementsCard = page.locator('[data-slot="card"]').filter({ hasText: "Announcements" }).first();
    await waitText(page, "Eid holidays", { scope: announcementsCard });

    const bell = page.getByRole("button", { name: /Notifications, \d+ unread/ });
    await bell.waitFor({ state: "visible", timeout: 20000 });
    const unreadLabel = await bell.getAttribute("aria-label");
    await bell.click();
    const sheet = page.getByRole("dialog").last();
    await waitText(page, "Notifications", { scope: sheet });
    const announcementItem = sheet.locator("li").filter({ hasText: "Eid holidays" }).first();
    await announcementItem.waitFor({ state: "visible", timeout: 20000 });
    await sheet.getByRole("button", { name: "Mark all read" }).click();
    await sheet.getByRole("button", { name: "Mark all read" }).waitFor({ state: "visible" });
    await page.waitForFunction(() => {
      const badge = Array.from(document.querySelectorAll("span")).find((n) => /^\d+ new$/.test(n.textContent.trim()));
      return !badge;
    }, null, { timeout: 15000 });
    await sheet.getByRole("button", { name: "Close" }).click();
    await page.getByRole("button", { name: "Notifications", exact: true }).waitFor({ state: "visible", timeout: 15000 });
    return `HR posted pinned "Eid holidays"; Bilal sees it on /announcements + dashboard; bell (${unreadLabel}) listed it; Mark all read cleared the unread dot`;
  });

  // 14 ---------------------------------------------------------- AI
  await step("14", "AI assistant (scope + refusal)", async () => {
    async function ask(question) {
      await goto(page, "/ai", "AI Assistant");
      const box = page.getByLabel("Message the AI assistant");
      await box.fill(question);
      const responsePromise = page.waitForResponse(
        (res) => res.url().includes("/api/ai/chat") && res.request().method() === "POST",
        { timeout: 60000 },
      );
      await page.getByRole("button", { name: "Send message" }).click();
      const response = await responsePromise;
      const body = await response.json().catch(() => ({}));
      await page.getByText("AI-generated").first().waitFor({ state: "visible", timeout: 30000 });
      const log = page.getByRole("log", { name: "Conversation with the AI assistant" });
      const logText = await log.innerText();
      return { response, body, logText };
    }

    // Employee must be refused before any model/tool call.
    const refusal = await ask("What is Hira's salary?");
    const refusalLog = refusal.logText.replace(/\s+/g, " ");
    assert(/cannot|can't|not able|permission/i.test(refusalLog), `salary answer should be a refusal: ${refusalLog.slice(0, 240)}`);
    assert(!/\d{2,}/.test(refusalLog), `refusal must not contain salary numbers: ${refusalLog.slice(0, 240)}`);
    assert(!refusal.body.fallback, "refusal should not be an AI fallback");

    // Admin asks a real data question.
    await signOut(page, "Bilal Ahmed");
    await signIn(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    const answer = await ask("How many employees do we have?");
    assert(typeof answer.body.answer === "string" && answer.body.answer.trim().length > 0, "assistant answer was empty");
    assert(answer.response.status() === 200, `AI chat returned ${answer.response.status()}`);
    assert(!/undefined|\[object Object\]/.test(answer.body.answer), `answer contains a rendering bug: ${answer.body.answer}`);
    assert(!/undefined|\[object Object\]/.test(answer.logText), "message UI contains undefined/[object Object]");
    const trace = page.locator("summary").filter({ hasText: /^\s*Used / });
    const traceCount = await trace.count();
    if (answer.body.fallback === true) {
      return {
        status: "warn",
        detail: `AI answered via fallback (no key/upstream): "${answer.body.answer.slice(0, 120)}"; tool trace unavailable (${traceCount}); employee salary refusal passed`,
      };
    }
    assert(traceCount > 0, "assistant answer did not render the tool-trace line");
    const traceText = (await trace.first().innerText()).replace(/\s+/g, " ");
    assert(/Used \w+/.test(traceText), `tool trace malformed: ${traceText}`);
    return `employee salary probe refused; admin answer "${answer.body.answer.slice(0, 100)}"; trace "${traceText}"`;
  });

  // 15 ---------------------------------------------------------- responsive
  const responsivePages = [
    "/dashboard",
    "/my-attendance",
    "/my-leave",
    "/payslips",
    "/ai",
    "/announcements",
  ];
  const adminResponsivePages = [
    "/dashboard",
    "/employees",
    "/attendance",
    "/leave",
    "/payroll",
    "/ai",
    "/announcements",
    "/audit",
  ];

  async function checkResponsive(paths, label) {
    const problems = [];
    const checked = [];
    await page.setViewportSize({ width: 375, height: 812 });
    for (const route of paths) {
      await page.goto(`${BASE_URL}${route}`, { waitUntil: "domcontentloaded" });
      await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
      await page.waitForTimeout(500);
      const result = await page.evaluate(() => {
        const viewport = window.innerWidth;
        const scrollWidth = document.documentElement.scrollWidth;
        const offenders = [];
        const elements = Array.from(document.querySelectorAll("body *"));
        for (const el of elements) {
          const style = getComputedStyle(el);
          if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) continue;
          const rect = el.getBoundingClientRect();
          if (rect.width === 0 || rect.height === 0) continue;
          if (rect.right <= viewport + 1 && rect.left >= -1) continue;
          if (el.closest('[aria-hidden="true"]')) continue;
          let clipped = false;
          let parent = el.parentElement;
          while (parent && parent !== document.body) {
            const pstyle = getComputedStyle(parent);
            if (["auto", "scroll", "hidden", "clip"].includes(pstyle.overflowX)) {
              const prect = parent.getBoundingClientRect();
              if (prect.right <= viewport + 1 && prect.left >= -1) {
                clipped = true;
                break;
              }
            }
            parent = parent.parentElement;
          }
          if (clipped) continue;
          offenders.push(
            `${el.tagName.toLowerCase()}${el.className ? "." + String(el.className).split(" ")[0].slice(0, 30) : ""} ` +
              `[${Math.round(rect.left)}..${Math.round(rect.right)}]`,
          );
          if (offenders.length >= 5) break;
        }
        return { viewport, scrollWidth, offenders, path: location.pathname };
      });
      checked.push(`${route}→${result.path}`);
      if (result.scrollWidth > 375 || result.offenders.length > 0) {
        problems.push(`${route}: scrollWidth=${result.scrollWidth}${result.offenders.length ? ` overflow=${result.offenders.join(", ")}` : ""}`);
      }
    }
    await page.setViewportSize({ width: 1280, height: 900 });
    return { problems, checked };
  }

  let employeeResponsive = null;
  await step("15a", "Responsive 375px (employee)", async () => {
    // Current user at this point is Admin after step 14; switch back to Bilal.
    await signOut(page, "E2E Admin");
    await signIn(page, EMPLOYEES.bilal.email, BILAL_PASSWORD);
    employeeResponsive = await checkResponsive(responsivePages, "employee");
    assert(employeeResponsive.problems.length === 0, employeeResponsive.problems.join(" | "));
    return `375×812 clean on ${employeeResponsive.checked.join(", ")}`;
  });

  await step("15b", "Responsive 375px (admin/hr)", async () => {
    await signOut(page, "Bilal Ahmed");
    await signIn(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    const admin = await checkResponsive(adminResponsivePages, "admin");
    assert(admin.problems.length === 0, admin.problems.join(" | "));
    return `375×812 clean on ${admin.checked.join(", ")}`;
  });

  // 16 ---------------------------------------------------------- error audit
  await step("16", "Console/page/5xx audit", async () => {
    const detail = `console errors ${consoleErrors.length}, page errors ${pageErrors.length}, 5xx ${http5xx.length}`;
    if (consoleErrors.length) {
      console.log("   console errors:");
      for (const entry of consoleErrors.slice(0, 12)) {
        console.log(`   - [${entry.step}] ${entry.text} (${entry.url})`);
      }
    }
    if (pageErrors.length) {
      console.log("   page errors:");
      for (const entry of pageErrors) console.log(`   - [${entry.step}] ${entry.text}`);
    }
    if (http5xx.length) {
      console.log("   5xx responses:");
      for (const entry of http5xx) console.log(`   - [${entry.step}] ${entry.status} ${entry.url}`);
    }
    assert(pageErrors.length === 0, `${pageErrors.length} pageerror(s): ${pageErrors.map((e) => e.text).join(" | ")}`);
    assert(http5xx.length === 0, `${http5xx.length} 5xx response(s): ${http5xx.map((e) => `${e.status} ${e.url}`).join(" | ")}`);
    return detail;
  });

  await context.close();
}

// --------------------------------------------------------------------- run
main()
  .catch((err) => {
    console.error("FATAL:", err);
    fatal = true;
    results.push({ step: "runner", status: "fail", detail: indent(err?.message || err), ms: 0 });
  })
  .finally(async () => {
    if (browser) await browser.close().catch(() => {});
    printTable();
    const hasFail = results.some((result) => result.status === "fail");
    process.exitCode = hasFail ? 1 : 0;
  });

function printTable() {
  const width = Math.max(10, ...results.map((r) => r.step.length));
  console.log("\n" + "=".repeat(100));
  console.log(`${"STEP".padEnd(width)} | RESULT | DETAIL`);
  console.log("-".repeat(width) + "-+-" + "-".repeat(8) + "-+-" + "-".repeat(60));
  for (const result of results) {
    const icon = result.status === "pass" ? "✅" : result.status === "warn" ? "⚠️ " : result.status === "skip" ? "⏭️ " : "❌";
    console.log(`${result.step.padEnd(width)} | ${icon.padEnd(6)} | ${indent(result.detail)}`);
  }
  console.log("=".repeat(100));
  const counts = results.reduce(
    (acc, r) => {
      acc[r.status] = (acc[r.status] || 0) + 1;
      return acc;
    },
    { pass: 0, warn: 0, fail: 0, skip: 0 },
  );
  console.log(`Summary: ${counts.pass} passed, ${counts.warn} warned, ${counts.fail} failed, ${counts.skip} skipped`);
  if (pageErrors.length || http5xx.length) {
    console.log(`Runtime errors: ${pageErrors.length} pageerror(s), ${http5xx.length} 5xx response(s)`);
  }
}
