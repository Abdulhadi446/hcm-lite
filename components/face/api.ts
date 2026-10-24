import type { FaceRequestFailure } from "./types";

/**
 * Small request helper for the face endpoints. `apiFetch` throws away the
 * geofence details we need (`distance`, `radius`, `score`), so face calls use
 * this wrapper instead. Still a plain JSON fetch — no images ever leave here.
 */
export class FaceRequestError extends Error {
  status: number;
  code: string | null;
  distance: number | null;
  radius: number | null;
  score: number | null;

  constructor(
    message: string,
    details: {
      status: number;
      code?: string | null;
      distance?: number | null;
      radius?: number | null;
      score?: number | null;
    },
  ) {
    super(message);
    this.name = "FaceRequestError";
    this.status = details.status;
    this.code = details.code ?? null;
    this.distance = details.distance ?? null;
    this.radius = details.radius ?? null;
    this.score = details.score ?? null;
  }

  toFailure(): FaceRequestFailure {
    return {
      status: this.status,
      code: this.code,
      message: this.message,
      distance: this.distance,
      radius: this.radius,
      score: this.score,
    };
  }
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function fallbackMessage(status: number): string {
  if (status === 401) return "Your session expired. Sign in again.";
  if (status === 403) return "The server didn't accept this request.";
  if (status === 404) return "This endpoint isn't available yet. Try again shortly.";
  if (status === 429) return "Too many attempts. Wait a few minutes and try again.";
  if (status >= 500) return "The server ran into a problem. Try again in a moment.";
  return "Something went wrong. Try again.";
}

export async function faceRequest<T>(
  url: string,
  options: { method?: "GET" | "POST" | "DELETE"; body?: unknown } = {},
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, {
      method: options.method ?? "GET",
      headers:
        options.body === undefined ? undefined : { "Content-Type": "application/json" },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      cache: "no-store",
    });
  } catch {
    throw new FaceRequestError("Can't reach the server. Check your connection and try again.", {
      status: 0,
      code: "network",
    });
  }

  const text = await response.text();
  let payload: Record<string, unknown> = {};
  if (text) {
    try {
      payload = JSON.parse(text) as Record<string, unknown>;
    } catch {
      payload = {};
    }
  }

  if (!response.ok) {
    const code = typeof payload.error === "string" ? payload.error : null;
    throw new FaceRequestError(
      typeof payload.message === "string" ? payload.message : fallbackMessage(response.status),
      {
        status: response.status,
        code,
        distance: asNumber(payload.distance),
        radius: asNumber(payload.radius),
        score: asNumber(payload.score),
      },
    );
  }

  return payload as T;
}
