import type { FaceGateReason, FaceRequestFailure } from "./types";

export type FailureCopy = {
  title: string;
  message: string;
  /** Offers a shortcut back to enrolment. */
  enrolHint?: boolean;
  tone: "error" | "warning";
};

export function formatMeters(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return "—";
  if (value < 1000) return `${Math.round(value)} m`;
  return `${(value / 1000).toFixed(1)} km`;
}

/** Plain-language copy for every machine code the face endpoints can return. */
export function describeFailure(failure: FaceRequestFailure): FailureCopy {
  const { code, status } = failure;

  if (code?.startsWith("capture_")) {
    const reason = code.slice("capture_".length) as
      | FaceGateReason
      | "busy"
      | "no-camera"
      | "not-ready";
    return describeCaptureFailure(reason);
  }

  switch (code) {
    case "face_not_enrolled":
      return {
        title: "Face check-in isn't set up",
        message: "There's no face template on file yet, so there's nothing to match against. Enrol your face first.",
        enrolHint: true,
        tone: "warning",
      };
    case "face_mismatch":
      return {
        title: "That didn't match the face on file",
        message:
          failure.score != null
            ? `The match score was ${failure.score.toFixed(2)}, below the threshold. Face the camera straight on, in even lighting, and try again.`
            : "The face on file didn't match closely enough. The server does the matching, not the browser.",
        tone: "error",
      };
    case "invalid_embedding":
      return {
        title: "We couldn't read your face clearly",
        message: "The captured frame didn't produce a usable template. Improve the lighting and try again.",
        tone: "error",
      };
    case "invalid_location":
      return {
        title: "Your location couldn't be read",
        message: "Turn on location access for this site and try again. The server checks the location on every face punch.",
        tone: "error",
      };
    case "poor_accuracy":
      return {
        title: "Location accuracy is too low",
        message:
          "The server needs a location accurate to 100 m or better. Move near a window or outdoors, enable precise location, then try again.",
        tone: "error",
      };
    case "office_location_not_set":
      return {
        title: "Office location isn't configured",
        message: "An admin needs to set the office location and radius before face check-in can be used.",
        tone: "warning",
      };
    case "outside_geofence": {
      const distance = formatMeters(failure.distance);
      const radius = formatMeters(failure.radius);
      return {
        title: "You're outside the office radius",
        message:
          failure.distance != null && failure.radius != null
            ? `You're about ${distance} from the office; the allowed radius is ${radius}. Move closer to the office, then try again.`
            : "You're outside the office radius set by your admin. Move closer to the office, then try again.",
        tone: "warning",
      };
    }
    case "already_checked_in":
      return {
        title: "You've already checked in today",
        message: "There's already a check-in on record for today. Use check-out when you leave.",
        tone: "warning",
      };
    case "not_checked_in":
      return {
        title: "Check in first",
        message: "There's no check-in on record for today, so there's nothing to check out from.",
        tone: "warning",
      };
    case "already_checked_out":
      return {
        title: "You've already checked out today",
        message: "Your day is already complete. If the time is wrong, request a correction from My attendance.",
        tone: "warning",
      };
    case "day_locked":
      return {
        title: "That day is locked",
        message: "The payroll month covering today is locked, so attendance can't be changed. Ask HR about a correction.",
        tone: "warning",
      };
    case "rate_limited":
      return {
        title: "Too many attempts",
        message: "For safety, face challenges are limited to 10 every 10 minutes. Wait a few minutes and try again.",
        tone: "warning",
      };
    case "challenge_used":
      return {
        title: "This attempt was already used",
        message: "Each camera check gets a single-use challenge. Start again to get a fresh one.",
        tone: "error",
      };
    case "challenge_expired":
      return {
        title: "The check took too long",
        message: "Camera challenges expire after 2 minutes. Try again — it only takes a moment.",
        tone: "error",
      };
    case "challenge_not_found":
      return {
        title: "This attempt expired",
        message: "The server couldn't find that camera challenge. Start a new attempt.",
        tone: "error",
      };
    case "challenge_purpose_mismatch":
      return {
        title: "This attempt didn't match the action",
        message: "The challenge was issued for a different action. Start the check again.",
        tone: "error",
      };
    case "no_employee_profile":
      return {
        title: "No employee profile",
        message: "This account isn't linked to an employee record, so face attendance isn't available.",
        tone: "warning",
      };
    case "network":
      return {
        title: "Can't reach the server",
        message: "Check your connection and try again. Nothing was saved.",
        tone: "error",
      };
    default:
      break;
  }

  if (status === 401) {
    return {
      title: "Your session expired",
      message: "Sign in again, then retry the face check.",
      tone: "error",
    };
  }
  if (status === 429 || code?.startsWith("rate")) {
    return {
      title: "Too many attempts",
      message: "Wait a few minutes, then try again.",
      tone: "warning",
    };
  }
  if (code?.startsWith("challenge_")) {
    return {
      title: "This attempt expired",
      message: "Camera challenges are short-lived and single-use. Start again.",
      tone: "error",
    };
  }

  return {
    title: "Face check didn't go through",
    message: failure.message || "Something went wrong. Try again.",
    tone: "error",
  };
}

const CAPTURE_COPY: Record<FaceGateReason, FailureCopy> = {
  "no-face": {
    title: "No face in the capture",
    message: "The frame we captured had no face. Look straight at the camera and try again.",
    tone: "error",
  },
  "multiple-faces": {
    title: "More than one face in frame",
    message: "Only you should be visible to the camera. Ask anyone else to step out, then try again.",
    tone: "error",
  },
  "move-closer": {
    title: "Move a little closer",
    message: "Your face needs to fill more of the frame before we can capture it.",
    tone: "error",
  },
  "too-dark": {
    title: "It's too dark to read your face",
    message: "Move somewhere with more even light — avoid strong backlight.",
    tone: "error",
  },
  "too-bright": {
    title: "It's too bright to read your face",
    message: "Move out of direct light or glare, then try again.",
    tone: "error",
  },
  "low-quality": {
    title: "Hold still for a moment",
    message: "The face capture wasn't clear enough. Keep your face steady and try again.",
    tone: "error",
  },
  "spoof-suspect": {
    title: "The liveness check failed",
    message: "Use your real face, not a photo or screen. Liveness confidence was too low.",
    tone: "error",
  },
  "off-centre": {
    title: "Centre your face in the frame",
    message: "Line your face up with the guide, then try again.",
    tone: "error",
  },
  ready: {
    title: "The frame changed",
    message: "The face moved before the capture finished. Hold still and try again.",
    tone: "error",
  },
};

export function describeCaptureFailure(
  reason: FaceGateReason | "busy" | "no-camera" | "not-ready",
): FailureCopy {
  if (reason === "no-camera") {
    return {
      title: "Camera isn't running",
      message: "The camera stopped before we could capture a frame. Retry to restart it.",
      tone: "error",
    };
  }
  if (reason === "not-ready") {
    return {
      title: "Camera is still starting",
      message: "Wait for the preview to appear, then try again.",
      tone: "error",
    };
  }
  if (reason === "busy") {
    return {
      title: "A capture is already running",
      message: "Give it a second, then try again.",
      tone: "error",
    };
  }
  return CAPTURE_COPY[reason];
}
