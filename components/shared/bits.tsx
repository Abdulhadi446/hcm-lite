import { cn } from "@/lib/utils";
import { initials } from "./format";

/** Small person chip used across tables and cards. */
export function PersonCell({
  name,
  code,
  meta,
  className,
}: {
  name: string;
  code?: string | null;
  meta?: React.ReactNode;
  className?: string;
}) {
  const label = name?.trim() || "Unknown employee";
  return (
    <div className={cn("flex min-w-0 items-center gap-2.5", className)}>
      <span
        aria-hidden
        className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-semibold uppercase text-muted-foreground"
      >
        {initials(label)}
      </span>
      <div className="min-w-0 leading-tight">
        <p className="truncate text-sm font-medium">{label}</p>
        <p className="truncate text-[11px] text-muted-foreground">
          {code ?? meta ?? ""}
          {code && meta ? <span className="mx-1 text-border">·</span> : null}
          {code ? meta : null}
        </p>
      </div>
    </div>
  );
}

/** Compact stat tile with an optional accent dot. */
export function StatTile({
  label,
  value,
  note,
  dot,
  className,
}: {
  label: string;
  value: React.ReactNode;
  note?: React.ReactNode;
  dot?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex h-full flex-col rounded-xl border border-border bg-card p-3",
        className,
      )}
    >
      <div className="flex items-center gap-1.5">
        {dot ? <span className={cn("size-1.5 rounded-full", dot)} aria-hidden /> : null}
        <p className="text-xs text-muted-foreground">{label}</p>
      </div>
      <div className="mt-1 text-2xl font-semibold tracking-tight tabular-nums">{value}</div>
      {note ? (
        <p className="mt-auto pt-2 text-[11px] text-muted-foreground">{note}</p>
      ) : null}
    </div>
  );
}
