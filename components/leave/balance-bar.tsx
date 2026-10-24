import { cn } from "@/lib/utils";

/** Used (primary) + pending (amber) days against a quota. */
export function BalanceBar({
  quota,
  used,
  pending,
  className,
}: {
  quota: number;
  used: number;
  pending: number;
  className?: string;
}) {
  const usedPercent = quota > 0 ? Math.min(100, (used / quota) * 100) : 0;
  const pendingPercent = quota > 0 ? Math.min(100 - usedPercent, (pending / quota) * 100) : 0;

  return (
    <div className={cn("flex h-1.5 w-full overflow-hidden rounded-full bg-muted", className)}>
      {quota > 0 ? (
        <>
          <div className="h-full bg-primary" style={{ width: `${usedPercent}%` }} />
          <div className="h-full bg-amber-400" style={{ width: `${pendingPercent}%` }} />
        </>
      ) : null}
    </div>
  );
}
