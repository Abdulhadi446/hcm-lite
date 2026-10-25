import { redirect } from "next/navigation";

import { getSessionUser } from "@/lib/auth";
import { todayIso } from "@/lib/dates";
import { MyAttendanceView } from "@/components/attendance/my-attendance-view";

// The page reads the session per request; opt out of static-shell validation.
export const instant = false;

export default async function MyAttendancePage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  // HR and admins use the team board instead.
  if (user.role !== "employee") redirect("/attendance");

  return <MyAttendanceView today={todayIso()} />;
}
