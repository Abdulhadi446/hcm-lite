import { Building2Icon, CalendarDaysIcon, CalendarRangeIcon } from "lucide-react";

/**
 * Compact page header for the dashboard: who is looking, when, and over which
 * period. Purely presentational — every value is passed in by the page.
 */
export function DashboardHero({
  greeting,
  name,
  companyName,
  dateLabel,
  periodLabel,
  scopeLabel,
}: {
  greeting: string;
  name: string;
  companyName: string;
  dateLabel: string;
  periodLabel: string;
  scopeLabel: string;
}) {
  const firstName = name.trim().split(/\s+/)[0] || name;

  return (
    <section className="relative isolate overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10">
      <div
        aria-hidden="true"
        className="brand-grid pointer-events-none absolute inset-0 text-muted-foreground opacity-40 [mask-image:linear-gradient(to_right,black,transparent_85%)]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-24 -right-16 size-56 rounded-full bg-primary/10 blur-3xl"
      />
      <span
        aria-hidden="true"
        className="absolute inset-y-5 left-0 w-[3px] rounded-r-full bg-primary/70"
      />

      <div className="relative flex flex-col gap-4 py-5 pr-5 pl-6 sm:flex-row sm:items-center sm:justify-between sm:gap-6 sm:py-6 sm:pr-6 sm:pl-7">
        <div className="min-w-0">
          <h1>
            <span className="block text-[11px] font-medium tracking-[0.2em] text-muted-foreground uppercase">
              Dashboard
            </span>
            <span className="mt-1.5 block text-balance text-[1.375rem] leading-tight font-semibold tracking-tight sm:text-[1.625rem]">
              {greeting}, {firstName}
            </span>
          </h1>
          <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
            <span className="font-medium text-foreground">{scopeLabel}</span>
            {/* the dot stays glued to the date so it never dangles at a wrap */}
            <span className="inline-flex items-center gap-2">
              <span aria-hidden="true" className="h-1 w-1 shrink-0 rounded-full bg-border" />
              <span className="inline-flex items-center gap-1.5">
                <CalendarDaysIcon className="size-3.5 shrink-0" />
                {dateLabel}
              </span>
            </span>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 sm:shrink-0 sm:justify-end">
          <span className="hidden items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-xs font-medium text-muted-foreground sm:inline-flex">
            <Building2Icon className="size-3.5 shrink-0" />
            <span className="max-w-[14rem] truncate">{companyName}</span>
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-2.5 py-1 text-xs font-medium text-foreground">
            <CalendarRangeIcon className="size-3.5 shrink-0 text-muted-foreground" />
            {periodLabel}
          </span>
        </div>
      </div>
    </section>
  );
}
