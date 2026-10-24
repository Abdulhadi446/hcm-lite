import { headers } from "next/headers";
import { requireUser } from "@/lib/guards";
import { apiErrorJson } from "@/lib/services/http";
import { getFaceStatus } from "@/lib/services/face";

export async function GET() {
  await headers();
  try {
    const user = await requireUser();
    return Response.json(getFaceStatus(user));
  } catch (err) {
    return apiErrorJson(err);
  }
}
