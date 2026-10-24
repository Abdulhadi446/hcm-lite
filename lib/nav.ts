export type NavItem = {
  path: string;
  label: string;
  icon: string;
};

export const NAV_BY_ROLE: Record<string, NavItem[]> = {
  admin: [
    { path: "/dashboard", label: "Dashboard", icon: "LayoutDashboard" },
    { path: "/employees", label: "Employees", icon: "Users" },
    { path: "/attendance", label: "Attendance", icon: "Clock" },
    { path: "/leave", label: "Leave", icon: "Calendar" },
    { path: "/payroll", label: "Payroll", icon: "CreditCard" },
    { path: "/organization", label: "Organization", icon: "Building" },
    { path: "/announcements", label: "Announcements", icon: "Megaphone" },
    { path: "/audit", label: "Audit", icon: "ShieldAlert" },
    { path: "/ai", label: "AI Assistant", icon: "Bot" },
  ],
  hr: [
    { path: "/dashboard", label: "Dashboard", icon: "LayoutDashboard" },
    { path: "/employees", label: "Employees", icon: "Users" },
    { path: "/attendance", label: "Attendance", icon: "Clock" },
    { path: "/leave", label: "Leave", icon: "Calendar" },
    { path: "/payroll", label: "Payroll", icon: "CreditCard" },
    { path: "/organization", label: "Organization", icon: "Building" },
    { path: "/announcements", label: "Announcements", icon: "Megaphone" },
    { path: "/ai", label: "AI Assistant", icon: "Bot" },
  ],
  employee: [
    { path: "/dashboard", label: "Dashboard", icon: "LayoutDashboard" },
    { path: "/my-attendance", label: "My Attendance", icon: "Clock" },
    { path: "/my-leave", label: "My Leave", icon: "Calendar" },
    { path: "/payslips", label: "Payslips", icon: "FileText" },
    { path: "/announcements", label: "Announcements", icon: "Megaphone" },
    { path: "/ai", label: "AI Assistant", icon: "Bot" },
  ],
};

export function navItemsFor(role: string): NavItem[] {
  return NAV_BY_ROLE[role] ?? NAV_BY_ROLE.employee;
}
