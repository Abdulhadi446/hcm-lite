"use client";

import { useState } from "react";
import { CheckIcon, CopyIcon, KeyRoundIcon } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export function TempPasswordDialog({
  open,
  onOpenChange,
  password,
  title = "Employee created",
  description,
  actionLabel = "Done",
  onAction,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  password: string;
  title?: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(password);
      setCopied(true);
      toast.success("Temporary password copied");
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Could not copy — select the password manually");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <KeyRoundIcon className="size-4 text-muted-foreground" />
            {title}
          </DialogTitle>
          <DialogDescription>
            {description ?? "Share this temporary password with the employee."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/50 px-3 py-2.5">
            <code className="min-w-0 flex-1 truncate font-mono text-sm tracking-wide">
              {password}
            </code>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={copy}
              aria-label="Copy temporary password"
            >
              {copied ? <CheckIcon /> : <CopyIcon />}
              {copied ? "Copied" : "Copy"}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            They must change it on first sign-in. This is the only time it is
            shown.
          </p>
        </div>

        <DialogFooter>
          <Button
            type="button"
            onClick={() => {
              onOpenChange(false);
              onAction?.();
            }}
          >
            {actionLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
