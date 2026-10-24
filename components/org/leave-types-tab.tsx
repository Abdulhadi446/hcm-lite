"use client";

import { useEffect, useState } from "react";
import { InfinityIcon, PencilIcon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
import type { LeaveType } from "./types";
import { useList } from "./use-resource";

type LeaveTypeValues = { name: string; quotaDays: number; paid: boolean };

export function LeaveTypesTab({ canWrite }: { canWrite: boolean }) {
  const { data, loading, error, reload } = useList<LeaveType>("/api/leave-types");
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<LeaveType | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<LeaveType | null>(null);
  const [pending, setPending] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmError, setConfirmError] = useState<string | null>(null);

  const items = data ?? [];

  const handleCreate = async (values: LeaveTypeValues) => {
    setPending(true);
    setFormError(null);
    try {
      await api("/api/leave-types", { method: "POST", body: values });
      toast.success(`Leave type “${values.name}” added`);
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

  const handleEdit = async (values: LeaveTypeValues) => {
    if (!editTarget) return;
    setPending(true);
    setFormError(null);
    try {
      await api(`/api/leave-types/${editTarget.id}`, { method: "PATCH", body: values });
      toast.success("Leave type updated");
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
      await api(`/api/leave-types/${deleteTarget.id}`, { method: "DELETE" });
      toast.success(`Leave type “${deleteTarget.name}” deleted`);
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
        title="Leave types"
        description="Quotas apply per calendar year and reset every January."
        count={data ? items.length : undefined}
        action={
          canWrite ? (
            <AddButton
              onClick={() => {
                setFormError(null);
                setCreateOpen(true);
              }}
            >
              Add leave type
            </AddButton>
          ) : null
        }
      />

      {loading && !data ? (
        <TableSkeleton columns={canWrite ? 4 : 3} />
      ) : error ? (
        <ErrorPanel
          title="Couldn't load leave types"
          message={error}
          onRetry={reload}
        />
      ) : items.length === 0 ? (
        <EmptyState
          title="No leave types yet"
          description={
            canWrite
              ? "Add annual, sick and casual leave so employees know how many days they get."
              : "An admin hasn't added any leave types yet."
          }
          action={
            canWrite ? (
              <AddButton onClick={() => setCreateOpen(true)}>Add leave type</AddButton>
            ) : undefined
          }
        />
      ) : (
        <div className="overflow-hidden rounded-lg border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead className="h-9 pl-3 pr-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  Leave type
                </TableHead>
                <TableHead
                  aria-label="Yearly quota"
                  className="h-9 text-right text-[11px] font-medium uppercase tracking-wide text-muted-foreground"
                >
                  Quota
                </TableHead>
                <TableHead className="h-9 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  Type
                </TableHead>
                {canWrite ? (
                  <TableHead className="h-9 w-[4.5rem] pr-1.5 text-right md:w-24 md:pr-4">
                    <span className="sr-only">Actions</span>
                  </TableHead>
                ) : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((leaveType) => (
                <TableRow key={leaveType.id}>
                  <TableCell className="py-2.5 pl-3 pr-1 font-medium">{leaveType.name}</TableCell>
                  <TableCell className="py-2.5 text-right tabular-nums">
                    {leaveType.quotaDays === 0 ? (
                      <span className="inline-flex items-center justify-end gap-1 text-xs text-muted-foreground">
                        <InfinityIcon className="size-3.5" />
                        Unlimited
                      </span>
                    ) : (
                      <span>
                        {leaveType.quotaDays}
                        <span className="ml-1 text-xs text-muted-foreground max-sm:hidden">
                          days
                        </span>
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="py-2.5">
                    <Badge
                      variant="outline"
                      className={cn(
                        leaveType.paid
                          ? "border-primary/20 bg-primary/10 text-primary"
                          : "text-muted-foreground",
                      )}
                    >
                      {leaveType.paid ? "Paid" : "Unpaid"}
                    </Badge>
                  </TableCell>
                  {canWrite ? (
                    <TableCell className="py-2.5 pr-1.5 text-right md:pr-4">
                      <div className="flex items-center justify-end gap-0.5">
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Edit ${leaveType.name}`}
                          className="text-muted-foreground hover:text-foreground"
                          onClick={() => {
                            setFormError(null);
                            setEditTarget(leaveType);
                          }}
                        >
                          <PencilIcon className="size-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Delete ${leaveType.name}`}
                          className="text-muted-foreground hover:text-destructive"
                          onClick={() => {
                            setConfirmError(null);
                            setDeleteTarget(leaveType);
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

      <LeaveTypeDialog
        mode="create"
        open={createOpen}
        onOpenChange={(open) => {
          setCreateOpen(open);
          if (!open) setFormError(null);
        }}
        pending={pending}
        error={formError}
        onSubmit={handleCreate}
      />

      <LeaveTypeDialog
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
        description="Leave already requested under this type keeps its history, but no new requests can use it."
        confirmLabel="Delete leave type"
        pending={pending}
        error={confirmError}
        onConfirm={handleDelete}
      />
    </div>
  );
}

function LeaveTypeDialog({
  mode,
  open,
  onOpenChange,
  initial,
  pending,
  error,
  onSubmit,
}: {
  mode: "create" | "edit";
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial?: LeaveType | null;
  pending: boolean;
  error: string | null;
  onSubmit: (values: LeaveTypeValues) => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [quota, setQuota] = useState(String(initial?.quotaDays ?? 0));
  const [paid, setPaid] = useState(initial?.paid ?? true);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const editing = mode === "edit";

  useEffect(() => {
    if (!open) return;
    setName(initial?.name ?? "");
    setQuota(String(initial?.quotaDays ?? 0));
    setPaid(initial?.paid ?? true);
    setFieldErrors({});
  }, [open, initial]);

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={editing ? "Edit leave type" : "Add leave type"}
      description="Quotas reset every calendar year. Set 0 days when there's no yearly limit."
      submitLabel={editing ? "Save leave type" : "Create leave type"}
      pending={pending}
      error={error}
      onSubmit={() => {
        const next: Record<string, string> = {};
        if (!name.trim()) next.name = "Give the leave type a name.";
        const days = Number(quota);
        if (!quota.trim() || !Number.isInteger(days) || days < 0 || days > 365) {
          next.quotaDays = "Use a whole number between 0 and 365.";
        }
        if (Object.keys(next).length > 0) {
          setFieldErrors(next);
          return;
        }
        onSubmit({ name: name.trim(), quotaDays: days, paid });
      }}
    >
      <Field label="Leave type name" htmlFor="leaveTypeName" error={fieldErrors.name}>
        <Input
          id="leaveTypeName"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setFieldErrors((prev) => ({ ...prev, name: "" }));
          }}
          placeholder="Annual leave"
          disabled={pending}
          aria-invalid={!!fieldErrors.name}
        />
      </Field>

      <Field
        label="Yearly quota (days)"
        htmlFor="quotaDays"
        hintRight={Number(quota) === 0 ? "Unlimited" : undefined}
        hint="Resets each January."
        error={fieldErrors.quotaDays}
      >
        <Input
          id="quotaDays"
          type="number"
          min={0}
          max={365}
          inputMode="numeric"
          value={quota}
          onChange={(e) => {
            setQuota(e.target.value);
            setFieldErrors((prev) => ({ ...prev, quotaDays: "" }));
          }}
          disabled={pending}
          className="tabular-nums"
          aria-invalid={!!fieldErrors.quotaDays}
        />
      </Field>

      <div className="flex items-start gap-2.5 rounded-lg border border-border bg-muted/20 p-3">
        <Checkbox
          id="paid"
          checked={paid}
          onCheckedChange={(value) => setPaid(value === true)}
          disabled={pending}
          className="mt-px"
        />
        <div className="space-y-0.5">
          <Label htmlFor="paid" className="text-xs font-medium">
            Paid leave
          </Label>
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            Paid days keep the full salary. Unpaid days are deducted from payroll.
          </p>
        </div>
      </div>
    </FormDialog>
  );
}
