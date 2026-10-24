"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CheckIcon,
  InfoIcon,
  LockIcon,
  MapPinIcon,
  SaveIcon,
  Undo2Icon,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { ApiRequestError, api, readableError } from "./api";
import { ErrorPanel, Field } from "./org-ui";
import type { Settings } from "./types";
import { useObject } from "./use-resource";

const WEEKEND_DAYS = [
  { value: "sat", short: "Sat", long: "Saturday" },
  { value: "sun", short: "Sun", long: "Sunday" },
];

type FormState = {
  companyName: string;
  officeStart: string;
  graceMinutes: string;
  halfDayMinutes: string;
  weekendDays: string[];
  officeLat: string;
  officeLng: string;
  radiusM: string;
};

type SavePayload = {
  companyName: string;
  officeStart: string;
  graceMinutes: number;
  halfDayMinutes: number;
  weekendDays: string;
  officeLat: number | null;
  officeLng: number | null;
  radiusM: number;
};

function toForm(settings: Settings): FormState {
  return {
    companyName: settings.companyName ?? "",
    officeStart: settings.officeStart || "09:00",
    graceMinutes: String(settings.graceMinutes ?? 0),
    halfDayMinutes: String(settings.halfDayMinutes ?? 0),
    weekendDays: (settings.weekendDays ?? "")
      .split(",")
      .map((d) => d.trim().toLowerCase())
      .filter(Boolean),
    officeLat: settings.officeLat === null ? "" : String(settings.officeLat),
    officeLng: settings.officeLng === null ? "" : String(settings.officeLng),
    radiusM: String(settings.radiusM ?? ""),
  };
}

function fingerprint(form: FormState): string {
  return JSON.stringify({
    companyName: form.companyName.trim(),
    officeStart: form.officeStart,
    graceMinutes: form.graceMinutes.trim(),
    halfDayMinutes: form.halfDayMinutes.trim(),
    weekendDays: [...form.weekendDays].sort().join(","),
    officeLat: form.officeLat.trim(),
    officeLng: form.officeLng.trim(),
    radiusM: form.radiusM.trim(),
  });
}

function minutesLabel(raw: string): string {
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) return "";
  const hours = Math.floor(value / 60);
  const minutes = value % 60;
  if (hours && minutes) return `${hours}h ${minutes}m`;
  if (hours) return `${hours}h`;
  return `${minutes}m`;
}

function validate(form: FormState): { payload: SavePayload } | { errors: Record<string, string> } {
  const errors: Record<string, string> = {};

  if (!form.companyName.trim()) errors.companyName = "Enter the company name.";
  if (!/^\d{2}:\d{2}$/.test(form.officeStart)) errors.officeStart = "Pick an office start time.";
  if (form.weekendDays.length === 0) {
    errors.weekendDays = "Pick at least one weekend day.";
  }

  const grace = Number(form.graceMinutes);
  if (!form.graceMinutes.trim() || !Number.isInteger(grace) || grace < 0 || grace > 120) {
    errors.graceMinutes = "Use a whole number between 0 and 120.";
  }

  const halfDay = Number(form.halfDayMinutes);
  if (!form.halfDayMinutes.trim() || !Number.isInteger(halfDay) || halfDay < 60 || halfDay > 720) {
    errors.halfDayMinutes = "Use 60 to 720 minutes (1–12 hours).";
  }

  const radius = Number(form.radiusM);
  if (!form.radiusM.trim() || !Number.isFinite(radius) || radius < 20 || radius > 5000) {
    errors.radiusM = "Use 20 to 5,000 metres.";
  }

  const latRaw = form.officeLat.trim();
  const lngRaw = form.officeLng.trim();
  let officeLat: number | null = null;
  let officeLng: number | null = null;

  if (latRaw || lngRaw) {
    if (!latRaw || !lngRaw) {
      errors.officeLat = "Enter both latitude and longitude, or leave both empty.";
      errors.officeLng = "Enter both latitude and longitude, or leave both empty.";
    } else {
      officeLat = Number(latRaw);
      officeLng = Number(lngRaw);
      if (!Number.isFinite(officeLat) || officeLat < -90 || officeLat > 90) {
        errors.officeLat = "Latitude must be between -90 and 90.";
      }
      if (!Number.isFinite(officeLng) || officeLng < -180 || officeLng > 180) {
        errors.officeLng = "Longitude must be between -180 and 180.";
      }
    }
  }

  if (Object.keys(errors).length > 0) return { errors };

  return {
    payload: {
      companyName: form.companyName.trim(),
      officeStart: form.officeStart,
      graceMinutes: grace,
      halfDayMinutes: halfDay,
      weekendDays: form.weekendDays.join(","),
      officeLat,
      officeLng,
      radiusM: Math.round(radius),
    },
  };
}

export function CompanyTab({ canEdit }: { canEdit: boolean }) {
  const { data, loading, error, reload } = useObject<Settings>("/api/settings", "settings");
  const [form, setForm] = useState<FormState | null>(null);
  const [baseline, setBaseline] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!data) return;
    const next = toForm(data);
    setForm(next);
    setBaseline(fingerprint(next));
    setErrors({});
  }, [data]);

  const dirty = useMemo(
    () => (form ? fingerprint(form) !== baseline : false),
    [form, baseline],
  );

  if (loading && !data) return <CompanySkeleton />;
  if (error) {
    return (
      <ErrorPanel
        title="Couldn't load company settings"
        message={error}
        onRetry={reload}
      />
    );
  }
  if (!form) return null;

  const update = (patch: Partial<FormState>) => {
    setForm((current) => (current ? { ...current, ...patch } : current));
    setErrors({});
  };

  const toggleWeekend = (day: string) => {
    if (!canEdit) return;
    const next = form.weekendDays.includes(day)
      ? form.weekendDays.filter((d) => d !== day)
      : [...form.weekendDays, day];
    update({ weekendDays: next });
  };

  const handleSave = async () => {
    const result = validate(form);
    if ("errors" in result) {
      setErrors(result.errors);
      toast.error("Check the highlighted fields.");
      return;
    }

    setPending(true);
    try {
      await api<{ settings: Settings }>("/api/settings", {
        method: "PATCH",
        body: result.payload,
      });
      toast.success("Company settings saved");
      reload();
    } catch (err) {
      if (err instanceof ApiRequestError) {
        if (err.fields) setErrors(err.fields);
        toast.error(err.message);
      } else {
        toast.error(readableError(err));
      }
    } finally {
      setPending(false);
    }
  };

  const radius = Number(form.radiusM);
  const radiusDisplay =
    Number.isFinite(radius) && radius > 0 ? `${Math.round(radius).toLocaleString()} m` : "—";
  const workingDays = 7 - form.weekendDays.length;

  return (
    <div className="space-y-4">
      {!canEdit ? (
        <div className="flex items-start gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2.5 text-xs text-muted-foreground">
          <LockIcon className="mt-px size-3.5 shrink-0" />
          <p>
            <span className="font-medium text-foreground">View only.</span> Company settings are
            managed by an admin, so these values can&apos;t be changed from an HR account.
          </p>
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-5">
        <section className="flex flex-col overflow-hidden rounded-lg border border-border bg-card lg:col-span-3">
          <div className="border-b border-border px-4 py-3">
            <h2 className="text-sm font-medium">Company profile</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Attendance, leave and payroll all read these rules.
            </p>
          </div>

          <div className="flex-1 space-y-5 p-4">
            <div className="grid gap-4 sm:grid-cols-3">
              <Field
                label="Company name"
                htmlFor="companyName"
                error={errors.companyName}
                className="sm:col-span-3"
              >
                <Input
                  id="companyName"
                  value={form.companyName}
                  onChange={(e) => update({ companyName: e.target.value })}
                  disabled={!canEdit || pending}
                  placeholder="Acme Pvt Ltd"
                  className={!canEdit ? "bg-muted/30 disabled:opacity-100" : undefined}
                  aria-invalid={!!errors.companyName}
                />
              </Field>

              <Field
                label="Office start"
                htmlFor="officeStart"
                hint="Late is counted after grace."
                error={errors.officeStart}
              >
                <Input
                  id="officeStart"
                  type="time"
                  value={form.officeStart}
                  onChange={(e) => update({ officeStart: e.target.value })}
                  disabled={!canEdit || pending}
                  className={cn("tabular-nums", !canEdit && "bg-muted/30 disabled:opacity-100")}
                  aria-invalid={!!errors.officeStart}
                />
              </Field>

              <Field
                label="Grace minutes"
                htmlFor="graceMinutes"
                hintRight={Number(form.graceMinutes) > 0 ? `${form.graceMinutes} min` : undefined}
                hint="0–120 minutes."
                error={errors.graceMinutes}
              >
                <Input
                  id="graceMinutes"
                  type="number"
                  min={0}
                  max={120}
                  inputMode="numeric"
                  value={form.graceMinutes}
                  onChange={(e) => update({ graceMinutes: e.target.value })}
                  disabled={!canEdit || pending}
                  className={cn("tabular-nums", !canEdit && "bg-muted/30 disabled:opacity-100")}
                  aria-invalid={!!errors.graceMinutes}
                />
              </Field>

              <Field
                label="Half-day minutes"
                htmlFor="halfDayMinutes"
                hintRight={minutesLabel(form.halfDayMinutes)}
                hint="Minutes that count as a half day."
                error={errors.halfDayMinutes}
              >
                <Input
                  id="halfDayMinutes"
                  type="number"
                  min={60}
                  max={720}
                  step={15}
                  inputMode="numeric"
                  value={form.halfDayMinutes}
                  onChange={(e) => update({ halfDayMinutes: e.target.value })}
                  disabled={!canEdit || pending}
                  className={cn("tabular-nums", !canEdit && "bg-muted/30 disabled:opacity-100")}
                  aria-invalid={!!errors.halfDayMinutes}
                />
              </Field>
            </div>

            <div className="space-y-2">
              <div className="flex items-baseline justify-between gap-2">
                <p className="text-xs font-medium">Weekend days</p>
                <span className="text-[11px] text-muted-foreground">
                  {workingDays} working day{workingDays === 1 ? "" : "s"} a week
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5" role="group" aria-label="Weekend days">
                {WEEKEND_DAYS.map((day) => {
                  const selected = form.weekendDays.includes(day.value);
                  const shared = cn(
                    "inline-flex h-7 items-center gap-1.5 rounded-full border px-3 text-xs transition-colors",
                    selected
                      ? "border-primary/30 bg-primary/10 text-foreground"
                      : "border-border text-muted-foreground",
                  );

                  if (!canEdit) {
                    return (
                      <span
                        key={day.value}
                        className={cn(shared, !selected && "opacity-60")}
                        title={day.long}
                      >
                        {selected ? <CheckIcon className="size-3" /> : null}
                        {day.short}
                      </span>
                    );
                  }

                  return (
                    <button
                      key={day.value}
                      type="button"
                      onClick={() => toggleWeekend(day.value)}
                      aria-pressed={selected}
                      disabled={pending}
                      className={cn(
                        shared,
                        "cursor-pointer hover:border-primary/40 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none active:translate-y-px disabled:opacity-50",
                      )}
                    >
                      {selected ? <CheckIcon className="size-3" /> : null}
                      {day.short}
                    </button>
                  );
                })}
              </div>
              {errors.weekendDays ? (
                <p className="text-[11px] text-destructive">{errors.weekendDays}</p>
              ) : (
                <p className="text-[11px] text-muted-foreground">
                  These days are skipped by attendance and payroll.
                </p>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border bg-muted/30 px-4 py-2.5">
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              {!canEdit ? (
                <>
                  <LockIcon className="size-3.5" />
                  Managed by an admin
                </>
              ) : dirty ? (
                <>
                  <span className="size-1.5 rounded-full bg-amber-500" />
                  Unsaved changes
                </>
              ) : (
                <>
                  <CheckIcon className="size-3.5 text-emerald-600" />
                  All changes saved
                </>
              )}
            </p>
            {canEdit ? (
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    const reset = toForm(data as Settings);
                    setForm(reset);
                    setErrors({});
                  }}
                  disabled={!dirty || pending}
                  className="gap-1.5"
                >
                  <Undo2Icon className="size-3.5" />
                  Discard
                </Button>
                <Button
                  size="sm"
                  onClick={handleSave}
                  disabled={!dirty || pending}
                  className="gap-1.5"
                >
                  <SaveIcon className="size-3.5" />
                  {pending ? "Saving…" : "Save changes"}
                </Button>
              </div>
            ) : null}
          </div>
        </section>

        <section className="flex flex-col overflow-hidden rounded-lg border border-border bg-card lg:col-span-2">
          <div className="border-b border-border px-4 py-3">
            <h2 className="flex items-center gap-1.5 text-sm font-medium">
              <MapPinIcon className="size-3.5 text-muted-foreground" />
              Office geofence
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Used for camera check-in once attendance goes live.
            </p>
          </div>

          <div className="space-y-4 p-4">
            <div className="relative flex h-36 items-center justify-center overflow-hidden rounded-lg border border-border bg-muted/20">
              <div
                aria-hidden
                className="absolute inset-0 opacity-70"
                style={{
                  backgroundImage: "radial-gradient(var(--color-border) 1px, transparent 1px)",
                  backgroundSize: "14px 14px",
                }}
              />
              <div
                aria-hidden
                className="absolute size-32 rounded-full border border-primary/15 bg-primary/5"
              />
              <div
                aria-hidden
                className="absolute size-20 rounded-full border border-dashed border-primary/30"
              />
              <div className="relative flex flex-col items-center gap-2">
                <span className="flex size-9 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm">
                  <MapPinIcon className="size-4" />
                </span>
                <span className="rounded-full border border-border bg-card px-2 py-0.5 text-[11px] font-medium tabular-nums text-foreground shadow-xs">
                  {radiusDisplay} radius
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <Field label="Latitude" htmlFor="officeLat" error={errors.officeLat}>
                <Input
                  id="officeLat"
                  type="number"
                  step="any"
                  inputMode="decimal"
                  placeholder="e.g. 24.8607"
                  value={form.officeLat}
                  onChange={(e) => update({ officeLat: e.target.value })}
                  disabled={!canEdit || pending}
                  className={cn("tabular-nums", !canEdit && "bg-muted/30 disabled:opacity-100")}
                  aria-invalid={!!errors.officeLat}
                />
              </Field>
              <Field label="Longitude" htmlFor="officeLng" error={errors.officeLng}>
                <Input
                  id="officeLng"
                  type="number"
                  step="any"
                  inputMode="decimal"
                  placeholder="e.g. 67.0011"
                  value={form.officeLng}
                  onChange={(e) => update({ officeLng: e.target.value })}
                  disabled={!canEdit || pending}
                  className={cn("tabular-nums", !canEdit && "bg-muted/30 disabled:opacity-100")}
                  aria-invalid={!!errors.officeLng}
                />
              </Field>
            </div>

            <Field
              label="Radius (metres)"
              htmlFor="radiusM"
              hint="20–5,000 metres from the pin."
              error={errors.radiusM}
            >
              <Input
                id="radiusM"
                type="number"
                min={20}
                max={5000}
                step={10}
                inputMode="numeric"
                value={form.radiusM}
                onChange={(e) => update({ radiusM: e.target.value })}
                disabled={!canEdit || pending}
                className={cn("tabular-nums", !canEdit && "bg-muted/30 disabled:opacity-100")}
                aria-invalid={!!errors.radiusM}
              />
            </Field>

            <div className="flex items-start gap-2 rounded-md bg-muted/50 px-2.5 py-2 text-[11px] leading-relaxed text-muted-foreground">
              <InfoIcon className="mt-px size-3 shrink-0" />
              <p>
                Get the numbers from your map app: find the office, right-click the pin, and copy
                the two coordinates. Leave both empty to skip location checks.
              </p>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

function CompanySkeleton() {
  return (
    <div className="grid gap-4 lg:grid-cols-5">
      <div className="overflow-hidden rounded-lg border border-border bg-card lg:col-span-3">
        <div className="border-b border-border px-4 py-3">
          <Skeleton className="h-3.5 w-32" />
          <Skeleton className="mt-2 h-2.5 w-56" />
        </div>
        <div className="grid gap-4 p-4 sm:grid-cols-3">
          <div className="space-y-2 sm:col-span-3">
            <Skeleton className="h-2.5 w-24" />
            <Skeleton className="h-8 w-full" />
          </div>
          {[0, 1, 2].map((i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="h-2.5 w-20" />
              <Skeleton className="h-8 w-full" />
            </div>
          ))}
        </div>
      </div>
      <div className="overflow-hidden rounded-lg border border-border bg-card lg:col-span-2">
        <div className="border-b border-border px-4 py-3">
          <Skeleton className="h-3.5 w-28" />
        </div>
        <div className="space-y-3 p-4">
          <Skeleton className="h-36 w-full" />
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
        </div>
      </div>
    </div>
  );
}
