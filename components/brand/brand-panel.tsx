import { ClockIcon, UsersIcon, WalletIcon } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Shared brand surfaces for the public screens. The panel is intentionally
 * token-only (`foreground` / `background` / `primary`) so it keeps working if
 * the palette is ever themed.
 */

const CAPABILITIES = [
  {
    icon: UsersIcon,
    title: "People & access",
    detail: "One directory for employees, departments and role-scoped logins.",
  },
  {
    icon: ClockIcon,
    title: "Attendance & leave",
    detail: "Check-ins, corrections and approvals that reconcile themselves.",
  },
  {
    icon: WalletIcon,
    title: "Payroll, run once",
    detail: "Draft, finalize and lock a month from the records you already have.",
  },
];

export function BrandMark({
  tone = "default",
  className,
}: {
  tone?: "default" | "inverse";
  className?: string;
}) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <div className="flex size-8 items-center justify-center rounded-[10px] bg-primary text-[10px] font-semibold tracking-tight text-primary-foreground">
        HCM
      </div>
      <div className="leading-none">
        <span
          className={cn(
            "block text-sm font-semibold tracking-tight",
            tone === "inverse" ? "text-background" : "text-foreground",
          )}
        >
          HCM Lite
        </span>
        <span
          className={cn(
            "mt-1 block text-[10px] font-medium uppercase tracking-[0.16em]",
            tone === "inverse" ? "text-background/45" : "text-muted-foreground",
          )}
        >
          HR workspace
        </span>
      </div>
    </div>
  );
}

export function BrandPanel({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "relative isolate overflow-hidden bg-foreground text-background",
        className,
      )}
    >
      {/* paper grid + a single soft accent glow — texture, not decoration */}
      <div
        aria-hidden="true"
        className="brand-grid pointer-events-none absolute inset-0 opacity-60"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-40 -left-28 size-[30rem] rounded-full bg-primary/25 blur-[120px]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-24 -bottom-48 size-[32rem] rounded-full bg-primary/15 blur-[130px]"
      />

      <div className="relative flex h-full flex-col justify-between gap-10 p-10 xl:p-14">
        <BrandMark tone="inverse" className="animate-rise" />

        <div className="max-w-md">
          <p
            className="animate-rise text-[11px] font-medium uppercase tracking-[0.22em] text-background/45"
            style={{ animationDelay: "60ms" }}
          >
            AI-assisted HR
          </p>
          <p
            className="animate-rise mt-4 text-balance text-[1.75rem] leading-[1.15] font-semibold tracking-tight text-background xl:text-[2.4rem]"
            style={{ animationDelay: "100ms" }}
          >
            Everything HR needs, from first hire to final payroll.
          </p>
          <p
            className="animate-rise mt-4 max-w-sm text-sm leading-relaxed text-background/55"
            style={{ animationDelay: "140ms" }}
          >
            People, attendance, leave and pay in one workspace — with an
            assistant that answers from your own records.
          </p>

          <ul className="mt-9 space-y-5">
            {CAPABILITIES.map((item, index) => {
              const Icon = item.icon;
              return (
                <li
                  key={item.title}
                  className="animate-rise flex items-start gap-3"
                  style={{ animationDelay: `${180 + index * 60}ms` }}
                >
                  <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md border border-background/15 bg-background/5 text-background/70">
                    <Icon className="size-3.5" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-background/90">
                      {item.title}
                    </p>
                    <p className="mt-0.5 text-xs leading-relaxed text-background/50">
                      {item.detail}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>

        <div className="animate-rise flex items-center gap-3" style={{ animationDelay: "360ms" }}>
          <span className="text-[10px] font-medium uppercase tracking-[0.18em] text-background/40">
            Admin · HR · Employee
          </span>
          <span aria-hidden="true" className="h-px flex-1 bg-background/15" />
          <span className="text-[10px] font-medium uppercase tracking-[0.18em] text-background/40">
            One workspace
          </span>
        </div>
      </div>
    </div>
  );
}
