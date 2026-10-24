-- HCM Lite schema (frozen by docs/M0-CONTRACT.md). Executed idempotently on first DB open.
-- Timestamps: ISO-8601 text. Dates: YYYY-MM-DD. Booleans: 0|1 integers.

CREATE TABLE IF NOT EXISTS settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  company_name TEXT NOT NULL,
  office_start TEXT NOT NULL DEFAULT '09:00',
  grace_minutes INTEGER NOT NULL DEFAULT 15,
  half_day_minutes INTEGER NOT NULL DEFAULT 300,
  weekend_days TEXT NOT NULL DEFAULT 'sat,sun',
  office_lat REAL,
  office_lng REAL,
  radius_m INTEGER NOT NULL DEFAULT 150,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS departments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS designations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  department_id INTEGER NULL REFERENCES departments(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS employees (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  phone TEXT,
  address TEXT,
  department_id INTEGER NULL REFERENCES departments(id) ON DELETE SET NULL,
  designation_id INTEGER NULL REFERENCES designations(id) ON DELETE SET NULL,
  join_date TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'probation', 'exited')),
  exit_date TEXT,
  basic_salary REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'hr', 'employee')),
  employee_id INTEGER NULL REFERENCES employees(id) ON DELETE SET NULL,
  must_change_password INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS leave_types (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  quota_days REAL NOT NULL,
  paid INTEGER NOT NULL DEFAULT 1 CHECK (paid IN (0, 1))
);

CREATE TABLE IF NOT EXISTS holidays (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS attendance (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  check_in_at TEXT,
  check_out_at TEXT,
  status TEXT,
  source TEXT CHECK (source IN ('web', 'camera', 'correction')),
  note TEXT,
  UNIQUE (employee_id, date)
);

CREATE TABLE IF NOT EXISTS attendance_corrections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  requested_check_in TEXT,
  requested_check_out TEXT,
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewed_by INTEGER NULL REFERENCES users(id) ON DELETE SET NULL,
  review_comment TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS leave_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  leave_type_id INTEGER NOT NULL REFERENCES leave_types(id),
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  days REAL NOT NULL,
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
  reviewed_by INTEGER NULL REFERENCES users(id) ON DELETE SET NULL,
  review_comment TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS payroll_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  month TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'finalized')),
  working_days INTEGER NOT NULL,
  created_by INTEGER NOT NULL REFERENCES users(id),
  finalized_by INTEGER NULL REFERENCES users(id),
  finalized_at TEXT
);

CREATE TABLE IF NOT EXISTS payslips (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id INTEGER NOT NULL REFERENCES payroll_runs(id) ON DELETE CASCADE,
  employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  basic REAL NOT NULL,
  hra REAL NOT NULL,
  medical REAL NOT NULL,
  gross REAL NOT NULL,
  per_day REAL NOT NULL,
  absent_days REAL NOT NULL DEFAULT 0,
  unpaid_days REAL NOT NULL DEFAULT 0,
  half_days REAL NOT NULL DEFAULT 0,
  deductions REAL NOT NULL DEFAULT 0,
  tax REAL NOT NULL DEFAULT 0,
  net REAL NOT NULL,
  UNIQUE (run_id, employee_id)
);

CREATE TABLE IF NOT EXISTS announcements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  created_by INTEGER NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  read_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_user_id INTEGER NOT NULL REFERENCES users(id),
  action TEXT NOT NULL,
  entity TEXT NOT NULL,
  entity_id INTEGER,
  before_json TEXT,
  after_json TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS ai_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  prompt TEXT NOT NULL,
  tools_json TEXT,
  answer TEXT,
  created_at TEXT NOT NULL
);
