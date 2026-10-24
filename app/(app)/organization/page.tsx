import { PagePlaceholder } from "@/components/page-placeholder"

export default function OrganizationPage() {
  return (
    <PagePlaceholder
      title="Organization"
      purpose="Departments, designations, leave types, and office settings."
      capabilities={[
        "Departments and designations CRUD.",
        "Leave types and quotas.",
        "Holidays calendar.",
        "Office hours, grace, weekend, and geofence settings.",
      ]}
    />
  )
}
