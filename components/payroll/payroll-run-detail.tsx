"use client";

import { DownloadIcon, LockIcon, PlusIcon, Trash2Icon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState } from "@/components/page-header";
import { PersonCell } from "@/components/shared/bits";
import { formatDate, formatMoney, formatMonth } from "@/components/shared/format";
import { RunStatusBadge } from "./status-badge";
import {
  deductionBasis,
  sumBy,
  type PayrollRunDetail,
  type PayslipRow,
} from "./types";

function PayslipLink({ id }: { id: number }) {
  return (
    <a
      href={`/api/payroll/payslips/${id}/pdf`}
      target="_blank"
      rel="noreferrer"
      aria-label="Download payslip PDF"
      title="Download PDF"
      className="inline-flex size-6 items-center justify-center rounded-md border border-border bg-background text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
    >
      <DownloadIcon className="size-3.5" />
    </a>
  );
}

function DetailSkeleton() {
  return (
    <Card className="overflow-hidden">
      <div className="space-y-2 border-b border-border p-3">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-2.5 w-48" />
      </div>
      <div className="space-y-3 p-3">
        {Array.from({ length: 5 }).map((_, index) => (
          <div key={index} className="flex items-center gap-3">
            <Skeleton className="size-7 rounded-full" />
            <Skeleton className="h-3 w-32" />
            <Skeleton className="ml-auto h-3 w-16" />
            <Skeleton className="h-3 w-14" />
          </div>
        ))}
      </div>
    </Card>
  );
}

export function PayrollRunDetailCard({
  detail,
  loading,
  error,
  role,
  canCreate,
  onRetry,
  onFinalize,
  onDiscard,
  onCreate,
}: {
  detail: PayrollRunDetail | null;
  loading: boolean;
  error: string | null;
  role: "admin" | "hr";
  canCreate: boolean;
  onRetry: () => void;
  onFinalize: () => void;
  onDiscard: () => void;
  onCreate: () => void;
}) {
  if (error) {
    return (
      <Card>
        <CardContent className="p-4">
          <EmptyState
            title="Couldn't load this run"
            description={error}
            action={
              <Button size="sm" onClick={onRetry}>
                Try again
              </Button>
            }
          />
        </CardContent>
      </Card>
    );
  }

  if (!detail) {
    return loading ? (
      <DetailSkeleton />
    ) : (
      <Card>
        <CardContent className="p-4">
          <EmptyState
            title="No payroll run selected"
            description={
              canCreate
                ? "Pick a run on the left, or create a draft for the month above."
                : "Pick a run on the left. HR creates drafts; an admin locks them."
            }
            action={
              canCreate ? (
                <Button size="sm" variant="outline" onClick={onCreate}>
                  <PlusIcon />
                  Create draft
                </Button>
              ) : undefined
            }
          />
        </CardContent>
      </Card>
    );
  }

  const { run, payslips } = detail;
  const finalized = run.status === "finalized";
  const canFinalize = role === "admin" && !finalized;
  const canDiscard = role === "hr" && !finalized;

  const totalGross = sumBy(payslips, "gross");
  const totalDeductions = sumBy(payslips, "deductions");
  const totalTax = sumBy(payslips, "tax");
  const totalNet = sumBy(payslips, "net");

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-start justify-between gap-2 border-b border-border p-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold">{formatMonth(run.month)}</p>
            <RunStatusBadge status={run.status} />
          </div>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            {run.employeeCount} employee{run.employeeCount === 1 ? "" : "s"} ·{" "}
            {run.workingDays} working days
            {run.finalizedAt ? ` · locked ${formatDate(run.finalizedAt)}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          {canFinalize ? (
            <Button size="xs" onClick={onFinalize}>
              <LockIcon />
              Finalize &amp; lock
            </Button>
          ) : null}
          {canDiscard ? (
            <Button
              size="xs"
              variant="ghost"
              className="text-muted-foreground hover:text-destructive"
              onClick={onDiscard}
            >
              <Trash2Icon />
              Discard
            </Button>
          ) : null}
        </div>
      </div>

      {!finalized ? (
        <p className="border-b border-border bg-muted/30 px-3 py-1.5 text-[11px] text-muted-foreground">
          {role === "admin"
            ? "Review the numbers, then finalize to lock attendance and publish payslips."
            : "HR can review drafts. An admin finalizes and locks the month."}
        </p>
      ) : null}

      {payslips.length === 0 ? (
        <CardContent className="p-4">
          <EmptyState
            title="No payslips in this run"
            description="No employee had a salary structure for this month, so the run is empty."
          />
        </CardContent>
      ) : (
        <>
          <div className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="pl-4">Employee</TableHead>
                  <TableHead className="text-right">Gross</TableHead>
                  <TableHead className="text-right">Deductions</TableHead>
                  <TableHead className="text-right">Tax</TableHead>
                  <TableHead className="text-right">Net</TableHead>
                  <TableHead className="pr-4 text-right">
                    <span className="sr-only">Payslip</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {payslips.map((payslip: PayslipRow) => (
                  <TableRow key={payslip.id}>
                    <TableCell className="pl-4">
                      <PersonCell
                        name={payslip.employeeName ?? `Employee #${payslip.employeeId}`}
                        code={payslip.employeeCode}
                        meta={payslip.departmentName}
                      />
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatMoney(payslip.gross)}
                    </TableCell>
                    <TableCell className="text-right">
                      {payslip.deductions > 0.004 ? (
                        <>
                          <span className="tabular-nums text-destructive">
                            −{formatMoney(payslip.deductions)}
                          </span>
                          <p className="text-[10px] text-muted-foreground">
                            {deductionBasis(payslip)}
                          </p>
                        </>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {formatMoney(payslip.tax)}
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums">
                      {formatMoney(payslip.net)}
                    </TableCell>
                    <TableCell className="pr-4 text-right">
                      {finalized ? <PayslipLink id={payslip.id} /> : null}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell className="pl-4">Totals</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatMoney(totalGross)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    −{formatMoney(totalDeductions)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatMoney(totalTax)}
                  </TableCell>
                  <TableCell className="text-right font-semibold tabular-nums">
                    {formatMoney(totalNet)}
                  </TableCell>
                  <TableCell className="pr-4" />
                </TableRow>
              </TableFooter>
            </Table>
          </div>

          {/* Mobile cards */}
          <div className="divide-y divide-border md:hidden">
            {payslips.map((payslip) => (
              <div key={payslip.id} className="space-y-2 p-3">
                <div className="flex items-start justify-between gap-2">
                  <PersonCell
                    name={payslip.employeeName ?? `Employee #${payslip.employeeId}`}
                    code={payslip.employeeCode}
                    meta={payslip.departmentName}
                  />
                  {finalized ? <PayslipLink id={payslip.id} /> : null}
                </div>
                <div className="grid grid-cols-3 gap-2 rounded-lg border border-border/80 bg-muted/20 p-2">
                  <div>
                    <p className="text-[10px] text-muted-foreground">Gross</p>
                    <p className="text-xs font-medium tabular-nums">{formatMoney(payslip.gross)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground">Deductions</p>
                    <p className="text-xs font-medium tabular-nums text-destructive">
                      {payslip.deductions > 0.004 ? `−${formatMoney(payslip.deductions)}` : "—"}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground">Net</p>
                    <p className="text-xs font-semibold tabular-nums">{formatMoney(payslip.net)}</p>
                  </div>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Tax {formatMoney(payslip.tax)}
                  {payslip.deductions > 0.004 ? ` · ${deductionBasis(payslip)}` : ""}
                </p>
              </div>
            ))}
            <div className="space-y-1.5 bg-muted/40 p-3 text-xs">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Gross</span>
                <span className="tabular-nums">{formatMoney(totalGross)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Deductions</span>
                <span className="tabular-nums">−{formatMoney(totalDeductions)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Tax</span>
                <span className="tabular-nums">{formatMoney(totalTax)}</span>
              </div>
              <div className="mt-1 flex justify-between border-t border-border pt-1.5 text-sm font-semibold">
                <span>Net total</span>
                <span className="tabular-nums">{formatMoney(totalNet)}</span>
              </div>
            </div>
          </div>
        </>
      )}
    </Card>
  );
}
