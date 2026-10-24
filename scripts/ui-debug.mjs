import { chromium } from "playwright-core";

const BASE = process.env.BASE_URL || "http://localhost:3000";
const browser = await chromium.launch({ executablePath: "/usr/bin/chromium", args: ["--no-sandbox"] });
const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });

await page.goto(BASE + "/login", { waitUntil: "networkidle" });
await page.fill("#email", "admin@zaitoon.test");
await page.fill("#password", "hcm12345678");
await page.getByRole("button", { name: /sign in|log in/i }).click();
await page.waitForURL("**/dashboard");
await page.waitForTimeout(800);

const info = await page.evaluate(() => {
  const pick = (sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return {
      sel,
      x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height),
      position: cs.position, marginLeft: cs.marginLeft, paddingLeft: cs.paddingLeft,
      display: cs.display,
    };
  };
  return {
    docWidth: document.documentElement.clientWidth,
    main: pick("main"),
    aside: pick("aside"),
    header: pick("header"),
    h1: pick("h1"),
    shellRoot: pick("body > div"),
    cards: [...document.querySelectorAll('[data-slot="card"]')].slice(0, 5).map((el) => {
      const r = el.getBoundingClientRect();
      return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width) };
    }),
  };
});
console.log(JSON.stringify(info, null, 2));
await browser.close();
