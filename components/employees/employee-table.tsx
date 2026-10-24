"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { StatusBadge } from "./status-badge";
import { formatDate, formatMoney, type Employee } from "./types";

export function EmployeeTable({
  items,
  loading,
  showSalary,
  skeletonRows = 7,
}: {
  items: Employee[];
  loading?: boolean;
  showSalary?: boolean;
  skeletonRows?: number;
}) {
  const router = useRouter();

  return (
    <Table>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead className="pl-4">Code</TableHead>
          <TableHead>Employee</TableHead>
          <TableHead className="hidden md:table-cell">Department</TableHead>
          <TableHead className="hidden lg:table-cell">Designation</TableHead>
          <TableHead className="hidden md:table-cell">Joined</TableHead>
          <TableHead>Status</TableHead>
          {showSalary ? (
            <TableHead className="hidden pr-4 text-right sm:table-cell">
              Gross salary
            </TableHead>
          ) : null}
        </TableRow>
      </TableHeader>
      <TableBody>
        {loading
          ? Array.from({ length: skeletonRows }).map((_, i) => (
              <TableRow key={`skeleton-${i}`} className="hover:bg-transparent">
                <TableCell className="pl-4">
                  <Skeleton className="h-3.5 w-14" />
                </TableCell>
                <TableCell>
                  <Skeleton className="h-3.5 w-32" />
                  <Skeleton className="mt-1.5 h-3 w-40" />
                </TableCell>
                <TableCell className="hidden md:table-cell">
                  <Skeleton className="h-3.5 w-24" />
                </TableCell>
                <TableCell className="hidden lg:table-cell">
                  <Skeleton className="h-3.5 w-28" />
                </TableCell>
                <TableCell className="hidden md:table-cell">
                  <Skeleton className="h-3.5 w-20" />
                </TableCell>
                <TableCell>
                  <Skeleton className="h-5 w-20 rounded-4xl" />
                </TableCell>
                {showSalary ? (
                  <TableCell className="hidden sm:table-cell">
                    <Skeleton className="ml-auto h-3.5 w-16" />
                  </TableCell>
                ) : null}
              </TableRow>
            ))
          : items.map((employee) => (
              <TableRow
                key={employee.id}
                className="cursor-pointer"
                onClick={() => router.push(`/employees/${employee.id}`)}
              >
                <TableCell className="pl-4 font-mono text-xs text-muted-foreground">
                  {employee.code}
                </TableCell>
                <TableCell>
                  <Link
                    href={`/employees/${employee.id}`}
                    className="font-medium hover:underline"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {employee.fullName}
                  </Link>
                  <p className="max-w-[16rem] truncate text-xs text-muted-foreground">
                    {employee.email}
                  </p>
                </TableCell>
                <TableCell className="hidden md:table-cell text-muted-foreground">
                  {employee.departmentName ?? "—"}
                </TableCell>
                <TableCell className="hidden lg:table-cell text-muted-foreground">
                  {employee.designationName ?? "—"}
                </TableCell>
                <TableCell className="hidden md:table-cell text-muted-foreground">
                  {formatDate(employee.joinDate)}
                </TableCell>
                <TableCell>
                  <StatusBadge status={employee.status} />
                </TableCell>
                {showSalary ? (
                  <TableCell className="hidden pr-4 text-right tabular-nums sm:table-cell">
                    {formatMoney(employee.grossSalary)}
                  </TableCell>
                ) : null}
              </TableRow>
            ))}
      </TableBody>
    </Table>
  );
}
