"use client";

import { useEffect, useState } from "react";
import { PencilIcon } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/page-header";
import { ContactForm } from "./contact-form";
import { EmployeeForm, type EmployeeFormValues } from "./employee-form";
import { AttendanceCard, LeaveCard, PayslipsCard } from "./employee-overview-cards";
import {
  AccountCard,
  BackLink,
  ProfileCard,
  ProfileSkeleton,
} from "./employee-profile-cards";
import { TempPasswordDialog } from "./temp-password-dialog";
import {
  readApiError,
  type Department,
  type Designation,
  type Employee,
  type EmployeeOverview,
  type Role,
} from "./types";

export function EmployeeProfile({
  id,
  role,
  isSelf,
}: {
  id: number;
  role: Role;
  isSelf: boolean;
}) {
  const canEdit = role === "hr";
  const canReset = role === "hr" || role === "admin";

  const [data, setData] = useState<EmployeeOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const [departments, setDepartments] = useState<Department[]>([]);
  const [designations, setDesignations] = useState<Designation[]>([]);
  const [editOpen, setEditOpen] = useState(false);
  const [contactOpen, setContactOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [resetting, setResetting] = useState(false);
  const [tempPassword, setTempPassword] = useState<string | null>(null);
  const [selfMustChange, setSelfMustChange] = useState<boolean | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    fetch(`/api/employees/${id}/overview`, { cache: "no-store", signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error((await readApiError(res)).message);
        return (await res.json()) as EmployeeOverview;
      })
      .then((body) => {
        setData(body);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : "Could not load this employee");
        setLoading(false);
      });
    return () => controller.abort();
  }, [id, reloadKey]);

  useEffect(() => {
    if (!isSelf) return;
    fetch("/api/auth/me", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((body: { user?: { mustChangePassword?: boolean } } | null) =>
        setSelfMustChange(body?.user?.mustChangePassword ?? null),
      )
      .catch(() => undefined);
  }, [isSelf]);

  useEffect(() => {
    if (!canEdit) return;
    let cancelled = false;
    Promise.all([
      fetch("/api/departments", { cache: "no-store" }).then((r) =>
        r.ok ? r.json() : { items: [] },
      ),
      fetch("/api/designations", { cache: "no-store" }).then((r) =>
        r.ok ? r.json() : { items: [] },
      ),
    ])
      .then(([dept, desig]: [{ items?: Department[] }, { items?: Designation[] }]) => {
        if (cancelled) return;
        setDepartments(dept.items ?? []);
        setDesignations(desig.items ?? []);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [canEdit]);

  async function patchEmployee(payload: Record<string, unknown>) {
    const res = await fetch(`/api/employees/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const { message, fields } = await readApiError(res);
      setFieldErrors(fields ?? {});
      throw new Error(message);
    }
    const body = (await res.json()) as { employee: Employee };
    setData((prev) => (prev ? { ...prev, employee: body.employee } : prev));
    return body.employee;
  }

  async function handleEditSubmit(values: EmployeeFormValues) {
    setSaving(true);
    setFieldErrors({});
    try {
      const employee = await patchEmployee({
        fullName: values.fullName,
        email: values.email,
        phone: values.phone || null,
        address: values.address || null,
        departmentId: values.departmentId === "none" ? null : Number(values.departmentId),
        designationId: values.designationId === "none" ? null : Number(values.designationId),
        joinDate: values.joinDate,
        status: values.status,
        basicSalary: Number(values.basicSalary),
      });
      setEditOpen(false);
      toast.success(`${employee.fullName} updated`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save changes");
    } finally {
      setSaving(false);
    }
  }

  async function handleContactSubmit(values: { phone: string; address: string }) {
    setSaving(true);
    try {
      await patchEmployee(values);
      setContactOpen(false);
      toast.success("Contact details updated");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save contact details");
    } finally {
      setSaving(false);
    }
  }

  async function handleReset() {
    setResetting(true);
    try {
      let password: string;

      if (role === "hr") {
        // HR PATCHes the password; the server sets must_change_password.
        password = makeTempPassword();
        const res = await fetch(`/api/employees/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ password }),
        });
        if (!res.ok) throw new Error((await readApiError(res)).message);
        const body = (await res.json()) as { employee: Employee };
        setData((prev) => (prev ? { ...prev, employee: body.employee } : prev));
      } else {
        // Admin resets the linked login through the users API.
        const usersRes = await fetch("/api/users?role=employee", { cache: "no-store" });
        if (!usersRes.ok) throw new Error((await readApiError(usersRes)).message);
        const users = (await usersRes.json()) as {
          items: { id: number; employeeId: number | null }[];
        };
        const linked = users.items.find((u) => u.employeeId === id);
        if (!linked) throw new Error("No login is linked to this employee");
        const res = await fetch(`/api/users/${linked.id}/reset-password`, { method: "POST" });
        if (!res.ok) throw new Error((await readApiError(res)).message);
        password = ((await res.json()) as { temporaryPassword: string }).temporaryPassword;
      }

      setTempPassword(password);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not reset the password");
    } finally {
      setResetting(false);
    }
  }

  const employee = data?.employee;

  if (loading && !data) return <ProfileSkeleton />;

  if (error || !employee) {
    return (
      <div className="space-y-4">
        <BackLink role={role} />
        <EmptyState
          title="Couldn't load this employee"
          description={error ?? "The employee may have been removed."}
          action={
            <Button size="sm" onClick={() => setReloadKey((k) => k + 1)}>
              Try again
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <BackLink role={role} />
        <div className="flex flex-wrap items-center gap-2">
          {canEdit ? (
            <Button size="sm" variant="outline" onClick={() => setEditOpen(true)}>
              <PencilIcon />
              Edit
            </Button>
          ) : null}
          {isSelf ? (
            <Button size="sm" variant="outline" onClick={() => setContactOpen(true)}>
              <PencilIcon />
              Edit contact
            </Button>
          ) : null}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4">
          <ProfileCard employee={employee} />
          <AccountCard
            employee={employee}
            canReset={canReset}
            resetting={resetting}
            isSelf={isSelf}
            mustChangePassword={selfMustChange}
            onReset={handleReset}
          />
        </div>

        <div className="space-y-4 lg:col-span-2">
          <AttendanceCard attendance={data!.attendance} />
          <div className="grid gap-4 md:grid-cols-2">
            <LeaveCard leave={data!.leave} />
            <PayslipsCard payslips={data!.payslips} />
          </div>
        </div>
      </div>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit employee</DialogTitle>
            <DialogDescription>
              Employee code can&apos;t be changed. Use Reset password for login credentials.
            </DialogDescription>
          </DialogHeader>
          <EmployeeForm
            mode="edit"
            idPrefix="edit"
            departments={departments}
            designations={designations}
            submitting={saving}
            fieldErrors={fieldErrors}
            onCancel={() => setEditOpen(false)}
            onSubmit={handleEditSubmit}
            initial={{
              code: employee.code,
              fullName: employee.fullName,
              email: employee.email,
              phone: employee.phone ?? "",
              address: employee.address ?? "",
              departmentId: employee.departmentId ? String(employee.departmentId) : "none",
              designationId: employee.designationId ? String(employee.designationId) : "none",
              joinDate: employee.joinDate?.slice(0, 10) ?? "",
              status: employee.status,
              basicSalary: String(employee.basicSalary),
            }}
          />
        </DialogContent>
      </Dialog>

      <Dialog open={contactOpen} onOpenChange={setContactOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit contact details</DialogTitle>
            <DialogDescription>Keep your phone and address up to date.</DialogDescription>
          </DialogHeader>
          <ContactForm
            initial={{ phone: employee.phone ?? "", address: employee.address ?? "" }}
            submitting={saving}
            onCancel={() => setContactOpen(false)}
            onSubmit={handleContactSubmit}
          />
        </DialogContent>
      </Dialog>

      <TempPasswordDialog
        open={Boolean(tempPassword)}
        onOpenChange={(open) => {
          if (!open) setTempPassword(null);
        }}
        password={tempPassword ?? ""}
        title="Password reset"
        description={`Give this temporary password to ${employee.fullName}.`}
      />
    </div>
  );
}

/** 12-char unambiguous temp password generated in the browser. */
function makeTempPassword() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}
