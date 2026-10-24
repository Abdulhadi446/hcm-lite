// Live-site check with Playwright against the deployed URL.
// Usage: node scripts/deployed-check.mjs [--setup-only] [--leave-db]
// Screenshots land in .agent-logs/shots/deployed-*.png
import { chromium } from "playwright-core"
import fs from "node:fs"

const BASE = process.env.BASE_URL || "https://hcm-lite.thetrillioniar.me"
const SHOTS = ".agent-logs/shots"
fs.mkdirSync(SHOTS, { recursive: true })

const ADMIN = {
  name: "Demo Admin",
  email: process.env.ADMIN_EMAIL || "admin@demo.hcm",
  password: process.env.ADMIN_PASSWORD || "Admin@12345",
}

const errors = []
const failed = []
const steps = []
const ok = (m) => { steps.push(`✅ ${m}`); console.log(`✅ ${m}`) }
const bad = (m) => { steps.push(`❌ ${m}`); console.log(`❌ ${m}`) }

const browser = await chromium.launch({
  executablePath: "/usr/bin/chromium",
  args: ["--no-sandbox"],
})
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
const page = await ctx.newPage()
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()) })
page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`))
page.on("response", (r) => { if (r.status() >= 500) failed.push(`${r.status()} ${r.url()}`) })

try {
  // 1. Landing
  const res = await page.goto(BASE, { waitUntil: "domcontentloaded", timeout: 45000 })
  ok(`landing ${res?.status()} -> ${page.url()}`)
  await page.waitForTimeout(1500)

  // 2. Setup wizard (fresh install)
  if (page.url().includes("/setup")) {
    await page.fill("#companyName", "Saylani Demo Co")
    await page.screenshot({ path: `${SHOTS}/deployed-setup-1.png`, fullPage: true })
    await page.click('button[type="submit"]')
    await page.waitForSelector("#adminName", { timeout: 15000 })
    await page.fill("#adminName", ADMIN.name)
    await page.fill("#adminEmail", ADMIN.email)
    await page.fill("#adminPassword", ADMIN.password)
    await page.screenshot({ path: `${SHOTS}/deployed-setup-2.png`, fullPage: true })
    await page.click('button[type="submit"]')
    await page.waitForURL(/\/login/, { timeout: 30000 })
    ok("setup wizard created company + admin")

    // success overlay
    const goSignIn = page.getByRole("button", { name: /go to sign in/i })
    if (await goSignIn.count()) {
      await page.screenshot({ path: `${SHOTS}/deployed-setup-success.png` })
      await goSignIn.first().click()
      await page.waitForTimeout(1200)
    }
  } else {
    ok(`already initialized, at ${page.url()}`)
  }

  // 3. Login
  await page.waitForSelector("#email", { timeout: 20000 })
  await page.fill("#email", ADMIN.email)
  await page.fill("#password", ADMIN.password)
  await page.screenshot({ path: `${SHOTS}/deployed-login.png`, fullPage: true })
  await page.click('button[type="submit"]')
  await page.waitForURL((u) => !u.pathname.includes("/login"), { timeout: 30000 })
  if (page.url().includes("change-password")) {
    ok("forced password change screen (unexpected for admin)")
  }
  await page.waitForTimeout(2500)
  ok(`logged in -> ${page.url()}`)
  await page.screenshot({ path: `${SHOTS}/deployed-dashboard-desktop.png`, fullPage: true })

  // 4. Mobile viewport
  await page.setViewportSize({ width: 375, height: 812 })
  await page.waitForTimeout(800)
  await page.screenshot({ path: `${SHOTS}/deployed-dashboard-mobile.png`, fullPage: true })
  await page.setViewportSize({ width: 1440, height: 900 })

  // 5. Walk the primary nav, flag pages that break
  const navLinks = await page.$$eval("nav a[href^='/'], aside a[href^='/']", (as) =>
    [...new Set(as.map((a) => a.getAttribute("href")))].filter(Boolean)
  )
  for (const href of navLinks) {
    const r = await page.goto(`${BASE}${href}`, { waitUntil: "domcontentloaded", timeout: 30000 })
    await page.waitForTimeout(600)
    const body = await page.evaluate(() => document.body.innerText)
    const broken = /Application error|Internal Server Error|Unhandled Runtime Error/i.test(body)
    if (broken || !r || r.status() >= 400) bad(`${href} (${r?.status()}) broken`)
    else ok(`nav ${href}`)
  }
} catch (e) {
  bad(`fatal: ${e.message}`)
  await page.screenshot({ path: `${SHOTS}/deployed-error.png`, fullPage: true }).catch(() => {})
} finally {
  await browser.close()
}

console.log("\n--- console errors ---")
console.log(errors.length ? errors.slice(0, 15).join("\n") : "none")
console.log("--- 5xx responses ---")
console.log(failed.length ? [...new Set(failed)].slice(0, 15).join("\n") : "none")
console.log(`\n${steps.filter((s) => s.startsWith("❌")).length} failures / ${steps.length} steps`)
process.exit(steps.some((s) => s.startsWith("❌")) ? 1 : 0)
