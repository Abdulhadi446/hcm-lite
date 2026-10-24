"use client";

import { PlusIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDate, formatMonth, formatMoney } from "@/components/shared/format";
import { cn } from "@/lib/utils";
import { RunStatusBadge } from "./status-badge";
import type { PayrollRun } from "./types";

export function PayrollRuns({
  runs,
  loading,
  selectedId,
  canCreate,
  onSelect,
  onCreate,
}: {
  runs: PayrollRun[];
  loading: boolean;
  selectedId: number | null;
  canCreate: boolean;
  onSelect: (id: number) => void;
  onCreate: () => void;
}) {
  return (
    <Card className="overflow-hidden">
      <div className="border-b border-border p-3">
        <p className="text-sm font-medium">Runs</p>
        <p className="mt-0.5 text-xs text-muted-foreground">Newest month first.</p>
      </div>

      {loading && runs.length === 0 ? (
        <div className="divide-y divide-border">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="space-y-2 p-3">
              <div className="flex items-center justify-between">
                <Skeleton className="h-3.5 w-24" />
                <Skeleton className="h-5 w-16 rounded-4xl" />
              </div>
              <Skeleton className="h-2.5 w-36" />
            </div>
          ))}
        </div>
      ) : runs.length === 0 ? (
        <div className="space-y-2 p-4 text-center">
          <p className="text-sm font-medium">No payroll runs yet</p>
          <p className="text-xs text-muted-foreground">
            {canCreate
              ? "Pick a month above and create the first draft."
              : "HR creates the first draft. An admin locks it once it's ready."}
          </p>
          {canCreate ? (
            <Button size="sm" variant="outline" className="mt-1" onClick={onCreate}>
              <PlusIcon />
              Create draft
            </Button>
          ) : null}
        </div>
      ) : (
        <ul className="divide-y divide-border">
          {runs.map((run) => {
            const active = run.id === selectedId;
            return (
              <li key={run.id}>
                <button
                  type="button"
                  onClick={() => onSelect(run.id)}
                  aria-pressed={active}
                  className={cn(
                    "w-full space-y-1.5 px-3 py-2.5 text-left transition-colors",
                    active ? "bg-muted" : "hover:bg-muted/50",
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className={cn("text-sm", active ? "font-semibold" : "font-medium")}>
                      {formatMonth(run.month)}
                    </span>
                    <RunStatusBadge status={run.status} />
                  </div>
                  <p className="text-[11px] tabular-nums text-muted-foreground">
                    {run.employeeCount} employee{run.employeeCount === 1 ? "" : "s"} · Net{" "}
                    {formatMoney(run.totalNet)}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {run.finalizedAt
                      ? `Locked ${formatDate(run.finalizedAt)}`
                      : `${run.workingDays} working days · draft`}
                  </p>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
