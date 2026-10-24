import { headers } from "next/headers";
import { requireRole } from "@/lib/guards";
import { ApiFieldError, apiErrorJson } from "@/lib/services/http";
import { csvToImportRows, importEmployees } from "@/lib/services/employees";

export async function POST(request: Request) {
  await headers();
  try {
    const user = await requireRole("hr");

    const dryRunParam = (new URL(request.url).searchParams.get("dryRun") ?? "").toLowerCase();
    const dryRun = dryRunParam === "1" || dryRunParam === "true";

    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      throw new ApiFieldError(400, "Upload a CSV file in the `file` field", { field: "file" });
    }

    const file = form.get("file");
    if (!(file instanceof File) || file.size === 0) {
      throw new ApiFieldError(400, "CSV file is required", { field: "file" });
    }

    const text = await file.text();
    const rows = csvToImportRows(text);
    const result = importEmployees(rows, user, dryRun);
    return Response.json(result);
  } catch (err) {
    return apiErrorJson(err);
  }
}
