"use client";

import Link from "next/link";
import { Fragment, useMemo } from "react";
import { RotateCwIcon } from "lucide-react";

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
import { EmptyState } from "@/components/page-header";
import { PersonCell } from "@/components/shared/bits";
import { useApi } from "@/components/shared/use-api";
import { cn } from "@/lib/utils";
import { BalanceBar } from "./balance-bar";
import type { EmployeeOption, LeaveBalance } from "./types";

type RawEmployee = {
  id: number;
  fullName: string;
  code: string;
  departmentName: string | null;
};

function Remaining({ balance }: { balance: LeaveBalance }) {
  if (balance.remaining == null) {
    return <span className="text-xs text-muted-foreground">Unlimited</span>;
  }
  return (
    <span
      className={cn(
        "text-sm font-medium tabular-nums",
        balance.remaining <= 0 && "text-rose-600",
      )}
    >
      {balance.remaining}
      <span className="ml-1 text-[11px] font-normal text-muted-foreground">days</span>
    </span>
  );
}

export function LeaveBalances({ role }: { role: "admin" | "hr" }) {
  const balancesApi = useApi<LeaveBalance[]>("/api/leave/balances", (json) =>
    Array.isArray(json.items) ? (json.items as LeaveBalance[]) : [],
  );
  const employeesApi = useApi<EmployeeOption[]>("/api/employees?pageSize=200", (json) =>
    Array.isArray(json.items)
      ? (json.items as RawEmployee[]).map((employee) => ({
          id: employee.id,
          fullName: employee.fullName,
          code: employee.code,
          departmentName: employee.departmentName,
        }))
      : [],
  );

  const groups = useMemo(() => {
    const balances = balancesApi.data ?? [];
    const people = new Map((employeesApi.data ?? []).map((person) => [person.id, person]));

    const map = new Map<
      number,
      { employeeId: number; name: string; code: string; department: string | null; items: LeaveBalance[] }
    >();

    for (const balance of balances) {
      const person = people.get(balance.employeeId);
      const group = map.get(balance.employeeId) ?? {
        employeeId: balance.employeeId,
        name: person?.fullName ?? `Employee #${balance.employeeId}`,
        code: person?.code ?? "",
        department: person?.departmentName ?? null,
        items: [],
      };
      group.items.push(balance);
      map.set(balance.employeeId, group);
    }

    for (const group of map.values()) {
      group.items.sort((a, b) => a.typeName.localeCompare(b.typeName));
    }

    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [balancesApi.data, employeesApi.data]);

  const loading = balancesApi.loading && !balancesApi.data;
  const error = balancesApi.error;

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-col gap-2 border-b border-border p-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-medium">Leave balances</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            This calendar year · used and pending days against each quota.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <span className="size-1.5 rounded-full bg-primary" aria-hidden />
            Used
          </span>
          <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <span className="size-1.5 rounded-full bg-amber-400" aria-hidden />
            Pending
          </span>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={balancesApi.reload}
            disabled={balancesApi.loading}
            aria-label="Refresh balances"
          >
            <RotateCwIcon className={balancesApi.loading ? "animate-spin" : undefined} />
          </Button>
        </div>
      </div>

      {error ? (
        <CardContent className="p-4">
          <EmptyState
            title="Couldn't load balances"
            description={error}
            action={
              <Button size="sm" onClick={balancesApi.reload}>
                Try again
              </Button>
            }
          />
        </CardContent>
      ) : !loading && groups.length === 0 ? (
        <CardContent className="p-4">
          <EmptyState
            title="No leave balances yet"
            description="Add employees and leave types, then quotas appear here per person."
            action={
              <Link
                href={role === "admin" ? "/organization" : "/employees"}
                className={buttonVariants({ size: "sm", variant: "outline" })}
              >
                {role === "admin" ? "Manage leave types" : "View employees"}
              </Link>
            }
          />
        </CardContent>
      ) : (
        <>
          <div className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="pl-4">Leave type</TableHead>
                  <TableHead className="text-right">Quota</TableHead>
                  <TableHead>Used</TableHead>
                  <TableHead className="text-right">Pending</TableHead>
                  <TableHead className="pr-4 text-right">Remaining</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading && groups.length === 0
                  ? Array.from({ length: 4 }).map((_, index) => (
                      <TableRow key={index} className="hover:bg-transparent">
                        <TableCell className="pl-4">
                          <Skeleton className="h-3 w-24" />
                        </TableCell>
                        <TableCell>
                          <Skeleton className="ml-auto h-3 w-8" />
                        </TableCell>
                        <TableCell>
                          <Skeleton className="h-3 w-28" />
                        </TableCell>
                        <TableCell>
                          <Skeleton className="ml-auto h-3 w-6" />
                        </TableCell>
                        <TableCell className="pr-4">
                          <Skeleton className="ml-auto h-3 w-12" />
                        </TableCell>
                      </TableRow>
                    ))
                  : groups.map((group) => (
                      <Fragment key={group.employeeId}>
                        <TableRow className="bg-muted/40 hover:bg-muted/40">
                          <TableCell colSpan={5} className="px-4 py-2">
                            <PersonCell
                              name={group.name}
                              code={group.code}
                              meta={group.department}
                            />
                          </TableCell>
                        </TableRow>
                        {group.items.map((balance) => (
                          <TableRow key={`${group.employeeId}-${balance.leaveTypeId}`}>
                            <TableCell className="pl-4 text-muted-foreground">
                              {balance.typeName}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                              {balance.quota > 0 ? balance.quota : "∞"}
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <BalanceBar
                                  quota={balance.quota}
                                  used={balance.used}
                                  pending={balance.pending}
                                  className="w-20"
                                />
                                <span className="whitespace-nowrap text-xs tabular-nums text-muted-foreground">
                                  {balance.used}
                                  {balance.quota > 0 ? ` / ${balance.quota}` : ""}
                                </span>
                              </div>
                            </TableCell>
                            <TableCell className="text-right text-xs tabular-nums text-muted-foreground">
                              {balance.pending || "—"}
                            </TableCell>
                            <TableCell className="pr-4 text-right">
                              <Remaining balance={balance} />
                            </TableCell>
                          </TableRow>
                        ))}
                      </Fragment>
                    ))}
              </TableBody>
            </Table>
          </div>

          {/* Mobile cards */}
          <div className="divide-y divide-border md:hidden">
            {loading && groups.length === 0
              ? Array.from({ length: 2 }).map((_, index) => (
                  <div key={index} className="space-y-2 p-3">
                    <Skeleton className="h-3 w-32" />
                    <Skeleton className="h-2.5 w-full" />
                    <Skeleton className="h-2.5 w-2/3" />
                  </div>
                ))
              : groups.map((group) => (
                  <div key={group.employeeId} className="space-y-3 p-3">
                    <PersonCell name={group.name} code={group.code} meta={group.department} />
                    <div className="space-y-2.5">
                      {group.items.map((balance) => (
                        <div
                          key={balance.leaveTypeId}
                          className="rounded-lg border border-border/80 bg-muted/20 p-2.5"
                        >
                          <div className="flex items-baseline justify-between gap-2">
                            <p className="text-xs font-medium">{balance.typeName}</p>
                            <Remaining balance={balance} />
                          </div>
                          <BalanceBar
                            quota={balance.quota}
                            used={balance.used}
                            pending={balance.pending}
                            className="mt-2"
                          />
                          <p className="mt-1.5 text-[11px] tabular-nums text-muted-foreground">
                            {balance.used} used
                            {balance.quota > 0 ? ` of ${balance.quota}` : " · unlimited"}
                            {balance.pending ? ` · ${balance.pending} pending` : ""}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
          </div>
        </>
      )}
    </Card>
  );
}
