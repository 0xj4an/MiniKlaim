"use client";

import { track } from "@/lib/analytics";
import { type TranslationKey, useLocale } from "@/lib/i18n";
import { formatSpeed } from "@/lib/map/geo";

export type RunSummary = {
  durationMs: number;
  hexesClaimed: number;
  distanceMeters: number;
};

/**
 * Post-finish modal that summarizes the run (time, blocks, distance,
 * speed) with Share + Done actions. Rendered as a full-screen overlay
 * above the map so it doesn't disturb the underlying MapLibre canvas.
 */
export function RunSummaryModal({
  summary,
  username,
  onClose,
}: {
  summary: RunSummary;
  username: string | null;
  onClose: () => void;
}) {
  const { t } = useLocale();
  const totalSec = Math.max(0, Math.floor(summary.durationMs / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  const timeLabel = `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  const distLabel =
    summary.distanceMeters >= 1000
      ? `${(summary.distanceMeters / 1000).toFixed(2)} km`
      : `${summary.distanceMeters} m`;
  const speedLabel = formatSpeed(summary.durationMs, summary.distanceMeters);
  return (
    <div
      className="absolute inset-0 z-20 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="mx-6 flex w-full max-w-sm flex-col items-center gap-4 rounded-2xl bg-white p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-sm font-semibold tracking-wide text-zinc-500 uppercase">
          {t("run.summary.header")}
        </p>
        <div className="grid w-full grid-cols-2 gap-3 text-center">
          <div>
            <div className="font-mono text-2xl font-bold text-zinc-900">
              {timeLabel}
            </div>
            <div className="text-[10px] tracking-wide text-zinc-500 uppercase">
              {t("run.summary.time")}
            </div>
          </div>
          <div>
            <div className="font-mono text-2xl font-bold text-zinc-900">
              {summary.hexesClaimed}
            </div>
            <div className="text-[10px] tracking-wide text-zinc-500 uppercase">
              {t("run.summary.blocks")}
            </div>
          </div>
          <div>
            <div className="font-mono text-2xl font-bold text-zinc-900">
              {distLabel}
            </div>
            <div className="text-[10px] tracking-wide text-zinc-500 uppercase">
              {t("run.summary.dist")}
            </div>
          </div>
          <div>
            <div className="font-mono text-2xl font-bold text-zinc-900">
              {speedLabel.replace(" km/h", "")}
            </div>
            <div className="text-[10px] tracking-wide text-zinc-500 uppercase">
              {t("run.summary.speed")}
            </div>
          </div>
        </div>
        <div className="mt-2 flex gap-3">
          <button
            onClick={() => shareRun(summary, timeLabel, distLabel, username, t)}
            className="rounded-full border border-zinc-300 bg-white px-6 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100"
          >
            {t("run.summary.share")}
          </button>
          <button
            onClick={onClose}
            className="rounded-full bg-orange-700 px-6 py-2 text-sm font-semibold text-white hover:bg-orange-800"
          >
            {t("run.summary.done")}
          </button>
        </div>
      </div>
    </div>
  );
}

async function shareRun(
  summary: RunSummary,
  timeLabel: string,
  distLabel: string,
  username: string | null,
  t: (key: TranslationKey) => string,
): Promise<void> {
  track("share_button_pressed", { surface: "run_summary" });
  const captured =
    summary.hexesClaimed === 1
      ? t("run.share.text.one")
      : t("run.share.text.many").replace("{n}", String(summary.hexesClaimed));
  const text = `${captured} ${t("run.share.text.suffix")} ${timeLabel} - ${distLabel} ${t("run.share.text.run")}`;
  const origin =
    typeof window !== "undefined"
      ? window.location.origin
      : "https://www.miniklaim.fun";
  const url = username ? `${origin}/p/${username}` : origin;

  if (typeof navigator !== "undefined" && "share" in navigator) {
    try {
      await navigator.share({ text, url });
      return;
    } catch {
      // user cancelled or share failed; fall through to twitter intent
    }
  }
  if (typeof window !== "undefined") {
    const intent = `https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`;
    window.open(intent, "_blank", "noopener,noreferrer");
  }
}
