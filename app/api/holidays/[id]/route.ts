import { headers } from "next/headers";
import { requireRole } from "@/lib/guards";
import { apiErrorJson, numericId } from "@/lib/services/http";
import { deleteHoliday } from "@/lib/services/org";

type Context = { params: Promise<{ id: string }> };

export async function DELETE(_request: Request, { params }: Context) {
  await headers();
  try {
    const user = await requireRole("admin");
    const id = numericId((await params).id);
    deleteHoliday(id, user.id);
    return Response.json({ ok: true });
  } catch (err) {
    return apiErrorJson(err);
  }
}
