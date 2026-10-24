"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import {
  AlertCircleIcon,
  CheckCircle2Icon,
  DownloadIcon,
  FileSpreadsheetIcon,
  UploadCloudIcon,
  XIcon,
} from "lucide-react";
import { toast } from "sonner";

import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import {
  IMPORT_COLUMNS,
  readApiError,
  type ImportResult,
} from "./types";

const SAMPLE_ROW =
  "EMP-001,Ayesha Khan,ayesha.khan@example.com,+92 300 1234567,12 Garden Avenue,Engineering,Software Engineer,2026-01-15,active,120000";

export function CsvImport() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState<"validate" | "import" | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  function pickFile(list: FileList | null) {
    const next = list?.[0];
    if (!next) return;
    if (!next.name.toLowerCase().endsWith(".csv")) {
      toast.error("Choose a .csv file");
      return;
    }
    setFile(next);
    setResult(null);
    setError(null);
  }

  async function run(dryRun: boolean) {
    if (!file) return;
    setBusy(dryRun ? "validate" : "import");
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(`/api/employees/import?dryRun=${dryRun ? 1 : 0}`, {
        method: "POST",
        body: form,
      });
      if (!res.ok) throw new Error((await readApiError(res)).message);
      const body = (await res.json()) as ImportResult;
      setResult(body);
      if (!dryRun) {
        toast.success(`Imported ${body.created.length} of ${body.total} rows`);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Import failed";
      setError(message);
      toast.error(message);
    } finally {
      setBusy(null);
    }
  }

  function downloadSample() {
    const csv = [IMPORT_COLUMNS.join(","), SAMPLE_ROW].join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "employees-sample.csv";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  const imported = result && !result.dryRun ? result.created.length : 0;
  const canImport = Boolean(result?.dryRun && result.valid > 0);

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <PageHeader
        title="Import employees"
        description="Bulk-register employees from a CSV file. Validate first — nothing is written until you import."
        actions={
          <Link href="/employees" className={buttonVariants({ variant: "outline", size: "sm" })}>
            Back to employees
          </Link>
        }
      />

      <Card>
        <CardContent className="space-y-4 p-4 sm:p-5">
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              pickFile(e.dataTransfer.files);
            }}
            className={cn(
              "rounded-lg border border-dashed border-border px-4 py-8 text-center transition-colors",
              dragging && "border-primary bg-primary/5",
            )}
          >
            <UploadCloudIcon className="mx-auto size-6 text-muted-foreground" />
            <p className="mt-2 text-sm font-medium">Drop your CSV here</p>
            <p className="mt-0.5 text-xs text-muted-foreground">or choose a file from your device</p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-3"
              onClick={() => inputRef.current?.click()}
            >
              <FileSpreadsheetIcon />
              Choose CSV file
            </Button>
            <input
              ref={inputRef}
              type="file"
              accept=".csv,text/csv"
              className="sr-only"
              onChange={(e) => pickFile(e.target.files)}
            />
          </div>

          {file ? (
            <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm">
              <FileSpreadsheetIcon className="size-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate">{file.name}</span>
              <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                {(file.size / 1024).toFixed(1)} KB
              </span>
              <button
                type="button"
                className="rounded-sm p-0.5 text-muted-foreground hover:text-foreground"
                onClick={() => {
                  setFile(null);
                  setResult(null);
                  setError(null);
                  if (inputRef.current) inputRef.current.value = "";
                }}
                aria-label="Remove selected file"
              >
                <XIcon className="size-3.5" />
              </button>
            </div>
          ) : null}

          <div className="space-y-1.5">
            <p className="text-xs font-medium">Expected header row</p>
            <div className="flex flex-wrap items-center gap-x-1 gap-y-1 rounded-lg border border-border bg-muted/40 px-3 py-2 font-mono text-[11px] text-muted-foreground">
              {IMPORT_COLUMNS.map((column, index) => (
                <span key={column} className="inline-flex items-center gap-1">
                  <span className="rounded border border-border bg-background px-1 py-0.5">
                    {column}
                  </span>
                  {index < IMPORT_COLUMNS.length - 1 ? <span>,</span> : null}
                </span>
              ))}
            </div>
            <p className="text-[11px] text-muted-foreground">
              Department and designation must match existing records by name. Status must be
              active, probation or exited.
            </p>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Button
              type="button"
              size="sm"
              onClick={() => void run(true)}
              disabled={!file || busy !== null}
            >
              {busy === "validate" ? "Validating…" : "Validate first"}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => void run(false)}
              disabled={!canImport || busy !== null}
            >
              {busy === "import"
                ? "Importing…"
                : result?.dryRun
                  ? `Import ${result.valid} ${result.valid === 1 ? "row" : "rows"}`
                  : "Import rows"}
            </Button>
            <button
              type="button"
              onClick={downloadSample}
              className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline sm:ml-auto"
            >
              <DownloadIcon className="size-3.5" />
              Download sample CSV
            </button>
          </div>

          {error ? (
            <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
              <AlertCircleIcon className="mt-0.5 size-3.5 shrink-0" />
              <span>{error}</span>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {imported > 0 ? (
        <Card className="border-emerald-200">
          <CardContent className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-2">
              <CheckCircle2Icon className="mt-0.5 size-4 shrink-0 text-emerald-600" />
              <div>
                <p className="text-sm font-medium">
                  Created {imported} {imported === 1 ? "employee" : "employees"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {result && result.created.length < result.total
                    ? `${result.total - result.created.length} rows were skipped — see the errors below.`
                    : "They are now in the employee directory."}
                </p>
              </div>
            </div>
            <Link href="/employees" className={buttonVariants({ size: "sm" })}>
              Back to employees
            </Link>
          </CardContent>
        </Card>
      ) : null}

      {result ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">
              {result.dryRun ? "Validation result" : "Import result"}
            </CardTitle>
            <p className="text-xs text-muted-foreground tabular-nums">
              {result.valid} of {result.total} rows valid
              {result.errors.length > 0 ? ` · ${result.errors.length} problems` : ""}
            </p>
          </CardHeader>
          <CardContent className="pt-0">
            {result.errors.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground">
                No problems found — this file is ready to import.
              </div>
            ) : (
              <div className="max-h-80 overflow-y-auto rounded-lg border border-border">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="pl-3">Row</TableHead>
                      <TableHead>Field</TableHead>
                      <TableHead>Reason</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {result.errors.map((row, index) => (
                      <TableRow key={`${row.row}-${row.field}-${index}`}>
                        <TableCell className="pl-3 tabular-nums">{row.row}</TableCell>
                        <TableCell className="font-mono text-xs">{row.field}</TableCell>
                        <TableCell className="text-xs whitespace-normal text-muted-foreground">
                          {row.reason}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
