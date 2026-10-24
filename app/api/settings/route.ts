import { headers } from "next/headers";
import { requireRole } from "@/lib/guards";
import { apiErrorJson } from "@/lib/services/http";
import { getSettings, updateSettings } from "@/lib/services/org";
import { parseBody, settingsPatchSchema } from "@/lib/validation";

export async function GET() {
  await headers();
  try {
    await requireRole("admin", "hr");
    return Response.json({ settings: getSettings() });
  } catch (err) {
    return apiErrorJson(err);
  }
}

export async function PATCH(request: Request) {
  await headers();
  try {
    const user = await requireRole("admin");
    const parsed = await parseBody(request, settingsPatchSchema);
    if (!parsed.ok) return parsed.response;
    return Response.json({ settings: updateSettings(parsed.data, user.id) });
  } catch (err) {
    return apiErrorJson(err);
  }
}
