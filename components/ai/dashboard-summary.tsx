"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { RotateCcwIcon, SparklesIcon, TriangleAlertIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

/**
 * "AI summary" card — asks `/api/ai/summary` for 3–5 insight bullets about the
 * dashboard KPIs for the current range. The server computes the KPIs and
 * always answers with bullets (a rules-based fallback when AI is unavailable).
 */

type SummaryResponse = {
  ok?: unknown;
  insights?: unknown;
  aiGenerated?: unknown;
  fallback?: unknown;
  model?: unknown;
  error?: unknown;
  field?: unknown;
  retryAfterSeconds?: unknown;
};

type Result = {
  insights: string[];
  aiGenerated: boolean;
  model: string | null;
  durationMs: number;
};

const SESSION_ERROR = "Your session expired. Refresh the page and sign in again.";
const NETWORK_ERROR = "Couldn't reach the summary service. Please try again.";

function formatSeconds(ms: number): string {
  if (ms < 1000) return `${Math.max(1, Math.round(ms))} ms`;
  return `${(ms / 1000).toFixed(1)} s`;
}

function readInsights(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (item): item is string => typeof item === "string" && item.trim().length > 0
  );
}

export function DashboardSummary({
  rangeQuery,
  className,
}: {
  /** Ready-made query string, e.g. `from=2026-10-01&to=2026-10-31`. */
  rangeQuery: string;
  className?: string;
}) {
  const [result, setResult] = useState<Result | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => () => abortRef.current?.abort(), []);

  const run = useCallback(async () => {
    if (pending) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setPending(true);
    setError(null);
    const started = Date.now();

    const query = rangeQuery.trim().replace(/^\?/, "");

    try {
      const res = await fetch(`/api/ai/summary${query ? `?${query}` : ""}`, {
        method: "GET",
        cache: "no-store",
        signal: controller.signal,
      });

      let body: SummaryResponse | null = null;
      try {
        body = (await res.json()) as SummaryResponse;
      } catch {
        body = null;
      }

      if (res.status === 401) {
        setError(SESSION_ERROR);
        return;
      }

      if (res.status === 429) {
        const retry = Number(body?.retryAfterSeconds);
        setError(
          Number.isFinite(retry) && retry > 0
            ? `Summary limit reached. Try again in ${Math.ceil(retry)} s.`
            : "Summary limit reached. Try again in a little while."
        );
        return;
      }

      if (!res.ok || !body) {
        const field = typeof body?.field === "string" ? `${body.field}: ` : "";
        const message = typeof body?.error === "string" ? body.error : NETWORK_ERROR;
        setError(res.status === 400 ? `${field}${message}` : NETWORK_ERROR);
        return;
      }

      const insights = readInsights(body.insights);
      if (insights.length === 0) {
        setError(NETWORK_ERROR);
        return;
      }

      setResult({
        insights,
        aiGenerated: body.aiGenerated === true,
        model: typeof body.model === "string" && body.model.trim() ? body.model : null,
        durationMs: Date.now() - started,
      });
    } catch {
      if (controller.signal.aborted) return;
      setError(NETWORK_ERROR);
    } finally {
      if (!controller.signal.aborted) setPending(false);
      if (abortRef.current === controller) abortRef.current = null;
    }
  }, [pending, rangeQuery]);

  const showFallback = result !== null && !result.aiGenerated;

  return (
    <Card className={cn("flex flex-col", className)}>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-x-3 gap-y-2 space-y-0">
        <div className="flex min-w-0 items-center gap-2.5">
          <span
            aria-hidden
            className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"
          >
            <SparklesIcon className="size-4" />
          </span>
          <div className="min-w-0">
            <CardTitle className="text-sm">AI summary</CardTitle>
            <CardDescription className="text-xs">
              Key takeaways from the KPIs in this range
            </CardDescription>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {result ? (
            <Badge
              variant="outline"
              className={cn(
                "h-auto min-h-5 max-w-[11.5rem] py-1 text-[10px] leading-tight tracking-wide uppercase whitespace-normal",
                showFallback
                  ? "border-amber-300/70 bg-amber-50 text-amber-900"
                  : "border-emerald-300/70 bg-emerald-50 text-emerald-900"
              )}
            >
              {showFallback ? "Rules-based summary (AI unavailable)" : "AI-GENERATED"}
            </Badge>
          ) : null}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void run()}
            disabled={pending}
            aria-label={result ? "Regenerate AI summary" : "Summarize dashboard KPIs"}
          >
            {pending ? (
              <RotateCcwIcon className="animate-spin" />
            ) : (
              <SparklesIcon />
            )}
            {pending ? "Summarizing…" : result ? "Regenerate" : "Summarize"}
          </Button>
        </div>
      </CardHeader>

      <CardContent className="flex min-h-[10.5rem] flex-col justify-between gap-3">
        <div aria-live="polite" aria-busy={pending} className="min-w-0">
          {pending ? (
            <div className="space-y-2.5" aria-label="Generating summary">
              {["w-full", "w-[92%]", "w-[78%]"].map((width, index) => (
                <div key={index} className="flex items-start gap-2">
                  <span className="mt-[0.45rem] size-1 shrink-0 rounded-full bg-muted-foreground/30" />
                  <span
                    className={cn(
                      "h-3 animate-pulse rounded-full bg-muted",
                      width
                    )}
                  />
                </div>
              ))}
            </div>
          ) : error ? (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-lg border border-destructive/25 bg-destructive/5 px-2.5 py-2 text-xs text-destructive"
            >
              <TriangleAlertIcon className="mt-px size-3.5 shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="leading-relaxed break-words">{error}</p>
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  className="mt-1 -ml-1.5 text-destructive hover:text-destructive"
                  onClick={() => void run()}
                >
                  <RotateCcwIcon />
                  Retry
                </Button>
              </div>
            </div>
          ) : result ? (
            <ul className="space-y-2 text-sm">
              {result.insights.map((insight, index) => (
                <li key={index} className="flex items-start gap-2">
                  <SparklesIcon
                    aria-hidden
                    className={cn(
                      "mt-0.5 size-3 shrink-0",
                      result.aiGenerated ? "text-primary" : "text-muted-foreground"
                    )}
                  />
                  <span className="min-w-0 leading-relaxed break-words">{insight}</span>
                </li>
              ))}
            </ul>
          ) : (
            <div className="space-y-1.5 text-sm text-muted-foreground">
              <p>
                Turn this range&apos;s KPIs into a few plain-language takeaways for
                your next stand-up.
              </p>
              <p className="text-xs">
                Generated from server-computed metrics — never from client values.
              </p>
            </div>
          )}
        </div>

        <div className="flex min-h-4 items-center justify-between gap-2 text-[11px] text-muted-foreground">
          {result ? (
            <>
              <span className="truncate">
                {result.aiGenerated ? "AI-generated" : "Rules-based (AI unavailable)"}
                {result.model ? ` · ${result.model}` : ""}
              </span>
              <span className="shrink-0 tabular-nums">
                {formatSeconds(result.durationMs)}
              </span>
            </>
          ) : (
            <span className="truncate">
              {pending ? "Reading live metrics…" : "Not generated yet"}
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
