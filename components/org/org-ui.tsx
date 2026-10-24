"use client";

import { cn } from "cn";
import { PlusIcon, RotateCwIcon, TriangleAlertIcon } from "lucide-react";

import { Alert, AlertAction, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";

export function SectionHeader({
  title,
  description,
  count,
  action,
}: {
  title: string;
  description?: string;
  count?: number;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-medium">{title}</h2>
          {typeof count === "number" ? (
            <span className="rounded-full bg-muted px-1.5 py-0.5 text-[11px] tabular-nums text-muted-foreground">
              {count}
            </span>
          ) : null}
        </div>
        {description ? <p className="mt-0.5 text-xs text-muted-foreground">{description}</p> : null}
      </div>
      {action ? <div className="flex shrink-0 items-center gap-2">{action}</div> : null}
    </div>
  );
}

export function AddButton({
  children,
  onClick,
  label,
}: {
  children: React.ReactNode;
  onClick: () => void;
  label?: string;
}) {
  return (
    <Button size="sm" className="gap-1.5" onClick={onClick} aria-label={label}>
      <PlusIcon className="size-3.5" />
      {children}
    </Button>
  );
}

export function Field({
  label,
  htmlFor,
  hint,
  hintRight,
  error,
  className,
  children,
}: {
  label: string;
  htmlFor?: string;
  hint?: string;
  hintRight?: string;
  error?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <div className="flex items-baseline justify-between gap-2">
        <Label htmlFor={htmlFor} className="text-xs font-medium">
          {label}
        </Label>
        {hintRight ? (
          <span className="text-[11px] tabular-nums text-muted-foreground">{hintRight}</span>
        ) : null}
      </div>
      {children}
      {error ? (
        <p className="text-[11px] text-destructive">{error}</p>
      ) : hint ? (
        <p className="text-[11px] text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}

export function TableSkeleton({
  columns = 3,
  rows = 4,
}: {
  columns?: number;
  rows?: number;
}) {
  const widths = ["w-36", "w-24", "w-16", "w-20", "w-14"];

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card">
      <div className="flex items-center gap-4 border-b border-border bg-muted/40 px-4 py-3">
        {Array.from({ length: columns }).map((_, i) => (
          <Skeleton key={i} className={cn("h-2.5", widths[i % widths.length])} />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, row) => (
        <div
          key={row}
          className="flex items-center gap-4 border-b border-border px-4 py-3.5 last:border-0"
        >
          <Skeleton className={cn("h-3", row % 2 === 0 ? "w-40" : "w-32")} />
          <Skeleton className="h-3 w-20" />
          {columns > 2 ? <Skeleton className="ml-auto h-3 w-14" /> : null}
        </div>
      ))}
    </div>
  );
}

export function ErrorPanel({
  title = "Couldn't load this list",
  message,
  onRetry,
}: {
  title?: string;
  message: string;
  onRetry: () => void;
}) {
  return (
    <Alert variant="destructive" className="border-destructive/30 bg-destructive/5 py-2.5">
      <TriangleAlertIcon />
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription className="text-xs">{message}</AlertDescription>
      <AlertAction>
        <Button variant="outline" size="xs" className="gap-1" onClick={onRetry}>
          <RotateCwIcon className="size-3" />
          Retry
        </Button>
      </AlertAction>
    </Alert>
  );
}

export function FormDialog({
  open,
  onOpenChange,
  title,
  description,
  submitLabel,
  pendingLabel = "Saving…",
  pending,
  error,
  onSubmit,
  children,
  wide,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  submitLabel: string;
  pendingLabel?: string;
  pending: boolean;
  error?: string | null;
  onSubmit: () => void;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className={cn("max-h-[calc(100dvh-2rem)] overflow-y-auto", wide ? "sm:max-w-lg" : "sm:max-w-md")}
      >
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit();
          }}
        >
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            {description ? <DialogDescription className="text-xs">{description}</DialogDescription> : null}
          </DialogHeader>

          {error ? (
            <p
              role="alert"
              className="rounded-md border border-destructive/30 bg-destructive/5 px-2.5 py-2 text-xs text-destructive"
            >
              {error}
            </p>
          ) : null}

          <div className="space-y-4">{children}</div>

          <DialogFooter>
            <DialogClose
              render={<Button type="button" variant="outline" size="sm" disabled={pending} />}
            >
              Cancel
            </DialogClose>
            <Button type="submit" size="sm" disabled={pending}>
              {pending ? pendingLabel : submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  pendingLabel = "Deleting…",
  pending,
  error,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel: string;
  pendingLabel?: string;
  pending: boolean;
  error?: string | null;
  onConfirm: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false} className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription className="text-xs">{description}</DialogDescription>
        </DialogHeader>
        {error ? (
          <p
            role="alert"
            className="rounded-md border border-destructive/30 bg-destructive/5 px-2.5 py-2 text-xs text-destructive"
          >
            {error}
          </p>
        ) : null}
        <DialogFooter>
          <DialogClose render={<Button variant="outline" size="sm" disabled={pending} />}>
            Cancel
          </DialogClose>
          <Button
            size="sm"
            disabled={pending}
            onClick={onConfirm}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {pending ? pendingLabel : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
