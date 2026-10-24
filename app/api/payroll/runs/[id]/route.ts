import { headers } from "next/headers";
import { requireRole } from "@/lib/guards";
import { apiErrorJson, numericId } from "@/lib/services/http";
import { deleteRun, getRun } from "@/lib/services/payroll";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Context) {
  await headers();
  try {
    await requireRole("hr", "admin");
    const id = numericId((await params).id);
    return Response.json(getRun(id));
  } catch (err) {
    return apiErrorJson(err);
  }
}

export async function DELETE(_request: Request, { params }: Context) {
  await headers();
  try {
    const user = await requireRole("hr");
    const id = numericId((await params).id);
    return Response.json(deleteRun(id, user));
  } catch (err) {
    return apiErrorJson(err);
  }
}
