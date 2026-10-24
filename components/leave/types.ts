import { eachDayOfInterval, isWeekend, isValid, parseISO } from "date-fns";

export type LeaveStatus = "pending" | "approved" | "rejected" | "cancelled";

export const LEAVE_STATUS_FILTERS = [
  "all",
  "pending",
  "approved",
  "rejected",
  "cancelled",
] as const;

export type LeaveStatusFilter = (typeof LEAVE_STATUS_FILTERS)[number];

/** Reads `?status=` safely; unknown values fall back to the pending queue. */
export function parseLeaveStatus(
  value: string | string[] | null | undefined,
): LeaveStatusFilter {
  const raw = Array.isArray(value) ? value[0] : value;
  return (LEAVE_STATUS_FILTERS as readonly string[]).includes(raw ?? "")
    ? (raw as LeaveStatusFilter)
    : "pending";
}

export type LeaveRequestRow = {
  id: number;
  employeeId: number;
  employeeName: string;
  departmentName?: string | null;
  leaveTypeName: string;
  startDate: string;
  endDate: string;
  days: number;
  reason: string | null;
  status: LeaveStatus;
  reviewComment?: string | null;
  createdAt: string;
};

export type LeaveBalance = {
  employeeId: number;
  leaveTypeId: number;
  typeName: string;
  quota: number;
  used: number;
  pending: number;
  remaining: number | null;
};

export type LeaveType = {
  id: number;
  name: string;
  quotaDays: number;
  paid: boolean;
};

export type EmployeeOption = {
  id: number;
  fullName: string;
  code: string;
  departmentName: string | null;
};

export const LEAVE_STATUS_LABELS: Record<LeaveStatus, string> = {
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
  cancelled: "Cancelled",
};

export const LEAVE_STATUS_STYLES: Record<LeaveStatus, string> = {
  pending: "border-amber-200 bg-amber-50 text-amber-700",
  approved: "border-emerald-200 bg-emerald-50 text-emerald-700",
  rejected: "border-rose-200 bg-rose-50 text-rose-700",
  cancelled: "border-border bg-muted text-muted-foreground",
};

/** Working days between two dates, weekends skipped (server also drops holidays). */
export function countWorkingDays(start: string, end: string) {
  if (!start || !end) return 0;
  const from = parseISO(start);
  const to = parseISO(end);
  if (!isValid(from) || !isValid(to) || from > to) return 0;
  const dates = eachDayOfInterval({ start: from, end: to });
  if (dates.length > 370) return 0;
  return dates.filter((date) => !isWeekend(date)).length;
}

export function balancePercent(quota: number, used: number) {
  if (!quota) return 0;
  return Math.max(0, Math.min(100, (used / quota) * 100));
}

export function canCancelRequest(request: LeaveRequestRow, today: string) {
  if (request.status === "pending") return true;
  return request.status === "approved" && request.startDate > today;
}
