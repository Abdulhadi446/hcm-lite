import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/page-header";
import type { LeaveTypeRow } from "./types";

/** Approved leave days vs entitlement, grouped by type. */
export function LeaveByTypeCard({ items }: { items: LeaveTypeRow[] }) {
  return (
    <Card>
      <CardHeader className="border-b border-border pb-3">
        <CardTitle className="text-sm">Leave by type</CardTitle>
      </CardHeader>
      {items.length === 0 ? (
        <CardContent className="p-4">
          <EmptyState
            title="No leave data"
            description="Approved leave by type will show up here."
          />
        </CardContent>
      ) : (
        <CardContent className="space-y-3 p-4">
          {items.map((item) => {
            const pct = item.entitlementDays > 0
              ? Math.min(100, (item.approvedDays / item.entitlementDays) * 100)
              : 0;
            return (
              <div key={item.leaveTypeId} className="space-y-1">
                <div className="flex items-center justify-between gap-2 text-sm">
                  <span className="truncate font-medium">{item.typeName}</span>
                  <span className="shrink-0 tabular-nums text-xs text-muted-foreground">
                    {item.approvedDays} / {item.entitlementDays} days
                  </span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{ width: `${pct.toFixed(0)}%` }}
                  />
                </div>
                <p className="text-right text-[11px] tabular-nums text-muted-foreground">
                  {item.utilization.toFixed(0)}% utilised
                </p>
              </div>
            );
          })}
        </CardContent>
      )}
    </Card>
  );
}
