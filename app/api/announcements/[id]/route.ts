import { headers } from "next/headers";
import { requireUser } from "@/lib/guards";
import { deleteAnnouncement, updateAnnouncement } from "@/lib/services/comms";
import { apiErrorJson, numericId } from "@/lib/services/http";
import { announcementPatchSchema, parseBody } from "@/lib/validation";

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Context) {
  await headers();
  try {
    const user = await requireUser();
    const id = numericId((await params).id);
    const parsed = await parseBody(request, announcementPatchSchema);
    if (!parsed.ok) return parsed.response;
    return Response.json({ announcement: updateAnnouncement(id, parsed.data, user) });
  } catch (err) {
    return apiErrorJson(err);
  }
}

export async function DELETE(_request: Request, { params }: Context) {
  await headers();
  try {
    const user = await requireUser();
    const id = numericId((await params).id);
    deleteAnnouncement(id, user);
    return Response.json({ ok: true });
  } catch (err) {
    return apiErrorJson(err);
  }
}
