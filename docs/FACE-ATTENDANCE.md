# Camera face check-in

A mobile-style camera flow for attendance: the browser detects a face for the **UI gate**,
computes a face embedding, and the **server** decides whether that embedding matches the
employee's enrolled template, whether the device is inside the office geofence, and whether the
punch is allowed. Nothing about the decision is trusted from the client.

## Trust model (what is and is not a security boundary)

| Step | Where it happens | Trusted for attendance? |
|---|---|---|
| Face present / exactly one face / lighting / antispoof score | Browser (`@vladmandic/human`) | **No** — it only enables the button and gives the user feedback |
| Face embedding (1024-d FaceRes vector) | Browser, from the live video frames | **Treated as untrusted input** — validated (dimensions, finiteness, L2 norm) and compared server-side |
| Identity | Session cookie | Yes — the employee is taken from the session, never from the request body |
| Template match | Server, cosine similarity ≥ `FACE_MATCH_THRESHOLD` | **Yes** — this is the verification step |
| Geofence | Server, Haversine against `settings.office_lat/lng/radius_m` | Yes |
| Attendance row, status, timestamps | Server (`lib/services/attendance.ts`) | Yes |

Detection ≠ verification. The UI says "Face detected" and "Identity verified" as two separate
states, and only the second one unlocks the punch (and only after the server agrees).

### Known limitations — read before calling this "biometric security"

- **No certified liveness detection.** The brower-side antispoof score is a heuristic gate, not a
  defence. A printed photo, a phone screen showing a face, or a mask can pass.
- **Embeddings are computed in the browser.** A determined attacker who obtains a template could
  replay a vector — templates are never returned by any API and never logged, which is what keeps
  this out of reach in practice, but it is not a hardware-backed biometric.
- **Threshold is not calibrated** against a real population; `0.62` is a sensible default for
  FaceRes, not a measured equal-error rate.
- **Environment sensitivity**: strong backlight, low light, distance from the camera, and camera
  quality all affect both the UI gate and the embedding.
- Location accuracy worse than 100 m is rejected, but GPS can still be spoofed on a rooted device.
- No server-side face inference — the server never sees pixels.

For anything stricter (payroll-affecting identity, regulated biometrics), use a certified liveness
vendor. This feature is an attendance convenience with a server-checked identity gate.

## Flow

1. Employee signs in and opens **Face check-in** (`/face-check-in`).
2. `GET /api/attendance/face/status` → `{ enrolled, employeeCode, threshold, officeConfigured }`.
   - Not enrolled → enrolment panel: capture a sample (exactly one face, quality gate) → the
     browser computes the embedding → `POST /api/attendance/face/enroll`.
   - Re-enrolment replaces the template and bumps `version`; `DELETE …/enroll` removes it.
- Check-in / check-out:
  1. `POST /api/attendance/face/challenge` → `{ challengeId, expiresAt }` (120 s, single use).
  2. Browser computes the embedding for the current frame and sends
     `{ challengeId, embedding, location: { latitude, longitude, accuracy } }`.
  3. Server: session → challenge → template → embedding validation → cosine match → location →
     accuracy → geofence → existing `checkIn`/`checkOut` → verification row → audit.
  4. Success returns the attendance row; failures return a specific error code and **no attendance
     row is written**.

Failure → the UI links to `/my-attendance` so the employee can file a correction request, which is
the existing HR-reviewed fallback.

## API

| Method | Path | Notes |
|---|---|---|
| GET | `/api/attendance/face/status` | enrolment state for the signed-in employee |
| POST | `/api/attendance/face/challenge` | 120 s TTL, single use, purpose-bound, 10 per 10 min per user |
| POST | `/api/attendance/face/enroll` | `{ challengeId, embedding }` → 201 |
| DELETE | `/api/attendance/face/enroll` | removes the template |
| POST | `/api/attendance/face/check-in` | `{ challengeId, embedding, location }` |
| POST | `/api/attendance/face/check-out` | same body |
| GET | `/api/attendance/face/verifications?limit=20` | own rows; HR/Admin may pass `?employeeId=` |

Error codes: `no_employee_profile`, `face_not_enrolled`, `invalid_embedding`, `face_mismatch`
(includes `score`), `invalid_location`, `poor_accuracy` (accuracy > 100 m),
`office_location_not_set`, `outside_geofence` (includes `distanceM`/`radiusM`), `already_checked_in`,
`not_checked_in`, `already_checked_out`, `day_locked`, `rate_limited`, `challenge_not_found`,
`challenge_expired`, `challenge_used`, `challenge_purpose_mismatch`.

## Data

```sql
face_templates(employee_id PK → employees ON DELETE CASCADE, embedding TEXT, model,
               dimensions, version, created_at, updated_at)
face_challenges(id PK, user_id, purpose CHECK IN ('enroll','check-in','check-out'),
                nonce, expires_at, used_at, created_at)
face_verifications(id PK, user_id, employee_id, action, matched, score, reason,
                   distance_m, accuracy_m, created_at)
attendance.verification_method TEXT   -- 'face' for camera punches, null otherwise
payslips.working_days INTEGER         -- added with the payroll proration fix
```

- Templates are stored as text vectors, never returned by an API, and never written to the audit
  log (audit records only `{version, dimensions, model}`).
- Verifications record the outcome (matched, score, reason, distance, accuracy) for auditability.
- Attendance rows keep the existing `UNIQUE (employee_id, date)`; a camera punch uses
  `source = 'camera'` and `verification_method = 'face'`, so dashboards, payroll and the audit trail
  treat it exactly like any other punch.
- Deleting the employee cascades the template away. There is no soft-delete of biometric data, so
  deletion is immediate and complete.

## Setup

```bash
npm ci                 # postinstall copies ~10 MB of models into public/models/
npm run dev
```

`public/models/` is generated (gitignored) from `@vladmandic/human` by
`scripts/copy-face-models.mjs`. A deploy must run `npm ci` (or `npm install`) or copy the models
manually — the app still boots without them, but the camera panel fails to load its detector.

| Env var | Default | Meaning |
|---|---|---|
| `FACE_MATCH_THRESHOLD` | `0.62` | cosine similarity required to accept a match |
| `AUTH_SECRET` | generated + persisted on first boot | signing key (do not rely on a default) |

Office location is configured in **Organization → Company → Office geofence** (latitude, longitude,
radius in metres, 20–5000). The "Use my current location" button fills the pin from the browser.

## Manual test procedure (judges)

1. Sign in as Admin → **Organization → Company** → set office latitude/longitude to your current
   position (use the button) and radius 500 m. Confirm the geofence card shows the radius.
2. Sign in as an employee (e.g. `ayesha.khan@hcm.demo` / `Demo@12345`) → **Face check-in**.
3. Allow the camera. Expect: live preview, corner brackets, "Face detected" when one face is in
   frame, and the enrol button (first visit).
4. Enrol → the panel switches to check-in, showing "Identity verified" only after the server
   accepts the embedding.
5. Check in → success card with the server time. Re-open `/attendance` as HR: the row shows
   source camera and status `late`/`present` per the office start + grace rule.
6. Negative checks:
   - Cover the camera → "No face detected", button disabled.
   - Two people in frame → "Multiple faces" message, disabled.
   - Move outside the geofence (or set the radius to 20 m and step away) → server returns
     `outside_geofence` with the measured distance; no attendance row.
   - Deny the camera permission → a clear recovery message, no crash.
   - Try a second check-in → `409 already_checked_in`.

## Tests

| Suite | Result |
|---|---|
| `node scripts/api-smoke-face.mjs` (fresh DB, 45 checks) | ALL PASS — enrolment/re-enrolment, single-use/expired/purpose-mismatched challenges, malformed embeddings, mismatch (403, no row), accuracy 250 m, outside geofence, success `source=camera`/`verification_method=face`, duplicate punches, cross-employee impostor ignored, feed scoping, template deletion, rate limit, no embedding in any response |
| Security sweep (`scripts/acceptance-security.mjs`, 178 probes) | no `embedding` or 1024-float vector in any response body; audit rows carry metadata only; identity spoofing via body `employeeId` ignored |
| UI | camera-denied and no-face states verified with Playwright (no real camera in CI); screenshots in `.agent-logs/shots/face-*.png` |

Not tested automatically: real captures, real presentation attacks, and the genuine match rate on
live faces.
