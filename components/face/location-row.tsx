"use client";

import { Loader2Icon, MapPinIcon, RotateCcwIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { formatMetersShort, haversineMeters } from "./geo";
import type { FaceStatus, GeoState } from "./types";

export function LocationRow({
  geo,
  status,
}: {
  geo: GeoState & { refresh: () => void };
  status: FaceStatus;
}) {
  const officeReady =
    status.officeConfigured &&
    status.officeLat != null &&
    status.officeLng != null &&
    status.radiusM != null;

  const distance =
    officeReady &&
    geo.latitude != null &&
    geo.longitude != null &&
    status.officeLat != null &&
    status.officeLng != null
      ? haversineMeters(geo.latitude, geo.longitude, status.officeLat, status.officeLng)
      : null;
  const inside = distance != null && status.radiusM != null ? distance <= status.radiusM : null;

  let title = "Location";
  let detail = "";
  let tone: "neutral" | "good" | "warn" | "bad" = "neutral";
  let showRefresh = false;

  if (!officeReady) {
    title = "Office location not configured";
    detail = "Ask an admin to set the office location and radius. Face check-in can't pass the server's geofence check until then.";
    tone = "warn";
  } else if (geo.status === "unsupported") {
    title = "Location isn't supported";
    detail = "This browser can't share a location. Check-in needs it — try a modern browser over https.";
    tone = "bad";
  } else if (geo.status === "denied") {
    title = "Location blocked";
    detail = "Allow location for this site in your browser settings, then retry. The server needs a location with every face punch.";
    tone = "bad";
    showRefresh = true;
  } else if (geo.status === "error") {
    title = "Couldn't get your location";
    detail = geo.message ?? "Try again, or move somewhere with a clearer GPS signal.";
    tone = "bad";
    showRefresh = true;
  } else if (geo.status === "granted" && geo.latitude != null && geo.longitude != null) {
    title = inside === false ? "Outside the office radius (display only)" : "Location on";
    detail =
      inside === false
        ? "The server makes the final call, but this looks outside the configured radius."
        : "The server checks the location again when you submit.";
    tone = inside === false ? "warn" : "good";
    showRefresh = true;
  } else {
    title = "Getting your location…";
    detail = "Approve the browser prompt so the server can check where you're checking in from.";
    tone = "neutral";
    showRefresh = true;
  }

  const accuracyTooLow = geo.accuracy != null && geo.accuracy > 100;

  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2.5">
      <div className="flex items-start gap-2.5">
        <span
          className={cn(
            "mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full",
            tone === "good"
              ? "bg-emerald-50 text-emerald-600"
              : tone === "warn"
                ? "bg-amber-50 text-amber-600"
                : tone === "bad"
                  ? "bg-rose-50 text-rose-600"
                  : "bg-muted text-muted-foreground",
          )}
        >
          {geo.status === "locating" ? (
            <Loader2Icon className="size-3.5 animate-spin" aria-hidden />
          ) : (
            <MapPinIcon className="size-3.5" aria-hidden />
          )}
        </span>

        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
            <p className="text-xs font-medium">{title}</p>
            {showRefresh ? (
              <Button
                type="button"
                variant="ghost"
                size="xs"
                className="h-5 px-1.5 text-[11px] text-muted-foreground"
                onClick={geo.refresh}
              >
                <RotateCcwIcon className="size-3" aria-hidden />
                Refresh
              </Button>
            ) : null}
          </div>
          <p className="text-[11px] leading-relaxed text-muted-foreground">{detail}</p>

          {officeReady && geo.status === "granted" ? (
            <div className="flex flex-wrap gap-1.5 pt-0.5">
              <span
                className={cn(
                  "inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-medium tabular-nums",
                  accuracyTooLow
                    ? "border-amber-200 bg-amber-50 text-amber-700"
                    : "border-emerald-200 bg-emerald-50 text-emerald-700",
                )}
              >
                Accuracy {geo.accuracy != null ? `±${Math.round(geo.accuracy)} m` : "—"}
                {accuracyTooLow ? " · needs ≤ 100 m" : ""}
              </span>
              {distance != null ? (
                <span
                  className={cn(
                    "inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-medium tabular-nums",
                    inside
                      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                      : "border-amber-200 bg-amber-50 text-amber-700",
                  )}
                >
                  {inside ? "Inside" : "Outside"} · {formatMetersShort(distance)} of{" "}
                  {formatMetersShort(status.radiusM)} radius
                </span>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
