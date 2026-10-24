import { PagePlaceholder } from "@/components/page-placeholder"

export default function AuditPage() {
  return (
    <PagePlaceholder
      title="Audit"
      purpose="Actor, action, entity, and before/after JSON log."
      capabilities={[
        "Audit log viewer.",
        "Actor / action / entity / before-after JSON records.",
        "Writes on create, update, approve, and finalize actions.",
      ]}
    />
  )
}
