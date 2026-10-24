import { redirect } from "next/navigation";

import { getSessionUser } from "@/lib/auth";
import { LeaveView } from "@/components/leave/leave-view";
import { parseLeaveStatus } from "@/components/leave/types";

export default async function LeavePage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string | string[] }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  // Employees apply and track their own leave.
  if (user.role === "employee") redirect("/my-leave");

  const params = await searchParams;
  const status = parseLeaveStatus(params.status);

  return <LeaveView key={status} role={user.role} initialStatus={status} />;
}
