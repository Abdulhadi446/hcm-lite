import { PagePlaceholder } from "@/components/page-placeholder"

export default function EmployeesPage() {
  return (
    <PagePlaceholder
      title="Employees"
      purpose="Employee directory, job details, and records."
      capabilities={[
        "HR registers employees with job details and salary (creates login + temp password).",
        "Search, filter, and paginate the employee directory.",
        "Employee 360° profile view.",
        "Own profile edit (phone, address).",
        "CSV import / export dry-run.",
      ]}
    />
  )
}
