"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  BriefcaseIcon,
  BuildingIcon,
  CalendarClockIcon,
  CalendarDaysIcon,
  KeyRoundIcon,
  LockIcon,
  UsersIcon,
} from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CompanyTab } from "./company-tab";
import { DepartmentsTab } from "./departments-tab";
import { DesignationsTab } from "./designations-tab";
import { HolidaysTab } from "./holidays-tab";
import { LeaveTypesTab } from "./leave-types-tab";
import { LoginsTab } from "./logins-tab";
import type { Role } from "./types";

const TABS = [
  { value: "company", label: "Company", icon: BuildingIcon },
  { value: "departments", label: "Departments", icon: UsersIcon },
  { value: "designations", label: "Designations", icon: BriefcaseIcon },
  { value: "leave-types", label: "Leave types", icon: CalendarClockIcon },
  { value: "holidays", label: "Holidays", icon: CalendarDaysIcon },
  { value: "logins", label: "Logins", icon: KeyRoundIcon, adminOnly: true },
] as const;

type TabValue = (typeof TABS)[number]["value"];

function resolveTab(value: string | null, role: Role): TabValue {
  if (!value) return "company";
  const match = TABS.find((tab) => tab.value === value);
  if (!match) return "company";
  if ("adminOnly" in match && match.adminOnly && role !== "admin") return "company";
  return match.value;
}

export function OrganizationView({ role, viewerId }: { role: Role; viewerId: number }) {
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<TabValue>(() => resolveTab(searchParams.get("tab"), role));

  const canWrite = role === "admin";
  const tabs = TABS.filter((item) => !("adminOnly" in item && item.adminOnly) || canWrite);

  const handleTabChange = (value: string) => {
    const next = resolveTab(value, role);
    setTab(next);

    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    if (next === "company") url.searchParams.delete("tab");
    else url.searchParams.set("tab", next);
    window.history.replaceState(null, "", url);
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Organization"
        description={
          canWrite
            ? "Company-wide rules, structure and logins — the settings everything else uses."
            : "Company-wide rules and structure. An admin manages these values."
        }
        actions={
          canWrite ? undefined : (
            <Badge variant="outline" className="gap-1.5 text-muted-foreground">
              <LockIcon className="size-3" />
              View only
            </Badge>
          )
        }
      />

      <Tabs value={tab} onValueChange={handleTabChange} className="gap-4">
        <div className="-mx-4 overflow-x-auto px-4 pb-0.5 sm:mx-0 sm:px-0">
          <TabsList className="h-auto! w-full flex-wrap justify-start gap-1 rounded-lg bg-muted/60 p-1 sm:h-9! sm:w-fit sm:flex-nowrap">
            {tabs.map((item) => {
              const Icon = item.icon;
              return (
                <TabsTrigger
                  key={item.value}
                  value={item.value}
                  className="h-7 flex-none gap-1.5 px-2 text-xs data-active:shadow-sm sm:px-2.5 sm:text-[13px]"
                >
                  <Icon className="hidden size-3.5 sm:block" />
                  {item.label}
                </TabsTrigger>
              );
            })}
          </TabsList>
        </div>

        <TabsContent value="company" keepMounted className="min-w-0">
          <CompanyTab canEdit={canWrite} />
        </TabsContent>

        <TabsContent value="departments" keepMounted className="min-w-0">
          <DepartmentsTab canWrite={canWrite} />
        </TabsContent>

        <TabsContent value="designations" keepMounted className="min-w-0">
          <DesignationsTab canWrite={canWrite} />
        </TabsContent>

        <TabsContent value="leave-types" keepMounted className="min-w-0">
          <LeaveTypesTab canWrite={canWrite} />
        </TabsContent>

        <TabsContent value="holidays" keepMounted className="min-w-0">
          <HolidaysTab canWrite={canWrite} />
        </TabsContent>

        {canWrite ? (
          <TabsContent value="logins" keepMounted className="min-w-0">
            <LoginsTab viewerId={viewerId} />
          </TabsContent>
        ) : null}
      </Tabs>
    </div>
  );
}
