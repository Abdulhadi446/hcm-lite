import Link from "next/link";
import { ArrowRightIcon, CalendarClockIcon, ClipboardCheckIcon } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/** Two approval queues that deep-link into the leave and attendance screens. */
export function PendingApprovals({
  leaves,
  corrections,
}: {
  leaves: number;
  corrections: number;
}) {
  const rows = [
    {
      key: "leaves",
      count: leaves,
      title: "Leave requests",
      hint: leaves === 0 ? "Nothing waiting" : "Awaiting review",
      href: "/leave?status=pending",
      cta: "Review leave",
      icon: CalendarClockIcon,
    },
    {
      key: "corrections",
      count: corrections,
      title: "Attendance corrections",
      hint: corrections === 0 ? "Nothing waiting" : "Awaiting review",
      href: "/attendance",
      cta: "Open attendance",
      icon: ClipboardCheckIcon,
    },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Pending approvals</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {rows.map((row) => (
          <div
            key={row.key}
            className="flex flex-col gap-2 rounded-lg border border-border p-3"
          >
            <div className="flex min-w-0 items-center gap-2.5">
              <span
                className={`flex size-8 shrink-0 items-center justify-center rounded-full ${
                  row.count > 0 ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
                }`}
                aria-hidden
              >
                <row.icon className="size-4" />
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{row.title}</p>
                <p className="text-[11px] text-muted-foreground">
                  {row.count} · {row.hint}
                </p>
              </div>
            </div>
            <Link
              href={row.href}
              className={buttonVariants({
                size: "sm",
                variant: row.count > 0 ? "default" : "outline",
                className: "w-full",
              })}
            >
              {row.cta}
              <ArrowRightIcon />
            </Link>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
