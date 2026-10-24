export type Role = "admin" | "hr" | "employee";

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

export type AnnouncementList = { items: Announcement[] };

export function roleLabel(role: string): string {
  if (role === "admin") return "Admin";
  if (role === "hr") return "HR";
  return "Employee";
}

export async function readApiError(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: string };
    if (body?.error && /\s/.test(body.error)) return body.error;
    if (body?.error === "Forbidden") return "You don't have permission to do that.";
    if (body?.error === "Unauthorized") return "Your session expired. Sign in again.";
    if (body?.error === "not_found") return "That announcement no longer exists.";
  } catch {
    /* ignore */
  }
  if (res.status === 403) return "You don't have permission to do that.";
  if (res.status === 401) return "Your session expired. Sign in again.";
  return "Something went wrong. Try again.";
}
