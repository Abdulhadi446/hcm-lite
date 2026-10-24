"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { addDays, format, parseISO } from "date-fns";
import {
  CalendarDaysIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  Loader2Icon,
  RotateCwIcon,
  SearchIcon,
  XIcon,
} from "lucide-react";

import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmptyState, PageHeader } from "@/components/page-header";
import { StatTile } from "@/components/shared/bits";
import { formatDayLabel } from "@/components/shared/format";
import { useApi } from "@/components/shared/use-api";
import { AttendanceBoardTable } from "./attendance-table";
import { PendingCorrections } from "./pending-corrections";
import { summarizeBoard, type BoardRow } from "./types";

type Department = { id: number; name: string };

export function AttendanceBoard({
  role,
  today,
}: {
  role: "admin" | "hr";
  today: string;
}) {
  const [date, setDate] = useState(today);
  const [departmentId, setDepartmentId] = useState("all");
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");

  const [departments, setDepartments] = useState<Department[]>([]);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQ(q.trim()), 300);
    return () => clearTimeout(timer);
  }, [q]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/departments", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : { items: [] }))
      .then((body: { items?: Department[] }) => {
        if (!cancelled) setDepartments(body.items ?? []);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const params = new URLSearchParams({ date });
  if (departmentId !== "all") params.set("departmentId", departmentId);
  if (debouncedQ) params.set("q", debouncedQ);

  const { data, loading, error, reload } = useApi<BoardRow[]>(
    `/api/attendance?${params.toString()}`,
    (json) => (Array.isArray(json.items) ? (json.items as BoardRow[]) : []),
  );

  const items = loading ? [] : (data ?? []);
  const stats = data && !loading ? summarizeBoard(items) : null;
  const hasFilters = Boolean(debouncedQ) || departmentId !== "all";

  function shiftDate(days: number) {
    setDate(format(addDays(parseISO(date), days), "yyyy-MM-dd"));
  }

  function clearFilters() {
    setQ("");
    setDebouncedQ("");
    setDepartmentId("all");
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Attendance"
        description="Who's in today, who's late, and which corrections are waiting."
        actions={
          <span className="hidden items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1 text-xs text-muted-foreground sm:inline-flex">
            <CalendarDaysIcon className="size-3.5" />
            {formatDayLabel(date)}
          </span>
        }
      />

      <Card>
        <CardContent className="grid gap-2 p-3 sm:grid-cols-2 lg:grid-cols-[auto_minmax(0,1fr)_11rem]">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex h-8 items-center rounded-lg border border-input bg-background">
              <Button
                variant="ghost"
                size="icon-sm"
                className="rounded-r-none"
                onClick={() => shiftDate(-1)}
                aria-label="Previous day"
              >
                <ChevronLeftIcon />
              </Button>
              <div className="relative flex h-full items-center gap-1.5 px-1.5">
                <CalendarDaysIcon className="size-3.5 text-muted-foreground" />
                <span className="whitespace-nowrap text-sm font-medium tabular-nums">
                  {format(parseISO(date), "d MMM yyyy")}
                </span>
                <input
                  type="date"
                  value={date}
                  onChange={(event) => {
                    if (event.target.value) setDate(event.target.value);
                  }}
                  aria-label="Attendance date"
                  className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                />
              </div>
              <Button
                variant="ghost"
                size="icon-sm"
                className="rounded-l-none"
                onClick={() => shiftDate(1)}
                aria-label="Next day"
              >
                <ChevronRightIcon />
              </Button>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setDate(today)}
              disabled={date === today}
            >
              Today
            </Button>
          </div>

          <div className="relative">
            <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={q}
              onChange={(event) => setQ(event.target.value)}
              placeholder="Search name, code or email…"
              className="pl-8"
              aria-label="Search employees"
            />
            {q ? (
              <button
                type="button"
                onClick={() => setQ("")}
                className="absolute top-1/2 right-2 -translate-y-1/2 rounded-sm p-0.5 text-muted-foreground hover:text-foreground"
                aria-label="Clear search"
              >
                <XIcon className="size-3.5" />
              </button>
            ) : null}
          </div>

          <Select
            value={departmentId}
            onValueChange={(value) => setDepartmentId(value ?? "all")}
            items={[
              { label: "All departments", value: "all" },
              ...departments.map((department) => ({
                label: department.name,
                value: String(department.id),
              })),
            ]}
          >
            <SelectTrigger className="w-full" aria-label="Filter by department">
              <SelectValue placeholder="All departments" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All departments</SelectItem>
              {departments.map((department) => (
                <SelectItem key={department.id} value={String(department.id)}>
                  {department.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        <StatTile
          label="Present"
          dot="bg-emerald-500"
          value={
            loading && !stats ? <Skeleton className="h-7 w-8" /> : (stats?.present ?? 0)
          }
          note="on time"
        />
        <StatTile
          label="Late"
          dot="bg-amber-500"
          value={loading && !stats ? <Skeleton className="h-7 w-8" /> : (stats?.late ?? 0)}
          note="checked in late"
        />
        <StatTile
          label="On leave"
          dot="bg-violet-500"
          value={loading && !stats ? <Skeleton className="h-7 w-8" /> : (stats?.onLeave ?? 0)}
          note="approved leave"
        />
        <StatTile
          label="Absent"
          dot="bg-rose-500"
          value={loading && !stats ? <Skeleton className="h-7 w-8" /> : (stats?.absent ?? 0)}
          note="no record"
        />
        <StatTile
          label="Missing checkout"
          dot="bg-orange-500"
          value={
            loading && !stats ? (
              <Skeleton className="h-7 w-8" />
            ) : (
              (stats?.missingCheckout ?? 0)
            )
          }
          note="still open"
          className="col-span-2 sm:col-span-1"
        />
      </div>

      <Card className="overflow-hidden">
        <CardHeader className="border-b border-border pb-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <CardTitle>Daily board</CardTitle>
              <p className="mt-1 text-xs text-muted-foreground">
                {formatDayLabel(date)}
                {stats ? ` · ${items.length} ${items.length === 1 ? "person" : "people"}` : ""}
              </p>
            </div>
            <div className="flex items-center gap-1.5">
              {loading ? (
                <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Loader2Icon className="size-3.5 animate-spin" />
                  Updating
                </span>
              ) : null}
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={reload}
                disabled={loading}
                aria-label="Refresh board"
                title="Refresh"
              >
                <RotateCwIcon />
              </Button>
            </div>
          </div>
        </CardHeader>

        {error ? (
          <CardContent className="p-4">
            <EmptyState
              title="Couldn't load the board"
              description={error}
              action={
                <Button size="sm" onClick={reload}>
                  Try again
                </Button>
              }
            />
          </CardContent>
        ) : !loading && items.length === 0 ? (
          <CardContent className="p-4">
            {hasFilters ? (
              <EmptyState
                title="No one matches these filters"
                description="Try a different search term or department, or move to another day."
                action={
                  <Button size="sm" variant="outline" onClick={clearFilters}>
                    Clear filters
                  </Button>
                }
              />
            ) : (
              <EmptyState
                title="No one on the board yet"
                description="Add employees and they'll appear here with their daily status."
                action={
                  role === "hr" ? (
                    <Link href="/employees/new" className={buttonVariants({ size: "sm" })}>
                      Add employee
                    </Link>
                  ) : (
                    <Link href="/employees" className={buttonVariants({ size: "sm", variant: "outline" })}>
                      View employees
                    </Link>
                  )
                }
              />
            )}
          </CardContent>
        ) : (
          <AttendanceBoardTable items={items} loading={loading} />
        )}
      </Card>

      <PendingCorrections canReview={role === "hr"} onReviewed={reload} />
    </div>
  );
}
