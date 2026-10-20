"use client";

import { useLocale } from "@/lib/i18n";
import {
  MOVE_MODES,
  type MoveMode,
  moveModeIcon,
  moveModeLabelKey,
} from "@/lib/runs/moveMode";
import { ElapsedBanner } from "./ElapsedBanner";

/**
 * Bottom-of-map primary action for the run flow. Shows a Start button
 * before the run begins, then swaps to the live ElapsedBanner + Finish
 * button once active.
 */
export function RunControls({
  canStart,
  locationReady,
  isActive,
  isBusy,
  hexCount,
  distanceMeters,
  runStartTime,
  onStart,
  onFinish,
  mode,
  onModeChange,
}: {
  canStart: boolean;
  locationReady: boolean;
  isActive: boolean;
  isBusy: boolean;
  hexCount: number;
  distanceMeters: number;
  runStartTime: number | null;
  onStart: () => void;
  onFinish: () => void;
  /** How the player says they will move; null until they pick once. */
  mode: MoveMode | null;
  onModeChange: (mode: MoveMode) => void;
}) {
  const { t } = useLocale();
  if (!isActive) {
    return (
      <div
        className="absolute right-4 left-4 z-20 flex justify-center"
        style={{ bottom: "max(1.5rem, env(safe-area-inset-bottom))" }}
      >
        <div className="flex w-full max-w-sm flex-col items-center gap-2">
        <p className="rounded-full bg-black/75 px-3 py-1.5 text-center text-xs leading-snug text-white">
          {t("run.start.hint")}
        </p>
        {canStart && (
          <div
            role="radiogroup"
            aria-label={t("run.mode.ask")}
            className="flex w-full flex-col gap-1.5 rounded-2xl bg-white/95 p-2 shadow-lg"
          >
            <p className="text-center text-xs font-semibold text-zinc-700">
              {t("run.mode.ask")}
            </p>
            <div className="flex flex-wrap justify-center gap-1.5">
              {MOVE_MODES.map((m) => {
                const label = t(moveModeLabelKey(m));
                const on = m === mode;
                return (
                  <button
                    key={m}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    aria-label={label}
                    title={label}
                    onClick={() => onModeChange(m)}
                    className={`flex h-10 min-w-10 items-center justify-center rounded-full border px-2 text-lg leading-none ${
                      on
                        ? "border-orange-700 bg-orange-100"
                        : "border-zinc-200 bg-white"
                    }`}
                  >
                    <span aria-hidden>{moveModeIcon(m)}</span>
                  </button>
                );
              })}
            </div>
            {mode && (
              <p className="text-center text-[11px] text-zinc-600">
                {t(moveModeLabelKey(mode))}
              </p>
            )}
          </div>
        )}
        <button
          onClick={onStart}
          disabled={!canStart || !locationReady || isBusy || !mode}
          className="rounded-full bg-orange-700 px-6 py-3 text-base font-semibold text-white shadow-lg hover:bg-orange-800 disabled:cursor-not-allowed disabled:bg-zinc-400"
          aria-label={!canStart ? t("run.start.signIn") : t("run.start.button")}
        >
          {!canStart
            ? t("run.start.signIn")
            : isBusy
              ? t("run.start.starting")
              : !mode
                ? t("run.mode.pick")
                : t("run.start.button")}
        </button>
        </div>
      </div>
    );
  }
  return (
    <div
      className="absolute right-4 left-4 z-20 flex flex-col items-center gap-3"
      style={{ bottom: "max(1.5rem, env(safe-area-inset-bottom))" }}
    >
      <ElapsedBanner
        startTime={runStartTime}
        hexCount={hexCount}
        distanceMeters={distanceMeters}
      />
      <button
        onClick={onFinish}
        disabled={isBusy}
        className="rounded-full bg-red-600 px-6 py-3 text-base font-semibold text-white shadow-lg hover:bg-red-700 disabled:cursor-not-allowed disabled:bg-zinc-400"
        aria-label={t("run.finish.button")}
      >
        {isBusy ? t("run.finish.finishing") : t("run.finish.button")}
      </button>
    </div>
  );
}
