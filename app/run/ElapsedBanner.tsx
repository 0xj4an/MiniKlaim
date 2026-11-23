"use client";

import { useEffect, useRef, useState } from "react";
import { useLocale } from "@/lib/i18n";
import { appendSpeedSample, formatRollingSpeed } from "@/lib/map/geo";
import { RunTally } from "./RunTally";
import { stolenSplit } from "./stolenSplit";

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
  const split = stolenSplit(t, hexCount, stolenCount);
  return (
    <div className="mk-flat w-full px-4 py-2 text-center">
      {/* Three lines, as before: time and pace, the numbers, and the note
          about stolen blocks when there is one. */}
      <div className="flex items-baseline justify-center gap-2">
        <span className="mk-num text-[1.75rem] leading-none text-zinc-900">
          {time}
        </span>
        <span className="text-[13px] text-zinc-500">
          {distLabel} · {speedLabel}
        </span>
      </div>
      <RunTally
        blocks={hexCount}
        reinforced={reinforcedCount}
        attacked={attackedCount}
      />
      {split && (
        <div className="text-[13px] font-semibold text-orange-700">{split}</div>
      )}
    </div>
  );
}
