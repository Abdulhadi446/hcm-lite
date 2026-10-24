/** Types shared by the face check-in UI and camera engine. */

export type FaceAction = "check-in" | "check-out";

export type FacePurpose = "enroll" | FaceAction;

export type FaceStatus = {
  enrolled: boolean;
  enrolledAt: string | null;
  version: number | null;
  hasEmployeeProfile: boolean;
  officeConfigured: boolean;
  officeLat: number | null;
  officeLng: number | null;
  radiusM: number | null;
  /** Informational only — the server owns the match threshold. */
  threshold: number | null;
};

export type FaceChallenge = {
  challengeId: string;
  nonce: string;
  expiresAt: string;
};

export type FaceAttendance = {
  id: number;
  employeeId: number;
  date: string;
  checkInAt: string | null;
  checkOutAt: string | null;
  status: string;
  workedMinutes: number | null;
  source: string | null;
  verificationMethod: string | null;
};

export type FaceVerification = {
  matched: boolean;
  score: number | null;
  method: string;
};

export type FacePunchResult = {
  attendance: FaceAttendance;
  verification: FaceVerification;
};

export type FaceEnrollmentResult = {
  ok: boolean;
  template: {
    version: number;
    dimensions: number;
    model: string;
    enrolledAt: string;
  };
};

export type TodayAttendance = {
  date: string;
  status: string;
  checkInAt: string | null;
  checkOutAt: string | null;
};

export type AttendanceMonthPayload = {
  days: TodayAttendance[];
  summary: Record<string, number>;
};

/** Why a frame is (or is not) usable for an embedding. */
export type FaceGateReason =
  | "no-face"
  | "multiple-faces"
  | "move-closer"
  | "too-dark"
  | "too-bright"
  | "low-quality"
  | "spoof-suspect"
  | "off-centre"
  | "ready";

export type FaceGate = {
  reason: FaceGateReason;
  ready: boolean;
  faces: number;
  faceScore: number | null;
  boxHeightRatio: number | null;
  luminance: number | null;
  antispoof: number | null;
};

export const EMPTY_GATE: FaceGate = {
  reason: "no-face",
  ready: false,
  faces: 0,
  faceScore: null,
  boxHeightRatio: null,
  luminance: null,
  antispoof: null,
};

export type EnginePhase =
  | "idle"
  | "loading-models"
  | "requesting-camera"
  | "ready"
  | "paused"
  | "error";

export type EngineErrorCode =
  | "unsupported"
  | "model-load-failed"
  | "permission-denied"
  | "no-camera"
  | "camera-busy"
  | "camera-failed";

export type EngineError = {
  code: EngineErrorCode;
  title: string;
  message: string;
};

export type GeoStatus =
  | "unsupported"
  | "prompt"
  | "locating"
  | "granted"
  | "denied"
  | "error";

export type GeoState = {
  status: GeoStatus;
  latitude: number | null;
  longitude: number | null;
  accuracy: number | null;
  message: string | null;
};

export type FaceResultCard =
  | {
      kind: "success";
      action: FaceAction;
      result: FacePunchResult;
    }
  | {
      kind: "error";
      action: FaceAction;
      error: FaceRequestFailure;
    };

/** Loose failure shape so hooks/helpers can share one type without `any`. */
export type FaceRequestFailure = {
  status: number;
  code: string | null;
  message: string;
  distance: number | null;
  radius: number | null;
  score: number | null;
};

export class FaceCaptureError extends Error {
  reason: FaceGateReason | "busy" | "no-camera" | "not-ready";

  constructor(reason: FaceGateReason | "busy" | "no-camera" | "not-ready") {
    super(`capture_failed:${reason}`);
    this.name = "FaceCaptureError";
    this.reason = reason;
  }
}
