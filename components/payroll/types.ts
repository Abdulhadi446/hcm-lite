export type PayrollStatus = "draft" | "finalized";

export type PayrollRun = {
  id: number;
  month: string;
  status: PayrollStatus;
  workingDays: number;
  employeeCount: number;
  totalGross: number;
  totalNet: number;
  finalizedAt: string | null;
};

export type PayslipRow = {
  id: number;
  employeeId: number;
  employeeName?: string | null;
  employeeCode?: string | null;
  departmentName?: string | null;
  basic: number;
  hra: number;
  medical: number;
  gross: number;
  perDay: number;
  absentDays: number;
  unpaidDays: number;
  halfDays: number;
  deductions: number;
  tax: number;
  net: number;
};

export type PayrollRunDetail = {
  run: PayrollRun;
  payslips: PayslipRow[];
};

export type PayslipSummary = {
  id: number;
  employeeId: number;
  month: string;
  gross: number;
  deductions: number;
  tax: number;
  net: number;
};

export const RUN_STATUS_LABELS: Record<PayrollStatus, string> = {
  draft: "Draft",
  finalized: "Finalized",
};

export const RUN_STATUS_STYLES: Record<PayrollStatus, string> = {
  draft: "border-amber-200 bg-amber-50 text-amber-700",
  finalized: "border-emerald-200 bg-emerald-50 text-emerald-700",
};

export function sumBy(payslips: PayslipRow[], key: keyof PayslipRow) {
  return payslips.reduce((total, row) => {
    const value = row[key];
    return total + (typeof value === "number" ? value : 0);
  }, 0);
}

export function deductionBasis(payslip: PayslipRow) {
  const parts: string[] = [];
  if (payslip.absentDays) parts.push(`${trimNumber(payslip.absentDays)} absent`);
  if (payslip.unpaidDays) parts.push(`${trimNumber(payslip.unpaidDays)} unpaid`);
  if (payslip.halfDays) parts.push(`${trimNumber(payslip.halfDays)} half-day`);
  return parts.length ? parts.join(" · ") : "No absences";
}

export function trimNumber(value: number) {
  return Number.isInteger(value) ? String(value) : String(Math.round(value * 100) / 100);
}
