import { headers } from "next/headers";
import { queryAll } from "@/lib/db";
import { requireRole } from "@/lib/guards";
import { apiErrorJson } from "@/lib/services/http";
import { ensureAiLogColumns } from "@/lib/ai/client";

/** GET /api/ai/logs — Admin-only view of the latest 50 assistant calls. */

type AiLogRow = {
  id: number;
  user_id: number;
  user_name: string | null;
  role: string | null;
  prompt: string;
  tool_calls: string | null;
  tools_json: string | null;
  answer: string | null;
  model: string | null;
  latency_ms: number | null;
  ok: number | null;
  created_at: string;
};

function parseToolCalls(raw: string | null): Array<{ name: string; ms: number }> {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((entry) => {
      if (!entry || typeof entry !== "object") return [];
      const record = entry as { name?: unknown; ms?: unknown };
      if (typeof record.name !== "string") return [];
      return [{ name: record.name, ms: Number(record.ms) || 0 }];
    });
  } catch {
    return [];
  }
}

export async function GET() {
  await headers();
  try {
    await requireRole("admin");
    ensureAiLogColumns();
    const rows = queryAll<AiLogRow>(
      `SELECT l.id, l.user_id, u.name AS user_name, l.role, l.prompt,
              l.tool_calls, l.tools_json, l.answer, l.model, l.latency_ms, l.ok, l.created_at
         FROM ai_logs l
         LEFT JOIN users u ON u.id = l.user_id
        ORDER BY l.id DESC
        LIMIT 50`
    );

    return Response.json({
      items: rows.map((row) => ({
        id: Number(row.id),
        userId: Number(row.user_id),
        userName: row.user_name ?? null,
        role: row.role ?? null,
        prompt: row.prompt,
        toolCalls: parseToolCalls(row.tool_calls ?? row.tools_json),
        answer: row.answer ?? null,
        model: row.model ?? null,
        latencyMs: row.latency_ms === null ? null : Number(row.latency_ms),
        ok: row.ok === null ? null : Number(row.ok) === 1,
        createdAt: row.created_at,
      })),
    });
  } catch (err) {
    return apiErrorJson(err);
  }
}
