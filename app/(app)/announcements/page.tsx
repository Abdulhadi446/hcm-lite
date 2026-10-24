import { PagePlaceholder } from "@/components/page-placeholder"

export default function AnnouncementsPage() {
  return (
    <PagePlaceholder
      title="Announcements"
      purpose="Company-wide updates visible to all roles."
      capabilities={[
        "Admins and HR post announcements.",
        "All employees can read announcements.",
        "Announcements surface on dashboards.",
      ]}
    />
  )
}
