"use client";

import { cn } from "@/lib/utils";
import { Label } from "@/components/ui/label";
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

export function Field({
  label,
  htmlFor,
  hint,
  error,
  optional,
  children,
  className,
}: {
  label: string;
  htmlFor?: string;
  hint?: string;
  error?: string;
  optional?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <div className="flex items-baseline justify-between gap-2">
        <Label htmlFor={htmlFor} className="text-xs font-medium">
          {label}
        </Label>
        {optional ? <span className="text-[11px] text-muted-foreground">Optional</span> : null}
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
        className={cn(
          "max-h-[calc(100dvh-2rem)] overflow-y-auto",
          wide ? "sm:max-w-lg" : "sm:max-w-md",
        )}
      >
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            onSubmit();
          }}
        >
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            {description ? (
              <DialogDescription className="text-xs">{description}</DialogDescription>
            ) : null}
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
  pendingLabel = "Working…",
  pending,
  error,
  destructive,
  onConfirm,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel: string;
  pendingLabel?: string;
  pending: boolean;
  error?: string | null;
  destructive?: boolean;
  onConfirm: () => void;
  children?: React.ReactNode;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false} className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription className="text-xs">{description}</DialogDescription>
        </DialogHeader>

        {children ? <div className="space-y-3">{children}</div> : null}

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
            className={cn(destructive && "bg-destructive text-destructive-foreground hover:bg-destructive/90")}
          >
            {pending ? pendingLabel : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
