import { headers } from "next/headers";
import { requireRole } from "@/lib/guards";
import { apiErrorJson } from "@/lib/services/http";
import { createDesignation, listDesignations } from "@/lib/services/org";
import { designationSchema, parseBody } from "@/lib/validation";

export async function GET() {
  await headers();
  try {
    await requireRole("admin", "hr");
    return Response.json({ items: listDesignations() });
  } catch (err) {
    return apiErrorJson(err);
  }
}

export async function POST(request: Request) {
  await headers();
  try {
    const user = await requireRole("admin");
    const parsed = await parseBody(request, designationSchema);
    if (!parsed.ok) return parsed.response;
    return Response.json(
      { designation: createDesignation(parsed.data, user.id) },
      { status: 201 }
    );
  } catch (err) {
    return apiErrorJson(err);
  }
}
