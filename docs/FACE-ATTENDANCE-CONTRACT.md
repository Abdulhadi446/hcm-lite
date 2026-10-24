# Face-verified attendance — implementation contract

Status: implementing. Builds on the existing Next.js 16 App Router + `node:sqlite` stack
(**there is no FastAPI service in this repo — the backend is Next route handlers; all endpoints below
are Next route handlers and must follow the repo's `await headers()` + `requireUser()` pattern**).

## Trust model (read this first)

The project has no Python service and no server-side CV runtime, so:

| Step | Where | Trusted? |
|---|---|---|
| Face **detection** (exactly one face, framing, quality) | browser (`@vladmandic/human`, models served from `/models`) | UI gating only — never trusted for attendance |
| Face **embedding** (FaceRes, 1024-dim) | browser model | untrusted input |
| Face **verification** (compare embedding to stored template) | **server** (`lib/services/face.ts`) | authoritative |
| Geofence (Haversine, accuracy, radius) | **server** | authoritative |
| Attendance creation + rules | **server**, via existing `lib/services/attendance.ts` | authoritative |

Consequences we accept and document: a client can submit any embedding it likes, but it cannot obtain
attendance credit without a descriptor within the match threshold of **its own** stored template.
Replay of one's own previous embedding inside a fresh challenge is equivalent to that person
re-presenting their face; challenges are single-use and short-lived to stop network replay of an
entire request. There is **no strong liveness proof** (see Limitations).

## Model / thresholds

- `face_templates.embedding` = JSON array of 1024 floats from human.js `faceres`.
- Similarity = **cosine similarity**; accepted when `similarity >= FACE_MATCH_THRESHOLD` (env, default `0.62`).
- Server rejects embeddings that are not arrays of exactly 1024 finite numbers with L2 norm in `[0.5, 100]`.
- `face_templates.model` records `"faceres"`; `dimensions` = 1024; `version` increments on re-enrollment.

## Schema (additive, idempotent — follow `ensureColumn`/`CREATE TABLE IF NOT EXISTS` pattern in `lib/db.ts`)

```sql
CREATE TABLE IF NOT EXISTS face_templates (
  employee_id INTEGER PRIMARY KEY REFERENCES employees(id) ON DELETE CASCADE,
  embedding   TEXT NOT NULL,          -- JSON, never returned by any API
  model       TEXT NOT NULL,
  dimensions  INTEGER NOT NULL,
  version     INTEGER NOT NULL DEFAULT 1,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS face_challenges (
  id         TEXT PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  purpose    TEXT NOT NULL CHECK (purpose IN ('enroll','check-in','check-out')),
  nonce      TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used_at    TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS face_verifications (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id       INTEGER NOT NULL,
  employee_id   INTEGER,
  action        TEXT NOT NULL,       -- enroll | check-in | check-out
  matched       INTEGER NOT NULL,    -- 0/1
  score         REAL,                -- cosine similarity, null when no template
  reason        TEXT,                -- null on success, else machine code
  distance_m    REAL,
  accuracy_m    REAL,
  created_at    TEXT NOT NULL
);
```

Also add `attendance.verification_method TEXT` (null for web/correction rows, `'face'` when the punch
came through face verification). Keep `attendance.source = 'camera'` for these rows.

**Never** log or return embeddings: no embedding in API responses, no embedding in `audit_logs`
before/after JSON, no embedding in `face_verifications`, no embedding in errors.

## Endpoints (all require an authenticated session; identity always from the session)

### `GET /api/attendance/face/status`
→ `{ enrolled, enrolledAt, version, hasEmployeeProfile, officeConfigured, officeLat, officeLng, radiusM, threshold }`
(`threshold` is informational only.) `enrolled` describes the **session user's own** employee profile.

### `POST /api/attendance/face/challenge`
Body `{ purpose: "enroll" | "check-in" | "check-out" }`
→ `{ challengeId, nonce, expiresAt }` — TTL **120 s**, single use. Creating a new challenge for the same
user invalidates older unused ones. Rate limit: **10 challenges / 10 min / user** → `429 rate_limited`.

### `POST /api/attendance/face/enroll`
Body `{ challengeId, embedding: number[1024] }`
→ `201 { ok: true, template: { version, dimensions, model, enrolledAt } }`
Errors: `401`, `403 no_employee_profile`, `422 invalid_embedding`, `409 challenge_used|challenge_expired|challenge_not_found`,
`422 challenge_purpose_mismatch`. Upsert; re-enrollment replaces the template and bumps `version`.
Writes `face_verifications(action='enroll', matched=1)` and an audit entry (no biometric payload).

### `DELETE /api/attendance/face/enroll`
Removes the session user's template → `{ ok: true }`. Subsequent check-in returns `409 face_not_enrolled`.

### `POST /api/attendance/face/check-in` and `POST /api/attendance/face/check-out`
Body `{ challengeId, embedding: number[1024], location: { latitude: number, longitude: number, accuracy: number } }`
Server order (all must pass, **nothing is written to attendance unless every step passes**):
1. session → user (401)
2. employee profile (403 `no_employee_profile`)
3. challenge valid + unused + purpose matches (409/422)
4. template exists (409 `face_not_enrolled`)
5. embedding shape valid (422 `invalid_embedding`)
6. cosine similarity ≥ threshold (403 `face_mismatch`, include `score` rounded to 3 dp)
7. location: all three fields finite, `latitude ∈ [-90,90]`, `longitude ∈ [-180,180]`, `accuracy ≥ 0` (422 `invalid_location`); `accuracy > 100` → 422 `poor_accuracy`; settings `office_lat`/`office_lng` null → 409 `office_location_not_set`; Haversine distance > `radius_m` → 422 `outside_geofence` with `{ distance, radius }`
8. attendance rules via existing service: `409 already_checked_in`, `409 not_checked_in`, `409 already_checked_out`, `422 day_locked`
9. success → `{ attendance, verification: { matched: true, score, method: "face" } }`

Every attempt (success or failure) writes a `face_verifications` row with reason and distance/accuracy.
Successful check-in/out also writes an `audit_logs` entry (`attendance.face_check_in`).

### `GET /api/attendance/face/verifications?limit=20`
Own rows only (`matched`, `action`, `score`, `reason`, `createdAt`) — never embeddings. HR/Admin may pass
`?employeeId=` to inspect; employees are always scoped to themselves.

## Frontend

Route **`/face-check-in`** (employee nav: “Face check-in”). One page, three states:
1. **Not enrolled** → enrollment panel (camera + capture + privacy notice + “Enrol my face”).
2. **Enrolled** → live camera check-in/check-out flow.
3. **Result** → server response rendered (success card with server timestamp & source “Face verified”, or
   a failure card mapping the error code to plain language + “Request a correction” link to `/my-attendance`).

Engine: `@vladmandic/human` (already installed; models copied into `public/models` by
`scripts/copy-face-models.mjs`). Load it lazily on the client only; show a “Loading camera models…” state.

Gating before capture (UI only): exactly one face, `faceScore ≥ 0.6`, box height ≥ 18 % of frame,
centred within the guide, mean luminance ≥ 40, antispoof score ≥ 0.3 when available. Status messages:
no face / multiple faces / move closer / too dark / too bright / camera blocked / loading.

Never upload video or images. Only the 1024-float embedding leaves the browser, once per action, inside
a server challenge. Stop all `MediaStreamTrack`s on unmount, on success, and when the page is hidden.

## Fallback

When verification fails the employee can still file an attendance correction at `/my-attendance`
(existing workflow, HR approves) — the face page links there. Face check-in never bypasses leave,
half-day, late or duplicate rules.

## Limitations (must appear in README + in-app privacy note)

- Detection ≠ verification; the UI must label which check passed.
- No certified liveness/anti-spoofing: photos, video replay and masks can defeat this. It is a
  convenience/possession factor on top of a password, not a biometric authenticator.
- Threshold is not calibrated against a labelled dataset in this repo; tune `FACE_MATCH_THRESHOLD`.
- Embeddings are computed in the browser, so a modified client is out of scope; the server still
  performs the match, geofence and attendance enforcement.
