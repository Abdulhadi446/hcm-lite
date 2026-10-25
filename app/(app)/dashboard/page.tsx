import { Suspense } from "react";
import { connection } from "next/server";
import Link from "next/link";
import { redirect } from "next/navigation";
import { format, parseISO } from "date-fns";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/page-header";
import { DashboardHero } from "@/components/brand/dashboard-hero";
import {
  ArrowRightIcon,
  ArrowUpRightIcon,
  LineChartIcon,
  MegaphoneIcon,
  PinIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

import { getSessionUser, type SessionUser } from "@/lib/auth";
import { isIsoDate, monthRange, todayIso } from "@/lib/dates";
import { relativeTime } from "@/lib/relative-time";
import { computeMetrics, employeeDashboard } from "@/lib/services/analytics";
import { listAnnouncements } from "@/lib/services/comms";
import { listAuditLogs } from "@/lib/services/audit";
import { listDepartments } from "@/lib/services/org";
import { AdminKpiGrid } from "@/components/dashboard/admin-kpi-grid";
import { AuditFeedCard } from "@/components/dashboard/audit-feed-card";
import { DashboardFilters } from "@/components/dashboard/dashboard-filters";
import { DashboardSummary } from "@/components/ai/dashboard-summary";
import { LateComersCard } from "@/components/dashboard/late-comers-card";
import { LeaveByTypeCard } from "@/components/dashboard/leave-by-type-card";
import { PayrollByDeptCard } from "@/components/dashboard/payroll-by-dept-card";
import { DashboardSkeleton, EmployeeDashboardSkeleton } from "@/components/dashboard/dashboard-skeleton";
import { DepartmentTable } from "@/components/dashboard/department-table";
import { EmployeeKpiGrid } from "@/components/dashboard/employee-kpi-grid";
import { EmployeeQuickCards, LeaveBalanceBars } from "@/components/dashboard/employee-widgets";
import { PendingApprovals } from "@/components/dashboard/pending-approvals";
import { RecentHires } from "@/components/dashboard/recent-hires";
import { DashboardTrendChart } from "@/components/dashboard/trend-chart";

type SearchParams = Record<string, string | string[] | undefined>;

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

function readParam(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value ?? undefined;
}

/** "1 Oct – 25 Oct 2026" — the range the numbers on this page describe. */
function rangeLabel(from: string, to: string) {
  return `${format(parseISO(from), "d MMM")} – ${format(parseISO(to), "d MMM yyyy")}`;
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await connection();
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const params = await searchParams;
  const today = todayIso();
  const month = monthRange(today.slice(0, 7));

  const fromParam = readParam(params.from);
  const toParam = readParam(params.to);
  const from = fromParam && isIsoDate(fromParam) ? fromParam : month.start;
  const to = toParam && isIsoDate(toParam) ? toParam : today;
  const safeFrom = from > to ? to : from;

  const departmentRaw = readParam(params.departmentId);
  const departmentId =
    departmentRaw && /^\d+$/.test(departmentRaw) ? Number(departmentRaw) : null;

  const todayLabel = format(parseISO(today), "EEEE, d MMMM yyyy");

  // Employees see month-to-date personal records; everyone else sees the
  // reporting range that the filters below control.
  const isEmployeeView = user.role === "employee";
  const header = (
    <DashboardHero
      greeting={greeting()}
      name={user.name}
      companyName={user.companyName || "HCM Lite"}
      dateLabel={todayLabel}
      periodLabel={rangeLabel(
        isEmployeeView ? month.start : safeFrom,
        isEmployeeView ? today : to,
      )}
      scopeLabel={isEmployeeView ? "Your records" : "Company overview"}
    />
  );

  if (user.role === "employee") {
    return (
      <div className="space-y-5">
        {header}
        <Suspense fallback={<EmployeeDashboardSkeleton />}>
          <EmployeeDashboardView user={user} />
        </Suspense>
      </div>
    );
  }

  const departments = listDepartments().map((department) => ({
    id: department.id,
    name: department.name,
  }));

  return (
    <div className="space-y-5">
      {header}
      <DashboardFilters
        from={safeFrom}
        to={to}
        departmentId={departmentId}
        departments={departments}
      />
      <Suspense
        key={`${safeFrom}:${to}:${departmentId ?? "all"}`}
        fallback={<DashboardSkeleton />}
      >
        <CompanyDashboard
          from={safeFrom}
          to={to}
          departmentId={departmentId}
          canRegisterEmployees={user.role === "hr"}
          isAdmin={user.role === "admin"}
        />
      </Suspense>
    </div>
  );
}

// ------------------------------------------------------------- company view

async function CompanyDashboard({
  from,
  to,
  departmentId,
  canRegisterEmployees,
  isAdmin,
}: {
  from: string;
  to: string;
  departmentId: number | null;
  canRegisterEmployees: boolean;
  isAdmin: boolean;
}) {
  const summary = computeMetrics({ from, to, departmentId });
  const { kpis, today, trend, byDepartment, pending, recentHires, insights } = summary;
  const auditFeed = isAdmin
    ? listAuditLogs({ pageSize: 8 }).items.map((row) => ({
        id: row.id,
        action: row.action,
        entity: row.entity,
        actorName: row.actorName,
        summary: `${row.action} ${row.entity}${row.entityId ? ` #${row.entityId}` : ""}`,
        createdAt: row.createdAt,
      }))
    : [];
  const departmentName =
    departmentId === null
      ? "Whole company"
      : (byDepartment.find((item) => item.departmentId === departmentId)?.departmentName ??
        "Selected department");

  return (
    <div className="space-y-4">
      <AdminKpiGrid kpis={kpis} today={today} />

      {kpis.headcount === 0 ? (
        <Card>
          <CardContent className="p-4">
            <EmptyState
              title="No employees in this scope yet"
              description={
                canRegisterEmployees
                  ? "Add employees (or pick another department) and the KPIs, trend and department table fill in automatically."
                  : "Ask HR to register employees — their records fill in the KPIs, trend and department table."
              }
              action={
                <Link
                  href={canRegisterEmployees ? "/employees/new" : "/employees"}
                  className={buttonVariants({ size: "sm", variant: canRegisterEmployees ? "default" : "outline" })}
                >
                  {canRegisterEmployees ? "Add employee" : "View employees"}
                </Link>
              }
            />
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-12">
        <div className="lg:col-span-8">
          <Card className="overflow-hidden">
            <CardHeader className="border-b border-border pb-3">
              <CardTitle className="flex items-center gap-2">
                <LineChartIcon className="size-4" />
                Attendance trend
              </CardTitle>
              <CardDescription className="text-xs">
                {departmentName} · {trend.length} working day{trend.length === 1 ? "" : "s"}{" "}
                recorded in this range
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-4">
              {trend.length === 0 ? (
                <EmptyState
                  title="No attendance in this range"
                  description="Pick a range that includes today, or ask employees to check in to see the daily split."
                />
              ) : (
                <DashboardTrendChart data={trend} />
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4 lg:col-span-4">
          <AnnouncementsCard />
          <DashboardSummary
            rangeQuery={`from=${from}&to=${to}${departmentId ? `&departmentId=${departmentId}` : ""}`}
          />
          <AiAssistantCard />
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-12">
        <div className="lg:col-span-8">
          <DepartmentTable items={byDepartment} />
        </div>
        <div className="space-y-4 lg:col-span-4">
          <PendingApprovals leaves={pending.leaves} corrections={pending.corrections} />
          <RecentHires items={recentHires} />
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-12">
        <div className="lg:col-span-4">
          <LateComersCard items={insights.topLateComers} />
        </div>
        <div className="lg:col-span-4">
          <LeaveByTypeCard items={insights.leaveByType} />
        </div>
        <div className="lg:col-span-4">
          <PayrollByDeptCard items={insights.payrollByDepartment} />
        </div>
      </div>

      {isAdmin ? <AuditFeedCard items={auditFeed} canViewAll /> : null}
    </div>
  );
}

// ------------------------------------------------------------ employee view

async function EmployeeDashboardView({ user }: { user: SessionUser }) {
  const data = employeeDashboard(user);

  return (
    <div className="space-y-4">
      {data.me.employeeId === null ? (
        <Card>
          <CardContent className="p-4">
            <EmptyState
              title="Your login isn't linked to an employee profile"
              description="Ask HR to connect your account to an employee record to see personal attendance, leave and payslips here."
            />
          </CardContent>
        </Card>
      ) : null}

      <EmployeeKpiGrid me={data.me} />

      <div className="grid gap-4 lg:grid-cols-12">
        <div className="lg:col-span-7">
          <LeaveBalanceBars items={data.leaveBalances} />
        </div>
        <div className="lg:col-span-5">
          <EmployeeQuickCards data={data} />
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-12">
        <div className="lg:col-span-7">
          <AnnouncementsCard />
        </div>
      </div>
    </div>
  );
}

// --------------------------------------------------------------- shared bits

function AnnouncementsCard() {
  const latestAnnouncements = listAnnouncements(3);
  return (
    <Card className="border-border">
      <CardHeader className="flex flex-row items-start justify-between gap-3 border-b border-border pb-3">
        <div className="min-w-0">
          <CardTitle className="flex items-center gap-2 text-sm">
            <MegaphoneIcon className="size-4 shrink-0 text-primary/80" />
            Announcements
          </CardTitle>
          <CardDescription className="mt-1 text-xs">
            Company-wide updates.
          </CardDescription>
        </div>
        <Link
          href="/announcements"
          className="group inline-flex shrink-0 items-center gap-1 rounded-full border border-border px-2 py-0.5 text-[11px] font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
        >
          View all
          <ArrowUpRightIcon className="size-3 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
        </Link>
      </CardHeader>

      <CardContent className="space-y-1.5">
        {latestAnnouncements.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border bg-muted/20 px-4 py-6 text-center">
            <span className="mx-auto flex size-9 items-center justify-center rounded-full border border-border bg-background text-muted-foreground">
              <MegaphoneIcon className="size-4" />
            </span>
            <p className="mt-3 text-sm font-medium">Nothing posted yet</p>
            <p className="mx-auto mt-1 max-w-[17rem] text-xs leading-relaxed text-muted-foreground">
              Company updates from your Admin or HR team will appear here.
            </p>
          </div>
        ) : (
          latestAnnouncements.map((announcement) => (
            <div
              key={announcement.id}
              className={cn(
                "relative rounded-lg border px-3 py-2.5 transition-colors",
                announcement.pinned
                  ? "border-border bg-muted/50 pl-3.5"
                  : "border-transparent hover:bg-muted/30",
              )}
            >
              {announcement.pinned ? (
                <span
                  aria-hidden="true"
                  className="absolute inset-y-2.5 left-0 w-[3px] rounded-r-full bg-primary"
                />
              ) : null}

              <div className="flex items-start justify-between gap-2">
                <p className="text-sm leading-snug font-medium break-words">
                  {announcement.title}
                </p>
                {announcement.pinned ? (
                  <PinIcon
                    aria-hidden="true"
                    className="mt-0.5 size-3 shrink-0 text-primary"
                  />
                ) : null}
              </div>

              <p className="mt-1 line-clamp-2 text-xs leading-relaxed break-words text-muted-foreground">
                {announcement.body}
              </p>

              <div className="mt-2 flex min-w-0 items-center gap-1.5 text-[11px] text-muted-foreground">
                <span
                  aria-hidden="true"
                  className="flex size-4 shrink-0 items-center justify-center rounded-full bg-muted text-[9px] font-semibold uppercase"
                >
                  {announcement.authorName.slice(0, 1)}
                </span>
                <span className="truncate">{announcement.authorName}</span>
                <span aria-hidden="true" className="h-1 w-1 shrink-0 rounded-full bg-border" />
                <span className="shrink-0">{relativeTime(announcement.createdAt)}</span>
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}

function AiAssistantCard() {
  return (
    <Card className="border-border">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm">
          <span
            aria-hidden="true"
            className="flex size-5 items-center justify-center rounded-md bg-primary/10 text-[11px] leading-none text-primary"
          >
            ✦
          </span>
          AI assistant
        </CardTitle>
        <CardDescription className="mt-1 text-xs">
          Ask in plain language — answers are built live from your HR, attendance, leave
          and payroll records.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-3 pt-0">
        <ul className="space-y-2 text-sm text-muted-foreground">
          <li className="flex items-start gap-2">
            <span aria-hidden="true" className="mt-1 text-xs text-primary">
              •
            </span>
            <span>Headcount, late arrivals, leave balances and payroll totals</span>
          </li>
          <li className="flex items-start gap-2">
            <span aria-hidden="true" className="mt-1 text-xs text-primary">
              •
            </span>
            <span>A sentence becomes a pre-filled leave request</span>
          </li>
          <li className="flex items-start gap-2">
            <span aria-hidden="true" className="mt-1 text-xs text-primary">
              •
            </span>
            <span>Role-scoped — employees only see their own records</span>
          </li>
        </ul>

        <Link
          href="/ai"
          className={cn(buttonVariants({ size: "sm" }), "w-full gap-1.5")}
        >
          Ask the assistant
          <ArrowRightIcon className="size-3.5" />
        </Link>
      </CardContent>

      <CardFooter>
        <span className="text-[10px] tracking-wider text-muted-foreground uppercase">
          AI-generated answers are labelled
        </span>
      </CardFooter>
    </Card>
  );
}
