import { headers } from "next/headers";
import { requireUser } from "@/lib/guards";
import { apiErrorJson } from "@/lib/services/http";
import { verifyAndPunch } from "@/lib/services/face";
import { facePunchSchema, parseBody } from "@/lib/validation";

export async function POST(request: Request) {
  await headers();
  try {
    const user = await requireUser();
    const parsed = await parseBody(request, facePunchSchema);
    if (!parsed.ok) return parsed.response;
    return Response.json(
      verifyAndPunch(user, {
        action: "check-in",
        challengeId: parsed.data.challengeId,
        embedding: parsed.data.embedding,
        location: parsed.data.location,
      })
    );
  } catch (err) {
    return apiErrorJson(err);
  }
}
