import { headers } from "next/headers";
import { requireUser } from "@/lib/guards";
import { apiErrorJson } from "@/lib/services/http";
import { deleteFaceTemplate, enrollFace } from "@/lib/services/face";
import { faceEnrollSchema, parseBody } from "@/lib/validation";

export async function POST(request: Request) {
  await headers();
  try {
    const user = await requireUser();
    const parsed = await parseBody(request, faceEnrollSchema);
    if (!parsed.ok) return parsed.response;
    return Response.json(enrollFace(user, parsed.data), { status: 201 });
  } catch (err) {
    return apiErrorJson(err);
  }
}

export async function DELETE() {
  await headers();
  try {
    const user = await requireUser();
    return Response.json(deleteFaceTemplate(user));
  } catch (err) {
    return apiErrorJson(err);
  }
}
