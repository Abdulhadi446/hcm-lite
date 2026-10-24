"use client";

import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDuration, formatTime } from "@/components/shared/format";
import { PersonCell } from "@/components/shared/bits";
import { AttendanceStatusBadge } from "./status-badge";
import { workedMinutes, type BoardRow } from "./types";

function Times({ row }: { row: BoardRow }) {
  return (
    <div className="grid grid-cols-3 gap-2">
      <div>
        <p className="text-[11px] text-muted-foreground">Check in</p>
        <p className="text-xs font-medium tabular-nums">{formatTime(row.checkInAt)}</p>
      </div>
      <div>
        <p className="text-[11px] text-muted-foreground">Check out</p>
        <p className="text-xs font-medium tabular-nums">{formatTime(row.checkOutAt)}</p>
      </div>
      <div>
        <p className="text-[11px] text-muted-foreground">Worked</p>
        <p className="text-xs font-medium tabular-nums">
          {formatDuration(workedMinutes(row.checkInAt, row.checkOutAt))}
        </p>
      </div>
    </div>
  );
}

export function AttendanceBoardTable({
  items,
  loading,
  skeletonRows = 6,
}: {
  items: BoardRow[];
  loading?: boolean;
  skeletonRows?: number;
}) {
  return (
    <>
      {/* Desktop table */}
      <div className="hidden md:block">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="pl-4">Employee</TableHead>
              <TableHead className="hidden lg:table-cell">Department</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Check in</TableHead>
              <TableHead className="text-right">Check out</TableHead>
              <TableHead className="pr-4 text-right">Worked</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && items.length === 0
              ? Array.from({ length: skeletonRows }).map((_, index) => (
                  <TableRow key={`skeleton-${index}`} className="hover:bg-transparent">
                    <TableCell className="pl-4">
                      <div className="flex items-center gap-2.5">
                        <Skeleton className="size-7 rounded-full" />
                        <div className="space-y-1.5">
                          <Skeleton className="h-3 w-32" />
                          <Skeleton className="h-2.5 w-16" />
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                      <Skeleton className="h-3 w-24" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-5 w-20 rounded-4xl" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="ml-auto h-3 w-10" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="ml-auto h-3 w-10" />
                    </TableCell>
                    <TableCell className="pr-4">
                      <Skeleton className="ml-auto h-3 w-12" />
                    </TableCell>
                  </TableRow>
                ))
              : items.map((row) => (
                  <TableRow key={`${row.employeeId}-${row.date}`}>
                    <TableCell className="pl-4">
                      <PersonCell name={row.fullName} code={row.code} />
                    </TableCell>
                    <TableCell className="hidden lg:table-cell text-muted-foreground">
                      {row.departmentName ?? "—"}
                    </TableCell>
                    <TableCell>
                      <AttendanceStatusBadge status={row.status} />
                      {row.status === "on_leave" && row.leaveTypeName ? (
                        <p className="mt-1 text-[11px] text-muted-foreground">
                          {row.leaveTypeName}
                        </p>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {formatTime(row.checkInAt)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {formatTime(row.checkOutAt)}
                    </TableCell>
                    <TableCell className="pr-4 text-right tabular-nums">
                      {formatDuration(workedMinutes(row.checkInAt, row.checkOutAt))}
                    </TableCell>
                  </TableRow>
                ))}
          </TableBody>
        </Table>
      </div>

      {/* Mobile cards */}
      <div className="divide-y divide-border md:hidden">
        {loading && items.length === 0
          ? Array.from({ length: Math.min(4, skeletonRows) }).map((_, index) => (
              <div key={`m-skeleton-${index}`} className="space-y-3 p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <Skeleton className="size-7 rounded-full" />
                    <div className="space-y-1.5">
                      <Skeleton className="h-3 w-28" />
                      <Skeleton className="h-2.5 w-14" />
                    </div>
                  </div>
                  <Skeleton className="h-5 w-20 rounded-4xl" />
                </div>
                <Skeleton className="h-2.5 w-24" />
                <div className="grid grid-cols-3 gap-2">
                  <Skeleton className="h-8" />
                  <Skeleton className="h-8" />
                  <Skeleton className="h-8" />
                </div>
              </div>
            ))
          : items.map((row) => (
              <div key={`${row.employeeId}-${row.date}-m`} className="space-y-2.5 p-3">
                <div className="flex items-start justify-between gap-2">
                  <PersonCell name={row.fullName} code={row.code} />
                  <AttendanceStatusBadge status={row.status} />
                </div>
                <p className="text-[11px] text-muted-foreground">
                  {row.departmentName ?? "No department"}
                  {row.status === "on_leave" && row.leaveTypeName
                    ? ` · ${row.leaveTypeName}`
                    : ""}
                </p>
                <Times row={row} />
              </div>
            ))}
      </div>
    </>
  );
}
