"use client";

import { useMemo, useState } from "react";
import { CalendarDaysIcon, TriangleAlertIcon } from "lucide-react";
import { toast } from "sonner";

import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Field, FormDialog } from "@/components/shared/dialogs";
import { apiFetch, readableError } from "@/components/shared/api";
import { formatDate } from "@/components/shared/format";
import { countWorkingDays, type LeaveBalance, type LeaveType } from "./types";

export function LeaveApplyDialog({
  open,
  today,
  onOpenChange,
  types,
  balances,
  onCreated,
}: {
  open: boolean;
  today: string;
  onOpenChange: (open: boolean) => void;
  types: LeaveType[];
  balances: LeaveBalance[];
  onCreated: () => void;
}) {
  const [leaveTypeId, setLeaveTypeId] = useState("");
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);

  const defaultTypeId = types[0] ? String(types[0].id) : "";
  const activeTypeId = leaveTypeId || defaultTypeId;

  const days = useMemo(() => countWorkingDays(startDate, endDate), [startDate, endDate]);
  const selectedType = types.find((type) => String(type.id) === activeTypeId);
  const selectedBalance = balances.find((balance) => String(balance.leaveTypeId) === activeTypeId);
  const overBalance =
    selectedBalance?.remaining != null && days > 0 && days > selectedBalance.remaining;

  const typeItems = useMemo(
    () => types.map((type) => ({ label: type.name, value: String(type.id) })),
    [types],
  );

  async function submit() {
    setFieldError(null);
    setError(null);

    if (!activeTypeId) {
      setFieldError("Pick a leave type");
      return;
    }
    if (!startDate || !endDate) {
      setFieldError("Pick both dates");
      return;
    }
    if (endDate < startDate) {
      setFieldError("The end date needs to be on or after the start date");
      return;
    }
    if (days === 0) {
      setFieldError("Those dates are all weekend or holiday — pick working days");
      return;
    }
    if (!reason.trim()) {
      setFieldError("Add a short reason");
      return;
    }

    setPending(true);
    try {
      await apiFetch("/api/leave/requests", {
        method: "POST",
        body: {
          leaveTypeId: Number(activeTypeId),
          startDate,
          endDate,
          reason: reason.trim(),
        },
      });
      toast.success("Leave request sent");
      onOpenChange(false);
      onCreated();
    } catch (err) {
      setError(readableError(err));
    } finally {
      setPending(false);
    }
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Apply for leave"
      description="Weekends are skipped automatically. HR confirms the final working days."
      submitLabel="Send request"
      pendingLabel="Sending…"
      pending={pending}
      error={error}
      onSubmit={submit}
      wide
    >
      {fieldError ? (
        <p
          role="alert"
          className="rounded-md border border-destructive/30 bg-destructive/5 px-2.5 py-2 text-xs text-destructive"
        >
          {fieldError}
        </p>
      ) : null}

      <Field label="Leave type" htmlFor="leave-type">
        {types.length === 0 ? (
          <p className="rounded-md border border-dashed border-border px-2.5 py-2 text-xs text-muted-foreground">
            No leave types are set up yet. Ask HR to add them in Organization.
          </p>
        ) : (
          <Select
            value={activeTypeId}
            onValueChange={(value) => setLeaveTypeId(String(value))}
            items={typeItems}
          >
            <SelectTrigger id="leave-type" className="w-full">
              <SelectValue placeholder="Pick a leave type" />
            </SelectTrigger>
            <SelectContent>
              {typeItems.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="From" htmlFor="leave-start">
          <Input
            id="leave-start"
            type="date"
            value={startDate}
            onChange={(event) => {
              const value = event.target.value;
              setStartDate(value);
              if (endDate && value > endDate) setEndDate(value);
            }}
          />
        </Field>
        <Field label="To" htmlFor="leave-end">
          <Input
            id="leave-end"
            type="date"
            value={endDate}
            min={startDate}
            onChange={(event) => setEndDate(event.target.value)}
          />
        </Field>
      </div>

      <div className="rounded-lg border border-border bg-muted/40 p-3">
        <div className="flex items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <CalendarDaysIcon className="size-3.5" />
            Working days
          </span>
          <span className="text-sm font-semibold tabular-nums">
            {days} day{days === 1 ? "" : "s"}
          </span>
        </div>
        <p className="mt-1 text-[11px] text-muted-foreground">
          {startDate && endDate && endDate >= startDate
            ? `${formatDate(startDate)}${
                endDate && endDate !== startDate ? ` – ${formatDate(endDate)}` : ""
              } · weekends skipped`
            : "Pick a valid date range"}
        </p>
        {overBalance ? (
          <p className="mt-2 inline-flex items-center gap-1.5 text-[11px] text-amber-700">
            <TriangleAlertIcon className="size-3.5" />
            That&apos;s more than your remaining {selectedType?.name ?? "leave"} balance.
          </p>
        ) : selectedBalance?.remaining != null ? (
          <p className="mt-2 text-[11px] text-muted-foreground">
            You have {selectedBalance.remaining} day
            {selectedBalance.remaining === 1 ? "" : "s"} left this year.
          </p>
        ) : null}
      </div>

      <Field
        label="Reason"
        htmlFor="leave-reason"
        hint="A sentence is enough — your manager and HR both see it."
      >
        <Textarea
          id="leave-reason"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder="e.g. Family wedding out of town"
          rows={3}
        />
      </Field>
    </FormDialog>
  );
}
