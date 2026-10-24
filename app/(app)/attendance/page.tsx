import { redirect } from "next/navigation";

import { getSessionUser } from "@/lib/auth";
import { todayIso } from "@/lib/dates";
import { AttendanceBoard } from "@/components/attendance/attendance-board";

export default async function AttendancePage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  // Employees track their own days — the board is a manager view.
  if (user.role === "employee") redirect("/my-attendance");

  return <AttendanceBoard role={user.role} today={todayIso()} />;
}
