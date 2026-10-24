type ApiFailure = {
  error?: string;
  field?: string;
  fields?: Record<string, string>;
};

const FIELD_LABELS: Record<string, string> = {
  name: "name",
  email: "email",
  code: "employee code",
  companyName: "company name",
  officeStart: "office start",
  graceMinutes: "grace minutes",
  halfDayMinutes: "half-day minutes",
  weekendDays: "weekend days",
  officeLat: "latitude",
  officeLng: "longitude",
  radiusM: "radius",
  quotaDays: "quota",
  date: "date",
  departmentId: "department",
  password: "password",
};

export class ApiRequestError extends Error {
  status: number;
  code?: string;
  field?: string;
  fields?: Record<string, string>;

  constructor(
    message: string,
    details: { status: number; code?: string; field?: string; fields?: Record<string, string> },
  ) {
    super(message);
    this.name = "ApiRequestError";
    this.status = details.status;
    this.code = details.code;
    this.field = details.field;
    this.fields = details.fields;
  }
}

function messageFor(status: number, body: ApiFailure): string {
  const code = typeof body.error === "string" ? body.error : "";

  switch (code) {
    case "duplicate": {
      if (body.field === "email") return "That email is already used by another login.";
      const label = body.field ? (FIELD_LABELS[body.field] ?? body.field) : "value";
      return `That ${label} is already taken. Try a different one.`;
    }
    case "in_use":
      return "This is still in use, so it can't be deleted.";
    case "not_found":
      return "That record no longer exists. Refresh the page and try again.";
    case "cannot_deactivate_self":
      return "You can't deactivate your own account.";
    case "forbidden":
      return "Only an admin can make this change.";
    case "unauthorized":
      return "Your session expired. Sign in again to continue.";
    default:
      // The API sometimes returns a ready-to-read sentence instead of a code.
      if (code && /\s/.test(code)) return code;
  }

  if (status === 404) return "This isn't available yet. The server may still be getting it ready.";
  if (status === 401) return "Your session expired. Sign in again to continue.";
  if (status === 403) return "You don't have permission to do that.";
  if (status === 409) return "That already exists. Try a different value.";
  if (status >= 500) return "The server ran into a problem. Try again in a moment.";
  return "Something went wrong. Try again.";
}

export async function api<T>(
  url: string,
  options: { method?: "GET" | "POST" | "PATCH" | "DELETE"; body?: unknown; signal?: AbortSignal } = {},
): Promise<T> {
  let res: Response;

  try {
    res = await fetch(url, {
      method: options.method ?? "GET",
      headers: options.body === undefined ? undefined : { "Content-Type": "application/json" },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: options.signal,
      cache: "no-store",
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") throw err;
    throw new ApiRequestError("Can't reach the server. Check your connection and try again.", {
      status: 0,
    });
  }

  const text = await res.text();
  let payload: ApiFailure & Record<string, unknown> = {};
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = {};
    }
  }

  if (!res.ok) {
    throw new ApiRequestError(messageFor(res.status, payload), {
      status: res.status,
      code: payload.error,
      field: payload.field,
      fields: payload.fields,
    });
  }

  return payload as T;
}

export function readableError(err: unknown): string {
  if (err instanceof ApiRequestError) return err.message;
  if (err instanceof Error && err.message) return err.message;
  return "Something went wrong. Try again.";
}
