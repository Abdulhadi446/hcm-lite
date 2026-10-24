#!/usr/bin/env node
/**
 * API smoke test against a running HCM server.
 * Usage: BASE_URL=http://localhost:3001 node scripts/api-smoke.mjs
 * No dependencies. Exits non-zero when any step fails.
 */
const BASE = process.env.BASE_URL || "http://localhost:3001";
const EMAIL = process.env.SMOKE_ADMIN_EMAIL || "admin@hcm.local";
const PASSWORD = process.env.SMOKE_ADMIN_PASSWORD || "admin12345";
const NEW_PASSWORD = process.env.SMOKE_NEW_PASSWORD || "admin987654";
const NAME = process.env.SMOKE_ADMIN_NAME || "Smoke Admin";
const COMPANY = process.env.SMOKE_COMPANY || "Smoke Test Co";

let cookieJar = "";
let failed = false;

function check(name, cond, detail) {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${detail ? `  — ${detail}` : ""}`);
  if (!cond) failed = true;
  return cond;
}

async function call(path, { method = "GET", body, headers = {}, raw = false } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      "content-type": "application/json",
      ...(cookieJar ? { cookie: cookieJar } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
    redirect: "manual",
  });
  if (raw) return { res, json: null };
  let json = null;
  try {
    json = await res.json();
  } catch {
    /* non-JSON */
  }
  return { res, json };
}

function captureCookies(res) {
  const setCookies = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
  for (const c of setCookies) {
    if (c.startsWith("hcm_session=")) {
      const cookie = c.split(";")[0];
      cookieJar = cookie === "hcm_session=" || c.includes("=;") ? "" : cookie;
    }
  }
}

async function status() {
  const { res, json } = await call("/api/setup/status");
  return { res, json };
}

async function login(email, password, expectOk = true) {
  const { res, json } = await call("/api/auth/login", {
    method: "POST",
    body: { email, password },
  });
  captureCookies(res);
  if (expectOk && !res.ok) {
    console.error(`  login(${email}) -> ${res.status}`, JSON.stringify(json));
  }
  return { res, json };
}

const steps = [];

steps.push(async () => {
  for (let i = 0; i < 20; i++) {
    try {
      const { res } = await status();
      if (res.ok) return "server up";
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  return "server did not respond on " + BASE;
});

steps.push(async () => {
  const { res, json } = await status();
  check("setup/status responds OK", res.ok && typeof json?.initialized === "boolean",
    `status=${res.status} initialized=${json?.initialized}`);
});

steps.push(async () => {
  const { res, json } = await call("/api/setup", {
    method: "POST",
    body: { companyName: COMPANY, adminName: NAME, adminEmail: EMAIL, adminPassword: PASSWORD },
  });
  const ok = res.status === 201 || json?.error === "already_initialized";
  check("setup POST 201 (or 409 if already initialized)", ok, `status=${res.status} ${JSON.stringify(json)}`);
});

steps.push(async () => {
  const { res, json } = await status();
  check("setup/status initialized=true after setup", res.ok && json?.initialized === true);
});

steps.push(async () => {
  const { res, json } = await call("/api/setup", {
    method: "POST",
    body: { companyName: COMPANY, adminName: NAME, adminEmail: EMAIL, adminPassword: PASSWORD },
  });
  check("setup re-run -> 409 already_initialized", res.status === 409 && json?.error === "already_initialized",
    `status=${res.status}`);
});

steps.push(async () => {
  const { res, json } = await login(EMAIL, "wrong-password", false);
  check("login wrong password -> 401 invalid_credentials", res.status === 401 && json?.error === "invalid_credentials",
    `status=${res.status}`);
});

steps.push(async () => {
  const { res, json } = await login(EMAIL, PASSWORD);
  const user = json?.user;
  check("login ok -> 200 {user}", res.status === 200 && user?.email === EMAIL && user?.role === "admin",
    `status=${res.status} role=${user?.role}`);
});

steps.push(async () => {
  const { res, json } = await call("/api/auth/me");
  const user = json?.user;
  check("me with cookie -> 200 {user: SessionUser}", res.status === 200 && user?.email === EMAIL && Array.isArray(
    Object.keys(user)
  ), `companyName=${user?.companyName}`);
});

steps.push(async () => {
  const { res, json } = await call("/api/auth/change-password", {
    method: "POST",
    body: { currentPassword: PASSWORD, newPassword: NEW_PASSWORD },
  });
  check("change-password -> 200 {ok:true}", res.status === 200 && json?.ok === true, `status=${res.status}`);
});

steps.push(async () => {
  const { res, json } = await login(EMAIL, PASSWORD, false);
  check("login with OLD password after change -> 401", res.status === 401 && json?.error === "invalid_credentials");
});

steps.push(async () => {
  const { res, json } = await login(EMAIL, NEW_PASSWORD);
  check("login with NEW password -> 200", res.status === 200 && json?.user?.email === EMAIL);
});

steps.push(async () => {
  const { res, json } = await call("/api/auth/logout", { method: "POST" });
  captureCookies(res);
  check("logout -> 200 {ok:true} + clear cookie", res.status === 200 && json?.ok === true && !cookieJar);
});

steps.push(async () => {
  const { res } = await call("/api/auth/me");
  check("me after logout -> 401", res.status === 401);
});

async function main() {
  const up = await steps[0]();
  if (up !== "server up") {
    console.log(`FAIL  server up — ${up}`);
    process.exit(1);
  }
  console.log("PASS  server up");
  for (const step of steps.slice(1)) {
    try {
      await step();
    } catch (err) {
      console.error("FAIL  step threw:", err);
      failed = true;
    }
  }
  console.log(failed ? "\nSMOKE: FAIL" : "\nSMOKE: ALL PASS");
  process.exit(failed ? 1 : 0);
}

main();
