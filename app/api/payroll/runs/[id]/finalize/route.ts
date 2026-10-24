import { headers } from "next/headers";
import { requireRole } from "@/lib/guards";
import { apiErrorJson, numericId } from "@/lib/services/http";
import { finalizeRun } from "@/lib/services/payroll";

type Context = { params: Promise<{ id: string }> };

export async function POST(_request: Request, { params }: Context) {
  await headers();
  try {
    const user = await requireRole("admin");
    const id = numericId((await params).id);
    return Response.json({ run: finalizeRun(id, user) });
  } catch (err) {
    return apiErrorJson(err);
  }
}
