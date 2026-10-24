import { headers } from "next/headers";
import { ApiError, requireUser } from "@/lib/guards";
import { apiErrorJson, numericId } from "@/lib/services/http";
import { getEmployee, toScope, updateEmployee } from "@/lib/services/employees";
import { employeePatchSchema, readJsonBody, validationErrorResponse } from "@/lib/validation";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Context) {
  await headers();
  try {
    const user = await requireUser();
    const id = numericId((await params).id);
    return Response.json({ employee: getEmployee(id, toScope(user)) });
  } catch (err) {
    return apiErrorJson(err);
  }
}

export async function PATCH(request: Request, { params }: Context) {
  await headers();
  try {
    const user = await requireUser();
    const id = numericId((await params).id);

    const read = await readJsonBody(request);
    if (!read.ok) return read.response;

    // Employees may only edit their own contact details — reject any other key
    // before zod strips unknown fields.
    if (user.role === "employee") {
      if (user.employeeId === null || user.employeeId !== id) {
        throw new ApiError(403, "forbidden");
      }
      const allowed = new Set(["phone", "address"]);
      const raw = (read.raw ?? {}) as Record<string, unknown>;
      const keys = Object.keys(raw).filter((key) => raw[key] !== undefined);
      if (keys.some((key) => !allowed.has(key))) {
        throw new ApiError(403, "forbidden");
      }
    }

    const parsed = employeePatchSchema.safeParse(read.raw);
    if (!parsed.success) return validationErrorResponse(parsed.error);

    return Response.json({ employee: updateEmployee(id, parsed.data, user) });
  } catch (err) {
    return apiErrorJson(err);
  }
}

