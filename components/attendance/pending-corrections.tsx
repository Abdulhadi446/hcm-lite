"use client";

import { useState } from "react";
import { CheckCheckIcon, CheckIcon, RotateCwIcon, XIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/page-header";
import { PersonCell } from "@/components/shared/bits";
import { formatDate } from "@/components/shared/format";
import { useApi } from "@/components/shared/use-api";
import { CorrectionReviewDialog } from "./correction-review-dialog";
import type { Correction } from "./types";

export function PendingCorrections({
  canReview,
  onReviewed,
}: {
  canReview: boolean;
  onReviewed?: () => void;
}) {
  const { data, loading, error, reload } = useApi<Correction[]>(
    "/api/attendance/corrections?status=pending",
    (json) => (Array.isArray(json.items) ? (json.items as Correction[]) : []),
  );

  const [review, setReview] = useState<{
    correction: Correction;
    action: "approve" | "reject";
  } | null>(null);

  const items = data ?? [];

  return (
    <Card>
      <CardHeader className="border-b border-border pb-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2">
              Pending corrections
              {items.length > 0 ? (
                <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[11px] font-medium tabular-nums text-amber-800">
                  {items.length}
                </span>
              ) : null}
            </CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              {canReview
                ? "Employees asking for a fixed check-in or check-out."
                : "HR reviews these requests. You can see what's waiting."}
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={reload}
            disabled={loading}
            aria-label="Refresh corrections"
            title="Refresh"
          >
            <RotateCwIcon className={loading ? "animate-spin" : undefined} />
          </Button>
        </div>
      </CardHeader>

      <CardContent className="p-0">
        {error ? (
          <CardContent className="p-4">
            <EmptyState
              title="Couldn't load corrections"
              description={error}
              action={
                <Button size="sm" variant="outline" onClick={reload}>
                  Try again
                </Button>
              }
            />
          </CardContent>
        ) : loading && items.length === 0 ? (
          <div className="divide-y divide-border">
            {Array.from({ length: 2 }).map((_, index) => (
              <div key={index} className="space-y-2 p-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <Skeleton className="size-7 rounded-full" />
                    <div className="space-y-1.5">
                      <Skeleton className="h-3 w-32" />
                      <Skeleton className="h-2.5 w-20" />
                    </div>
                  </div>
                  <Skeleton className="h-6 w-24" />
                </div>
                <Skeleton className="h-2.5 w-3/4" />
              </div>
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="px-4 py-8">
            <div className="flex flex-col items-center gap-1.5 text-center">
              <span className="flex size-9 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
                <CheckCheckIcon className="size-4" />
              </span>
              <p className="text-sm font-medium">No corrections waiting</p>
              <p className="max-w-sm text-xs text-muted-foreground">
                All caught up. New requests from employees land here for review.
              </p>
            </div>
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {items.map((correction) => (
              <li key={correction.id} className="p-3">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 space-y-1.5">
                    <PersonCell
                      name={correction.employeeName ?? "Employee"}
                      code={correction.employeeCode}
                      meta={formatDate(correction.date)}
                    />
                    <p className="text-xs tabular-nums">
                      <span className="text-muted-foreground">Wants</span>{" "}
                      <span className="font-medium">{correction.requestedCheckIn ?? "—"}</span>{" "}
                      <span className="text-muted-foreground">→</span>{" "}
                      <span className="font-medium">{correction.requestedCheckOut ?? "—"}</span>
                    </p>
                    <p className="line-clamp-2 text-xs text-muted-foreground">
                      {correction.reason}
                    </p>
                  </div>
                  {canReview ? (
                    <div className="flex shrink-0 items-center gap-1.5 sm:pt-0.5">
                      <Button
                        size="xs"
                        variant="outline"
                        className="border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 hover:text-emerald-800"
                        onClick={() => setReview({ correction, action: "approve" })}
                      >
                        <CheckIcon />
                        Approve
                      </Button>
                      <Button
                        size="xs"
                        variant="ghost"
                        className="text-muted-foreground hover:text-destructive"
                        onClick={() => setReview({ correction, action: "reject" })}
                      >
                        <XIcon />
                        Reject
                      </Button>
                    </div>
                  ) : (
                    <p className="shrink-0 text-[11px] text-muted-foreground">HR review</p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>

      <CorrectionReviewDialog
        correction={review?.correction ?? null}
        action={review?.action ?? "approve"}
        onOpenChange={(open) => {
          if (!open) setReview(null);
        }}
        onDone={() => {
          reload();
          onReviewed?.();
        }}
      />
    </Card>
  );
}
