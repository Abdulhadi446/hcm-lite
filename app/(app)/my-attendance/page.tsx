import { PagePlaceholder } from "@/components/page-placeholder"

export default function MyAttendancePage() {
  return (
    <PagePlaceholder
      title="My Attendance"
      purpose="Your own check-in history and calendar."
      capabilities={[
        "Personal check-in / check-out.",
        "Attendance calendar view.",
        "Request an attendance correction.",
        "View your own status history.",
      ]}
    />
  )
}
