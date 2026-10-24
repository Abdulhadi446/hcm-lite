import { headers } from "next/headers";
import { requireUser } from "@/lib/guards";
import { apiErrorJson, fieldError } from "@/lib/services/http";
import { myMonth } from "@/lib/services/attendance";
import { currentMonth } from "@/lib/services/shared";

export async function GET(request: Request) {
  await headers();
  try {
    const user = await requireUser();
    const month = new URL(request.url).searchParams.get("month") ?? currentMonth();
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
      throw fieldError("month", "Use a month like 2026-09");
    }
    return Response.json(myMonth(user, month));
  } catch (err) {
    return apiErrorJson(err);
  }
}
