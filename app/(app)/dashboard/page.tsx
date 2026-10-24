import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { AttendanceTrendChart } from "@/components/attendance-trend-chart"
import { connection } from "next/server"
import { getSessionUser } from "@/lib/auth"
import { ClockIcon, MegaphoneIcon, UsersIcon } from "lucide-react"

type Role = "admin" | "hr" | "employee"

const KPIS_BY_ROLE: Record<Role, { label: string; value: string; note: string }[]> = {
  admin: [
    { label: "Headcount", value: "0", note: "Live in M2–M6" },
    { label: "Attrition YTD", value: "—", note: "Live in M2–M6" },
    { label: "Payroll cost", value: "0", note: "Live in M2–M6" },
    { label: "Avg salary", value: "—", note: "Live in M2–M6" },
  ],
  hr: [
    { label: "Headcount", value: "0", note: "Live in M2–M6" },
    { label: "Present today", value: "0", note: "Live in M2–M6" },
    { label: "On leave", value: "0", note: "Live in M2–M6" },
    { label: "Pending approvals", value: "0", note: "Live in M2–M6" },
  ],
  employee: [
    { label: "Hours this week", value: "0", note: "Live in M2–M6" },
    { label: "Late count", value: "0", note: "Live in M2–M6" },
    { label: "Leave balance", value: "0", note: "Live in M2–M6" },
    { label: "Last payslip", value: "—", note: "Live in M2–M6" },
  ],
}

function greeting() {
  const h = new Date().getHours()
  if (h < 12) return "Good morning"
  if (h < 17) return "Good afternoon"
  return "Good evening"
}

export default async function DashboardPage() {
  await connection()
  const user = await getSessionUser()
  const role = (user?.role ?? "employee") as Role
  const kpis = KPIS_BY_ROLE[role]
  const today = new Date().toLocaleDateString(undefined, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  })


  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="mt-1 flex items-start gap-1.5 text-sm text-muted-foreground">
            <ClockIcon className="mt-0.5 size-4 shrink-0" />
            {greeting()}, today is {today}
          </p>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {kpis.map((kpi, i) => (
          <Card key={i} className="border-border">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2.5">
              <CardTitle className="text-sm font-medium">{kpi.label}</CardTitle>
              <CardTitle className="text-2xl font-bold">{kpi.value}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">{kpi.note}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 md:grid-cols-12">
        {/* Attendance trend */}
        <div className="md:col-span-7 lg:col-span-8">
          <Card className="border-border">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <UsersIcon className="size-4" />
                Attendance trend
              </CardTitle>
              <CardDescription className="text-xs">No check-in data yet.</CardDescription>
            </CardHeader>
            <CardContent className="pt-0">
              <AttendanceTrendChart />
              <p className="text-xs text-muted-foreground mt-3">Flat series — check-ins begin in M4.</p>
            </CardContent>
          </Card>
        </div>

        {/* Announcements */}
        <div className="md:col-span-5 lg:col-span-4">
          <Card className="border-border">
            <CardHeader>
              <CardTitle>Announcements</CardTitle>
              <CardDescription>Company-wide updates appear here.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="rounded-lg border border-dashed border-border px-4 py-6 text-center">
                <MegaphoneIcon className="mx-auto size-5 text-muted-foreground" />
                <p className="mt-2 text-sm font-medium">No announcements yet</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Admins and HR will post company updates here.
                </p>
              </div>
            </CardContent>
          </Card>

          {/* AI assistant teaser */}
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
                  <span>Policy Q&A from your records</span>
                </div>
              </div>
            </CardContent>
            <CardFooter>
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground">AI-generated answers are labelled</span>
            </CardFooter>
          </Card>
        </div>
      </div>
    </div>
  )
}
