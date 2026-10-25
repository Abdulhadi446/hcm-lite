import { headers } from "next/headers";
import { apiError, requireUser } from "@/lib/guards";

export async function GET() {
  // Request-time only; never prerendered (cookie-dependent).
  await headers();
  try {
    // Must remain readable while a forced password change is pending.
    const user = await requireUser({ allowPasswordChangePending: true });
    return Response.json({ user });
  } catch (err) {
    return apiError(err);
  }
}
