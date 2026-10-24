import type { Config, FaceResult } from "@vladmandic/human";

import type { FaceGate } from "./types";

/**
 * Camera models are served from our own origin. `join()` in human skips paths
 * that start with "/", so absolute `modelPath` values still resolve correctly
 * under `modelBasePath`.
 */
export const FACE_CONFIG: Partial<Config> = {
  modelBasePath: "/models",
  cacheModels: true,
  async: true,
  debug: false,
  validateModels: false,
  filter: {
    enabled: false,
    autoBrightness: false,
    equalization: false,
    return: false,
  },
  face: {
    enabled: true,
    detector: {
      modelPath: "/models/blazeface.json",
      maxDetected: 4,
      minConfidence: 0.2,
      skipFrames: 0,
      skipTime: 0,
      return: false,
    },
    mesh: {
      enabled: true,
      modelPath: "/models/facemesh.json",
      keepInvalid: false,
    },
    description: {
      enabled: true,
      modelPath: "/models/faceres.json",
      skipFrames: 0,
      skipTime: 0,
      minConfidence: 0.1,
    },
    antispoof: {
      enabled: true,
      modelPath: "/models/antispoof.json",
      skipFrames: 0,
      skipTime: 0,
    },
    iris: { enabled: false },
    emotion: { enabled: false },
    attention: { enabled: false },
    liveness: { enabled: false },
  },
  body: { enabled: false },
  hand: { enabled: false },
  object: { enabled: false },
  gesture: { enabled: false },
  segmentation: { enabled: false },
};

/**
 * The live loop only needs bounding boxes, mesh and anti-spoofing. Embeddings
 * are computed on demand from the frame at submit time, so we skip the
 * expensive 7 MB descriptor model while the preview is updating.
 */
export const LOOP_CONFIG: Partial<Config> = {
  face: {
    description: { enabled: false },
    emotion: { enabled: false },
    iris: { enabled: false },
  },
};

export const EMBED_CONFIG: Partial<Config> = {
  face: {
    description: { enabled: true, skipFrames: 0, skipTime: 0 },
    detector: { skipFrames: 0, skipTime: 0 },
    mesh: { enabled: true, skipFrames: 0, skipTime: 0 },
    antispoof: { enabled: true, skipFrames: 0, skipTime: 0 },
  },
};

/** Mean perceived luminance (0–255) from RGBA pixels. */
export function meanLuminanceFromRgba(data: Uint8ClampedArray): number {
  if (data.length < 4) return 0;
  let total = 0;
  let pixels = 0;
  for (let i = 0; i < data.length; i += 4) {
    total += 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
    pixels += 1;
  }
  return pixels === 0 ? 0 : total / pixels;
}

/** Guard the server's expected norm range without changing cosine similarity. */
export function normalizeEmbedding(values: number[]): number[] {
  let sum = 0;
  for (const value of values) sum += value * value;
  const norm = Math.sqrt(sum);
  if (!Number.isFinite(norm) || norm <= 0) return values;
  return values.map((value) => value / norm);
}

function boxCentre(face: FaceResult, width: number, height: number) {
  return {
    x: (face.box[0] + face.box[2] / 2) / width,
    y: (face.box[1] + face.box[3] / 2) / height,
  };
}

/**
 * UI-only capture gate. Detection is a convenience check, never proof of
 * identity — the server still performs the match.
 */
export function analyzeFrame(
  faces: FaceResult[],
  width: number,
  height: number,
  luminance: number,
): FaceGate {
  const face = faces[0];
  const base = {
    faces: faces.length,
    faceScore: face?.faceScore ?? null,
    boxHeightRatio: face && height > 0 ? face.box[3] / height : null,
    luminance,
    antispoof: face && typeof face.real === "number" ? face.real : null,
  };

  if (!face || width <= 0 || height <= 0) {
    return { ...base, reason: "no-face", ready: false };
  }
  if (faces.length > 1) {
    return { ...base, reason: "multiple-faces", ready: false };
  }
  if (luminance < 40) {
    return { ...base, reason: "too-dark", ready: false };
  }
  if (luminance > 235) {
    return { ...base, reason: "too-bright", ready: false };
  }
  if ((base.boxHeightRatio ?? 0) < 0.18) {
    return { ...base, reason: "move-closer", ready: false };
  }
  if ((face.faceScore ?? 0) < 0.6) {
    return { ...base, reason: "low-quality", ready: false };
  }
  if (base.antispoof != null && base.antispoof < 0.3) {
    return { ...base, reason: "spoof-suspect", ready: false };
  }

  const centre = boxCentre(face, width, height);
  if (centre.x < 0.25 || centre.x > 0.75 || centre.y < 0.15 || centre.y > 0.85) {
    return { ...base, reason: "off-centre", ready: false };
  }

  return { ...base, reason: "ready", ready: true };
}
