import { SparklesIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

/** M7 placeholder — the AI call itself is out of scope for this milestone. */
export function SmartLeaveBox() {
  return (
    <Card className="border border-dashed border-border bg-muted/20 ring-0">
      <CardContent className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center">
        <div className="flex min-w-0 flex-1 items-start gap-2.5">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <SparklesIcon className="size-4" />
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <p className="text-sm font-medium">Describe your leave</p>
              <Badge variant="outline" className="border-primary/30 bg-primary/10 text-primary">
                AI
              </Badge>
            </div>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              Coming soon — say “two days off next week” and we&apos;ll fill the form for you.
            </p>
          </div>
        </div>
        <div className="relative w-full sm:max-w-xs">
          <Input
            disabled
            placeholder="e.g. two days off next week"
            aria-label="Describe your leave (coming soon)"
            className="pr-12"
          />
          <span className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            Soon
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
