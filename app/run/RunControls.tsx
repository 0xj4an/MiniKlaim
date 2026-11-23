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
  stolenCount = 0,
  reinforcedCount = 0,
  attackedCount = 0,
  distanceMeters,
  runStartTime,
  onStart,
  onFinish,
  mode,
  onModeChange,
  startSpot = null,
}: {
  /** The block under the player will not count if they stay on it. */
  startSpot?: "used" | "owned" | null;
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
  stolenCount?: number;
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
        <div className="mx-auto w-full max-w-md rounded-t-3xl border-t-[1.5px] border-zinc-200 bg-white px-4 pt-4 pb-4">
          {canStart ? (
            <>
              {/* One line, not a title and a paragraph: on a 664 px tall
                  phone the old sheet covered the player's own dot. What the
                  blocks are is said in the welcome and under Help. */}
              <h2 className="mk-title text-[1.375rem] text-zinc-900">
                {t("run.mode.ask")}
              </h2>
              <div
                role="radiogroup"
                aria-label={t("run.mode.ask")}
                className="mt-3 grid grid-cols-5 gap-1.5"
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
                      onClick={() => onModeChange(m)}
                      className={`flex min-h-[3.25rem] flex-col items-center justify-center gap-0.5 rounded-xl border-[1.5px] px-0.5 py-1 ${
                        on
                          ? "border-orange-600 bg-orange-50"
                          : "border-zinc-200 bg-white"
                      }`}
                    >
                      <span aria-hidden className="text-xl leading-none">
                        {moveModeIcon(m)}
                      </span>
                      <span
                        className={`max-w-full truncate text-[12px] leading-tight ${
                          on ? "font-semibold text-orange-800" : "text-zinc-600"
                        }`}
                      >
                        {label}
                      </span>
                    </button>
                  );
                })}
              </div>
            </>
          ) : (
            <p className="mx-auto max-w-[17rem] text-center text-[13px] leading-snug text-zinc-500">
              {t("run.start.hint")}
            </p>
          )}
          {canStart && startSpot && (
            <p
              role="status"
              className="mx-auto mt-2 max-w-[18rem] rounded-md bg-amber-50 px-3 py-1.5 text-center text-xs font-medium text-amber-900"
            >
              {t(
                startSpot === "used"
                  ? "run.start.usedBlock"
                  : "run.start.ownedBlock",
              )}
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
            className="mk-btn mt-3 w-full px-4"
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
      className="absolute right-3 left-3 z-20 mx-auto flex max-w-md flex-col items-center gap-2.5"
      style={{ bottom: "max(1.5rem, env(safe-area-inset-bottom))" }}
    >
      <CaptureLine capture={capture} />
      <ElapsedBanner
        startTime={runStartTime}
        hexCount={hexCount}
        stolenCount={stolenCount}
        reinforcedCount={reinforcedCount}
        attackedCount={attackedCount}
        distanceMeters={distanceMeters}
      />
      <button
        onClick={onFinish}
        disabled={isBusy}
        className="mk-btn mk-btn-ink w-full px-6"
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
      className={`mt-3 flex items-center justify-center gap-2 rounded-xl px-3 py-2 text-[13px] leading-tight font-semibold ${
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
    capture.kind === "queued" ||
    capture.kind === "searching" ||
    capture.kind === "owned" ||
    capture.kind === "repeat";
  const text =
    capture.kind === "queued"
      ? t(
          capture.count === 1 ? "run.capture.queued.one" : "run.capture.queued",
        ).replace("{n}", String(capture.count))
      : capture.kind === "saving"
        ? t(
            capture.count === 1
              ? "run.capture.saving.one"
              : "run.capture.saving",
          ).replace("{n}", String(capture.count))
        : capture.kind === "saved"
          ? t(
              capture.count === 1
                ? "run.capture.saved.one"
                : "run.capture.saved",
            ).replace("{n}", String(capture.count))
          : t(`run.capture.${capture.kind}`);
  return (
    <div
      role="status"
      aria-live="polite"
      className={`max-w-[19rem] rounded-full px-3.5 py-1.5 text-center text-[13px] leading-tight font-semibold ${
        good
          ? "bg-emerald-700 text-white"
          : waiting
            ? "border-[1.5px] border-amber-300 bg-amber-100 text-amber-950"
            : "border-[1.5px] border-zinc-200 bg-white text-zinc-800"
      }`}
    >
      {text}
    </div>
  );
}
