"use client";

import { useCallback, useRef, useState } from "react";
import Link from "next/link";
import { ClockIcon, ShieldAlertIcon, UsersIcon } from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/page-header";
import { Alert, AlertAction, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useApi } from "@/components/shared/use-api";
import { todayIso } from "@/lib/dates";

import { FaceRequestError, faceRequest } from "./api";
import { CheckInPanel } from "./check-in-panel";
import { EnrollmentPanel } from "./enrollment-panel";
import {
  describeCaptureFailure,
  describeFailure,
  type FailureCopy,
} from "./errors";
import { PrivacyNote } from "./privacy-note";
import { FaceResultCardView } from "./result-card";
import {
  FaceCaptureError,
  type AttendanceMonthPayload,
  type FaceAction,
  type FaceChallenge,
  type FaceEnrollmentResult,
  type FacePunchResult,
  type FaceRequestFailure,
  type FaceResultCard,
  type FaceStatus,
  type TodayAttendance,
} from "./types";
import { useFaceEngine } from "./use-face-engine";
import { useGeolocation } from "./use-geolocation";

function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function toDay(value: unknown): TodayAttendance | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const date = asString(row.date);
  if (!date) return null;
  return {
    date,
    status: asString(row.status) ?? "absent",
    checkInAt: asString(row.checkInAt),
    checkOutAt: asString(row.checkOutAt),
  };
}

function toFailure(error: unknown): FaceRequestFailure {
  if (error instanceof FaceRequestError) return error.toFailure();
  if (error instanceof FaceCaptureError) {
    const copy = describeCaptureFailure(error.reason);
    return {
      status: 0,
      code: `capture_${error.reason}`,
      message: copy.message,
      distance: null,
      radius: null,
      score: null,
    };
  }
  return {
    status: 0,
    code: "network",
    message: "Can't reach the server. Check your connection and try again.",
    distance: null,
    radius: null,
    score: null,
  };
}

export function FaceCheckInView({ role }: { role: "admin" | "hr" | "employee" }) {
  const today = todayIso();
  const month = today.slice(0, 7);

  const statusApi = useApi<FaceStatus>("/api/attendance/face/status", (json) => ({
    enrolled: json.enrolled === true,
    enrolledAt: asString(json.enrolledAt),
    version: asNumber(json.version),
    hasEmployeeProfile: json.hasEmployeeProfile !== false,
    officeConfigured: json.officeConfigured === true,
    officeLat: asNumber(json.officeLat),
    officeLng: asNumber(json.officeLng),
    radiusM: asNumber(json.radiusM),
    threshold: asNumber(json.threshold),
  }));

  const status = statusApi.data;
  const hasProfile = status?.hasEmployeeProfile === true;

  const monthApi = useApi<AttendanceMonthPayload>(
    hasProfile ? `/api/attendance/me?month=${month}` : null,
    (json) => ({
      days: Array.isArray(json.days)
        ? json.days.map(toDay).filter((day): day is TodayAttendance => day != null)
        : [],
      summary:
        json.summary && typeof json.summary === "object"
          ? (json.summary as Record<string, number>)
          : {},
    }),
  );

  const [mode, setMode] = useState<"auto" | "enroll">("auto");
  const [result, setResult] = useState<FaceResultCard | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [enrolling, setEnrolling] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [enrollError, setEnrollError] = useState<FailureCopy | null>(null);
  const [enrollSuccess, setEnrollSuccess] = useState<FaceEnrollmentResult | null>(null);
  const submitLock = useRef(false);
  const enrollLock = useRef(false);

  const enrollingMode = Boolean(status && (!status.enrolled || mode === "enroll"));
  const success = result?.kind === "success";
  const cameraActive = hasProfile && !success;

  const engine = useFaceEngine(cameraActive);
  const geo = useGeolocation(hasProfile && !enrollingMode && !success);

  const todayRow = monthApi.data?.days.find((day) => day.date === today) ?? null;
  const action: FaceAction =
    todayRow?.checkInAt && !todayRow.checkOutAt ? "check-out" : "check-in";

  const handleRetry = useCallback(() => setResult(null), []);

  const handleEnrolShortcut = useCallback(() => {
    setResult(null);
    setEnrollError(null);
    setEnrollSuccess(null);
    setMode("enroll");
  }, []);

  const handleSubmit = useCallback(async () => {
    if (submitLock.current || !status) return;
    if (geo.latitude == null || geo.longitude == null || geo.accuracy == null) {
      setResult({
        kind: "error",
        action,
        error: {
          status: 0,
          code: "invalid_location",
          message: "Location is required before a face punch.",
          distance: null,
          radius: null,
          score: null,
        },
      });
      return;
    }

    submitLock.current = true;
    setSubmitting(true);
    setResult(null);
    try {
      const challenge = await faceRequest<FaceChallenge>(
        "/api/attendance/face/challenge",
        { method: "POST", body: { purpose: action } },
      );
      const embedding = await engine.captureEmbedding();
      const punch = await faceRequest<FacePunchResult>(
        `/api/attendance/face/${action}`,
        {
          method: "POST",
          body: {
            challengeId: challenge.challengeId,
            embedding,
            location: {
              latitude: geo.latitude,
              longitude: geo.longitude,
              accuracy: geo.accuracy,
            },
          },
        },
      );
      setResult({ kind: "success", action, result: punch });
      monthApi.reload();
      toast.success(
        action === "check-in"
          ? "Checked in with face verification"
          : "Checked out with face verification",
      );
    } catch (error) {
      setResult({ kind: "error", action, error: toFailure(error) });
    } finally {
      submitLock.current = false;
      setSubmitting(false);
    }
  }, [action, engine, geo.accuracy, geo.latitude, geo.longitude, monthApi, status]);

  const handleEnrol = useCallback(async () => {
    if (enrollLock.current) return;
    enrollLock.current = true;
    setEnrolling(true);
    setEnrollError(null);
    setEnrollSuccess(null);
    try {
      const challenge = await faceRequest<FaceChallenge>(
        "/api/attendance/face/challenge",
        { method: "POST", body: { purpose: "enroll" } },
      );
      const embedding = await engine.captureEmbedding();
      const enrolled = await faceRequest<FaceEnrollmentResult>(
        "/api/attendance/face/enroll",
        {
          method: "POST",
          body: { challengeId: challenge.challengeId, embedding },
        },
      );
      setEnrollSuccess(enrolled);
      setMode("enroll");
      statusApi.reload();
      toast.success("Face enrolled");
    } catch (error) {
      if (error instanceof FaceCaptureError) {
        setEnrollError(describeCaptureFailure(error.reason));
      } else if (error instanceof FaceRequestError) {
        setEnrollError(describeFailure(error.toFailure()));
      } else {
        setEnrollError({
          title: "Couldn't enrol",
          message: "Something went wrong. Try again in a moment.",
          tone: "error",
        });
      }
    } finally {
      enrollLock.current = false;
      setEnrolling(false);
    }
  }, [engine, statusApi]);

  const handleRemove = useCallback(async () => {
    const confirmed = window.confirm(
      "Remove your stored face template? Face check-in will be unavailable until you enrol again.",
    );
    if (!confirmed) return;
    setRemoving(true);
    setEnrollError(null);
    try {
      await faceRequest("/api/attendance/face/enroll", { method: "DELETE" });
      setEnrollSuccess(null);
      setMode("auto");
      statusApi.reload();
      toast.success("Face data removed");
    } catch (error) {
      if (error instanceof FaceRequestError) {
        setEnrollError(describeFailure(error.toFailure()));
      } else {
        setEnrollError({
          title: "Couldn't remove your face data",
          message: "Try again in a moment.",
          tone: "error",
        });
      }
    } finally {
      setRemoving(false);
    }
  }, [statusApi]);

  const header = (
    <PageHeader
      title="Face check-in"
      description="Check in or out with a live camera. Identity, location and attendance rules are verified on the server."
      actions={
        <Link
          href={role === "employee" ? "/my-attendance" : "/attendance"}
          className={buttonVariants({ variant: "ghost", size: "sm" })}
        >
          <ClockIcon aria-hidden />
          {role === "employee" ? "My attendance" : "Team attendance"}
        </Link>
      }
    />
  );

  if (!status && statusApi.loading) {
    return (
      <div className="mx-auto w-full max-w-xl space-y-5">
        {header}
        <Skeleton className="aspect-[4/3] w-full rounded-xl" />
        <Skeleton className="h-24 w-full rounded-xl" />
      </div>
    );
  }

  if (!status) {
    return (
      <div className="mx-auto w-full max-w-xl space-y-5">
        {header}
        <Alert variant="destructive" className="border-destructive/30 bg-destructive/5">
          <ShieldAlertIcon />
          <AlertTitle>Couldn&apos;t load face check-in</AlertTitle>
          <AlertDescription className="text-xs">
            {statusApi.error ?? "The face status endpoint isn't available yet."}
          </AlertDescription>
          <AlertAction>
            <Button variant="outline" size="xs" onClick={statusApi.reload}>
              Retry
            </Button>
          </AlertAction>
        </Alert>
        <PrivacyNote />
      </div>
    );
  }

  if (!status.hasEmployeeProfile) {
    return (
      <div className="mx-auto w-full max-w-xl space-y-5">
        {header}
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
            <span className="flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <UsersIcon className="size-5" aria-hidden />
            </span>
            <div className="space-y-1">
              <p className="text-sm font-semibold">Face attendance is for employees</p>
              <p className="mx-auto max-w-sm text-xs leading-relaxed text-muted-foreground">
                This account isn&apos;t linked to an employee profile, so there&apos;s
                no attendance record to verify. Ask HR to link your profile if you
                should be checking in.
              </p>
            </div>
            <Link
              href="/dashboard"
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              Back to dashboard
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-xl space-y-4">
      {header}

      {success && result?.kind === "success" ? (
        <FaceResultCardView
          result={result}
          onRetry={handleRetry}
          onEnrol={handleEnrolShortcut}
        />
      ) : (
        <>
          {result?.kind === "error" ? (
            <FaceResultCardView
              result={result}
              onRetry={handleRetry}
              onEnrol={handleEnrolShortcut}
            />
          ) : null}

          {!enrollingMode && monthApi.error ? (
            <Alert variant="destructive" className="border-destructive/30 bg-destructive/5">
              <AlertTitle>Couldn&apos;t load today&apos;s attendance</AlertTitle>
              <AlertDescription className="text-xs">
                {monthApi.error}
              </AlertDescription>
              <AlertAction>
                <Button variant="outline" size="xs" onClick={monthApi.reload}>
                  Retry
                </Button>
              </AlertAction>
            </Alert>
          ) : null}

          {enrollingMode ? (
            <EnrollmentPanel
              engine={engine}
              status={status}
              busy={enrolling}
              removing={removing}
              errorCopy={enrollError}
              success={enrollSuccess}
              onEnrol={handleEnrol}
              onCancel={
                status.enrolled
                  ? () => {
                      setMode("auto");
                      setEnrollError(null);
                      setEnrollSuccess(null);
                    }
                  : null
              }
              onRemove={handleRemove}
            />
          ) : (
            <CheckInPanel
              engine={engine}
              status={status}
              geo={geo}
              action={action}
              today={todayRow}
              todayLoading={monthApi.loading}
              todayError={monthApi.error}
              submitting={submitting}
              onSubmit={handleSubmit}
              onReEnrol={handleEnrolShortcut}
            />
          )}
        </>
      )}

      <PrivacyNote />
    </div>
  );
}
