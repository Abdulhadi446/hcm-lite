import { headers } from "next/headers";
import { requireUser } from "@/lib/guards";
import { markNotificationRead, unreadNotificationCount } from "@/lib/services/comms";
import { apiErrorJson, numericId } from "@/lib/services/http";

type Context = { params: Promise<{ id: string }> };

export async function POST(_request: Request, { params }: Context) {
  await headers();
  try {
    const user = await requireUser();
    const id = numericId((await params).id);
    const notification = markNotificationRead(id, user.id);
    return Response.json({ notification, unread: unreadNotificationCount(user.id) });
  } catch (err) {
    return apiErrorJson(err);
  }
}
