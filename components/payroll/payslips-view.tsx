"use client";

import Link from "next/link";
import { DownloadIcon, FileTextIcon, RotateCwIcon } from "lucide-react";

import { Button, buttonVariants } from "@/components/ui/button";
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
import { EmptyState, PageHeader } from "@/components/page-header";
import { formatMoney, formatMonth } from "@/components/shared/format";
import { useApi } from "@/components/shared/use-api";
import type { PayslipSummary } from "./types";

export function PayslipsView() {
  const { data, loading, error, reload } = useApi<PayslipSummary[]>(
    "/api/payroll/payslips",
    (json) =>
      Array.isArray(json.items)
        ? (json.items as Partial<PayslipSummary>[]).map((item) => ({
            id: Number(item.id),
            employeeId: Number(item.employeeId ?? 0),
            month: String(item.month ?? ""),
            gross: Number(item.gross ?? 0),
            deductions: Number(item.deductions ?? 0),
            tax: Number(item.tax ?? 0),
            net: Number(item.net ?? 0),
          }))
        : [],
  );

  const items = [...(data ?? [])].sort((a, b) => b.month.localeCompare(a.month));
  const count = items.length;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Payslips"
        description={
          loading && !data
            ? "Loading your payslips…"
            : count === 0
              ? "Your monthly payslips will appear here."
              : `${count} payslip${count === 1 ? "" : "s"} available to download.`
        }
      />

      <Card className="overflow-hidden">
        <div className="flex items-center justify-between gap-2 border-b border-border p-3">
          <div className="flex items-center gap-2">
            <span className="flex size-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <FileTextIcon className="size-3.5" />
            </span>
            <div>
              <p className="text-sm font-medium">Payment history</p>
              <p className="text-[11px] text-muted-foreground">Net pay and PDFs by month.</p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={reload}
            disabled={loading}
            aria-label="Refresh payslips"
          >
            <RotateCwIcon className={loading ? "animate-spin" : undefined} />
          </Button>
        </div>

        {error ? (
          <CardContent className="p-4">
            <EmptyState
              title="Couldn't load your payslips"
              description={error}
              action={
                <Button size="sm" onClick={reload}>
                  Try again
                </Button>
              }
            />
          </CardContent>
        ) : !loading && count === 0 ? (
          <CardContent className="p-4">
            <EmptyState
              title="No payslips yet"
              description="Once an admin finalizes a payroll run, your payslip shows up here."
              action={
                <Link href="/dashboard" className={buttonVariants({ size: "sm", variant: "outline" })}>
                  Back to dashboard
                </Link>
              }
            />
          </CardContent>
        ) : (
          <>
            <div className="hidden sm:block">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="pl-4">Month</TableHead>
                    <TableHead className="text-right">Gross</TableHead>
                    <TableHead className="text-right">Deductions</TableHead>
                    <TableHead className="text-right">Tax</TableHead>
                    <TableHead className="text-right">Net pay</TableHead>
                    <TableHead className="pr-4 text-right">Payslip</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading && count === 0
                    ? Array.from({ length: 4 }).map((_, index) => (
                        <TableRow key={index} className="hover:bg-transparent">
                          <TableCell className="pl-4">
                            <Skeleton className="h-3.5 w-28" />
                          </TableCell>
                          <TableCell>
                            <Skeleton className="ml-auto h-3.5 w-20" />
                          </TableCell>
                          <TableCell>
                            <Skeleton className="ml-auto h-3.5 w-20" />
                          </TableCell>
                          <TableCell>
                            <Skeleton className="ml-auto h-3.5 w-16" />
                          </TableCell>
                          <TableCell>
                            <Skeleton className="ml-auto h-3.5 w-20" />
                          </TableCell>
                          <TableCell className="pr-4">
                            <Skeleton className="ml-auto h-6 w-20" />
                          </TableCell>
                        </TableRow>
                      ))
                    : items.map((payslip) => (
                        <TableRow key={payslip.id}>
                          <TableCell className="pl-4 font-medium">
                            {formatMonth(payslip.month)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums text-muted-foreground">
                            {formatMoney(payslip.gross)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums text-muted-foreground">
                            −{formatMoney(payslip.deductions)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums text-muted-foreground">
                            {formatMoney(payslip.tax)}
                          </TableCell>
                          <TableCell className="text-right font-semibold tabular-nums">
                            {formatMoney(payslip.net)}
                          </TableCell>
                          <TableCell className="pr-4 text-right">
                            <a
                              href={`/api/payroll/payslips/${payslip.id}/pdf`}
                              target="_blank"
                              rel="noreferrer"
                              className={buttonVariants({ variant: "outline", size: "sm" })}
                            >
                              <DownloadIcon />
                              PDF
                            </a>
                          </TableCell>
                        </TableRow>
                      ))}
                </TableBody>
              </Table>
            </div>

            {/* Mobile cards */}
            <div className="divide-y divide-border sm:hidden">
              {loading && count === 0
                ? Array.from({ length: 3 }).map((_, index) => (
                    <div key={index} className="space-y-2 p-3">
                      <div className="flex items-center justify-between">
                        <Skeleton className="h-3.5 w-28" />
                        <Skeleton className="h-7 w-16" />
                      </div>
                      <Skeleton className="h-2.5 w-32" />
                    </div>
                  ))
                : items.map((payslip) => (
                    <div key={payslip.id} className="space-y-2 p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-sm font-medium">{formatMonth(payslip.month)}</p>
                          <p className="text-[11px] text-muted-foreground">
                            Gross {formatMoney(payslip.gross)} · Tax {formatMoney(payslip.tax)}
                          </p>
                        </div>
                        <a
                          href={`/api/payroll/payslips/${payslip.id}/pdf`}
                          target="_blank"
                          rel="noreferrer"
                          className={buttonVariants({ variant: "outline", size: "sm" })}
                        >
                          <DownloadIcon />
                          PDF
                        </a>
                      </div>
                      <div className="flex items-baseline justify-between rounded-lg border border-border/80 bg-muted/20 px-2.5 py-2">
                        <span className="text-[11px] text-muted-foreground">Net pay</span>
                        <span className="text-sm font-semibold tabular-nums">
                          {formatMoney(payslip.net)}
                        </span>
                      </div>
                    </div>
                  ))}
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
