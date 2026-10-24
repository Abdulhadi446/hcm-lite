import {
  CalendarCheck2Icon,
  TimerIcon,
  UserMinusIcon,
} from "lucide-react";

import type { EmployeeDashboard } from "./types";

function PersonalCard({
  label,
  value,
  note,
  icon,
  tone = "text-muted-foreground/70",
}: {
  label: string;
  value: string;
  note: string;
  icon: React.ReactNode;
  tone?: string;
}) {
  return (
    <div className="min-w-0 rounded-xl border border-border bg-card p-3">
      <div className="flex items-center justify-between gap-1.5">
        <p className="truncate text-xs text-muted-foreground">{label}</p>
        <span className={tone} aria-hidden>
          {icon}
        </span>
      </div>
      <p className="mt-1 truncate text-xl font-semibold tracking-tight tabular-nums sm:text-2xl">
        {value}
      </p>
      <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-muted-foreground">{note}</p>
    </div>
  );
}

/** Personal KPI cards for the employee dashboard. */
export function EmployeeKpiGrid({ me }: { me: EmployeeDashboard["me"] }) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <PersonalCard
        label="Attendance rate"
        value={`${me.attendanceRate}%`}
        note={`${me.workingDays} working days so far`}
        icon={<CalendarCheck2Icon className="size-3.5" />}
        tone="text-emerald-600 dark:text-emerald-400"
      />
      <PersonalCard
        label="Days present"
        value={String(me.presentDays)}
        note={`${me.onLeaveDays} approved leave day${me.onLeaveDays === 1 ? "" : "s"}`}
        icon={<CalendarCheck2Icon className="size-3.5" />}
      />
      <PersonalCard
        label="Late arrivals"
        value={String(me.lateDays)}
        note={`${me.halfDays} half day${me.halfDays === 1 ? "" : "s"} recorded`}
        icon={<TimerIcon className="size-3.5" />}
        tone="text-amber-600 dark:text-amber-400"
      />
      <PersonalCard
        label="Absent days"
        value={String(me.absentDays)}
        note="No check-in and no approved leave"
        icon={<UserMinusIcon className="size-3.5" />}
        tone="text-rose-600 dark:text-rose-400"
      />
    </div>
  );
}
