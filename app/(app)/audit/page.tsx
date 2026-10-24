import { redirect } from "next/navigation";

import { AuditView } from "@/components/audit/audit-view";
import { PageHeader } from "@/components/page-header";
import { getSessionUser } from "@/lib/auth";

export default async function AuditPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.role !== "admin") redirect("/dashboard");

  return (
    <div className="space-y-6">
      <PageHeader
        title="Audit log"
        description="Every create, update, approve and delete, with before/after snapshots."
      />
      <AuditView />
    </div>
  );
}
