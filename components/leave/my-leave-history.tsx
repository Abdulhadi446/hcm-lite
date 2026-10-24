"use client";

import { useState } from "react";
import { PlusIcon, RotateCwIcon } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState } from "@/components/page-header";
import { ConfirmDialog } from "@/components/shared/dialogs";
import { apiFetch, readableError } from "@/components/shared/api";
import { formatDateRange } from "@/components/shared/format";
import { useApi } from "@/components/shared/use-api";
import { LeaveStatusBadge } from "./status-badge";
import { canCancelRequest, type LeaveRequestRow } from "./types";

export function MyLeaveHistory({
  today,
  onApply,
  onChanged,
}: {
  today: string;
  onApply: () => void;
  onChanged: () => void;
}) {
  const { data, loading, error, reload } = useApi<LeaveRequestRow[]>(
    "/api/leave/requests",
    (json) => (Array.isArray(json.items) ? (json.items as LeaveRequestRow[]) : []),
  );

  const [selected, setSelected] = useState<LeaveRequestRow | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);

  const items = data ?? [];

  async function cancel() {
    if (!selected) return;
    setCancelling(true);
    setCancelError(null);
    try {
      await apiFetch(`/api/leave/requests/${selected.id}/cancel`, { method: "POST" });
      toast.success("Leave request cancelled");
      setSelected(null);
      reload();
      onChanged();
    } catch (err) {
      setCancelError(readableError(err));
    } finally {
      setCancelling(false);
    }
  }

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between gap-2 border-b border-border p-3">
        <div>
          <p className="text-sm font-medium">Your leave history</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Pending and past requests, newest first.
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={reload}
          disabled={loading}
          aria-label="Refresh leave history"
        >
          <RotateCwIcon className={loading ? "animate-spin" : undefined} />
        </Button>
      </div>

      {error ? (
        <CardContent className="p-4">
          <EmptyState
            title="Couldn't load your leave history"
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
          <EmptyState
            title="No leave requests yet"
            description="When you apply, the request and its status show up here."
            action={
              <Button size="sm" onClick={onApply}>
                <PlusIcon />
                Apply for leave
              </Button>
            }
          />
        </CardContent>
      ) : (
        <>
          <div className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="pl-4">Type</TableHead>
                  <TableHead>Dates</TableHead>
                  <TableHead className="text-right">Days</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="pr-4 text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading && items.length === 0
                  ? Array.from({ length: 3 }).map((_, index) => (
                      <TableRow key={index} className="hover:bg-transparent">
                        <TableCell className="pl-4">
                          <Skeleton className="h-3 w-20" />
                        </TableCell>
                        <TableCell>
                          <Skeleton className="h-3 w-36" />
                        </TableCell>
                        <TableCell>
                          <Skeleton className="ml-auto h-3 w-6" />
                        </TableCell>
                        <TableCell>
                          <Skeleton className="h-3 w-40" />
                        </TableCell>
                        <TableCell>
                          <Skeleton className="h-5 w-20 rounded-4xl" />
                        </TableCell>
                        <TableCell className="pr-4">
                          <Skeleton className="ml-auto h-6 w-16" />
                        </TableCell>
                      </TableRow>
                    ))
                  : items.map((request) => (
                      <TableRow key={request.id}>
                        <TableCell className="pl-4 font-medium">{request.leaveTypeName}</TableCell>
                        <TableCell className="text-muted-foreground">
                          {formatDateRange(request.startDate, request.endDate)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{request.days}</TableCell>
                        <TableCell>
                          <p className="max-w-[15rem] truncate text-xs text-muted-foreground" title={request.reason ?? undefined}>
                            {request.reason || "—"}
                          </p>
                          {request.reviewComment ? (
                            <p className="max-w-[15rem] truncate text-[11px] text-muted-foreground" title={request.reviewComment ?? undefined}>
                              HR: {request.reviewComment}
                            </p>
                          ) : null}
                        </TableCell>
                        <TableCell>
                          <LeaveStatusBadge status={request.status} />
                        </TableCell>
                        <TableCell className="pr-4 text-right">
                          {canCancelRequest(request, today) ? (
                            <Button
                              variant="ghost"
                              size="xs"
                              className="text-muted-foreground hover:text-destructive"
                              onClick={() => {
                                setCancelError(null);
                                setSelected(request);
                              }}
                            >
                              Cancel
                            </Button>
                          ) : (
                            <span className="text-[11px] text-muted-foreground">—</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
              </TableBody>
            </Table>
          </div>

          {/* Mobile cards */}
          <div className="divide-y divide-border md:hidden">
            {loading && items.length === 0
              ? Array.from({ length: 2 }).map((_, index) => (
                  <div key={index} className="space-y-2 p-3">
                    <div className="flex items-center justify-between">
                      <Skeleton className="h-3 w-24" />
                      <Skeleton className="h-5 w-20 rounded-4xl" />
                    </div>
                    <Skeleton className="h-2.5 w-40" />
                  </div>
                ))
              : items.map((request) => (
                  <div key={request.id} className="space-y-2 p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{request.leaveTypeName}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {formatDateRange(request.startDate, request.endDate)} ·{" "}
                          <span className="tabular-nums">
                            {request.days} day{request.days === 1 ? "" : "s"}
                          </span>
                        </p>
                      </div>
                      <LeaveStatusBadge status={request.status} />
                    </div>
                    {request.reason ? (
                      <p className="line-clamp-2 text-xs text-muted-foreground">{request.reason}</p>
                    ) : null}
                    {request.reviewComment ? (
                      <p className="rounded-md bg-muted/60 px-2 py-1.5 text-[11px] text-muted-foreground">
                        <span className="font-medium text-foreground">HR:</span>{" "}
                        {request.reviewComment}
                      </p>
                    ) : null}
                    {canCancelRequest(request, today) ? (
                      <Button
                        variant="outline"
                        size="xs"
                        className="text-muted-foreground hover:text-destructive"
                        onClick={() => {
                          setCancelError(null);
                          setSelected(request);
                        }}
                      >
                        Cancel request
                      </Button>
                    ) : null}
                  </div>
                ))}
          </div>
        </>
      )}

      <ConfirmDialog
        open={Boolean(selected)}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
        title="Cancel this leave request?"
        description={
          selected
            ? `${selected.leaveTypeName} · ${formatDateRange(selected.startDate, selected.endDate)}. This can't be undone — you'd need to apply again.`
            : ""
        }
        confirmLabel="Cancel request"
        pendingLabel="Cancelling…"
        pending={cancelling}
        error={cancelError}
        destructive
        onConfirm={cancel}
      />
    </Card>
  );
}
