#!/usr/bin/env node
/**
 * M6 dashboard screenshots (1440 + 375) for the Admin/HR and Employee views.
 *
 *   node scripts/api-smoke-m6.mjs   # seeds ./.tmp/m6.db (run first)
 *   node scripts/m6-shots.mjs
 *
 * Starts its own production server on port 3008 against the smoke DB, then
 * asserts `document.scrollWidth <= 375` on the narrow shots.
 * Output: .agent-logs/shots/m6-*.png
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright-core";

const PORT = Number(process.env.PORT || 3008);
const BASE = process.env.BASE_URL || `http://localhost:${PORT}`;
const DB_FILE = path.resolve(process.cwd(), process.env.SMOKE_DB || "./.tmp/m6.db");
const LOG_DIR = path.resolve(process.cwd(), ".agent-logs");
const OUT = path.join(LOG_DIR, "shots");
const STAMP = new Date().toISOString().replace(/[:.]/g, "-");
const SERVER_LOG = path.join(LOG_DIR, `m6-shots-server-${STAMP}.log`);

const ADMIN = { email: "admin@hcm.local", password: "admin12345" };
const EMPLOYEE = { email: "e1@hcm.local", password: "emp1pass4567" };

let failed = false;
let server = null;
let serverLog = null;

function check(name, ok, detail) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  — ${detail}` : ""}`);
  if (!ok) failed = true;
}

function startServer() {
  if (!fs.existsSync(DB_FILE)) {
    console.error(`Missing ${path.relative(process.cwd(), DB_FILE)} — run scripts/api-smoke-m6.mjs first.`);
    process.exit(1);
  }
  fs.mkdirSync(LOG_DIR, { recursive: true });
  fs.mkdirSync(OUT, { recursive: true });
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
      const res = await fetch(`${BASE}/api/setup/status`);
      if (res.ok) return true;
    } catch {
      /* retry */
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return false;
}

async function shot(page, name) {
  await page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: true });
  console.log(`shot  .agent-logs/shots/${name}.png`);
}

async function assertNoHorizontalScroll(page, name) {
  const width = await page.evaluate(() => document.documentElement.scrollWidth);
  check(`${name}: document.scrollWidth <= 375`, width <= 375, `scrollWidth=${width}`);
}

async function login(page, { email, password }) {
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.fill("#email", email);
  await page.fill("#password", password);
  await page.getByRole("button", { name: /^sign in$/i }).click();
  await page.waitForURL(/\/dashboard/, { timeout: 20000 });
  await page.waitForLoadState("networkidle");
}

async function main() {
  startServer();
  const up = await waitForServer();
  if (!up) {
    console.error(`FAIL  server did not start on ${BASE}; see ${SERVER_LOG}`);
    await stopServer();
    process.exit(1);
  }
  console.log(`PASS  server up on ${BASE} (db ${path.relative(process.cwd(), DB_FILE)})`);

  const browser = await chromium.launch({
    executablePath: "/usr/bin/chromium",
    args: ["--no-sandbox"],
  });

  try {
    // ---------------------------------------------------------- admin / HR
    const adminContext = await browser.newContext({ viewport: { width: 1440, height: 960 } });
    const adminPage = await adminContext.newPage();
    const errors = [];
    adminPage.on("pageerror", (err) => errors.push(String(err)));
    adminPage.on("console", (msg) => {
      if (msg.type() === "error") errors.push(msg.text());
    });

    await login(adminPage, ADMIN);
    await adminPage.goto(`${BASE}/dashboard?from=2026-09-01&to=2026-09-30`, {
      waitUntil: "networkidle",
    });
    await adminPage.getByText("Attendance trend").waitFor({ timeout: 15000 });
    await shot(adminPage, "m6-admin-1440");
    check(
      "admin dashboard renders KPI values (headcount 5, attendance 9.1%)",
      (await adminPage.getByText("9.1%").count()) > 0 && (await adminPage.getByText("Headcount").count()) > 0
    );

    await adminPage.setViewportSize({ width: 375, height: 812 });
    await adminPage.reload({ waitUntil: "networkidle" });
    await adminPage.getByText("Attendance trend").waitFor({ timeout: 15000 });
    await shot(adminPage, "m6-admin-375");
    await assertNoHorizontalScroll(adminPage, "m6-admin-375");

    const adminErrors = errors.filter(
      (text) => !/favicon|Failed to load resource/i.test(text)
    );
    check(
      "admin dashboard has no console/page errors",
      adminErrors.length === 0,
      adminErrors.slice(0, 3).join(" | ")
    );

    // ------------------------------------------------------------ employee
    await adminContext.request.post(`${BASE}/api/auth/logout`);
    const employeeContext = await browser.newContext({ viewport: { width: 1440, height: 960 } });
    const employeePage = await employeeContext.newPage();
    const employeeErrors = [];
    employeePage.on("pageerror", (err) => employeeErrors.push(String(err)));

    await login(employeePage, EMPLOYEE);
    await pageUrl(employeePage, `${BASE}/dashboard`);
    await employeePage.getByText("Leave balance").waitFor({ timeout: 15000 });
    await shot(employeePage, "m6-employee-1440");
    check(
      "employee dashboard renders personal cards (no company KPIs)",
      (await employeePage.getByText("Hours this week").count()) > 0 &&
        (await employeePage.getByText("Pending approvals").count()) === 0
    );

    await employeePage.setViewportSize({ width: 375, height: 812 });
    await employeePage.reload({ waitUntil: "networkidle" });
    await employeePage.getByText("Leave balance").waitFor({ timeout: 15000 });
    await shot(employeePage, "m6-employee-375");
    await assertNoHorizontalScroll(employeePage, "m6-employee-375");
    check(
      "employee dashboard has no page errors",
      employeeErrors.length === 0,
      employeeErrors.slice(0, 3).join(" | ")
    );

    await adminContext.close();
    await employeeContext.close();
  } finally {
    await browser.close();
    await stopServer();
  }

  console.log(failed ? "\nM6 SHOTS: FAIL" : "\nM6 SHOTS: ALL PASS");
  process.exit(failed ? 1 : 0);
}

async function pageUrl(page, url) {
  await page.goto(url, { waitUntil: "networkidle" });
}

main();
