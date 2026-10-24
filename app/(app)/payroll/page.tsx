import { PagePlaceholder } from "@/components/page-placeholder"

export default function PayrollPage() {
  return (
    <PagePlaceholder
      title="Payroll"
      purpose="Monthly payroll runs, deductions, tax, and payslips."
      capabilities={[
        "Salary structures (basic, HRA 40%, medical 10%).",
        "Monthly payroll draft run.",
        "Absent / unpaid / half-day deductions + tax slab on gross.",
        "Proration for joiners and leavers.",
        "Admin finalizes and locks the month; payslip PDF + notification.",
      ]}
    />
  )
}
