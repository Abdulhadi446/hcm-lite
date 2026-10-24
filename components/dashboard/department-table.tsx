import { Building2Icon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState } from "@/components/page-header";
import type { DepartmentBreakdown } from "./types";

function rateTone(value: number) {
  if (value >= 90) return "text-emerald-700 dark:text-emerald-400";
  if (value >= 75) return "text-amber-700 dark:text-amber-400";
  return "text-rose-700 dark:text-rose-400";
}

/** Attendance by department for the selected window. */
export function DepartmentTable({ items }: { items: DepartmentBreakdown[] }) {
  return (
    <Card className="overflow-hidden">
      <CardHeader className="border-b border-border pb-3">
        <CardTitle className="flex items-center gap-2">
          <Building2Icon className="size-4" />
          By department
        </CardTitle>
      </CardHeader>
      {items.length === 0 ? (
        <CardContent className="p-4">
          <EmptyState
            title="No departments in scope"
            description="Add employees to a department and their attendance rate will show up here."
          />
        </CardContent>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Department</TableHead>
              <TableHead className="text-right">People</TableHead>
              <TableHead className="text-right">Attendance</TableHead>
              <TableHead className="text-right">Late</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item) => (
              <TableRow key={item.departmentId ?? "unassigned"}>
                <TableCell className="max-w-[11rem] truncate font-medium">
                  {item.departmentName}
                </TableCell>
                <TableCell className="text-right tabular-nums">{item.headcount}</TableCell>
                <TableCell className="text-right">
                  <div className="flex flex-col items-end gap-1">
                    <span className={`tabular-nums ${rateTone(item.attendanceRate)}`}>
                      {item.attendanceRate}%
                    </span>
                    <span className="h-1 w-14 overflow-hidden rounded-full bg-muted sm:w-20">
                      <span
                        className={`block h-full rounded-full bg-current opacity-70 ${rateTone(
                          item.attendanceRate
                        )}`}
                        style={{ width: `${Math.min(100, item.attendanceRate)}%` }}
                      />
                    </span>
                  </div>
                </TableCell>
                <TableCell className="text-right">
                  <Badge variant={item.latePct > 20 ? "destructive" : "secondary"}>
                    {item.latePct}%
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </Card>
  );
}
