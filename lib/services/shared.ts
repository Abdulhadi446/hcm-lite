import "server-only";
import { nowIso, queryAll, queryOne, run } from "@/lib/db";
import { ApiError } from "@/lib/guards";
import {
  isoToUtcMs,
  isIsoDate,
  monthRange,
  parseWeekendDays,
  todayIso,
} from "@/lib/dates";
import { getSettings, type Settings } from "./org";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Money-safe 2-decimal rounding. */
export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/** Sum helper used by run totals. */
export function sum(values: number[]): number {
  return round2(values.reduce((total, value) => total + value, 0));
}

export function holidaySet(): Set<string> {
  return new Set(
    queryAll<{ date: string }>("SELECT date FROM holidays").map((row) => row.date)
  );
}

export function isWeekendDate(dateIso: string, weekendDaysCsv: string): boolean {
  if (!isIsoDate(dateIso)) return false;
  const index = new Date(isoToUtcMs(dateIso)).getUTCDay();
  return parseWeekendDays(weekendDaysCsv).has(index);
}

/** All calendar dates between two ISO dates (inclusive). */
export function dateRange(startIso: string, endIso: string): string[] {
  if (!isIsoDate(startIso) || !isIsoDate(endIso)) return [];
  const start = isoToUtcMs(startIso);
  const end = isoToUtcMs(endIso);
  if (start > end) return [];
  const dates: string[] = [];
  for (let ms = start; ms <= end; ms += DAY_MS) {
    const date = new Date(ms);
    const y = date.getUTCFullYear();
    const m = String(date.getUTCMonth() + 1).padStart(2, "0");
    const d = String(date.getUTCDate()).padStart(2, "0");
    dates.push(`${y}-${m}-${d}`);
  }
  return dates;
}

/** Working dates (no weekends, no holidays) between two ISO dates. */
export function workingDates(
  startIso: string,
  endIso: string,
  settings: Settings,
  holidays: Set<string>
): string[] {
  return dateRange(startIso, endIso).filter(
    (date) => !isWeekendDate(date, settings.weekendDays) && !holidays.has(date)
  );
}

/** Working days in a whole `YYYY-MM` month. */
export function monthWorkingDates(month: string, settings: Settings, holidays: Set<string>): string[] {
  const { start, end } = monthRange(month);
  return workingDates(start, end, settings, holidays);
}

export function currentMonth(): string {
  return todayIso().slice(0, 7);
}

export function isMonthLocked(month: string): boolean {
  const row = queryOne<{ id: number }>(
    "SELECT id FROM payroll_runs WHERE month = ? AND status = 'finalized' LIMIT 1",
    month
  );
  return !!row;
}

/** 422 `day_locked` when a finalized payroll run owns the date's month. */
export function assertDayUnlocked(dateIso: string): void {
  if (isMonthLocked(dateIso.slice(0, 7))) {
    throw new ApiError(422, "day_locked");
  }
}

export function assertMonthUnlocked(month: string): void {
  if (isMonthLocked(month)) {
    throw new ApiError(422, "day_locked");
  }
}

/** Insert an in-app notification; never breaks the business mutation. */
export function notify(userId: number | null, title: string, body: string): void {
  if (userId === null || !Number.isFinite(userId)) return;
  try {
    run(
      "INSERT INTO notifications (user_id, title, body, read_at, created_at) VALUES (?, ?, ?, NULL, ?)",
      userId,
      title,
      body,
      nowIso()
    );
  } catch (err) {
    console.error("[notify] failed to write notification:", err);
  }
}

/** Login account linked to an employee, if any. */
export function userForEmployee(employeeId: number): number | null {
  const row = queryOne<{ id: number }>(
    "SELECT id FROM users WHERE employee_id = ? ORDER BY active DESC, id ASC LIMIT 1",
    employeeId
  );
  return row ? Number(row.id) : null;
}

/** "HH:MM" -> minutes since midnight. Returns null when malformed. */
export function parseHhMm(value: string): number | null {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(String(value ?? "").trim());
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

/** Combine a `YYYY-MM-DD` date and `HH:MM` local time into an ISO timestamp. */
export function combineLocalDateTime(dateIso: string, hhmm: string): string {
  const [y, m, d] = dateIso.split("-").map(Number);
  const [hh, mm] = hhmm.split(":").map(Number);
  return new Date(y, m - 1, d, hh, mm, 0, 0).toISOString();
}

/** Local time-of-day minutes for a stored ISO timestamp. */
export function localMinutesOfDay(iso: string): number {
  const date = new Date(iso);
  return date.getHours() * 60 + date.getMinutes();
}

/** Whole minutes between two ISO timestamps (null when either is missing). */
export function minutesBetween(startIso: string | null, endIso: string | null): number | null {
  if (!startIso || !endIso) return null;
  const start = Date.parse(startIso);
  const end = Date.parse(endIso);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return null;
  return Math.round((end - start) / 60000);
}

/** Monday of the current local week as `YYYY-MM-DD`. */
export function weekStartIso(): string {
  const today = todayIso();
  const weekday = new Date(isoToUtcMs(today)).getUTCDay(); // 0 = Sunday
  const offset = weekday === 0 ? 6 : weekday - 1;
  return new Date(isoToUtcMs(today) - offset * DAY_MS).toISOString().slice(0, 10);
}

export function settingsOrThrow(): Settings {
  return getSettings();
}
