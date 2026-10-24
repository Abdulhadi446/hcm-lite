"use client";

import { useEffect, useState } from "react";
import { PencilIcon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState } from "@/components/page-header";
import { api, readableError } from "./api";
import {
  AddButton,
  ConfirmDialog,
  ErrorPanel,
  Field,
  FormDialog,
  SectionHeader,
  TableSkeleton,
} from "./org-ui";
import type { Department, Designation } from "./types";
import { useList } from "./use-resource";

export function DesignationsTab({ canWrite }: { canWrite: boolean }) {
  const { data, loading, error, reload } = useList<Designation>("/api/designations");
  const departments = useList<Department>("/api/departments");
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Designation | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Designation | null>(null);
  const [pending, setPending] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmError, setConfirmError] = useState<string | null>(null);

  const items = data ?? [];
  const departmentOptions = departments.data ?? [];

  const handleCreate = async (values: { name: string; departmentId: number | null }) => {
    setPending(true);
    setFormError(null);
    try {
      await api("/api/designations", { method: "POST", body: values });
      toast.success(`Designation “${values.name}” added`);
      setCreateOpen(false);
      reload();
    } catch (err) {
      const message = readableError(err);
      setFormError(message);
      toast.error(message);
    } finally {
      setPending(false);
    }
  };

  const handleEdit = async (values: { name: string; departmentId: number | null }) => {
    if (!editTarget) return;
    setPending(true);
    setFormError(null);
    try {
      await api(`/api/designations/${editTarget.id}`, { method: "PATCH", body: values });
      toast.success("Designation updated");
      setEditTarget(null);
      reload();
    } catch (err) {
      const message = readableError(err);
      setFormError(message);
      toast.error(message);
    } finally {
      setPending(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setPending(true);
    setConfirmError(null);
    try {
      await api(`/api/designations/${deleteTarget.id}`, { method: "DELETE" });
      toast.success(`Designation “${deleteTarget.name}” deleted`);
      setDeleteTarget(null);
      reload();
    } catch (err) {
      const message = readableError(err);
      setConfirmError(message);
      toast.error(message);
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="space-y-4">
      <SectionHeader
        title="Designations"
        description="Job titles employees are assigned, optionally tied to a department."
        count={data ? items.length : undefined}
        action={
          canWrite ? (
            <AddButton
              onClick={() => {
                setFormError(null);
                // Departments may have been created after this tab mounted.
                departments.reload();
                setCreateOpen(true);
              }}
            >
              Add designation
            </AddButton>
          ) : null
        }
      />

      {loading && !data ? (
        <TableSkeleton columns={canWrite ? 3 : 2} />
      ) : error ? (
        <ErrorPanel
          title="Couldn't load designations"
          message={error}
          onRetry={reload}
        />
      ) : items.length === 0 ? (
        <EmptyState
          title="No designations yet"
          description={
            canWrite
              ? "Add job titles like “Software Engineer” or “HR Officer” so roles stay consistent."
              : "An admin hasn't added any designations yet."
          }
          action={
            canWrite ? (
              <AddButton
              onClick={() => {
                departments.reload();
                setCreateOpen(true);
              }}
            >
              Add designation
            </AddButton>
            ) : undefined
          }
        />
      ) : (
        <div className="overflow-hidden rounded-lg border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead className="h-9 pl-4 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  Designation
                </TableHead>
                <TableHead className="h-9 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  Department
                </TableHead>
                {canWrite ? (
                  <TableHead className="h-9 w-[4.5rem] pr-2 text-right md:w-24 md:pr-4">
                    <span className="sr-only">Actions</span>
                  </TableHead>
                ) : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((designation) => (
                <TableRow key={designation.id}>
                  <TableCell className="py-2.5 pl-4 font-medium whitespace-normal">{designation.name}</TableCell>
                  <TableCell className="py-2.5">
                    {designation.departmentName ? (
                      <span className="inline-flex h-5 items-center rounded-full border border-border bg-muted/60 px-2 text-xs text-foreground">
                        {designation.departmentName}
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">No department</span>
                    )}
                  </TableCell>
                  {canWrite ? (
                    <TableCell className="py-2.5 pr-2 text-right md:pr-4">
                      <div className="flex items-center justify-end gap-0.5">
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Edit ${designation.name}`}
                          className="text-muted-foreground hover:text-foreground"
                          onClick={() => {
                            setFormError(null);
                            departments.reload();
                            setEditTarget(designation);
                          }}
                        >
                          <PencilIcon className="size-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Delete ${designation.name}`}
                          className="text-muted-foreground hover:text-destructive"
                          onClick={() => {
                            setConfirmError(null);
                            setDeleteTarget(designation);
                          }}
                        >
                          <Trash2Icon className="size-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  ) : null}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <DesignationDialog
        mode="create"
        open={createOpen}
        onOpenChange={(open) => {
          setCreateOpen(open);
          if (!open) setFormError(null);
        }}
        departments={departmentOptions}
        pending={pending}
        error={formError}
        onSubmit={handleCreate}
      />

      <DesignationDialog
        key={editTarget?.id ?? "edit"}
        mode="edit"
        open={!!editTarget}
        onOpenChange={(open) => {
          if (!open) {
            setEditTarget(null);
            setFormError(null);
          }
        }}
        initial={editTarget}
        departments={departmentOptions}
        pending={pending}
        error={formError}
        onSubmit={handleEdit}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteTarget(null);
            setConfirmError(null);
          }
        }}
        title={`Delete “${deleteTarget?.name ?? ""}”?`}
        description="This removes the designation from the list. Employees using it lose the title."
        confirmLabel="Delete designation"
        pending={pending}
        error={confirmError}
        onConfirm={handleDelete}
      />
    </div>
  );
}

function DesignationDialog({
  mode,
  open,
  onOpenChange,
  initial,
  departments,
  pending,
  error,
  onSubmit,
}: {
  mode: "create" | "edit";
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial?: Designation | null;
  departments: Department[];
  pending: boolean;
  error: string | null;
  onSubmit: (values: { name: string; departmentId: number | null }) => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [departmentId, setDepartmentId] = useState(
    initial?.departmentId ? String(initial.departmentId) : "none",
  );
  const [fieldError, setFieldError] = useState<string | null>(null);
  const editing = mode === "edit";

  useEffect(() => {
    if (!open) return;
    setName(initial?.name ?? "");
    setDepartmentId(initial?.departmentId ? String(initial.departmentId) : "none");
    setFieldError(null);
  }, [open, initial]);

  const selectItems = [
    { value: "none", label: "No department" },
    ...departments.map((department) => ({
      value: String(department.id),
      label: department.name,
    })),
  ];

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={editing ? "Edit designation" : "Add designation"}
      description="A designation is the job title shown on the employee profile and payslips."
      submitLabel={editing ? "Save designation" : "Create designation"}
      pending={pending}
      error={error}
      onSubmit={() => {
        if (!name.trim()) {
          setFieldError("Give the designation a name.");
          return;
        }
        onSubmit({
          name: name.trim(),
          departmentId: departmentId === "none" ? null : Number(departmentId),
        });
      }}
    >
      <Field label="Designation name" htmlFor="designationName" error={fieldError ?? undefined}>
        <Input
          id="designationName"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setFieldError(null);
          }}
          placeholder="Software Engineer"
          disabled={pending}
          aria-invalid={!!fieldError}
        />
      </Field>

      <Field
        label="Department"
        htmlFor="designationDepartment"
        hint="Optional. Used to group titles by team."
      >
        <Select
          items={selectItems}
          value={departmentId}
          onValueChange={(value) => setDepartmentId(String(value))}
        >
          <SelectTrigger id="designationDepartment" className="w-full" disabled={pending}>
            <SelectValue placeholder="No department" />
          </SelectTrigger>
          <SelectContent>
            {selectItems.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
    </FormDialog>
  );
}
