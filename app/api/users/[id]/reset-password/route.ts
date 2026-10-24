import { headers } from "next/headers";
import { requireRole } from "@/lib/guards";
import { apiErrorJson, numericId } from "@/lib/services/http";
import { resetUserPassword } from "@/lib/services/users";

type Context = { params: Promise<{ id: string }> };

export async function POST(_request: Request, { params }: Context) {
  await headers();
  try {
    const user = await requireRole("admin");
    const id = numericId((await params).id);
    return Response.json(resetUserPassword(id, user.id));
  } catch (err) {
    return apiErrorJson(err);
  }
}
