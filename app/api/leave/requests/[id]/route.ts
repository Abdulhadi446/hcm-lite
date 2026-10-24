import { headers } from "next/headers";
import { requireRole } from "@/lib/guards";
import { apiErrorJson, numericId } from "@/lib/services/http";
import { reviewLeaveRequest } from "@/lib/services/leave";
import { leaveReviewSchema, parseBody } from "@/lib/validation";

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Context) {
  await headers();
  try {
    const user = await requireRole("hr");
    const id = numericId((await params).id);
    const parsed = await parseBody(request, leaveReviewSchema);
    if (!parsed.ok) return parsed.response;
    return Response.json({ request: reviewLeaveRequest(user, id, parsed.data) });
  } catch (err) {
    return apiErrorJson(err);
  }
}
