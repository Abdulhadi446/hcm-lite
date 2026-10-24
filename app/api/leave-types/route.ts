import { headers } from "next/headers";
import { requireRole } from "@/lib/guards";
import { apiErrorJson } from "@/lib/services/http";
import { createLeaveType, listLeaveTypes } from "@/lib/services/org";
import { leaveTypeCreateSchema, parseBody } from "@/lib/validation";

export async function GET() {
  await headers();
  try {
    await requireRole("admin", "hr");
    return Response.json({ items: listLeaveTypes() });
  } catch (err) {
    return apiErrorJson(err);
  }
}

export async function POST(request: Request) {
  await headers();
  try {
    const user = await requireRole("admin");
    const parsed = await parseBody(request, leaveTypeCreateSchema);
    if (!parsed.ok) return parsed.response;
    return Response.json(
      { leaveType: createLeaveType(parsed.data, user.id) },
      { status: 201 }
    );
  } catch (err) {
    return apiErrorJson(err);
  }
}
