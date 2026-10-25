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
        className="absolute inset-x-0 bottom-0 z-20"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="mx-auto w-full max-w-md rounded-t-[1.75rem] bg-white px-4 pt-5 pb-4 shadow-[0_-10px_30px_rgba(0,0,0,0.12)]">
          {canStart ? (
            <>
              <h2 className="text-center text-[15px] font-semibold tracking-tight text-zinc-900">
                {t("run.mode.ask")}
              </h2>
              <p className="mx-auto mt-1 max-w-[17rem] text-center text-[13px] leading-snug text-zinc-500">
                {t("run.start.hint")}
              </p>
              <div
                role="radiogroup"
                aria-label={t("run.mode.ask")}
                className="mt-4 grid grid-cols-9 gap-1"
              >
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
                      className={`flex aspect-square items-center justify-center rounded-full border text-lg leading-none ${
                        on
                          ? "border-orange-600 bg-orange-50 text-zinc-900 ring-2 ring-orange-600"
                          : "border-zinc-200 bg-zinc-50"
                      }`}
                    >
                      <span aria-hidden>{moveModeIcon(m)}</span>
                    </button>
                  );
                })}
              </div>
              <p
                className={`mt-2 min-h-4 text-center text-xs font-medium ${
                  mode ? "text-orange-800" : "text-zinc-500"
                }`}
              >
                {mode ? t(moveModeLabelKey(mode)) : t("run.mode.pick")}
              </p>
            </>
          ) : (
            <p className="mx-auto max-w-[17rem] text-center text-[13px] leading-snug text-zinc-500">
              {t("run.start.hint")}
            </p>
          )}
          <button
            onClick={onStart}
            disabled={!canStart || !locationReady || isBusy || !mode}
            className="mt-3 w-full rounded-full bg-orange-700 py-3 text-base font-semibold text-white hover:bg-orange-800 disabled:cursor-not-allowed disabled:bg-zinc-400"
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
