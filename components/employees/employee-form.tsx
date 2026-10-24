"use client";

import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SalaryPreview } from "./salary-preview";
import type { Department, Designation, EmployeeStatus } from "./types";

export type EmployeeFormValues = {
  code: string;
  fullName: string;
  email: string;
  phone: string;
  address: string;
  departmentId: string; // "none" | id as string
  designationId: string; // "none" | id as string
  joinDate: string;
  status: EmployeeStatus;
  basicSalary: string;
  password: string;
};

const EMPTY: EmployeeFormValues = {
  code: "",
  fullName: "",
  email: "",
  phone: "",
  address: "",
  departmentId: "none",
  designationId: "none",
  joinDate: "",
  status: "active",
  basicSalary: "",
  password: "",
};

const STATUS_ITEMS = [
  { label: "Active", value: "active" },
  { label: "Probation", value: "probation" },
  { label: "Exited", value: "exited" },
];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function EmployeeForm({
  mode = "create",
  idPrefix = "emp",
  initial,
  departments,
  designations,
  submitting,
  fieldErrors,
  submitLabel,
  onCancel,
  onSubmit,
}: {
  mode?: "create" | "edit";
  idPrefix?: string;
  initial?: Partial<EmployeeFormValues>;
  departments: Department[];
  designations: Designation[];
  submitting?: boolean;
  fieldErrors?: Record<string, string>;
  submitLabel?: string;
  onCancel?: () => void;
  onSubmit: (values: EmployeeFormValues) => void;
}) {
  const [values, setValues] = useState<EmployeeFormValues>({ ...EMPTY, ...initial });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const fid = (name: string) => `${idPrefix}-${name}`;

  function set<K extends keyof EmployeeFormValues>(key: K, value: EmployeeFormValues[K]) {
    setValues((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }

  const departmentItems = useMemo(
    () => [
      { label: "No department", value: "none" },
      ...departments.map((d) => ({ label: d.name, value: String(d.id) })),
    ],
    [departments],
  );

  const designationItems = useMemo(() => {
    const list =
      values.departmentId === "none"
        ? designations
        : designations.filter((d) => String(d.departmentId) === values.departmentId);
    return [
      { label: "No designation", value: "none" },
      ...list.map((d) => ({ label: d.name, value: String(d.id) })),
    ];
  }, [designations, values.departmentId]);

  function changeDepartment(next: string | null) {
    const departmentId = next ?? "none";
    setValues((prev) => {
      const stillValid =
        prev.designationId === "none" ||
        designations.some(
          (d) =>
            String(d.id) === prev.designationId &&
            (departmentId === "none" || String(d.departmentId) === departmentId),
        );
      return {
        ...prev,
        departmentId,
        designationId: stillValid ? prev.designationId : "none",
      };
    });
  }

  function validate() {
    const next: Record<string, string> = {};
    if (!values.code.trim()) next.code = "Employee code is required";
    if (!values.fullName.trim()) next.fullName = "Full name is required";
    if (!values.email.trim()) next.email = "Email is required";
    else if (!EMAIL_RE.test(values.email.trim())) next.email = "Enter a valid email address";
    if (!values.joinDate) next.joinDate = "Join date is required";
    if (!values.basicSalary || Number(values.basicSalary) <= 0)
      next.basicSalary = "Basic salary must be greater than 0";
    if (mode === "create" && values.password && values.password.length < 8)
      next.password = "Password must be at least 8 characters";
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!validate()) return;
    onSubmit({
      ...values,
      code: values.code.trim(),
      fullName: values.fullName.trim(),
      email: values.email.trim(),
      phone: values.phone.trim(),
      address: values.address.trim(),
    });
  }

  const err = (key: keyof EmployeeFormValues) => errors[key] ?? fieldErrors?.[key];

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Employee code" htmlFor={fid("code")} error={err("code")}>
          <Input
            id={fid("code")}
            value={values.code}
            onChange={(e) => set("code", e.target.value)}
            placeholder="EMP-001"
            disabled={mode === "edit"}
            autoComplete="off"
            aria-invalid={Boolean(err("code"))}
          />
        </Field>
        <Field label="Full name" htmlFor={fid("name")} error={err("fullName")}>
          <Input
            id={fid("name")}
            value={values.fullName}
            onChange={(e) => set("fullName", e.target.value)}
            placeholder="Ayesha Khan"
            aria-invalid={Boolean(err("fullName"))}
          />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Email" htmlFor={fid("email")} error={err("email")}>
          <Input
            id={fid("email")}
            type="email"
            value={values.email}
            onChange={(e) => set("email", e.target.value)}
            placeholder="ayesha@company.com"
            autoComplete="off"
            aria-invalid={Boolean(err("email"))}
          />
        </Field>
        <Field label="Phone" htmlFor={fid("phone")} optional>
          <Input
            id={fid("phone")}
            value={values.phone}
            onChange={(e) => set("phone", e.target.value)}
            placeholder="+92 300 1234567"
          />
        </Field>
      </div>

      <Field label="Address" htmlFor={fid("address")} optional>
        <Textarea
          id={fid("address")}
          value={values.address}
          onChange={(e) => set("address", e.target.value)}
          placeholder="Street, city"
          rows={2}
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Department" htmlFor={fid("department")} optional>
          <Select value={values.departmentId} onValueChange={changeDepartment} items={departmentItems}>
            <SelectTrigger id={fid("department")} className="w-full">
              <SelectValue placeholder="No department" />
            </SelectTrigger>
            <SelectContent>
              {departmentItems.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Designation" htmlFor={fid("designation")} optional>
          <Select
            value={values.designationId}
            onValueChange={(v) => set("designationId", v ?? "none")}
            items={designationItems}
          >
            <SelectTrigger id={fid("designation")} className="w-full">
              <SelectValue placeholder="No designation" />
            </SelectTrigger>
            <SelectContent>
              {designationItems.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Join date" htmlFor={fid("join-date")} error={err("joinDate")}>
          <Input
            id={fid("join-date")}
            type="date"
            value={values.joinDate}
            onChange={(e) => set("joinDate", e.target.value)}
            aria-invalid={Boolean(err("joinDate"))}
          />
        </Field>
        <Field label="Status" htmlFor={fid("status")}>
          <Select
            value={values.status}
            onValueChange={(v) => set("status", (v ?? "active") as EmployeeStatus)}
            items={STATUS_ITEMS}
          >
            <SelectTrigger id={fid("status")} className="w-full">
              <SelectValue placeholder="Active" />
            </SelectTrigger>
            <SelectContent>
              {STATUS_ITEMS.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </div>

      <Field label="Basic salary" htmlFor={fid("salary")} error={err("basicSalary")}>
        <Input
          id={fid("salary")}
          type="number"
          min={1}
          step={1}
          inputMode="numeric"
          value={values.basicSalary}
          onChange={(e) => set("basicSalary", e.target.value)}
          placeholder="120000"
          aria-invalid={Boolean(err("basicSalary"))}
        />
      </Field>
      <SalaryPreview basic={Number(values.basicSalary)} />

      {mode === "create" ? (
        <Field
          label="Temporary password"
          htmlFor={fid("password")}
          optional
          error={err("password")}
          hint="Leave blank and we generate one for you."
        >
          <Input
            id={fid("password")}
            type="text"
            value={values.password}
            onChange={(e) => set("password", e.target.value)}
            placeholder="At least 8 characters"
            autoComplete="new-password"
            aria-invalid={Boolean(err("password"))}
          />
        </Field>
      ) : null}

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        {onCancel ? (
          <Button type="button" variant="outline" onClick={onCancel} disabled={submitting}>
            Cancel
          </Button>
        ) : null}
        <Button type="submit" disabled={submitting}>
          {submitting ? "Saving…" : (submitLabel ?? (mode === "create" ? "Register employee" : "Save changes"))}
        </Button>
      </div>
    </form>
  );
}

function Field({
  label,
  htmlFor,
  error,
  hint,
  optional,
  children,
}: {
  label: string;
  htmlFor: string;
  error?: string;
  hint?: string;
  optional?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <Label htmlFor={htmlFor}>{label}</Label>
        {optional ? <span className="text-[11px] text-muted-foreground">Optional</span> : null}
      </div>
      {children}
      {error ? (
        <p className="text-xs text-destructive">{error}</p>
      ) : hint ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}
