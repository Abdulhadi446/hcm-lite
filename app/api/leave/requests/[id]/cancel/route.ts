import { headers } from "next/headers";
import { requireUser } from "@/lib/guards";
import { apiErrorJson, numericId } from "@/lib/services/http";
import { cancelLeaveRequest } from "@/lib/services/leave";

type Context = { params: Promise<{ id: string }> };

export async function POST(_request: Request, { params }: Context) {
  await headers();
  try {
    const user = await requireUser();
    const id = numericId((await params).id);
    return Response.json({ request: cancelLeaveRequest(user, id) });
  } catch (err) {
    return apiErrorJson(err);
  }
}
