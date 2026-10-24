"use client";

import { ArrowUpRightIcon, SparklesIcon } from "lucide-react";

import { AiMark } from "./ai-mark";

export function SuggestedPrompts({
  prompts,
  onPick,
  disabled,
  name,
}: {
  prompts: string[];
  onPick: (prompt: string) => void;
  disabled?: boolean;
  name?: string;
}) {
  return (
    <div className="mx-auto flex w-full max-w-lg flex-col items-center gap-3 px-1 py-6 text-center">
      <div className="relative">
        <div
          aria-hidden
          className="absolute inset-0 -z-10 scale-150 rounded-full bg-primary/15 blur-2xl"
        />
        <AiMark className="size-11 rounded-xl shadow-md" />
      </div>

      <div className="space-y-1.5">
        <p className="inline-flex items-center gap-1.5 text-[11px] font-medium tracking-wider text-muted-foreground uppercase">
          <SparklesIcon className="size-3" />
          Ask your data
        </p>
        <h2 className="text-base font-semibold tracking-tight sm:text-lg">
          {name ? `Hi ${name}, what would you like to know?` : "What would you like to know?"}
        </h2>
        <p className="mx-auto max-w-sm text-xs leading-relaxed text-muted-foreground">
          I look things up in your live HR, attendance, leave and payroll records — I don&apos;t
          guess from general knowledge.
        </p>
      </div>

      <div className="mt-1 flex w-full flex-wrap items-center justify-center gap-2">
        {prompts.map((prompt) => (
          <button
            key={prompt}
            type="button"
            disabled={disabled}
            onClick={() => onPick(prompt)}
            className="group inline-flex max-w-full items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-left text-xs text-foreground shadow-xs transition-all hover:border-primary/40 hover:bg-primary/5 hover:text-primary focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50"
          >
            <span className="min-w-0">{prompt}</span>
            <ArrowUpRightIcon className="size-3 shrink-0 text-muted-foreground transition-transform group-hover:-translate-y-px group-hover:translate-x-px group-hover:text-primary" />
          </button>
        ))}
      </div>
    </div>
  );
}
