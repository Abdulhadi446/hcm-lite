import { headers } from "next/headers";
import { requireUser } from "@/lib/guards";
import { apiErrorJson, fieldError } from "@/lib/services/http";
import { listPayslips } from "@/lib/services/payroll";

export async function GET(request: Request) {
  await headers();
  try {
    const user = await requireUser();
    const employeeRaw = new URL(request.url).searchParams.get("employeeId");
    let employeeId: number | undefined;
    if (employeeRaw !== null) {
      if (!/^\d+$/.test(employeeRaw)) {
        throw fieldError("employeeId", "employeeId must be a number");
      }
      employeeId = Number(employeeRaw);
    }
    return Response.json(listPayslips(user, { employeeId }));
  } catch (err) {
    return apiErrorJson(err);
  }
}
