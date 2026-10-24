import { headers } from "next/headers";
import { requireUser } from "@/lib/guards";
import { apiErrorJson, fieldError } from "@/lib/services/http";
import { createLeaveRequest, listLeaveRequests } from "@/lib/services/leave";
import { leaveRequestCreateSchema, parseBody } from "@/lib/validation";

export async function GET(request: Request) {
  await headers();
  try {
    const user = await requireUser();
    const params = new URL(request.url).searchParams;

    const month = params.get("month") ?? undefined;
    if (month && !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
      throw fieldError("month", "Use a month like 2026-09");
    }

    const employeeRaw = params.get("employeeId");
    let employeeId: number | undefined;
    if (employeeRaw !== null) {
      if (!/^\d+$/.test(employeeRaw)) {
        throw fieldError("employeeId", "employeeId must be a number");
      }
      employeeId = Number(employeeRaw);
    }

    return Response.json(
      listLeaveRequests(user, {
        status: params.get("status") ?? undefined,
        employeeId,
        month,
      })
    );
  } catch (err) {
    return apiErrorJson(err);
  }
}

export async function POST(request: Request) {
  await headers();
  try {
    const user = await requireUser();
    const parsed = await parseBody(request, leaveRequestCreateSchema);
    if (!parsed.ok) return parsed.response;
    return Response.json(
      { request: createLeaveRequest(user, parsed.data) },
      { status: 201 }
    );
  } catch (err) {
    return apiErrorJson(err);
  }
}
