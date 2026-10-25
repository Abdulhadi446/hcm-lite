"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Human } from "@vladmandic/human";

import {
  EMBED_CONFIG,
  FACE_CONFIG,
  LOOP_CONFIG,
  analyzeFrame,
  meanLuminanceFromRgba,
  normalizeEmbedding,
} from "./engine";
import {
  EMPTY_GATE,
  FaceCaptureError,
  type EngineError,
  type EnginePhase,
  type FaceGate,
} from "./types";

const LOOP_DELAY_MS = 250;
const LUMINANCE_WIDTH = 64;
const LUMINANCE_HEIGHT = 48;

/**
 * The models are ~9 MB and the loaded instance is reused across remounts so
 * switching between enrolment and check-in never re-downloads them.
 */
let enginePromise: Promise<Human> | null = null;

async function loadEngine(): Promise<Human> {
  if (!enginePromise) {
    enginePromise = (async () => {
      const humanModule = await import(
        "../../node_modules/@vladmandic/human/dist/human.esm.js"
      );
      const HumanCtor = humanModule.default as unknown as typeof import("@vladmandic/human").default;
      const human = new HumanCtor(FACE_CONFIG);
      await human.load();
      // Warmup is an optimisation; a backend that refuses it shouldn't block use.
      try {
        await human.warmup();
      } catch {
        /* keep going with cold models */
      }
      return human;
    })().catch((error: unknown) => {
      enginePromise = null;
      throw error;
    });
  }
  return enginePromise;
}

function mapCameraError(err: unknown): EngineError {
  const name =
    err instanceof DOMException
      ? err.name
      : err instanceof Error
        ? err.name
        : "";

  if (name === "NotAllowedError" || name === "SecurityError") {
    return {
      code: "permission-denied",
      title: "Camera permission denied",
      message:
        "Allow camera access for this site in your browser settings, then tap Retry. Face check-in needs a live camera.",
    };
  }
  if (name === "NotFoundError" || name === "OverconstrainedError") {
    return {
      code: "no-camera",
      title: "No camera found",
      message:
        "No usable camera was found. Connect one, close any other app using it, then tap Retry.",
    };
  }
  if (name === "NotReadableError" || name === "AbortError") {
    return {
      code: "camera-busy",
      title: "Camera is busy",
      message:
        "Another app or tab is using the camera. Close it, then tap Retry.",
    };
  }
  return {
    code: "camera-failed",
    title: "Camera couldn't start",
    message: "The camera didn't start. Check your device, then tap Retry.",
  };
}

export type FaceEngine = {
  attachVideo: (node: HTMLVideoElement | null) => void;
  phase: EnginePhase;
  error: EngineError | null;
  gate: FaceGate;
  captureEmbedding: () => Promise<number[]>;
  retry: () => void;
};

export function useFaceEngine(active: boolean): FaceEngine {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const humanRef = useRef<Human | null>(null);
  const frameCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const luminanceCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const timerRef = useRef<number | null>(null);
  const generationRef = useRef(0);
  const detectingRef = useRef(false);
  const captureLockRef = useRef(false);
  const mountedRef = useRef(true);

  const [phase, setPhase] = useState<EnginePhase>("idle");
  const [error, setError] = useState<EngineError | null>(null);
  const [gate, setGate] = useState<FaceGate>(EMPTY_GATE);
  const [retryNonce, setRetryNonce] = useState(0);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const stopStream = useCallback(() => {
    const stream = streamRef.current;
    streamRef.current = null;
    if (stream) {
      for (const track of stream.getTracks()) track.stop();
    }
    const video = videoRef.current;
    if (video) {
      video.pause();
      video.srcObject = null;
    }
  }, []);

  const stopLoop = useCallback(() => {
    if (timerRef.current != null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const attachVideo = useCallback((node: HTMLVideoElement | null) => {
    videoRef.current = node;
    if (!node) return;
    node.muted = true;
    const stream = streamRef.current;
    if (stream && node.srcObject !== stream) {
      node.srcObject = stream;
      void node.play().catch(() => {
        /* the detection loop waits for readyState */
      });
    }
  }, []);

  const drawFrame = useCallback((): HTMLCanvasElement | null => {
    const video = videoRef.current;
    if (!video || video.readyState < 2 || !video.videoWidth || !video.videoHeight) {
      return null;
    }
    let canvas = frameCanvasRef.current;
    if (!canvas) {
      canvas = document.createElement("canvas");
      frameCanvasRef.current = canvas;
    }
    if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas;
  }, []);

  const measureLuminance = useCallback((video: HTMLVideoElement): number => {
    let canvas = luminanceCanvasRef.current;
    if (!canvas) {
      canvas = document.createElement("canvas");
      canvas.width = LUMINANCE_WIDTH;
      canvas.height = LUMINANCE_HEIGHT;
      luminanceCanvasRef.current = canvas;
    }
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return 0;
    ctx.drawImage(video, 0, 0, LUMINANCE_WIDTH, LUMINANCE_HEIGHT);
    return meanLuminanceFromRgba(
      ctx.getImageData(0, 0, LUMINANCE_WIDTH, LUMINANCE_HEIGHT).data,
    );
  }, []);

  const captureEmbedding = useCallback(async (): Promise<number[]> => {
    if (captureLockRef.current) throw new FaceCaptureError("busy");

    const human = humanRef.current;
    if (!human) throw new FaceCaptureError("not-ready");
    const video = videoRef.current;
    if (!video || video.readyState < 2) throw new FaceCaptureError("no-camera");

    captureLockRef.current = true;
    try {
      // Human runs one detection at a time; let the preview loop finish first.
      for (let attempt = 0; attempt < 40 && detectingRef.current; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 50));
      }

      const canvas = drawFrame();
      if (!canvas) throw new FaceCaptureError("no-camera");
      const luminance = measureLuminance(video);
      const result = await human.detect(canvas, EMBED_CONFIG);
      const nextGate = analyzeFrame(
        result.face,
        canvas.width,
        canvas.height,
        luminance,
      );
      setGate(nextGate);

      if (result.face.length !== 1) throw new FaceCaptureError(nextGate.reason);
      if (!nextGate.ready) throw new FaceCaptureError(nextGate.reason);
      const face = result.face[0];
      if (!face?.embedding || face.embedding.length !== 1024) {
        throw new FaceCaptureError("low-quality");
      }
      return normalizeEmbedding(face.embedding);
    } finally {
      captureLockRef.current = false;
    }
  }, [drawFrame, measureLuminance]);

  useEffect(() => {
    if (!active) {
      setPhase("idle");
      return;
    }

    let cancelled = false;
    generationRef.current += 1;
    const generation = generationRef.current;
    const isCurrent = () =>
      !cancelled && mountedRef.current && generationRef.current === generation;

    setError(null);
    setGate(EMPTY_GATE);
    setPhase("loading-models");

    const tick = async () => {
      if (!isCurrent() || captureLockRef.current || detectingRef.current) return;
      const video = videoRef.current;
      if (!video || video.readyState < 2 || !video.videoWidth) return;
      const human = humanRef.current;
      if (!human) return;

      const canvas = drawFrame();
      if (!canvas) return;
      const luminance = measureLuminance(video);
      detectingRef.current = true;
      try {
        const result = await human.detect(canvas, LOOP_CONFIG);
        if (!isCurrent()) return;
        setGate(analyzeFrame(result.face, canvas.width, canvas.height, luminance));
      } catch {
        // A dropped frame is harmless — the next tick tries again.
      } finally {
        detectingRef.current = false;
      }
    };

    const loop = () => {
      if (!isCurrent()) return;
      timerRef.current = window.setTimeout(async () => {
        if (!isCurrent()) return;
        await tick();
        if (isCurrent()) loop();
      }, LOOP_DELAY_MS);
    };

    const openCamera = async (): Promise<boolean> => {
      if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
        if (isCurrent()) {
          setError({
            code: "unsupported",
            title: "This browser can't use a camera",
            message:
              "Camera access needs a modern browser and an https:// address. Try Chrome, Edge or Safari.",
          });
          setPhase("error");
        }
        return false;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user", width: { ideal: 640 } },
          audio: false,
        });
        if (!isCurrent()) {
          for (const track of stream.getTracks()) track.stop();
          return false;
        }
        stopStream();
        streamRef.current = stream;
        const video = videoRef.current;
        if (video) {
          video.srcObject = stream;
          try {
            await video.play();
          } catch {
            /* attachVideo / the loop will retry */
          }
        }
        return true;
      } catch (err) {
        if (isCurrent()) {
          setError(mapCameraError(err));
          setPhase("error");
        }
        return false;
      }
    };

    // Ask for the camera immediately so a denial is reported without waiting
    // for the ~9 MB of models to download.
    let cameraSettled = false;
    let cameraOk = false;
    const cameraPromise = openCamera().then((ok) => {
      cameraSettled = true;
      cameraOk = ok;
      return ok;
    });

    void (async () => {
      let human: Human;
      try {
        human = await loadEngine();
      } catch {
        if (!isCurrent()) return;
        stopStream();
        setError({
          code: "model-load-failed",
          title: "Camera models couldn't load",
          message:
            "The face models (~9 MB) failed to download. Check your connection, then tap Retry. They're cached after the first load.",
        });
        setPhase("error");
        return;
      }
      if (!isCurrent()) return;
      humanRef.current = human;
      if (cameraSettled && !cameraOk) return;
      if (!cameraSettled) setPhase("requesting-camera");
      const opened = await cameraPromise;
      if (!isCurrent() || !opened) return;
      setPhase("ready");
      loop();
    })();

    const onVisibility = () => {
      if (!isCurrent()) return;
      if (document.hidden) {
        stopLoop();
        stopStream();
        setPhase("paused");
        return;
      }
      if (!humanRef.current) return;
      setGate(EMPTY_GATE);
      setPhase("requesting-camera");
      void openCamera().then((opened) => {
        if (!isCurrent() || !opened) return;
        setPhase("ready");
        loop();
      });
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelled = true;
      generationRef.current += 1;
      document.removeEventListener("visibilitychange", onVisibility);
      stopLoop();
      stopStream();
      detectingRef.current = false;
    };
  }, [active, retryNonce, drawFrame, measureLuminance, stopLoop, stopStream]);

  const retry = useCallback(() => {
    setError(null);
    setRetryNonce((value) => value + 1);
  }, []);

  return { attachVideo, phase, error, gate, captureEmbedding, retry };
}
