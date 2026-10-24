"use client";

import { useEffect, useState } from "react";
import {
  CheckIcon,
  CopyIcon,
  KeyRoundIcon,
  TriangleAlertIcon,
  UserCheckIcon,
  UserXIcon,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { EmptyState } from "@/components/page-header";
import { cn } from "@/lib/utils";
import { api, readableError } from "./api";
import {
  AddButton,
  ErrorPanel,
  Field,
  FormDialog,
  SectionHeader,
  TableSkeleton,
} from "./org-ui";
import type { Role, UserRow } from "./types";
import { useList } from "./use-resource";

const ROLE_BADGE: Record<Role, { label: string; className: string }> = {
  admin: { label: "Admin", className: "border-primary/20 bg-primary/10 text-primary" },
  hr: { label: "HR", className: "border-border bg-secondary text-secondary-foreground" },
  employee: { label: "Employee", className: "border-border text-muted-foreground" },
};

type Credential = {
  title: string;
  name: string;
  email: string;
  password: string;
};

export function LoginsTab({ viewerId }: { viewerId: number }) {
  const { data, loading, error, reload } = useList<UserRow>("/api/users");
  const [createOpen, setCreateOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [credential, setCredential] = useState<Credential | null>(null);

  const items = data ?? [];

  const handleCreate = async (values: { name: string; email: string; password: string }) => {
    setPending(true);
    setFormError(null);
    try {
      const res = await api<{ user: UserRow; temporaryPassword: string }>("/api/users", {
        method: "POST",
        body: {
          name: values.name,
          email: values.email,
          role: "hr",
          password: values.password || undefined,
        },
      });
      toast.success("HR login created");
      setCreateOpen(false);
      setCredential({
        title: "HR login created",
        name: values.name,
        email: values.email,
        password: res.temporaryPassword,
      });
      reload();
    } catch (err) {
      const message = readableError(err);
      setFormError(message);
      toast.error(message);
    } finally {
      setPending(false);
    }
  };

  const toggleActive = async (user: UserRow) => {
    setBusyId(user.id);
    try {
      await api(`/api/users/${user.id}`, { method: "PATCH", body: { active: !user.active } });
      toast.success(
        user.active ? `Login deactivated for ${user.name}` : `Login reactivated for ${user.name}`,
      );
      reload();
    } catch (err) {
      toast.error(readableError(err));
    } finally {
      setBusyId(null);
    }
  };

  const resetPassword = async (user: UserRow) => {
    setBusyId(user.id);
    try {
      const res = await api<{ temporaryPassword: string }>(
        `/api/users/${user.id}/reset-password`,
        { method: "POST" },
      );
      toast.success("Temporary password created");
      setCredential({
        title: "Password reset",
        name: user.name,
        email: user.email,
        password: res.temporaryPassword,
      });
      reload();
    } catch (err) {
      toast.error(readableError(err));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-4">
      <SectionHeader
        title="Logins"
        description="Accounts that can sign in. Temporary passwords must be changed at first sign-in."
        count={data ? items.length : undefined}
        action={
          <AddButton
            onClick={() => {
              setFormError(null);
              setCreateOpen(true);
            }}
          >
            Add HR login
          </AddButton>
        }
      />

      {loading && !data ? (
        <TableSkeleton columns={5} />
      ) : error ? (
        <ErrorPanel
          title="Couldn't load logins"
          message={error}
          onRetry={reload}
        />
      ) : items.length === 0 ? (
        <EmptyState
          title="No logins yet"
          description="Add an HR login so your team can start registering employees."
          action={<AddButton onClick={() => setCreateOpen(true)}>Add HR login</AddButton>}
        />
      ) : (
        <div className="overflow-hidden rounded-lg border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead className="h-9 pl-4 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  Name
                </TableHead>
                <TableHead className="hidden h-9 text-[11px] font-medium uppercase tracking-wide text-muted-foreground md:table-cell">
                  Email
                </TableHead>
                <TableHead className="h-9 text-[11px] font-medium uppercase tracking-wide text-muted-foreground max-sm:hidden">
                  Role
                </TableHead>
                <TableHead className="h-9 text-[11px] font-medium uppercase tracking-wide text-muted-foreground max-sm:hidden">
                  Status
                </TableHead>
                <TableHead className="hidden h-9 text-[11px] font-medium uppercase tracking-wide text-muted-foreground md:table-cell">
                  Password
                </TableHead>
                <TableHead className="h-9 w-[4.5rem] pr-2 text-right md:w-24 md:pr-4">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((user) => {
                const isSelf = user.id === viewerId;
                const busy = busyId === user.id;
                const roleBadge = ROLE_BADGE[user.role] ?? ROLE_BADGE.employee;

                return (
                  <TableRow key={user.id}>
                    <TableCell className="py-2.5 pl-4">
                      <div className="max-w-[11rem]">
                        <div className="flex items-center gap-1.5">
                          <span className="truncate font-medium">{user.name}</span>
                          {isSelf ? (
                            <Badge
                              variant="outline"
                              className="h-4 shrink-0 px-1.5 text-[10px] text-muted-foreground"
                            >
                              You
                            </Badge>
                          ) : null}
                        </div>
                        <p className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted-foreground sm:hidden">
                          <span
                            className={cn(
                              "size-1.5 rounded-full",
                              user.active ? "bg-emerald-500" : "bg-muted-foreground/40",
                            )}
                          />
                          {user.active ? "Active" : "Inactive"} · {roleBadge.label}
                        </p>
                      </div>
                    </TableCell>
                    <TableCell className="hidden py-2.5 text-xs text-muted-foreground md:table-cell">
                      {user.email}
                    </TableCell>
                    <TableCell className="py-2.5 max-sm:hidden">
                      <Badge variant="outline" className={cn("text-[11px]", roleBadge.className)}>
                        {roleBadge.label}
                      </Badge>
                    </TableCell>
                    <TableCell className="py-2.5 max-sm:hidden">
                      <span
                        className={cn(
                          "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px]",
                          user.active
                            ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                            : "border-border text-muted-foreground",
                        )}
                      >
                        <span
                          className={cn(
                            "size-1.5 rounded-full",
                            user.active ? "bg-emerald-500" : "bg-muted-foreground/40",
                          )}
                        />
                        {user.active ? "Active" : "Inactive"}
                      </span>
                    </TableCell>
                    <TableCell className="hidden py-2.5 md:table-cell">
                      {user.mustChangePassword ? (
                        <span className="text-[11px] text-amber-700">Must change</span>
                      ) : (
                        <span className="text-[11px] text-muted-foreground">Set</span>
                      )}
                    </TableCell>
                    <TableCell className="py-2.5 pr-2 text-right md:pr-4">
                      <div className="flex items-center justify-end gap-0.5">
                        <IconAction
                          label={`Reset password for ${user.name}`}
                          disabledReason={
                            isSelf ? "Use Change password from the account menu instead." : undefined
                          }
                          disabled={busy}
                          onClick={() => resetPassword(user)}
                        >
                          <KeyRoundIcon className="size-3.5" />
                        </IconAction>
                        <IconAction
                          label={
                            user.active
                              ? `Deactivate login for ${user.name}`
                              : `Reactivate login for ${user.name}`
                          }
                          disabledReason={
                            isSelf ? "You can't deactivate your own account." : undefined
                          }
                          disabled={busy}
                          destructive={user.active}
                          onClick={() => toggleActive(user)}
                        >
                          {user.active ? (
                            <UserXIcon className="size-3.5" />
                          ) : (
                            <UserCheckIcon className="size-3.5" />
                          )}
                        </IconAction>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <AddLoginDialog
        open={createOpen}
        onOpenChange={(open) => {
          setCreateOpen(open);
          if (!open) setFormError(null);
        }}
        pending={pending}
        error={formError}
        onSubmit={handleCreate}
      />

      <CredentialDialog
        credential={credential}
        onClose={() => setCredential(null)}
      />
    </div>
  );
}

function IconAction({
  label,
  disabledReason,
  disabled,
  onClick,
  destructive,
  children,
}: {
  label: string;
  disabledReason?: string;
  disabled?: boolean;
  onClick: () => void;
  destructive?: boolean;
  children: React.ReactNode;
}) {
  const blocked = !!disabledReason;
  const button = (
    <Button
      variant="ghost"
      size="icon-sm"
      disabled={blocked || disabled}
      aria-label={label}
      onClick={onClick}
      className={cn(
        "text-muted-foreground",
        destructive ? "hover:text-destructive" : "hover:text-foreground",
      )}
    >
      {children}
    </Button>
  );

  if (!blocked) return button;

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <span className="inline-flex" tabIndex={0} aria-label={`${label} — unavailable`} />
        }
      >
        {button}
      </TooltipTrigger>
      <TooltipContent>{disabledReason}</TooltipContent>
    </Tooltip>
  );
}

function AddLoginDialog({
  open,
  onOpenChange,
  pending,
  error,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pending: boolean;
  error: string | null;
  onSubmit: (values: { name: string; email: string; password: string }) => void;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open) return;
    setName("");
    setEmail("");
    setPassword("");
    setFieldErrors({});
  }, [open]);

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Add HR login"
      description="HR can register employees and import data, but can't change company settings or manage logins."
      submitLabel="Create login"
      pending={pending}
      error={error}
      onSubmit={() => {
        const next: Record<string, string> = {};
        if (!name.trim()) next.name = "Enter a name.";
        if (!email.trim()) next.email = "Enter an email address.";
        else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
          next.email = "Enter a valid email address.";
        }
        if (password && password.length < 8) next.password = "Use at least 8 characters.";
        if (Object.keys(next).length > 0) {
          setFieldErrors(next);
          return;
        }
        onSubmit({ name: name.trim(), email: email.trim(), password });
      }}
    >
      <Field label="Full name" htmlFor="hrName" error={fieldErrors.name}>
        <Input
          id="hrName"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setFieldErrors((prev) => ({ ...prev, name: "" }));
          }}
          placeholder="Sana Malik"
          disabled={pending}
          aria-invalid={!!fieldErrors.name}
        />
      </Field>

      <Field label="Work email" htmlFor="hrEmail" error={fieldErrors.email}>
        <Input
          id="hrEmail"
          type="email"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            setFieldErrors((prev) => ({ ...prev, email: "" }));
          }}
          placeholder="sana@acme.com"
          disabled={pending}
          aria-invalid={!!fieldErrors.email}
        />
      </Field>

      <Field
        label="Temporary password"
        htmlFor="hrPassword"
        hint="Optional. Leave empty and we'll generate one to show you once."
        error={fieldErrors.password}
      >
        <Input
          id="hrPassword"
          value={password}
          onChange={(e) => {
            setPassword(e.target.value);
            setFieldErrors((prev) => ({ ...prev, password: "" }));
          }}
          placeholder="At least 8 characters"
          disabled={pending}
          autoComplete="new-password"
          aria-invalid={!!fieldErrors.password}
        />
      </Field>
    </FormDialog>
  );
}

function CredentialDialog({
  credential,
  onClose,
}: {
  credential: Credential | null;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (credential) setCopied(false);
  }, [credential]);

  const copy = async () => {
    if (!credential) return;
    try {
      await navigator.clipboard.writeText(credential.password);
      setCopied(true);
      toast.success("Temporary password copied");
    } catch {
      toast.error("Couldn't copy. Select the password and copy it manually.");
    }
  };

  return (
    <Dialog
      open={!!credential}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      disablePointerDismissal
    >
      <DialogContent showCloseButton={false} className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{credential?.title ?? "Temporary password"}</DialogTitle>
          <DialogDescription className="text-xs">
            This password is shown once. {credential?.name ?? "They"} will be asked to choose a
            new one at first sign-in.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="rounded-lg border border-border bg-muted/30 px-3 py-2">
            <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              Sign in as
            </p>
            <p className="mt-0.5 truncate text-sm font-medium">{credential?.email}</p>
          </div>

          <div>
            <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              Temporary password
            </p>
            <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/40 p-1.5 pl-3">
              <code className="min-w-0 flex-1 select-all font-mono text-sm tracking-wider">
                {credential?.password}
              </code>
              <Button
                variant={copied ? "secondary" : "outline"}
                size="sm"
                className="shrink-0 gap-1.5"
                onClick={copy}
              >
                {copied ? <CheckIcon className="size-3.5" /> : <CopyIcon className="size-3.5" />}
                {copied ? "Copied" : "Copy"}
              </Button>
            </div>
          </div>

          <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-2.5 py-2 text-[11px] leading-relaxed text-amber-800">
            <TriangleAlertIcon className="mt-px size-3.5 shrink-0" />
            <p>Share it over a secure channel. You won&apos;t be able to see it again.</p>
          </div>
        </div>

        <DialogFooter>
          <Button size="sm" onClick={onClose}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
