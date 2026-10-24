import { headers } from "next/headers";
import { requireUser } from "@/lib/guards";
import { apiErrorJson } from "@/lib/services/http";
import { checkIn } from "@/lib/services/attendance";

export async function POST() {
  await headers();
  try {
    const user = await requireUser();
    return Response.json({ attendance: checkIn(user) }, { status: 201 });
  } catch (err) {
    return apiErrorJson(err);
  }
}
