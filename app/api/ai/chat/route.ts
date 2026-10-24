import { headers } from "next/headers";
import { z } from "zod";
import { queryOne } from "@/lib/db";
import { todayIso } from "@/lib/dates";
import { requireUser } from "@/lib/guards";
import { apiErrorJson } from "@/lib/services/http";
import { parseBody } from "@/lib/validation";
import {
  AI_FALLBACK_MESSAGE,
  AiError,
  aiModel,
  chatCompletion,
  hasAiKey,
  writeAiLog,
  type AiMessage,
} from "@/lib/ai/client";
import {
  AI_TOOLS,
  SALARY_REFUSAL,
  dispatchTool,
  refuseIfSalaryProbe,
  type ToolTrace,
} from "@/lib/services/ai-tools";

/**
 * POST /api/ai/chat — non-streaming assistant with tool calling.
 * Max 4 tool rounds, 20 requests/user/hour, every call journaled in ai_logs.
 */

const MAX_MESSAGES = 12;
const MAX_CHARS = 2000;
const MAX_TOOL_ROUNDS = 4;
const RATE_LIMIT = 20;
const WINDOW_MS = 60 * 60 * 1000;

const chatSchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z
          .string()
          .trim()
          .min(1, "Message cannot be empty")
          .max(MAX_CHARS, `Messages must be at most ${MAX_CHARS} characters`),
      })
    )
    .min(1, "At least one message is required")
    .max(MAX_MESSAGES, `At most ${MAX_MESSAGES} messages are allowed`),
});

type ChatMessage = z.infer<typeof chatSchema>["messages"][number];

function systemPrompt(role: string, companyName: string): string {
  return [
    `You are HCM Lite's HR assistant for ${companyName || "the company"}. Today is ${todayIso()}.`,
    `The caller's role is ${role}. Be concise (2-4 sentences) and use the tools for any numbers — never invent data.`,
    "If a tool returns an error or no data, say so plainly and suggest what to check.",
    "Compensation is private: never reveal another employee's salary, payslip or net pay.",
    "Do not produce SQL, code or long tables. Prefer short bullet lists when listing people.",
  ].join("\n");
}

function rateLimitFor(userId: number): { limited: boolean; retryAfterSeconds: number } {
  const now = Date.now();
  const cutoff = new Date(now - WINDOW_MS).toISOString();
  const used = Number(
    queryOne<{ c: number }>(
      "SELECT COUNT(*) AS c FROM ai_logs WHERE user_id = ? AND created_at >= ?",
      userId,
      cutoff
    )?.c ?? 0
  );
  if (used < RATE_LIMIT) return { limited: false, retryAfterSeconds: 0 };

  const oldest = queryOne<{ created_at: string }>(
    `SELECT created_at FROM ai_logs WHERE user_id = ? AND created_at >= ?
      ORDER BY created_at ASC LIMIT 1`,
    userId,
    cutoff
  );
  const elapsed = oldest ? now - Date.parse(oldest.created_at) : 0;
  const retryAfterSeconds = Math.max(1, Math.ceil((WINDOW_MS - elapsed) / 1000));
  return { limited: true, retryAfterSeconds };
}

export async function POST(request: Request) {
  await headers();
  try {
    const user = await requireUser();
    const parsed = await parseBody(request, chatSchema);
    if (!parsed.ok) return parsed.response;

    const messages: ChatMessage[] = parsed.data.messages;
    const lastUser = [...messages].reverse().find((message) => message.role === "user");
    if (!lastUser) {
      return Response.json({ error: "invalid_body", field: "messages" }, { status: 400 });
    }

    const limit = rateLimitFor(user.id);
    if (limit.limited) {
      return Response.json(
        { error: "rate_limited", retryAfterSeconds: limit.retryAfterSeconds },
        { status: 429 }
      );
    }

    const started = Date.now();
    const traces: ToolTrace[] = [];
    let answer = "";
    let fallback = false;
    let ok = true;
    let detail: string | null = null;
    let model = aiModel();

    const refusal = refuseIfSalaryProbe(lastUser.content, user);
    if (refusal) {
      // Salary probe: refuse before touching the model or any tool.
      answer = refusal || SALARY_REFUSAL;
    } else if (!hasAiKey()) {
      answer = AI_FALLBACK_MESSAGE;
      fallback = true;
      ok = false;
      detail = "no_key: OPENAI_API_KEY is not set";
    } else {
      const conversation: AiMessage[] = [
        { role: "system", content: systemPrompt(user.role, user.companyName) },
        ...messages.map((message) => ({ role: message.role, content: message.content }) as AiMessage),
      ];

      try {
        for (let round = 0; round < MAX_TOOL_ROUNDS; round += 1) {
          const completion = await chatCompletion({ messages: conversation, tools: AI_TOOLS });
          model = completion.model;

          if (completion.toolCalls.length === 0) {
            answer = completion.content?.trim() || "I don't have an answer for that yet.";
            break;
          }

          conversation.push({
            role: "assistant",
            content: completion.content,
            tool_calls: completion.toolCalls,
          });

          for (const call of completion.toolCalls) {
            const run = await dispatchTool(call.function.name, call.function.arguments, user);
            traces.push({ name: run.name, ms: run.ms });
            conversation.push({
              role: "tool",
              tool_call_id: call.id,
              content: run.content,
            });
          }
        }

        if (!answer) {
          answer =
            "I couldn't finish that request. Please ask a narrower question, for example about headcount, attendance or leave.";
        }
      } catch (err) {
        const aiError =
          err instanceof AiError
            ? err
            : new AiError("upstream", err instanceof Error ? err.message : "unknown");
        answer = AI_FALLBACK_MESSAGE;
        fallback = true;
        ok = false;
        detail = `${aiError.kind}: ${aiError.detail}`;
        if (aiError.kind !== "no_key") {
          console.error("[ai/chat] model call failed:", aiError.kind, aiError.detail);
        }
      }
    }

    writeAiLog({
      userId: user.id,
      role: user.role,
      prompt: lastUser.content,
      toolCalls: traces,
      answer,
      model,
      latencyMs: Date.now() - started,
      ok,
      detail,
    });

    return Response.json({
      answer,
      toolCalls: traces,
      aiGenerated: true,
      ...(fallback ? { fallback: true } : {}),
    });
  } catch (err) {
    return apiErrorJson(err);
  }
}
