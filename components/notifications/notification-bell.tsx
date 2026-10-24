"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BellIcon, CheckIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { relativeTime } from "@/lib/relative-time";

type Notification = {
  id: number;
  type: string | null;
  title: string;
  body: string;
  link: string | null;
  readAt: string | null;
  createdAt: string;
};

type NotificationList = { items: Notification[]; unread: number };

export function NotificationBell() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Notification[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(false);
  const [marking, setMarking] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications", { cache: "no-store" });
      if (!res.ok) return;
      const body = (await res.json()) as NotificationList;
      setItems(body.items ?? []);
      setUnread(body.unread ?? 0);
    } catch {
      /* the bell is non-critical; try again on the next open */
    }
  }, []);

  // One poll on mount, then a refresh whenever the sheet is opened.
  useEffect(() => {
    void load();
  }, [load]);

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setLoading(true);
      void load().finally(() => setLoading(false));
    }
  }

  async function markAllRead() {
    if (marking || unread === 0) return;
    setMarking(true);
    const now = new Date().toISOString();
    setItems((current) => current.map((item) => (item.readAt ? item : { ...item, readAt: now })));
    setUnread(0);
    try {
      await fetch("/api/notifications/read-all", { method: "POST" });
    } catch {
      /* keep the optimistic state; the next open re-syncs */
    } finally {
      setMarking(false);
    }
  }

  function openItem(item: Notification) {
    if (!item.readAt) {
      void fetch(`/api/notifications/${item.id}/read`, { method: "POST" }).catch(() => undefined);
      const now = new Date().toISOString();
      setItems((current) =>
        current.map((entry) => (entry.id === item.id ? { ...entry, readAt: now } : entry))
      );
      setUnread((current) => Math.max(0, current - 1));
    }
    setOpen(false);
    if (item.link) router.push(item.link);
  }

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <Button
        variant="ghost"
        size="icon-sm"
        className="relative text-muted-foreground"
        aria-label={unread > 0 ? `Notifications, ${unread} unread` : "Notifications"}
        onClick={() => handleOpenChange(true)}
      >
        <BellIcon className="size-4" />
        {unread > 0 ? (
          <span className="absolute right-1 top-1 size-1.5 rounded-full bg-primary ring-2 ring-background" />
        ) : null}
      </Button>

      <SheetContent side="right" className="w-full bg-card p-0 sm:max-w-sm">
        <SheetHeader className="border-b border-border">
          <SheetTitle className="flex items-center justify-between gap-2">
            <span>Notifications</span>
            {unread > 0 ? <Badge variant="secondary">{unread} new</Badge> : null}
          </SheetTitle>
          <SheetDescription className="text-xs">
            Leave decisions, payslips and company announcements.
          </SheetDescription>
        </SheetHeader>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {loading && items.length === 0 ? (
            <div className="space-y-3 p-4">
              {[0, 1, 2].map((key) => (
                <div key={key} className="space-y-1.5">
                  <Skeleton className="h-3.5 w-2/3" />
                  <Skeleton className="h-3 w-full" />
                  <Skeleton className="h-2.5 w-16" />
                </div>
              ))}
            </div>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center gap-1 px-4 py-12 text-center">
              <BellIcon className="size-5 text-muted-foreground" />
              <p className="text-sm font-medium">No notifications yet</p>
              <p className="max-w-56 text-xs text-muted-foreground">
                Approvals, payslips and announcements will show up here.
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {items.map((item) => (
                <li key={item.id}>
                  <Link
                    href={item.link ?? "/announcements"}
                    onClick={(event) => {
                      event.preventDefault();
                      openItem(item);
                    }}
                    className="flex gap-2.5 px-4 py-3 transition-colors hover:bg-muted/60"
                  >
                    <span
                      className={
                        item.readAt
                          ? "mt-1.5 size-1.5 shrink-0 rounded-full bg-transparent"
                          : "mt-1.5 size-1.5 shrink-0 rounded-full bg-primary"
                      }
                      aria-hidden="true"
                    />
                    <span className="min-w-0 flex-1 space-y-0.5">
                      <span
                        className={
                          item.readAt
                            ? "block break-words text-sm text-muted-foreground"
                            : "block break-words text-sm font-medium"
                        }
                      >
                        {item.title}
                      </span>
                      <span className="line-clamp-2 block break-words text-xs text-muted-foreground">
                        {item.body}
                      </span>
                      <span className="block text-[11px] text-muted-foreground">
                        {relativeTime(item.createdAt)}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>

        <SheetFooter className="border-t border-border">
          <Button
            variant="outline"
            size="sm"
            className="w-full gap-1.5"
            disabled={unread === 0 || marking}
            onClick={() => void markAllRead()}
          >
            <CheckIcon className="size-3.5" />
            {marking ? "Marking…" : "Mark all read"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
