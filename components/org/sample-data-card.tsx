"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowRightIcon,
  CheckIcon,
  CopyIcon,
  DatabaseIcon,
  Loader2Icon,
  SparklesIcon,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { ApiRequestError, api, readableError } from "./api";

const DEMO_PASSWORD = "Demo@12345";

type SampleDataStatus = { employees: number; seeded: boolean };

type SampleDataResult = {
  created: {
    departments: number;
    designations: number;
    employees: number;
    attendanceDays: number;
    leaveRequests: number;
    payrollRuns: number;
    announcements: number;
  };
  credentials: { email: string; password: string }[];
};

function plural(count: number, singular: string): string {
  return `${count} ${singular}${count === 1 ? "" : "s"}`;
}

export function SampleDataCard() {
  const [status, setStatus] = useState<SampleDataStatus | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<SampleDataResult | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    api<SampleDataStatus>("/api/demo/seed")
      .then((value) => {
        if (!active) return;
        setStatus(value);
        setStatusError(null);
      })
      .catch((err) => {
        if (active) setStatusError(readableError(err));
      });
    return () => {
      active = false;
    };
  }, []);

  const seeded = status?.seeded ?? false;
  const busy = pending;
  const disabled = seeded || busy || status === null;

  const load = async () => {
    setPending(true);
    try {
      const value = await api<SampleDataResult>("/api/demo/seed", { method: "POST" });
      setResult(value);
      setConfirmOpen(false);
      setStatus({ employees: value.created.employees, seeded: true });
      toast.success("Sample data loaded");
    } catch (err) {
      if (err instanceof ApiRequestError && err.code === "not_empty") {
        setConfirmOpen(false);
        setStatus((current) => ({
          employees: current?.employees ?? 0,
          seeded: true,
        }));
        toast.error("This install already has employees, so sample data can't be loaded.");
      } else {
        toast.error(readableError(err));
      }
    } finally {
      setPending(false);
    }
  };

  const copyPassword = async (email: string) => {
    try {
      await navigator.clipboard.writeText(DEMO_PASSWORD);
      setCopied(email);
      toast.success("Password copied");
      setTimeout(() => setCopied((current) => (current === email ? null : current)), 1500);
    } catch {
      toast.error("Couldn't copy. Select the password and copy it manually.");
    }
  };

  const counts = result
    ? [
        { label: "departments", value: result.created.departments },
        { label: "designations", value: result.created.designations },
        { label: "employees", value: result.created.employees },
        { label: "attendance days", value: result.created.attendanceDays },
        { label: "leave requests", value: result.created.leaveRequests },
        { label: "payroll runs", value: result.created.payrollRuns },
        { label: "announcements", value: result.created.announcements },
      ]
    : [];

  return (
    <>
      <Card size="sm">
        <CardHeader>
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle className="flex items-center gap-1.5">
              <SparklesIcon className="size-3.5 text-muted-foreground" />
              Sample data
            </CardTitle>
            <Badge variant="outline" className="font-normal text-muted-foreground">
              {status ? plural(status.employees, "employee") : "Checking…"}
            </Badge>
          </div>
          <CardDescription className="text-xs">
            Populate departments, employees, attendance, leave, payroll and announcements so you
            can explore the app — for empty installs only.
          </CardDescription>
        </CardHeader>

        <CardContent className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 space-y-0.5">
            <p className="text-xs text-muted-foreground">
              Creates six logins that share the password{" "}
              <code className="rounded bg-muted px-1 py-0.5 font-mono text-[11px] text-foreground">
                {DEMO_PASSWORD}
              </code>
              .
            </p>
            {seeded ? (
              <p className="text-[11px] text-muted-foreground">Sample data already loaded</p>
            ) : statusError ? (
              <p className="text-[11px] text-muted-foreground">
                Couldn&apos;t check whether sample data is loaded. Reload the page to try again.
              </p>
            ) : null}
          </div>

          <Button
            size="sm"
            className="w-full shrink-0 gap-1.5 sm:w-auto"
            onClick={() => setConfirmOpen(true)}
            disabled={disabled}
          >
            {busy ? (
              <Loader2Icon className="size-3.5 animate-spin" />
            ) : (
              <DatabaseIcon className="size-3.5" />
            )}
            {busy ? "Loading…" : "Load sample data"}
          </Button>
        </CardContent>
      </Card>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent showCloseButton={false} className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Load sample data?</DialogTitle>
            <DialogDescription className="text-xs">
              This fills the workspace with demo departments, six employees, a month of attendance,
              leave requests, two payroll runs and two announcements. It only works while there are
              no employees.
            </DialogDescription>
          </DialogHeader>

          <ul className="grid grid-cols-2 gap-1.5 text-xs text-muted-foreground">
            <li>4 departments</li>
            <li>5 designations</li>
            <li>6 employee logins</li>
            <li>30 weekdays of attendance</li>
            <li>3 leave requests</li>
            <li>2 payroll runs</li>
          </ul>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setConfirmOpen(false)}
              disabled={busy}
            >
              Cancel
            </Button>
            <Button type="button" size="sm" className="gap-1.5" onClick={load} disabled={busy}>
              {busy ? (
                <Loader2Icon className="size-3.5 animate-spin" />
              ) : (
                <DatabaseIcon className="size-3.5" />
              )}
              {busy ? "Loading…" : "Load sample data"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!result}
        onOpenChange={(open) => {
          if (!open) setResult(null);
        }}
      >
        <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <span className="flex size-6 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600">
                <CheckIcon className="size-3.5" />
              </span>
              Sample data loaded
            </DialogTitle>
            <DialogDescription className="text-xs">
              The demo workspace is ready. Every sample employee can sign in immediately with the
              password below.
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {counts.map((item) => (
              <div
                key={item.label}
                className="rounded-lg border border-border bg-muted/30 px-2.5 py-2"
              >
                <p className="text-lg font-semibold tabular-nums">{item.value}</p>
                <p className="text-[11px] text-muted-foreground">{item.label}</p>
              </div>
            ))}
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-medium">Employee logins</p>
              <Badge variant="secondary" className="font-mono text-[10px]">
                {DEMO_PASSWORD}
              </Badge>
            </div>

            <div className="max-h-48 overflow-y-auto rounded-lg border border-border sm:max-h-72">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Email</TableHead>
                    <TableHead className="text-right">Password</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {result?.credentials.map((credential) => (
                    <TableRow key={credential.email}>
                      <TableCell className="max-w-[220px] truncate text-xs font-medium">
                        {credential.email}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <code className="font-mono text-[11px]">{credential.password}</code>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-xs"
                            onClick={() => copyPassword(credential.email)}
                            aria-label={`Copy password for ${credential.email}`}
                          >
                            {copied === credential.email ? <CheckIcon /> : <CopyIcon />}
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <p className="text-[11px] text-muted-foreground">
              All six logins use the same password and don&apos;t need to change it on first
              sign-in.
            </p>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" size="sm" onClick={() => setResult(null)}>
              Close
            </Button>
            <Link
              href="/dashboard"
              className={cn(buttonVariants({ size: "sm" }), "gap-1.5")}
            >
              Go to dashboard
              <ArrowRightIcon className="size-3.5" />
            </Link>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
