"use client";

import { useEffect, useState } from "react";
import { PencilIcon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { EmptyState } from "@/components/page-header";
import { cn } from "@/lib/utils";
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
import type { Department } from "./types";
import { useList } from "./use-resource";

export function DepartmentsTab({ canWrite }: { canWrite: boolean }) {
  const { data, loading, error, reload } = useList<Department>("/api/departments");
  const [createOpen, setCreateOpen] = useState(false);
  const [renameTarget, setRenameTarget] = useState<Department | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Department | null>(null);
  const [pending, setPending] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmError, setConfirmError] = useState<string | null>(null);

  const items = data ?? [];

  const handleCreate = async (name: string) => {
    setPending(true);
    setFormError(null);
    try {
      await api("/api/departments", { method: "POST", body: { name } });
      toast.success(`Department “${name}” added`);
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

  const handleRename = async (name: string) => {
    if (!renameTarget) return;
    setPending(true);
    setFormError(null);
    try {
      await api(`/api/departments/${renameTarget.id}`, {
        method: "PATCH",
        body: { name },
      });
      toast.success("Department renamed");
      setRenameTarget(null);
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
      await api(`/api/departments/${deleteTarget.id}`, { method: "DELETE" });
      toast.success(`Department “${deleteTarget.name}” deleted`);
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
        title="Departments"
        description="Teams employees are grouped into. Counts include everyone still assigned."
        count={data ? items.length : undefined}
        action={
          canWrite ? (
            <AddButton
              onClick={() => {
                setFormError(null);
                setCreateOpen(true);
              }}
            >
              Add department
            </AddButton>
          ) : null
        }
      />

      {loading && !data ? (
        <TableSkeleton columns={canWrite ? 3 : 2} />
      ) : error ? (
        <ErrorPanel
          title="Couldn't load departments"
          message={error}
          onRetry={reload}
        />
      ) : items.length === 0 ? (
        <EmptyState
          title="No departments yet"
          description={
            canWrite
              ? "Create the first department so employees can be grouped by team."
              : "An admin hasn't created any departments yet."
          }
          action={
            canWrite ? (
              <AddButton onClick={() => setCreateOpen(true)}>Add department</AddButton>
            ) : undefined
          }
        />
      ) : (
        <div className="overflow-hidden rounded-lg border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead className="h-9 pl-4 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  Department
                </TableHead>
                <TableHead className="h-9 text-right text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  Employees
                </TableHead>
                {canWrite ? (
                  <TableHead className="h-9 w-[4.5rem] pr-2 text-right md:w-24 md:pr-4">
                    <span className="sr-only">Actions</span>
                  </TableHead>
                ) : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((department) => (
                <TableRow key={department.id}>
                  <TableCell className="py-2.5 pl-4 font-medium">{department.name}</TableCell>
                  <TableCell className="py-2.5 text-right tabular-nums">
                    <span
                      className={cn(
                        department.employeeCount === 0 && "text-muted-foreground",
                      )}
                    >
                      {department.employeeCount}
                    </span>
                  </TableCell>
                  {canWrite ? (
                    <TableCell className="py-2.5 pr-2 text-right md:pr-4">
                      <div className="flex items-center justify-end gap-0.5">
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Rename ${department.name}`}
                          className="text-muted-foreground hover:text-foreground"
                          onClick={() => {
                            setFormError(null);
                            setRenameTarget(department);
                          }}
                        >
                          <PencilIcon className="size-3.5" />
                        </Button>
                        <TrashButton
                          department={department}
                          onDelete={() => {
                            setConfirmError(null);
                            setDeleteTarget(department);
                          }}
                        />
                      </div>
                    </TableCell>
                  ) : null}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <DepartmentDialog
        mode="create"
        open={createOpen}
        onOpenChange={(open) => {
          setCreateOpen(open);
          if (!open) setFormError(null);
        }}
        initialName=""
        pending={pending}
        error={formError}
        onSubmit={handleCreate}
      />

      <DepartmentDialog
        mode="rename"
        open={!!renameTarget}
        onOpenChange={(open) => {
          if (!open) {
            setRenameTarget(null);
            setFormError(null);
          }
        }}
        initialName={renameTarget?.name ?? ""}
        pending={pending}
        error={formError}
        onSubmit={handleRename}
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
        description="This removes the department from the list. This can't be undone."
        confirmLabel="Delete department"
        pending={pending}
        error={confirmError}
        onConfirm={handleDelete}
      />
    </div>
  );
}

function TrashButton({
  department,
  onDelete,
}: {
  department: Department;
  onDelete: () => void;
}) {
  const blocked = department.employeeCount > 0;
  const label = `Delete ${department.name}`;

  const button = (
    <Button
      variant="ghost"
      size="icon-sm"
      disabled={blocked}
      aria-label={label}
      onClick={onDelete}
      className="text-muted-foreground hover:text-destructive"
    >
      <Trash2Icon className="size-3.5" />
    </Button>
  );

  if (!blocked) return button;

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <span
            className="inline-flex"
            tabIndex={0}
            aria-label={`${label} — unavailable`}
          />
        }
      >
        {button}
      </TooltipTrigger>
      <TooltipContent>
        {department.employeeCount === 1
          ? "1 employee still belongs to this department. Move them first."
          : `${department.employeeCount} employees still belong to this department. Move them first.`}
      </TooltipContent>
    </Tooltip>
  );
}

function DepartmentDialog({
  mode,
  open,
  onOpenChange,
  initialName,
  pending,
  error,
  onSubmit,
}: {
  mode: "create" | "rename";
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialName: string;
  pending: boolean;
  error: string | null;
  onSubmit: (name: string) => void;
}) {
  const [name, setName] = useState(initialName);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const renaming = mode === "rename";

  useEffect(() => {
    if (!open) return;
    setName(initialName);
    setFieldError(null);
  }, [open, initialName]);

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={renaming ? "Rename department" : "Add department"}
      description={
        renaming
          ? "The new name shows on every employee record in this department."
          : "Departments group employees for filters, reports and payroll."
      }
      submitLabel={renaming ? "Save name" : "Create department"}
      pending={pending}
      error={error}
      onSubmit={() => {
        if (!name.trim()) {
          setFieldError("Give the department a name.");
          return;
        }
        onSubmit(name.trim());
      }}
    >
      <Field label="Department name" htmlFor="departmentName" error={fieldError ?? undefined}>
        <Input
          id="departmentName"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setFieldError(null);
          }}
          placeholder="Engineering"
          disabled={pending}
          aria-invalid={!!fieldError}
        />
      </Field>
    </FormDialog>
  );
}
