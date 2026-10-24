"use client";

import { useState } from "react";
import { PlusIcon, RotateCwIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/page-header";
import { useApi } from "@/components/shared/use-api";
import { LeaveApplyDialog } from "./leave-apply-dialog";
import { LeaveBalanceCards } from "./leave-balance-cards";
import { MyLeaveHistory } from "./my-leave-history";
import { SmartLeaveBox } from "./smart-leave-box";
import type { LeaveBalance, LeaveType } from "./types";

export function MyLeaveView({ today }: { today: string }) {
  const [applyOpen, setApplyOpen] = useState(false);
  const [historyKey, setHistoryKey] = useState(0);
  const year = today.slice(0, 4);

  const balancesApi = useApi<LeaveBalance[]>("/api/leave/balances", (json) =>
    Array.isArray(json.items)
      ? (json.items as LeaveBalance[]).map((balance) => ({
          employeeId: Number(balance.employeeId),
          leaveTypeId: Number(balance.leaveTypeId),
          typeName: String(balance.typeName ?? "Leave"),
          quota: Number(balance.quota ?? 0),
          used: Number(balance.used ?? 0),
          pending: Number(balance.pending ?? 0),
          remaining: balance.remaining == null ? null : Number(balance.remaining),
        }))
      : [],
  );
  const balances = balancesApi.data ?? [];

  // Leave types come from the employee's own balances, so applying never needs
  // a types endpoint that isn't exposed to employees.
  const types: LeaveType[] = balances.map((balance) => ({
    id: balance.leaveTypeId,
    name: balance.typeName,
    quotaDays: balance.quota,
    paid: true,
  }));

  return (
    <div className="space-y-5">
      <PageHeader
        title="My leave"
        description="Your leave balances, requests, and history."
        actions={
          <Button size="sm" onClick={() => setApplyOpen(true)}>
            <PlusIcon />
            Apply for leave
          </Button>
        }
      />

      <SmartLeaveBox />

      <section className="space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-medium">Your balances</h2>
            <p className="text-xs text-muted-foreground">Quotas for {year}, refreshed as HR approves.</p>
          </div>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={balancesApi.reload}
            disabled={balancesApi.loading}
            aria-label="Refresh leave balances"
          >
            <RotateCwIcon className={balancesApi.loading ? "animate-spin" : undefined} />
          </Button>
        </div>

        <LeaveBalanceCards
          balances={balances}
          loading={balancesApi.loading}
          error={balancesApi.error}
          onRetry={balancesApi.reload}
          onApply={() => setApplyOpen(true)}
        />
      </section>

      <MyLeaveHistory
        key={historyKey}
        today={today}
        onApply={() => setApplyOpen(true)}
        onChanged={balancesApi.reload}
      />

      <LeaveApplyDialog
        key={applyOpen ? "open" : "closed"}
        today={today}
        open={applyOpen}
        onOpenChange={setApplyOpen}
        types={types}
        balances={balances}
        onCreated={() => {
          balancesApi.reload();
          setHistoryKey((key) => key + 1);
        }}
      />
    </div>
  );
}
