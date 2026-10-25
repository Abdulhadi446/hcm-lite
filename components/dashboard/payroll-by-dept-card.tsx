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
import { formatMoney } from "@/components/shared/format";
import type { PayrollDeptRow } from "./types";

/** Payroll cost grouped by department for the selected window. */
export function PayrollByDeptCard({ items }: { items: PayrollDeptRow[] }) {
  const totalCost = items.reduce((sum, item) => sum + item.payrollCost, 0);
  const totalHeadcount = items.reduce((sum, item) => sum + item.headcount, 0);

  return (
    <Card className="overflow-hidden">
      <CardHeader className="border-b border-border pb-3">
        <CardTitle className="text-sm">Payroll by department</CardTitle>
      </CardHeader>
      {items.length === 0 ? (
        <CardContent className="p-4">
          <EmptyState
            title="No payroll run for this range"
            description="Run payroll to see cost by department."
          />
        </CardContent>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Department</TableHead>
              <TableHead className="text-right">People</TableHead>
              <TableHead className="text-right">Avg salary</TableHead>
              <TableHead className="text-right">Cost</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item) => (
              <TableRow key={item.departmentId ?? "unassigned"}>
                <TableCell className="max-w-[11rem] truncate font-medium">
                  {item.departmentName}
                </TableCell>
                <TableCell className="text-right tabular-nums">{item.headcount}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatMoney(item.avgSalary)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatMoney(item.payrollCost)}
                </TableCell>
              </TableRow>
            ))}
            <TableRow className="font-semibold">
              <TableCell>Total</TableCell>
              <TableCell className="text-right tabular-nums">{totalHeadcount}</TableCell>
              <TableCell className="text-right tabular-nums">
                {formatMoney(totalHeadcount > 0 ? totalCost / totalHeadcount : 0)}
              </TableCell>
              <TableCell className="text-right tabular-nums">{formatMoney(totalCost)}</TableCell>
            </TableRow>
          </TableBody>
        </Table>
      )}
    </Card>
  );
}
