"use client";

import { PlusIcon, RotateCwIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDate } from "@/components/shared/format";
import { useApi } from "@/components/shared/use-api";
import { cn } from "@/lib/utils";
import {
  CORRECTION_STATUS_LABELS,
  CORRECTION_STATUS_STYLES,
  type Correction,
} from "./types";

export function MyCorrectionsList({ onRequest }: { onRequest: () => void }) {
  const { data, loading, error, reload } = useApi<Correction[]>(
    "/api/attendance/corrections",
    (json) => (Array.isArray(json.items) ? (json.items as Correction[]) : []),
  );

  const items = data ?? [];

  return (
    <Card>
      <CardHeader className="border-b border-border pb-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <CardTitle>Your requests</CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">Sent to HR for review.</p>
          </div>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={reload}
            disabled={loading}
            aria-label="Refresh correction requests"
          >
            <RotateCwIcon className={loading ? "animate-spin" : undefined} />
          </Button>
        </div>
      </CardHeader>

      <CardContent className="p-0">
        {error ? (
          <div className="space-y-2 p-4 text-center">
            <p className="text-sm font-medium">Couldn&apos;t load your requests</p>
            <p className="text-xs text-muted-foreground">{error}</p>
            <Button size="sm" variant="outline" onClick={reload}>
              Try again
            </Button>
          </div>
        ) : loading && items.length === 0 ? (
          <div className="space-y-3 p-3">
            {Array.from({ length: 2 }).map((_, index) => (
              <div key={index} className="space-y-2">
                <div className="flex items-center justify-between">
                  <Skeleton className="h-3 w-24" />
                  <Skeleton className="h-5 w-16 rounded-4xl" />
                </div>
                <Skeleton className="h-2.5 w-32" />
                <Skeleton className="h-2.5 w-full" />
              </div>
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="space-y-2 p-5 text-center">
            <p className="text-sm font-medium">No correction requests</p>
            <p className="text-xs text-muted-foreground">
              Wrong time on your record? Ask HR to fix it.
            </p>
            <Button size="sm" variant="outline" className="mt-1" onClick={onRequest}>
              <PlusIcon />
              Request correction
            </Button>
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {items.map((correction) => (
              <li key={correction.id} className="space-y-1.5 p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{formatDate(correction.date)}</p>
                    <p className="text-[11px] tabular-nums text-muted-foreground">
                      {correction.requestedCheckIn ?? "—"} → {correction.requestedCheckOut ?? "—"}
                    </p>
                  </div>
                  <Badge
                    variant="outline"
                    className={cn(
                      "shrink-0 font-medium",
                      CORRECTION_STATUS_STYLES[correction.status] ??
                        "border-border bg-muted text-muted-foreground",
                    )}
                  >
                    {CORRECTION_STATUS_LABELS[correction.status] ?? correction.status}
                  </Badge>
                </div>
                <p className="line-clamp-2 text-xs text-muted-foreground">{correction.reason}</p>
                {correction.reviewComment ? (
                  <p className="rounded-md bg-muted/60 px-2 py-1.5 text-[11px] text-muted-foreground">
                    <span className="font-medium text-foreground">HR:</span>{" "}
                    {correction.reviewComment}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
