import { headers } from "next/headers";
import { requireRole, requireUser } from "@/lib/guards";
import { createAnnouncement, listAnnouncements } from "@/lib/services/comms";
import { apiErrorJson } from "@/lib/services/http";
import { announcementCreateSchema, parseBody } from "@/lib/validation";

export async function GET(request: Request) {
  await headers();
  try {
    await requireUser();
    const raw = new URL(request.url).searchParams.get("limit");
    const limit = raw ? Number(raw) : undefined;
    return Response.json({ items: listAnnouncements(limit) });
  } catch (err) {
    return apiErrorJson(err);
  }
}

export async function POST(request: Request) {
  await headers();
  try {
    const user = await requireRole("admin", "hr");
    const parsed = await parseBody(request, announcementCreateSchema);
    if (!parsed.ok) return parsed.response;
    return Response.json({ announcement: createAnnouncement(parsed.data, user) }, { status: 201 });
  } catch (err) {
    return apiErrorJson(err);
  }
}
