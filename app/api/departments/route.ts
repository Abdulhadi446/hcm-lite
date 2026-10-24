import { headers } from "next/headers";
import { requireRole } from "@/lib/guards";
import { apiErrorJson } from "@/lib/services/http";
import { createDepartment, listDepartments } from "@/lib/services/org";
import { departmentSchema, parseBody } from "@/lib/validation";

export async function GET() {
  await headers();
  try {
    await requireRole("admin", "hr");
    return Response.json({ items: listDepartments() });
  } catch (err) {
    return apiErrorJson(err);
  }
}

export async function POST(request: Request) {
  await headers();
  try {
    const user = await requireRole("admin");
    const parsed = await parseBody(request, departmentSchema);
    if (!parsed.ok) return parsed.response;
    return Response.json(
      { department: createDepartment(parsed.data, user.id) },
      { status: 201 }
    );
  } catch (err) {
    return apiErrorJson(err);
  }
}
