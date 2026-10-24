import { headers } from "next/headers";
import { requireRole } from "@/lib/guards";
import { apiErrorJson } from "@/lib/services/http";
import { createHoliday, listHolidays } from "@/lib/services/org";
import { holidaySchema, parseBody } from "@/lib/validation";

export async function GET(request: Request) {
  await headers();
  try {
    await requireRole("admin", "hr");
    const yearParam = new URL(request.url).searchParams.get("year");
    const year = yearParam && /^\d{4}$/.test(yearParam) ? Number(yearParam) : undefined;
    return Response.json({ items: listHolidays(year) });
  } catch (err) {
    return apiErrorJson(err);
  }
}

export async function POST(request: Request) {
  await headers();
  try {
    const user = await requireRole("admin");
    const parsed = await parseBody(request, holidaySchema);
    if (!parsed.ok) return parsed.response;
    return Response.json(
      { holiday: createHoliday(parsed.data, user.id) },
      { status: 201 }
    );
  } catch (err) {
    return apiErrorJson(err);
  }
}
