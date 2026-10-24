import { headers } from "next/headers";
import { requireRole } from "@/lib/guards";
import { apiErrorJson } from "@/lib/services/http";
import { createRun, listRuns } from "@/lib/services/payroll";
import { parseBody, payrollRunCreateSchema } from "@/lib/validation";

export async function GET() {
  await headers();
  try {
    await requireRole("hr", "admin");
    return Response.json(listRuns());
  } catch (err) {
    return apiErrorJson(err);
  }
}

export async function POST(request: Request) {
  await headers();
  try {
    const user = await requireRole("hr");
    const parsed = await parseBody(request, payrollRunCreateSchema);
    if (!parsed.ok) return parsed.response;
    const result = createRun(parsed.data.month, user);
    return Response.json(result, { status: 201 });
  } catch (err) {
    return apiErrorJson(err);
  }
}
