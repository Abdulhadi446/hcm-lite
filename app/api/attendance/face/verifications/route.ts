import { headers } from "next/headers";
import { requireUser } from "@/lib/guards";
import { apiErrorJson } from "@/lib/services/http";
import { listFaceVerifications } from "@/lib/services/face";

export async function GET(request: Request) {
  await headers();
  try {
    const user = await requireUser();
    const params = new URL(request.url).searchParams;

    const limitRaw = Number(params.get("limit") ?? "20");
    const limit = Number.isFinite(limitRaw) ? limitRaw : 20;

    const employeeRaw = params.get("employeeId");
    const employeeId =
      user.role === "employee"
        ? undefined
        : employeeRaw && /^\d+$/.test(employeeRaw) && Number(employeeRaw) > 0
          ? Number(employeeRaw)
          : undefined;

    return Response.json(listFaceVerifications(user, { limit, employeeId }));
  } catch (err) {
    return apiErrorJson(err);
  }
}
