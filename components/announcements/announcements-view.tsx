"use client";

import { useCallback, useEffect, useState } from "react";
import { MegaphoneIcon, PinIcon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";

import { EmptyState } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { relativeTime } from "@/lib/relative-time";
import {
  readApiError,
  roleLabel,
  type Announcement,
  type AnnouncementList,
  type Role,
} from "./types";

const MAX_TITLE = 200;
const MAX_BODY = 5000;

export function AnnouncementsView({ role, userId }: { role: Role; userId: number }) {
  const canPost = role === "admin" || role === "hr";
  const canDeleteAny = role === "admin";

  const [items, setItems] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [pinned, setPinned] = useState(false);
  const [posting, setPosting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [deleteTarget, setDeleteTarget] = useState<Announcement | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch("/api/announcements", { cache: "no-store" });
      if (!res.ok) throw new Error(await readApiError(res));
      const data = (await res.json()) as AnnouncementList;
      setItems(data.items ?? []);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Could not load announcements");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function handlePost(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (posting) return;
    const trimmedTitle = title.trim();
    const trimmedBody = body.trim();
    if (!trimmedTitle || !trimmedBody) {
      setFormError("Add both a title and a message before posting.");
      return;
    }

    setPosting(true);
    setFormError(null);
    try {
      const res = await fetch("/api/announcements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: trimmedTitle, body: trimmedBody, pinned }),
      });
      if (!res.ok) throw new Error(await readApiError(res));
      setTitle("");
      setBody("");
      setPinned(false);
      toast.success("Announcement posted");
      await load();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not post the announcement";
      setFormError(message);
      toast.error(message);
    } finally {
      setPosting(false);
    }
  }

  async function handleDelete() {
    if (!deleteTarget || deleting) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      const res = await fetch(`/api/announcements/${deleteTarget.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(await readApiError(res));
      toast.success("Announcement deleted");
      setDeleteTarget(null);
      await load();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not delete the announcement";
      setDeleteError(message);
      toast.error(message);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="space-y-6">
      {canPost ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MegaphoneIcon className="size-4" />
              Post an announcement
            </CardTitle>
            <CardDescription className="text-xs">
              Everyone in the company can read this. Pinned posts stay at the top.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form className="space-y-3" onSubmit={handlePost}>
              <div className="space-y-1.5">
                <Label htmlFor="announcement-title" className="text-xs font-medium">
                  Title
                </Label>
                <Input
                  id="announcement-title"
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  maxLength={MAX_TITLE}
                  placeholder="Office closed on Friday"
                  disabled={posting}
                />
              </div>

              <div className="space-y-1.5">
                <div className="flex items-baseline justify-between gap-2">
                  <Label htmlFor="announcement-body" className="text-xs font-medium">
                    Message
                  </Label>
                  <span className="text-[11px] tabular-nums text-muted-foreground">
                    {body.length}/{MAX_BODY}
                  </span>
                </div>
                <Textarea
                  id="announcement-body"
                  value={body}
                  onChange={(event) => setBody(event.target.value)}
                  maxLength={MAX_BODY}
                  rows={4}
                  placeholder="Share the details your team needs."
                  disabled={posting}
                  className="min-h-24"
                />
              </div>

              {formError ? (
                <p
                  role="alert"
                  className="rounded-md border border-destructive/30 bg-destructive/5 px-2.5 py-2 text-xs text-destructive"
                >
                  {formError}
                </p>
              ) : null}

              <div className="flex flex-wrap items-center justify-between gap-3">
                <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
                  <Checkbox
                    checked={pinned}
                    onCheckedChange={(checked) => setPinned(checked === true)}
                    disabled={posting}
                    aria-label="Pin this announcement"
                  />
                  Pin to the top
                </label>
                <Button type="submit" size="sm" disabled={posting} className="gap-1.5">
                  <MegaphoneIcon className="size-3.5" />
                  {posting ? "Posting…" : "Post announcement"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      ) : null}

      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-medium">Company feed</h2>
          {items.length > 0 ? (
            <span className="text-[11px] tabular-nums text-muted-foreground">
              {items.length} {items.length === 1 ? "post" : "posts"}
            </span>
          ) : null}
        </div>

        {loading ? (
          <div className="space-y-3">
            {[0, 1].map((key) => (
              <Card key={key}>
                <CardContent className="space-y-2">
                  <Skeleton className="h-4 w-2/3" />
                  <Skeleton className="h-3 w-full" />
                  <Skeleton className="h-3 w-4/5" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : loadError ? (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-6 text-center">
            <p className="text-sm font-medium text-destructive">Couldn’t load announcements</p>
            <p className="mt-1 text-xs text-muted-foreground">{loadError}</p>
            <Button variant="outline" size="sm" className="mt-3" onClick={() => void load()}>
              Try again
            </Button>
          </div>
        ) : items.length === 0 ? (
          <EmptyState
            title="No announcements yet"
            description={
              canPost
                ? "Post the first update so everyone sees it on the dashboard."
                : "Admins and HR will post company updates here."
            }
          />
        ) : (
          <div className="space-y-3">
            {items.map((item) => {
              const canDelete = canDeleteAny || item.createdBy === userId;
              return (
                <Card key={item.id}>
                  <CardContent className="space-y-2">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          {item.pinned ? (
                            <Badge variant="secondary" className="gap-1">
                              <PinIcon className="size-3" />
                              Pinned
                            </Badge>
                          ) : null}
                          <h3 className="break-words text-sm font-medium">{item.title}</h3>
                        </div>
                        <p className="text-[11px] text-muted-foreground">
                          {item.authorName} · {roleLabel(item.authorRole)} ·{" "}
                          <span title={new Date(item.createdAt).toLocaleString()}>
                            {relativeTime(item.createdAt)}
                          </span>
                        </p>
                      </div>
                      {canDelete ? (
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          className="shrink-0 text-muted-foreground hover:text-destructive"
                          aria-label={`Delete ${item.title}`}
                          onClick={() => {
                            setDeleteError(null);
                            setDeleteTarget(item);
                          }}
                        >
                          <Trash2Icon className="size-3.5" />
                        </Button>
                      ) : null}
                    </div>
                    <p className="whitespace-pre-wrap break-words text-sm text-muted-foreground">
                      {item.body}
                    </p>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      <Dialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open && !deleting) setDeleteTarget(null);
        }}
      >
        <DialogContent showCloseButton={false} className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete announcement?</DialogTitle>
            <DialogDescription className="text-xs">
              “{deleteTarget?.title}” will be removed for everyone. This can’t be undone.
            </DialogDescription>
          </DialogHeader>
          {deleteError ? (
            <p
              role="alert"
              className="rounded-md border border-destructive/30 bg-destructive/5 px-2.5 py-2 text-xs text-destructive"
            >
              {deleteError}
            </p>
          ) : null}
          <DialogFooter>
            <DialogClose render={<Button variant="outline" size="sm" disabled={deleting} />}>
              Cancel
            </DialogClose>
            <Button
              size="sm"
              disabled={deleting}
              onClick={() => void handleDelete()}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? "Deleting…" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
