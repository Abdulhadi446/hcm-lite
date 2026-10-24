import { PagePlaceholder } from "@/components/page-placeholder"

export default function PayslipsPage() {
  return (
    <PagePlaceholder
      title="Payslips"
      purpose="Your monthly payslips and pay history."
      capabilities={[
        "View and download payslip PDFs.",
        "Pay history by month.",
        "Notification when a payslip is published.",
      ]}
    />
  )
}
