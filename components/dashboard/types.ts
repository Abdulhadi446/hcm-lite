/** Shapes returned by /api/dashboard/summary and /api/dashboard/employee. */

export type DashboardKpis = {
  headcount: number;
  workingDays: number;
  presentDays: number;
  lateDays: number;
  halfDays: number;
  onLeaveDays: number;
  absentDays: number;
  attendedDays: number;
  expectedDays: number;
  newHires: number;
  attendanceRate: number;
  latePct: number;
  absenteeismRate: number;
  attritionRate: number;
  leaveUtilization: number;
  payrollCost: number;
  payrollLabel: string;
  payrollHasDraft: boolean;
  avgTenureMonths: number;
  openCorrections: number;
  pendingLeaves: number;
  /** Mean monthly gross (1.5 x basic) over the in-scope roster. */
  avgSalary: number;
  /** Exits this calendar year / average headcount, as a percentage. */
  attritionYtd: number;
};

export type TodaySnapshot = {
  date: string;
  isWorkingDay: boolean;
  headcount: number;
  present: number;
  late: number;
  halfDay: number;
  onLeave: number;
  absent: number;
};

export type TrendPoint = { date: string; present: number; late: number; absent: number };

export type DepartmentBreakdown = {
  departmentId: number | null;
  departmentName: string;
  headcount: number;
  attendanceRate: number;
  latePct: number;
};

export type RecentHire = {
  id: number;
  name: string;
  code: string;
  departmentName: string | null;
  joinDate: string;
};

export type HolidayItem = { id: number; date: string; name: string };

export type DashboardScope = {
  from: string;
  to: string;
  departmentId: number | null;
  employeeId: number | null;
  role: "admin" | "hr" | "employee";
};

export type LateComerRow = {
  employeeId: number;
  name: string;
  code: string;
  departmentName: string | null;
  lateDays: number;
};

export type LeaveTypeRow = {
  leaveTypeId: number;
  typeName: string;
  approvedDays: number;
  entitlementDays: number;
  utilization: number;
};

export type PayrollDeptRow = {
  departmentId: number | null;
  departmentName: string;
  headcount: number;
  payrollCost: number;
  avgSalary: number;
};

export type InsightLists = {
  topLateComers: LateComerRow[];
  leaveByType: LeaveTypeRow[];
  payrollByDepartment: PayrollDeptRow[];
};

export type DashboardSummary = {
  scope: DashboardScope;
  kpis: DashboardKpis;
  today: TodaySnapshot;
  trend: TrendPoint[];
  byDepartment: DepartmentBreakdown[];
  insights: InsightLists;
  pending: { leaves: number; corrections: number };
  recentHires: RecentHire[];
  upcomingHolidays: HolidayItem[];
};

export type LeaveBalanceItem = {
  employeeId: number;
  leaveTypeId: number;
  typeName: string;
  quota: number;
  used: number;
  pending: number;
  remaining: number | null;
};

export type LastPayslip = {
  id: number;
  month: string;
  net: number;
  gross: number;
  tax: number;
  deductions: number;
};

export type EmployeeDashboard = {
  me: {
    employeeId: number | null;
    month: string;
    workingDays: number;
    attendanceRate: number;
    presentDays: number;
    lateDays: number;
    halfDays: number;
    onLeaveDays: number;
    absentDays: number;
    hoursThisWeek: number;
  };
  leaveBalances: LeaveBalanceItem[];
  lastPayslip: LastPayslip | null;
  upcomingHolidays: HolidayItem[];
};
