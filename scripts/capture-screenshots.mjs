/**
 * Capture README/showcase screenshots from a running instance with sample data.
 *
 *   BASE_URL=https://hcm-lite.thetrillioniar.me node scripts/capture-screenshots.mjs
 *
 * Defaults to the local dev server. Writes to docs/screenshots/.
 */
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const OUT = process.env.OUT_DIR ?? "docs/screenshots";
const ADMIN = {
  email: process.env.ADMIN_EMAIL ?? "admin@demo.hcm",
  password: process.env.ADMIN_PASSWORD ?? "Admin@12345",
};
const EMPLOYEE = {
  email: process.env.EMPLOYEE_EMAIL ?? "ayesha.khan@hcm.demo",
  password: process.env.EMPLOYEE_PASSWORD ?? "Demo@12345",
};

mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH ?? "/usr/bin/chromium",
  args: ["--no-sandbox"],
});

async function session(creds, viewport = { width: 1440, height: 900 }) {
  const page = await browser.newPage({ viewport });
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  await page.goto(BASE + "/login", { waitUntil: "networkidle" });
  await page.fill("#email", creds.email);
  await page.fill("#password", creds.password);
  await page.click("button[type=submit]");
  await page.waitForURL("**/dashboard", { timeout: 30000 });
  await waitForContent(page);
  return { page, errors };
}

async function waitForContent(page, timeout = 20000) {
  await page.waitForLoadState("networkidle").catch(() => {});
  await page
    .waitForFunction(() => !document.querySelector(".animate-pulse"), null, { timeout })
    .catch(() => {});
}

async function shot(page, name, opts = {}) {
  await waitForContent(page);
  await page.waitForTimeout(opts.settle ?? 700);
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: opts.fullPage ?? false });
  console.log("shot", `${OUT}/${name}.png`, page.url());
}

// Admin views
{
  const { page, errors } = await session(ADMIN);
  await shot(page, "dashboard-admin", { fullPage: true });

  await page.goto(BASE + "/attendance", { waitUntil: "networkidle" });
  // The board defaults to today; step back to the nearest weekday so it has data.
  const prevDay = page.locator('[aria-label="Previous day"]');
  if (await prevDay.count()) await prevDay.click();
  await page.waitForTimeout(900);
  await shot(page, "attendance-board", { fullPage: true });

  await page.goto(BASE + "/leave", { waitUntil: "networkidle" });
  await shot(page, "leave-requests");

  await page.goto(BASE + "/payroll", { waitUntil: "networkidle" });
  await shot(page, "payroll-runs");
  const runLink = page.locator('a[href^="/payroll/"]').first();
  if (await runLink.count()) {
    await runLink.click();
    await page.waitForURL(/\/payroll\/.+/, { timeout: 15000 }).catch(() => {});
    if (/\/payroll\/.+/.test(page.url())) await shot(page, "payroll-detail", { fullPage: true });
  }

  await page.goto(BASE + "/ai", { waitUntil: "networkidle" });
  await page.waitForTimeout(600);
  const input = page.locator("textarea, input[type=text]").first();
  if (await input.count()) {
    await input.fill("How many employees do we have and who was late today?");
    await page.keyboard.press("Enter");
    await page.waitForTimeout(9000);
    await shot(page, "ai-assistant");
  }

  await page.goto(BASE + "/organization", { waitUntil: "networkidle" });
  await shot(page, "organization", { fullPage: true });

  console.log("admin console errors:", errors.length ? errors : "none");
  await page.close();
}

// Employee views + mobile
{
  const { page, errors } = await session(EMPLOYEE);
  await page.goto(BASE + "/my-attendance", { waitUntil: "networkidle" });
  await shot(page, "my-attendance", { fullPage: true });
  await page.goto(BASE + "/my-leave", { waitUntil: "networkidle" });
  await shot(page, "my-leave");
  await page.close();

  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  await mobile.goto(BASE + "/login", { waitUntil: "networkidle" });
  await mobile.fill("#email", EMPLOYEE.email);
  await mobile.fill("#password", EMPLOYEE.password);
  await mobile.click("button[type=submit]");
  await mobile.waitForURL("**/dashboard", { timeout: 30000 });
  await mobile.waitForLoadState("networkidle");
  await mobile.waitForTimeout(700);
  await mobile.screenshot({ path: `${OUT}/dashboard-mobile.png`, fullPage: false });
  console.log("shot", `${OUT}/dashboard-mobile.png`, mobile.url());
  const overflow = await mobile.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  console.log("mobile horizontal overflow px:", overflow);
  await mobile.close();
  console.log("employee console errors:", errors.length ? errors : "none");
}

await browser.close();
console.log("done");
