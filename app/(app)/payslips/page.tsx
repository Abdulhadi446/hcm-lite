import { redirect } from "next/navigation";

import { getSessionUser } from "@/lib/auth";
import { PayslipsView } from "@/components/payroll/payslips-view";

export default async function PayslipsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  // HR and admins manage runs; payslips here are the employee's own.
  if (user.role !== "employee") redirect("/payroll");

  return <PayslipsView />;
}
