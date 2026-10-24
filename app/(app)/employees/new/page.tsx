import { redirect } from "next/navigation";

import { getSessionUser } from "@/lib/auth";
import { EmployeeNew } from "@/components/employees/employee-new";

export default async function NewEmployeePage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.role !== "hr") redirect("/employees");

  return <EmployeeNew />;
}
