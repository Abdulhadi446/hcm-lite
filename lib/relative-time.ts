/**
 * Short relative timestamp ("just now", "4m ago", "2d ago"), falling back to a
 * local date for anything older than a month. Safe in server and client code.
 */
export function relativeTime(value: string | Date, now: number = Date.now()): string {
  const ms = value instanceof Date ? value.getTime() : Date.parse(value);
  if (!Number.isFinite(ms)) return "";

  const diff = now - ms;
  const future = diff < 0;
  const abs = Math.abs(diff);

  if (abs < 45_000) return "just now";

  const units: { limit: number; div: number; suffix: string }[] = [
    { limit: 60 * 60_000, div: 60_000, suffix: "m" },
    { limit: 24 * 60 * 60_000, div: 60 * 60_000, suffix: "h" },
    { limit: 7 * 24 * 60 * 60_000, div: 24 * 60 * 60_000, suffix: "d" },
    { limit: 30 * 24 * 60 * 60_000, div: 7 * 24 * 60 * 60_000, suffix: "w" },
  ];

  for (const unit of units) {
    if (abs < unit.limit) {
      const count = Math.max(1, Math.round(abs / unit.div));
      return future ? `in ${count}${unit.suffix}` : `${count}${unit.suffix} ago`;
    }
  }

  const date = new Date(ms);
  return date.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: date.getFullYear() === new Date(now).getFullYear() ? undefined : "numeric",
  });
}
