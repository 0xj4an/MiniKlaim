"use client";

import { useEffect, useRef, useState } from "react";
import { CloseButton } from "@/app/CloseButton";
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

  // Every banner can be closed. A closed one stays hidden until the state
  // it describes changes (another status, or the weak signal clears).
  const kind =
    status === "granted" ? (weakAccuracyM === null ? null : "weak") : status;
  const [closedKind, setClosedKind] = useState<string | null>(null);
  useEffect(() => {
    if (kind === null) setClosedKind(null);
  }, [kind]);
  if (kind === null || closedKind === kind) return null;

  if (status === "granted" && weakAccuracyM !== null) {
    return (
      <div
        data-gps-banner="weak"
        className="absolute top-16 right-4 left-4 z-10 flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-xs font-medium text-amber-900 shadow-md backdrop-blur"
      >
        <span className="flex-1 text-center">
          {t("run.gps.weak").replace("{m}", String(Math.round(weakAccuracyM)))}
        </span>
        <CloseButton
          onClick={() => setClosedKind(kind)}
          className="h-6 w-6 shrink-0"
        />
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
      className={`absolute top-16 right-4 left-4 z-10 flex items-start gap-2 rounded-md shadow-md backdrop-blur ${tone}`}
    >
      <span className="flex-1 text-center">{message}</span>
      <CloseButton
        onClick={() => setClosedKind(kind)}
        className="h-6 w-6 shrink-0"
      />
    </div>
  );
}
