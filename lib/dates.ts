/**
 * Date helpers shared by M1–M6 (and reusable outside HTTP).
 * All calendar dates are plain `YYYY-MM-DD` strings, interpreted in UTC so
 * weekend/holiday math never shifts across DST boundaries.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

const WEEKDAY_INDEX: Record<string, number> = {
  sun: 0,
  mon: 1,
  tue: 2,
  wed: 3,
  thu: 4,
  fri: 5,
  sat: 6,
};

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** Today's local calendar date as `YYYY-MM-DD`. */
export function todayIso(): string {
  const now = new Date();
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
}

/** Strict `YYYY-MM-DD` check that also rejects impossible dates (2026-02-30). */
export function isIsoDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const date = new Date(Date.UTC(y, m - 1, d));
  return (
    date.getUTCFullYear() === y &&
    date.getUTCMonth() === m - 1 &&
    date.getUTCDate() === d
  );
}

/** Epoch ms for an ISO date (caller must have validated it). */
export function isoToUtcMs(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

/** `YYYY-MM-DD` from epoch ms. */
export function utcMsToIso(ms: number): string {
  const date = new Date(ms);
  return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}`;
}

/** Parse `"sat,sun"` into weekday indexes. Ignores blanks/unknown tokens. */
export function parseWeekendDays(weekendDaysCsv: string): Set<number> {
  const set = new Set<number>();
  for (const raw of String(weekendDaysCsv || "").split(",")) {
    const key = raw.trim().toLowerCase();
    if (key in WEEKDAY_INDEX) set.add(WEEKDAY_INDEX[key]);
  }
  return set;
}

/**
 * Inclusive working-day count between two ISO dates.
 * Weekends (per `weekendDaysCsv`) and `holidayDates` are skipped.
 * Returns 0 when the range is invalid or start > end.
 */
export function workingDaysBetween(
  startIso: string,
  endIso: string,
  weekendDaysCsv: string,
  holidayDates: Iterable<string> = []
): number {
  if (!isIsoDate(startIso) || !isIsoDate(endIso)) return 0;
  const start = isoToUtcMs(startIso);
  const end = isoToUtcMs(endIso);
  if (start > end) return 0;

  const weekend = parseWeekendDays(weekendDaysCsv);
  const holidays = new Set(holidayDates instanceof Set ? holidayDates : Array.from(holidayDates));

  let count = 0;
  for (let ms = start; ms <= end; ms += DAY_MS) {
    const date = new Date(ms);
    if (weekend.has(date.getUTCDay())) continue;
    if (holidays.has(utcMsToIso(ms))) continue;
    count += 1;
  }
  return count;
}

/** `YYYY-MM` for a Date or an ISO date string. */
export function isoMonth(value: Date | string = new Date()): string {
  if (value instanceof Date) {
    return `${value.getUTCFullYear()}-${pad2(value.getUTCMonth() + 1)}`;
  }
  return String(value).slice(0, 7);
}

/** First/last ISO dates of a `YYYY-MM` month (clamped to 28/29/30/31). */
export function monthRange(monthIso: string): { start: string; end: string } {
  const [y, m] = monthIso.split("-").map(Number);
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return {
    start: `${monthIso}-01`,
    end: `${monthIso}-${pad2(lastDay)}`,
  };
}
