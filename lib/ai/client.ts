import "server-only";
import { queryAll, run } from "@/lib/db";

/**
 * Minimal OpenAI-compatible chat client for M7.
 *
 * Plain `fetch` (no SDK) so the same code works against OpenRouter, OpenAI or
 * any compatible gateway. The API key is read from the environment and is
 * never logged, echoed back in errors or persisted.
 */

// ---------------------------------------------------------------- errors

export type AiErrorKind = "no_key" | "timeout" | "upstream";

/** Typed AI failure so routes can branch on the cause without parsing text. */
export class AiError extends Error {
  kind: AiErrorKind;
  detail: string;

  constructor(kind: AiErrorKind, detail: string) {
    super(`ai_${kind}: ${detail}`);
    this.name = "AiError";
    this.kind = kind;
    this.detail = detail;
  }
}

/** Friendly bubble shown to the user for every transport/model failure. */
export const AI_FALLBACK_MESSAGE =
  "I couldn't reach the AI service. Please try again in a moment.";

// --------------------------------------------------------------- payloads

export type AiToolCall = {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
};

export type AiMessage =
  | { role: "system"; content: string }
  | { role: "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: AiToolCall[] }
  | { role: "tool"; tool_call_id: string; content: string };

export type AiToolDefinition = {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
};

export type ChatCompletionResult = {
  content: string | null;
  toolCalls: AiToolCall[];
  model: string;
};

// -------------------------------------------------------------- settings

export function aiBaseUrl(): string {
  return (process.env.OPENAI_BASE_URL || "https://openrouter.ai/api/v1").replace(/\/+$/, "");
}

/** `OPENAI_MODEL` wins, then the contract's `AI_MODEL`, then a free default. */
export function aiModel(): string {
  return (
    process.env.OPENAI_MODEL?.trim() ||
    process.env.AI_MODEL?.trim() ||
    "openrouter/free"
  );
}

/** Accept both names: `OPENAI_API_KEY` (contract) and `OPENROUTER_API_KEY` (what people actually paste). */
function apiKey(): string | undefined {
  return (
    process.env.OPENAI_API_KEY?.trim() ||
    process.env.OPENROUTER_API_KEY?.trim() ||
    undefined
  );
}

export function hasAiKey(): boolean {
  return Boolean(apiKey());
}

// ------------------------------------------------------------------ call

/**
 * POST `${OPENAI_BASE_URL}/chat/completions` with a hard 15 s timeout.
 * Throws `AiError` for every failure mode; never leaks the key.
 */
export async function chatCompletion(input: {
  messages: AiMessage[];
  tools?: AiToolDefinition[];
}): Promise<ChatCompletionResult> {
  const key = apiKey();
  if (!key) throw new AiError("no_key", "OPENAI_API_KEY is not set");

  const model = aiModel();
  const body: Record<string, unknown> = {
    model,
    messages: input.messages,
  };
  if (input.tools && input.tools.length > 0) {
    body.tools = input.tools;
    body.tool_choice = "auto";
  }

  let res: Response;
  try {
    res = await fetch(`${aiBaseUrl()}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${key}`,
        "X-Title": "HCM Lite",
        "HTTP-Referer": process.env.APP_URL || "http://localhost:3000",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
      cache: "no-store",
    });
  } catch (err) {
    if (
      err instanceof Error &&
      (err.name === "TimeoutError" || err.name === "AbortError")
    ) {
      throw new AiError("timeout", "chat completion timed out after 15000ms");
    }
    throw new AiError(
      "upstream",
      err instanceof Error ? `network_error: ${err.message}` : "network_error"
    );
  }

  if (!res.ok) {
    let snippet = "";
    try {
      snippet = (await res.text()).slice(0, 300);
    } catch {
      /* body already consumed */
    }
    throw new AiError("upstream", `http_${res.status}${snippet ? `: ${snippet}` : ""}`);
  }

  let data: unknown;
  try {
    data = await res.json();
  } catch {
    throw new AiError("upstream", "invalid_json_response");
  }

  const choice = (data as { choices?: Array<{ message?: Record<string, unknown> }> })
    ?.choices?.[0];
  const message = choice?.message;
  if (!message) throw new AiError("upstream", "empty_choices");

  const content =
    typeof message.content === "string" && message.content.trim()
      ? message.content
      : null;

  const rawCalls = Array.isArray(message.tool_calls) ? message.tool_calls : [];
  const toolCalls: AiToolCall[] = rawCalls.flatMap((entry, index) => {
    const call = entry as {
      id?: unknown;
      type?: unknown;
      function?: { name?: unknown; arguments?: unknown };
    };
    const name = typeof call.function?.name === "string" ? call.function.name : "";
    if (!name) return [];
    const args =
      typeof call.function?.arguments === "string"
        ? call.function.arguments
        : JSON.stringify(call.function?.arguments ?? {});
    return [
      {
        id: typeof call.id === "string" && call.id ? call.id : `call_${index}`,
        type: "function" as const,
        function: { name, arguments: args },
      },
    ];
  });

  return { content, toolCalls, model };
}

// ------------------------------------------------------------- ai_logs

type AiLogColumn = [name: string, definition: string];

const AI_LOG_COLUMNS: AiLogColumn[] = [
  ["role", "TEXT"],
  ["tool_calls", "TEXT"],
  ["model", "TEXT"],
  ["latency_ms", "INTEGER"],
  ["ok", "INTEGER"],
];

let columnsEnsured = false;

/**
 * Additive migration for databases created before the M7 columns existed.
 * Idempotent and cached for the process lifetime.
 */
export function ensureAiLogColumns(): void {
  if (columnsEnsured) return;
  const existing = new Set(
    queryAll<{ name: string }>("PRAGMA table_info(ai_logs)").map((row) => row.name)
  );
  for (const [name, definition] of AI_LOG_COLUMNS) {
    if (!existing.has(name)) {
      try {
        run(`ALTER TABLE ai_logs ADD COLUMN ${name} ${definition}`);
      } catch {
        // Another process may have added it concurrently; ignore.
      }
    }
  }
  columnsEnsured = true;
}

export type AiLogInput = {
  userId: number;
  role: string;
  prompt: string;
  toolCalls: Array<{ name: string; ms: number }>;
  answer: string;
  model: string;
  latencyMs: number;
  ok: boolean;
  detail?: string | null;
};

/** Insert one `ai_logs` row. Never throws — logging must not break a request. */
export function writeAiLog(input: AiLogInput): void {
  try {
    ensureAiLogColumns();
    const toolCallsJson = JSON.stringify(input.toolCalls ?? []);
    const answer = input.detail
      ? `${input.answer}\n[detail: ${input.detail}]`
      : input.answer;
    run(
      `INSERT INTO ai_logs
         (user_id, role, prompt, tools_json, tool_calls, answer, model, latency_ms, ok, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      input.userId,
      input.role,
      input.prompt.slice(0, 2000),
      toolCallsJson,
      toolCallsJson,
      answer.slice(0, 4000),
      input.model,
      Math.max(0, Math.round(input.latencyMs)),
      input.ok ? 1 : 0,
      new Date().toISOString()
    );
  } catch (err) {
    console.error("[ai] failed to write ai_logs row:", err instanceof Error ? err.message : err);
  }
}
