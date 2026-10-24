import { redirect } from "next/navigation";

import { getSessionUser } from "@/lib/auth";
import { CsvImport } from "@/components/employees/csv-import";

export default async function ImportEmployeesPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.role !== "hr") redirect("/employees");

  return <CsvImport />;
}
