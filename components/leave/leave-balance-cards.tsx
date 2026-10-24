"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/page-header";
import { cn } from "@/lib/utils";
import { BalanceBar } from "./balance-bar";
import type { LeaveBalance } from "./types";

export function LeaveBalanceCards({
  balances,
  loading,
  error,
  onRetry,
  onApply,
}: {
  balances: LeaveBalance[];
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  onApply: () => void;
}) {
  if (error) {
    return (
      <EmptyState
        title="Couldn't load your balances"
        description={error}
        action={
          <Button size="sm" variant="outline" onClick={onRetry}>
            Try again
          </Button>
        }
      />
    );
  }

  if (loading && balances.length === 0) {
    return (
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 3 }).map((_, index) => (
          <div key={index} className="space-y-3 rounded-xl border border-border bg-card p-3">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-7 w-16" />
            <Skeleton className="h-1.5 w-full" />
            <Skeleton className="h-2.5 w-32" />
          </div>
        ))}
      </div>
    );
  }

  if (balances.length === 0) {
    return (
      <EmptyState
        title="No leave balances yet"
        description="Your HR team hasn't set up leave types for this year. Check back after they do."
        action={
          <Button size="sm" variant="outline" onClick={onRetry}>
            Refresh
          </Button>
        }
      />
    );
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {balances.map((balance) => {
        const unlimited = balance.remaining == null;
        const remaining = balance.remaining;
        return (
          <Card key={`${balance.employeeId}-${balance.leaveTypeId}`} size="sm">
            <CardContent className="space-y-2">
              <div className="flex items-start justify-between gap-2">
                <p className="truncate text-sm font-medium">{balance.typeName}</p>
                {balance.quota > 0 ? (
                  <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                    {balance.quota} / yr
                  </span>
                ) : (
                  <Badge variant="outline" className="shrink-0 border-sky-200 bg-sky-50 text-sky-700">
                    Unlimited
                  </Badge>
                )}
              </div>

              <div>
                <p
                  className={cn(
                    "text-2xl font-semibold tracking-tight tabular-nums",
                    !unlimited && remaining !== null && remaining <= 0 && "text-rose-600",
                  )}
                >
                  {unlimited ? "∞" : remaining}
                  <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                    {unlimited ? "no cap" : "days left"}
                  </span>
                </p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  {balance.used} used
                  {balance.pending ? ` · ${balance.pending} pending` : ""} this year
                </p>
              </div>

              <BalanceBar quota={balance.quota} used={balance.used} pending={balance.pending} />

              <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                <span className="inline-flex items-center gap-1.5">
                  <span className="size-1.5 rounded-full bg-primary" aria-hidden />
                  Used
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="size-1.5 rounded-full bg-amber-400" aria-hidden />
                  Pending
                </span>
              </div>
            </CardContent>
          </Card>
        );
      })}

      <Card size="sm" className="border border-dashed border-border bg-muted/20 ring-0">
        <CardContent className="flex h-full flex-col justify-between gap-2">
          <div>
            <p className="text-sm font-medium">Need time off?</p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              Pick your dates — weekends are skipped for you.
            </p>
          </div>
          <Button size="sm" variant="outline" onClick={onApply}>
            Apply for leave
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
