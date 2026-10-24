import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { STATUS_LABELS, type EmployeeStatus } from "./types";

const SHELL: Record<EmployeeStatus, string> = {
  active: "border-emerald-200 bg-emerald-50 text-emerald-700",
  probation: "border-amber-200 bg-amber-50 text-amber-700",
  exited: "border-border bg-muted text-muted-foreground",
};

const DOT: Record<EmployeeStatus, string> = {
  active: "bg-emerald-500",
  probation: "bg-amber-500",
  exited: "bg-muted-foreground/60",
};

export function StatusBadge({
  status,
  className,
}: {
  status: EmployeeStatus;
  className?: string;
}) {
  const key: EmployeeStatus = SHELL[status] ? status : "exited";
  return (
    <Badge
      variant="outline"
      className={cn("gap-1.5 font-medium", SHELL[key], className)}
    >
      <span className={cn("size-1.5 rounded-full", DOT[key])} aria-hidden />
      {STATUS_LABELS[key]}
    </Badge>
  );
}
