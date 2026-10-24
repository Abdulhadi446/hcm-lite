import { chromium } from "playwright-core";
import fs from "node:fs";

const BASE = process.env.BASE_URL || "http://localhost:3000";
const OUT = ".agent-logs/shots";
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  executablePath: "/usr/bin/chromium",
  args: ["--no-sandbox"],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
const errors = [];
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
page.on("pageerror", (e) => errors.push(String(e)));

async function shot(name) {
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
  console.log("shot", name, page.url());
}

await page.goto(BASE + "/", { waitUntil: "networkidle" });
console.log("after /", page.url());
await shot("01-root-desktop");

if (!page.url().includes("/setup")) {
  await page.goto(BASE + "/setup", { waitUntil: "networkidle" });
}
await shot("02-setup-step1-desktop");

await page.fill("#companyName", "Zaitoon Labs");
await page.getByRole("button", { name: "Continue", exact: true }).click();
await page.waitForTimeout(600);
await shot("03-setup-step2-desktop");

await page.fill("#adminName", "Ayesha Khan");
await page.fill("#adminEmail", "admin@zaitoon.test");
await page.fill("#adminPassword", "hcm12345678");
await page.getByRole("button", { name: /create admin account/i }).click();
await page.waitForTimeout(1500);
console.log("after setup", page.url());
await shot("04-login-desktop");

if (page.url().includes("/login")) {
  await page.fill("#email", "admin@zaitoon.test");
  await page.fill("#password", "hcm12345678");
  await page.getByRole("button", { name: /sign in|log in/i }).click();
  await page.waitForTimeout(2000);
}
console.log("after login", page.url());
await shot("05-dashboard-desktop");

await page.setViewportSize({ width: 375, height: 812 });
await page.waitForTimeout(500);
await shot("06-dashboard-mobile");

await page.goto(BASE + "/employees", { waitUntil: "networkidle" });
await shot("07-employees-mobile");

await page.goto(BASE + "/login", { waitUntil: "networkidle" });
await shot("08-login-mobile");

console.log("console errors:", errors.slice(0, 10));
await browser.close();
