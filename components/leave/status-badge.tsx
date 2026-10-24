import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  LEAVE_STATUS_LABELS,
  LEAVE_STATUS_STYLES,
  type LeaveStatus,
} from "./types";

export function LeaveStatusBadge({
  status,
  className,
}: {
  status: LeaveStatus | string;
  className?: string;
}) {
  const key = (status in LEAVE_STATUS_STYLES ? status : "pending") as LeaveStatus;
  return (
    <Badge variant="outline" className={cn("font-medium", LEAVE_STATUS_STYLES[key], className)}>
      {LEAVE_STATUS_LABELS[key]}
    </Badge>
  );
}
