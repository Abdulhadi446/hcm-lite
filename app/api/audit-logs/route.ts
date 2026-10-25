import { headers } from "next/headers";
import { isIsoDate } from "@/lib/dates";
import { requireRole } from "@/lib/guards";
import { listAuditLogs } from "@/lib/services/audit";
import { apiErrorJson, fieldError, parsePagination } from "@/lib/services/http";

export async function GET(request: Request) {
  await headers();
  try {
    await requireRole("admin");
    const params = new URL(request.url).searchParams;

    const rawFrom = params.get("from")?.trim() || undefined;
    const rawTo = params.get("to")?.trim() || undefined;
    if (rawFrom && !isIsoDate(rawFrom)) {
      throw fieldError("from", "Use a valid date (YYYY-MM-DD)");
    }
    if (rawTo && !isIsoDate(rawTo)) {
      throw fieldError("to", "Use a valid date (YYYY-MM-DD)");
    }

    const rawActorId = Number(params.get("actorId"));
    const { page, pageSize } = parsePagination(params);

    return Response.json(
      listAuditLogs({
        entity: params.get("entity")?.trim() || undefined,
        actor: params.get("actor")?.trim() || undefined,
        actorId: Number.isInteger(rawActorId) && rawActorId > 0 ? rawActorId : undefined,
        from: rawFrom,
        to: rawTo,
        page,
        pageSize,
      })
    );
  } catch (err) {
    return apiErrorJson(err);
  }
}
