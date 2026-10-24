import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  ATTENDANCE_STATUS_LABELS,
  ATTENDANCE_STATUS_STYLES,
  type AttendanceStatus,
} from "./types";

export function AttendanceStatusBadge({
  status,
  className,
}: {
  status: AttendanceStatus | string;
  className?: string;
}) {
  const key = (status in ATTENDANCE_STATUS_STYLES ? status : "absent") as AttendanceStatus;
  const style = ATTENDANCE_STATUS_STYLES[key];

  return (
    <Badge variant="outline" className={cn("gap-1.5 font-medium", style.badge, className)}>
      <span className={cn("size-1.5 rounded-full", style.dot)} aria-hidden />
      {ATTENDANCE_STATUS_LABELS[key]}
    </Badge>
  );
}
