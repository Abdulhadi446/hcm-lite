import { Suspense } from "react";
import { connection } from "next/server";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState, PageHeader } from "@/components/page-header";
import { ClockIcon, LineChartIcon, MegaphoneIcon, PinIcon } from "lucide-react";

import { getSessionUser, type SessionUser } from "@/lib/auth";
import { isIsoDate, monthRange, todayIso } from "@/lib/dates";
import { relativeTime } from "@/lib/relative-time";
import { computeMetrics, employeeDashboard } from "@/lib/services/analytics";
import { listAnnouncements } from "@/lib/services/comms";
import { listDepartments } from "@/lib/services/org";
import { AdminKpiGrid } from "@/components/dashboard/admin-kpi-grid";
import { DashboardFilters } from "@/components/dashboard/dashboard-filters";
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

  const todayLabel = new Date().toLocaleDateString(undefined, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const header = (
    <PageHeader
      title="Dashboard"
      description={`${greeting()}, today is ${todayLabel}`}
      actions={
        <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1 text-xs text-muted-foreground">
          <ClockIcon className="size-3.5" />
          {user.role === "employee" ? "Your records" : "Company overview"}
        </span>
      }
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
}: {
  from: string;
  to: string;
  departmentId: number | null;
  canRegisterEmployees: boolean;
}) {
  const summary = computeMetrics({ from, to, departmentId });
  const { kpis, today, trend, byDepartment, pending, recentHires } = summary;
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
          <AiTeaserCard />
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
      <CardHeader>
        <CardTitle>Announcements</CardTitle>
        <CardDescription>Latest company-wide updates.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {latestAnnouncements.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border px-4 py-6 text-center">
            <MegaphoneIcon className="mx-auto size-5 text-muted-foreground" />
            <p className="mt-2 text-sm font-medium">No announcements yet</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Admins and HR will post company updates here.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {latestAnnouncements.map((announcement) => (
              <div
                key={announcement.id}
                className="space-y-1 border-b border-border pb-3 last:border-0 last:pb-0"
              >
                <div className="flex items-start gap-1.5">
                  {announcement.pinned ? (
                    <PinIcon className="mt-0.5 size-3 shrink-0 text-primary" />
                  ) : null}
                  <p className="break-words text-sm font-medium">{announcement.title}</p>
                </div>
                <p className="line-clamp-2 break-words text-xs text-muted-foreground">
                  {announcement.body}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  {announcement.authorName} · {relativeTime(announcement.createdAt)}
                </p>
              </div>
            ))}
          </div>
        )}
        <Link
          href="/announcements"
          className="inline-block text-xs font-medium text-primary underline-offset-4 hover:underline"
        >
          View all announcements
        </Link>
      </CardContent>
    </Card>
  );
}

function AiTeaserCard() {
  return (
    <Card className="border-border">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-sm bg-primary/10 text-primary">✦</span>
          AI assistant
        </CardTitle>
        <CardDescription>Ask about your data. Coming in M7–M8.</CardDescription>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="flex flex-col gap-2 text-sm text-muted-foreground">
          <div className="flex items-start gap-2">
            <span className="mt-1 text-xs text-primary">•</span>
            <span>Dashboard summaries from live data</span>
          </div>
          <div className="flex items-start gap-2">
            <span className="mt-1 text-xs text-primary">•</span>
            <span>Smart leave: sentence → pre-filled form</span>
          </div>
          <div className="flex items-start gap-2">
            <span className="mt-1 text-xs text-primary">•</span>
            <span>Policy Q&amp;A from your records</span>
          </div>
        </div>
      </CardContent>
      <CardFooter>
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">AI-generated answers are labelled</span>
      </CardFooter>
    </Card>
  );
}
