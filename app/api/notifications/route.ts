import { headers } from "next/headers";
import { requireUser } from "@/lib/guards";
import { listNotifications } from "@/lib/services/comms";
import { apiErrorJson } from "@/lib/services/http";

export async function GET(request: Request) {
  await headers();
  try {
    const user = await requireUser();
    const raw = new URL(request.url).searchParams.get("limit");
    const limit = raw ? Number(raw) : undefined;
    return Response.json(listNotifications(user.id, limit));
  } catch (err) {
    return apiErrorJson(err);
  }
}
