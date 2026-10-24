import { format, isValid, parseISO } from "date-fns";

function toDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const date = value.length === 10 ? parseISO(value) : new Date(value);
  return isValid(date) ? date : null;
}

/** Wall-clock time from an ISO timestamp, e.g. "09:12". */
export function formatTime(value: string | null | undefined) {
  const date = toDate(value);
  return date ? format(date, "HH:mm") : "—";
}

export function formatClock(date: Date) {
  return format(date, "HH:mm:ss");
}

export function formatDuration(minutes: number | null | undefined) {
  if (minutes == null || Number.isNaN(minutes) || minutes < 0) return "—";
  const total = Math.round(minutes);
  const hours = Math.floor(total / 60);
  const rest = total % 60;
  if (hours === 0) return `${rest}m`;
  return `${hours}h ${String(rest).padStart(2, "0")}m`;
}

export function formatDate(value: string | null | undefined) {
  const date = toDate(value);
  return date ? format(date, "d MMM yyyy") : "—";
}

export function formatDayLabel(value: string) {
  const date = toDate(value);
  return date ? format(date, "EEE, d MMM yyyy") : value;
}

export function formatDateRange(start: string, end: string) {
  if (!start && !end) return "—";
  if (!end || start === end) return formatDate(start);
  return `${formatDate(start)} – ${formatDate(end)}`;
}

/** "2026-10" -> "October 2026". */
export function formatMonth(month: string | null | undefined) {
  if (!month) return "—";
  const date = parseISO(`${month.slice(0, 7)}-01`);
  return isValid(date) ? format(date, "MMMM yyyy") : month;
}

export function formatMonthShort(month: string | null | undefined) {
  if (!month) return "—";
  const date = parseISO(`${month.slice(0, 7)}-01`);
  return isValid(date) ? format(date, "MMM yyyy") : month;
}

/** Today as YYYY-MM-DD in the browser's timezone. */
export function todayLocal() {
  return format(new Date(), "yyyy-MM-dd");
}

export function initials(name: string | null | undefined) {
  if (!name) return "?";
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.slice(0, 1).toUpperCase())
    .join("");
}

const money = new Intl.NumberFormat(undefined, {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatMoney(value: number | null | undefined) {
  if (value == null || Number.isNaN(value)) return "—";
  return money.format(value);
}
