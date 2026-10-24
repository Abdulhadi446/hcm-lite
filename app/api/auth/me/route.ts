import { headers } from "next/headers";
import { getSessionUser } from "@/lib/auth";
import { apiError } from "@/lib/guards";

export async function GET() {
  // Request-time only; never prerendered (cookie-dependent).
  await headers();
  try {
    const user = await getSessionUser();
    if (!user) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    return Response.json({ user });
  } catch (err) {
    return apiError(err);
  }
}
