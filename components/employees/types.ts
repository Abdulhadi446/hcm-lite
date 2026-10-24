export type Role = "admin" | "hr" | "employee";

export type EmployeeStatus = "active" | "probation" | "exited";

export type Employee = {
  id: number;
  code: string;
  fullName: string;
  email: string;
  phone: string | null;
  address: string | null;
  departmentId: number | null;
  departmentName: string | null;
  designationId: number | null;
  designationName: string | null;
  joinDate: string | null;
  status: EmployeeStatus;
  exitDate: string | null;
  basicSalary: number;
  grossSalary: number;
  hasLogin: boolean;
};

export type Department = { id: number; name: string; employeeCount: number };

export type Designation = {
  id: number;
  name: string;
  departmentId: number | null;
  departmentName: string | null;
};

export type EmployeeList = {
  items: Employee[];
  total: number;
  page: number;
  pageSize: number;
};

export type EmployeeOverview = {
  employee: Employee;
  attendance: {
    presentDays: number;
    lateDays: number;
    absentDays: number;
    last30: { date: string; status: string }[];
  };
  leave: { typeName: string; quota: number; used: number; remaining: number }[];
  payslips: { id: number; month: string; net: number }[];
};

export type ImportResult = {
  dryRun: boolean;
  total: number;
  valid: number;
  errors: { row: number; field: string; reason: string }[];
  created: Employee[];
};

export const STATUS_LABELS: Record<EmployeeStatus, string> = {
  active: "Active",
  probation: "Probation",
  exited: "Exited",
};

export const IMPORT_COLUMNS = [
  "code",
  "full_name",
  "email",
  "phone",
  "address",
  "department",
  "designation",
  "join_date",
  "status",
  "basic_salary",
] as const;

export function formatDate(iso: string | null | undefined) {
  if (!iso) return "—";
  const d = new Date(`${iso.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function formatMoney(value: number | null | undefined) {
  if (value == null || Number.isNaN(value)) return "—";
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(value);
}

/** Reads `{ error, fields }` out of a failed API response. */
export async function readApiError(res: Response) {
  let message = `Request failed (${res.status})`;
  let fields: Record<string, string> | undefined;
  try {
    const body = (await res.json()) as {
      error?: string;
      fields?: Record<string, string>;
    };
    if (body.error) message = body.error;
    fields = body.fields;
  } catch {
    /* non-JSON response */
  }
  return { message, fields };
}
