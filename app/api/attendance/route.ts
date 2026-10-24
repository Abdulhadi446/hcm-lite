import { headers } from "next/headers";
import { requireRole } from "@/lib/guards";
import { apiErrorJson, fieldError } from "@/lib/services/http";
import { board } from "@/lib/services/attendance";
import { isIsoDate, todayIso } from "@/lib/dates";

export async function GET(request: Request) {
  await headers();
  try {
    const user = await requireRole("hr", "admin");
    const params = new URL(request.url).searchParams;

    const date = params.get("date") ?? (params.get("month") ? undefined : todayIso());
    const month = params.get("month") ?? undefined;
    if (date && !isIsoDate(date)) throw fieldError("date", "Use a valid date (YYYY-MM-DD)");
    if (month && !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
      throw fieldError("month", "Use a month like 2026-09");
    }

    const departmentRaw = params.get("departmentId");
    const departmentId =
      departmentRaw && /^\d+$/.test(departmentRaw) ? Number(departmentRaw) : undefined;

    const result = board(user, {
      date,
      month,
      departmentId,
      q: params.get("q") ?? undefined,
    });
    return Response.json(result);
  } catch (err) {
    return apiErrorJson(err);
  }
}
