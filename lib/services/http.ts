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

// --------------------------------------------------------------- pagination

export const MIN_PAGE = 1;
export const MAX_PAGE = 10_000;
export const MIN_PAGE_SIZE = 1;
export const MAX_PAGE_SIZE = 100;
export const DEFAULT_PAGE_SIZE = 20;

/**
 * Defensive, non-throwing clamp for service-level callers. Keeps
 * `(page - 1) * pageSize` far away from SQLite's REAL/INTEGER mismatch.
 */
export function normalizePage(value: unknown, fallback = MIN_PAGE): number {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  const page = Math.trunc(number);
  if (page < MIN_PAGE) return fallback;
  return Math.min(page, MAX_PAGE);
}

export function normalizePageSize(value: unknown, fallback = DEFAULT_PAGE_SIZE): number {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  const pageSize = Math.trunc(number);
  if (pageSize < MIN_PAGE_SIZE) return fallback;
  return Math.min(pageSize, MAX_PAGE_SIZE);
}

function paginationParam(
  raw: string | null,
  name: "page" | "pageSize",
  min: number,
  max: number,
  fallback: number
): number {
  if (raw === null || raw.trim() === "") return fallback;

  const value = Number(raw);
  const message = `${name} must be an integer between ${min} and ${max}`;
  if (!Number.isFinite(value) || !Number.isInteger(value) || value < min) {
    throw new ApiFieldError(400, "validation_error", {
      field: name,
      fields: { [name]: message },
    });
  }
  // Absurdly large values cannot be represented safely as SQLite integers.
  // Reject them instead of letting the offset overflow; merely large values
  // below MAX_SAFE_INTEGER are clamped to the documented bound.
  if (value > Number.MAX_SAFE_INTEGER) {
    throw new ApiFieldError(400, "validation_error", {
      field: name,
      fields: { [name]: message },
    });
  }
  return Math.min(value, max);
}

/** Parse `page` / `pageSize` query params for route handlers. */
export function parsePagination(
  params: URLSearchParams,
  defaultPageSize = DEFAULT_PAGE_SIZE
): { page: number; pageSize: number } {
  return {
    page: paginationParam(params.get("page"), "page", MIN_PAGE, MAX_PAGE, MIN_PAGE),
    pageSize: paginationParam(
      params.get("pageSize"),
      "pageSize",
      MIN_PAGE_SIZE,
      MAX_PAGE_SIZE,
      defaultPageSize
    ),
  };
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
