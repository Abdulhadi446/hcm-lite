"use client";

import Link from "next/link";
import {
  ArrowLeftIcon,
  CalendarDaysIcon,
  KeyRoundIcon,
  MailIcon,
  PhoneIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "./status-badge";
import { formatDate, type Employee, type Role } from "./types";

export function BackLink({ role }: { role: Role }) {
  const isEmployee = role === "employee";
  return (
    <Link
      href={isEmployee ? "/dashboard" : "/employees"}
      className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
    >
      <ArrowLeftIcon className="size-3.5" />
      {isEmployee ? "Dashboard" : "Employees"}
    </Link>
  );
}

export function ProfileCard({ employee }: { employee: Employee }) {
  const initial = employee.fullName.trim().charAt(0).toUpperCase() || "?";
  const subtitle = [employee.departmentName ?? "No department", employee.designationName]
    .filter(Boolean)
    .join(" · ");

  return (
    <Card>
      <CardContent className="p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <div className="flex size-12 shrink-0 items-center justify-center rounded-full bg-primary/10 text-lg font-semibold text-primary">
            {initial}
          </div>
          <div className="min-w-0 space-y-1.5">
            <h1 className="truncate text-lg font-semibold tracking-tight">{employee.fullName}</h1>
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-xs text-muted-foreground">{employee.code}</span>
              <StatusBadge status={employee.status} />
            </div>
            <p className="text-sm text-muted-foreground">{subtitle}</p>
          </div>
        </div>

        <dl className="mt-4 grid gap-3 border-t border-border pt-4 text-sm">
          <InfoRow icon={<MailIcon />} label="Email" value={employee.email} />
          <InfoRow icon={<PhoneIcon />} label="Phone" value={employee.phone ?? "—"} />
          <InfoRow icon={<CalendarDaysIcon />} label="Joined" value={formatDate(employee.joinDate)} />
          {employee.status === "exited" && employee.exitDate ? (
            <InfoRow
              icon={<CalendarDaysIcon />}
              label="Exited"
              value={formatDate(employee.exitDate)}
            />
          ) : null}
          {employee.address ? (
            <div>
              <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">Address</dt>
              <dd className="mt-1 text-sm whitespace-pre-line">{employee.address}</dd>
            </div>
          ) : null}
        </dl>
      </CardContent>
    </Card>
  );
}

export function AccountCard({
  employee,
  canReset,
  resetting,
  isSelf,
  mustChangePassword,
  onReset,
}: {
  employee: Employee;
  canReset: boolean;
  resetting: boolean;
  isSelf: boolean;
  mustChangePassword: boolean | null;
  onReset: () => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Account</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 pt-0 text-sm">
        <div className="flex items-center justify-between gap-2">
          <span className="text-muted-foreground">Login</span>
          {employee.hasLogin ? (
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700">
              <span className="size-1.5 rounded-full bg-emerald-500" />
              Has login
            </span>
          ) : (
            <span className="text-xs text-muted-foreground">No login</span>
          )}
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-muted-foreground">Role</span>
          <span className="text-xs font-medium">Employee</span>
        </div>
        {isSelf && mustChangePassword !== null ? (
          <div className="flex items-center justify-between gap-2">
            <span className="text-muted-foreground">Password</span>
            <span
              className={
                mustChangePassword
                  ? "text-xs font-medium text-amber-600"
                  : "text-xs text-muted-foreground"
              }
            >
              {mustChangePassword ? "Must change on next sign-in" : "Up to date"}
            </span>
          </div>
        ) : null}
        {canReset && employee.hasLogin ? (
          <div className="border-t border-border pt-3">
            <Button
              size="sm"
              variant="outline"
              className="w-full"
              onClick={onReset}
              disabled={resetting}
            >
              <KeyRoundIcon />
              {resetting ? "Resetting…" : "Reset password"}
            </Button>
            <p className="mt-1.5 text-[11px] text-muted-foreground">
              Shows a one-time temporary password.
            </p>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function InfoRow({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-2">
      <span className="mt-0.5 text-muted-foreground [&_svg]:size-3.5">{icon}</span>
      <div className="min-w-0">
        <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</dt>
        <dd className="truncate text-sm">{value}</dd>
      </div>
    </div>
  );
}

export function ProfileSkeleton() {
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <Skeleton className="h-3.5 w-24" />
        <Skeleton className="h-7 w-20" />
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4">
          <Card>
            <CardContent className="space-y-4 p-5">
              <div className="flex items-center gap-3">
                <Skeleton className="size-12 rounded-full" />
                <div className="space-y-2">
                  <Skeleton className="h-5 w-40" />
                  <Skeleton className="h-4 w-28" />
                </div>
              </div>
              <Skeleton className="h-px w-full" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-3/4" />
            </CardContent>
          </Card>
          <Card>
            <CardContent className="space-y-3 p-5">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-2/3" />
            </CardContent>
          </Card>
        </div>
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardContent className="space-y-3 p-5">
              <Skeleton className="h-4 w-28" />
              <div className="grid grid-cols-3 gap-2">
                <Skeleton className="h-16" />
                <Skeleton className="h-16" />
                <Skeleton className="h-16" />
              </div>
              <Skeleton className="h-24 w-full" />
            </CardContent>
          </Card>
          <div className="grid gap-4 md:grid-cols-2">
            <Skeleton className="h-40 rounded-xl" />
            <Skeleton className="h-40 rounded-xl" />
          </div>
        </div>
      </div>
    </div>
  );
}
