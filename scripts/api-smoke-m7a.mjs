#!/usr/bin/env node
/**
 * M7a API smoke — AI client fallbacks, salary privacy, rate limit, tool dispatcher.
 *
 *   npx next build
 *   node scripts/api-smoke-m7a.mjs
 *
 * Starts a production server on port 3009 against `./.tmp/m7a.db` with NO
 * OPENAI_API_KEY (fallback path), seeds via real APIs, then restarts the server
 * with a local stub OpenAI-compatible endpoint to exercise the tool loop.
 * No dependencies. Exits non-zero when any step fails.
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const PORT = Number(process.env.PORT || 3009);
const BASE = process.env.BASE_URL || `http://localhost:${PORT}`;
const STUB_PORT = Number(process.env.STUB_PORT || 3911);
const DB_FILE = path.resolve(process.cwd(), process.env.SMOKE_DB || "./.tmp/m7a.db");
const LOG_DIR = path.resolve(process.cwd(), ".agent-logs");
const STAMP = new Date().toISOString().replace(/[:.]/g, "-");
const SERVER_LOG = path.join(LOG_DIR, `m7a-smoke-server-${STAMP}.log`);

const ADMIN = { name: "M7 Admin", email: "admin@hcm.local", password: "admin12345" };
const COMPANY = "M7a Smoke Co";
const HR = { name: "Hana HR", email: "hr@hcm.local", password: "hrpass12345" };
const ALI = { code: "EMP701", fullName: "Ali Khan", email: "ali@hcm.local", password: "tempPass1234" };
const BILAL = { code: "EMP702", fullName: "Bilal Ahmed", email: "bilal@hcm.local", password: "tempPass1234" };
const SARA = { code: "EMP703", fullName: "Sara Iqbal", email: "sara@hcm.local", password: "tempPass1234" };
const RATE_LIMIT = 20;

let failed = false;
let server = null;
let serverLog = null;
let stub = null;
let stubHits = 0;

const state = {};

function check(name, cond, detail) {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${detail ? `  — ${detail}` : ""}`);
  if (!cond) failed = true;
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
  const res = await fetch(BASE + urlPath, { method, headers, body: payload, redirect: "manual" });
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

// ------------------------------------------------------------ stub model

function startStub() {
  stub = http.createServer((req, res) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
    });
    req.on("end", () => {
      stubHits += 1;
      let body = {};
      try {
        body = JSON.parse(raw);
      } catch {
        /* ignore */
      }
      const tools = (body.tools ?? []).map((tool) => tool.function?.name).filter(Boolean);
      const messages = body.messages ?? [];
      const last = messages[messages.length - 1] ?? {};
      const hasToolResult = messages.some((message) => message.role === "tool");

      const respond = (message, finish) => {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(
          JSON.stringify({
            id: `chatcmpl-stub-${stubHits}`,
            object: "chat.completion",
            created: Math.floor(Date.now() / 1000),
            model: "stub-model",
            choices: [{ index: 0, finish_reason: finish, message }],
          })
        );
      };

      if (tools.includes("get_headcount") && !hasToolResult) {
        respond(
          {
            role: "assistant",
            content: null,
            tool_calls: [
              {
                id: `call_headcount_${stubHits}`,
                type: "function",
                function: { name: "get_headcount", arguments: "{}" },
              },
            ],
          },
          "tool_calls"
        );
        return;
      }

      const userText = String(
        [...messages].reverse().find((message) => message.role === "user")?.content ?? ""
      );
      const mentionsDates = /(\d{4}-\d{2}-\d{2}|\b\d{1,2}\b|\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b|today|tomorrow)/i.test(
        userText
      );

      if (tools.includes("submit_leave_suggestion") && !hasToolResult && mentionsDates) {
        const schema = body.tools.find(
          (tool) => tool.function?.name === "submit_leave_suggestion"
        )?.function?.parameters?.properties;
        const ids = schema?.leaveTypeId?.enum ?? [];
        respond(
          {
            role: "assistant",
            content: null,
            tool_calls: [
              {
                id: `call_leave_${stubHits}`,
                type: "function",
                function: {
                  name: "submit_leave_suggestion",
                  arguments: JSON.stringify({
                    leaveTypeId: ids[0] ?? 1,
                    startDate: "2026-03-06",
                    endDate: "2026-03-09",
                    reason: "flu",
                  }),
                },
              },
            ],
          },
          "tool_calls"
        );
        return;
      }

      const toolPayload = last.role === "tool" ? String(last.content ?? "") : "";
      const headcount = toolPayload.match(/"total":(\d+)/)?.[1] ?? "unknown";
      respond(
        {
          role: "assistant",
          content:
            last.role === "tool"
              ? `The tool returned: ${toolPayload.slice(0, 300)}. So the company total is ${headcount}.`
              : "Stub model answer.",
        },
        "stop"
      );
    });
  });
  return new Promise((resolve) => stub.listen(STUB_PORT, "127.0.0.1", resolve));
}

// --------------------------------------------------------------- server

function startServer(extraEnv) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
  fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });
  serverLog = fs.createWriteStream(SERVER_LOG, { flags: "a" });
  const env = { ...process.env, DATABASE_URL: DB_FILE, ...extraEnv };
  const command =
    process.env.SMOKE_DEV === "1" || !fs.existsSync(path.resolve(process.cwd(), ".next/BUILD_ID"))
      ? "dev"
      : "start";
  server = spawn(
    process.execPath,
    ["node_modules/next/dist/bin/next", command, "-p", String(PORT)],
    { cwd: process.cwd(), env, stdio: ["ignore", "pipe", "pipe"] }
  );
  server.stdout.pipe(serverLog);
  server.stderr.pipe(serverLog);
  server.on("exit", (code) => {
    if (code && code !== 0) console.error(`[server] exited with ${code}; see ${SERVER_LOG}`);
  });
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
  server = null;
}

async function waitForServer() {
  for (let i = 0; i < 160; i += 1) {
    try {
      const { res } = await request("/api/setup/status");
      if (res.ok) return true;
    } catch {
      /* retry */
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return false;
}

// ------------------------------------------------------------------ db

function openDb() {
  return new DatabaseSync(DB_FILE, { readOnly: true });
}

function aiLogsFor(userId) {
  const db = openDb();
  try {
    return db
      .prepare(
        "SELECT id, user_id, role, prompt, tool_calls, answer, model, latency_ms, ok, created_at " +
          "FROM ai_logs WHERE user_id = ? ORDER BY id DESC"
      )
      .all(userId);
  } finally {
    db.close();
  }
}

function aiLogCount() {
  const db = openDb();
  try {
    return Number(db.prepare("SELECT COUNT(*) AS c FROM ai_logs").get().c);
  } finally {
    db.close();
  }
}

function userIdByEmail(email) {
  const db = openDb();
  try {
    return db.prepare("SELECT id FROM users WHERE email = ?").get(email)?.id;
  } finally {
    db.close();
  }
}

// --------------------------------------------------------------- seeding

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
  check("seed: POST /api/setup", setup.res.status === 201, `status=${setup.res.status}`);

  const admin = await login(ADMIN.email, ADMIN.password);
  state.adminCookie = admin.cookie;
  check(
    "seed: Admin login",
    admin.res.status === 200 && !!state.adminCookie,
    `status=${admin.res.status}`
  );

  const hrCreate = await request("/api/users", {
    method: "POST",
    cookie: state.adminCookie,
    body: { name: HR.name, email: HR.email, role: "hr" },
  });
  const temp = hrCreate.json?.temporaryPassword;
  const hrFirst = await login(HR.email, temp);
  await request("/api/auth/change-password", {
    method: "POST",
    cookie: hrFirst.cookie,
    body: { currentPassword: temp, newPassword: HR.password },
  });
  const hrLogin = await login(HR.email, HR.password);
  state.hrCookie = hrLogin.cookie;
  check(
    "seed: Admin creates HR who sets a password",
    hrCreate.res.status === 201 && hrLogin.res.status === 200,
    `create=${hrCreate.res.status} login=${hrLogin.res.status}`
  );

  for (const employee of [ALI, BILAL, SARA]) {
    const created = await request("/api/employees", {
      method: "POST",
      cookie: state.hrCookie,
      body: {
        code: employee.code,
        fullName: employee.fullName,
        email: employee.email,
        joinDate: "2026-01-05",
        status: "active",
        basicSalary: 50000 + Number(employee.code.slice(-1)) * 5000,
        password: employee.password,
      },
    });
    if (employee === ALI) state.aliEmployeeId = created.json?.employee?.id;
    if (employee === BILAL) state.bilalEmployeeId = created.json?.employee?.id;
    if (employee === SARA) state.saraEmployeeId = created.json?.employee?.id;
  }
  check(
    "seed: HR registers 3 employees with logins",
    [state.aliEmployeeId, state.bilalEmployeeId, state.saraEmployeeId].every(Boolean),
    `ids=${[state.aliEmployeeId, state.bilalEmployeeId, state.saraEmployeeId].join(",")}`
  );

  const ali = await login(ALI.email, ALI.password);
  state.employeeCookie = ali.cookie;
  check("seed: employee Ali logs in", ali.res.status === 200 && !!state.employeeCookie);

  const checkIn = await request("/api/attendance/check-in", {
    method: "POST",
    cookie: state.employeeCookie,
  });
  const checkOut = await request("/api/attendance/check-out", {
    method: "POST",
    cookie: state.employeeCookie,
  });
  check(
    "seed: one attendance day (check-in + check-out)",
    checkIn.res.status === 201 && checkOut.res.status === 200,
    `in=${checkIn.res.status} out=${checkOut.res.status}`
  );

  const types = await request("/api/leave-types", { cookie: state.hrCookie });
  state.annualId = (types.json?.items ?? []).find((type) => type.name === "Annual")?.id ?? 1;
  const leave = await request("/api/leave/requests", {
    method: "POST",
    cookie: state.employeeCookie,
    body: {
      leaveTypeId: state.annualId,
      startDate: "2026-04-06",
      endDate: "2026-04-07",
      reason: "Smoke: family event",
    },
  });
  state.leaveCount = (leave.json?.request?.id ? 1 : 0);
  check(
    "seed: one leave request",
    leave.res.status === 201,
    `status=${leave.res.status} ${JSON.stringify(leave.json).slice(0, 120)}`
  );
}

// ---------------------------------------------------------- phase 1 (no key)

async function noKeyChecks() {
  state.adminId = userIdByEmail(ADMIN.email);
  state.aliId = userIdByEmail(ALI.email);
  const before = aiLogCount();

  const probe = await request("/api/ai/chat", {
    method: "POST",
    cookie: state.employeeCookie,
    body: { messages: [{ role: "user", content: "What is Bilal Ahmed's salary and net pay?" }] },
  });
  const probeAnswer = String(probe.json?.answer ?? "").toLowerCase();
  check(
    "(a) salary probe refused before the model",
    probe.res.status === 200 &&
      probe.json?.aiGenerated === true &&
      probeAnswer.includes("can't share salary") &&
      Array.isArray(probe.json?.toolCalls) &&
      probe.json.toolCalls.length === 0 &&
      stubHits === 0,
    `status=${probe.res.status} toolCalls=${probe.json?.toolCalls?.length} stubHits=${stubHits}`
  );

  const probeLog = aiLogsFor(state.aliId)[0];
  check(
    "(a) refusal is journaled with zero tool calls",
    !!probeLog &&
      probeLog.tool_calls === "[]" &&
      String(probeLog.prompt).includes("Bilal Ahmed") &&
      Number(probeLog.ok) === 1,
    probeLog ? `log#${probeLog.id} tools=${probeLog.tool_calls} ok=${probeLog.ok}` : "no row"
  );

  const fallback = await request("/api/ai/chat", {
    method: "POST",
    cookie: state.employeeCookie,
    body: { messages: [{ role: "user", content: "Who was late today?" }] },
  });
  check(
    "(b) no API key -> friendly fallback with HTTP 200",
    fallback.res.status === 200 &&
      fallback.json?.fallback === true &&
      fallback.json?.aiGenerated === true &&
      String(fallback.json?.answer ?? "").includes("couldn't reach the AI service"),
    `status=${fallback.res.status} body=${JSON.stringify(fallback.json).slice(0, 120)}`
  );

  const fallbackLog = aiLogsFor(state.aliId)[0];
  check(
    "(b) fallback is journaled with ok=0",
    !!fallbackLog && Number(fallbackLog.ok) === 0 && !!fallbackLog.model,
    fallbackLog ? `log#${fallbackLog.id} ok=${fallbackLog.ok} model=${fallbackLog.model}` : "no row"
  );

  let accepted = aiLogsFor(state.aliId).length;
  let limited = null;
  let limitedStatus = 0;
  for (let i = 0; i < 30 && !limited; i += 1) {
    const attempt = await request("/api/ai/chat", {
      method: "POST",
      cookie: state.employeeCookie,
      body: { messages: [{ role: "user", content: `Rate limit probe ${i}` }] },
    });
    if (attempt.res.status === 429) {
      limited = attempt;
      limitedStatus = 429;
    } else if (attempt.res.status === 200) {
      accepted += 1;
    }
  }
  const rowsInWindow = aiLogsFor(state.aliId).length;
  check(
    "(c) 21st request in an hour -> 429 rate_limited",
    accepted === RATE_LIMIT &&
      limitedStatus === 429 &&
      limited?.json?.error === "rate_limited" &&
      Number(limited?.json?.retryAfterSeconds) > 0 &&
      rowsInWindow === RATE_LIMIT,
    `accepted=${accepted} status=${limitedStatus} retryAfter=${limited?.json?.retryAfterSeconds} rows=${rowsInWindow}`
  );
  check(
    "(c) rate-limited calls are not journaled",
    rowsInWindow === RATE_LIMIT,
    `rows=${rowsInWindow} expected=${RATE_LIMIT}`
  );

  const logsAsEmployee = await request("/api/ai/logs", { cookie: state.employeeCookie });
  check(
    "GET /api/ai/logs as Employee -> 403",
    logsAsEmployee.res.status === 403,
    `status=${logsAsEmployee.res.status}`
  );

  const logsAsAdmin = await request("/api/ai/logs", { cookie: state.adminCookie });
  check(
    "GET /api/ai/logs as Admin -> latest rows",
    logsAsAdmin.res.status === 200 &&
      (logsAsAdmin.json?.items ?? []).length > 0 &&
      typeof logsAsAdmin.json.items[0].prompt === "string",
    `status=${logsAsAdmin.res.status} items=${logsAsAdmin.json?.items?.length}`
  );

  check("(a) probe never reached the stub model", stubHits === 0, `stubHits=${stubHits}`);
  check(
    "phase 1 wrote one ai_logs row per non-limited request",
    aiLogCount() === before + RATE_LIMIT,
    `total=${aiLogCount()} expected=${before + RATE_LIMIT}`
  );
}

// ------------------------------------------------------- phase 2 (stub key)

async function stubChecks() {
  const hitsBefore = stubHits;

  const headcount = await request("/api/ai/chat", {
    method: "POST",
    cookie: state.adminCookie,
    body: { messages: [{ role: "user", content: "Headcount by department?" }] },
  });
  const tools = headcount.json?.toolCalls ?? [];
  check(
    "(d) chat runs the real get_headcount tool via the model loop",
    headcount.res.status === 200 &&
      headcount.json?.aiGenerated === true &&
      !headcount.json?.fallback &&
      tools.length === 1 &&
      tools[0]?.name === "get_headcount" &&
      typeof tools[0]?.ms === "number" &&
      String(headcount.json?.answer ?? "").length > 0,
    `status=${headcount.res.status} tools=${JSON.stringify(tools)}`
  );

  const headcountLog = aiLogsFor(state.adminId)[0];
  check(
    "(d) tool call + answer journaled for the admin",
    !!headcountLog &&
      Number(headcountLog.ok) === 1 &&
      String(headcountLog.tool_calls).includes("get_headcount") &&
      String(headcountLog.answer).length > 0,
    headcountLog ? `log#${headcountLog.id} tools=${headcountLog.tool_calls}` : "no row"
  );
  check(
    "(d) dispatcher returned the seeded headcount",
    String(headcount.json?.answer ?? "").includes("3"),
    `answer=${String(headcount.json?.answer ?? "").slice(0, 160)}`
  );
  check("(d) the stub model was actually called", stubHits > hitsBefore, `hits=${stubHits - hitsBefore}`);

  const smart = await request("/api/ai/smart-leave", {
    method: "POST",
    cookie: state.employeeCookie,
    body: { text: "I was sick from 6 March to 9 March 2026, flu" },
  });
  check(
    "(e) smart-leave parses type + working days (weekend skipped)",
    smart.res.status === 200 &&
      smart.json?.ok === true &&
      smart.json?.parsed?.startDate === "2026-03-06" &&
      smart.json?.parsed?.endDate === "2026-03-09" &&
      smart.json?.parsed?.days === 2 &&
      Number(smart.json?.parsed?.leaveTypeId) > 0 &&
      !!smart.json?.parsed?.leaveTypeName,
    `status=${smart.res.status} parsed=${JSON.stringify(smart.json?.parsed)}`
  );

  const requests = await request("/api/leave/requests", { cookie: state.employeeCookie });
  check(
    "(e) smart-leave never writes a request",
    (requests.json?.items ?? []).length === state.leaveCount,
    `items=${(requests.json?.items ?? []).length} expected=${state.leaveCount}`
  );

  const empty = await request("/api/ai/smart-leave", {
    method: "POST",
    cookie: state.employeeCookie,
    body: { text: "no dates here at all" },
  });
  check(
    "(e) unparseable text -> { ok:false, message }",
    empty.res.status === 200 && empty.json?.ok === false && typeof empty.json?.message === "string",
    `body=${JSON.stringify(empty.json).slice(0, 140)}`
  );

  const anonymous = await request("/api/ai/chat", {
    method: "POST",
    body: { messages: [{ role: "user", content: "Hi" }] },
  });
  check("POST /api/ai/chat unauthenticated -> 401", anonymous.res.status === 401, `status=${anonymous.res.status}`);
}

// ------------------------------------------------------------------ main

async function main() {
  fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });
  for (const suffix of ["", "-wal", "-shm"]) fs.rmSync(DB_FILE + suffix, { force: true });

  await startStub();

  // Phase 1: no key at all.
  startServer({
    OPENAI_API_KEY: "",
    OPENAI_BASE_URL: "",
    OPENAI_MODEL: "",
    AI_MODEL: "",
  });
  if (!(await waitForServer())) {
    console.error(`Server did not start; see ${SERVER_LOG}`);
    process.exit(2);
  }

  await seed();
  await noKeyChecks();

  await stopServer();

  // Phase 2: stub OpenAI-compatible endpoint exercises the tool loop.
  startServer({
    OPENAI_API_KEY: "stub-key",
    OPENAI_BASE_URL: `http://127.0.0.1:${STUB_PORT}/v1`,
    OPENAI_MODEL: "stub-model",
  });
  if (!(await waitForServer())) {
    console.error(`Server did not restart; see ${SERVER_LOG}`);
    process.exit(2);
  }

  const admin = await login(ADMIN.email, ADMIN.password);
  state.adminCookie = admin.cookie;
  await stubChecks();
}

main()
  .catch((err) => {
    console.error(err);
    failed = true;
  })
  .finally(async () => {
    await stopServer();
    stub?.close();
    for (const suffix of ["", "-wal", "-shm"]) fs.rmSync(DB_FILE + suffix, { force: true });
    console.log(`\n${failed ? "SMOKE FAILED" : "SMOKE PASSED"}  (server log: ${SERVER_LOG})`);
    process.exit(failed ? 1 : 0);
  });
