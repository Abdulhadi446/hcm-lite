import { headers } from "next/headers";
import { requireUser } from "@/lib/guards";
import { apiErrorJson, numericId } from "@/lib/services/http";
import { employeeOverview, toScope } from "@/lib/services/employees";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Context) {
  await headers();
  try {
    const user = await requireUser();
    const id = numericId((await params).id);
    return Response.json(employeeOverview(id, toScope(user)));
  } catch (err) {
    return apiErrorJson(err);
  }
}
