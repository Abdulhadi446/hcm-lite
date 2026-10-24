"use client";

import { useState } from "react";
import { toast } from "sonner";

import { Textarea } from "@/components/ui/textarea";
import { FormDialog } from "@/components/shared/dialogs";
import { apiFetch, readableError } from "@/components/shared/api";
import { formatDateRange } from "@/components/shared/format";
import type { LeaveRequestRow } from "./types";

export function LeaveReviewDialog({
  request,
  action,
  onOpenChange,
  onDone,
}: {
  request: LeaveRequestRow | null;
  action: "approve" | "reject";
  onOpenChange: (open: boolean) => void;
  onDone: () => void;
}) {
  const [comment, setComment] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isApprove = action === "approve";

  async function submit() {
    if (!request) return;
    setPending(true);
    setError(null);
    try {
      await apiFetch(`/api/leave/requests/${request.id}`, {
        method: "PATCH",
        body: { action, comment: comment.trim() || undefined },
      });
      toast.success(isApprove ? "Leave approved" : "Leave rejected");
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
      open={Boolean(request)}
      onOpenChange={(open) => {
        if (!open) {
          setComment("");
          setError(null);
        }
        onOpenChange(open);
      }}
      title={isApprove ? "Approve leave" : "Reject leave"}
      description={
        isApprove
          ? "The employee is notified and these days count towards their balance."
          : "The employee is notified with your comment."
      }
      submitLabel={isApprove ? "Approve" : "Reject"}
      pendingLabel={isApprove ? "Approving…" : "Rejecting…"}
      pending={pending}
      error={error}
      onSubmit={submit}
    >
      {request ? (
        <div className="space-y-2 rounded-lg border border-border bg-muted/40 p-3 text-xs">
          <div className="flex items-start justify-between gap-2">
            <p className="font-medium">{request.employeeName}</p>
            <p className="text-muted-foreground">{request.leaveTypeName}</p>
          </div>
          <p className="text-muted-foreground">
            {formatDateRange(request.startDate, request.endDate)} ·{" "}
            <span className="tabular-nums">
              {request.days} day{request.days === 1 ? "" : "s"}
            </span>
          </p>
          <p className="text-muted-foreground">
            <span className="text-foreground">Reason:</span> {request.reason || "No reason given"}
          </p>
        </div>
      ) : null}

      <div className="space-y-1.5">
        <label
          htmlFor="leave-review-comment"
          className="flex items-baseline justify-between gap-2 text-xs font-medium"
        >
          Comment
          <span className="text-[11px] font-normal text-muted-foreground">Optional</span>
        </label>
        <Textarea
          id="leave-review-comment"
          value={comment}
          onChange={(event) => setComment(event.target.value)}
          placeholder={isApprove ? "e.g. Enjoy the break" : "e.g. Too many people off that week"}
          rows={2}
        />
      </div>
    </FormDialog>
  );
}
