import { MedalIcon } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/page-header";
import type { LateComerRow } from "./types";

/** Top 5 late-comers for the selected window. */
export function LateComersCard({ items }: { items: LateComerRow[] }) {
  const rows = items.slice(0, 5);
  return (
    <Card>
      <CardHeader className="border-b border-border pb-3">
        <CardTitle className="flex items-center gap-2 text-sm">
          <MedalIcon className="size-4" />
          Top late-comers
        </CardTitle>
      </CardHeader>
      {rows.length === 0 ? (
        <CardContent className="p-4">
          <EmptyState
            title="No late arrivals in this range"
            description="Late check-ins show up here, ranked by count."
          />
        </CardContent>
      ) : (
        <CardContent className="divide-y divide-border p-0">
          {rows.map((item, index) => {
            const initials = item.name
              .split(/\s+/)
              .map((part) => part.charAt(0))
              .join("")
              .slice(0, 2)
              .toUpperCase();
            return (
              <div key={item.employeeId} className="flex items-center gap-3 px-4 py-2.5">
                <span className="w-5 shrink-0 text-xs font-medium text-muted-foreground tabular-nums">
                  {index + 1}
                </span>
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-semibold">
                  {initials || "—"}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{item.name}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {item.code}
                    {item.departmentName ? ` · ${item.departmentName}` : ""}
                  </p>
                </div>
                <span className="shrink-0 text-sm font-semibold tabular-nums">
                  {item.lateDays} {item.lateDays === 1 ? "day" : "days"}
                </span>
              </div>
            );
          })}
        </CardContent>
      )}
    </Card>
  );
}
