import { headers } from "next/headers";
import { z } from "zod";
import { isIsoDate, todayIso, workingDaysBetween } from "@/lib/dates";
import { requireUser } from "@/lib/guards";
import { apiErrorJson } from "@/lib/services/http";
import { getSettings, listHolidays, listLeaveTypes } from "@/lib/services/org";
import { parseBody } from "@/lib/validation";
import { AiError, chatCompletion, hasAiKey, type AiToolDefinition } from "@/lib/ai/client";

/**
 * POST /api/ai/smart-leave — turn "Sick leave 5-6 March, flu" into a prefilled
 * `/my-leave` dialog payload. Read-only: this route never creates a request.
 */

const smartLeaveSchema = z.object({
  text: z
    .string()
    .trim()
    .min(3, "Describe your leave in a sentence")
    .max(1000, "Keep the description under 1000 characters"),
});

type ParsedLeave = {
  leaveTypeId: number;
  leaveTypeName: string;
  startDate: string;
  endDate: string;
  days: number;
  reason: string;
};

type RawSuggestion = {
  leaveTypeId?: unknown;
  startDate?: unknown;
  endDate?: unknown;
  reason?: unknown;
};

const MONTHS: Record<string, number> = {
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  oct: 10,
  nov: 11,
  dec: 12,
};

function pad2(value: number): string {
  return value < 10 ? `0${value}` : String(value);
}

function toIso(year: number, month: number, day: number): string | null {
  const iso = `${year}-${pad2(month)}-${pad2(day)}`;
  return isIsoDate(iso) ? iso : null;
}

/** Best-effort offline parsing used when the model is unavailable. */
function heuristicDates(text: string): { startDate: string; endDate: string } | null {
  const lower = text.toLowerCase();
  const today = todayIso();
  const year = Number(today.slice(0, 4));

  const iso = Array.from(text.matchAll(/\b(\d{4})-(\d{2})-(\d{2})\b/g)).map(
    (match) => `${match[1]}-${match[2]}-${match[3]}`
  );
  if (iso.length > 0) {
    const valid = iso.filter(isIsoDate).sort();
    return { startDate: valid[0], endDate: valid[valid.length - 1] };
  }

  const found: Array<{ date: string; index: number }> = [];
  const dayFirst = /\b(\d{1,2})(?:st|nd|rd|th)?\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?(?:\s+(\d{4}))?/gi;
  for (const match of text.matchAll(dayFirst)) {
    const date = toIso(Number(match[3] ?? year), MONTHS[match[2].toLowerCase()], Number(match[1]));
    if (date) found.push({ date, index: match.index ?? 0 });
  }
  const monthFirst = /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:\s+(\d{4}))?/gi;
  for (const match of text.matchAll(monthFirst)) {
    const date = toIso(Number(match[3] ?? year), MONTHS[match[1].toLowerCase()], Number(match[2]));
    if (date) found.push({ date, index: match.index ?? 0 });
  }
  if (found.length > 0) {
    found.sort((a, b) => a.index - b.index);
    const dates = found.map((entry) => entry.date).sort();
    return { startDate: dates[0], endDate: dates[dates.length - 1] };
  }

  const todayMatch = /\btoday\b/.test(lower);
  const tomorrowMatch = /\btomorrow\b/.test(lower);
  if (todayMatch || tomorrowMatch) {
    const base = new Date();
    if (tomorrowMatch) base.setDate(base.getDate() + 1);
    const date = toIso(base.getFullYear(), base.getMonth() + 1, base.getDate());
    if (date) return { startDate: date, endDate: date };
  }
  return null;
}

function guessLeaveTypeId(text: string, types: Array<{ id: number; name: string }>): number {
  const lower = text.toLowerCase();
  for (const type of types) {
    if (type.name && lower.includes(type.name.toLowerCase())) return type.id;
  }
  const keywords: Array<[RegExp, string]> = [
    [/\b(sick|flu|fever|doctor|medical|hospital|unwell|migraine)\b/, "sick"],
    [/\b(casual|personal|family|errand)\b/, "casual"],
    [/\b(vacation|annual|holiday|trip|travel|wedding)\b/, "annual"],
    [/\b(unpaid|no pay|lwop|without pay)\b/, "unpaid"],
  ];
  for (const [pattern, name] of keywords) {
    if (!pattern.test(lower)) continue;
    const match = types.find((type) => type.name.toLowerCase().includes(name));
    if (match) return match.id;
  }
  return types[0]?.id ?? 0;
}

function suggestionTool(types: Array<{ id: number; name: string }>): AiToolDefinition {
  return {
    type: "function",
    function: {
      name: "submit_leave_suggestion",
      description: "Return the structured leave the user described. Never submit a request.",
      parameters: {
        type: "object",
        properties: {
          leaveTypeId: {
            type: "number",
            description: "One of the provided leave type ids.",
            enum: types.map((type) => type.id),
          },
          startDate: { type: "string", description: "First leave date YYYY-MM-DD." },
          endDate: { type: "string", description: "Last leave date YYYY-MM-DD." },
          reason: { type: "string", description: "Short reason in the user's words." },
        },
        required: ["leaveTypeId", "startDate", "endDate", "reason"],
        additionalProperties: false,
      },
    },
  };
}

function buildParsed(
  raw: RawSuggestion,
  types: Array<{ id: number; name: string }>,
  text: string
): ParsedLeave | { error: string } {
  const leaveTypeId = Number(raw.leaveTypeId);
  const type = types.find((entry) => entry.id === leaveTypeId);
  if (!type) return { error: "leaveType" };

  const startDate = String(raw.startDate ?? "").slice(0, 10);
  const endDate = String(raw.endDate ?? startDate).slice(0, 10);
  if (!isIsoDate(startDate) || !isIsoDate(endDate)) return { error: "dates" };
  if (endDate < startDate) return { error: "order" };

  const settings = getSettings();
  const holidays = listHolidays().map((holiday) => holiday.date);
  const days = workingDaysBetween(startDate, endDate, settings.weekendDays, holidays);
  if (days === 0) return { error: "no_working_days" };

  const reason = String(raw.reason ?? text).trim().slice(0, 500) || text.slice(0, 500);
  return {
    leaveTypeId: type.id,
    leaveTypeName: type.name,
    startDate,
    endDate,
    days,
    reason,
  };
}

function parseJsonContent(content: string | null): RawSuggestion | null {
  if (!content) return null;
  const match = content.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]) as RawSuggestion;
  } catch {
    return null;
  }
}

async function askModel(
  text: string,
  types: Array<{ id: number; name: string }>
): Promise<RawSuggestion | null> {
  if (!hasAiKey()) return null;
  const completion = await chatCompletion({
    messages: [
      {
        role: "system",
        content: [
          "You extract leave requests for an HR app.",
          `Today is ${todayIso()}. Leave types: ${types.map((type) => `${type.id}=${type.name}`).join(", ")}.`,
          "Pick the closest existing leave type id. Resolve relative dates against today.",
          "Call submit_leave_suggestion exactly once.",
        ].join("\n"),
      },
      { role: "user", content: text },
    ],
    tools: [suggestionTool(types)],
  });

  const call = completion.toolCalls.find(
    (entry) => entry.function.name === "submit_leave_suggestion"
  );
  if (call) {
    try {
      return JSON.parse(call.function.arguments) as RawSuggestion;
    } catch {
      return null;
    }
  }
  return parseJsonContent(completion.content);
}

export async function POST(request: Request) {
  await headers();
  try {
    await requireUser();
    const parsed = await parseBody(request, smartLeaveSchema);
    if (!parsed.ok) return parsed.response;

    const text = parsed.data.text;
    const types = listLeaveTypes();
    if (types.length === 0) {
      return Response.json({ ok: false, message: "No leave types are configured yet." });
    }

    let raw: RawSuggestion | null = null;
    let modelError = "";
    try {
      raw = await askModel(text, types);
    } catch (err) {
      modelError = err instanceof AiError ? err.kind : "upstream";
    }

    if (raw) {
      const built = buildParsed(raw, types, text);
      if (!("error" in built)) {
        return Response.json({ ok: true, parsed: built });
      }
    }

    // Offline / malformed-model fallback: deterministic parsing of the text.
    const dates = heuristicDates(text);
    if (dates) {
      const built = buildParsed(
        {
          leaveTypeId: guessLeaveTypeId(text, types),
          startDate: dates.startDate,
          endDate: dates.endDate,
          reason: text,
        },
        types,
        text
      );
      if (!("error" in built)) {
        return Response.json({ ok: true, parsed: built });
      }
      if (built.error === "no_working_days") {
        return Response.json({
          ok: false,
          message: "That range contains no working days (weekends or holidays).",
        });
      }
    }

    return Response.json({
      ok: false,
      message: modelError
        ? "I couldn't reach the AI service. Try naming the dates like “Sick leave from 2026-03-05 to 2026-03-06”."
        : "I couldn't find the dates. Try “Casual leave from 2026-03-05 to 2026-03-06 for a family event”.",
    });
  } catch (err) {
    return apiErrorJson(err);
  }
}
