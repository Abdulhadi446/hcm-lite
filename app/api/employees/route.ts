import { headers } from "next/headers";
import { requireRole, requireUser } from "@/lib/guards";
import { apiErrorJson, parsePagination } from "@/lib/services/http";
import { createEmployee, listEmployees, toScope } from "@/lib/services/employees";
import { employeeCreateSchema, parseBody } from "@/lib/validation";

export async function GET(request: Request) {
  await headers();
  try {
    const user = await requireUser();
    const params = new URL(request.url).searchParams;

    const departmentRaw = params.get("departmentId");
    const departmentId =
      departmentRaw && /^\d+$/.test(departmentRaw) ? Number(departmentRaw) : undefined;
    const { page, pageSize } = parsePagination(params);

    return Response.json(
      listEmployees(
        {
          q: params.get("q") ?? undefined,
          departmentId,
          status: params.get("status"),
          page,
          pageSize,
          sort: params.get("sort"),
        },
        toScope(user)
      )
    );
  } catch (err) {
    return apiErrorJson(err);
  }
}

export async function POST(request: Request) {
  await headers();
  try {
    const user = await requireRole("hr");
    const parsed = await parseBody(request, employeeCreateSchema);
    if (!parsed.ok) return parsed.response;
    const result = createEmployee(parsed.data, user);
    return Response.json(result, { status: 201 });
  } catch (err) {
    return apiErrorJson(err);
  }
}
