import { SparklesIcon } from "lucide-react";

import { cn } from "@/lib/utils";

/** The assistant's little identity tile — used in the card header and beside answers. */
export function AiMark({
  size = "md",
  className,
}: {
  size?: "sm" | "md";
  className?: string;
}) {
  return (
    <div
      aria-hidden
      className={cn(
        "relative grid shrink-0 place-items-center rounded-lg bg-gradient-to-br from-primary via-primary to-chart-4 text-primary-foreground shadow-sm ring-1 ring-primary/20",
        size === "sm" ? "size-7 rounded-[0.5rem]" : "size-9 rounded-lg",
        className,
      )}
    >
      <SparklesIcon className={size === "sm" ? "size-3.5" : "size-4"} strokeWidth={2.2} />
    </div>
  );
}
