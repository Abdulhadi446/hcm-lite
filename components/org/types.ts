export type Role = "admin" | "hr" | "employee";

export type Settings = {
  companyName: string;
  officeStart: string;
  graceMinutes: number;
  halfDayMinutes: number;
  weekendDays: string;
  officeLat: number | null;
  officeLng: number | null;
  radiusM: number;
};

export type Department = {
  id: number;
  name: string;
  employeeCount: number;
};

export type Designation = {
  id: number;
  name: string;
  departmentId: number | null;
  departmentName: string | null;
};

export type LeaveType = {
  id: number;
  name: string;
  quotaDays: number;
  paid: boolean;
};

export type Holiday = {
  id: number;
  date: string;
  name: string;
};

export type UserRow = {
  id: number;
  name: string;
  email: string;
  role: Role;
  employeeId: number | null;
  active: boolean;
  mustChangePassword: boolean;
  createdAt: string;
};
