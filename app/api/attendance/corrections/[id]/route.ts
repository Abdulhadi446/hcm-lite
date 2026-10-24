import { headers } from "next/headers";
import { requireRole } from "@/lib/guards";
import { apiErrorJson, numericId } from "@/lib/services/http";
import { reviewCorrection } from "@/lib/services/attendance";
import { correctionReviewSchema, parseBody } from "@/lib/validation";

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Context) {
  await headers();
  try {
    const user = await requireRole("hr");
    const id = numericId((await params).id);
    const parsed = await parseBody(request, correctionReviewSchema);
    if (!parsed.ok) return parsed.response;
    return Response.json({ correction: reviewCorrection(user, id, parsed.data) });
  } catch (err) {
    return apiErrorJson(err);
  }
}
