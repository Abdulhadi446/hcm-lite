"use client";

import { useEffect, useState } from "react";
import { format, parseISO } from "date-fns";
import {
  CalendarClockIcon,
  CheckCircle2Icon,
  ClockIcon,
  LogInIcon,
  LogOutIcon,
  TriangleAlertIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { formatClock, formatDuration, formatTime } from "@/components/shared/format";
import { cn } from "@/lib/utils";
import { workedMinutes, type AttendanceDay } from "./types";

/** Office start (09:00) + grace (15). Display-only hint; the server decides. */
export const LATE_CUTOFF = "09:15";

export function CheckInCard({
  today,
  todayIso,
  busy,
  onPunch,
  error,
}: {
  today: AttendanceDay | null;
  todayIso: string;
  busy: boolean;
  onPunch: (action: "check-in" | "check-out") => void;
  error?: string | null;
}) {
  const [clock, setClock] = useState<string | null>(null);
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    const tick = () => {
      const current = new Date();
      setNow(current);
      setClock(formatClock(current));
    };
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, []);

  const checkInAt = today?.checkInAt ?? null;
  const checkOutAt = today?.checkOutAt ?? null;
  const done = Boolean(checkInAt && checkOutAt);
  const isWeekend = today?.status === "weekend" || today?.status === "holiday";
  const late = Boolean(checkInAt && formatTime(checkInAt) > LATE_CUTOFF);
  const projectedLate = !checkInAt && now ? format(now, "HH:mm") > LATE_CUTOFF : false;

  const liveMinutes =
    checkInAt && !checkOutAt && now
      ? Math.max(0, Math.round((now.getTime() - new Date(checkInAt).getTime()) / 60000))
      : null;

  const statusLine = done ? (
    <span className="inline-flex items-center gap-1.5 text-emerald-700">
      <CheckCircle2Icon className="size-3.5" />
      Day complete · {formatDuration(workedMinutes(checkInAt, checkOutAt))} worked
    </span>
  ) : checkInAt ? (
    <span className={cn("inline-flex items-center gap-1.5", late ? "text-amber-700" : "text-emerald-700")}>
      <ClockIcon className="size-3.5" />
      Checked in at {formatTime(checkInAt)} · {late ? "late" : "on time"}
      {liveMinutes != null ? ` · ${formatDuration(liveMinutes)} so far` : ""}
    </span>
  ) : isWeekend ? (
    <span className="inline-flex items-center gap-1.5 text-muted-foreground">
      <CalendarClockIcon className="size-3.5" />
      {today?.status === "holiday" ? "Holiday" : "Weekend"} — checking in is optional.
    </span>
  ) : projectedLate ? (
    <span className="inline-flex items-center gap-1.5 text-amber-700">
      <TriangleAlertIcon className="size-3.5" />
      It&apos;s past {LATE_CUTOFF} — checking in now counts as late.
    </span>
  ) : (
    <span className="inline-flex items-center gap-1.5 text-emerald-700">
      <ClockIcon className="size-3.5" />
      Within the on-time window (before {LATE_CUTOFF}).
    </span>
  );

  return (
    <Card className="relative overflow-hidden bg-gradient-to-br from-primary/10 via-card to-card">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-20 -right-16 size-52 rounded-full bg-primary/10 blur-2xl"
      />
      <CardContent className="relative space-y-4 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Today
            </p>
            <p className="truncate text-sm font-medium">
              {format(parseISO(todayIso), "EEEE, d MMMM yyyy")}
            </p>
          </div>
          <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
            <span className="size-1.5 animate-pulse rounded-full bg-emerald-500" aria-hidden />
            Live
          </span>
        </div>

        <div>
          <p className="text-4xl font-semibold tracking-tight tabular-nums sm:text-5xl">
            {clock ?? "--:--:--"}
          </p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Server time is stamped when you punch.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-lg border border-border/80 bg-background/70 p-2.5">
            <p className="text-[11px] text-muted-foreground">Check in</p>
            <p className="text-sm font-semibold tabular-nums">{formatTime(checkInAt)}</p>
          </div>
          <div className="rounded-lg border border-border/80 bg-background/70 p-2.5">
            <p className="text-[11px] text-muted-foreground">Check out</p>
            <p className="text-sm font-semibold tabular-nums">{formatTime(checkOutAt)}</p>
          </div>
        </div>

        <p className="text-xs leading-relaxed">{statusLine}</p>

        {error ? (
          <p
            role="alert"
            className="rounded-md border border-destructive/30 bg-destructive/5 px-2.5 py-2 text-xs text-destructive"
          >
            {error}
          </p>
        ) : null}

        {done ? (
          <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm font-medium text-emerald-800">
            <CheckCircle2Icon className="size-4" />
            You&apos;re done for today
          </div>
        ) : (
          <Button
            size="lg"
            className="h-11 w-full text-base"
            disabled={busy}
            onClick={() => onPunch(checkInAt ? "check-out" : "check-in")}
          >
            {checkInAt ? <LogOutIcon /> : <LogInIcon />}
            {busy ? "Saving…" : checkInAt ? "Check out" : "Check in"}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
