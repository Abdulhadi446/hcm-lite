import "server-only";
import type { SessionUser } from "@/lib/auth";
import { nowIso, queryAll, queryOne, run } from "@/lib/db";
import { ApiError } from "@/lib/guards";
import { logAudit } from "./audit";
import { notFound } from "./http";

// ---------------------------------------------------------------- types

export type Announcement = {
  id: number;
  title: string;
  body: string;
  pinned: boolean;
  createdBy: number;
  authorName: string;
  authorRole: string;
  createdAt: string;
};

export type NotificationType =
  | "leave_approved"
  | "leave_rejected"
  | "payslip_ready"
  | "announcement"
  | "correction_approved"
  | "correction_rejected";

export type AppNotification = {
  id: number;
  type: string | null;
  title: string;
  body: string;
  link: string | null;
  readAt: string | null;
  createdAt: string;
};

type AnnouncementRow = {
  id: number;
  title: string;
  body: string;
  pinned: number;
  created_by: number;
  author_name: string;
  author_role: string;
  created_at: string;
};

type NotificationRow = {
  id: number;
  type: string | null;
  title: string;
  body: string;
  link: string | null;
  read_at: string | null;
  created_at: string;
};

const ANNOUNCEMENT_SELECT = `SELECT a.id, a.title, a.body, a.pinned, a.created_by, a.created_at,
         u.name AS author_name, u.role AS author_role
    FROM announcements a
    JOIN users u ON u.id = a.created_by`;

const NOTIFICATION_SELECT = `SELECT id, type, title, body, link, read_at, created_at
    FROM notifications`;

function mapAnnouncement(row: AnnouncementRow): Announcement {
  return {
    id: Number(row.id),
    title: row.title,
    body: row.body,
    pinned: Number(row.pinned) === 1,
    createdBy: Number(row.created_by),
    authorName: row.author_name,
    authorRole: row.author_role,
    createdAt: row.created_at,
  };
}

function mapNotification(row: NotificationRow): AppNotification {
  return {
    id: Number(row.id),
    type: row.type,
    title: row.title,
    body: row.body,
    link: row.link,
    readAt: row.read_at,
    createdAt: row.created_at,
  };
}

// ---------------------------------------------------------- announcements

/** Pinned first, then newest. `limit` is clamped to 1..100 (default 50). */
export function listAnnouncements(limit = 50): Announcement[] {
  const capped = Math.min(100, Math.max(1, Math.trunc(limit) || 50));
  return queryAll<AnnouncementRow>(
    `${ANNOUNCEMENT_SELECT}
      ORDER BY a.pinned DESC, a.created_at DESC, a.id DESC
      LIMIT ?`,
    capped
  ).map(mapAnnouncement);
}

function announcementById(id: number): AnnouncementRow {
  const row = queryOne<AnnouncementRow>(`${ANNOUNCEMENT_SELECT} WHERE a.id = ?`, id);
  if (!row) throw notFound();
  return row;
}

/** Only the author or an Admin may change an announcement. */
function assertCanModify(row: AnnouncementRow, actor: Pick<SessionUser, "id" | "role">): void {
  if (actor.role !== "admin" && Number(row.created_by) !== actor.id) {
    throw new ApiError(403, "Forbidden");
  }
}

export function createAnnouncement(
  input: { title: string; body: string; pinned?: boolean },
  actor: Pick<SessionUser, "id" | "name" | "role">
): Announcement {
  const createdAt = nowIso();
  const result = run(
    "INSERT INTO announcements (title, body, pinned, created_by, created_at) VALUES (?, ?, ?, ?, ?)",
    input.title,
    input.body,
    input.pinned ? 1 : 0,
    actor.id,
    createdAt
  );
  const id = Number(result.lastInsertRowid);
  const announcement = mapAnnouncement(announcementById(id));

  logAudit({
    actorId: actor.id,
    action: "create",
    entity: "announcement",
    entityId: id,
    after: announcement,
  });

  // In-app notification for everyone else who can log in.
  const recipients = queryAll<{ id: number }>(
    "SELECT id FROM users WHERE active = 1 AND id <> ?",
    actor.id
  );
  for (const recipient of recipients) {
    createNotification({
      userId: Number(recipient.id),
      type: "announcement",
      title: announcement.title,
      body: excerpt(announcement.body),
      link: "/announcements",
    });
  }

  return announcement;
}

export function updateAnnouncement(
  id: number,
  patch: { title?: string; body?: string; pinned?: boolean },
  actor: Pick<SessionUser, "id" | "role">
): Announcement {
  const beforeRow = announcementById(id);
  assertCanModify(beforeRow, actor);
  const before = mapAnnouncement(beforeRow);

  run(
    "UPDATE announcements SET title = ?, body = ?, pinned = ? WHERE id = ?",
    patch.title ?? before.title,
    patch.body ?? before.body,
    patch.pinned === undefined ? (before.pinned ? 1 : 0) : patch.pinned ? 1 : 0,
    id
  );

  const after = mapAnnouncement(announcementById(id));
  logAudit({
    actorId: actor.id,
    action: "update",
    entity: "announcement",
    entityId: id,
    before,
    after,
  });
  return after;
}

export function deleteAnnouncement(
  id: number,
  actor: Pick<SessionUser, "id" | "role">
): void {
  const beforeRow = announcementById(id);
  assertCanModify(beforeRow, actor);
  const before = mapAnnouncement(beforeRow);

  run("DELETE FROM announcements WHERE id = ?", id);
  logAudit({
    actorId: actor.id,
    action: "delete",
    entity: "announcement",
    entityId: id,
    before,
  });
}

// ----------------------------------------------------------- notifications

export function listNotifications(userId: number, limit = 50): {
  items: AppNotification[];
  unread: number;
} {
  const capped = Math.min(100, Math.max(1, Math.trunc(limit) || 50));
  const items = queryAll<NotificationRow>(
    `${NOTIFICATION_SELECT}
      WHERE user_id = ?
      ORDER BY created_at DESC, id DESC
      LIMIT ?`,
    userId,
    capped
  ).map(mapNotification);
  return { items, unread: unreadNotificationCount(userId) };
}

export function unreadNotificationCount(userId: number): number {
  return Number(
    queryOne<{ c: number }>(
      "SELECT COUNT(*) AS c FROM notifications WHERE user_id = ? AND read_at IS NULL",
      userId
    )?.c ?? 0
  );
}

export function markNotificationRead(id: number, userId: number): AppNotification {
  const row = queryOne<NotificationRow>(
    `${NOTIFICATION_SELECT} WHERE id = ? AND user_id = ?`,
    id,
    userId
  );
  if (!row) throw notFound();
  if (!row.read_at) {
    run(
      "UPDATE notifications SET read_at = ? WHERE id = ? AND user_id = ? AND read_at IS NULL",
      nowIso(),
      id,
      userId
    );
  }
  const updated = queryOne<NotificationRow>(
    `${NOTIFICATION_SELECT} WHERE id = ? AND user_id = ?`,
    id,
    userId
  );
  return mapNotification(updated ?? row);
}

export function markAllNotificationsRead(userId: number): number {
  const result = run(
    "UPDATE notifications SET read_at = ? WHERE user_id = ? AND read_at IS NULL",
    nowIso(),
    userId
  );
  return Number(result.changes ?? 0);
}

/**
 * Create one in-app notification. Exported for leave, payroll, attendance and
 * other modules; deliberately does not write an audit row.
 */
export function createNotification(input: {
  userId: number;
  type?: NotificationType | string | null;
  title: string;
  body: string;
  link?: string | null;
}): AppNotification {
  const createdAt = nowIso();
  const result = run(
    "INSERT INTO notifications (user_id, type, title, body, link, read_at, created_at) VALUES (?, ?, ?, ?, ?, NULL, ?)",
    input.userId,
    input.type ?? null,
    input.title,
    input.body,
    input.link ?? null,
    createdAt
  );
  return {
    id: Number(result.lastInsertRowid),
    type: input.type ?? null,
    title: input.title,
    body: input.body,
    link: input.link ?? null,
    readAt: null,
    createdAt,
  };
}

function excerpt(value: string, max = 160): string {
  const clean = value.replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}
