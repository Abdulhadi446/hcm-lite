"use client";

import { useState } from "react";
import { toast } from "sonner";

import { Textarea } from "@/components/ui/textarea";
import { FormDialog } from "@/components/shared/dialogs";
import { apiFetch, readableError } from "@/components/shared/api";
import { formatDate } from "@/components/shared/format";
import type { Correction } from "./types";

export function CorrectionReviewDialog({
  correction,
  action,
  onOpenChange,
  onDone,
}: {
  correction: Correction | null;
  action: "approve" | "reject";
  onOpenChange: (open: boolean) => void;
  onDone: () => void;
}) {
  const [comment, setComment] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isApprove = action === "approve";

  async function submit() {
    if (!correction) return;
    setPending(true);
    setError(null);
    try {
      await apiFetch(`/api/attendance/corrections/${correction.id}`, {
        method: "PATCH",
        body: { action, comment: comment.trim() || undefined },
      });
      toast.success(isApprove ? "Correction approved" : "Correction rejected");
      setComment("");
      onOpenChange(false);
      onDone();
    } catch (err) {
      setError(readableError(err));
    } finally {
      setPending(false);
    }
  }

  return (
    <FormDialog
      open={Boolean(correction)}
      onOpenChange={(open) => {
        if (!open) {
          setComment("");
          setError(null);
        }
        onOpenChange(open);
      }}
      title={isApprove ? "Approve correction" : "Reject correction"}
      description={
        isApprove
          ? "The day will be updated with the requested times and marked as a correction."
          : "The employee will see your reason on their correction request."
      }
      submitLabel={isApprove ? "Approve" : "Reject"}
      pendingLabel={isApprove ? "Approving…" : "Rejecting…"}
      pending={pending}
      error={error}
      onSubmit={submit}
    >
      {correction ? (
        <div className="space-y-2 rounded-lg border border-border bg-muted/40 p-3 text-xs">
          <div className="flex items-center justify-between gap-2">
            <p className="font-medium">{correction.employeeName ?? "Employee"}</p>
            <p className="text-muted-foreground">{formatDate(correction.date)}</p>
          </div>
          <p className="tabular-nums text-muted-foreground">
            Requested {correction.requestedCheckIn ?? "—"} →{" "}
            {correction.requestedCheckOut ?? "—"}
          </p>
          <p className="text-muted-foreground">
            <span className="text-foreground">Reason:</span> {correction.reason}
          </p>
        </div>
      ) : null}

      <div className="space-y-1.5">
        <label
          htmlFor="correction-comment"
          className="flex items-baseline justify-between gap-2 text-xs font-medium"
        >
          Comment
          <span className="text-[11px] font-normal text-muted-foreground">Optional</span>
        </label>
        <Textarea
          id="correction-comment"
          value={comment}
          onChange={(event) => setComment(event.target.value)}
          placeholder={isApprove ? "e.g. Forgot to check out" : "e.g. Please ask your manager first"}
          rows={2}
        />
      </div>
    </FormDialog>
  );
}
