"use client";

import { useEffect, useRef } from "react";
import { track } from "@/lib/analytics";
import { useLocale } from "@/lib/i18n";

export type GeoStatus =
  | "idle"
  | "requesting"
  | "granted"
  | "denied"
  | "timeout"
  | "unavailable";

/**
 * Shown the moment location is requested, and again if they deny it.
 * Renders null once status is "granted".
 */
export function GeoStatusBanner({
  status,
}: {
  status: GeoStatus;
  lastError: string | null;
}) {
  const { t } = useLocale();
  const trackedStatusRef = useRef<GeoStatus | null>(null);
  useEffect(() => {
    if (trackedStatusRef.current === status) return;
    trackedStatusRef.current = status;
    if (status === "denied") track("gps_denied");
    else if (status === "unavailable") track("gps_unavailable");
  }, [status]);

  if (status === "granted") return null;

  const ask =
    status === "idle" || status === "requesting" || status === "denied";
  const message =
    status === "timeout"
      ? t("run.gps.timeout")
      : ask
        ? t("run.gps.denied")
        : t("run.gps.unavailable");
  const tone = ask
    ? "border border-amber-300 bg-amber-50 p-4 text-sm font-medium leading-snug text-amber-950"
    : "border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900";

  return (
    <div
      data-gps-banner={status}
      className={`pointer-events-none absolute top-16 right-4 left-4 z-10 rounded-md text-center shadow-md backdrop-blur ${tone}`}
    >
      {message}
    </div>
  );
}
