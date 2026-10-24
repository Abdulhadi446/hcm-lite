import { PagePlaceholder } from "@/components/page-placeholder"

export default function AttendancePage() {
  return (
    <PagePlaceholder
      title="Attendance"
      purpose="Check-in/out tracking and the daily attendance board."
      capabilities={[
        "Employee web check-in / check-out (server-stamped time).",
        "One record per day; a second check-in returns 409.",
        "Late / half-day / absent / missing-checkout status rules.",
        "Daily attendance board for HR.",
        "Attendance correction request and approval.",
      ]}
    />
  )
}
