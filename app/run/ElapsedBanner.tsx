"use client";

import { useEffect, useRef, useState } from "react";
import { useLocale } from "@/lib/i18n";
import { appendSpeedSample, formatRollingSpeed } from "@/lib/map/geo";
import { ACTION_TEXT } from "./actionColors";

/**
 * Live status pill above the finish button during an active run.
 * Shows elapsed time (updating every second), current hex count, distance,
 * and current speed in km/h.
 *
 * Speed uses a 30-second rolling window instead of session average so it
 * behaves like a car speedometer: rises quickly when the player accelerates,
 * drops when they stop or slow down. Session average is only shown on the
 * finished-run summary (RunSummaryModal).
 */
export function ElapsedBanner({
  startTime,
  hexCount,
  stolenCount = 0,
  reinforcedCount = 0,
  attackedCount = 0,
  distanceMeters,
}: {
  startTime: number | null;
  hexCount: number;
  /** Of `hexCount`, the blocks taken from another player. */
  stolenCount?: number;
  reinforcedCount?: number;
  attackedCount?: number;
  distanceMeters: number;
}) {
  const { t } = useLocale();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  // Rolling buffer of {ts, cumulativeMeters}. Reset on run start (startTime
  // changes) and pruned inside appendSpeedSample.
  const samplesRef = useRef<Array<{ ts: number; cumulativeMeters: number }>>([]);
  const startedAtRef = useRef<number | null>(null);
  useEffect(() => {
    if (startedAtRef.current !== startTime) {
      startedAtRef.current = startTime;
      samplesRef.current = [];
    }
    if (startTime === null) return;
    samplesRef.current = appendSpeedSample(
      samplesRef.current,
      Date.now(),
      distanceMeters,
    );
  }, [startTime, distanceMeters]);

  if (!startTime) return null;
  const elapsedMs = now - startTime;
  const mins = Math.floor(elapsedMs / 60000);
  const secs = Math.floor((elapsedMs % 60000) / 1000);
  const time = `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  const distLabel =
    distanceMeters >= 1000
      ? `${(distanceMeters / 1000).toFixed(2)} km`
      : `${Math.round(distanceMeters)} m`;
  const speedLabel = formatRollingSpeed(samplesRef.current);
  // Blocks nobody held. Never negative, whatever order the counters land in.
  const freeCount = Math.max(0, hexCount - stolenCount);
  return (
    <div className="rounded-md bg-white/95 px-4 py-2 text-center shadow-md backdrop-blur">
      <div className="font-mono text-xl font-bold text-zinc-900">{time}</div>
      <div className="text-xs text-zinc-600">
        {distLabel} · {speedLabel}
      </div>
      {/* The blocks as a sum, so the parts visibly add up to the total. */}
      <div className="text-xs font-semibold text-zinc-900">
        {hexCount}{" "}
        {hexCount === 1 ? t("run.banner.block") : t("run.banner.blocks")}
        {stolenCount > 0 && (
          <>
            {" = "}
            <span className={ACTION_TEXT.stolen}>
              {t("run.banner.stolen").replace("{n}", String(stolenCount))}
            </span>
            {freeCount > 0 && (
              <>
                {" + "}
                <span className={ACTION_TEXT.free}>
                  {t("run.banner.free").replace("{n}", String(freeCount))}
                </span>
              </>
            )}
          </>
        )}
      </div>
      {(reinforcedCount > 0 || attackedCount > 0) && (
        <div className="text-xs font-semibold">
          <span className="font-normal text-zinc-600">
            {t("run.banner.also")}{" "}
          </span>
          {reinforcedCount > 0 && (
            <span className={ACTION_TEXT.reinforced}>
              {t("run.banner.reinforced").replace(
                "{n}",
                String(reinforcedCount),
              )}
            </span>
          )}
          {reinforcedCount > 0 && attackedCount > 0 && (
            <span className="text-zinc-400"> - </span>
          )}
          {attackedCount > 0 && (
            <span className={ACTION_TEXT.attacked}>
              {t("run.banner.attacked").replace("{n}", String(attackedCount))}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
