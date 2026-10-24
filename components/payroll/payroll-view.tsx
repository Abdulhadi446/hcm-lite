"use client";

import { useState } from "react";
import { PlusIcon } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/page-header";
import { ConfirmDialog } from "@/components/shared/dialogs";
import { ApiRequestError, apiFetch, readableError } from "@/components/shared/api";
import { formatMoney, formatMonth } from "@/components/shared/format";
import { useApi } from "@/components/shared/use-api";
import { PayrollRunDetailCard } from "./payroll-run-detail";
import { PayrollRuns } from "./payroll-runs";
import type { PayrollRun, PayrollRunDetail, PayslipRow } from "./types";

export function PayrollView({
  role,
  initialMonth,
}: {
  role: "admin" | "hr";
  initialMonth: string;
}) {
  const [month, setMonth] = useState(initialMonth);
  const canCreate = role === "hr";
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [discardedId, setDiscardedId] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);
  const [confirm, setConfirm] = useState<"finalize" | "discard" | null>(null);
  const [actionPending, setActionPending] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const runsApi = useApi<PayrollRun[]>("/api/payroll/runs", (json) =>
    Array.isArray(json.items) ? (json.items as PayrollRun[]) : [],
  );

  const runs = (runsApi.data ?? []).filter((run) => run.id !== discardedId);
  const activeId = selectedId ?? runs[0]?.id ?? null;

  const detailApi = useApi<PayrollRunDetail | null>(
    activeId ? `/api/payroll/runs/${activeId}` : null,
    (json) =>
      json.run
        ? {
            run: json.run as PayrollRun,
            payslips: Array.isArray(json.payslips) ? (json.payslips as PayslipRow[]) : [],
          }
        : null,
  );

  async function createRun() {
    if (!month || creating || !canCreate) return;
    setCreating(true);
    try {
      const result = await apiFetch<{ run: PayrollRun }>("/api/payroll/runs", {
        method: "POST",
        body: { month },
      });
      toast.success(`Draft payroll for ${formatMonth(month)} created`);
      if (result.run?.id) setSelectedId(result.run.id);
      runsApi.reload();
    } catch (err) {
      if (err instanceof ApiRequestError && err.code === "already_exists") {
        const existing = runs.find((run) => run.month === month);
        if (existing) setSelectedId(existing.id);
      }
      toast.error(readableError(err));
    } finally {
      setCreating(false);
    }
  }

  async function runAction() {
    if (!confirm || activeId == null) return;
    setActionPending(true);
    setActionError(null);
    try {
      if (confirm === "finalize") {
        await apiFetch(`/api/payroll/runs/${activeId}/finalize`, { method: "POST" });
        toast.success("Payroll finalized and locked");
      } else {
        await apiFetch(`/api/payroll/runs/${activeId}`, { method: "DELETE" });
        toast.success("Draft discarded");
        setDiscardedId(activeId);
        setSelectedId(null);
      }
      setConfirm(null);
      runsApi.reload();
      detailApi.reload();
    } catch (err) {
      setActionError(readableError(err));
    } finally {
      setActionPending(false);
    }
  }

  const detail = detailApi.data;
  const runMonth = detail?.run.month ?? month;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Payroll"
        description="Draft and lock monthly payroll, then publish payslips."
      />

      <Card>
        <CardContent className="flex flex-col gap-3 p-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-1.5">
            <Label htmlFor="payroll-month" className="text-xs font-medium">
              Payroll month
            </Label>
            <Input
              id="payroll-month"
              type="month"
              value={month}
              onChange={(event) => {
                if (event.target.value) setMonth(event.target.value);
              }}
              className="sm:w-44"
            />
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
            <p className="max-w-xs text-[11px] leading-relaxed text-muted-foreground">
              {canCreate
                ? "A draft uses attendance, leave and each employee's salary structure for the month."
                : "HR creates drafts. Admins review, finalize and lock them."}
            </p>
            {canCreate ? (
              <Button onClick={createRun} disabled={creating || !month}>
                <PlusIcon />
                {creating ? "Creating…" : "Create draft"}
              </Button>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-[19rem_minmax(0,1fr)]">
        <div className="self-start">
          <PayrollRuns
            runs={runs}
            loading={runsApi.loading}
            selectedId={activeId}
            canCreate={canCreate}
            onSelect={setSelectedId}
            onCreate={createRun}
          />
        </div>
        <PayrollRunDetailCard
          detail={detailApi.loading ? null : detail}
          loading={detailApi.loading}
          error={detailApi.error}
          role={role}
          canCreate={canCreate}
          onRetry={detailApi.reload}
          onFinalize={() => {
            setActionError(null);
            setConfirm("finalize");
          }}
          onDiscard={() => {
            setActionError(null);
            setConfirm("discard");
          }}
          onCreate={createRun}
        />
      </div>

      <ConfirmDialog
        open={confirm === "finalize"}
        onOpenChange={(open) => {
          if (!open) {
            setConfirm(null);
            setActionError(null);
          }
        }}
        title={`Finalize ${formatMonth(runMonth)}?`}
        description="This locks attendance and payroll for the month, publishes payslips and notifies employees. It can't be undone."
        confirmLabel="Finalize & lock"
        pendingLabel="Locking…"
        pending={actionPending}
        error={actionError}
        onConfirm={runAction}
      >
        {detail ? (
          <div className="flex items-center justify-between rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs">
            <span className="text-muted-foreground">Net total</span>
            <span className="font-semibold tabular-nums">{formatMoney(detail.run.totalNet)}</span>
          </div>
        ) : null}
      </ConfirmDialog>

      <ConfirmDialog
        open={confirm === "discard"}
        onOpenChange={(open) => {
          if (!open) {
            setConfirm(null);
            setActionError(null);
          }
        }}
        title={`Discard the ${formatMonth(runMonth)} draft?`}
        description="The draft and its payslips are deleted. You can create the run again afterwards."
        confirmLabel="Discard draft"
        pendingLabel="Discarding…"
        pending={actionPending}
        error={actionError}
        destructive
        onConfirm={runAction}
      />
    </div>
  );
}
