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
 * Shown while location is requested, when it is blocked, and during a run
 * when the fixes are too coarse to capture (`weakAccuracyM`). Renders null
 * once status is "granted" and the signal is good.
 */
export function GeoStatusBanner({
  status,
  weakAccuracyM = null,
}: {
  status: GeoStatus;
  lastError: string | null;
  /** Accuracy in meters of recent fixes when all were too coarse to capture. */
  weakAccuracyM?: number | null;
}) {
  const { t } = useLocale();
  const trackedStatusRef = useRef<GeoStatus | null>(null);
  useEffect(() => {
    if (trackedStatusRef.current === status) return;
    trackedStatusRef.current = status;
    if (status === "denied") track("gps_denied");
    else if (status === "unavailable") track("gps_unavailable");
  }, [status]);

  if (status === "granted") {
    if (weakAccuracyM === null) return null;
    return (
      <div
        data-gps-banner="weak"
        className="pointer-events-none absolute top-16 right-4 left-4 z-10 rounded-md border border-amber-300 bg-amber-50 p-3 text-center text-xs font-medium text-amber-900 shadow-md backdrop-blur"
      >
        {t("run.gps.weak").replace("{m}", String(Math.round(weakAccuracyM)))}
      </div>
    );
  }

  // Waiting for the permission answer is not the same as being blocked.
  // Telling a player with GPS on that they "need to turn on GPS" while the
  // prompt is still open sent support mail.
  const ask = status === "denied";
  const message =
    status === "timeout"
      ? t("run.gps.timeout")
      : status === "denied"
        ? t("run.gps.denied")
        : status === "idle" || status === "requesting"
          ? t("run.gps.requesting")
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
