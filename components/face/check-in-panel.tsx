"use client";

import { formatTime } from "@/components/shared/format";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { Loader2Icon, LogInIcon, LogOutIcon, ScanFaceIcon } from "lucide-react";

import { CameraPreview } from "./camera-preview";
import { LocationRow } from "./location-row";
import type {
  FaceAction,
  FaceStatus,
  GeoState,
  TodayAttendance,
} from "./types";
import type { FaceEngine } from "./use-face-engine";

function dayBadge(today: TodayAttendance | null, loading: boolean) {
  if (loading) return { label: "Loading", className: "border-border bg-muted text-muted-foreground" };
  if (today?.checkInAt && today.checkOutAt) {
    return {
      label: "Day complete",
      className: "border-emerald-200 bg-emerald-50 text-emerald-700",
    };
  }
  if (today?.checkInAt) {
    return {
      label: "In progress",
      className: "border-amber-200 bg-amber-50 text-amber-700",
    };
  }
  return {
    label: "Not started",
    className: "border-border bg-muted text-muted-foreground",
  };
}

export function CheckInPanel({
  engine,
  status,
  geo,
  action,
  today,
  todayLoading,
  todayError,
  submitting,
  onSubmit,
  onReEnrol,
}: {
  engine: FaceEngine;
  status: FaceStatus;
  geo: GeoState & { refresh: () => void };
  action: FaceAction;
  today: TodayAttendance | null;
  todayLoading: boolean;
  todayError: string | null;
  submitting: boolean;
  onSubmit: () => void;
  onReEnrol: () => void;
}) {
  const dayComplete = Boolean(today?.checkInAt && today?.checkOutAt);
  const cameraReady = engine.phase === "ready" && engine.gate.ready;
  const officeReady =
    status.officeConfigured && status.officeLat != null && status.officeLng != null;
  const accuracy = geo.accuracy ?? null;
  const locationReady =
    officeReady &&
    geo.status === "granted" &&
    geo.latitude != null &&
    geo.longitude != null &&
    accuracy != null &&
    accuracy <= 100;
  const stateReady = !todayLoading && !todayError;

  const disabled = submitting || dayComplete || !cameraReady || !locationReady || !stateReady;

  const hint = submitting
    ? "Matching your face and checking the geofence on the server…"
    : dayComplete
      ? "You've already checked in and out today."
      : !officeReady
        ? "An admin needs to configure the office location first."
        : geo.status === "denied" || geo.status === "unsupported"
          ? "Location permission is required for face check-in."
          : accuracy != null && accuracy > 100
            ? "Location accuracy needs to be 100 m or better."
            : !stateReady
              ? "Waiting for today's attendance record."
              : !cameraReady
                ? "Wait for a clear, well-lit face in the preview."
                : null;

  const badge = dayBadge(today, todayLoading);

  const statusLine = todayLoading
    ? "Checking today's record…"
    : todayError
      ? "Couldn't read today's record."
      : today?.checkInAt && today.checkOutAt
        ? `In ${formatTime(today.checkInAt)} · out ${formatTime(today.checkOutAt)}`
        : today?.checkInAt
          ? `Checked in ${formatTime(today.checkInAt)} · not out yet`
          : "Not checked in yet.";

  return (
    <Card>
      <CardHeader className="gap-1">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle>Face check-in</CardTitle>
          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="ghost"
              size="xs"
              className="h-6 text-[11px] text-muted-foreground"
              disabled={submitting}
              onClick={onReEnrol}
            >
              <ScanFaceIcon aria-hidden />
              Re-enrol
            </Button>
            <span
              className={cn(
                "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium",
                badge.className,
              )}
            >
              {badge.label}
            </span>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <CameraPreview engine={engine} />

        <div className="rounded-lg border border-border px-3 py-2">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Today
            </p>
            {todayLoading ? null : (
              <p className="text-right text-[11px] tabular-nums text-muted-foreground">
                {statusLine}
              </p>
            )}
          </div>
          {todayLoading ? (
            <p className="mt-1 text-[11px] text-muted-foreground">{statusLine}</p>
          ) : null}
        </div>

        <LocationRow geo={geo} status={status} />

        <Button
          type="button"
          size="lg"
          className="w-full"
          disabled={disabled}
          onClick={onSubmit}
        >
          {submitting ? (
            <Loader2Icon className="animate-spin" aria-hidden />
          ) : action === "check-in" ? (
            <LogInIcon aria-hidden />
          ) : (
            <LogOutIcon aria-hidden />
          )}
          {submitting
            ? action === "check-in"
              ? "Checking in…"
              : "Checking out…"
            : dayComplete
              ? "Day complete"
              : action === "check-in"
                ? "Check in"
                : "Check out"}
        </Button>

        <p className="text-center text-[11px] leading-relaxed text-muted-foreground">
          {hint ??
            "The server matches your face, checks the geofence and applies attendance rules. The preview is only a guide."}
        </p>
      </CardContent>
    </Card>
  );
}
