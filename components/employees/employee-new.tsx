"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeftIcon, InfoIcon } from "lucide-react";
import { toast } from "sonner";

import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";
import { EmployeeForm, type EmployeeFormValues } from "./employee-form";
import { TempPasswordDialog } from "./temp-password-dialog";
import {
  readApiError,
  type Department,
  type Designation,
  type Employee,
} from "./types";

export function EmployeeNew() {
  const router = useRouter();
  const [departments, setDepartments] = useState<Department[]>([]);
  const [designations, setDesignations] = useState<Designation[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [created, setCreated] = useState<{ employee: Employee; password: string } | null>(
    null,
  );
  const navigated = useRef(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [deptRes, desigRes] = await Promise.all([
          fetch("/api/departments", { cache: "no-store" }),
          fetch("/api/designations", { cache: "no-store" }),
        ]);
        if (!deptRes.ok || !desigRes.ok) return;
        const deptBody = (await deptRes.json()) as { items?: Department[] };
        const desigBody = (await desigRes.json()) as { items?: Designation[] };
        if (cancelled) return;
        setDepartments(deptBody.items ?? []);
        setDesignations(desigBody.items ?? []);
      } catch {
        /* filters stay empty — fields are optional */
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  function goToProfile() {
    if (!created || navigated.current) return;
    navigated.current = true;
    router.push(`/employees/${created.employee.id}`);
  }

  async function handleSubmit(values: EmployeeFormValues) {
    setSubmitting(true);
    setFieldErrors({});
    try {
      const payload: Record<string, unknown> = {
        code: values.code,
        fullName: values.fullName,
        email: values.email,
        joinDate: values.joinDate,
        status: values.status,
        basicSalary: Number(values.basicSalary),
      };
      if (values.phone) payload.phone = values.phone;
      if (values.address) payload.address = values.address;
      if (values.departmentId !== "none")
        payload.departmentId = Number(values.departmentId);
      if (values.designationId !== "none")
        payload.designationId = Number(values.designationId);
      if (values.password) payload.password = values.password;

      const res = await fetch("/api/employees", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const { message, fields } = await readApiError(res);
        setFieldErrors(fields ?? {});
        toast.error(message);
        return;
      }

      const body = (await res.json()) as {
        employee: Employee;
        temporaryPassword: string;
      };
      setCreated({ employee: body.employee, password: body.temporaryPassword });
    } catch {
      toast.error("Network error — employee was not created");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <Link
          href="/employees"
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeftIcon className="size-3.5" />
          Employees
        </Link>
      </div>

      <PageHeader
        title="Register employee"
        description="Job details, salary and login for a new team member."
      />

      <div className="flex items-start gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2.5 text-xs text-muted-foreground">
        <InfoIcon className="mt-0.5 size-4 shrink-0" />
        <p>
          Saving creates an employee login. They will be asked to change the
          temporary password on first sign-in.
        </p>
      </div>

      <Card>
        <CardContent className="p-4 sm:p-6">
          <EmployeeForm
            mode="create"
            departments={departments}
            designations={designations}
            submitting={submitting}
            fieldErrors={fieldErrors}
            onCancel={() => router.push("/employees")}
            onSubmit={handleSubmit}
          />
        </CardContent>
      </Card>

      <TempPasswordDialog
        open={Boolean(created)}
        onOpenChange={(open) => {
          if (!open) goToProfile();
        }}
        password={created?.password ?? ""}
        title="Employee registered"
        description={
          created
            ? `${created.employee.fullName} (${created.employee.code}) can now sign in.`
            : undefined
        }
        actionLabel="View employee profile"
        onAction={goToProfile}
      />
    </div>
  );
}
