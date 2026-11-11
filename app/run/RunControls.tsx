"use client";

import { useLocale } from "@/lib/i18n";
import {
  MOVE_MODES,
  type MoveMode,
  moveModeIcon,
  moveModeLabelKey,
} from "@/lib/runs/moveMode";
import type { CaptureStatus } from "@/lib/runs/captureStatus";
import { useEffect, useState } from "react";
import { ElapsedBanner } from "./ElapsedBanner";
import type { GeoStatus } from "./GeoStatusBanner";

/**
 * Bottom-of-map primary action for the run flow. Shows a Start button
 * before the run begins, then swaps to the live ElapsedBanner + Finish
 * button once active.
 */
export function RunControls({
  canStart,
  locationReady,
  geoStatus,
  fixReady,
  accuracyM,
  isActive,
  isBusy,
  hexCount,
  capture,
  reinforcedCount = 0,
  attackedCount = 0,
  distanceMeters,
  runStartTime,
  onStart,
  onFinish,
  mode,
  onModeChange,
}: {
  canStart: boolean;
  locationReady: boolean;
  geoStatus: GeoStatus;
  /** The latest fixes are accurate enough to capture with. */
  fixReady: boolean;
  /** Accuracy of the latest fix in meters, rounded; null before any fix. */
  accuracyM: number | null;
  isActive: boolean;
  isBusy: boolean;
  hexCount: number;
  /** What to tell the player about capture right now. */
  capture: CaptureStatus;
  reinforcedCount?: number;
  attackedCount?: number;
  distanceMeters: number;
  runStartTime: number | null;
  onStart: () => void;
  onFinish: () => void;
  /** How the player says they will move; null until they pick once. */
  mode: MoveMode | null;
  onModeChange: (mode: MoveMode) => void;
}) {
  const { t } = useLocale();
  // Start waits for an accurate fix, but not forever: indoors it may never
  // come, and a player who cannot start at all is worse off than one who
  // starts vague. After the wait the button opens with a label that says
  // what they are doing.
  const waitingForSignal = canStart && locationReady && !fixReady;
  const [waitOver, setWaitOver] = useState(false);
  useEffect(() => {
    if (!waitingForSignal) {
      setWaitOver(false);
      return;
    }
    const id = window.setTimeout(() => setWaitOver(true), SIGNAL_WAIT_MS);
    return () => window.clearTimeout(id);
  }, [waitingForSignal]);
  const holdStart = waitingForSignal && !waitOver;
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
          {canStart && (
            <SignalRow
              geoStatus={geoStatus}
              fixReady={fixReady}
              accuracyM={accuracyM}
            />
          )}
          <button
            onClick={onStart}
            disabled={
              !canStart || !locationReady || isBusy || !mode || holdStart
            }
            className="mt-3 w-full rounded-full bg-orange-700 py-3 text-base font-semibold text-white hover:bg-orange-800 disabled:cursor-not-allowed disabled:bg-zinc-400"
            aria-label={
              !canStart ? t("run.start.signIn") : t("run.start.button")
            }
          >
            {!canStart
              ? t("run.start.signIn")
              : isBusy
                ? t("run.start.starting")
                : !mode
                  ? t("run.mode.pick")
                  : holdStart
                    ? t("run.start.waitingSignal")
                    : waitingForSignal
                      ? t("run.start.anyway")
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
      <CaptureLine capture={capture} />
      <ElapsedBanner
        startTime={runStartTime}
        hexCount={hexCount}
        reinforcedCount={reinforcedCount}
        attackedCount={attackedCount}
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

/** How long Start waits for an accurate fix before opening anyway. */
const SIGNAL_WAIT_MS = 12_000;

/**
 * The GPS, before the run: asking, getting a signal, or accurate. Three
 * bars fill as it gets there, so "wait a moment" has something to watch.
 */
function SignalRow({
  geoStatus,
  fixReady,
  accuracyM,
}: {
  geoStatus: GeoStatus;
  fixReady: boolean;
  accuracyM: number | null;
}) {
  const { t } = useLocale();
  const granted = geoStatus === "granted";
  const blocked =
    geoStatus === "denied" ||
    geoStatus === "unavailable" ||
    geoStatus === "timeout";
  const bars = !granted
    ? 0
    : fixReady
      ? 3
      : accuracyM !== null && accuracyM <= 60
        ? 2
        : 1;
  const withM = (key: "run.signal.searching" | "run.signal.ready") =>
    accuracyM === null
      ? t(key)
      : t(`${key}.m`).replace("{m}", String(accuracyM));
  const text = blocked
    ? t("run.signal.blocked")
    : !granted
      ? t("run.signal.requesting")
      : fixReady
        ? withM("run.signal.ready")
        : withM("run.signal.searching");
  const ready = granted && fixReady;
  return (
    <div
      role="status"
      aria-live="polite"
      className={`mt-3 flex items-center justify-center gap-2 rounded-full px-3 py-2 text-xs font-semibold ${
        ready
          ? "bg-emerald-50 text-emerald-800"
          : blocked
            ? "bg-amber-100 text-amber-950"
            : "bg-zinc-100 text-zinc-700"
      }`}
    >
      <span className="flex items-end gap-0.5" aria-hidden>
        {[1, 2, 3].map((n) => (
          <span
            key={n}
            className={`w-1 rounded-sm ${n === 1 ? "h-2" : n === 2 ? "h-3" : "h-4"} ${
              n <= bars
                ? ready
                  ? "bg-emerald-600"
                  : "bg-orange-600"
                : `bg-zinc-300 ${granted && !ready && n === bars + 1 ? "signal-pulse" : ""}`
            }`}
          />
        ))}
      </span>
      <span>{text}</span>
    </div>
  );
}

/**
 * One line that says whether blocks are being captured, and why not when
 * they are not. Announced politely so a screen reader hears each change.
 */
function CaptureLine({ capture }: { capture: CaptureStatus }) {
  const { t } = useLocale();
  const good = capture.kind === "saved" || capture.kind === "acted";
  const waiting =
    capture.kind === "searching" ||
    capture.kind === "owned" ||
    capture.kind === "repeat";
  const text =
    capture.kind === "saving"
      ? t(
          capture.count === 1 ? "run.capture.saving.one" : "run.capture.saving",
        ).replace("{n}", String(capture.count))
      : capture.kind === "saved"
        ? t(
            capture.count === 1 ? "run.capture.saved.one" : "run.capture.saved",
          ).replace("{n}", String(capture.count))
        : t(`run.capture.${capture.kind}`);
  return (
    <div
      role="status"
      aria-live="polite"
      className={`max-w-[19rem] rounded-full px-4 py-1.5 text-center text-xs font-semibold shadow-md ${
        good
          ? "bg-emerald-700 text-white"
          : waiting
            ? "bg-amber-100 text-amber-950"
            : "bg-white/95 text-zinc-800"
      }`}
    >
      {text}
    </div>
  );
}
