import { headers } from "next/headers";
import { requireUser } from "@/lib/guards";
import { apiErrorJson } from "@/lib/services/http";
import { createChallenge } from "@/lib/services/face";
import { faceChallengeSchema, parseBody } from "@/lib/validation";

export async function POST(request: Request) {
  await headers();
  try {
    const user = await requireUser();
    const parsed = await parseBody(request, faceChallengeSchema);
    if (!parsed.ok) return parsed.response;
    return Response.json(createChallenge(user, parsed.data.purpose));
  } catch (err) {
    return apiErrorJson(err);
  }
}
