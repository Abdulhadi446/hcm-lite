import { redirect } from "next/navigation";

import { getSessionUser } from "@/lib/auth";
import { EmployeeDirectory } from "@/components/employees/employee-directory";

export default async function EmployeesPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  // Employees only ever see their own record — send them straight to it.
  if (user.role === "employee") {
    redirect(user.employeeId ? `/employees/${user.employeeId}` : "/dashboard");
  }

  return <EmployeeDirectory role={user.role} />;
}
