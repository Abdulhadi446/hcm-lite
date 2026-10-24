import { headers } from "next/headers";
import { requireUser } from "@/lib/guards";
import { apiErrorJson } from "@/lib/services/http";
import { employeeDashboard } from "@/lib/services/analytics";

/**
 * Personal dashboard for the signed-in user. The employee id is taken from the
 * session (never from the query string), so a caller can only see themselves.
 */
export async function GET() {
  await headers();
  try {
    const user = await requireUser();
    return Response.json(employeeDashboard(user));
  } catch (err) {
    return apiErrorJson(err);
  }
}
