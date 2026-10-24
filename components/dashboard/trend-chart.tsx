"use client";

import { format, parseISO } from "date-fns";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import type { TrendPoint } from "./types";

const COLORS = {
  present: "#10b981",
  late: "#f59e0b",
  absent: "#f43f5e",
};

function TooltipCard({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ dataKey?: string | number; value?: number }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  const value = (key: string) =>
    payload.find((entry) => entry.dataKey === key)?.value ?? 0;
  return (
    <div className="rounded-md border border-border bg-popover px-2.5 py-2 text-xs text-popover-foreground shadow-sm">
      <p className="font-medium">{label}</p>
      <p className="mt-1 flex items-center gap-1.5 text-muted-foreground">
        <span className="size-1.5 rounded-full" style={{ background: COLORS.present }} />
        Present {value("present")}
      </p>
      <p className="flex items-center gap-1.5 text-muted-foreground">
        <span className="size-1.5 rounded-full" style={{ background: COLORS.late }} />
        Late {value("late")}
      </p>
      <p className="flex items-center gap-1.5 text-muted-foreground">
        <span className="size-1.5 rounded-full" style={{ background: COLORS.absent }} />
        Absent {value("absent")}
      </p>
    </div>
  );
}

/** Stacked per-day attendance trend. Data comes from /api/dashboard/summary. */
export function DashboardTrendChart({ data }: { data: TrendPoint[] }) {
  const rows = data.map((point) => ({
    label: format(parseISO(point.date), "d MMM"),
    present: point.present,
    late: point.late,
    absent: point.absent,
  }));

  return (
    <div className="w-full">
      <div className="mb-2 flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
        {(
          [
            ["Present", COLORS.present],
            ["Late", COLORS.late],
            ["Absent", COLORS.absent],
          ] as const
        ).map(([label, color]) => (
          <span key={label} className="flex items-center gap-1.5">
            <span className="size-1.5 rounded-full" style={{ background: color }} />
            {label}
          </span>
        ))}
      </div>
      <div className="h-56 w-full sm:h-64">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={rows} margin={{ top: 4, right: 4, left: -22, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
            <XAxis
              dataKey="label"
              tickLine={false}
              axisLine={false}
              minTickGap={28}
              interval="preserveStartEnd"
              tick={{ fill: "var(--muted-foreground)", fontSize: 10 }}
            />
            <YAxis
              allowDecimals={false}
              tickLine={false}
              axisLine={false}
              width={36}
              tick={{ fill: "var(--muted-foreground)", fontSize: 10 }}
            />
            <Tooltip content={<TooltipCard />} cursor={{ stroke: "var(--border)" }} />
            <Area
              type="monotone"
              dataKey="present"
              stackId="1"
              stroke={COLORS.present}
              fill={COLORS.present}
              fillOpacity={0.18}
              strokeWidth={2}
              isAnimationActive={false}
            />
            <Area
              type="monotone"
              dataKey="late"
              stackId="1"
              stroke={COLORS.late}
              fill={COLORS.late}
              fillOpacity={0.2}
              strokeWidth={2}
              isAnimationActive={false}
            />
            <Area
              type="monotone"
              dataKey="absent"
              stackId="1"
              stroke={COLORS.absent}
              fill={COLORS.absent}
              fillOpacity={0.12}
              strokeWidth={2}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
