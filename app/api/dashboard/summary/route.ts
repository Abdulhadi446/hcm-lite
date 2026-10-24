import { headers } from "next/headers";
import { requireRole } from "@/lib/guards";
import { apiErrorJson, fieldError } from "@/lib/services/http";
import { computeMetrics } from "@/lib/services/analytics";
import { isIsoDate, monthRange, todayIso } from "@/lib/dates";

/** Admin/HR company dashboard: every KPI comes from computeMetrics. */
export async function GET(request: Request) {
  await headers();
  try {
    const user = await requireRole("hr", "admin");
    const params = new URL(request.url).searchParams;

    const month = monthRange(todayIso().slice(0, 7));
    const fromRaw = params.get("from");
    const toRaw = params.get("to");

    if (fromRaw && !isIsoDate(fromRaw)) {
      throw fieldError("from", "Use a valid date (YYYY-MM-DD)");
    }
    if (toRaw && !isIsoDate(toRaw)) {
      throw fieldError("to", "Use a valid date (YYYY-MM-DD)");
    }

    const from = fromRaw ?? month.start;
    const to = toRaw ?? month.end;
    if (from > to) throw fieldError("from", "from must be on or before to");

    const departmentRaw = params.get("departmentId");
    if (departmentRaw !== null && departmentRaw !== "" && !/^\d+$/.test(departmentRaw)) {
      throw fieldError("departmentId", "departmentId must be a number");
    }
    const departmentId = departmentRaw ? Number(departmentRaw) : null;

    const result = computeMetrics({ from, to, departmentId });
    return Response.json({
      ...result,
      scope: { ...result.scope, role: user.role },
    });
  } catch (err) {
    return apiErrorJson(err);
  }
}
