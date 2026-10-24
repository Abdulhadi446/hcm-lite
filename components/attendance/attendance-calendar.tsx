"use client";

import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  parseISO,
  startOfWeek,
} from "date-fns";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatTime } from "@/components/shared/format";
import { cn } from "@/lib/utils";
import {
  ATTENDANCE_STATUS_LABELS,
  ATTENDANCE_STATUS_STYLES,
  type AttendanceDay,
  type AttendanceStatus,
} from "./types";

const WEEKDAYS = ["M", "T", "W", "T", "F", "S", "S"];

const LEGEND: AttendanceStatus[] = [
  "present",
  "late",
  "half_day",
  "on_leave",
  "absent",
  "weekend",
  "holiday",
];

export function AttendanceCalendar({
  month,
  days,
  today,
  loading,
  onMonthChange,
}: {
  month: string;
  days: AttendanceDay[];
  today: string;
  loading?: boolean;
  onMonthChange: (month: string) => void;
}) {
  const monthStart = parseISO(`${month}-01`);
  const gridStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const gridEnd = endOfWeek(endOfMonth(monthStart), { weekStartsOn: 1 });
  const dates = eachDayOfInterval({ start: gridStart, end: gridEnd });
  const byDate = new Map(days.map((day) => [day.date, day]));
  const currentMonth = today.slice(0, 7);

  function shift(amount: number) {
    onMonthChange(format(addMonths(monthStart, amount), "yyyy-MM"));
  }

  return (
    <Card>
      <CardHeader className="border-b border-border pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle>Month at a glance</CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              Your days, colour-coded by status.
            </p>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => shift(-1)}
              aria-label="Previous month"
            >
              <ChevronLeftIcon />
            </Button>
            <span className="min-w-[7.5rem] text-center text-sm font-medium tabular-nums">
              {format(monthStart, "MMMM yyyy")}
            </span>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => shift(1)}
              aria-label="Next month"
            >
              <ChevronRightIcon />
            </Button>
            {month !== currentMonth ? (
              <Button
                variant="outline"
                size="xs"
                className="ml-1"
                onClick={() => onMonthChange(currentMonth)}
              >
                This month
              </Button>
            ) : null}
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-3 p-3 sm:p-4">
        <div className="grid grid-cols-7 gap-1">
          {WEEKDAYS.map((label, index) => (
            <div
              key={`${label}-${index}`}
              className="pb-1 text-center text-[10px] font-medium uppercase tracking-wide text-muted-foreground"
            >
              {label}
            </div>
          ))}
        </div>

        {loading && days.length === 0 ? (
          <div className="grid grid-cols-7 gap-1">
            {Array.from({ length: 35 }).map((_, index) => (
              <Skeleton key={index} className="aspect-square rounded-md" />
            ))}
          </div>
        ) : (
          <div className={cn("grid grid-cols-7 gap-1", loading && "opacity-70")}>
            {dates.map((date) => {
              const iso = format(date, "yyyy-MM-dd");
              const day = byDate.get(iso);
              const outside = !isSameMonth(date, monthStart);
              const style = day ? ATTENDANCE_STATUS_STYLES[day.status] : null;
              const showTime =
                day && ["present", "late", "half_day", "missing_checkout"].includes(day.status)
                  ? formatTime(day.checkInAt)
                  : null;

              return (
                <div
                  key={iso}
                  title={
                    day
                      ? `${iso} · ${ATTENDANCE_STATUS_LABELS[day.status]}${
                          day.checkInAt ? ` · in ${formatTime(day.checkInAt)}` : ""
                        }${day.checkOutAt ? ` · out ${formatTime(day.checkOutAt)}` : ""}`
                      : iso
                  }
                  className={cn(
                    "relative flex aspect-square flex-col justify-between rounded-md border p-1 text-[10px] transition-colors sm:p-1.5 sm:text-[11px]",
                    style
                      ? style.cell
                      : "border-border/70 bg-card text-muted-foreground",
                    outside && "opacity-35",
                    iso === today && "ring-1 ring-primary/70 ring-offset-1 ring-offset-card",
                  )}
                >
                  <span className="font-medium tabular-nums">{format(date, "d")}</span>
                  <span className="flex items-center justify-between gap-1">
                    {showTime ? (
                      <span className="hidden truncate tabular-nums opacity-80 sm:block">
                        {showTime}
                      </span>
                    ) : null}
                    {style ? (
                      <span className={cn("ml-auto size-1.5 rounded-full", style.dot)} aria-hidden />
                    ) : null}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        {!loading && days.length === 0 ? (
          <p className="rounded-md border border-dashed border-border px-2.5 py-2 text-[11px] text-muted-foreground">
            No days recorded for this month yet — check in to start your history.
          </p>
        ) : null}

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-border pt-3">
          {LEGEND.map((status) => (
            <span
              key={status}
              className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground"
            >
              <span
                className={cn("size-1.5 rounded-full", ATTENDANCE_STATUS_STYLES[status].dot)}
                aria-hidden
              />
              {ATTENDANCE_STATUS_LABELS[status]}
            </span>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
