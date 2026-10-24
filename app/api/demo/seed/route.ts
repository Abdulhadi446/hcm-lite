import { headers } from "next/headers";
import { requireRole } from "@/lib/guards";
import { apiErrorJson } from "@/lib/services/http";
import { sampleDataStatus, seedSampleData } from "@/lib/services/seed";

export async function GET() {
  await headers();
  try {
    await requireRole("admin");
    return Response.json(sampleDataStatus());
  } catch (err) {
    return apiErrorJson(err);
  }
}

export async function POST() {
  await headers();
  try {
    const user = await requireRole("admin");
    return Response.json(seedSampleData(user), { status: 201 });
  } catch (err) {
    return apiErrorJson(err);
  }
}
