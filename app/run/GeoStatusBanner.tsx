"use client";

import { useEffect, useRef, useState } from "react";
import { track } from "@/lib/analytics";
import { useLocale } from "@/lib/i18n";

export type GeoStatus =
  | "idle"
  | "requesting"
  | "granted"
  | "denied"
  | "unavailable";

/**
 * Top-of-map banner shown while geolocation is still resolving, denied, or
 * unavailable. Includes a "waiting" nudge after 8s.
 *
 * Renders null once status is "granted".
 */
export function GeoStatusBanner({
  status,
  lastError,
}: {
  status: GeoStatus;
  lastError: string | null;
}) {
  const { t } = useLocale();
  const [showHelp, setShowHelp] = useState(false);

  // Fire denied/unavailable events once per status transition, not on every
  // render. The ref survives re-renders and gets reset when the user leaves
  // and re-enters the page.
  const trackedStatusRef = useRef<GeoStatus | null>(null);
  useEffect(() => {
    if (trackedStatusRef.current === status) return;
    trackedStatusRef.current = status;
    if (status === "denied") track("gps_denied");
    else if (status === "unavailable") track("gps_unavailable");
  }, [status]);
  useEffect(() => {
    if (status !== "requesting" && status !== "idle") {
      queueMicrotask(() => setShowHelp(false));
      return;
    }
    const id = window.setTimeout(() => {
      queueMicrotask(() => setShowHelp(true));
    }, 8000);
    return () => window.clearTimeout(id);
  }, [status]);

  if (status === "granted") return null;

  let message: string;
  let tone: string;
  switch (status) {
    case "idle":
    case "requesting":
      message = t("run.gps.waiting");
      tone = "bg-white/90 text-zinc-700";
      break;
    case "denied":
      message = t("run.gps.denied");
      tone = "border border-amber-300 bg-amber-50 font-medium text-amber-950";
      break;
    case "unavailable":
      message = t("run.gps.unavailable");
      tone = "border border-amber-300 bg-amber-50 text-amber-900";
      break;
  }
  return (
    <div
      data-gps-banner={status}
      className={`pointer-events-none absolute top-16 right-4 left-4 z-10 rounded-md text-center shadow-md backdrop-blur ${
        status === "denied" ? "p-4 text-sm leading-snug" : "p-3 text-xs"
      } ${tone}`}
    >
      <div>{message}</div>
      {showHelp && (status === "requesting" || status === "idle") && (
        <div className="mt-1 text-[11px] text-zinc-600">
          {t("run.gps.waitingHelp")}
        </div>
      )}
      {lastError && (status === "requesting" || status === "idle") && (
        <div className="mt-1 font-mono text-[10px] text-zinc-500">
          {t("run.gps.lastError")}: {lastError}
        </div>
      )}
    </div>
  );
}
