export type AttendanceStatus =
  | "present"
  | "late"
  | "half_day"
  | "missing_checkout"
  | "absent"
  | "on_leave"
  | "weekend"
  | "holiday"
  | "upcoming";

export type BoardRow = {
  employeeId: number;
  code: string;
  fullName: string;
  departmentName: string | null;
  date: string;
  status: AttendanceStatus;
  checkInAt: string | null;
  checkOutAt: string | null;
  leaveTypeName?: string | null;
};

export type AttendanceDay = {
  date: string;
  status: AttendanceStatus;
  checkInAt: string | null;
  checkOutAt: string | null;
  workedMinutes: number | null;
};

export type AttendanceSummary = {
  present: number;
  late: number;
  halfDay: number;
  absent: number;
  onLeave: number;
  missingCheckout: number;
  hoursThisWeek: number;
  lateThisMonth: number;
};

export type CorrectionStatus = "pending" | "approved" | "rejected";

export type Correction = {
  id: number;
  employeeId: number;
  employeeName?: string | null;
  employeeCode?: string | null;
  date: string;
  requestedCheckIn: string | null;
  requestedCheckOut: string | null;
  reason: string;
  status: CorrectionStatus;
  reviewComment?: string | null;
  createdAt: string;
};

export const ATTENDANCE_STATUSES: AttendanceStatus[] = [
  "present",
  "late",
  "half_day",
  "missing_checkout",
  "on_leave",
  "absent",
  "weekend",
  "holiday",
  "upcoming",
];

export const ATTENDANCE_STATUS_LABELS: Record<AttendanceStatus, string> = {
  present: "Present",
  late: "Late",
  half_day: "Half day",
  missing_checkout: "Missing checkout",
  absent: "Absent",
  on_leave: "On leave",
  weekend: "Weekend",
  holiday: "Holiday",
  upcoming: "Upcoming",
};

type StatusStyle = {
  badge: string;
  dot: string;
  cell: string;
};

const MUTED: StatusStyle = {
  badge: "border-border bg-muted text-muted-foreground",
  dot: "bg-muted-foreground/50",
  cell: "border-transparent bg-muted/50 text-muted-foreground",
};

export const ATTENDANCE_STATUS_STYLES: Record<AttendanceStatus, StatusStyle> = {
  present: {
    badge: "border-emerald-200 bg-emerald-50 text-emerald-700",
    dot: "bg-emerald-500",
    cell: "border-emerald-200 bg-emerald-50 text-emerald-800",
  },
  late: {
    badge: "border-amber-200 bg-amber-50 text-amber-700",
    dot: "bg-amber-500",
    cell: "border-amber-200 bg-amber-50 text-amber-800",
  },
  half_day: {
    badge: "border-sky-200 bg-sky-50 text-sky-700",
    dot: "bg-sky-500",
    cell: "border-sky-200 bg-sky-50 text-sky-800",
  },
  missing_checkout: {
    badge: "border-orange-200 bg-orange-50 text-orange-700",
    dot: "bg-orange-500",
    cell: "border-orange-200 bg-orange-50 text-orange-800",
  },
  on_leave: {
    badge: "border-violet-200 bg-violet-50 text-violet-700",
    dot: "bg-violet-500",
    cell: "border-violet-200 bg-violet-50 text-violet-800",
  },
  absent: {
    badge: "border-rose-200 bg-rose-50 text-rose-700",
    dot: "bg-rose-500",
    cell: "border-rose-200 bg-rose-50 text-rose-800",
  },
  weekend: MUTED,
  holiday: {
    badge: "border-indigo-200 bg-indigo-50 text-indigo-700",
    dot: "bg-indigo-400",
    cell: "border-indigo-200 bg-indigo-50 text-indigo-800",
  },
  upcoming: {
    badge: "border-border border-dashed bg-card text-muted-foreground",
    dot: "bg-muted-foreground/30",
    cell: "border-dashed border-border bg-card/60 text-muted-foreground",
  },
};

export const CORRECTION_STATUS_LABELS: Record<CorrectionStatus, string> = {
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
};

export const CORRECTION_STATUS_STYLES: Record<CorrectionStatus, string> = {
  pending: "border-amber-200 bg-amber-50 text-amber-700",
  approved: "border-emerald-200 bg-emerald-50 text-emerald-700",
  rejected: "border-rose-200 bg-rose-50 text-rose-700",
};

export function workedMinutes(checkInAt: string | null, checkOutAt: string | null) {
  if (!checkInAt || !checkOutAt) return null;
  const start = new Date(checkInAt).getTime();
  const end = new Date(checkOutAt).getTime();
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) return null;
  return Math.round((end - start) / 60000);
}

export function summarizeBoard(items: BoardRow[]): AttendanceSummary {
  const count = (status: AttendanceStatus) =>
    items.filter((row) => row.status === status).length;

  return {
    present: count("present"),
    late: count("late"),
    halfDay: count("half_day"),
    absent: count("absent"),
    onLeave: count("on_leave"),
    missingCheckout: count("missing_checkout"),
    hoursThisWeek: 0,
    lateThisMonth: 0,
  };
}

export function isLateTime(value: string | null | undefined, cutoff = "09:15") {
  if (!value) return false;
  return value.slice(0, 5) > cutoff;
}
