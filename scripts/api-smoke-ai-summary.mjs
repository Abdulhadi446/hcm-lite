#!/usr/bin/env node
/**
 * AI dashboard summary (#20) API smoke test.
 *
 * Runs against an already-built, already-started lane server:
 *
 *   MODE=ai       BASE_URL=http://localhost:3051 node scripts/api-smoke-ai-summary.mjs
 *   MODE=fallback BASE_URL=http://localhost:3052 node scripts/api-smoke-ai-summary.mjs
 *
 * `MODE=ai` expects the server to have a real key (aiGenerated:true);
 * `MODE=fallback` expects `OPENAI_API_KEY=` / `OPENROUTER_API_KEY=` so the
 * deterministic rules-based path is exercised. Seeds a fresh DB through the
 * real APIs (`/api/setup` -> login -> `/api/demo/seed`).
 *
 * Optional:
 *   CHECK_RATE_LIMIT=1  loop until the 21st call returns 429 (fallback mode only)
 *   SMOKE_DB=<path>     also assert the `ai_logs` row was written
 */
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const BASE = process.env.BASE_URL || "http://localhost:3051";
const MODE = process.env.MODE === "fallback" ? "fallback" : "ai";
const CHECK_RATE_LIMIT = process.env.CHECK_RATE_LIMIT === "1";
const SMOKE_DB = process.env.SMOKE_DB ? path.resolve(process.cwd(), process.env.SMOKE_DB) : null;
const LOG_DIR = path.resolve(process.cwd(), ".agent-logs");
const STAMP = new Date().toISOString().replace(/[:.]/g, "-");
const LOG_FILE = path.join(LOG_DIR, `m10-ai-summary-smoke-${MODE}-${STAMP}.log`);

const ADMIN = { name: "M10 Admin", email: "admin@hcm.local", password: "admin12345" };
const COMPANY = "M10 Summary Co";
const EMPLOYEE_PASSWORD = "Demo@12345";

let pass = 0;
let fail = 0;

const logLines = [];
function log(line = "") {
  console.log(line);
  logLines.push(line);
}

function check(name, cond, detail) {
  if (cond) pass += 1;
  else fail += 1;
  log(`${cond ? "PASS" : "FAIL"}  ${name}${detail ? `  — ${detail}` : ""}`);
  return !!cond;
}

async function request(urlPath, { method = "GET", body, cookie } = {}) {
  const headers = {};
  if (cookie) headers.cookie = cookie;
  let payload;
  if (body !== undefined) {
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

async function login(email, password) {
  const result = await request("/api/auth/login", { method: "POST", body: { email, password } });
  return { ...result, cookie: cookieFrom(result.res) };
}

function monthBounds(todayIso) {
  const [year, month] = todayIso.split("-").map(Number);
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return {
    start: `${todayIso.slice(0, 7)}-01`,
    end: `${todayIso.slice(0, 7)}-${String(last).padStart(2, "0")}`,
  };
}

function money(value) {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

async function seed() {
  const setup = await request("/api/setup", {
    method: "POST",
    body: {
      companyName: COMPANY,
      adminName: ADMIN.name,
      adminEmail: ADMIN.email,
      adminPassword: ADMIN.password,
    },
  });
  check(
    "setup: fresh DB created (or already initialized)",
    setup.res.status === 201 || setup.res.status === 409,
    `status=${setup.res.status}`
  );

  const admin = await login(ADMIN.email, ADMIN.password);
  check(
    "admin login -> 200 + cookie",
    admin.res.status === 200 && admin.json?.user?.role === "admin" && !!admin.cookie,
    `status=${admin.res.status}`
  );
  if (!admin.cookie) throw new Error("Admin login failed; cannot continue.");

  const demo = await request("/api/demo/seed", { method: "POST", cookie: admin.cookie });
  check(
    "demo seed -> 201 (or 409 not_empty when re-run)",
    demo.res.status === 201 || demo.res.status === 409,
    `status=${demo.res.status} ${demo.text.slice(0, 120)}`
  );

  const employee = demo.json?.credentials?.[0];
  return { adminCookie: admin.cookie, employee };
}

function assertBullets(label, json) {
  const bullets = Array.isArray(json?.insights) ? json.insights : [];
  check(
    `${label}: 3-5 bullets`,
    bullets.length >= 3 && bullets.length <= 5,
    `${bullets.length} bullets`
  );
  check(
    `${label}: every bullet is a non-empty string <= 200 chars`,
    bullets.every(
      (item) => typeof item === "string" && item.trim().length > 0 && item.length <= 200
    ),
    JSON.stringify(bullets.map((item) => String(item).length))
  );
  check(
    `${label}: no markdown/code fences`,
    bullets.every((item) => !/\*\*|`|^#|^[-*•]\s/.test(item)),
    "checked bullets for **, backticks, headings, list markers"
  );
  return bullets;
}

async function run() {
  log(`AI summary smoke — MODE=${MODE} BASE=${BASE}`);

  const { adminCookie, employee } = await seed();
  const today = new Date().toISOString().slice(0, 10);
  const range = monthBounds(today);
  const rangeQuery = `from=${range.start}&to=${range.end}`;

  // KPI ground truth (server-computed by the dashboard endpoint).
  const dashboard = await request(`/api/dashboard/summary?${rangeQuery}`, { cookie: adminCookie });
  check(
    "dashboard KPIs: headcount 6 and payroll cost > 0",
    dashboard.res.status === 200 &&
      dashboard.json?.kpis?.headcount === 6 &&
      Number(dashboard.json?.kpis?.payrollCost) > 0,
    JSON.stringify({
      headcount: dashboard.json?.kpis?.headcount,
      attendanceRate: dashboard.json?.kpis?.attendanceRate,
      payrollCost: dashboard.json?.kpis?.payrollCost,
      payrollLabel: dashboard.json?.kpis?.payrollLabel,
    })
  );

  const started = Date.now();
  const summary = await request(`/api/ai/summary?${rangeQuery}`, { cookie: adminCookie });
  const elapsed = Date.now() - started;

  check(
    "GET /api/ai/summary -> 200",
    summary.res.status === 200,
    `status=${summary.res.status} ${summary.text.slice(0, 160)}`
  );
  check("response.ok === true", summary.json?.ok === true);
  check(
    "generatedAt is an ISO timestamp",
    typeof summary.json?.generatedAt === "string" &&
      !Number.isNaN(Date.parse(summary.json.generatedAt)),
    summary.json?.generatedAt
  );

  const bullets = assertBullets("summary", summary.json);
  log("\nInsight bullets:");
  bullets.forEach((bullet, index) => log(`  ${index + 1}. ${bullet}`));
  log(`\nSource: aiGenerated=${summary.json?.aiGenerated} fallback=${summary.json?.fallback} model=${summary.json?.model ?? "—"} in ${elapsed} ms\n`);

  if (MODE === "ai") {
    check("MODE=ai: aiGenerated === true", summary.json?.aiGenerated === true);
    check("MODE=ai: fallback === false", summary.json?.fallback === false);
    check(
      "MODE=ai: model reported",
      typeof summary.json?.model === "string" && summary.json.model.length > 0,
      summary.json?.model
    );
    check(
      "MODE=ai: bullets reference computed numbers",
      bullets.some((bullet) => /\d/.test(bullet)),
      "at least one digit in the bullets"
    );
    const payroll = Number(dashboard.json?.kpis?.payrollCost ?? 0);
    const payrollDigits = money(payroll).replace(/,/g, "");
    const mentionsPayroll =
      bullets.some((bullet) => bullet.replace(/,/g, "").includes(payrollDigits)) ||
      bullets.some((bullet) => /payroll|salary cost|wage/i.test(bullet));
    check(
      "MODE=ai: payroll (aggregate) is referenced, cost matches dashboard",
      mentionsPayroll,
      `payrollCost=${money(payroll)}`
    );
  } else {
    check("MODE=fallback: fallback === true", summary.json?.fallback === true);
    check("MODE=fallback: aiGenerated === false", summary.json?.aiGenerated === false);
    check("MODE=fallback: no model field", summary.json?.model === undefined);
    check(
      "MODE=fallback: bullets mention the 6-person headcount",
      bullets.some((bullet) => /\b6 employees\b/.test(bullet)),
      bullets.find((bullet) => /\b6 employees\b/.test(bullet)) ?? "none"
    );
    const payroll = Number(dashboard.json?.kpis?.payrollCost ?? 0);
    check(
      "MODE=fallback: payroll bullet carries the dashboard payroll cost",
      bullets.some((bullet) => bullet.includes(money(payroll))),
      `payrollCost=${money(payroll)}`
    );
    check(
      "MODE=fallback: attendance rate is quoted",
      bullets.some((bullet) =>
        bullet.includes(`${dashboard.json?.kpis?.attendanceRate}%`)
      ),
      `attendanceRate=${dashboard.json?.kpis?.attendanceRate}%`
    );
  }

  // ------------------------------------------------------------ guardrails
  if (employee?.email) {
    const employeeLogin = await login(employee.email, employee.password || EMPLOYEE_PASSWORD);
    check(
      "employee login -> 200",
      employeeLogin.res.status === 200 && employeeLogin.json?.user?.role === "employee",
      `status=${employeeLogin.res.status}`
    );
    const forbidden = await request("/api/ai/summary", { cookie: employeeLogin.cookie });
    check(
      "employee role -> 403",
      forbidden.res.status === 403,
      `status=${forbidden.res.status}`
    );
  } else {
    check("employee credentials available from the seed response", false, "no credentials[]");
  }

  const anonymous = await request("/api/ai/summary");
  check("missing auth -> 401", anonymous.res.status === 401, `status=${anonymous.res.status}`);

  const reversed = await request(
    `/api/ai/summary?from=${range.end}&to=${range.start}`,
    { cookie: adminCookie }
  );
  check(
    "from > to -> 400 with field=from",
    reversed.res.status === 400 &&
      (reversed.json?.field === "from" || reversed.json?.fields?.from !== undefined),
    `status=${reversed.res.status} ${reversed.text.slice(0, 120)}`
  );

  const badDate = await request("/api/ai/summary?from=2026-13-01", { cookie: adminCookie });
  check(
    "invalid date -> 400",
    badDate.res.status === 400,
    `status=${badDate.res.status}`
  );

  const badDept = await request("/api/ai/summary?departmentId=abc", { cookie: adminCookie });
  check(
    "non-numeric departmentId -> 400",
    badDept.res.status === 400,
    `status=${badDept.res.status}`
  );

  const deptSummary = await request(
    `/api/ai/summary?${rangeQuery}&departmentId=1`,
    { cookie: adminCookie }
  );
  check(
    "department filter -> 200 with bullets",
    deptSummary.res.status === 200 &&
      Array.isArray(deptSummary.json?.insights) &&
      deptSummary.json.insights.length >= 3,
    `status=${deptSummary.res.status} bullets=${deptSummary.json?.insights?.length ?? 0}`
  );

  if (CHECK_RATE_LIMIT) {
    let hit = false;
    let attempts = 0;
    for (; attempts < 30; attempts += 1) {
      const probe = await request("/api/ai/summary", { cookie: adminCookie });
      if (probe.res.status === 429) {
        hit = true;
        check(
          "rate limit: 429 with retryAfterSeconds after 20 calls/hour",
          probe.json?.error === "rate_limited" &&
            Number(probe.json?.retryAfterSeconds) > 0,
          `retryAfterSeconds=${probe.json?.retryAfterSeconds} after ${attempts + 1} probes`
        );
        break;
      }
      if (probe.res.status !== 200) break;
    }
    if (!hit) check("rate limit: 429 reached", false, `no 429 after ${attempts} calls`);
  } else {
    log("SKIP  rate limit check (set CHECK_RATE_LIMIT=1 in fallback mode)");
  }

  if (SMOKE_DB) {
    if (!fs.existsSync(SMOKE_DB)) {
      check("ai_logs row written", false, `DB not found at ${SMOKE_DB}`);
    } else {
      const db = new DatabaseSync(SMOKE_DB, { readOnly: true });
      try {
        const row = db
          .prepare(
            "SELECT COUNT(*) AS c FROM ai_logs WHERE prompt LIKE '[dashboard_summary]%'"
          )
          .get();
        check(
          "ai_logs: dashboard_summary rows written",
          Number(row?.c) > 0,
          `rows=${row?.c}`
        );
      } finally {
        db.close();
      }
    }
  }
}

run()
  .catch((err) => {
    fail += 1;
    log(`FAIL  uncaught: ${err instanceof Error ? err.message : String(err)}`);
  })
  .finally(() => {
    log(`\n${fail === 0 ? "PASS" : "FAIL"} — ${pass} passed, ${fail} failed`);
    try {
      fs.mkdirSync(LOG_DIR, { recursive: true });
      fs.writeFileSync(LOG_FILE, `${logLines.join("\n")}\n`);
      console.log(`log: ${LOG_FILE}`);
    } catch {
      /* ignore log write errors */
    }
    process.exitCode = fail === 0 ? 0 : 1;
  });
