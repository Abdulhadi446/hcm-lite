"use client";

import { useMemo, useState } from "react";
import { PencilIcon } from "lucide-react";
import { toast } from "sonner";

import { Alert, AlertAction, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/page-header";
import { apiFetch, readableError } from "@/components/shared/api";
import { useApi } from "@/components/shared/use-api";
import { AttendanceCalendar } from "./attendance-calendar";
import { CheckInCard } from "./check-in-card";
import { CorrectionRequestDialog } from "./correction-dialog";
import { MyCorrectionsList } from "./my-corrections-list";
import type { AttendanceDay, AttendanceSummary } from "./types";

type MonthPayload = {
  days: AttendanceDay[];
  summary: Partial<AttendanceSummary> | null;
};

const STATUS_COUNT_KEYS: Partial<Record<string, keyof AttendanceSummary>> = {
  present: "present",
  late: "late",
  absent: "absent",
  on_leave: "onLeave",
  half_day: "halfDay",
  missing_checkout: "missingCheckout",
};

export function MyAttendanceView({ today }: { today: string }) {
  const currentMonth = today.slice(0, 7);

  const [month, setMonth] = useState(currentMonth);
  const [punching, setPunching] = useState(false);
  const [punchError, setPunchError] = useState<string | null>(null);
  const [correctionOpen, setCorrectionOpen] = useState(false);
  const [correctionKey, setCorrectionKey] = useState(0);

  const monthApi = useApi<MonthPayload>(`/api/attendance/me?month=${month}`, (json) => ({
    days: Array.isArray(json.days) ? (json.days as AttendanceDay[]) : [],
    summary: (json.summary as Partial<AttendanceSummary>) ?? null,
  }));

  // When the calendar is on another month we still need today's punch state.
  const todayApi = useApi<MonthPayload>(
    month === currentMonth ? null : `/api/attendance/me?month=${currentMonth}`,
    (json) => ({
      days: Array.isArray(json.days) ? (json.days as AttendanceDay[]) : [],
      summary: (json.summary as Partial<AttendanceSummary>) ?? null,
    }),
  );

  const calendarDays = useMemo(() => monthApi.data?.days ?? [], [monthApi.data]);
  const visibleDays = monthApi.loading ? [] : calendarDays;
  const todayPayload = month === currentMonth ? monthApi.data : todayApi.data;
  const todayDay = todayPayload?.days.find((day) => day.date === today) ?? null;

  const stats = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const day of monthApi.loading ? [] : calendarDays) {
      counts[day.status] = (counts[day.status] ?? 0) + 1;
    }
    const summary = monthApi.data?.summary;
    const value = (key: keyof AttendanceSummary, status: string) =>
      typeof summary?.[key] === "number"
        ? (summary[key] as number)
        : (STATUS_COUNT_KEYS[status] ? counts[status] ?? 0 : 0);

    return {
      present: value("present", "present"),
      late: value("late", "late"),
      absent: value("absent", "absent"),
      onLeave: typeof summary?.onLeave === "number" ? summary.onLeave : counts.on_leave ?? 0,
      hours: typeof summary?.hoursThisWeek === "number" ? summary.hoursThisWeek : 0,
    };
  }, [calendarDays, monthApi.loading, monthApi.data]);

  async function punch(action: "check-in" | "check-out") {
    setPunchError(null);
    setPunching(true);
    try {
      await apiFetch(`/api/attendance/${action}`, { method: "POST" });
      toast.success(action === "check-in" ? "Checked in" : "Checked out");
      monthApi.reload();
      if (month !== currentMonth) todayApi.reload();
      setCorrectionKey((key) => key + 1);
    } catch (err) {
      setPunchError(readableError(err));
    } finally {
      setPunching(false);
    }
  }

  const hoursValue = Math.round(stats.hours * 10) / 10;
  const hoursPercent = Math.max(0, Math.min(100, (stats.hours / 40) * 100));
  const loading = monthApi.loading;

  return (
    <div className="space-y-5">
      <PageHeader
        title="My attendance"
        description="Your check-ins, hours, and month at a glance."
        actions={
          <Button variant="outline" size="sm" onClick={() => setCorrectionOpen(true)}>
            <PencilIcon />
            Request correction
          </Button>
        }
      />

      {monthApi.error ? (
        <Alert variant="destructive" className="border-destructive/30 bg-destructive/5">
          <AlertTitle>Couldn&apos;t load your attendance</AlertTitle>
          <AlertDescription className="text-xs">{monthApi.error}</AlertDescription>
          <AlertAction>
            <Button variant="outline" size="xs" onClick={monthApi.reload}>
              Retry
            </Button>
          </AlertAction>
        </Alert>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-5">
        <div className="lg:col-span-2">
          <CheckInCard
            today={todayDay}
            todayIso={today}
            busy={punching}
            onPunch={punch}
            error={punchError}
          />
        </div>

        <div className="grid h-full grid-cols-2 grid-rows-2 overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10 lg:col-span-3">
          <StatCell
            label="Present"
            dot="bg-emerald-500"
            note="days this month"
            value={loading ? <Skeleton className="h-8 w-10" /> : stats.present}
            className="border-r border-b border-border"
          />
          <StatCell
            label="Late"
            dot="bg-amber-500"
            note="this month"
            value={loading ? <Skeleton className="h-8 w-8" /> : stats.late}
            className="border-b border-border"
          />
          <StatCell
            label="Absent"
            dot="bg-rose-500"
            note="days this month"
            value={loading ? <Skeleton className="h-8 w-8" /> : stats.absent}
            className="border-r border-border"
          />
          <div className="flex flex-col justify-center gap-1.5 p-3 sm:p-4">
            <p className="text-xs text-muted-foreground">Hours this week</p>
            <div className="text-3xl font-semibold tracking-tight tabular-nums">
              {loading ? (
                <Skeleton className="h-8 w-16" />
              ) : (
                <>
                  {hoursValue}
                  <span className="ml-1.5 text-sm font-normal text-muted-foreground">/ 40 h</span>
                </>
              )}
            </div>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary transition-all"
                style={{ width: `${hoursPercent}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <AttendanceCalendar
            month={month}
            days={visibleDays}
            today={today}
            loading={monthApi.loading}
            onMonthChange={setMonth}
          />
        </div>
        <div className="lg:col-span-1">
          <MyCorrectionsList key={correctionKey} onRequest={() => setCorrectionOpen(true)} />
        </div>
      </div>

      <CorrectionRequestDialog
        key={correctionOpen ? "open" : "closed"}
        today={today}
        open={correctionOpen}
        onOpenChange={setCorrectionOpen}
        onCreated={() => {
          setCorrectionKey((key) => key + 1);
          monthApi.reload();
        }}
      />
    </div>
  );
}

function StatCell({
  label,
  dot,
  value,
  note,
  className,
}: {
  label: string;
  dot: string;
  value: React.ReactNode;
  note: string;
  className?: string;
}) {
  return (
    <div className={`flex flex-col justify-center gap-1.5 p-3 sm:p-4 ${className ?? ""}`}>
      <div className="flex items-center gap-1.5">
        <span className={`size-1.5 rounded-full ${dot}`} aria-hidden />
        <p className="text-xs text-muted-foreground">{label}</p>
      </div>
      <div className="text-3xl font-semibold tracking-tight tabular-nums">{value}</div>
      <p className="text-[11px] text-muted-foreground">{note}</p>
    </div>
  );
}
