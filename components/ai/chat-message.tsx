"use client";

import {
  ChevronRightIcon,
  SparklesIcon,
  TriangleAlertIcon,
  WrenchIcon,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { AiMark } from "./ai-mark";
import { DISCLAIMER, type ChatMessage, type ToolCall } from "./types";

/** Small, forgiving renderer for the model's plain-text answers (bold, code, bullets). */
function renderInline(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).filter(Boolean);
  return parts.map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <strong key={index} className="font-semibold text-foreground">
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (part.startsWith("`") && part.endsWith("`")) {
      return (
        <code
          key={index}
          className="rounded border border-border/70 bg-background/70 px-1 py-px font-mono text-[0.85em] text-foreground"
        >
          {part.slice(1, -1)}
        </code>
      );
    }
    return <span key={index}>{part}</span>;
  });
}

function MessageText({ text }: { text: string }) {
  const blocks: React.ReactNode[] = [];
  let bullets: string[] = [];

  const flushBullets = () => {
    if (!bullets.length) return;
    const items = bullets;
    bullets = [];
    blocks.push(
      <ul key={`ul-${blocks.length}`} className="space-y-1">
        {items.map((item, index) => (
          <li key={index} className="flex gap-2">
            <span aria-hidden className="mt-[0.45em] size-1 shrink-0 rounded-full bg-current opacity-50" />
            <span className="min-w-0">{renderInline(item)}</span>
          </li>
        ))}
      </ul>,
    );
  };

  text.split("\n").forEach((line, index) => {
    const bullet = /^\s*[-*•]\s+(.*)$/.exec(line);
    if (bullet) {
      bullets.push(bullet[1]);
      return;
    }
    flushBullets();
    if (!line.trim()) {
      blocks.push(<div key={`gap-${index}`} aria-hidden className="h-1.5" />);
      return;
    }
    blocks.push(
      <p key={`p-${index}`} className="leading-relaxed">
        {renderInline(line)}
      </p>,
    );
  });
  flushBullets();

  return <div className="space-y-0.5">{blocks}</div>;
}

function ToolTrace({ toolCalls }: { toolCalls: ToolCall[] }) {
  if (!toolCalls.length) return null;

  const timed = toolCalls.filter((call) => typeof call.ms === "number");
  const totalMs = timed.reduce((sum, call) => sum + (call.ms ?? 0), 0);
  const label =
    toolCalls.length === 1
      ? `Used ${toolCalls[0].name}`
      : `Used ${toolCalls[0].name} +${toolCalls.length - 1} more`;

  return (
    <details className="group/trace w-fit max-w-full text-[11px] text-muted-foreground">
      <summary className="flex cursor-pointer list-none items-center gap-1.5 rounded-md px-1 py-0.5 transition-colors hover:text-foreground [&::-webkit-details-marker]:hidden">
        <ChevronRightIcon className="size-3 shrink-0 transition-transform group-open/trace:rotate-90" />
        <WrenchIcon className="size-3 shrink-0 opacity-70" />
        <span className="truncate">{label}</span>
        {timed.length ? (
          <span className="shrink-0 tabular-nums opacity-80">· {Math.round(totalMs)} ms</span>
        ) : null}
      </summary>
      <ul className="mt-1 ml-2.5 space-y-1 border-l border-border pl-3">
        {toolCalls.map((call, index) => (
          <li key={`${call.name}-${index}`} className="flex items-baseline justify-between gap-4">
            <span className="truncate font-mono text-[10.5px] text-foreground/80">{call.name}</span>
            {typeof call.ms === "number" ? (
              <span className="shrink-0 tabular-nums opacity-80">{Math.round(call.ms)} ms</span>
            ) : null}
          </li>
        ))}
      </ul>
    </details>
  );
}

function AiBadgeRow() {
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 pl-0.5">
      <Badge
        variant="outline"
        className="h-5 gap-1 border-primary/25 bg-primary/5 px-1.5 text-[10px] font-medium tracking-wider text-primary uppercase"
      >
        <SparklesIcon className="size-2.5" />
        AI-generated
      </Badge>
      <span className="text-[11px] leading-snug text-muted-foreground">{DISCLAIMER}</span>
    </div>
  );
}

export function ChatMessageBubble({ message }: { message: ChatMessage }) {
  if (message.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-2xl rounded-br-md bg-primary px-3.5 py-2.5 text-sm break-words text-primary-foreground shadow-sm sm:max-w-[75%]">
          <MessageText text={message.content} />
        </div>
      </div>
    );
  }

  if (message.error) {
    return (
      <div className="flex gap-2.5">
        <div className="grid size-7 shrink-0 place-items-center rounded-[0.5rem] border border-destructive/25 bg-destructive/5 text-destructive">
          <TriangleAlertIcon className="size-3.5" />
        </div>
        <div
          role="alert"
          className="max-w-[85%] rounded-2xl rounded-tl-md border border-destructive/25 bg-destructive/5 px-3.5 py-2.5 text-sm leading-relaxed break-words text-destructive sm:max-w-[75%]"
        >
          {message.content}
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-2.5">
      <AiMark size="sm" />
      <div className="min-w-0 max-w-[85%] space-y-1.5 sm:max-w-[75%]">
        <div className="rounded-2xl rounded-tl-md border border-border/70 bg-card px-3.5 py-2.5 text-sm break-words shadow-xs">
          <MessageText text={message.content} />
        </div>
        {message.toolCalls?.length ? <ToolTrace toolCalls={message.toolCalls} /> : null}
        <AiBadgeRow />
      </div>
    </div>
  );
}

export function TypingIndicator() {
  return (
    <div className="flex gap-2.5" aria-live="polite">
      <AiMark size="sm" />
      <div className="flex items-center gap-2.5 rounded-2xl rounded-tl-md border border-border/70 bg-card px-3.5 py-3 shadow-xs">
        <span className="flex items-center gap-1">
          {[0, 150, 300].map((delay) => (
            <span
              key={delay}
              className="size-1.5 animate-bounce rounded-full bg-primary/60"
              style={{ animationDelay: `${delay}ms`, animationDuration: "1s" }}
            />
          ))}
        </span>
        <span className="text-[11px] text-muted-foreground">Checking live data…</span>
        <span className="sr-only">Assistant is typing</span>
      </div>
    </div>
  );
}
