import "server-only";
import type { SessionUser } from "@/lib/auth";
import { getDb, queryAll, queryOne, run } from "@/lib/db";
import { ApiError } from "@/lib/guards";
import { isoToUtcMs, todayIso, utcMsToIso } from "@/lib/dates";
import { computeStatus, createCorrection } from "./attendance";
import { createAnnouncement } from "./comms";
import { createEmployee, type EmployeeStatus } from "./employees";
import { createLeaveRequest, reviewLeaveRequest } from "./leave";
import {
  createDepartment,
  createDesignation,
  createHoliday,
  getSettings,
  listLeaveTypes,
} from "./org";
import { createRun, finalizeRun } from "./payroll";
import {
  combineLocalDateTime,
  holidaySet,
  isWeekendDate,
  workingDates,
} from "./shared";

/**
 * One-click demo dataset for a brand-new install. Everything goes through the
 * normal service layer so attendance/leave/payroll maths, notifications and
 * audit rows stay exactly the same as a real user action.
 */

const DEMO_PASSWORD = "Demo@12345";
const DAY_MS = 24 * 60 * 60 * 1000;

export type SampleDataStatus = { employees: number; seeded: boolean };

export type SampleDataSeedResult = {
  created: {
    departments: number;
    designations: number;
    employees: number;
    attendanceDays: number;
    leaveRequests: number;
    payrollRuns: number;
    announcements: number;
  };
  credentials: { email: string; password: string }[];
};

type AttendanceBucket = "present" | "late" | "half_day" | "missing_checkout" | "absent";

type SeedState = {
  departmentIds: number[];
  designationIds: number[];
  employeeIds: number[];
  payrollRunIds: number[];
  announcementIds: number[];
  holidayIds: number[];
};

type SampleEmployee = {
  code: string;
  fullName: string;
  email: string;
  phone: string;
  address: string;
  departmentId: number | null;
  designationId: number | null;
  joinDate: string;
  status: EmployeeStatus;
  basicSalary: number;
};

type SeededEmployee = {
  employeeId: number;
  userId: number;
  name: string;
  email: string;
  joinDate: string;
};

function pad2(value: number): string {
  return value < 10 ? `0${value}` : String(value);
}

function addDays(iso: string, days: number): string {
  return utcMsToIso(isoToUtcMs(iso) + days * DAY_MS);
}

function hhmm(minutes: number): string {
  return `${pad2(Math.floor(minutes / 60))}:${pad2(minutes % 60)}`;
}

/** Join date N months back, clamped so day 31 never spills into the next month. */
function monthsAgoDate(monthsAgo: number, preferredDay: number): string {
  const [year, month] = todayIso().split("-").map(Number);
  const first = new Date(Date.UTC(year, month - 1 - monthsAgo, 1));
  const lastDay = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  const day = Math.min(Math.max(1, preferredDay), lastDay);
  return `${first.getUTCFullYear()}-${pad2(first.getUTCMonth() + 1)}-${pad2(day)}`;
}

/** A day in the current month that is already in the past (so proration shows). */
function thisMonthDate(preferredDay: number): string {
  const [year, month, day] = todayIso().split("-").map(Number);
  return `${year}-${pad2(month)}-${pad2(Math.min(Math.max(1, preferredDay), day))}`;
}

function nextMonday(): string {
  const today = todayIso();
  const weekday = new Date(isoToUtcMs(today)).getUTCDay();
  const delta = weekday === 1 ? 7 : (8 - weekday) % 7 || 7;
  return utcMsToIso(isoToUtcMs(today) + delta * DAY_MS);
}

/** Last `count` weekdays ending today (never future), oldest first. */
function lastWorkingDates(count: number, weekendDays: string): string[] {
  const holidays = holidaySet();
  const end = todayIso();
  const dates: string[] = [];
  for (let offset = 0; dates.length < count && offset < 120; offset += 1) {
    const date = utcMsToIso(isoToUtcMs(end) - offset * DAY_MS);
    if (!isWeekendDate(date, weekendDays) && !holidays.has(date)) dates.push(date);
  }
  return dates.reverse();
}

/**
 * Exactly 78 present / 10 late / 5 half-day / 3 missing check-out / 4 absent,
 * shuffled with a fixed seed so every run produces the same mix.
 */
const ATTENDANCE_BUCKETS: AttendanceBucket[] = (() => {
  const buckets: AttendanceBucket[] = [];
  for (let i = 0; i < 78; i += 1) buckets.push("present");
  for (let i = 0; i < 10; i += 1) buckets.push("late");
  for (let i = 0; i < 5; i += 1) buckets.push("half_day");
  for (let i = 0; i < 3; i += 1) buckets.push("missing_checkout");
  for (let i = 0; i < 4; i += 1) buckets.push("absent");

  let state = 0x9e3779b9;
  const random = () => {
    state = (state + 0x6d2b79f5) | 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
  for (let i = buckets.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [buckets[i], buckets[j]] = [buckets[j], buckets[i]];
  }
  return buckets;
})();

export function sampleDataStatus(): SampleDataStatus {
  const employees = Number(
    queryOne<{ c: number }>("SELECT COUNT(*) AS c FROM employees")?.c ?? 0
  );
  return { employees, seeded: employees > 0 };
}

function ensureDepartment(name: string, actorId: number, state: SeedState): number {
  const existing = queryOne<{ id: number }>(
    "SELECT id FROM departments WHERE lower(name) = lower(?)",
    name
  );
  if (existing) return Number(existing.id);
  const department = createDepartment({ name }, actorId);
  state.departmentIds.push(department.id);
  return department.id;
}

function ensureDesignation(
  name: string,
  departmentId: number,
  actorId: number,
  state: SeedState
): number {
  const existing = queryOne<{ id: number }>(
    "SELECT id FROM designations WHERE lower(name) = lower(?) AND COALESCE(department_id, 0) = ?",
    name,
    departmentId
  );
  if (existing) return Number(existing.id);
  const designation = createDesignation({ name, departmentId }, actorId);
  state.designationIds.push(designation.id);
  return designation.id;
}

function ensureHoliday(
  date: string,
  name: string,
  actorId: number,
  state: SeedState
): void {
  const existing = queryOne<{ id: number }>("SELECT id FROM holidays WHERE date = ?", date);
  if (existing) return;
  const holiday = createHoliday({ date, name }, actorId);
  state.holidayIds.push(holiday.id);
}

function seedEmployee(
  input: SampleEmployee,
  actor: SessionUser,
  state: SeedState
): SeededEmployee {
  const { employee } = createEmployee(
    {
      code: input.code,
      fullName: input.fullName,
      email: input.email,
      phone: input.phone,
      address: input.address,
      departmentId: input.departmentId,
      designationId: input.designationId,
      joinDate: input.joinDate,
      status: input.status,
      basicSalary: input.basicSalary,
      password: DEMO_PASSWORD,
    },
    actor
  );
  state.employeeIds.push(employee.id);

  // createEmployee intentionally forces a first-login password change; sample
  // logins are meant to be usable straight away.
  run("UPDATE users SET must_change_password = 0 WHERE employee_id = ?", employee.id);

  const user = queryOne<{ id: number; name: string; email: string }>(
    "SELECT id, name, email FROM users WHERE employee_id = ?",
    employee.id
  );
  if (!user) throw new Error("Seeded employee has no login");

  return {
    employeeId: employee.id,
    userId: Number(user.id),
    name: user.name,
    email: user.email,
    joinDate: input.joinDate,
  };
}

function employeeSession(base: SessionUser, employee: SeededEmployee): SessionUser {
  return {
    ...base,
    id: employee.userId,
    name: employee.name,
    email: employee.email,
    role: "employee",
    employeeId: employee.employeeId,
    mustChangePassword: false,
  };
}

/** Best-effort rollback for the non-transactional service calls used above. */
function cleanupSeed(state: SeedState): void {
  const db = getDb();
  const placeholders = (ids: number[]) => ids.map(() => "?").join(",");

  try {
    db.exec("BEGIN IMMEDIATE;");

    if (state.employeeIds.length > 0) {
      const employeeIds = placeholders(state.employeeIds);
      const users = queryAll<{ id: number }>(
        `SELECT id FROM users WHERE employee_id IN (${employeeIds})`,
        ...state.employeeIds
      );
      const userIds = users.map((row) => Number(row.id));
      if (userIds.length > 0) {
        const userPh = placeholders(userIds);
        run(`DELETE FROM audit_logs WHERE actor_user_id IN (${userPh})`, ...userIds);
      }
      run(`DELETE FROM users WHERE employee_id IN (${employeeIds})`, ...state.employeeIds);
    }

    if (state.payrollRunIds.length > 0) {
      run(
        `DELETE FROM payroll_runs WHERE id IN (${placeholders(state.payrollRunIds)})`,
        ...state.payrollRunIds
      );
    }
    if (state.announcementIds.length > 0) {
      run(
        `DELETE FROM announcements WHERE id IN (${placeholders(state.announcementIds)})`,
        ...state.announcementIds
      );
    }
    if (state.holidayIds.length > 0) {
      run(
        `DELETE FROM holidays WHERE id IN (${placeholders(state.holidayIds)})`,
        ...state.holidayIds
      );
    }
    if (state.employeeIds.length > 0) {
      run(
        `DELETE FROM employees WHERE id IN (${placeholders(state.employeeIds)})`,
        ...state.employeeIds
      );
    }
    if (state.designationIds.length > 0) {
      run(
        `DELETE FROM designations WHERE id IN (${placeholders(state.designationIds)})`,
        ...state.designationIds
      );
    }
    if (state.departmentIds.length > 0) {
      run(
        `DELETE FROM departments WHERE id IN (${placeholders(state.departmentIds)})`,
        ...state.departmentIds
      );
    }

    db.exec("COMMIT;");
  } catch (err) {
    try {
      db.exec("ROLLBACK;");
    } catch {
      /* already rolled back */
    }
    console.error("[seed] cleanup failed:", err);
  }
}

export function seedSampleData(actor: SessionUser): SampleDataSeedResult {
  if (actor.role !== "admin") throw new ApiError(403, "Forbidden");

  const existing = sampleDataStatus();
  if (existing.employees > 0) throw new ApiError(409, "not_empty");

  const state: SeedState = {
    departmentIds: [],
    designationIds: [],
    employeeIds: [],
    payrollRunIds: [],
    announcementIds: [],
    holidayIds: [],
  };

  try {
    const departments = new Map<string, number>();
    for (const name of ["Production", "Sales", "Engineering", "Finance"]) {
      departments.set(name, ensureDepartment(name, actor.id, state));
    }

    const designations = new Map<string, number>();
    designations.set(
      "Production Supervisor",
      ensureDesignation("Production Supervisor", departments.get("Production")!, actor.id, state)
    );
    designations.set(
      "Sales Executive",
      ensureDesignation("Sales Executive", departments.get("Sales")!, actor.id, state)
    );
    designations.set(
      "Software Engineer",
      ensureDesignation("Software Engineer", departments.get("Engineering")!, actor.id, state)
    );
    designations.set(
      "Accountant",
      ensureDesignation("Accountant", departments.get("Finance")!, actor.id, state)
    );
    designations.set(
      "Operations Coordinator",
      ensureDesignation("Operations Coordinator", departments.get("Production")!, actor.id, state)
    );

    ensureHoliday(addDays(todayIso(), 42), "Founders Day", actor.id, state);

    const employeeDefs: SampleEmployee[] = [
      {
        code: "EMP-001",
        fullName: "Ayesha Khan",
        email: "ayesha.khan@hcm.demo",
        phone: "+92 300 1112233",
        address: "Gulberg III, Lahore",
        departmentId: departments.get("Production")!,
        designationId: designations.get("Production Supervisor")!,
        joinDate: thisMonthDate(3),
        status: "active",
        basicSalary: 45_000,
      },
      {
        code: "EMP-002",
        fullName: "Bilal Ahmed",
        email: "bilal.ahmed@hcm.demo",
        phone: "+92 301 4445566",
        address: "Clifton Block 5, Karachi",
        departmentId: departments.get("Sales")!,
        designationId: designations.get("Sales Executive")!,
        joinDate: monthsAgoDate(12, 8),
        status: "active",
        basicSalary: 60_000,
      },
      {
        code: "EMP-003",
        fullName: "Hina Siddiqui",
        email: "hina.siddiqui@hcm.demo",
        phone: "+92 321 7778899",
        address: "F-11 Markaz, Islamabad",
        departmentId: departments.get("Engineering")!,
        designationId: designations.get("Software Engineer")!,
        joinDate: monthsAgoDate(9, 15),
        status: "probation",
        basicSalary: 85_000,
      },
      {
        code: "EMP-004",
        fullName: "Usman Raza",
        email: "usman.raza@hcm.demo",
        phone: "+92 333 1234567",
        address: "Model Town, Lahore",
        departmentId: departments.get("Finance")!,
        designationId: designations.get("Accountant")!,
        joinDate: monthsAgoDate(6, 1),
        status: "active",
        basicSalary: 100_000,
      },
      {
        code: "EMP-005",
        fullName: "Sana Malik",
        email: "sana.malik@hcm.demo",
        phone: "+92 345 9876543",
        address: "DHA Phase 6, Karachi",
        departmentId: departments.get("Engineering")!,
        designationId: designations.get("Software Engineer")!,
        joinDate: thisMonthDate(10),
        status: "active",
        basicSalary: 150_000,
      },
      {
        // No department or designation: the sample's "no manager" employee.
        code: "EMP-006",
        fullName: "Imran Sheikh",
        email: "imran.sheikh@hcm.demo",
        phone: "+92 300 5556677",
        address: "Bahria Town, Rawalpindi",
        departmentId: null,
        designationId: null,
        joinDate: monthsAgoDate(14, 20),
        status: "active",
        basicSalary: 250_000,
      },
    ];

    const employees: SeededEmployee[] = [];
    for (const definition of employeeDefs) {
      employees.push(seedEmployee(definition, actor, state));
    }

    // Attendance: the last 30 weekdays, with a fixed mix per employee/day.
    const settings = getSettings();
    const attendanceDates = lastWorkingDates(30, settings.weekendDays);
    let attendanceDays = 0;

    for (let employeeIndex = 0; employeeIndex < employees.length; employeeIndex += 1) {
      const employee = employees[employeeIndex];
      for (let dayIndex = 0; dayIndex < attendanceDates.length; dayIndex += 1) {
        const date = attendanceDates[dayIndex];
        if (date < employee.joinDate) continue;

        const bucket =
          ATTENDANCE_BUCKETS[
            (employeeIndex * 11 + dayIndex * 7) % ATTENDANCE_BUCKETS.length
          ];
        if (bucket === "absent") continue;

        const jitter = employeeIndex * 13 + dayIndex * 17;
        let checkInMinutes = 0;
        let checkOutMinutes: number | null = null;

        if (bucket === "present") {
          checkInMinutes = 8 * 60 + 40 + (jitter % 31); // 08:40–09:10
          checkOutMinutes = 17 * 60 + 30 + (jitter % 46); // 17:30–18:15
        } else if (bucket === "late") {
          checkInMinutes = 9 * 60 + 20 + (jitter % 46); // 09:20–10:05
          checkOutMinutes = 18 * 60 + (jitter % 41); // 18:00–18:40
        } else if (bucket === "half_day") {
          checkInMinutes = 9 * 60 + (jitter % 11); // 09:00–09:10
          checkOutMinutes = 12 * 60 + 45 + (jitter % 26); // 12:45–13:10
        } else {
          checkInMinutes = 8 * 60 + 50 + (jitter % 16); // 08:50–09:05
          checkOutMinutes = null;
        }

        const checkInAt = combineLocalDateTime(date, hhmm(checkInMinutes));
        const checkOutAt =
          checkOutMinutes === null ? null : combineLocalDateTime(date, hhmm(checkOutMinutes));
        const status = computeStatus(checkInAt, checkOutAt, settings);

        run(
          `INSERT INTO attendance (employee_id, date, check_in_at, check_out_at, status, source, note)
           VALUES (?, ?, ?, ?, ?, 'web', NULL)`,
          employee.employeeId,
          date,
          checkInAt,
          checkOutAt,
          status
        );
        attendanceDays += 1;
      }
    }

    // Leave types are seeded by org.ts; approve/reject through the service so
    // notifications and audit rows are written.
    const leaveTypes = listLeaveTypes();
    const leaveTypeId = (name: string): number => {
      const type = leaveTypes.find((item) => item.name.toLowerCase() === name.toLowerCase());
      if (!type) throw new Error(`Missing leave type: ${name}`);
      return type.id;
    };

    const weekStart = nextMonday();
    const nextWeek = workingDates(weekStart, addDays(weekStart, 13), settings, holidaySet());
    if (nextWeek.length < 5) throw new Error("Could not find five working days next week");
    const dayAt = (index: number) => nextWeek[Math.min(index, nextWeek.length - 1)];

    const hrActor: SessionUser = { ...actor, role: "hr", employeeId: null };

    const annual = createLeaveRequest(employeeSession(actor, employees[0]), {
      leaveTypeId: leaveTypeId("Annual"),
      startDate: dayAt(0),
      endDate: dayAt(1),
      reason: "Family wedding out of town.",
    });
    reviewLeaveRequest(hrActor, annual.id, {
      action: "approve",
      comment: "Approved — enjoy the wedding.",
    });

    createLeaveRequest(employeeSession(actor, employees[1]), {
      leaveTypeId: leaveTypeId("Sick"),
      startDate: dayAt(2),
      endDate: dayAt(3),
      reason: "Flu — the doctor advised two days of rest.",
    });

    const casual = createLeaveRequest(employeeSession(actor, employees[3]), {
      leaveTypeId: leaveTypeId("Casual"),
      startDate: dayAt(4),
      endDate: dayAt(4),
      reason: "Personal errand.",
    });
    reviewLeaveRequest(hrActor, casual.id, {
      action: "reject",
      comment: "Quarter-end close — please pick another day.",
    });

    // Payroll: last month locked and available on /payslips, this month still a
    // draft so the finalize flow can be demoed.
    const currentMonth = todayIso().slice(0, 7);
    const [currentYear, currentMonthNumber] = currentMonth.split("-").map(Number);
    const previousMonthDate = new Date(Date.UTC(currentYear, currentMonthNumber - 2, 1));
    const previousMonth = `${previousMonthDate.getUTCFullYear()}-${pad2(
      previousMonthDate.getUTCMonth() + 1
    )}`;

    const previousRun = createRun(previousMonth, actor);
    state.payrollRunIds.push(previousRun.run.id);
    finalizeRun(previousRun.run.id, actor);

    const currentRun = createRun(currentMonth, actor);
    state.payrollRunIds.push(currentRun.run.id);

    const pinned = createAnnouncement(
      {
        title: "Welcome to the sample workspace",
        body: "Attendance, leave and payroll are pre-filled so you can explore every screen. Sign in as any employee with the password Demo@12345.",
        pinned: true,
      },
      actor
    );
    state.announcementIds.push(pinned.id);

    const foundersDay = createAnnouncement(
      {
        title: "Founders Day is coming up",
        body: "The office will be closed for Founders Day in six weeks. Plan your sprints and leave accordingly.",
      },
      actor
    );
    state.announcementIds.push(foundersDay.id);

    // Two pending corrections give HR something to approve in the demo.
    const currentWorkdays = workingDates(`${currentMonth}-01`, todayIso(), settings, holidaySet());
    const latestWorkday = currentWorkdays.length
      ? currentWorkdays[currentWorkdays.length - 1]
      : todayIso();
    const earlierWorkday = currentWorkdays.length > 2
      ? currentWorkdays[currentWorkdays.length - 3]
      : latestWorkday;

    createCorrection(employeeSession(actor, employees[1]), {
      date: latestWorkday,
      requestedCheckIn: "09:00",
      requestedCheckOut: "18:15",
      reason: "Client call ran late — forgot to check out.",
    });
    createCorrection(employeeSession(actor, employees[2]), {
      date: earlierWorkday,
      requestedCheckIn: "08:55",
      requestedCheckOut: "17:40",
      reason: "The gate reader was offline when I arrived.",
    });

    return {
      created: {
        departments: state.departmentIds.length,
        designations: state.designationIds.length,
        employees: state.employeeIds.length,
        attendanceDays,
        leaveRequests: 3,
        payrollRuns: state.payrollRunIds.length,
        announcements: state.announcementIds.length,
      },
      credentials: employees.map((employee) => ({
        email: employee.email,
        password: DEMO_PASSWORD,
      })),
    };
  } catch (err) {
    cleanupSeed(state);
    throw err;
  }
}
