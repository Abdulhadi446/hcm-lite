import { ApiError } from "@/lib/guards";

/**
 * ApiError that can carry machine-readable details on top of the frozen
 * `{ error }` envelope: `{ error, field? }` for duplicates or
 * `{ error, fields? }` for validation.
 */
export class ApiFieldError extends ApiError {
  field?: string;
  fields?: Record<string, string>;
  extra?: Record<string, unknown>;

  constructor(
    status: number,
    message: string,
    opts: {
      field?: string;
      fields?: Record<string, string>;
      extra?: Record<string, unknown>;
    } = {}
  ) {
    super(status, message);
    this.name = "ApiFieldError";
    this.field = opts.field;
    this.fields = opts.fields;
    this.extra = opts.extra;
  }
}

export function fieldError(field: string, message: string): ApiFieldError {
  return new ApiFieldError(400, message, { field, fields: { [field]: message } });
}

export function duplicateError(field: string): ApiFieldError {
  return new ApiFieldError(409, "duplicate", { field });
}

export function notFound(): ApiError {
  return new ApiError(404, "not_found");
}

/** Parse a numeric path id; anything else is a 404. */
export function numericId(value: string | undefined): number {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) throw notFound();
  return id;
}

/** Same mapping as `apiError`, plus the optional `field` / `fields` details. */
export function apiErrorJson(err: unknown): Response {
  if (err instanceof ApiError) {
    const body: Record<string, unknown> = { error: err.message };
    if (err instanceof ApiFieldError) {
      if (err.fields) body.fields = err.fields;
      else if (err.field) body.field = err.field;
      if (err.extra) Object.assign(body, err.extra);
    }
    return Response.json(body, { status: err.status });
  }
  console.error("[api] unhandled error:", err);
  return Response.json({ error: "Internal server error" }, { status: 500 });
}
