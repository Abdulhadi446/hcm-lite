import { PagePlaceholder } from "@/components/page-placeholder"

export default function MyLeavePage() {
  return (
    <PagePlaceholder
      title="My Leave"
      purpose="Your own leave balance, applications, and history."
      capabilities={[
        "View your leave balance.",
        "Apply for and cancel leave.",
        "View your leave history and status.",
      ]}
    />
  )
}
