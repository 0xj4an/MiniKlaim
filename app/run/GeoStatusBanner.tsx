"use client";

import { useEffect, useRef, useState } from "react";
import { CloseButton } from "@/app/CloseButton";
import { track } from "@/lib/analytics";
import { useLocale } from "@/lib/i18n";

/** How long Try again rests after a tap. */
const RETRY_REST_MS = 4_000;

export type GeoStatus =
  "idle" | "requesting" | "granted" | "denied" | "timeout" | "unavailable";

/**
 * Shown while location is requested, when it is blocked, and during a run
 * when the fixes are too coarse to capture (`weakAccuracyM`). Renders null
 * once status is "granted" and the signal is good.
 */
export function GeoStatusBanner({
  status,
  weakAccuracyM = null,
  priorPermission = null,
  onRetry,
}: {
  status: GeoStatus;
  lastError: string | null;
  /** What the browser had decided before we asked; null if not read yet. */
  priorPermission?: string | null;
  /** Asks for location again; offered when it was blocked or timed out. */
  onRetry?: () => void;
  /** Accuracy in meters of recent fixes when all were too coarse to capture. */
  weakAccuracyM?: number | null;
}) {
  const { t } = useLocale();
  const trackedStatusRef = useRef<GeoStatus | null>(null);
  useEffect(() => {
    if (trackedStatusRef.current === status) return;
    trackedStatusRef.current = status;
    if (status === "denied")
      track("gps_denied", { prior_permission: priorPermission ?? "unread" });
    else if (status === "unavailable") track("gps_unavailable");
    // priorPermission is read once, before location is ever requested, so it
    // is settled by the time status can be "denied". Not a dependency: the
    // event is about the status change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  // Every banner can be closed. A closed one stays hidden until the state
  // it describes changes (another status, or the weak signal clears).
  const kind =
    status === "granted" ? (weakAccuracyM === null ? null : "weak") : status;
  const [closedKind, setClosedKind] = useState<string | null>(null);
  // A denial comes back in milliseconds, so a player who taps Try again
  // sees nothing change and taps again. One did so 43 times in three and a
  // half minutes (10 Nov 2026) without ever starting a run. The button now
  // rests between taps, and after a second denial the text says plainly
  // that tapping is not what unblocks it.
  const [deniedTaps, setDeniedTaps] = useState(0);
  const [resting, setResting] = useState(false);
  useEffect(() => {
    if (!resting) return;
    const id = window.setTimeout(() => setResting(false), RETRY_REST_MS);
    return () => window.clearTimeout(id);
  }, [resting]);
  useEffect(() => {
    if (status === "granted") setDeniedTaps(0);
  }, [status]);
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
        ? deniedTaps >= 2
          ? t("run.gps.deniedAgain")
          : t("run.gps.denied")
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
      <div className="flex flex-1 flex-col items-center gap-2 text-center">
        <span>{message}</span>
        {onRetry &&
          (status === "denied" ||
            status === "timeout" ||
            status === "unavailable") && (
            <button
              type="button"
              disabled={resting}
              onClick={() => {
                setResting(true);
                if (status === "denied") setDeniedTaps((n) => n + 1);
                onRetry();
              }}
              className="rounded-full bg-amber-900 px-4 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
            >
              {t("run.gps.retry")}
            </button>
          )}
      </div>
      <CloseButton
        onClick={() => setClosedKind(kind)}
        className="h-6 w-6 shrink-0"
      />
    </div>
  );
}
