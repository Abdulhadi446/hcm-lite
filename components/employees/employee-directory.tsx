"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  DownloadIcon,
  PlusIcon,
  SearchIcon,
  UploadIcon,
  XIcon,
} from "lucide-react";

import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { EmptyState, PageHeader } from "@/components/page-header";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmployeeTable } from "./employee-table";
import {
  readApiError,
  type Department,
  type EmployeeList,
  type Role,
} from "./types";

const PAGE_SIZE = 20;

const STATUS_ITEMS = [
  { label: "All statuses", value: "all" },
  { label: "Active", value: "active" },
  { label: "Probation", value: "probation" },
  { label: "Exited", value: "exited" },
];

const SORT_ITEMS = [
  { label: "Sort: name", value: "name" },
  { label: "Sort: code", value: "code" },
  { label: "Sort: join date", value: "joinDate" },
];

export function EmployeeDirectory({ role }: { role: Role }) {
  const canManage = role === "hr";

  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [departmentId, setDepartmentId] = useState("all");
  const [status, setStatus] = useState("all");
  const [sort, setSort] = useState("name");
  const [page, setPage] = useState(1);
  const [reloadKey, setReloadKey] = useState(0);

  const [departments, setDepartments] = useState<Department[]>([]);
  const [data, setData] = useState<EmployeeList | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Debounced search — 300 ms.
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQ(q.trim()), 300);
    return () => clearTimeout(timer);
  }, [q]);

  useEffect(() => {
    setPage(1);
  }, [debouncedQ, departmentId, status, sort]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/departments", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : { items: [] }))
      .then((body: { items?: Department[] }) => {
        if (!cancelled) setDepartments(body.items ?? []);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({
      page: String(page),
      pageSize: String(PAGE_SIZE),
      sort,
    });
    if (debouncedQ) params.set("q", debouncedQ);
    if (departmentId !== "all") params.set("departmentId", departmentId);
    if (status !== "all") params.set("status", status);

    setLoading(true);
    setError(null);
    fetch(`/api/employees?${params.toString()}`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (res) => {
        if (!res.ok) throw new Error((await readApiError(res)).message);
        return (await res.json()) as EmployeeList;
      })
      .then((body) => {
        setData(body);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : "Could not load employees");
        setLoading(false);
      });

    return () => controller.abort();
  }, [debouncedQ, departmentId, status, sort, page, reloadKey]);

  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / (data?.pageSize || PAGE_SIZE)));
  const hasFilters = Boolean(debouncedQ) || departmentId !== "all" || status !== "all";
  const firstRow = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const lastRow = Math.min(page * PAGE_SIZE, total);

  function clearFilters() {
    setQ("");
    setDebouncedQ("");
    setDepartmentId("all");
    setStatus("all");
    setSort("name");
    setPage(1);
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Employees"
        description={
          loading && !data
            ? "Loading employees…"
            : `${total} ${total === 1 ? "employee" : "employees"} in the directory`
        }
        actions={
          canManage ? (
            <>
              <Link href="/employees/new" className={buttonVariants({ size: "sm" })}>
                <PlusIcon />
                Add employee
              </Link>
              <Link
                href="/employees/import"
                className={buttonVariants({ variant: "outline", size: "sm" })}
              >
                <UploadIcon />
                Import CSV
              </Link>
              {/* CSV download: a plain anchor streams the file, Link would prefetch it. */}
              {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
              <a
                href="/api/employees/export"
                className={buttonVariants({ variant: "outline", size: "sm" })}
              >
                <DownloadIcon />
                Export
              </a>
            </>
          ) : null
        }
      />

      <Card>
        <CardContent className="grid gap-2 p-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_10rem_10rem_10rem]">
          <div className="relative sm:col-span-2 lg:col-span-1">
            <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search name, code or email…"
              className="pl-8"
              aria-label="Search employees"
            />
            {q ? (
              <button
                type="button"
                onClick={() => setQ("")}
                className="absolute top-1/2 right-2 -translate-y-1/2 rounded-sm p-0.5 text-muted-foreground hover:text-foreground"
                aria-label="Clear search"
              >
                <XIcon className="size-3.5" />
              </button>
            ) : null}
          </div>

          <Select
            value={departmentId}
            onValueChange={(v) => setDepartmentId(v ?? "all")}
            items={[
              { label: "All departments", value: "all" },
              ...departments.map((d) => ({ label: d.name, value: String(d.id) })),
            ]}
          >
            <SelectTrigger className="w-full" aria-label="Filter by department">
              <SelectValue placeholder="All departments" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All departments</SelectItem>
              {departments.map((d) => (
                <SelectItem key={d.id} value={String(d.id)}>
                  {d.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={status} onValueChange={(v) => setStatus(v ?? "all")} items={STATUS_ITEMS}>
            <SelectTrigger className="w-full" aria-label="Filter by status">
              <SelectValue placeholder="All statuses" />
            </SelectTrigger>
            <SelectContent>
              {STATUS_ITEMS.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={sort} onValueChange={(v) => setSort(v ?? "name")} items={SORT_ITEMS}>
            <SelectTrigger className="w-full" aria-label="Sort employees">
              <SelectValue placeholder="Sort: name" />
            </SelectTrigger>
            <SelectContent>
              {SORT_ITEMS.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      <Card className="overflow-hidden">
        {error ? (
          <CardContent className="p-4">
            <EmptyState
              title="Couldn't load employees"
              description={error}
              action={
                <Button size="sm" onClick={() => setReloadKey((k) => k + 1)}>
                  Try again
                </Button>
              }
            />
          </CardContent>
        ) : !loading && total === 0 ? (
          <CardContent className="p-4">
            {hasFilters ? (
              <EmptyState
                title="No employees match your filters"
                description="Try a different search term, department or status."
                action={
                  <Button size="sm" variant="outline" onClick={clearFilters}>
                    Clear filters
                  </Button>
                }
              />
            ) : (
              <EmptyState
                title="No employees yet"
                description="No employees yet. HR registers the first employee — that creates their login."
                action={
                  canManage ? (
                    <Link href="/employees/new" className={buttonVariants({ size: "sm" })}>
                      <PlusIcon />
                      Add employee
                    </Link>
                  ) : null
                }
              />
            )}
          </CardContent>
        ) : (
          <>
            <EmployeeTable
              items={data?.items ?? []}
              loading={loading || !data}
              showSalary
              skeletonRows={Math.min(8, data?.items.length || 7)}
            />
            <div className="flex flex-col gap-2 border-t border-border px-4 py-3 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
              <p className="tabular-nums">
                {total > 0 ? `Showing ${firstRow}–${lastRow} of ${total}` : "No results"}
              </p>
              <div className="flex items-center gap-2">
                <span className="tabular-nums">
                  Page {page} of {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="icon-sm"
                  disabled={page <= 1 || loading}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  aria-label="Previous page"
                >
                  <ArrowLeftIcon />
                </Button>
                <Button
                  variant="outline"
                  size="icon-sm"
                  disabled={page >= totalPages || loading}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  aria-label="Next page"
                >
                  <ArrowRightIcon />
                </Button>
              </div>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
