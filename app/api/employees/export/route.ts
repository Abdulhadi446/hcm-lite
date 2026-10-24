import { headers } from "next/headers";
import { requireRole } from "@/lib/guards";
import { apiErrorJson } from "@/lib/services/http";
import { exportCsv } from "@/lib/services/employees";

export async function GET() {
  await headers();
  try {
    await requireRole("hr");
    return new Response(exportCsv(), {
      status: 200,
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": 'attachment; filename="employees.csv"',
        "cache-control": "no-store",
      },
    });
  } catch (err) {
    return apiErrorJson(err);
  }
}
