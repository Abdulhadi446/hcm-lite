import { headers } from "next/headers";
import { requireRole } from "@/lib/guards";
import { apiErrorJson, numericId } from "@/lib/services/http";
import { deleteLeaveType, updateLeaveType } from "@/lib/services/org";
import { leaveTypePatchSchema, parseBody } from "@/lib/validation";

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Context) {
  await headers();
  try {
    const user = await requireRole("admin");
    const id = numericId((await params).id);
    const parsed = await parseBody(request, leaveTypePatchSchema);
    if (!parsed.ok) return parsed.response;
    return Response.json({ leaveType: updateLeaveType(id, parsed.data, user.id) });
  } catch (err) {
    return apiErrorJson(err);
  }
}

export async function DELETE(_request: Request, { params }: Context) {
  await headers();
  try {
    const user = await requireRole("admin");
    const id = numericId((await params).id);
    deleteLeaveType(id, user.id);
    return Response.json({ ok: true });
  } catch (err) {
    return apiErrorJson(err);
  }
}
