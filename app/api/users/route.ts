import { headers } from "next/headers";
import { requireRole } from "@/lib/guards";
import { apiErrorJson } from "@/lib/services/http";
import { createUser, listUsers } from "@/lib/services/users";
import { parseBody, userCreateSchema } from "@/lib/validation";

export async function GET(request: Request) {
  await headers();
  try {
    await requireRole("admin");
    const role = new URL(request.url).searchParams.get("role") ?? undefined;
    return Response.json({ items: listUsers({ role }) });
  } catch (err) {
    return apiErrorJson(err);
  }
}

export async function POST(request: Request) {
  await headers();
  try {
    const user = await requireRole("admin");
    const parsed = await parseBody(request, userCreateSchema);
    if (!parsed.ok) return parsed.response;
    const result = createUser(parsed.data, user.id);
    return Response.json(result, { status: 201 });
  } catch (err) {
    return apiErrorJson(err);
  }
}
