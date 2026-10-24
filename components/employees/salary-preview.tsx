import { formatMoney } from "./types";

/**
 * Salary breakdown preview — HRA 40% of basic, medical 10% of basic,
 * gross = 1.5 × basic (matches the payroll formula in the M0 schema).
 */
export function SalaryPreview({ basic }: { basic: number }) {
  const valid = Number.isFinite(basic) && basic > 0;
  const hra = Math.round(basic * 0.4);
  const medical = Math.round(basic * 0.1);
  const gross = Math.round(basic * 1.5);

  if (!valid) {
    return (
      <div className="rounded-lg border border-dashed border-border px-3 py-2.5 text-xs text-muted-foreground">
        Enter a basic salary to preview HRA, medical and gross pay.
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-muted/40 px-3 py-3">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Cell label="Basic" value={formatMoney(basic)} />
        <Cell label="HRA · 40%" value={formatMoney(hra)} />
        <Cell label="Medical · 10%" value={formatMoney(medical)} />
        <Cell label="Gross · 1.5×" value={formatMoney(gross)} strong />
      </div>
    </div>
  );
}

function Cell({
  label,
  value,
  strong,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p
        className={
          strong
            ? "mt-0.5 truncate text-sm font-semibold tabular-nums"
            : "mt-0.5 truncate text-sm tabular-nums"
        }
      >
        {value}
      </p>
    </div>
  );
}
