#!/usr/bin/env node
/**
 * Face-verified attendance smoke test (docs/FACE-ATTENDANCE-CONTRACT.md).
 *
 * Runs against an ALREADY RUNNING server on a FRESH DB. Real faces cannot be
 * produced in CI, so embeddings are synthetic and deterministic:
 *   - base1 / base2   : two different "people" (orthogonal unit vectors)
 *   - same1           : base1 + tiny noise (same person, cosine ~1)
 *   - impostor1       : orthogonal to base1 (cosine ~0)
 *
 * Fresh DB:
 *   rm -f .tmp/face.db*
 *   DATABASE_URL=file:./.tmp/face.db node_modules/.bin/next dev -p 3016
 *   BASE_URL=http://localhost:3016 node scripts/api-smoke-face.mjs
 *
 * No dependencies. Exits non-zero when any step fails.
 */
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const BASE = process.env.BASE_URL || "http://localhost:3016";
const DB_FILE = path.resolve(process.cwd(), process.env.SMOKE_DB || "./.tmp/face.db");

const COMPANY = "Face Smoke Co";
const ADMIN = { name: "Face Admin", email: "admin@face.local", password: "admin12345" };
const HR = { name: "Face HR", email: "hr@face.local", password: "hrpass12345" };
const EMP1 = {
  code: "FACE001",
  fullName: "Face One",
  email: "face1@face.local",
  joinDate: "2026-01-05",
  basicSalary: 60000,
  password: "facepass12345",
};
const EMP2 = {
  code: "FACE002",
  fullName: "Face Two",
  email: "face2@face.local",
  joinDate: "2026-01-05",
  basicSalary: 50000,
  password: "facepass12346",
};
const EMP3 = {
  code: "FACE003",
  fullName: "Face Three",
  email: "face3@face.local",
  joinDate: "2026-01-05",
  basicSalary: 50000,
  password: "facepass12347",
};

const OFFICE = { latitude: 12.9716, longitude: 77.5946 };
const RADIUS_M = 150;
const DIMENSIONS = 1024;

let failed = false;
const responseBodies = [];

function check(name, cond, detail) {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${detail ? `  — ${detail}` : ""}`);
  if (!cond) failed = true;
  return !!cond;
}

function pad2(n) {
  return n < 10 ? `0${n}` : String(n);
}

function todayIso() {
  const now = new Date();
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
}

// ------------------------------------------------------------- embeddings

function seededVector(seed) {
  const vector = new Array(DIMENSIONS);
  for (let i = 0; i < DIMENSIONS; i += 1) {
    vector[i] =
      Math.sin((i + 1) * 0.013 * seed) +
      Math.cos((i + 1) * 0.007 / (seed + 1)) +
      ((i * 31 + seed * 17) % 13) / 13;
  }
  return vector;
}

function unit(vector) {
  let sum = 0;
  for (const value of vector) sum += value * value;
  const norm = Math.sqrt(sum);
  return vector.map((value) => value / norm);
}

function addNoise(vector) {
  return unit(vector.map((value, index) => value + 0.0025 * Math.sin(index * 0.11)));
}

function orthogonalize(candidate, base) {
  let dot = 0;
  for (let i = 0; i < base.length; i += 1) dot += candidate[i] * base[i];
  return unit(candidate.map((value, i) => value - dot * base[i]));
}

function cosine(a, b) {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

const base1 = unit(seededVector(1));
const base2 = orthogonalize(unit(seededVector(2)), base1);
const same1 = addNoise(base1);
const impostor1 = orthogonalize(unit(seededVector(99)), base1);
const zeroVector = new Array(DIMENSIONS).fill(0);

// ---------------------------------------------------------------- transport

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
  responseBodies.push({ path: urlPath, json });
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

function containsEmbeddingPayload(value) {
  if (Array.isArray(value)) {
    if (value.length === DIMENSIONS && value.every((item) => typeof item === "number")) {
      return true;
    }
    return value.some(containsEmbeddingPayload);
  }
  if (value && typeof value === "object") {
    if (Object.prototype.hasOwnProperty.call(value, "embedding")) return true;
    return Object.values(value).some(containsEmbeddingPayload);
  }
  return false;
}

// ---------------------------------------------------------------------- db

function openDb() {
  return new DatabaseSync(DB_FILE);
}

function dbGet(sql, ...params) {
  const db = openDb();
  try {
    return db.prepare(sql).get(...params);
  } finally {
    db.close();
  }
}

function dbAll(sql, ...params) {
  const db = openDb();
  try {
    return db.prepare(sql).all(...params);
  } finally {
    db.close();
  }
}

function dbRun(sql, ...params) {
  const db = openDb();
  try {
    return db.prepare(sql).run(...params);
  } finally {
    db.close();
  }
}

/**
 * Simulate ten minutes passing for one user's challenge budget. The dedicated
 * 429 assertion below still runs on a user whose rows are untouched.
 */
function ageChallenges(userId) {
  dbRun(
    "UPDATE face_challenges SET created_at = ? WHERE user_id = ?",
    "2020-01-01T00:00:00.000Z",
    userId
  );
}

// ---------------------------------------------------------------- face api

async function newChallenge(cookie, purpose) {
  const result = await request("/api/attendance/face/challenge", {
    method: "POST",
    cookie,
    body: { purpose },
  });
  return { ...result, challengeId: result.json?.challengeId };
}

async function challengeId(cookie, purpose) {
  const result = await newChallenge(cookie, purpose);
  if (!result.res.ok || !result.challengeId) {
    throw new Error(`challenge(${purpose}) failed: ${result.res.status} ${result.text}`);
  }
  return result.challengeId;
}

function enroll(cookie, challenge, embedding) {
  return request("/api/attendance/face/enroll", {
    method: "POST",
    cookie,
    body: { challengeId: challenge, embedding },
  });
}

function punch(cookie, action, challenge, embedding, location, extra = {}) {
  return request(`/api/attendance/face/${action}`, {
    method: "POST",
    cookie,
    body: { challengeId: challenge, embedding, location, ...extra },
  });
}

function officeLocation(overrides = {}) {
  return { latitude: OFFICE.latitude, longitude: OFFICE.longitude, accuracy: 12, ...overrides };
}

// -------------------------------------------------------------------- state

const state = {};

async function setupCompany() {
  const { res, json } = await request("/api/setup", {
    method: "POST",
    body: {
      companyName: COMPANY,
      adminName: ADMIN.name,
      adminEmail: ADMIN.email,
      adminPassword: ADMIN.password,
    },
  });
  check("POST /api/setup creates company + admin -> 201", res.status === 201 && json?.ok === true,
    `status=${res.status} ${JSON.stringify(json)}`);
}

async function configureOffice() {
  const { res, json } = await request("/api/settings", {
    method: "PATCH",
    cookie: state.adminCookie,
    body: { officeLat: OFFICE.latitude, officeLng: OFFICE.longitude, radiusM: RADIUS_M },
  });
  check("PATCH /api/settings sets office geofence (150 m)",
    res.status === 200 &&
      json?.settings?.officeLat === OFFICE.latitude &&
      json?.settings?.officeLng === OFFICE.longitude &&
      json?.settings?.radiusM === RADIUS_M,
    `status=${res.status} lat=${json?.settings?.officeLat} radius=${json?.settings?.radiusM}`);
}

async function createEmployee(spec, key) {
  const { res, json } = await request("/api/employees", {
    method: "POST",
    cookie: state.hrCookie,
    body: {
      code: spec.code,
      fullName: spec.fullName,
      email: spec.email,
      joinDate: spec.joinDate,
      status: "active",
      basicSalary: spec.basicSalary,
      password: spec.password,
    },
  });
  state[`${key}EmployeeId`] = json?.employee?.id;
  return { res, json };
}

// --------------------------------------------------------------------- main

async function main() {
  // boot
  let up = false;
  for (let i = 0; i < 60; i += 1) {
    try {
      const { res } = await request("/api/setup/status");
      if (res.ok) {
        up = true;
        break;
      }
    } catch {
      /* retry */
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  if (!up) {
    console.log(`FAIL  server up — no response on ${BASE}`);
    process.exit(1);
  }
  console.log("PASS  server up");
  responseBodies.length = 0;

  check("synthetic vectors: same-person cosine ≈ 1", cosine(base1, same1) > 0.99,
    `cos=${cosine(base1, same1).toFixed(5)}`);
  check("synthetic vectors: impostor cosine ≈ 0", Math.abs(cosine(base1, impostor1)) < 0.01,
    `cos=${cosine(base1, impostor1).toFixed(5)}`);
  check("synthetic vectors: second person orthogonal to first",
    Math.abs(cosine(base1, base2)) < 0.01, `cos=${cosine(base1, base2).toFixed(5)}`);

  // ---------------------------------------------------------------- setup
  await setupCompany();

  const adminLogin = await login(ADMIN.email, ADMIN.password);
  state.adminCookie = adminLogin.cookie;
  check("admin login -> 200", adminLogin.res.status === 200 && !!state.adminCookie,
    `status=${adminLogin.res.status}`);

  await configureOffice();

  const hrUser = await request("/api/users", {
    method: "POST",
    cookie: state.adminCookie,
    body: { name: HR.name, email: HR.email, role: "hr", password: HR.password },
  });
  const hrLogin = await login(HR.email, HR.password);
  state.hrCookie = hrLogin.cookie;
  check("HR account created + can log in",
    hrUser.res.status === 201 && hrLogin.res.status === 200 && !!state.hrCookie,
    `create=${hrUser.res.status} login=${hrLogin.res.status}`);

  const e1 = await createEmployee(EMP1, "emp1");
  const e2 = await createEmployee(EMP2, "emp2");
  const e3 = await createEmployee(EMP3, "emp3");
  check("three employees created through /api/employees",
    e1.res.status === 201 && e2.res.status === 201 && e3.res.status === 201,
    `ids=${state.emp1EmployeeId},${state.emp2EmployeeId},${state.emp3EmployeeId}`);

  const l1 = await login(EMP1.email, EMP1.password);
  const l2 = await login(EMP2.email, EMP2.password);
  const l3 = await login(EMP3.email, EMP3.password);
  state.emp1Cookie = l1.cookie;
  state.emp2Cookie = l2.cookie;
  state.emp3Cookie = l3.cookie;
  state.emp1UserId = l1.json?.user?.id;
  state.emp2UserId = l2.json?.user?.id;
  check("all three employees can log in", !!state.emp1Cookie && !!state.emp2Cookie && !!state.emp3Cookie,
    `statuses=${l1.res.status},${l2.res.status},${l3.res.status}`);

  // -------------------------------------------------------- unauthenticated
  const anonStatus = await request("/api/attendance/face/status");
  const anonChallenge = await request("/api/attendance/face/challenge", {
    method: "POST",
    body: { purpose: "enroll" },
  });
  const anonEnroll = await request("/api/attendance/face/enroll", {
    method: "POST",
    body: { challengeId: "x", embedding: base1 },
  });
  const anonPunch = await request("/api/attendance/face/check-in", {
    method: "POST",
    body: { challengeId: "x", embedding: base1, location: officeLocation() },
  });
  const anonList = await request("/api/attendance/face/verifications");
  check("unauthenticated face endpoints -> 401",
    anonStatus.res.status === 401 &&
      anonChallenge.res.status === 401 &&
      anonEnroll.res.status === 401 &&
      anonPunch.res.status === 401 &&
      anonList.res.status === 401,
    `statuses=${anonStatus.res.status},${anonChallenge.res.status},${anonEnroll.res.status},${anonPunch.res.status},${anonList.res.status}`);

  // -------------------------------------------------------------- status v0
  const before = await request("/api/attendance/face/status", { cookie: state.emp1Cookie });
  check("status before enrollment: enrolled=false, hasEmployeeProfile, officeConfigured, threshold 0.62",
    before.res.status === 200 &&
      before.json?.enrolled === false &&
      before.json?.version === 0 &&
      before.json?.hasEmployeeProfile === true &&
      before.json?.officeConfigured === true &&
      before.json?.radiusM === RADIUS_M &&
      before.json?.threshold === 0.62,
    `status=${before.res.status} ${JSON.stringify(before.json)}`);

  // --------------------------------------------- check-in with no template
  const noTemplateChallenge = await challengeId(state.emp2Cookie, "check-in");
  const noTemplate = await punch(
    state.emp2Cookie,
    "check-in",
    noTemplateChallenge,
    base2,
    officeLocation()
  );
  check("check-in with no template -> 409 face_not_enrolled",
    noTemplate.res.status === 409 && noTemplate.json?.error === "face_not_enrolled",
    `status=${noTemplate.res.status} error=${noTemplate.json?.error}`);

  // -------------------------------------------------------------- enrol flow
  const challengeA = await challengeId(state.emp1Cookie, "enroll");
  const challengeB = await challengeId(state.emp1Cookie, "enroll");
  const invalidated = await enroll(state.emp1Cookie, challengeA, base1);
  check("older unused challenge invalidated by a newer one -> 409 challenge_expired",
    invalidated.res.status === 409 && invalidated.json?.error === "challenge_expired",
    `status=${invalidated.res.status} error=${invalidated.json?.error}`);

  const firstEnroll = await enroll(state.emp1Cookie, challengeB, base1);
  check("enrol with a valid challenge -> 201 version 1",
    firstEnroll.res.status === 201 &&
      firstEnroll.json?.ok === true &&
      firstEnroll.json?.template?.version === 1 &&
      firstEnroll.json?.template?.dimensions === DIMENSIONS &&
      firstEnroll.json?.template?.model === "faceres",
    `status=${firstEnroll.res.status} ${JSON.stringify(firstEnroll.json)}`);

  const reused = await enroll(state.emp1Cookie, challengeB, base1);
  check("reusing an already spent challenge -> 409 challenge_used",
    reused.res.status === 409 && reused.json?.error === "challenge_used",
    `status=${reused.res.status} error=${reused.json?.error}`);

  const expiringChallenge = await challengeId(state.emp1Cookie, "enroll");
  dbRun(
    "UPDATE face_challenges SET expires_at = ? WHERE id = ?",
    "2020-01-01T00:00:00.000Z",
    expiringChallenge
  );
  const expired = await enroll(state.emp1Cookie, expiringChallenge, base1);
  check("expired challenge -> 409 challenge_expired",
    expired.res.status === 409 && expired.json?.error === "challenge_expired",
    `status=${expired.res.status} error=${expired.json?.error}`);

  const wrongPurposeChallenge = await challengeId(state.emp1Cookie, "check-in");
  const wrongPurpose = await enroll(state.emp1Cookie, wrongPurposeChallenge, base1);
  check("enrolling with a check-in challenge -> 422 challenge_purpose_mismatch",
    wrongPurpose.res.status === 422 && wrongPurpose.json?.error === "challenge_purpose_mismatch",
    `status=${wrongPurpose.res.status} error=${wrongPurpose.json?.error}`);

  // malformed embeddings (validation happens before consuming the challenge)
  const shortChallenge = await challengeId(state.emp1Cookie, "enroll");
  const shortEmbedding = await enroll(state.emp1Cookie, shortChallenge, base1.slice(0, 10));
  const nanEmbeddingVector = base1.slice();
  nanEmbeddingVector[100] = null;
  const nullChallenge = await challengeId(state.emp1Cookie, "enroll");
  const nullEmbedding = await enroll(state.emp1Cookie, nullChallenge, nanEmbeddingVector);
  const zeroChallenge = await challengeId(state.emp1Cookie, "enroll");
  const zeroEmbedding = await enroll(state.emp1Cookie, zeroChallenge, zeroVector);
  check("malformed embeddings (wrong length / non-finite / zero norm) -> 422 invalid_embedding",
    shortEmbedding.res.status === 422 &&
      shortEmbedding.json?.error === "invalid_embedding" &&
      nullEmbedding.res.status === 422 &&
      nullEmbedding.json?.error === "invalid_embedding" &&
      zeroEmbedding.res.status === 422 &&
      zeroEmbedding.json?.error === "invalid_embedding",
    `statuses=${shortEmbedding.res.status},${nullEmbedding.res.status},${zeroEmbedding.res.status}`);

  // ---------------------------------------------------------- re-enrollment
  const afterFirst = await request("/api/attendance/face/status", { cookie: state.emp1Cookie });
  check("status after first enrol: enrolled=true, version 1, enrolledAt set",
    afterFirst.res.status === 200 &&
      afterFirst.json?.enrolled === true &&
      afterFirst.json?.version === 1 &&
      typeof afterFirst.json?.enrolledAt === "string",
    `enrolled=${afterFirst.json?.enrolled} version=${afterFirst.json?.version}`);

  const reEnrollChallenge = await challengeId(state.emp1Cookie, "enroll");
  const reEnroll = await enroll(state.emp1Cookie, reEnrollChallenge, same1);
  const afterReEnroll = await request("/api/attendance/face/status", { cookie: state.emp1Cookie });
  check("re-enrolment replaces the template and bumps version -> 2",
    reEnroll.res.status === 201 &&
      reEnroll.json?.template?.version === 2 &&
      afterReEnroll.json?.version === 2,
    `enrollVersion=${reEnroll.json?.template?.version} statusVersion=${afterReEnroll.json?.version}`);

  // --------------------------------------------------- check-in gates (emp1)
  // The enrollment cases above already spent 8 of the 10 challenges/10 min
  // budget for this user; age them so the punch gates can each get a fresh one.
  ageChallenges(state.emp1UserId);

  const mismatchChallenge = await challengeId(state.emp1Cookie, "check-in");
  const mismatch = await punch(
    state.emp1Cookie,
    "check-in",
    mismatchChallenge,
    impostor1,
    officeLocation()
  );
  const rowsAfterMismatch = Number(
    dbGet("SELECT COUNT(*) AS c FROM attendance WHERE employee_id = ? AND date = ?",
      state.emp1EmployeeId, todayIso()).c
  );
  check("mismatched embedding -> 403 face_mismatch with score, no attendance row",
    mismatch.res.status === 403 &&
      mismatch.json?.error === "face_mismatch" &&
      typeof mismatch.json?.score === "number" &&
      mismatch.json.score < 0.62 &&
      rowsAfterMismatch === 0,
    `status=${mismatch.res.status} score=${mismatch.json?.score} attendanceRows=${rowsAfterMismatch}`);

  const invalidLocationChallenge = await challengeId(state.emp1Cookie, "check-in");
  const invalidLocation = await punch(
    state.emp1Cookie,
    "check-in",
    invalidLocationChallenge,
    same1,
    officeLocation({ latitude: 200 })
  );
  check("latitude 200 -> 422 invalid_location",
    invalidLocation.res.status === 422 && invalidLocation.json?.error === "invalid_location",
    `status=${invalidLocation.res.status} error=${invalidLocation.json?.error}`);

  const poorAccuracyChallenge = await challengeId(state.emp1Cookie, "check-in");
  const poorAccuracy = await punch(
    state.emp1Cookie,
    "check-in",
    poorAccuracyChallenge,
    same1,
    officeLocation({ accuracy: 250 })
  );
  check("accuracy 250 m -> 422 poor_accuracy",
    poorAccuracy.res.status === 422 && poorAccuracy.json?.error === "poor_accuracy",
    `status=${poorAccuracy.res.status} error=${poorAccuracy.json?.error}`);

  const outsideChallenge = await challengeId(state.emp1Cookie, "check-in");
  const outside = await punch(
    state.emp1Cookie,
    "check-in",
    outsideChallenge,
    same1,
    officeLocation({ latitude: OFFICE.latitude + 0.05, accuracy: 15 })
  );
  check("outside geofence -> 422 outside_geofence with distance + radius",
    outside.res.status === 422 &&
      outside.json?.error === "outside_geofence" &&
      typeof outside.json?.distance === "number" &&
      outside.json.distance > RADIUS_M &&
      outside.json?.radius === RADIUS_M,
    `status=${outside.res.status} distance=${outside.json?.distance} radius=${outside.json?.radius}`);

  // ------------------------------------------------------ successful punches
  const checkInChallenge = await challengeId(state.emp1Cookie, "check-in");
  const checkIn = await punch(
    state.emp1Cookie,
    "check-in",
    checkInChallenge,
    same1,
    officeLocation(),
    { employeeId: state.emp2EmployeeId }
  );
  check("face check-in -> 200, source=camera, verification_method=face, identity from session",
    checkIn.res.status === 200 &&
      checkIn.json?.attendance?.source === "camera" &&
      checkIn.json?.attendance?.verificationMethod === "face" &&
      checkIn.json?.attendance?.employeeId === state.emp1EmployeeId &&
      checkIn.json?.verification?.matched === true &&
      checkIn.json?.verification?.method === "face" &&
      typeof checkIn.json?.verification?.score === "number",
    `status=${checkIn.res.status} employeeId=${checkIn.json?.attendance?.employeeId} source=${checkIn.json?.attendance?.source} method=${checkIn.json?.attendance?.verificationMethod} score=${checkIn.json?.verification?.score}`);

  const duplicateChallenge = await challengeId(state.emp1Cookie, "check-in");
  const duplicate = await punch(
    state.emp1Cookie,
    "check-in",
    duplicateChallenge,
    same1,
    officeLocation()
  );
  check("duplicate face check-in -> 409 already_checked_in",
    duplicate.res.status === 409 && duplicate.json?.error === "already_checked_in",
    `status=${duplicate.res.status} error=${duplicate.json?.error}`);

  const checkOutChallenge = await challengeId(state.emp1Cookie, "check-out");
  const checkOut = await punch(
    state.emp1Cookie,
    "check-out",
    checkOutChallenge,
    same1,
    officeLocation()
  );
  check("face check-out -> 200 with camera/face metadata",
    checkOut.res.status === 200 &&
      checkOut.json?.attendance?.source === "camera" &&
      checkOut.json?.attendance?.verificationMethod === "face" &&
      typeof checkOut.json?.attendance?.checkOutAt === "string",
    `status=${checkOut.res.status} source=${checkOut.json?.attendance?.source} method=${checkOut.json?.attendance?.verificationMethod}`);

  const secondOutChallenge = await challengeId(state.emp1Cookie, "check-out");
  const secondOut = await punch(
    state.emp1Cookie,
    "check-out",
    secondOutChallenge,
    same1,
    officeLocation()
  );
  check("second face check-out -> 409 already_checked_out",
    secondOut.res.status === 409 && secondOut.json?.error === "already_checked_out",
    `status=${secondOut.res.status} error=${secondOut.json?.error}`);

  const rowAfterPunch = dbGet(
    "SELECT source, verification_method, check_in_at, check_out_at FROM attendance WHERE employee_id = ? AND date = ?",
    state.emp1EmployeeId,
    todayIso()
  );
  check("DB attendance row: source=camera, verification_method=face",
    rowAfterPunch?.source === "camera" && rowAfterPunch?.verification_method === "face",
    `source=${rowAfterPunch?.source} method=${rowAfterPunch?.verification_method}`);

  // --------------------------------------------- second employee / templates
  const emp2EnrollChallenge = await challengeId(state.emp2Cookie, "enroll");
  const emp2Enroll = await enroll(state.emp2Cookie, emp2EnrollChallenge, base2);
  check("second employee can enroll their own template -> 201",
    emp2Enroll.res.status === 201 && emp2Enroll.json?.template?.version === 1,
    `status=${emp2Enroll.res.status}`);

  const crossChallenge = await challengeId(state.emp2Cookie, "check-in");
  const crossPunch = await punch(
    state.emp2Cookie,
    "check-in",
    crossChallenge,
    base1,
    officeLocation(),
    { employeeId: state.emp1EmployeeId }
  );
  const emp2Rows = Number(
    dbGet("SELECT COUNT(*) AS c FROM attendance WHERE employee_id = ? AND date = ?",
      state.emp2EmployeeId, todayIso()).c
  );
  check("employee 2 cannot use employee 1's template (employeeId body ignored) -> 403 face_mismatch",
    crossPunch.res.status === 403 &&
      crossPunch.json?.error === "face_mismatch" &&
      emp2Rows === 0,
    `status=${crossPunch.res.status} error=${crossPunch.json?.error} emp2AttendanceRows=${emp2Rows}`);

  // ------------------------------------------------------- verification feed
  const emp1Count = Number(
    dbGet("SELECT COUNT(*) AS c FROM face_verifications WHERE user_id = ?", state.emp1UserId).c
  );
  const emp2Count = Number(
    dbGet("SELECT COUNT(*) AS c FROM face_verifications WHERE user_id = ?", state.emp2UserId).c
  );
  const ownFeed = await request("/api/attendance/face/verifications?limit=100", {
    cookie: state.emp1Cookie,
  });
  const items = ownFeed.json?.items ?? [];
  check("verifications feed returns own rows with no embedding field",
    ownFeed.res.status === 200 &&
      items.length === emp1Count &&
      items.every((item) =>
        typeof item.action === "string" &&
        typeof item.matched === "boolean" &&
        !Object.prototype.hasOwnProperty.call(item, "embedding")
      ),
    `items=${items.length} dbRows=${emp1Count}`);

  const scopedFeed = await request(
    `/api/attendance/face/verifications?limit=100&employeeId=${state.emp2EmployeeId}`,
    { cookie: state.emp1Cookie }
  );
  const scopedItems = scopedFeed.json?.items ?? [];
  check("employee ?employeeId= is ignored; feed stays scoped to the session user",
    scopedFeed.res.status === 200 &&
      scopedItems.length === emp1Count &&
      scopedItems.length !== emp2Count,
    `items=${scopedItems.length} own=${emp1Count} emp2=${emp2Count}`);

  const adminScoped = await request(
    `/api/attendance/face/verifications?limit=100&employeeId=${state.emp1EmployeeId}`,
    { cookie: state.adminCookie }
  );
  const adminOwn = await request("/api/attendance/face/verifications?limit=100", {
    cookie: state.adminCookie,
  });
  check("admin may inspect an employee's feed; admin's own feed is empty",
    adminScoped.res.status === 200 &&
      (adminScoped.json?.items ?? []).length === emp1Count &&
      (adminOwn.json?.items ?? []).length === 0,
    `scoped=${(adminScoped.json?.items ?? []).length} own=${(adminOwn.json?.items ?? []).length}`);

  // ------------------------------------------------------------- rate limit
  const rateStatuses = [];
  for (let i = 0; i < 11; i += 1) {
    const result = await newChallenge(state.emp3Cookie, "enroll");
    rateStatuses.push(result.res.status);
  }
  const rateLimited = await newChallenge(state.emp3Cookie, "enroll");
  check("challenge rate limit: 10 / 10 min / user -> 429 rate_limited",
    rateStatuses.slice(0, 10).every((status) => status === 200) &&
      rateStatuses[10] === 429 &&
      rateLimited.res.status === 429 &&
      rateLimited.json?.error === "rate_limited",
    `statuses=${rateStatuses.join(",")} then=${rateLimited.res.status}/${rateLimited.json?.error}`);

  // ---------------------------------------------------------------- db view
  const template = dbGet(
    "SELECT version, dimensions, model, embedding FROM face_templates WHERE employee_id = ?",
    state.emp1EmployeeId
  );
  check("DB template: version 2, 1024 dims, faceres, JSON embedding stored",
    template?.version === 2 &&
      template?.dimensions === DIMENSIONS &&
      template?.model === "faceres" &&
      typeof template?.embedding === "string",
    `version=${template?.version} dims=${template?.dimensions} model=${template?.model}`);

  const columns = dbAll("PRAGMA table_info(face_verifications)").map((column) => column.name);
  check("DB face_verifications has no embedding column", !columns.includes("embedding"),
    `columns=${columns.join(",")}`);

  const attendanceCount = Number(
    dbGet("SELECT COUNT(*) AS c FROM attendance WHERE employee_id = ? AND date = ?",
      state.emp1EmployeeId, todayIso()).c
  );
  const emp2AttendanceCount = Number(
    dbGet("SELECT COUNT(*) AS c FROM attendance WHERE employee_id = ? AND date = ?",
      state.emp2EmployeeId, todayIso()).c
  );
  check("exactly one attendance row per employee; no row created by failed attempts",
    attendanceCount === 1 && emp2AttendanceCount === 0,
    `emp1=${attendanceCount} emp2=${emp2AttendanceCount}`);

  const auditActions = dbAll("SELECT action, entity FROM audit_logs").map(
    (row) => `${row.action}:${row.entity}`
  );
  check("audit trail contains attendance.face_check_in and attendance.face_check_out",
    auditActions.includes("attendance.face_check_in:attendance") &&
      auditActions.includes("attendance.face_check_out:attendance"),
    `actions=${[...new Set(auditActions)].join(",")}`);

  const auditPayload = dbAll(
    "SELECT before_json, after_json FROM audit_logs WHERE action LIKE 'attendance.face_%'"
  )
    .map((row) => `${row.before_json ?? ""}${row.after_json ?? ""}`)
    .join("");
  check("audit payload contains no embedding payload",
    !auditPayload.includes("embedding") && !auditPayload.includes('"embedding"'),
    `length=${auditPayload.length}`);

  const verificationReasons = dbAll(
    "SELECT reason, matched FROM face_verifications WHERE user_id = ?",
    state.emp1UserId
  ).map((row) => `${row.matched}:${row.reason ?? "ok"}`);
  check("face_verifications records both successes and machine-code failures",
    verificationReasons.includes("1:ok") &&
      verificationReasons.includes("0:challenge_expired") &&
      verificationReasons.includes("0:face_mismatch") &&
      verificationReasons.includes("0:outside_geofence"),
    `reasons=${[...new Set(verificationReasons)].join(",")}`);

  // ------------------------------------------ delete template / office unset
  const deleted = await request("/api/attendance/face/enroll", {
    method: "DELETE",
    cookie: state.emp1Cookie,
  });
  const statusAfterDelete = await request("/api/attendance/face/status", {
    cookie: state.emp1Cookie,
  });
  const afterDeleteChallenge = await challengeId(state.emp1Cookie, "check-in");
  const afterDeletePunch = await punch(
    state.emp1Cookie,
    "check-in",
    afterDeleteChallenge,
    same1,
    officeLocation()
  );
  const templateRows = Number(
    dbGet("SELECT COUNT(*) AS c FROM face_templates WHERE employee_id = ?", state.emp1EmployeeId).c
  );
  check("DELETE /enroll removes the template; next check-in -> 409 face_not_enrolled",
    deleted.res.status === 200 &&
      deleted.json?.ok === true &&
      statusAfterDelete.json?.enrolled === false &&
      statusAfterDelete.json?.version === 0 &&
      afterDeletePunch.res.status === 409 &&
      afterDeletePunch.json?.error === "face_not_enrolled" &&
      templateRows === 0,
    `delete=${deleted.res.status} enrolled=${statusAfterDelete.json?.enrolled} punch=${afterDeletePunch.res.status}/${afterDeletePunch.json?.error} templates=${templateRows}`);

  const clearOffice = await request("/api/settings", {
    method: "PATCH",
    cookie: state.adminCookie,
    body: { officeLat: null, officeLng: null },
  });
  const unsetChallenge = await challengeId(state.emp2Cookie, "check-in");
  const unsetOffice = await punch(
    state.emp2Cookie,
    "check-in",
    unsetChallenge,
    base2,
    officeLocation()
  );
  await request("/api/settings", {
    method: "PATCH",
    cookie: state.adminCookie,
    body: { officeLat: OFFICE.latitude, officeLng: OFFICE.longitude },
  });
  check("office coordinates unset -> 409 office_location_not_set",
    clearOffice.res.status === 200 &&
      unsetOffice.res.status === 409 &&
      unsetOffice.json?.error === "office_location_not_set",
    `status=${unsetOffice.res.status} error=${unsetOffice.json?.error}`);

  // ------------------------------------------------------ embedding leakage
  const leaked = responseBodies.filter((entry) => containsEmbeddingPayload(entry.json));
  const textualLeak = responseBodies.filter(
    (entry) => typeof entry.json === "object" && entry.json !== null &&
      JSON.stringify(entry.json).includes('"embedding"')
  );
  check("templates are never returned: no response key or 1024-float array named embedding",
    leaked.length === 0 && textualLeak.length === 0,
    `responses=${responseBodies.length} leakedBodies=${leaked.length + textualLeak.length}`);

  console.log(failed ? "\nSMOKE: FAIL" : "\nSMOKE: ALL PASS");
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error("FAIL  smoke threw:", err);
  console.log("\nSMOKE: FAIL");
  process.exit(1);
});
