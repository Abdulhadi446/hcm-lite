import Link from "next/link";
import {
  CheckCircle2Icon,
  FileTextIcon,
  LogInIcon,
  PencilIcon,
  PlusIcon,
  ShieldCheckIcon,
  Trash2Icon,
} from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/page-header";
import { relativeTime } from "@/lib/relative-time";

export type AuditFeedItem = {
  id: number;
  action: string;
  entity: string;
  actorName: string | null;
  summary: string;
  createdAt: string;
};

function actionIcon(action: string) {
  const lower = action.toLowerCase();
  if (lower.includes("delete")) return Trash2Icon;
  if (lower.includes("create") || lower.includes("register")) return PlusIcon;
  if (lower.includes("update") || lower.includes("edit") || lower.includes("patch")) return PencilIcon;
  if (lower.includes("approve") || lower.includes("finalize")) return ShieldCheckIcon;
  if (lower.includes("login")) return LogInIcon;
  if (lower.includes("reject")) return Trash2Icon;
  return FileTextIcon;
}

function actionTone(action: string) {
  const lower = action.toLowerCase();
  if (lower.includes("delete") || lower.includes("reject")) return "text-rose-700 dark:text-rose-400";
  if (lower.includes("approve") || lower.includes("finalize")) return "text-emerald-700 dark:text-emerald-400";
  return "text-muted-foreground";
}

/** Compact audit trail feed for the Admin dashboard. */
export function AuditFeedCard({
  items,
  canViewAll = false,
}: {
  items: AuditFeedItem[];
  canViewAll?: boolean;
}) {
  const rows = items.slice(0, 8);
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between border-b border-border pb-3">
        <CardTitle className="text-sm">Recent audit activity</CardTitle>
        {canViewAll ? (
          <Link
            href="/audit"
            className="text-xs font-medium text-primary hover:underline"
          >
            View audit log →
          </Link>
        ) : null}
      </CardHeader>
      {rows.length === 0 ? (
        <CardContent className="p-4">
          <EmptyState
            title="No audit activity yet"
            description="Creates, updates, approvals and finalizations are recorded here."
          />
        </CardContent>
      ) : (
        <CardContent className="divide-y divide-border p-0">
          {rows.map((item) => {
            const Icon = actionIcon(item.action);
            return (
              <div key={item.id} className="flex items-start gap-3 px-4 py-2.5">
                <span className={`mt-0.5 shrink-0 ${actionTone(item.action)}`}>
                  <Icon className="size-3.5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm">{item.summary}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {item.actorName ?? "System"} · {relativeTime(item.createdAt)}
                  </p>
                </div>
              </div>
            );
          })}
        </CardContent>
      )}
    </Card>
  );
}
