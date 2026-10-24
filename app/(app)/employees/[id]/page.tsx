import { redirect } from "next/navigation";

import { getSessionUser } from "@/lib/auth";
import { EmployeeProfile } from "@/components/employees/employee-profile";

export default async function EmployeeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const { id } = await params;
  const employeeId = Number(id);
  if (!Number.isInteger(employeeId) || employeeId <= 0) redirect("/employees");

  // Employees may only open their own profile.
  if (user.role === "employee") {
    if (!user.employeeId) redirect("/dashboard");
    if (user.employeeId !== employeeId) redirect(`/employees/${user.employeeId}`);
  }

  return (
    <EmployeeProfile
      id={employeeId}
      role={user.role}
      isSelf={user.role === "employee" && user.employeeId === employeeId}
    />
  );
}
