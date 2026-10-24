"use client";

import { useId, useState } from "react";
import { Loader2Icon, SparklesIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { apiFetch, readableError } from "@/components/shared/api";
import type { LeavePrefill } from "./leave-apply-dialog";

type SmartLeaveResponse =
  | { ok: true; parsed: LeavePrefill & { leaveTypeName?: string; days?: number } }
  | { ok: false; message?: string };

/**
 * Sentence → structured leave suggestion. The employee still confirms (and can
 * edit) everything in the apply dialog; this box never submits a request.
 */
export function SmartLeaveBox({
  onParsed,
  onFillManually,
}: {
  onParsed: (prefill: LeavePrefill) => void;
  onFillManually: () => void;
}) {
  const inputId = useId();
  const [text, setText] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event?: React.FormEvent) {
    event?.preventDefault();
    const sentence = text.trim();
    if (!sentence || pending) return;

    setPending(true);
    setError(null);
    try {
      const result = await apiFetch<SmartLeaveResponse>("/api/ai/smart-leave", {
        method: "POST",
        body: { text: sentence },
      });

      if (result.ok && result.parsed) {
        onParsed({
          leaveTypeId: Number(result.parsed.leaveTypeId),
          startDate: String(result.parsed.startDate),
          endDate: String(result.parsed.endDate),
          reason: String(result.parsed.reason ?? sentence),
        });
      } else {
        setError(
          (result as { message?: string }).message?.trim() ||
            "The AI couldn't find the dates in that sentence.",
        );
      }
    } catch (err) {
      setError(readableError(err));
    } finally {
      setPending(false);
    }
  }

  return (
    <Card className="border border-dashed border-border bg-muted/20 ring-0">
      <CardContent className="flex flex-col gap-3 p-3 sm:flex-row sm:items-start">
        <div className="flex min-w-0 flex-1 items-start gap-2.5">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <SparklesIcon className="size-4" />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-medium">Describe your leave</p>
              <Badge variant="outline" className="border-primary/30 bg-primary/10 text-primary">
                AI
              </Badge>
            </div>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              Say “sick leave next Monday and Tuesday, flu” and we&apos;ll fill the form for you.
              You review it before sending.
            </p>
          </div>
        </div>

        <form
          className="flex w-full flex-col gap-2 sm:max-w-xs"
          onSubmit={submit}
          aria-busy={pending}
        >
          <div className="flex items-center gap-2">
            <label htmlFor={inputId} className="sr-only">
              Describe your leave in a sentence
            </label>
            <Input
              id={inputId}
              value={text}
              onChange={(event) => setText(event.target.value)}
              placeholder="e.g. two days off next week"
              aria-label="Describe your leave in a sentence"
              maxLength={1000}
              disabled={pending}
              className="min-w-0 flex-1"
            />
            <Button
              type="submit"
              size="sm"
              disabled={pending || !text.trim()}
              className="shrink-0"
            >
              {pending ? (
                <Loader2Icon className="size-3.5 animate-spin" />
              ) : (
                <SparklesIcon className="size-3.5" />
              )}
              {pending ? "Filling…" : "Fill form"}
            </Button>
          </div>

          {error ? (
            <div
              role="alert"
              className="rounded-md border border-destructive/30 bg-destructive/5 px-2.5 py-2"
            >
              <p className="text-xs font-medium text-destructive">
                Couldn&apos;t read that — fill the form manually.
              </p>
              <p className="mt-0.5 text-[11px] break-words text-muted-foreground">{error}</p>
              <Button
                type="button"
                variant="outline"
                size="xs"
                className="mt-1.5"
                onClick={onFillManually}
              >
                Fill manually
              </Button>
            </div>
          ) : null}
        </form>
      </CardContent>
    </Card>
  );
}
