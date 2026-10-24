import { PagePlaceholder } from "@/components/page-placeholder"

export default function LeavePage() {
  return (
    <PagePlaceholder
      title="Leave"
      purpose="Leave applications, quotas, and approvals."
      capabilities={[
        "Apply for and cancel leave.",
        "Working-day, quota, and overlap validation.",
        "HR approval inbox with reviewer comment.",
        "Leave balance and history.",
      ]}
    />
  )
}
