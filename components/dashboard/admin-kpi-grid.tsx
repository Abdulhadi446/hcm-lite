import {
  CalendarCheck2Icon,
  PalmtreeIcon,
  TimerIcon,
  UserMinusIcon,
  UsersIcon,
  WalletIcon,
} from "lucide-react";

import { formatMoney } from "@/components/shared/format";
import type { DashboardKpis, TodaySnapshot } from "./types";

function KpiCard({
  label,
  value,
  note,
  icon,
  tone = "text-muted-foreground/70",
  title,
}: {
  label: string;
  value: string;
  note: string;
  icon: React.ReactNode;
  tone?: string;
  title?: string;
}) {
  return (
    <div className="min-w-0 rounded-xl border border-border bg-card p-3">
      <div className="flex items-center justify-between gap-1.5">
        <p className="truncate text-xs text-muted-foreground">{label}</p>
        <span className={tone} aria-hidden>
          {icon}
        </span>
      </div>
      <p
        className="mt-1 truncate text-xl font-semibold tracking-tight tabular-nums sm:text-2xl"
        title={title ?? value}
      >
        {value}
      </p>
      <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-muted-foreground">{note}</p>
    </div>
  );
}

/** The six Admin/HR KPI cards; every number arrives pre-computed from analytics. */
export function AdminKpiGrid({
  kpis,
  today,
}: {
  kpis: DashboardKpis;
  today: TodaySnapshot;
}) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
      <KpiCard
        label="Headcount"
        value={String(kpis.headcount)}
        note={
          kpis.newHires > 0
            ? `+${kpis.newHires} joined · ${kpis.avgTenureMonths} mo avg tenure`
            : `${kpis.avgTenureMonths} mo avg tenure`
        }
        icon={<UsersIcon className="size-3.5" />}
      />
      <KpiCard
        label="Attendance rate"
        value={`${kpis.attendanceRate}%`}
        note={`${kpis.attendedDays} of ${kpis.expectedDays} expected days`}
        icon={<CalendarCheck2Icon className="size-3.5" />}
        tone="text-emerald-600 dark:text-emerald-400"
      />
      <KpiCard
        label={today.isWorkingDay ? "Absent today" : "Absent today (off)"}
        value={String(today.absent)}
        note={
          today.isWorkingDay
            ? `of ${today.headcount} in · ${kpis.absenteeismRate}% this period`
            : "Weekend / holiday — no absences"
        }
        icon={<UserMinusIcon className="size-3.5" />}
        tone="text-rose-600 dark:text-rose-400"
      />
      <KpiCard
        label="Late %"
        value={`${kpis.latePct}%`}
        note={`${kpis.lateDays} late arrival${kpis.lateDays === 1 ? "" : "s"}`}
        icon={<TimerIcon className="size-3.5" />}
        tone="text-amber-600 dark:text-amber-400"
      />
      <KpiCard
        label="On leave today"
        value={String(today.onLeave)}
        note={`${kpis.pendingLeaves} request${kpis.pendingLeaves === 1 ? "" : "s"} pending`}
        icon={<PalmtreeIcon className="size-3.5" />}
        tone="text-violet-600 dark:text-violet-400"
      />
      <KpiCard
        label="Payroll cost"
        value={formatMoney(kpis.payrollCost)}
        title={formatMoney(kpis.payrollCost)}
        note={`${kpis.payrollHasDraft ? "Includes draft" : "Finalized"} · ${kpis.payrollLabel}`}
        icon={<WalletIcon className="size-3.5" />}
      />
    </div>
  );
}
