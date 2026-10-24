import { headers } from "next/headers";
import { requireUser } from "@/lib/guards";
import { apiErrorJson } from "@/lib/services/http";
import { checkOut } from "@/lib/services/attendance";

export async function POST() {
  await headers();
  try {
    const user = await requireUser();
    return Response.json({ attendance: checkOut(user) });
  } catch (err) {
    return apiErrorJson(err);
  }
}
