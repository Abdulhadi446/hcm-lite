import Link from "next/link";
import { CalendarDaysIcon, ReceiptTextIcon, TimerIcon } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/page-header";
import { formatDate, formatMoney, formatMonth } from "@/components/shared/format";
import type { EmployeeDashboard } from "./types";

/** Leave balances as simple bars — quota 0 types are unlimited. */
export function LeaveBalanceBars({ items }: { items: EmployeeDashboard["leaveBalances"] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Leave balance</CardTitle>
        <CardDescription className="text-xs">
          Used and pending days against this year&apos;s quota.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <EmptyState
            title="No leave types yet"
            description="Your HR team hasn't configured leave types, so there's no balance to show."
          />
        ) : (
          <ul className="space-y-3">
            {items.map((item) => {
              const unlimited = item.quota <= 0;
              const percent = unlimited
                ? 0
                : Math.min(100, Math.round((item.used / item.quota) * 100));
              return (
                <li key={item.leaveTypeId} className="space-y-1.5">
                  <div className="flex items-baseline justify-between gap-2 text-xs">
                    <span className="truncate font-medium">{item.typeName}</span>
                    <span className="shrink-0 tabular-nums text-muted-foreground">
                      {unlimited
                        ? `${item.used} used · unlimited`
                        : `${item.used} / ${item.quota} d`}
                    </span>
                  </div>
                  <div
                    className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
                    role="progressbar"
                    aria-label={`${item.typeName} used`}
                    aria-valuemin={0}
                    aria-valuemax={unlimited ? undefined : item.quota}
                    aria-valuenow={unlimited ? undefined : item.used}
                  >
                    <div
                      className={`h-full rounded-full ${unlimited ? "bg-muted-foreground/40" : "bg-primary"}`}
                      style={{ width: unlimited ? "100%" : `${percent}%`, opacity: unlimited ? 0.25 : 1 }}
                    />
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    {unlimited
                      ? "No cap on this type"
                      : `${Math.max(0, item.remaining ?? 0)} day${(item.remaining ?? 0) === 1 ? "" : "s"} left${
                          item.pending > 0 ? ` · ${item.pending} pending` : ""
                        }`}
                  </p>
                </li>
              );
            })}
          </ul>
        )}
        <Link
          href="/my-leave"
          className={buttonVariants({ size: "sm", variant: "outline", className: "mt-4" })}
        >
          Apply for leave
        </Link>
      </CardContent>
    </Card>
  );
}

/** Hours this week, next holiday and the last payslip shortcut. */
export function EmployeeQuickCards({ data }: { data: EmployeeDashboard }) {
  const nextHoliday = data.upcomingHolidays[0] ?? null;

  return (
    <div className="space-y-3">
      <Card size="sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <TimerIcon className="size-4" />
            Hours this week
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-2xl font-semibold tabular-nums">{data.me.hoursThisWeek}h</p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            From your check-in / check-out records since Monday.
          </p>
        </CardContent>
      </Card>

      <Card size="sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <CalendarDaysIcon className="size-4" />
            Next holiday
          </CardTitle>
        </CardHeader>
        <CardContent>
          {nextHoliday ? (
            <>
              <p className="text-sm font-medium">{nextHoliday.name}</p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                {formatDate(nextHoliday.date)}
              </p>
              {data.upcomingHolidays.length > 1 ? (
                <p className="mt-2 text-[11px] text-muted-foreground">
                  Then {data.upcomingHolidays[1].name} ·{" "}
                  {formatDate(data.upcomingHolidays[1].date)}
                </p>
              ) : null}
            </>
          ) : (
            <p className="text-[11px] text-muted-foreground">
              No upcoming holidays on the calendar.
            </p>
          )}
        </CardContent>
      </Card>

      <Card size="sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <ReceiptTextIcon className="size-4" />
            Last payslip
          </CardTitle>
        </CardHeader>
        <CardContent>
          {data.lastPayslip ? (
            <>
              <p className="text-sm font-medium">{formatMonth(data.lastPayslip.month)}</p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                Net {formatMoney(data.lastPayslip.net)}
              </p>
            </>
          ) : (
            <p className="text-[11px] text-muted-foreground">
              No finalized payslip yet — it appears here once payroll is finalized.
            </p>
          )}
          <Link
            href="/payslips"
            className={buttonVariants({ size: "sm", variant: "outline", className: "mt-3" })}
          >
            Open payslips
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
