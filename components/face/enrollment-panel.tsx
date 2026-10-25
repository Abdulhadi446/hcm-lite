"use client";

import {
  CheckCircle2Icon,
  CircleAlertIcon,
  Loader2Icon,
  ScanFaceIcon,
  Trash2Icon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDate } from "@/components/shared/format";
import { cn } from "@/lib/utils";

import { CameraPreview } from "./camera-preview";
import type { FailureCopy } from "./errors";
import type { FaceEnrollmentResult, FaceStatus } from "./types";
import type { FaceEngine } from "./use-face-engine";

export function EnrollmentPanel({
  engine,
  status,
  busy,
  removing,
  errorCopy,
  success,
  onEnrol,
  onCancel,
  onRemove,
}: {
  engine: FaceEngine;
  status: FaceStatus;
  busy: boolean;
  removing: boolean;
  errorCopy: FailureCopy | null;
  success: FaceEnrollmentResult | null;
  onEnrol: () => void;
  onCancel: (() => void) | null;
  onRemove: () => void;
}) {
  const canEnrol = engine.phase === "ready" && engine.gate.ready && !busy && !removing;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{status.enrolled ? "Re-enrol your face" : "Enrol your face"}</CardTitle>
        <CardDescription>
          Your browser turns the live frame into a numeric 1024-value face template;
          only that template is stored — never a photo or video. It lets the server
          confirm it&apos;s you when you check in.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {status.enrolled ? (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2">
            <div className="min-w-0">
              <p className="text-xs font-medium">
                Current template · v{status.version ?? 1}
              </p>
              <p className="text-[11px] text-muted-foreground">
                Enrolled {formatDate(status.enrolledAt)}
              </p>
            </div>
            <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700">
              <CheckCircle2Icon className="size-3" aria-hidden />
              Enrolled
            </span>
          </div>
        ) : null}

        {status.enrolled ? (
          <p className="text-[11px] text-amber-700">
            Enrolling again replaces your current template and bumps the version.
            Anything already recorded stays as it is.
          </p>
        ) : null}

        <CameraPreview engine={engine} />

        {errorCopy ? (
          <div
            role="alert"
            className={cn(
              "flex items-start gap-2 rounded-lg border px-3 py-2 text-xs",
              errorCopy.tone === "warning"
                ? "border-amber-200 bg-amber-50 text-amber-900"
                : "border-rose-200 bg-rose-50 text-rose-900",
            )}
          >
            <CircleAlertIcon className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            <div>
              <p className="font-medium">{errorCopy.title}</p>
              <p className="mt-0.5 text-[11px] opacity-80">{errorCopy.message}</p>
            </div>
          </div>
        ) : null}

        {success ? (
          <div
            role="status"
            className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900"
          >
            <CheckCircle2Icon className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            <div>
              <p className="font-medium">Face enrolled</p>
              <p className="mt-0.5 text-[11px] opacity-80">
                Template v{success.template.version} · {success.template.dimensions}{" "}
                values · {success.template.model}
              </p>
            </div>
          </div>
        ) : null}

        <Button
          type="button"
          size="lg"
          className="w-full"
          disabled={!canEnrol}
          onClick={onEnrol}
        >
          {busy ? (
            <Loader2Icon className="animate-spin" aria-hidden />
          ) : (
            <ScanFaceIcon aria-hidden />
          )}
          {busy
            ? "Enrolling…"
            : status.enrolled
              ? "Re-enrol my face"
              : "Enrol my face"}
        </Button>

        <p className="text-center text-[11px] text-muted-foreground">
          {canEnrol
            ? "Nothing is saved until you tap the button."
            : engine.phase === "ready"
              ? "Get one face, well lit and centred, to enable enrolment."
              : "Waiting for the camera and models."}
        </p>

        <div className="flex flex-wrap items-center justify-between gap-2">
          {onCancel ? (
            <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
              Back to check-in
            </Button>
          ) : (
            <span />
          )}
          {status.enrolled ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-destructive hover:bg-destructive/10"
              disabled={busy || removing}
              onClick={onRemove}
            >
              {removing ? (
                <Loader2Icon className="animate-spin" aria-hidden />
              ) : (
                <Trash2Icon aria-hidden />
              )}
              {removing ? "Removing…" : "Remove my face data"}
            </Button>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
