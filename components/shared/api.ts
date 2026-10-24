type ApiFailure = {
  error?: string;
  fields?: Record<string, string>;
  remaining?: number | null;
};

export class ApiRequestError extends Error {
  status: number;
  code?: string;
  fields?: Record<string, string>;
  remaining?: number | null;

  constructor(
    message: string,
    details: {
      status: number;
      code?: string;
      fields?: Record<string, string>;
      remaining?: number | null;
    },
  ) {
    super(message);
    this.name = "ApiRequestError";
    this.status = details.status;
    this.code = details.code;
    this.fields = details.fields;
    this.remaining = details.remaining;
  }
}

const MESSAGES: Record<string, string> = {
  already_checked_in: "You've already checked in today.",
  not_checked_in: "Check in first — there's no check-in on record for today.",
  already_checked_out: "You've already checked out today.",
  day_locked: "That day is inside a locked payroll month, so it can't be corrected.",
  overlap: "This overlaps a leave request you already have. Pick different dates.",
  insufficient_balance: "There isn't enough leave balance for those dates.",
  already_exists: "A payroll run already exists for that month.",
  locked: "This payroll run is finalized and locked.",
  not_draft: "Only a draft run can be changed.",
  forbidden: "You don't have permission to do that.",
  unauthorized: "Your session expired. Sign in again to continue.",
  not_found: "That record no longer exists. Refresh the page and try again.",
  cannot_approve: "This request can't be approved in its current state.",
};

function messageFor(status: number, body: ApiFailure): string {
  const code = typeof body.error === "string" ? body.error : "";
  const base = MESSAGES[code];

  if (base) {
    if (code === "insufficient_balance" && typeof body.remaining === "number") {
      return `${base} ${body.remaining} day${body.remaining === 1 ? "" : "s"} left.`;
    }
    return base;
  }

  if (code && /\s/.test(code)) return code;
  if (status === 403) return MESSAGES.forbidden;
  if (status === 404) return "This isn't available yet. The server may still be getting it ready.";
  if (status === 401) return MESSAGES.unauthorized;
  if (status === 409) return "That already exists. Try a different value.";
  if (status >= 500) return "The server ran into a problem. Try again in a moment.";
  return "Something went wrong. Try again.";
}

export async function apiFetch<T>(
  url: string,
  options: {
    method?: "GET" | "POST" | "PATCH" | "DELETE";
    body?: unknown;
    signal?: AbortSignal;
  } = {},
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
      payload = JSON.parse(text) as ApiFailure & Record<string, unknown>;
    } catch {
      payload = {};
    }
  }

  if (!res.ok) {
    throw new ApiRequestError(messageFor(res.status, payload), {
      status: res.status,
      code: payload.error,
      fields: payload.fields,
      remaining: payload.remaining,
    });
  }

  return payload as T;
}

export function readableError(err: unknown): string {
  if (err instanceof ApiRequestError) return err.message;
  if (err instanceof Error && err.message) return err.message;
  return "Something went wrong. Try again.";
}
