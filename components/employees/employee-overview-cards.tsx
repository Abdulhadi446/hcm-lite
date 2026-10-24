import { cn } from "@/lib/utils";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { formatMoney, type EmployeeOverview } from "./types";

function shortDate(iso: string) {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { day: "2-digit", month: "short" });
}

function monthLabel(month: string) {
  const d = new Date(`${month}-01T00:00:00`);
  if (Number.isNaN(d.getTime())) return month;
  return d.toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

function attendanceTone(status: string) {
  const s = status.toLowerCase();
  if (s === "present") return "text-emerald-600";
  if (s === "late") return "text-amber-600";
  if (s === "absent") return "text-destructive";
  return "text-muted-foreground";
}

export function AttendanceCard({ attendance }: { attendance: EmployeeOverview["attendance"] }) {
  const stats = [
    { label: "Present", value: attendance.presentDays, tone: "text-emerald-600" },
    { label: "Late", value: attendance.lateDays, tone: "text-amber-600" },
    { label: "Absent", value: attendance.absentDays, tone: "text-destructive" },
  ];
  const recent = [...attendance.last30].sort((a, b) => b.date.localeCompare(a.date));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Attendance</CardTitle>
        <CardDescription className="text-xs">Last 30 days</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 pt-0">
        <div className="grid grid-cols-3 gap-2">
          {stats.map((stat) => (
            <div key={stat.label} className="rounded-lg border border-border bg-muted/30 px-3 py-2">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                {stat.label}
              </p>
              <p className={cn("mt-0.5 text-lg font-semibold tabular-nums", stat.tone)}>
                {stat.value}
              </p>
            </div>
          ))}
        </div>

        {recent.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground">
            No attendance records yet
          </div>
        ) : (
          <div className="max-h-56 divide-y divide-border overflow-y-auto rounded-lg border border-border">
            {recent.map((row) => (
              <div
                key={row.date}
                className="flex items-center justify-between px-3 py-1.5 text-xs"
              >
                <span className="text-muted-foreground tabular-nums">{shortDate(row.date)}</span>
                <span className={cn("font-medium capitalize", attendanceTone(row.status))}>
                  {row.status.replace(/_/g, " ")}
                </span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function LeaveCard({ leave }: { leave: EmployeeOverview["leave"] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Leave balances</CardTitle>
        <CardDescription className="text-xs">Used against annual quota</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 pt-0">
        {leave.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground">
            No leave types configured yet
          </div>
        ) : (
          leave.map((row) => {
            const unlimited = row.quota <= 0;
            const pct = unlimited ? 0 : Math.min(100, Math.round((row.used / row.quota) * 100));
            return (
              <div key={row.typeName} className="space-y-1.5">
                <div className="flex items-baseline justify-between gap-2 text-xs">
                  <span className="font-medium">{row.typeName}</span>
                  <span className="text-muted-foreground tabular-nums">
                    {unlimited ? `${row.used} used · unlimited` : `${row.used} / ${row.quota} days`}
                  </span>
                </div>
                <Progress value={unlimited ? 0 : pct} aria-label={`${row.typeName} leave used`} />
                {!unlimited ? (
                  <p className="text-[11px] text-muted-foreground tabular-nums">
                    {row.remaining} days remaining
                  </p>
                ) : null}
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}

export function PayslipsCard({ payslips }: { payslips: EmployeeOverview["payslips"] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Payslips</CardTitle>
        <CardDescription className="text-xs">Net pay by month</CardDescription>
      </CardHeader>
      <CardContent className="pt-0">
        {payslips.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground">
            No payslips yet
          </div>
        ) : (
          <div className="divide-y divide-border rounded-lg border border-border">
            {payslips.map((slip) => (
              <div key={slip.id} className="flex items-center justify-between px-3 py-2 text-xs">
                <span>{monthLabel(slip.month)}</span>
                <span className="font-medium tabular-nums">{formatMoney(slip.net)}</span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
