import { headers } from "next/headers";
import { requireRole } from "@/lib/guards";
import { apiErrorJson, numericId } from "@/lib/services/http";
import { deleteDesignation, updateDesignation } from "@/lib/services/org";
import { designationSchema, parseBody } from "@/lib/validation";

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Context) {
  await headers();
  try {
    const user = await requireRole("admin");
    const id = numericId((await params).id);
    const parsed = await parseBody(request, designationSchema);
    if (!parsed.ok) return parsed.response;
    return Response.json({ designation: updateDesignation(id, parsed.data, user.id) });
  } catch (err) {
    return apiErrorJson(err);
  }
}

export async function DELETE(_request: Request, { params }: Context) {
  await headers();
  try {
    const user = await requireRole("admin");
    const id = numericId((await params).id);
    deleteDesignation(id, user.id);
    return Response.json({ ok: true });
  } catch (err) {
    return apiErrorJson(err);
  }
}
