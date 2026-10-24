"use client";

import { useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { format, parseISO, startOfQuarter } from "date-fns";
import { CalendarRangeIcon, Loader2Icon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { todayLocal } from "@/components/shared/format";

type Department = { id: number; name: string };

type Preset = "month" | "last30" | "quarter";

function iso(date: Date) {
  return format(date, "yyyy-MM-dd");
}

function presetRange(preset: Preset): { from: string; to: string } {
  const today = parseISO(todayLocal());
  if (preset === "last30") {
    const start = new Date(today);
    start.setDate(start.getDate() - 29);
    return { from: iso(start), to: iso(today) };
  }
  if (preset === "quarter") {
    return { from: iso(startOfQuarter(today)), to: iso(today) };
  }
  const start = new Date(today.getFullYear(), today.getMonth(), 1);
  return { from: iso(start), to: iso(today) };
}

function detectPreset(from: string, to: string): Preset | null {
  for (const preset of ["month", "last30", "quarter"] as Preset[]) {
    const range = presetRange(preset);
    if (range.from === from && range.to === to) return preset;
  }
  return null;
}

/**
 * Small filter bar: three date presets + a department picker. Every change is
 * pushed into the URL so the server component recomputes the KPI set.
 */
export function DashboardFilters({
  from,
  to,
  departmentId,
  departments,
}: {
  from: string;
  to: string;
  departmentId: number | null;
  departments: Department[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();
  const active = detectPreset(from, to);

  function push(nextFrom: string, nextTo: string, nextDepartment: string) {
    const params = new URLSearchParams();
    params.set("from", nextFrom);
    params.set("to", nextTo);
    if (nextDepartment !== "all") params.set("departmentId", nextDepartment);
    startTransition(() => {
      router.push(`${pathname}?${params.toString()}`);
    });
  }

  function applyPreset(preset: Preset) {
    const range = presetRange(preset);
    push(range.from, range.to, departmentId === null ? "all" : String(departmentId));
  }

  return (
    <Card>
      <CardContent className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <CalendarRangeIcon className="size-3.5" />
            {format(parseISO(from), "d MMM")} – {format(parseISO(to), "d MMM yyyy")}
          </span>
          <div className="flex flex-wrap items-center gap-1 rounded-lg border border-border bg-background p-0.5">
            <Button
              size="sm"
              variant={active === "month" ? "secondary" : "ghost"}
              className="h-7 px-2 text-xs"
              onClick={() => applyPreset("month")}
            >
              This month
            </Button>
            <Button
              size="sm"
              variant={active === "last30" ? "secondary" : "ghost"}
              className="h-7 px-2 text-xs"
              onClick={() => applyPreset("last30")}
            >
              Last 30 days
            </Button>
            <Button
              size="sm"
              variant={active === "quarter" ? "secondary" : "ghost"}
              className="h-7 px-2 text-xs"
              onClick={() => applyPreset("quarter")}
            >
              This quarter
            </Button>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {pending ? (
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Loader2Icon className="size-3.5 animate-spin" />
              Updating
            </span>
          ) : null}
          <Select
            value={departmentId === null ? "all" : String(departmentId)}
            onValueChange={(value) =>
              push(from, to, typeof value === "string" ? value : "all")
            }
            items={[
              { label: "All departments", value: "all" },
              ...departments.map((department) => ({
                label: department.name,
                value: String(department.id),
              })),
            ]}
          >
            <SelectTrigger className="w-full sm:w-48" aria-label="Filter by department">
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
        </div>
      </CardContent>
    </Card>
  );
}
