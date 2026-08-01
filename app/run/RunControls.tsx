"use client";

import { useLocale } from "@/lib/i18n";
import { ElapsedBanner } from "./ElapsedBanner";

/**
 * Bottom-of-map primary action for the run flow. Shows a Start button
 * before the run begins, then swaps to the live ElapsedBanner + Finish
 * button once active.
 */
export function RunControls({
  canStart,
  isActive,
  isBusy,
  hexCount,
  distanceMeters,
  runStartTime,
  onStart,
  onFinish,
}: {
  canStart: boolean;
  isActive: boolean;
  isBusy: boolean;
  hexCount: number;
  distanceMeters: number;
  runStartTime: number | null;
  onStart: () => void;
  onFinish: () => void;
}) {
  const { t } = useLocale();
  if (!isActive) {
    return (
      <div className="absolute right-4 bottom-6 left-4 z-10 flex justify-center">
        <button
          onClick={onStart}
          disabled={!canStart || isBusy}
          className="rounded-full bg-orange-700 px-6 py-3 text-base font-semibold text-white shadow-lg hover:bg-orange-800 disabled:cursor-not-allowed disabled:bg-zinc-400"
        >
          {!canStart
            ? t("run.start.signIn")
            : isBusy
              ? t("run.start.starting")
              : t("run.start.button")}
        </button>
      </div>
    );
  }
  return (
    <div className="absolute right-4 bottom-6 left-4 z-10 flex flex-col items-center gap-3">
      <ElapsedBanner
        startTime={runStartTime}
        hexCount={hexCount}
        distanceMeters={distanceMeters}
      />
      <button
        onClick={onFinish}
        disabled={isBusy}
        className="rounded-full bg-red-600 px-6 py-3 text-base font-semibold text-white shadow-lg hover:bg-red-700 disabled:cursor-not-allowed disabled:bg-zinc-400"
      >
        {isBusy ? t("run.finish.finishing") : t("run.finish.button")}
      </button>
    </div>
  );
}
