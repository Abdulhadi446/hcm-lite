"use client";

import { useCallback, useEffect, useState } from "react";
import { ChevronDownIcon, RotateCwIcon, ShieldAlertIcon } from "lucide-react";

import { EmptyState } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

type AuditRow = {
  id: number;
  actorName: string;
  actorRole: string;
  action: string;
  entity: string;
  entityId: number | null;
  beforeJson: string | null;
  afterJson: string | null;
  ip: string | null;
  createdAt: string;
};

type AuditResponse = {
  items: AuditRow[];
  total: number;
  page: number;
  pageSize: number;
  entities: string[];
};

type BadgeVariant = "default" | "secondary" | "destructive" | "outline";

const ACTION_VARIANTS: Record<string, BadgeVariant> = {
  create: "default",
  update: "secondary",
  delete: "destructive",
  deactivate: "destructive",
  reject: "destructive",
  reset_password: "outline",
  import: "outline",
  login: "outline",
};

const ENTITY_LABELS: Record<string, string> = {
  announcement: "Announcement",
  employee: "Employee",
  user: "User",
  department: "Department",
  designation: "Designation",
  leave_type: "Leave type",
  holiday: "Holiday",
  settings: "Settings",
};

function entityLabel(entity: string): string {
  return ENTITY_LABELS[entity] ?? entity.replace(/_/g, " ");
}

function roleLabel(role: string): string {
  if (role === "admin") return "Admin";
  if (role === "hr") return "HR";
  return "Employee";
}

function prettyJson(value: string | null): string {
  if (!value) return "—";
  try {
    return JSON.stringify(JSON.parse(value), null, 2);
  } catch {
    return value;
  }
}

function formatTimestamp(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return `${date.toLocaleDateString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  })} ${date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}`;
}

async function readError(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: string };
    if (body?.error === "Forbidden") return "Only Admins can view the audit log.";
    if (body?.error && /\s/.test(body.error)) return body.error;
  } catch {
    /* ignore */
  }
  return "Could not load the audit log. Try again.";
}

export function AuditView() {
  const [entity, setEntity] = useState("all");
  const [actor, setActor] = useState("");
  const [debouncedActor, setDebouncedActor] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);

  const [data, setData] = useState<AuditResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedActor(actor.trim()), 300);
    return () => clearTimeout(timer);
  }, [actor]);

  useEffect(() => {
    setPage(1);
  }, [entity, debouncedActor, from, to]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({ page: String(page) });
    if (entity !== "all") params.set("entity", entity);
    if (debouncedActor) params.set("actor", debouncedActor);
    if (from) params.set("from", from);
    if (to) params.set("to", to);

    try {
      const res = await fetch(`/api/audit-logs?${params.toString()}`, { cache: "no-store" });
      if (!res.ok) throw new Error(await readError(res));
      const body = (await res.json()) as AuditResponse;
      setData(body);
      setExpandedId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load the audit log");
    } finally {
      setLoading(false);
    }
  }, [entity, debouncedActor, from, to, page]);

  useEffect(() => {
    void load();
  }, [load]);

  const items = data?.items ?? [];
  const pageCount = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  const rangeStart = data && data.total > 0 ? (data.page - 1) * data.pageSize + 1 : 0;
  const rangeEnd = data ? Math.min(data.page * data.pageSize, data.total) : 0;
  const filtersActive = entity !== "all" || actor !== "" || from !== "" || to !== "";

  function resetFilters() {
    setEntity("all");
    setActor("");
    setFrom("");
    setTo("");
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border bg-card p-3">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1.5">
            <Label htmlFor="audit-entity" className="text-xs font-medium">
              Entity
            </Label>
            <Select
              value={entity}
              onValueChange={(value) => setEntity(String(value ?? "all"))}
              items={[
                { label: "All entities", value: "all" },
                ...(data?.entities ?? []).map((name) => ({
                  label: entityLabel(name),
                  value: name,
                })),
              ]}
            >
              <SelectTrigger id="audit-entity" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All entities</SelectItem>
                {(data?.entities ?? []).map((name) => (
                  <SelectItem key={name} value={name}>
                    {entityLabel(name)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="audit-actor" className="text-xs font-medium">
              Actor
            </Label>
            <Input
              id="audit-actor"
              value={actor}
              onChange={(event) => setActor(event.target.value)}
              placeholder="Search name or email"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="audit-from" className="text-xs font-medium">
              From
            </Label>
            <Input
              id="audit-from"
              type="date"
              value={from}
              max={to || undefined}
              onChange={(event) => setFrom(event.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="audit-to" className="text-xs font-medium">
              To
            </Label>
            <Input
              id="audit-to"
              type="date"
              value={to}
              min={from || undefined}
              onChange={(event) => setTo(event.target.value)}
            />
          </div>
        </div>

        {filtersActive ? (
          <div className="mt-3 flex items-center justify-between gap-2">
            <span className="text-[11px] text-muted-foreground">
              {data ? `${data.total} matching ${data.total === 1 ? "entry" : "entries"}` : "Filtering…"}
            </span>
            <Button variant="ghost" size="xs" onClick={resetFilters}>
              Clear filters
            </Button>
          </div>
        ) : null}
      </div>

      {loading && !data ? (
        <div className="space-y-2 rounded-lg border border-border bg-card p-4">
          {[0, 1, 2, 3, 4].map((key) => (
            <div key={key} className="flex items-center gap-4">
              <Skeleton className="h-3 w-28" />
              <Skeleton className="h-5 w-16" />
              <Skeleton className="h-3 w-24" />
              <Skeleton className="ml-auto h-3 w-20" />
            </div>
          ))}
        </div>
      ) : error ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-6 text-center">
          <p className="text-sm font-medium text-destructive">Couldn’t load the audit log</p>
          <p className="mt-1 text-xs text-muted-foreground">{error}</p>
          <Button variant="outline" size="sm" className="mt-3 gap-1.5" onClick={() => void load()}>
            <RotateCwIcon className="size-3.5" />
            Try again
          </Button>
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          title={filtersActive ? "No entries match these filters" : "No audit entries yet"}
          description={
            filtersActive
              ? "Try widening the date range or clearing the actor search."
              : "Creates, updates, approvals and deletions will appear here as the team works."
          }
          action={
            filtersActive ? (
              <Button variant="outline" size="sm" onClick={resetFilters}>
                Clear filters
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="rounded-lg border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8">
                  <span className="sr-only">Expand</span>
                </TableHead>
                <TableHead>Actor</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Entity</TableHead>
                <TableHead>ID</TableHead>
                <TableHead>When</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((row) => {
                const expanded = expandedId === row.id;
                return (
                  <RowGroup
                    key={row.id}
                    row={row}
                    expanded={expanded}
                    onToggle={() => setExpandedId(expanded ? null : row.id)}
                  />
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {data && data.total > 0 ? (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[11px] text-muted-foreground">
            Showing {rangeStart}–{rangeEnd} of {data.total}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1 || loading}
              onClick={() => setPage((current) => Math.max(1, current - 1))}
            >
              Previous
            </Button>
            <span className="text-[11px] tabular-nums text-muted-foreground">
              Page {data.page} of {pageCount}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= pageCount || loading}
              onClick={() => setPage((current) => current + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function RowGroup({
  row,
  expanded,
  onToggle,
}: {
  row: AuditRow;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <>
      <TableRow data-state={expanded ? "selected" : undefined}>
        <TableCell className="pr-0">
          <Button
            variant="ghost"
            size="icon-xs"
            aria-expanded={expanded}
            aria-label={expanded ? "Hide snapshots" : "Show snapshots"}
            onClick={onToggle}
          >
            <ChevronDownIcon
              className={cn("size-3.5 transition-transform", expanded && "rotate-180")}
            />
          </Button>
        </TableCell>
        <TableCell>
          <div className="leading-tight">
            <p className="max-w-[12rem] truncate text-sm font-medium">{row.actorName}</p>
            <p className="text-[11px] text-muted-foreground">{roleLabel(row.actorRole)}</p>
          </div>
        </TableCell>
        <TableCell>
          <Badge variant={ACTION_VARIANTS[row.action] ?? "outline"}>{row.action}</Badge>
        </TableCell>
        <TableCell className="text-sm">{entityLabel(row.entity)}</TableCell>
        <TableCell className="text-xs tabular-nums text-muted-foreground">
          {row.entityId ?? "—"}
        </TableCell>
        <TableCell className="text-xs text-muted-foreground">
          {formatTimestamp(row.createdAt)}
        </TableCell>
      </TableRow>
      {expanded ? (
        <TableRow className="bg-muted/30 hover:bg-muted/30">
          <TableCell colSpan={6} className="whitespace-normal p-3">
            <div className="grid gap-3 md:grid-cols-2">
              <Snapshot title="Before" value={row.beforeJson} />
              <Snapshot title="After" value={row.afterJson} />
            </div>
            {row.ip ? (
              <p className="mt-2 text-[11px] text-muted-foreground">IP {row.ip}</p>
            ) : null}
          </TableCell>
        </TableRow>
      ) : null}
    </>
  );
}

function Snapshot({ title, value }: { title: string; value: string | null }) {
  return (
    <div className="min-w-0 space-y-1">
      <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        <ShieldAlertIcon className="size-3" />
        {title}
      </p>
      <pre className="max-h-56 overflow-auto rounded-md border border-border bg-background p-2 font-mono text-[11px] leading-relaxed break-all whitespace-pre-wrap">
        {prettyJson(value)}
      </pre>
    </div>
  );
}
