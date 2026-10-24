import { z } from "zod";

export const setupSchema = z.object({
  companyName: z.string().trim().min(1, "Company name is required").max(200),
  adminName: z.string().trim().min(1, "Admin name is required").max(200),
  adminEmail: z.email("A valid email is required").trim().toLowerCase(),
  adminPassword: z.string().min(8, "Password must be at least 8 characters"),
});

export const loginSchema = z.object({
  email: z.email("A valid email is required").trim().toLowerCase(),
  password: z.string().min(1, "Password is required"),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required"),
  newPassword: z.string().min(8, "Password must be at least 8 characters"),
});

export type ParsedBody<T extends z.ZodType> =
  | { ok: true; data: z.output<T> }
  | { ok: false; response: Response };

/** Validate a JSON request body; produce a 400 {error} response on failure. */
export async function parseBody<T extends z.ZodType>(
  request: Request,
  schema: T
): Promise<ParsedBody<T>> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return { ok: false, response: Response.json({ error: "Invalid JSON body" }, { status: 400 }) };
  }
  const result = schema.safeParse(raw);
  if (!result.success) {
    const first = result.error.issues[0];
    return { ok: false, response: Response.json({ error: first?.message ?? "Invalid request" }, { status: 400 }) };
  }
  return { ok: true, data: result.data };
}
