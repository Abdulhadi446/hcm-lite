"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarDaysIcon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import type { Holiday } from "./types";
import { useList } from "./use-resource";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function parseIsoDate(value: string): Date | null {
  if (!ISO_DATE.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }
  return date;
}

function weekdayName(value: string): string {
  const date = parseIsoDate(value);
  return date ? date.toLocaleDateString(undefined, { weekday: "long" }) : "";
}

function longDate(value: string): string {
  const date = parseIsoDate(value);
  return date
    ? date.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })
    : value;
}

function monthShort(value: string): string {
  const date = parseIsoDate(value);
  return date ? date.toLocaleDateString(undefined, { month: "short" }) : "";
}

function dayNumber(value: string): string {
  return value.slice(8, 10);
}

function todayIso(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

export function HolidaysTab({ canWrite }: { canWrite: boolean }) {
  const { data, loading, error, reload } = useList<Holiday>("/api/holidays");
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Holiday | null>(null);
  const [pending, setPending] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmError, setConfirmError] = useState<string | null>(null);

  const items = data ?? [];
  const today = todayIso();
  const nextUp = useMemo(
    () => items.filter((holiday) => holiday.date >= today).sort((a, b) => a.date.localeCompare(b.date))[0],
    [items, today],
  );

  const groups = useMemo(() => {
    const byYear = new Map<string, Holiday[]>();
    for (const holiday of items) {
      const year = holiday.date.slice(0, 4);
      const list = byYear.get(year) ?? [];
      list.push(holiday);
      byYear.set(year, list);
    }

    const currentYear = new Date().getFullYear();
    const years = Array.from(byYear.keys()).sort((a, b) => {
      const diffA = Number(a) - currentYear;
      const diffB = Number(b) - currentYear;
      if (diffA >= 0 && diffB >= 0) return diffA - diffB;
      if (diffA < 0 && diffB < 0) return diffB - diffA;
      return diffA >= 0 ? -1 : 1;
    });

    return years.map((year) => ({
      year,
      holidays: (byYear.get(year) ?? []).slice().sort((a, b) => a.date.localeCompare(b.date)),
    }));
  }, [items]);

  const handleCreate = async (values: { date: string; name: string }) => {
    setPending(true);
    setFormError(null);
    try {
      await api("/api/holidays", { method: "POST", body: values });
      toast.success(`“${values.name}” added to the calendar`);
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

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setPending(true);
    setConfirmError(null);
    try {
      await api(`/api/holidays/${deleteTarget.id}`, { method: "DELETE" });
      toast.success(`“${deleteTarget.name}” removed`);
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
        title="Holidays"
        description="Non-working days, skipped by attendance, leave and payroll."
        count={data ? items.length : undefined}
        action={
          canWrite ? (
            <AddButton
              onClick={() => {
                setFormError(null);
                setCreateOpen(true);
              }}
            >
              Add holiday
            </AddButton>
          ) : null
        }
      />

      {loading && !data ? (
        <TableSkeleton columns={2} />
      ) : error ? (
        <ErrorPanel
          title="Couldn't load holidays"
          message={error}
          onRetry={reload}
        />
      ) : items.length === 0 ? (
        <EmptyState
          title="No holidays yet"
          description={
            canWrite
              ? "Add public holidays so attendance and payroll skip those days."
              : "An admin hasn't added any holidays yet."
          }
          action={
            canWrite ? (
              <AddButton onClick={() => setCreateOpen(true)}>Add holiday</AddButton>
            ) : undefined
          }
        />
      ) : (
        <div className="space-y-4">
          {groups.map((group) => (
            <section
              key={group.year}
              className="overflow-hidden rounded-lg border border-border bg-card"
            >
              <div className="flex items-center justify-between gap-2 border-b border-border bg-muted/40 px-4 py-2.5">
                <h3 className="flex items-center gap-1.5 text-sm font-medium">
                  <CalendarDaysIcon className="size-3.5 text-muted-foreground" />
                  {group.year}
                </h3>
                <span className="text-[11px] text-muted-foreground">
                  {group.holidays.length} day{group.holidays.length === 1 ? "" : "s"}
                </span>
              </div>
              <ul className="divide-y divide-border">
                {group.holidays.map((holiday) => {
                  const weekday = weekdayName(holiday.date);
                  const isWeekendDate = weekday === "Saturday" || weekday === "Sunday";
                  return (
                    <li
                      key={holiday.id}
                      className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-muted/30"
                    >
                      <div className="flex size-9 shrink-0 flex-col items-center justify-center rounded-md border border-border bg-muted/40 leading-none">
                        <span className="text-[9px] font-medium uppercase tracking-wide text-muted-foreground">
                          {monthShort(holiday.date)}
                        </span>
                        <span className="mt-0.5 text-xs font-semibold tabular-nums">
                          {dayNumber(holiday.date)}
                        </span>
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="truncate text-sm font-medium">{holiday.name}</p>
                          {nextUp?.id === holiday.id ? (
                            <Badge
                              variant="outline"
                              className="h-4 border-primary/20 bg-primary/10 px-1.5 text-[10px] text-primary"
                            >
                              Next up
                            </Badge>
                          ) : null}
                        </div>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          <span className={cn(isWeekendDate && "text-muted-foreground/80")}>
                            {weekday}
                          </span>
                          <span aria-hidden> · </span>
                          {longDate(holiday.date)}
                        </p>
                      </div>

                      {canWrite ? (
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Delete ${holiday.name}`}
                          className="shrink-0 text-muted-foreground hover:text-destructive"
                          onClick={() => {
                            setConfirmError(null);
                            setDeleteTarget(holiday);
                          }}
                        >
                          <Trash2Icon className="size-3.5" />
                        </Button>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}

      <HolidayDialog
        open={createOpen}
        onOpenChange={(open) => {
          setCreateOpen(open);
          if (!open) setFormError(null);
        }}
        pending={pending}
        error={formError}
        onSubmit={handleCreate}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteTarget(null);
            setConfirmError(null);
          }
        }}
        title={`Remove “${deleteTarget?.name ?? ""}”?`}
        description="This day will count as a working day again for attendance and payroll."
        confirmLabel="Remove holiday"
        pendingLabel="Removing…"
        pending={pending}
        error={confirmError}
        onConfirm={handleDelete}
      />
    </div>
  );
}

function HolidayDialog({
  open,
  onOpenChange,
  pending,
  error,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pending: boolean;
  error: string | null;
  onSubmit: (values: { date: string; name: string }) => void;
}) {
  const [date, setDate] = useState("");
  const [name, setName] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open) return;
    setDate("");
    setName("");
    setFieldErrors({});
  }, [open]);

  const weekday = weekdayName(date);

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Add holiday"
      description="Pick the date and give it a name employees will recognise."
      submitLabel="Add holiday"
      pending={pending}
      error={error}
      onSubmit={() => {
        const next: Record<string, string> = {};
        if (!date) next.date = "Pick a date.";
        else if (!parseIsoDate(date)) next.date = "Enter a valid date.";
        if (!name.trim()) next.name = "Give the holiday a name.";
        if (Object.keys(next).length > 0) {
          setFieldErrors(next);
          return;
        }
        onSubmit({ date, name: name.trim() });
      }}
    >
      <Field
        label="Date"
        htmlFor="holidayDate"
        hintRight={weekday || undefined}
        error={fieldErrors.date}
      >
        <Input
          id="holidayDate"
          type="date"
          value={date}
          onChange={(e) => {
            setDate(e.target.value);
            setFieldErrors((prev) => ({ ...prev, date: "" }));
          }}
          disabled={pending}
          className="tabular-nums"
          aria-invalid={!!fieldErrors.date}
        />
      </Field>

      <Field label="Holiday name" htmlFor="holidayName" error={fieldErrors.name}>
        <Input
          id="holidayName"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setFieldErrors((prev) => ({ ...prev, name: "" }));
          }}
          placeholder="Eid al-Fitr"
          disabled={pending}
          aria-invalid={!!fieldErrors.name}
        />
      </Field>
    </FormDialog>
  );
}
