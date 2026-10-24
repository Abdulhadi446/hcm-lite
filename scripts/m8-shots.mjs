#!/usr/bin/env node
/**
 * M8 UI screenshots + 375px overflow check.
 *
 *   DATABASE_URL=./.tmp/m8.db node node_modules/next/dist/bin/next start -p 3005
 *   node scripts/m8-shots.mjs
 *
 * Uses the system Chromium through playwright-core. Writes PNGs to
 * .agent-logs/shots/.
 */
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright-core";

const BASE = process.env.BASE_URL || "http://localhost:3005";
const OUT_DIR = path.resolve(process.cwd(), ".agent-logs/shots");
const ADMIN = { email: "admin@hcm.local", password: "admin12345" };

fs.mkdirSync(OUT_DIR, { recursive: true });

async function login(context) {
  const res = await context.request.post(`${BASE}/api/auth/login`, {
    data: ADMIN,
  });
  if (!res.ok()) throw new Error(`login failed: ${res.status()}`);
}

async function main() {
  const browser = await chromium.launch({
    executablePath: "/usr/bin/chromium",
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });

  try {
    // ---------------------------------------------------------- desktop
    const desktop = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await login(desktop);
    const page = await desktop.newPage();

    await page.goto(`${BASE}/announcements`, { waitUntil: "networkidle" });
    await page.getByText("Smoke: flexible Friday (updated)").waitFor();
    await page.screenshot({
      path: path.join(OUT_DIR, "m8-announcements-1440.png"),
      fullPage: true,
    });

    await page.goto(`${BASE}/audit`, { waitUntil: "networkidle" });
    await page.getByRole("columnheader", { name: "Actor" }).waitFor();
    const expand = page.getByRole("button", { name: "Show snapshots" }).first();
    if (await expand.count()) {
      await expand.click();
      await page.getByText("Before", { exact: true }).first().waitFor();
    }
    await page.screenshot({
      path: path.join(OUT_DIR, "m8-audit-1440.png"),
      fullPage: true,
    });

    await page.goto(`${BASE}/dashboard`, { waitUntil: "networkidle" });
    await page.getByRole("button", { name: /Notifications/ }).click();
    await page.getByText("Leave decisions, payslips and company announcements.").waitFor();
    await page.waitForTimeout(600);
    await page.screenshot({ path: path.join(OUT_DIR, "m8-bell-1440.png") });
    await desktop.close();

    // ----------------------------------------------------------- mobile
    const mobile = await browser.newContext({ viewport: { width: 375, height: 812 } });
    await login(mobile);
    const small = await mobile.newPage();

    const overflow = {};
    async function measure(name, url) {
      await small.goto(`${BASE}${url}`, { waitUntil: "networkidle" });
      await small.waitForTimeout(400);
      overflow[name] = await small.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }));
    }

    await small.goto(`${BASE}/announcements`, { waitUntil: "networkidle" });
    await small.getByText("Smoke: flexible Friday (updated)").waitFor();
    await small.screenshot({
      path: path.join(OUT_DIR, "m8-announcements-375.png"),
      fullPage: true,
    });

    await measure("announcements", "/announcements");
    await measure("audit", "/audit");
    await measure("dashboard", "/dashboard");

    console.log("375px scroll widths (documentElement.scrollWidth / clientWidth):");
    for (const [name, value] of Object.entries(overflow)) {
      console.log(`  ${name}: ${value.scrollWidth} / ${value.clientWidth}`);
    }
    const offenders = Object.entries(overflow)
      .filter(([, value]) => value.scrollWidth > value.clientWidth)
      .map(([name]) => name);
    console.log(offenders.length ? `OVERFLOW: ${offenders.join(", ")}` : "OVERFLOW: none");

    await mobile.close();
  } finally {
    await browser.close();
  }

  console.log("Screenshots written to .agent-logs/shots/");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
