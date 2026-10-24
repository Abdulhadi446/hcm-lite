"use client";

import { useState } from "react";
import { toast } from "sonner";

import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, FormDialog } from "@/components/shared/dialogs";
import { apiFetch, readableError } from "@/components/shared/api";
import { formatDayLabel } from "@/components/shared/format";

export function CorrectionRequestDialog({
  open,
  today,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  today: string;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}) {
  const [date, setDate] = useState(today);
  const [checkIn, setCheckIn] = useState("09:00");
  const [checkOut, setCheckOut] = useState("18:00");
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{ date?: string; reason?: string; time?: string }>({});

  function validate() {
    const next: typeof fieldErrors = {};
    if (!date) next.date = "Pick the day you want corrected";
    if (!reason.trim()) next.reason = "Tell HR what happened";
    else if (reason.trim().length < 4) next.reason = "Add a little more detail";
    if (checkIn && checkOut && checkOut <= checkIn) {
      next.time = "Check-out needs to be after check-in";
    }
    setFieldErrors(next);
    return Object.keys(next).length === 0;
  }

  async function submit() {
    if (!validate()) return;
    setPending(true);
    setError(null);
    try {
      await apiFetch("/api/attendance/corrections", {
        method: "POST",
        body: {
          date,
          requestedCheckIn: checkIn,
          requestedCheckOut: checkOut,
          reason: reason.trim(),
        },
      });
      toast.success("Correction request sent to HR");
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
      title="Request a correction"
      description="Ask HR to fix a check-in or check-out on your record."
      submitLabel="Send request"
      pendingLabel="Sending…"
      pending={pending}
      error={error}
      onSubmit={submit}
    >
      <Field label="Date" htmlFor="correction-date" error={fieldErrors.date}>
        <Input
          id="correction-date"
          type="date"
          value={date}
          max={today}
          onChange={(event) => setDate(event.target.value)}
        />
      </Field>

      {date ? (
        <p className="-mt-2 text-[11px] text-muted-foreground">{formatDayLabel(date)}</p>
      ) : null}

      <div className="grid grid-cols-2 gap-3">
        <Field label="Check in" htmlFor="correction-in">
          <Input
            id="correction-in"
            type="time"
            value={checkIn}
            onChange={(event) => setCheckIn(event.target.value)}
          />
        </Field>
        <Field label="Check out" htmlFor="correction-out">
          <Input
            id="correction-out"
            type="time"
            value={checkOut}
            onChange={(event) => setCheckOut(event.target.value)}
          />
        </Field>
      </div>
      {fieldErrors.time ? (
        <p className="-mt-2 text-[11px] text-destructive">{fieldErrors.time}</p>
      ) : null}

      <Field label="Reason" htmlFor="correction-reason" error={fieldErrors.reason}>
        <Textarea
          id="correction-reason"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder="e.g. I forgot to check out before leaving"
          rows={3}
        />
      </Field>
    </FormDialog>
  );
}
