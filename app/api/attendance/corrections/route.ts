import { headers } from "next/headers";
import { requireUser } from "@/lib/guards";
import { apiErrorJson } from "@/lib/services/http";
import { createCorrection, listCorrections } from "@/lib/services/attendance";
import { correctionCreateSchema, parseBody } from "@/lib/validation";

export async function GET(request: Request) {
  await headers();
  try {
    const user = await requireUser();
    const status = new URL(request.url).searchParams.get("status") ?? undefined;
    return Response.json(listCorrections(user, { status }));
  } catch (err) {
    return apiErrorJson(err);
  }
}

export async function POST(request: Request) {
  await headers();
  try {
    const user = await requireUser();
    const parsed = await parseBody(request, correctionCreateSchema);
    if (!parsed.ok) return parsed.response;
    return Response.json(
      { correction: createCorrection(user, parsed.data) },
      { status: 201 }
    );
  } catch (err) {
    return apiErrorJson(err);
  }
}
