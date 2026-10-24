import { UserPlusIcon } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/page-header";
import { PersonCell } from "@/components/shared/bits";
import { formatDate } from "@/components/shared/format";
import type { RecentHire } from "./types";

/** Newest joiners in scope. */
export function RecentHires({ items }: { items: RecentHire[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <UserPlusIcon className="size-4" />
          Recent hires
        </CardTitle>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <EmptyState
            title="No hires yet"
            description="New employees will appear here as soon as they're added."
          />
        ) : (
          <ul className="space-y-3">
            {items.map((item) => (
              <li key={item.id} className="flex items-center justify-between gap-2">
                <PersonCell name={item.name} code={item.code} className="min-w-0" meta={item.departmentName ?? undefined} />
                <span className="shrink-0 text-[11px] text-muted-foreground">
                  {formatDate(item.joinDate)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
