#!/usr/bin/env node
/**
 * M7 UI screenshots: /ai empty state + a stubbed conversation, 1440 and 375.
 *
 *   node scripts/m7b-shots.mjs        # BASE_URL=http://localhost:3006
 *
 * Uses the system Chromium through playwright-core. Writes PNGs to
 * .agent-logs/shots/.
 */
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright-core";

const BASE = process.env.BASE_URL || "http://localhost:3006";
const OUT_DIR = path.resolve(process.cwd(), ".agent-logs/shots");
const ADMIN = { email: "admin@zaitoon.test", password: "hcm12345678" };

const STUB = [
  {
    answer:
      "Two people were late today:\n\n- **Hira Qureshi** — checked in at 09:42\n- **Bilal Ahmed** — checked in at 09:28\n\nEveryone else checked in before the 09:15 grace window.",
    toolCalls: [{ name: "get_late_comers", ms: 42 }],
    aiGenerated: true,
  },
  {
    answer:
      "Attendance this month is **96.2%** across 2 active employees — 40 present days out of 42 working days. Late arrivals are at **4.8%**.",
    toolCalls: [
      { name: "get_attendance_summary", ms: 118 },
      { name: "get_headcount", ms: 24 },
    ],
    aiGenerated: true,
  },
];

fs.mkdirSync(OUT_DIR, { recursive: true });

async function login(context) {
  const res = await context.request.post(`${BASE}/api/auth/login`, { data: ADMIN });
  if (!res.ok()) throw new Error(`login failed: ${res.status()}`);
}

function stubFetch(page) {
  return page.addInitScript((responses) => {
    const original = window.fetch.bind(window);
    let index = 0;
    window.fetch = async (input, init) => {
      const url = typeof input === "string" ? input : input.url;
      if (url.includes("/api/ai/chat")) {
        const body = responses[Math.min(index, responses.length - 1)];
        index += 1;
        await new Promise((resolve) => setTimeout(resolve, 180));
        return new Response(JSON.stringify(body), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      return original(input, init);
    };
  }, STUB);
}

async function ask(page, text) {
  const box = page.getByRole("textbox", { name: "Message the AI assistant" });
  await box.fill(text);
  await box.press("Enter");
  await page.getByText("AI-generated").last().waitFor();
  await page.waitForTimeout(500);
}

async function main() {
  const browser = await chromium.launch({
    executablePath: "/usr/bin/chromium",
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  const report = {};

  try {
    // ------------------------------------------------------------- desktop
    const desktop = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await login(desktop);
    const page = await desktop.newPage();
    await stubFetch(page);

    await page.goto(`${BASE}/ai`, { waitUntil: "networkidle" });
    await page.getByText("What would you like to know?").waitFor();
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(OUT_DIR, "m7b-empty-1440.png") });

    await page.getByRole("button", { name: "Who was late today?" }).click();
    await page.getByText("AI-generated").waitFor();
    await ask(page, "And what's our attendance rate this month?");
    await page.screenshot({ path: path.join(OUT_DIR, "m7b-chat-1440.png") });

    report.desktop = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      pageScrolls: document.documentElement.scrollHeight > window.innerHeight + 1,
    }));
    await desktop.close();

    // -------------------------------------------------------------- mobile
    const mobile = await browser.newContext({ viewport: { width: 375, height: 812 } });
    await login(mobile);
    const small = await mobile.newPage();
    await stubFetch(small);

    await small.goto(`${BASE}/ai`, { waitUntil: "networkidle" });
    await small.getByText("What would you like to know?").waitFor();
    await small.waitForTimeout(400);
    await small.screenshot({ path: path.join(OUT_DIR, "m7b-empty-375.png") });

    await small.getByRole("button", { name: "Who was late today?" }).click();
    await small.getByText("AI-generated").waitFor();
    await small.waitForTimeout(600);
    await small.screenshot({ path: path.join(OUT_DIR, "m7b-chat-375.png") });

    report.mobile = await small.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      bodyScrollWidth: document.body.scrollWidth,
      pageScrolls: document.documentElement.scrollHeight > window.innerHeight + 1,
    }));

    if (report.mobile.scrollWidth > 375) {
      throw new Error(`horizontal overflow at 375px: ${report.mobile.scrollWidth}`);
    }
    await mobile.close();
  } finally {
    await browser.close();
  }

  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
