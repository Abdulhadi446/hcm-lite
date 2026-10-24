import { redirect } from "next/navigation";

import { getSessionUser } from "@/lib/auth";
import { todayIso } from "@/lib/dates";
import { PayrollView } from "@/components/payroll/payroll-view";

export default async function PayrollPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  // Employees see their own payslips instead.
  if (user.role === "employee") redirect("/payslips");

  return <PayrollView role={user.role} initialMonth={todayIso().slice(0, 7)} />;
}
