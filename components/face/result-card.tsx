"use client";

import Link from "next/link";
import { format, isValid } from "date-fns";
import {
  CheckCircle2Icon,
  CircleAlertIcon,
  RotateCcwIcon,
  ScanFaceIcon,
} from "lucide-react";

import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

import { describeFailure, formatMeters } from "./errors";
import type { FaceResultCard } from "./types";

function serverStamp(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  return isValid(date) ? format(date, "d MMM yyyy, HH:mm:ss") : value;
}

export function FaceResultCardView({
  result,
  onRetry,
  onEnrol,
}: {
  result: FaceResultCard;
  onRetry: () => void;
  onEnrol: () => void;
}) {
  if (result.kind === "success") {
    const stamp =
      result.action === "check-in"
        ? result.result.attendance.checkInAt
        : result.result.attendance.checkOutAt;
    const label = result.action === "check-in" ? "Checked in" : "Checked out";
    const method =
      result.result.verification.method === "face"
        ? "face verified"
        : result.result.verification.method;

    return (
      <Card
        role="status"
        data-testid="face-result-success"
        className="border-emerald-200 bg-emerald-50/60"
      >
        <CardContent className="flex items-start gap-3 p-4">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
            <CheckCircle2Icon className="size-4" aria-hidden />
          </span>
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <p className="text-sm font-semibold text-emerald-950">
                {label} · {serverStamp(stamp)}
              </p>
              <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-100/70 px-1.5 py-0.5 text-[10px] font-medium text-emerald-800">
                <CheckCircle2Icon className="size-3" aria-hidden />
                Identity verified
              </span>
            </div>
            <p className="text-[11px] text-emerald-900/70">
              Server time · Source: {method}
              {typeof result.result.verification.score === "number"
                ? ` · match ${result.result.verification.score.toFixed(2)}`
                : ""}
            </p>
            <div className="flex flex-wrap gap-2 pt-2">
              <Link
                href="/my-attendance"
                className={buttonVariants({ variant: "outline", size: "sm" })}
              >
                View my attendance
              </Link>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  const copy = describeFailure(result.error);
  const warning = copy.tone === "warning";
  const geofence =
    result.error.code === "outside_geofence" &&
    result.error.distance != null &&
    result.error.radius != null;

  return (
    <Card
      role="alert"
      data-testid="face-result-error"
      className={cn(
        warning ? "border-amber-200 bg-amber-50/60" : "border-rose-200 bg-rose-50/60",
      )}
    >
      <CardContent className="flex items-start gap-3 p-4">
        <span
          className={cn(
            "flex size-8 shrink-0 items-center justify-center rounded-full",
            warning ? "bg-amber-100 text-amber-700" : "bg-rose-100 text-rose-700",
          )}
        >
          <CircleAlertIcon className="size-4" aria-hidden />
        </span>
        <div className="min-w-0 flex-1 space-y-1">
          <p className="text-sm font-semibold">{copy.title}</p>
          <p className="text-xs leading-relaxed text-muted-foreground">{copy.message}</p>
          {geofence ? (
            <p className="text-[11px] font-medium tabular-nums text-amber-800">
              Distance {formatMeters(result.error.distance)} · allowed radius{" "}
              {formatMeters(result.error.radius)}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2 pt-2">
            <Button type="button" size="sm" onClick={onRetry}>
              <RotateCcwIcon aria-hidden />
              Retry
            </Button>
            {copy.enrolHint ? (
              <Button type="button" size="sm" variant="outline" onClick={onEnrol}>
                <ScanFaceIcon aria-hidden />
                Enrol my face
              </Button>
            ) : null}
            <Link
              href="/my-attendance"
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              Request a correction
            </Link>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
