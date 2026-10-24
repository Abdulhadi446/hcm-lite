"use client";

import { useState } from "react";
import { CheckIcon, RotateCwIcon, XIcon } from "lucide-react";

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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmptyState } from "@/components/page-header";
import { PersonCell } from "@/components/shared/bits";
import { formatDateRange } from "@/components/shared/format";
import { useApi } from "@/components/shared/use-api";
import { LeaveReviewDialog } from "./leave-review-dialog";
import { LeaveStatusBadge } from "./status-badge";
import type { LeaveRequestRow, LeaveStatusFilter } from "./types";

const STATUS_ITEMS = [
  { label: "All statuses", value: "all" },
  { label: "Pending", value: "pending" },
  { label: "Approved", value: "approved" },
  { label: "Rejected", value: "rejected" },
  { label: "Cancelled", value: "cancelled" },
];

export function LeaveRequests({
  canReview,
  status,
  onStatusChange,
  onOpenBalances,
}: {
  canReview: boolean;
  status: LeaveStatusFilter;
  onStatusChange: (value: string) => void;
  onOpenBalances: () => void;
}) {
  const [review, setReview] = useState<{
    request: LeaveRequestRow;
    action: "approve" | "reject";
  } | null>(null);

  const url = status === "all" ? "/api/leave/requests" : `/api/leave/requests?status=${status}`;
  const { data, loading, error, reload } = useApi<LeaveRequestRow[]>(url, (json) =>
    Array.isArray(json.items) ? (json.items as LeaveRequestRow[]) : [],
  );

  const items = data ?? [];
  const hasFilter = status !== "all";

  function actionsFor(request: LeaveRequestRow) {
    if (!canReview || request.status !== "pending") return null;
    return (
      <div className="flex items-center justify-end gap-1.5">
        <Button
          variant="outline"
          size="xs"
          className="border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 hover:text-emerald-800"
          onClick={() => setReview({ request, action: "approve" })}
          aria-label={`Approve leave for ${request.employeeName}`}
        >
          <CheckIcon />
          Approve
        </Button>
        <Button
          variant="ghost"
          size="xs"
          className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
          onClick={() => setReview({ request, action: "reject" })}
          aria-label={`Reject leave for ${request.employeeName}`}
        >
          <XIcon />
          Reject
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <Card>
        <CardContent className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium">
              {loading && !data ? "Loading requests…" : `${items.length} ${items.length === 1 ? "request" : "requests"}`}
            </p>
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={reload}
              disabled={loading}
              aria-label="Refresh requests"
            >
              <RotateCwIcon className={loading ? "animate-spin" : undefined} />
            </Button>
          </div>
          <div className="flex items-center gap-2">
            <Select
              value={status}
              onValueChange={(value) => onStatusChange(value ?? "pending")}
              items={STATUS_ITEMS}
            >
              <SelectTrigger className="w-full sm:w-40" aria-label="Filter by status">
                <SelectValue placeholder="All statuses" />
              </SelectTrigger>
              <SelectContent>
                {STATUS_ITEMS.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card className="overflow-hidden">
        {error ? (
          <CardContent className="p-4">
            <EmptyState
              title="Couldn't load leave requests"
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
            {hasFilter ? (
              <EmptyState
                title={`No ${status} requests`}
                description="Try another status to see the rest of the queue."
                action={
                  <Button size="sm" variant="outline" onClick={() => onStatusChange("all")}>
                    Show all requests
                  </Button>
                }
              />
            ) : (
              <EmptyState
                title="No leave requests yet"
                description="When an employee applies for leave, it lands here for review."
                action={
                  <Button size="sm" variant="outline" onClick={onOpenBalances}>
                    View balances
                  </Button>
                }
              />
            )}
          </CardContent>
        ) : (
          <>
            <div className="hidden md:block">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="pl-4">Employee</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Dates</TableHead>
                    <TableHead className="text-right">Days</TableHead>
                    <TableHead>Reason</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="pr-4 text-right">Review</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading && items.length === 0
                    ? Array.from({ length: 5 }).map((_, index) => (
                        <TableRow key={index} className="hover:bg-transparent">
                          <TableCell className="pl-4">
                            <div className="flex items-center gap-2.5">
                              <Skeleton className="size-7 rounded-full" />
                              <Skeleton className="h-3 w-32" />
                            </div>
                          </TableCell>
                          <TableCell>
                            <Skeleton className="h-3 w-20" />
                          </TableCell>
                          <TableCell>
                            <Skeleton className="h-3 w-32" />
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
                            <Skeleton className="ml-auto h-6 w-14" />
                          </TableCell>
                        </TableRow>
                      ))
                    : items.map((request) => (
                        <TableRow key={request.id}>
                          <TableCell className="pl-4">
                            <PersonCell
                              name={request.employeeName}
                              code={request.departmentName}
                            />
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {request.leaveTypeName}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {formatDateRange(request.startDate, request.endDate)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">{request.days}</TableCell>
                          <TableCell>
                            <p className="max-w-[14rem] truncate text-xs text-muted-foreground" title={request.reason ?? undefined}>
                              {request.reason || "—"}
                            </p>
                          </TableCell>
                          <TableCell>
                            <LeaveStatusBadge status={request.status} />
                          </TableCell>
                          <TableCell className="pr-4">
                            {actionsFor(request) ?? (
                              <p className="text-right text-[11px] text-muted-foreground">
                                {request.status === "pending"
                                  ? canReview
                                    ? "—"
                                    : "HR review"
                                  : "—"}
                              </p>
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
                ? Array.from({ length: 3 }).map((_, index) => (
                    <div key={index} className="space-y-2 p-3">
                      <div className="flex items-center justify-between">
                        <Skeleton className="h-3 w-32" />
                        <Skeleton className="h-5 w-20 rounded-4xl" />
                      </div>
                      <Skeleton className="h-2.5 w-40" />
                      <Skeleton className="h-2.5 w-full" />
                    </div>
                  ))
                : items.map((request) => (
                    <div key={request.id} className="space-y-2 p-3">
                      <div className="flex items-start justify-between gap-2">
                        <PersonCell name={request.employeeName} code={request.departmentName} />
                        <LeaveStatusBadge status={request.status} />
                      </div>
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
                        <span className="font-medium text-foreground">{request.leaveTypeName}</span>
                        <span>·</span>
                        <span>{formatDateRange(request.startDate, request.endDate)}</span>
                        <span>·</span>
                        <span className="tabular-nums">
                          {request.days} day{request.days === 1 ? "" : "s"}
                        </span>
                      </div>
                      {request.reason ? (
                        <p className="line-clamp-2 text-xs text-muted-foreground">{request.reason}</p>
                      ) : null}
                      {canReview && request.status === "pending" ? (
                        <div className="flex gap-2 pt-0.5">
                          <Button
                            size="xs"
                            variant="outline"
                            className="border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                            onClick={() => setReview({ request, action: "approve" })}
                          >
                            <CheckIcon />
                            Approve
                          </Button>
                          <Button
                            size="xs"
                            variant="ghost"
                            className="text-muted-foreground hover:text-destructive"
                            onClick={() => setReview({ request, action: "reject" })}
                          >
                            <XIcon />
                            Reject
                          </Button>
                        </div>
                      ) : null}
                    </div>
                  ))}
            </div>
          </>
        )}
      </Card>

      <LeaveReviewDialog
        request={review?.request ?? null}
        action={review?.action ?? "approve"}
        onOpenChange={(open) => {
          if (!open) setReview(null);
        }}
        onDone={reload}
      />
    </div>
  );
}
