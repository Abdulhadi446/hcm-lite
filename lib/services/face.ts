import "server-only";
import { randomBytes, randomUUID } from "node:crypto";
import type { SessionUser } from "@/lib/auth";
import { nowIso, queryAll, queryOne, run } from "@/lib/db";
import { ApiError } from "@/lib/guards";
import { checkIn, checkOut } from "./attendance";
import { logAudit } from "./audit";
import { ApiFieldError } from "./http";
import { getSettings } from "./org";

// ---------------------------------------------------------------- constants

export const FACE_EMBEDDING_DIMENSIONS = 1024;
export const FACE_EMBEDDING_MODEL = "faceres";
export const FACE_MIN_NORM = 0.5;
export const FACE_MAX_NORM = 100;
export const FACE_CHALLENGE_TTL_MS = 120_000;
export const FACE_CHALLENGE_RATE_LIMIT = 10;
export const FACE_CHALLENGE_RATE_WINDOW_MS = 10 * 60_000;
export const FACE_MAX_ACCURACY_M = 100;
export const FACE_DEFAULT_THRESHOLD = 0.62;

const EARTH_RADIUS_M = 6_371_000;

export type FacePurpose = "enroll" | "check-in" | "check-out";
export type FaceAction = "check-in" | "check-out";

export type FaceStatus = {
  enrolled: boolean;
  enrolledAt: string | null;
  version: number;
  hasEmployeeProfile: boolean;
  officeConfigured: boolean;
  officeLat: number | null;
  officeLng: number | null;
  radiusM: number;
  threshold: number;
};

export type FaceVerification = {
  id: number;
  action: string;
  matched: boolean;
  score: number | null;
  reason: string | null;
  createdAt: string;
};

type TemplateRow = {
  employee_id: number;
  embedding: string;
  model: string;
  dimensions: number;
  version: number;
  created_at: string;
  updated_at: string;
};

type ChallengeRow = {
  id: string;
  user_id: number;
  purpose: FacePurpose;
  nonce: string;
  expires_at: string;
  used_at: string | null;
  created_at: string;
};

// ---------------------------------------------------------------- utilities

/** Threshold is configuration, never trust an unparsable env value. */
export function faceMatchThreshold(): number {
  const raw = Number(process.env.FACE_MATCH_THRESHOLD);
  return Number.isFinite(raw) && raw >= 0 && raw <= 1 ? raw : FACE_DEFAULT_THRESHOLD;
}

/**
 * Cosine similarity in [-1, 1]. Returns 0 for empty/mismatched/zero vectors so
 * a broken template can never be treated as a match.
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length === 0 || a.length !== b.length) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i += 1) {
    const x = a[i];
    const y = b[i];
    dot += x * y;
    normA += x * x;
    normB += y * y;
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/** Great-circle distance between two WGS84 points, in metres. */
export function haversineMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** Shape/quality gate for untrusted browser embeddings. */
export function validateEmbedding(value: unknown): number[] {
  if (!Array.isArray(value) || value.length !== FACE_EMBEDDING_DIMENSIONS) {
    throw new ApiError(422, "invalid_embedding");
  }
  let sumSquares = 0;
  const embedding: number[] = [];
  for (const item of value) {
    if (typeof item !== "number" || !Number.isFinite(item)) {
      throw new ApiError(422, "invalid_embedding");
    }
    sumSquares += item * item;
    embedding.push(item);
  }
  const norm = Math.sqrt(sumSquares);
  if (!(norm >= FACE_MIN_NORM && norm <= FACE_MAX_NORM)) {
    throw new ApiError(422, "invalid_embedding");
  }
  return embedding;
}

function round(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function parseStoredEmbedding(raw: string): number[] | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length !== FACE_EMBEDDING_DIMENSIONS) return null;
    if (!parsed.every((item) => typeof item === "number" && Number.isFinite(item))) return null;
    return parsed as number[];
  } catch {
    return null;
  }
}

function templateFor(employeeId: number): TemplateRow | undefined {
  return queryOne<TemplateRow>(
    `SELECT employee_id, embedding, model, dimensions, version, created_at, updated_at
       FROM face_templates WHERE employee_id = ?`,
    employeeId
  );
}

function recordVerification(input: {
  userId: number;
  employeeId: number | null;
  action: string;
  matched: boolean;
  score?: number | null;
  reason?: string | null;
  distanceM?: number | null;
  accuracyM?: number | null;
}): void {
  try {
    run(
      `INSERT INTO face_verifications
         (user_id, employee_id, action, matched, score, reason, distance_m, accuracy_m, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      input.userId,
      input.employeeId,
      input.action,
      input.matched ? 1 : 0,
      input.score ?? null,
      input.reason ?? null,
      input.distanceM ?? null,
      input.accuracyM ?? null,
      nowIso()
    );
  } catch (err) {
    // Telemetry must never mask the real result of a verification attempt.
    console.error("[face] failed to write verification row:", err);
  }
}

// ------------------------------------------------------------------- status

export function getFaceStatus(user: SessionUser): FaceStatus {
  const settings = getSettings();
  const employeeId = user.employeeId;
  const template = employeeId === null ? undefined : templateFor(employeeId);
  return {
    enrolled: !!template,
    enrolledAt: template ? template.updated_at : null,
    version: template ? Number(template.version) : 0,
    hasEmployeeProfile: employeeId !== null,
    officeConfigured: settings.officeLat !== null && settings.officeLng !== null,
    officeLat: settings.officeLat,
    officeLng: settings.officeLng,
    radiusM: settings.radiusM,
    threshold: faceMatchThreshold(),
  };
}

// --------------------------------------------------------------- challenges

export function createChallenge(
  user: SessionUser,
  purpose: FacePurpose
): { challengeId: string; nonce: string; expiresAt: string } {
  const now = Date.now();
  const windowStart = new Date(now - FACE_CHALLENGE_RATE_WINDOW_MS).toISOString();
  const recent = Number(
    queryOne<{ c: number }>(
      "SELECT COUNT(*) AS c FROM face_challenges WHERE user_id = ? AND created_at >= ?",
      user.id,
      windowStart
    )?.c ?? 0
  );
  if (recent >= FACE_CHALLENGE_RATE_LIMIT) {
    throw new ApiError(429, "rate_limited");
  }

  // Invalidate older unused challenges instead of deleting them so they still
  // count toward the rate limit.
  run(
    "UPDATE face_challenges SET expires_at = ? WHERE user_id = ? AND used_at IS NULL",
    new Date(now - 1).toISOString(),
    user.id
  );

  const id = randomUUID();
  const nonce = randomBytes(16).toString("hex");
  const expiresAt = new Date(now + FACE_CHALLENGE_TTL_MS).toISOString();
  const createdAt = new Date(now).toISOString();
  run(
    `INSERT INTO face_challenges (id, user_id, purpose, nonce, expires_at, used_at, created_at)
     VALUES (?, ?, ?, ?, ?, NULL, ?)`,
    id,
    user.id,
    purpose,
    nonce,
    expiresAt,
    createdAt
  );
  return { challengeId: id, nonce, expiresAt };
}

/** Single-use challenge check; sets `used_at` only when it is actually spent. */
export function consumeChallenge(
  user: SessionUser,
  challengeId: string,
  purpose: FacePurpose
): { id: string; nonce: string } {
  const row = queryOne<ChallengeRow>(
    `SELECT id, user_id, purpose, nonce, expires_at, used_at, created_at
       FROM face_challenges WHERE id = ? AND user_id = ?`,
    challengeId,
    user.id
  );
  if (!row) throw new ApiError(409, "challenge_not_found");
  if (row.used_at) throw new ApiError(409, "challenge_used");
  if (Date.parse(row.expires_at) <= Date.now()) {
    throw new ApiError(409, "challenge_expired");
  }
  if (row.purpose !== purpose) {
    throw new ApiError(422, "challenge_purpose_mismatch");
  }

  const result = run(
    "UPDATE face_challenges SET used_at = ? WHERE id = ? AND used_at IS NULL",
    nowIso(),
    row.id
  );
  if (Number(result.changes) !== 1) throw new ApiError(409, "challenge_used");
  return { id: row.id, nonce: row.nonce };
}

// --------------------------------------------------------------- enrollment

export function enrollFace(
  user: SessionUser,
  input: { challengeId: string; embedding: unknown }
): {
  ok: true;
  template: { version: number; dimensions: number; model: string; enrolledAt: string };
} {
  let recorded = false;
  try {
    if (user.employeeId === null) throw new ApiError(403, "no_employee_profile");
    const embedding = validateEmbedding(input.embedding);
    consumeChallenge(user, input.challengeId, "enroll");

    const existing = templateFor(user.employeeId);
    const now = nowIso();
    const version = existing ? Number(existing.version) + 1 : 1;
    run(
      `INSERT INTO face_templates (employee_id, embedding, model, dimensions, version, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(employee_id) DO UPDATE SET
         embedding = excluded.embedding,
         model = excluded.model,
         dimensions = excluded.dimensions,
         version = excluded.version,
         updated_at = excluded.updated_at`,
      user.employeeId,
      JSON.stringify(embedding),
      FACE_EMBEDDING_MODEL,
      FACE_EMBEDDING_DIMENSIONS,
      version,
      existing ? existing.created_at : now,
      now
    );

    recordVerification({
      userId: user.id,
      employeeId: user.employeeId,
      action: "enroll",
      matched: true,
    });
    recorded = true;

    logAudit({
      actorId: user.id,
      action: existing ? "update" : "create",
      entity: "face_template",
      entityId: user.employeeId,
      before: existing ? { version: Number(existing.version) } : null,
      after: { version, dimensions: FACE_EMBEDDING_DIMENSIONS, model: FACE_EMBEDDING_MODEL },
    });

    return {
      ok: true,
      template: {
        version,
        dimensions: FACE_EMBEDDING_DIMENSIONS,
        model: FACE_EMBEDDING_MODEL,
        enrolledAt: now,
      },
    };
  } catch (err) {
    if (!recorded && err instanceof ApiError) {
      recordVerification({
        userId: user.id,
        employeeId: user.employeeId,
        action: "enroll",
        matched: false,
        reason: err.message,
      });
    }
    throw err;
  }
}

export function deleteFaceTemplate(user: SessionUser): { ok: true } {
  if (user.employeeId === null) throw new ApiError(403, "no_employee_profile");
  const existing = templateFor(user.employeeId);
  if (existing) {
    run("DELETE FROM face_templates WHERE employee_id = ?", user.employeeId);
    logAudit({
      actorId: user.id,
      action: "delete",
      entity: "face_template",
      entityId: user.employeeId,
      before: { version: Number(existing.version), model: existing.model },
    });
  }
  return { ok: true };
}

// ------------------------------------------------------- verification + punch

function parseLocation(value: unknown): {
  latitude: number;
  longitude: number;
  accuracy: number;
} {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new ApiError(422, "invalid_location");
  }
  const { latitude, longitude, accuracy } = value as Record<string, unknown>;
  if (
    typeof latitude !== "number" ||
    typeof longitude !== "number" ||
    typeof accuracy !== "number" ||
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    !Number.isFinite(accuracy) ||
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180 ||
    accuracy < 0
  ) {
    throw new ApiError(422, "invalid_location");
  }
  return { latitude, longitude, accuracy };
}

/**
 * Full face-verified punch pipeline. Nothing touches `attendance` until every
 * gate has passed; every attempt lands in `face_verifications`.
 */
export function verifyAndPunch(
  user: SessionUser,
  input: {
    action: FaceAction;
    challengeId: string;
    embedding: unknown;
    location: unknown;
  }
): {
  attendance: ReturnType<typeof checkIn>;
  verification: { matched: true; score: number; method: "face" };
} {
  let recorded = false;
  let score: number | null = null;
  let distance: number | null = null;
  let accuracy: number | null = null;

  try {
    if (user.employeeId === null) throw new ApiError(403, "no_employee_profile");
    const employeeId = user.employeeId;

    consumeChallenge(user, input.challengeId, input.action);

    const template = templateFor(employeeId);
    if (!template) throw new ApiError(409, "face_not_enrolled");

    const embedding = validateEmbedding(input.embedding);
    const stored = parseStoredEmbedding(template.embedding);
    if (!stored) throw new ApiError(409, "face_not_enrolled");

    const similarity = cosineSimilarity(embedding, stored);
    score = round(similarity, 3);
    if (!(similarity >= faceMatchThreshold())) {
      throw new ApiFieldError(403, "face_mismatch", { extra: { score } });
    }

    const location = parseLocation(input.location);
    accuracy = location.accuracy;
    if (location.accuracy > FACE_MAX_ACCURACY_M) {
      throw new ApiError(422, "poor_accuracy");
    }

    const settings = getSettings();
    if (settings.officeLat === null || settings.officeLng === null) {
      throw new ApiError(409, "office_location_not_set");
    }
    const metres = haversineMeters(
      location.latitude,
      location.longitude,
      settings.officeLat,
      settings.officeLng
    );
    distance = round(metres, 1);
    if (metres > settings.radiusM) {
      throw new ApiFieldError(422, "outside_geofence", {
        extra: { distance, radius: settings.radiusM },
      });
    }

    const attendance =
      input.action === "check-in"
        ? checkIn(user, { source: "camera", verificationMethod: "face", audit: false })
        : checkOut(user, { source: "camera", verificationMethod: "face", audit: false });

    recordVerification({
      userId: user.id,
      employeeId,
      action: input.action,
      matched: true,
      score,
      distanceM: distance,
      accuracyM: accuracy,
    });
    recorded = true;

    logAudit({
      actorId: user.id,
      action: input.action === "check-in" ? "attendance.face_check_in" : "attendance.face_check_out",
      entity: "attendance",
      entityId: attendance.id,
      after: attendance,
    });

    return {
      attendance,
      verification: { matched: true, score: score ?? 0, method: "face" },
    };
  } catch (err) {
    if (!recorded && err instanceof ApiError) {
      recordVerification({
        userId: user.id,
        employeeId: user.employeeId,
        action: input.action,
        matched: false,
        score,
        reason: err.message,
        distanceM: distance,
        accuracyM: accuracy,
      });
    }
    throw err;
  }
}

// -------------------------------------------------------------- verification feed

export function listFaceVerifications(
  user: SessionUser,
  params: { limit?: number; employeeId?: number } = {}
): { items: FaceVerification[] } {
  const limitRaw = params.limit ?? 20;
  const limit = Number.isFinite(limitRaw)
    ? Math.min(100, Math.max(1, Math.trunc(limitRaw)))
    : 20;

  const where: string[] = [];
  const args: Array<string | number> = [];

  if (user.role === "employee" || params.employeeId === undefined) {
    where.push("user_id = ?");
    args.push(user.id);
  } else {
    where.push("employee_id = ?");
    args.push(params.employeeId);
  }

  const rows = queryAll<{
    id: number;
    action: string;
    matched: number;
    score: number | null;
    reason: string | null;
    created_at: string;
  }>(
    `SELECT id, action, matched, score, reason, created_at
       FROM face_verifications
      ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
      ORDER BY created_at DESC, id DESC
      LIMIT ?`,
    ...args,
    limit
  );

  return {
    items: rows.map((row) => ({
      id: Number(row.id),
      action: row.action,
      matched: Number(row.matched) === 1,
      score: row.score === null ? null : Number(row.score),
      reason: row.reason,
      createdAt: row.created_at,
    })),
  };
}
