import { z } from "zod";
import { isIsoDate } from "./dates";

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

// ------------------------------------------------------------- helpers

const DAY_NAMES = new Set(["sun", "mon", "tue", "wed", "thu", "fri", "sat"]);

/** True when `csv` is a non-empty list of valid weekday abbreviations. */
export function isValidWeekendDays(csv: string): boolean {
  const parts = String(csv || "")
    .split(",")
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean);
  return parts.length > 0 && parts.every((part) => DAY_NAMES.has(part));
}

const isoDateString = z
  .string()
  .trim()
  .refine(isIsoDate, "Use a valid date (YYYY-MM-DD)");

const requiredText = (label: string, max: number) =>
  z.string().trim().min(1, `${label} is required`).max(max, `${label} is too long`);

const nullableText = (label: string, max: number) =>
  z.union([z.string().trim().max(max, `${label} is too long`), z.null()]).optional();

const timeString = z
  .string()
  .trim()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use a 24-hour time like 09:00");

const money = z
  .number()
  .positive("Basic salary must be greater than 0")
  .max(100_000_000, "Basic salary is too large");

const employeeStatus = z.enum(["active", "probation", "exited"]);

const optionalDepartmentId = z.number().int().positive().nullable().optional();

/** `{ error, fields }` 400 payload; `error` is the first readable message. */
export function validationErrorResponse(error: z.ZodError): Response {
  const fields: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.length
      ? issue.path.map((part) => String(part)).join(".")
      : "_";
    if (!(key in fields)) fields[key] = issue.message;
  }
  const first = error.issues[0]?.message ?? "Invalid request";
  return Response.json({ error: first, fields }, { status: 400 });
}

// ------------------------------------------------------------- schemas

export const settingsPatchSchema = z.object({
  companyName: requiredText("Company name", 200).optional(),
  officeStart: timeString.optional(),
  graceMinutes: z
    .number()
    .int("Grace minutes must be a whole number")
    .min(0, "Grace minutes must be 0 or more")
    .max(120, "Grace minutes must be 120 or less")
    .optional(),
  halfDayMinutes: z
    .number()
    .int("Half-day minutes must be a whole number")
    .min(60, "Half-day minutes must be at least 60")
    .max(720, "Half-day minutes must be 720 or less")
    .optional(),
  weekendDays: z.string().trim().min(1, "Weekend days are required").max(40).optional(),
  officeLat: z.number().min(-90, "Latitude must be between -90 and 90").max(90).nullable().optional(),
  officeLng: z.number().min(-180, "Longitude must be between -180 and 180").max(180).nullable().optional(),
  radiusM: z
    .number()
    .int("Radius must be a whole number")
    .min(20, "Radius must be at least 20 m")
    .max(5000, "Radius must be 5000 m or less")
    .optional(),
});

export const departmentSchema = z.object({
  name: requiredText("Department name", 100),
});

export const designationSchema = z.object({
  name: requiredText("Designation name", 100),
  departmentId: optionalDepartmentId,
});

export const leaveTypeCreateSchema = z.object({
  name: requiredText("Leave type name", 100),
  quotaDays: z
    .number()
    .min(0, "Quota must be 0 or more")
    .max(365, "Quota must be 365 days or less"),
  paid: z.boolean(),
});

export const leaveTypePatchSchema = leaveTypeCreateSchema.partial();

export const holidaySchema = z.object({
  date: isoDateString,
  name: requiredText("Holiday name", 200),
});

export const userCreateSchema = z.object({
  name: requiredText("Name", 200),
  email: z.email("A valid email is required").trim().toLowerCase(),
  role: z.enum(["admin", "hr"]),
  password: z.string().min(8, "Password must be at least 8 characters").optional(),
});

export const userPatchSchema = z.object({
  active: z.boolean().optional(),
});

export const employeeCreateSchema = z.object({
  code: requiredText("Employee code", 50),
  fullName: requiredText("Full name", 200),
  email: z.email("A valid email is required").trim().toLowerCase(),
  phone: nullableText("Phone", 50),
  address: nullableText("Address", 500),
  departmentId: optionalDepartmentId,
  designationId: optionalDepartmentId,
  joinDate: isoDateString,
  status: employeeStatus.default("active"),
  basicSalary: money,
  password: z.string().min(8, "Password must be at least 8 characters").optional(),
});

export const employeePatchSchema = z.object({
  fullName: requiredText("Full name", 200).optional(),
  email: z.email("A valid email is required").trim().toLowerCase().optional(),
  phone: nullableText("Phone", 50),
  address: nullableText("Address", 500),
  departmentId: optionalDepartmentId,
  designationId: optionalDepartmentId,
  joinDate: isoDateString.optional(),
  status: employeeStatus.optional(),
  exitDate: z.union([isoDateString, z.null()]).optional(),
  basicSalary: money.optional(),
  password: z.string().min(8, "Password must be at least 8 characters").optional(),
});

// ------------------------------------------------------ M3 attendance

const hhmmString = z
  .string()
  .trim()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use a 24-hour time like 09:00");

export const correctionCreateSchema = z.object({
  date: isoDateString,
  requestedCheckIn: hhmmString,
  requestedCheckOut: hhmmString,
  reason: requiredText("Reason", 500),
});

export const correctionReviewSchema = z.object({
  action: z.enum(["approve", "reject"]),
  comment: z.string().trim().max(500, "Comment is too long").optional(),
});

// ------------------------------------------------------------ M4 leave

export const leaveRequestCreateSchema = z.object({
  leaveTypeId: z.number().int("Choose a leave type").positive("Choose a leave type"),
  startDate: isoDateString,
  endDate: isoDateString,
  reason: requiredText("Reason", 500),
});

export const leaveReviewSchema = z.object({
  action: z.enum(["approve", "reject"]),
  comment: z.string().trim().max(500, "Comment is too long").optional(),
});

// ---------------------------------------------------------- M5 payroll

export const monthString = z
  .string()
  .trim()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Use a month like 2026-09");

export const payrollRunCreateSchema = z.object({
  month: monthString,
});

export const announcementCreateSchema = z.object({
  title: requiredText("Title", 200),
  body: requiredText("Message", 5000),
  pinned: z.boolean().optional(),
});

export const announcementPatchSchema = z.object({
  title: requiredText("Title", 200).optional(),
  body: requiredText("Message", 5000).optional(),
  pinned: z.boolean().optional(),
});

export type EmployeeCreateInput = z.output<typeof employeeCreateSchema>;
export type EmployeePatchInput = z.output<typeof employeePatchSchema>;
export type SettingsPatchInput = z.output<typeof settingsPatchSchema>;
export type AnnouncementCreateInput = z.output<typeof announcementCreateSchema>;
export type AnnouncementPatchInput = z.output<typeof announcementPatchSchema>;
export type CorrectionCreateInput = z.output<typeof correctionCreateSchema>;
export type CorrectionReviewInput = z.output<typeof correctionReviewSchema>;
export type LeaveRequestCreateInput = z.output<typeof leaveRequestCreateSchema>;
export type LeaveReviewInput = z.output<typeof leaveReviewSchema>;
export type PayrollRunCreateInput = z.output<typeof payrollRunCreateSchema>;

// -------------------------------------------------------------- parsing

export type ParsedBody<T extends z.ZodType> =
  | { ok: true; data: z.output<T> }
  | { ok: false; response: Response };

/** Read a JSON body without validating it (used where raw keys matter). */
export async function readJsonBody(
  request: Request
): Promise<{ ok: true; raw: unknown } | { ok: false; response: Response }> {
  try {
    return { ok: true, raw: await request.json() };
  } catch {
    return { ok: false, response: Response.json({ error: "Invalid JSON body" }, { status: 400 }) };
  }
}

/** Validate a JSON request body; 400 `{ error, fields }` on failure. */
export async function parseBody<T extends z.ZodType>(
  request: Request,
  schema: T
): Promise<ParsedBody<T>> {
  const read = await readJsonBody(request);
  if (!read.ok) return read;
  const result = schema.safeParse(read.raw);
  if (!result.success) {
    return { ok: false, response: validationErrorResponse(result.error) };
  }
  return { ok: true, data: result.data };
}

export { isoDateString, money, employeeStatus };
