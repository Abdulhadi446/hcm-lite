import type { FaceGateReason } from "./types";

export type StatusTone = "neutral" | "good" | "warn" | "bad";

export type FrameCopy = {
  label: string;
  hint: string;
  tone: StatusTone;
};

/**
 * Status wording is deliberately explicit about which check passed. "Face
 * detected" is a browser-side detection result; "Identity verified" only
 * appears after the server matches the embedding.
 */
const FRAME_COPY: Record<FaceGateReason, FrameCopy> = {
  "no-face": {
    label: "No face detected",
    hint: "Look straight at the camera and fill the oval with your face.",
    tone: "neutral",
  },
  "multiple-faces": {
    label: "Multiple faces",
    hint: "Only one person should be in frame. Ask anyone else to step aside.",
    tone: "warn",
  },
  "move-closer": {
    label: "Move closer",
    hint: "Your face should fill more of the oval.",
    tone: "warn",
  },
  "too-dark": {
    label: "Too dark",
    hint: "Move somewhere with more even light, facing away from bright windows.",
    tone: "warn",
  },
  "too-bright": {
    label: "Too bright",
    hint: "Move out of direct light or glare so your face isn't washed out.",
    tone: "warn",
  },
  "low-quality": {
    label: "Hold still",
    hint: "Keep your face steady and look at the camera.",
    tone: "warn",
  },
  "spoof-suspect": {
    label: "Liveness check failed",
    hint: "Use your real face, not a photo or a screen.",
    tone: "bad",
  },
  "off-centre": {
    label: "Center your face",
    hint: "Line your face up with the oval guide.",
    tone: "warn",
  },
  ready: {
    label: "Face detected",
    hint: "Detection is only a guide — the server verifies identity when you submit.",
    tone: "good",
  },
};

export function frameCopy(reason: FaceGateReason): FrameCopy {
  return FRAME_COPY[reason];
}
