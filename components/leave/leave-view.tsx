"use client";

import { useState } from "react";
import { ShieldCheckIcon } from "lucide-react";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader } from "@/components/page-header";
import { LeaveBalances } from "./leave-balances";
import { LeaveRequests } from "./leave-requests";
import { parseLeaveStatus, type LeaveStatusFilter } from "./types";

export function LeaveView({
  role,
  initialStatus,
}: {
  role: "admin" | "hr";
  initialStatus: LeaveStatusFilter;
}) {
  const [tab, setTab] = useState("requests");
  const [status, setStatus] = useState<LeaveStatusFilter>(initialStatus);

  function changeStatus(value: string) {
    const next = parseLeaveStatus(value);
    setStatus(next);

    // Shallow URL update: keep the deep link shareable without refetching.
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    if (next === "pending") url.searchParams.delete("status");
    else url.searchParams.set("status", next);
    window.history.replaceState(null, "", url);
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Leave"
        description="Requests waiting for review and how much leave everyone has left."
        actions={
          role === "admin" ? (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1 text-xs text-muted-foreground">
              <ShieldCheckIcon className="size-3.5" />
              Approvals are HR-only
            </span>
          ) : null
        }
      />

      <Tabs value={tab} onValueChange={(value) => setTab(String(value))}>
        <TabsList className="w-full sm:w-72">
          <TabsTrigger value="requests">Requests</TabsTrigger>
          <TabsTrigger value="balances">Balances</TabsTrigger>
        </TabsList>
        <TabsContent value="requests" className="mt-3">
          <LeaveRequests
            canReview={role === "hr"}
            status={status}
            onStatusChange={changeStatus}
            onOpenBalances={() => setTab("balances")}
          />
        </TabsContent>
        <TabsContent value="balances" className="mt-3">
          <LeaveBalances role={role} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
