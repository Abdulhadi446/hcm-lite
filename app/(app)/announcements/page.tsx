import { redirect } from "next/navigation";

import { AnnouncementsView } from "@/components/announcements/announcements-view";
import { PageHeader } from "@/components/page-header";
import { getSessionUser } from "@/lib/auth";

export default async function AnnouncementsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  return (
    <div className="space-y-6">
      <PageHeader
        title="Announcements"
        description="Company-wide updates, pinned posts first and newest after that."
      />
      <AnnouncementsView role={user.role} userId={user.id} />
    </div>
  );
}
