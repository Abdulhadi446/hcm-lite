import { headers } from "next/headers";
import { requireRole } from "@/lib/guards";
import { apiErrorJson, numericId } from "@/lib/services/http";
import { updateUser } from "@/lib/services/users";
import { parseBody, userPatchSchema } from "@/lib/validation";

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Context) {
  await headers();
  try {
    const user = await requireRole("admin");
    const id = numericId((await params).id);
    const parsed = await parseBody(request, userPatchSchema);
    if (!parsed.ok) return parsed.response;
    return Response.json({ user: updateUser(id, parsed.data, user.id) });
  } catch (err) {
    return apiErrorJson(err);
  }
}
