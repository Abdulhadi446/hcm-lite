import { redirect } from "next/navigation";

import { getSessionUser } from "@/lib/auth";
import { todayIso } from "@/lib/dates";
import { MyLeaveView } from "@/components/leave/my-leave-view";

export default async function MyLeavePage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  // HR and admins review leave on the team page.
  if (user.role !== "employee") redirect("/leave");

  return <MyLeaveView today={todayIso()} />;
}
