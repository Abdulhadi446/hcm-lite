import { LockIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  RUN_STATUS_LABELS,
  RUN_STATUS_STYLES,
  type PayrollStatus,
} from "./types";

export function RunStatusBadge({
  status,
  className,
}: {
  status: PayrollStatus | string;
  className?: string;
}) {
  const key = (status in RUN_STATUS_STYLES ? status : "draft") as PayrollStatus;
  return (
    <Badge variant="outline" className={cn("gap-1 font-medium", RUN_STATUS_STYLES[key], className)}>
      {key === "finalized" ? <LockIcon className="size-3" /> : null}
      {RUN_STATUS_LABELS[key]}
    </Badge>
  );
}
