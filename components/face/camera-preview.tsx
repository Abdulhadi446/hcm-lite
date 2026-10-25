"use client";

import {
  CameraOffIcon,
  CheckCircle2Icon,
  Loader2Icon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { frameCopy, type StatusTone } from "./status";
import type { FaceEngine } from "./use-face-engine";

const TONE_DOT: Record<StatusTone, string> = {
  neutral: "bg-white/50",
  good: "bg-emerald-400",
  warn: "bg-amber-400",
  bad: "bg-rose-400",
};

function Corner({
  className,
  ready,
}: {
  className: string;
  ready: boolean;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "pointer-events-none absolute size-7 transition-colors",
        ready ? "border-emerald-400" : "border-white/55",
        className,
      )}
    />
  );
}

export function CameraPreview({
  engine,
  className,
  showHint = true,
}: {
  engine: FaceEngine;
  className?: string;
  showHint?: boolean;
}) {
  const { attachVideo, phase, error, gate, retry } = engine;
  const copy = frameCopy(gate.reason);
  const ready = phase === "ready" && gate.ready;
  const busy = phase === "loading-models" || phase === "requesting-camera";

  const chip =
    phase === "loading-models"
      ? { label: "Loading camera models…", tone: "neutral" as StatusTone }
      : phase === "requesting-camera"
        ? { label: "Starting camera…", tone: "neutral" as StatusTone }
        : phase === "paused"
          ? { label: "Camera paused", tone: "warn" as StatusTone }
          : phase === "error"
            ? { label: "Camera unavailable", tone: "bad" as StatusTone }
            : phase === "idle"
              ? { label: "Camera off", tone: "neutral" as StatusTone }
              : phase === "ready" && gate.luminance == null
                ? { label: "Camera ready", tone: "neutral" as StatusTone }
                : { label: copy.label, tone: copy.tone };

  return (
    <div className={cn("overflow-hidden rounded-xl bg-neutral-950", className)}>
      <div
        className={cn(
          "relative aspect-[4/3] w-full ring-1 ring-inset transition-shadow",
          ready
            ? "ring-2 ring-emerald-500/80 shadow-[0_0_0_4px] shadow-emerald-500/10"
            : "ring-white/10",
        )}
      >
        <video
          ref={attachVideo}
          className="h-full w-full -scale-x-100 object-cover"
          playsInline
          muted
          autoPlay
          aria-label="Live camera preview"
        />

        {/* Framing brackets */}
        <Corner ready={ready} className="top-3 left-3 rounded-tl border-t-2 border-l-2" />
        <Corner ready={ready} className="top-3 right-3 rounded-tr border-t-2 border-r-2" />
        <Corner ready={ready} className="bottom-3 left-3 rounded-bl border-b-2 border-l-2" />
        <Corner ready={ready} className="right-3 bottom-3 rounded-br border-r-2 border-b-2" />

        {/* Face guide */}
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div
            className={cn(
              "h-[62%] w-[46%] rounded-[50%] border border-dashed transition-colors",
              ready ? "border-emerald-300/70" : "border-white/25",
            )}
          />
        </div>

        {/* Status chip — explicit about which check passed */}
        <div
          data-testid="face-status"
          aria-live="polite"
          className="absolute top-3 left-1/2 flex max-w-[calc(100%-6rem)] -translate-x-1/2 items-center gap-1.5 rounded-full bg-black/60 px-2.5 py-1 text-[11px] font-medium text-white ring-1 ring-white/15 backdrop-blur"
        >
          {busy ? (
            <Loader2Icon className="size-3 animate-spin" aria-hidden />
          ) : chip.tone === "good" ? (
            <CheckCircle2Icon className="size-3 text-emerald-400" aria-hidden />
          ) : (
            <span
              className={cn("size-1.5 rounded-full", TONE_DOT[chip.tone])}
              aria-hidden
            />
          )}
          <span className="truncate">{chip.label}</span>
        </div>

        {busy ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-neutral-950/70 px-6 text-center backdrop-blur-[1px]">
            <Loader2Icon className="size-6 animate-spin text-white/80" aria-hidden />
            <p className="text-sm font-medium text-white">
              {phase === "loading-models" ? "Loading camera models…" : "Starting camera…"}
            </p>
            {phase === "loading-models" ? (
              <p className="max-w-[16rem] text-[11px] leading-relaxed text-white/60">
                About 9 MB on the first visit. They&apos;re cached after that.
              </p>
            ) : null}
          </div>
        ) : null}

        {phase === "error" && error ? (
          <div
            data-testid="face-camera-error"
            className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-neutral-950/80 px-5 text-center"
          >
            <CameraOffIcon className="size-6 text-white/70" aria-hidden />
            <p className="text-sm font-medium text-white">{error.title}</p>
            <p className="max-w-[19rem] text-[11px] leading-relaxed text-white/60">
              {error.message}
            </p>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              className="mt-1"
              onClick={() => retry()}
            >
              Retry
            </Button>
          </div>
        ) : null}

        {phase === "paused" ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-neutral-950/80 px-6 text-center">
            <CameraOffIcon className="size-6 text-white/70" aria-hidden />
            <p className="text-sm font-medium text-white">Camera paused</p>
            <p className="text-[11px] text-white/60">
            Switch back to this tab to resume.
          </p>
          </div>
        ) : null}
      </div>

      {showHint ? (
        <div className="flex items-center gap-1.5 border-t border-white/10 px-3 py-2 text-[11px] text-white/60">
          {ready ? (
            <CheckCircle2Icon className="size-3 shrink-0 text-emerald-400" aria-hidden />
          ) : null}
          <span>
            {phase === "loading-models"
              ? "Loading the face models once — this can take a few seconds."
              : phase === "requesting-camera"
                ? "Waiting for camera permission."
                : phase === "error"
                  ? "Camera is unavailable — use Retry above."
                  : phase === "paused"
                    ? "The camera stops while the tab is hidden."
                    : copy.hint}
          </span>
        </div>
      ) : null}
    </div>
  );
}
