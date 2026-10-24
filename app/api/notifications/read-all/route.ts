import { headers } from "next/headers";
import { requireUser } from "@/lib/guards";
import { markAllNotificationsRead } from "@/lib/services/comms";
import { apiErrorJson } from "@/lib/services/http";

export async function POST() {
  await headers();
  try {
    const user = await requireUser();
    const updated = markAllNotificationsRead(user.id);
    return Response.json({ ok: true, updated, unread: 0 });
  } catch (err) {
    return apiErrorJson(err);
  }
}
