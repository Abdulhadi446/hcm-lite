"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowUpIcon,
  ClockIcon,
  RotateCcwIcon,
  SparklesIcon,
  XIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/page-header";
import { cn } from "@/lib/utils";
import { AiMark } from "./ai-mark";
import { ChatMessageBubble, TypingIndicator } from "./chat-message";
import { SuggestedPrompts } from "./suggested-prompts";
import {
  MAX_MESSAGES,
  promptsFor,
  scopeLabel,
  type AiRole,
  type ChatMessage,
  type ToolCall,
} from "./types";

const RATE_LIMIT_FALLBACK_SECONDS = 60;
const NETWORK_ERROR =
  "I couldn't reach the assistant just now. Please try again in a moment.";
const FALLBACK_ERROR =
  "That answer didn't come back in one piece. Try asking again, or rephrase the question.";
const SESSION_ERROR = "Your session expired. Refresh the page and sign in again.";

type ChatResponse = {
  answer?: unknown;
  toolCalls?: { name?: unknown; ms?: unknown; args?: unknown }[];
  aiGenerated?: unknown;
  fallback?: unknown;
  error?: unknown;
  retryAfterSeconds?: unknown;
};

function formatCountdown(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function AiChat({ role, userName }: { role: AiRole; userName: string }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const [rateLimitUntil, setRateLimitUntil] = useState<number | null>(null);
  const [rateLimitSeconds, setRateLimitSeconds] = useState(0);

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const sendingRef = useRef(false);
  const idRef = useRef(0);

  const prompts = promptsFor(role);
  const rateLimited = rateLimitUntil !== null;
  const canSend = !pending && !rateLimited && input.trim().length > 0;

  const nextId = () => {
    idRef.current += 1;
    return `msg-${idRef.current}`;
  };

  const resizeTextarea = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 148)}px`;
  }, []);

  // Keep the newest message in view without moving the page itself.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [messages.length, pending]);

  // Tick the rate-limit banner down to zero.
  useEffect(() => {
    if (rateLimitUntil === null) return;

    const tick = () => {
      const left = Math.max(0, Math.ceil((rateLimitUntil - Date.now()) / 1000));
      setRateLimitSeconds(left);
      if (left === 0) setRateLimitUntil(null);
    };

    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [rateLimitUntil]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const append = useCallback((message: ChatMessage) => {
    setMessages((prev) => [...prev, message].slice(-MAX_MESSAGES));
  }, []);

  const send = useCallback(
    async (raw: string) => {
      const text = raw.trim();
      if (!text || pending || sendingRef.current || rateLimitUntil !== null) return;

      sendingRef.current = true;

      const history = [
        ...messages,
        { id: nextId(), role: "user" as const, content: text },
      ].slice(-MAX_MESSAGES);

      setMessages(history);
      setInput("");
      setPending(true);
      if (textareaRef.current) textareaRef.current.style.height = "auto";

      const controller = new AbortController();
      abortRef.current = controller;

      const payload = history
        .filter((message) => !message.error)
        .map((message) => ({ role: message.role, content: message.content }));

      try {
        const res = await fetch("/api/ai/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: payload }),
          signal: controller.signal,
        });

        let body: ChatResponse | null = null;
        try {
          body = (await res.json()) as ChatResponse;
        } catch {
          body = null;
        }

        if (res.status === 401) {
          append({ id: nextId(), role: "assistant", content: SESSION_ERROR, error: true });
          return;
        }

        if (res.status === 429) {
          const retry = Number(body?.retryAfterSeconds);
          const seconds =
            Number.isFinite(retry) && retry > 0 ? retry : RATE_LIMIT_FALLBACK_SECONDS;
          setRateLimitUntil(Date.now() + seconds * 1000);
          return;
        }

        if (!res.ok || !body || typeof body.answer !== "string" || !body.answer.trim()) {
          append({
            id: nextId(),
            role: "assistant",
            content: res.ok ? FALLBACK_ERROR : NETWORK_ERROR,
            error: true,
          });
          return;
        }

        const toolCalls: ToolCall[] = Array.isArray(body.toolCalls)
          ? body.toolCalls
              .filter((call) => typeof call?.name === "string" && call.name.trim())
              .map((call) => ({
                name: String(call.name),
                ms: typeof call.ms === "number" ? call.ms : undefined,
              }))
          : [];

        append({
          id: nextId(),
          role: "assistant",
          content: body.answer,
          toolCalls,
          fallback: body.fallback === true,
        });
      } catch {
        if (controller.signal.aborted) return;
        append({ id: nextId(), role: "assistant", content: NETWORK_ERROR, error: true });
      } finally {
        sendingRef.current = false;
        if (!controller.signal.aborted) setPending(false);
        if (abortRef.current === controller) abortRef.current = null;
        textareaRef.current?.focus();
      }
    },
    [append, messages, pending, rateLimitUntil],
  );

  function handleFormSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!canSend) return;
    void send(input);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      if (!canSend) return;
      void send(input);
    }
  }

  function clearConversation() {
    abortRef.current?.abort();
    abortRef.current = null;
    sendingRef.current = false;
    setPending(false);
    setMessages([]);
    setInput("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";
    textareaRef.current?.focus();
  }

  return (
    <div className="flex h-[calc(100dvh-7rem)] min-h-0 flex-col gap-3 sm:gap-4">
      <PageHeader
        title="AI Assistant"
        description="Ask in plain language — answers are pulled from your live HR, attendance, leave and payroll records."
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={clearConversation}
            disabled={!messages.length && !pending}
          >
            <RotateCcwIcon />
            Clear conversation
          </Button>
        }
      />

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10">
        {/* Assistant identity + scope */}
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border/70 bg-gradient-to-r from-primary/[0.06] via-card to-card px-3 py-2.5 sm:px-4">
          <div className="flex min-w-0 items-center gap-2.5">
            <AiMark />
            <div className="min-w-0 leading-tight">
              <p className="truncate text-sm font-medium">HCM Assistant</p>
              <p className="truncate text-[11px] text-muted-foreground">
                {role === "employee" ? "Your live records" : "Live company data"}
                <span className="hidden sm:inline"> · read-only</span>
              </p>
            </div>
          </div>
          <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-border bg-background/80 px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
            <span className="relative flex size-1.5">
              <span
                aria-hidden
                className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-60"
              />
              <span className="relative inline-flex size-1.5 rounded-full bg-emerald-500" />
            </span>
            {scopeLabel(role)}
          </span>
        </div>

        {/* Messages */}
        <div
          ref={scrollRef}
          role="log"
          aria-live="polite"
          aria-relevant="additions"
          aria-busy={pending}
          aria-label="Conversation with the AI assistant"
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-[radial-gradient(ellipse_at_20%_0%,oklch(0.59_0.135_262/0.06),transparent_55%)] px-3 py-4 sm:px-5"
        >
          {!messages.length && !pending ? (
            <div className="flex h-full min-h-0 flex-col items-center justify-center">
              <SuggestedPrompts
                prompts={prompts}
                onPick={(prompt) => void send(prompt)}
                disabled={pending}
                name={userName.split(" ")[0]}
              />
            </div>
          ) : (
            <div className="mx-auto w-full max-w-3xl space-y-4 sm:space-y-5">
              {messages.map((message) => (
                <ChatMessageBubble key={message.id} message={message} />
              ))}
              {pending ? <TypingIndicator /> : null}
              <div aria-hidden className="h-px" />
            </div>
          )}
        </div>

        {/* Composer */}
        <div className="sticky bottom-0 z-10 shrink-0 border-t border-border/70 bg-card/95 px-3 pt-2.5 pb-2.5 backdrop-blur sm:px-4 sm:pt-3 sm:pb-3">
          {rateLimited ? (
            <div
              role="alert"
              className="mb-2.5 flex items-start gap-2 rounded-lg border border-amber-300/70 bg-amber-50 px-2.5 py-2 text-xs text-amber-900"
            >
              <ClockIcon className="mt-0.5 size-3.5 shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="font-medium">Question limit reached</p>
                <p className="mt-0.5 leading-relaxed">
                  You can ask again in{" "}
                  <span className="font-medium tabular-nums">
                    {formatCountdown(rateLimitSeconds)}
                  </span>
                  . The limit is 20 questions per person per hour.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setRateLimitUntil(null)}
                className="rounded-sm p-0.5 text-amber-900/70 transition-colors hover:text-amber-900 focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:outline-none"
                aria-label="Dismiss limit message"
              >
                <XIcon className="size-3.5" />
              </button>
            </div>
          ) : null}

          <form
            aria-label="Ask the AI assistant"
            onSubmit={handleFormSubmit}
            className={cn(
              "flex items-end gap-2 rounded-xl border border-input bg-background p-1.5 transition-shadow",
              "focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/20",
            )}
          >
            <textarea
              ref={textareaRef}
              rows={1}
              maxLength={2000}
              value={input}
              onChange={(event) => {
                setInput(event.target.value);
                resizeTextarea();
              }}
              onKeyDown={handleKeyDown}
              placeholder="Ask about your people data…"
              aria-label="Message the AI assistant"
              className="max-h-[148px] min-h-9 w-full flex-1 resize-none bg-transparent px-1.5 py-2 text-sm break-words outline-none placeholder:text-muted-foreground/80"
            />
            <Button
              type="submit"
              size="icon"
              disabled={!canSend}
              aria-label="Send message"
              className="mb-px shrink-0"
            >
              <ArrowUpIcon />
            </Button>
          </form>

          <div className="mt-1.5 flex items-center justify-between gap-3 px-0.5">
            <p className="text-[11px] text-muted-foreground">
              <span className="hidden sm:inline">Enter to send · Shift+Enter for a new line</span>
              <span className="sm:hidden">Enter to send</span>
            </p>
            <p className="hidden items-center gap-1 text-[11px] text-muted-foreground sm:flex">
              <SparklesIcon className="size-3" />
              Last 12 messages kept in this tab
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
